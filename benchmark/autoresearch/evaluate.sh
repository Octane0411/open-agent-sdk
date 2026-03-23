#!/usr/bin/env bash
set -euo pipefail

#
# evaluate.sh — Run terminal-bench tasks with multiple trials per task,
# compute pass@k and pass^k metrics.
#
# Metrics:
#   pass@k  = fraction of tasks where at least 1 of k trials succeeded (capability)
#   pass^k  = fraction of tasks where all k trials succeeded (reliability)
#   pass@1  = simple single-trial pass rate (when k=1, pass@1 = pass@k = pass^k)
#
# Usage:
#   ./benchmark/autoresearch/evaluate.sh [options]
#

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

TASKS_FILE="${REPO_ROOT}/benchmark/terminalbench/task-lists/smoke-5.txt"
MODEL="MiniMax-M2.5"
K=3
TAG="eval"
OUTPUT=""
DATASET="terminal-bench@2.0"
ENV_TYPE="docker"
AGENT_IMPORT_PATH="harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent"
AGENT_TIMEOUT_MULTIPLIER="0.6"
SLEEP_BETWEEN=3

usage() {
  cat <<'EOF'
Usage: evaluate.sh [options]

Options:
  --tasks-file FILE    Task list file, one task per line (default: smoke-5.txt)
  --model MODEL        LLM model name (default: MiniMax-M2.5)
  -k N                 Trials per task (default: 3)
  --tag TAG            Label for this run (default: "eval")
  --output FILE        Append TSV summary to file
  --sleep N            Seconds between trials (default: 3)
  -h, --help           Show help

Output:
  Per-task results: task_name, pass_count/k, pass@k (0|1), pass^k (0|1)
  Aggregate:        pass@k rate, pass^k rate, avg per-trial rate
EOF
}

while (($#)); do
  case "$1" in
    --tasks-file) TASKS_FILE="${2:-}"; shift 2 ;;
    --model) MODEL="${2:-}"; shift 2 ;;
    -k) K="${2:-}"; shift 2 ;;
    --tag) TAG="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    --sleep) SLEEP_BETWEEN="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [ ! -f "$TASKS_FILE" ]; then
  echo "Tasks file not found: $TASKS_FILE" >&2
  exit 1
fi

if ! [[ "$K" =~ ^[1-9][0-9]*$ ]]; then
  echo "-k must be a positive integer, got: $K" >&2
  exit 1
fi

# Load API keys from .env
MAIN_GIT_DIR="$(git -C "$REPO_ROOT" rev-parse --git-common-dir)"
MAIN_ENV_FILE="$(cd "$MAIN_GIT_DIR/.." && pwd)/.env"
if [ -f "$MAIN_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$MAIN_ENV_FILE"
  set +a
fi

if ! command -v harbor >/dev/null 2>&1; then
  echo "harbor not found in PATH" >&2
  exit 1
fi

# Parse tasks
TASKS_TMP="$(mktemp)"
trap 'rm -f "$TASKS_TMP"' EXIT
awk 'NF && $1 !~ /^#/' "$TASKS_FILE" > "$TASKS_TMP"
TASK_COUNT="$(wc -l < "$TASKS_TMP" | tr -d ' ')"

echo "=== autoresearch evaluate ==="
echo "tasks=$TASK_COUNT  k=$K  model=$MODEL  tag=$TAG"
echo ""

# ── Helper: extract reward from harbor result.json ──
# Harbor prints "Results written to <dir>/result.json" in stdout.
# The run-level result.json contains stats.evals.*.metrics[0].mean
# The trial-level result.json contains verifier_result.reward
#
# We parse the run-level result.json for the mean reward.
extract_reward_from_output() {
  local run_output="$1"

  # Extract the result.json path from harbor output
  local result_dir
  result_dir=$(echo "$run_output" | grep -o 'Results written to [^ ]*' | head -1 | sed 's/Results written to //' | sed 's|/result\.json$||')

  if [ -z "$result_dir" ]; then
    echo "-1"
    return
  fi

  # Find trial-level result.json (has verifier_result)
  local trial_result
  trial_result=$(find "$result_dir" -mindepth 2 -name "result.json" 2>/dev/null | head -1)

  if [ -n "$trial_result" ] && [ -f "$trial_result" ]; then
    # Check verifier_result.reward in trial result
    local reward
    reward=$(python3 -c "
import json, sys
try:
    d = json.load(open('$trial_result'))
    vr = d.get('verifier_result') or {}
    # Harbor stores reward in different formats:
    #   verifier_result.reward (flat)
    #   verifier_result.rewards.reward (nested)
    r = vr.get('reward')
    if r is None:
        rewards = vr.get('rewards') or {}
        r = rewards.get('reward')
    if r is not None:
        print(int(float(r) >= 0.5))
        sys.exit(0)
    # No verifier result — check if there was an exception
    if d.get('exception_info'):
        print(-1)
    else:
        print(0)
except Exception:
    print(-1)
" 2>/dev/null)
    echo "${reward:--1}"
    return
  fi

  # Fallback: parse run-level result.json for mean
  local run_result="${result_dir}/result.json"
  if [ -f "$run_result" ]; then
    local mean_reward
    mean_reward=$(python3 -c "
import json, sys
try:
    d = json.load(open('$run_result'))
    stats = d.get('stats', {}).get('evals', {})
    for v in stats.values():
        errors = v.get('n_errors', 0)
        if errors > 0:
            print(-1)
            sys.exit(0)
        metrics = v.get('metrics', [])
        if metrics:
            mean = metrics[0].get('mean', 0)
            print(int(float(mean) >= 0.5))
            sys.exit(0)
    print(0)
except Exception:
    print(-1)
" 2>/dev/null)
    echo "${mean_reward:--1}"
    return
  fi

  echo "-1"
}

# ── Helper: run one trial, return 1=pass 0=fail -1=error ──
run_single_trial() {
  local task_name="$1"

  # Build harbor command as array
  local -a cmd=(
    harbor run -d "$DATASET"
    --env "$ENV_TYPE"
    --agent-import-path "$AGENT_IMPORT_PATH"
    --model "$MODEL"
    --task-name "$task_name"
    --n-concurrent 1
    -k 1
    --agent-timeout-multiplier "$AGENT_TIMEOUT_MULTIPLIER"
  )

  # Pass mirror/registry env vars for faster installs in China
  if [ -n "${OAS_GITHUB_MIRROR:-}" ]; then
    cmd+=(--ae "OAS_GITHUB_MIRROR=${OAS_GITHUB_MIRROR}")
  fi
  if [ -n "${OAS_NPM_REGISTRIES:-}" ]; then
    cmd+=(--ae "OAS_NPM_REGISTRIES=${OAS_NPM_REGISTRIES}")
  fi

  local model_lower
  model_lower="$(echo "$MODEL" | tr '[:upper:]' '[:lower:]')"

  # Detect codex provider: explicit codex* model OR codex auth env vars present
  local is_codex=false
  if [[ "$model_lower" == codex* ]] || [ -n "${OAS_CODEX_API_KEY:-}" ] || [ -n "${OAS_CODEX_OAUTH_JSON:-}" ]; then
    is_codex=true
  fi

  if [[ "$model_lower" == minimax* ]]; then
    cmd+=(--ae "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}")
    cmd+=(--ae "ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-}")
  elif [ "$is_codex" = true ]; then
    # Note: OAS_CODEX_OAUTH_JSON is NOT passed via --ae because:
    # 1. JSON with quotes breaks shell escaping in Docker env vars
    # 2. The adapter embeds credentials directly in the command via heredoc
    # The adapter reads OAS_CODEX_OAUTH_JSON from the host's os.environ instead.
    if [ -n "${OAS_CODEX_API_KEY:-}" ]; then
      cmd+=(--ae "OAS_CODEX_API_KEY=${OAS_CODEX_API_KEY}")
    fi
  elif [[ "$model_lower" == gemini* ]] || [[ "$model_lower" == google* ]]; then
    cmd+=(--ae "GEMINI_API_KEY=${GEMINI_API_KEY:-}")
  elif [[ "$model_lower" == claude* ]]; then
    cmd+=(--ae "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}")
  elif [[ "$model_lower" == gpt* ]] || [[ "$model_lower" == openai* ]]; then
    cmd+=(--ae "OPENAI_API_KEY=${OPENAI_API_KEY:-}")
  fi

  local run_output rc
  set +e
  run_output=$(env -u http_proxy -u https_proxy -u all_proxy \
    -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    "${cmd[@]}" 2>&1)
  rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    # Harbor exited non-zero, but still may have written result.json
    local reward
    reward=$(extract_reward_from_output "$run_output")
    if [ "$reward" != "-1" ]; then
      echo "$reward"
    else
      echo "-1"
    fi
    return
  fi

  extract_reward_from_output "$run_output"
}

# ── Main evaluation loop ──
TASK_IDX=0

# Aggregates
TOTAL_TRIALS=0
TOTAL_TRIAL_PASS=0
TASKS_ANY_PASS=0      # pass@k numerator
TASKS_ALL_PASS=0      # pass^k numerator
TASKS_WITH_ERROR=0

while IFS= read -r task_name; do
  [ -z "$task_name" ] && continue
  TASK_IDX=$((TASK_IDX + 1))

  echo "[$TASK_IDX/$TASK_COUNT] $task_name  (k=$K)"

  task_pass=0
  task_fail=0
  task_error=0
  trial_results=""

  for trial in $(seq 1 "$K"); do
    echo -n "  trial $trial/$K ... "

    result=$(run_single_trial "$task_name")

    if [ "$result" = "1" ]; then
      task_pass=$((task_pass + 1))
      trial_results="${trial_results}P"
      echo "PASS"
    elif [ "$result" = "0" ]; then
      task_fail=$((task_fail + 1))
      trial_results="${trial_results}F"
      echo "FAIL"
    else
      task_error=$((task_error + 1))
      trial_results="${trial_results}E"
      echo "ERROR"
    fi

    TOTAL_TRIALS=$((TOTAL_TRIALS + 1))

    # Sleep between trials (not after the last one)
    if [ "$trial" -lt "$K" ] && [ "$SLEEP_BETWEEN" -gt 0 ]; then
      sleep "$SLEEP_BETWEEN"
    fi
  done

  # Per-task metrics
  TOTAL_TRIAL_PASS=$((TOTAL_TRIAL_PASS + task_pass))

  any_pass=0
  all_pass=0
  has_error=0

  if [ "$task_pass" -ge 1 ]; then
    any_pass=1
  fi
  if [ "$task_pass" -eq "$K" ]; then
    all_pass=1
  fi
  if [ "$task_error" -gt 0 ]; then
    has_error=1
  fi

  TASKS_ANY_PASS=$((TASKS_ANY_PASS + any_pass))
  TASKS_ALL_PASS=$((TASKS_ALL_PASS + all_pass))
  TASKS_WITH_ERROR=$((TASKS_WITH_ERROR + has_error))

  echo "  => $task_name: $trial_results  ($task_pass/$K pass)  pass@k=$any_pass  pass^k=$all_pass"
  echo ""

done < "$TASKS_TMP"

# ── Compute aggregate metrics ──
if [ "$TASK_COUNT" -gt 0 ]; then
  PASS_AT_K=$(python3 -c "print(f'{$TASKS_ANY_PASS / $TASK_COUNT:.4f}')")
  PASS_POW_K=$(python3 -c "print(f'{$TASKS_ALL_PASS / $TASK_COUNT:.4f}')")
  AVG_TRIAL_RATE=$(python3 -c "print(f'{$TOTAL_TRIAL_PASS / $TOTAL_TRIALS:.4f}')")
  GAP=$(python3 -c "print(f'{$TASKS_ANY_PASS / $TASK_COUNT - $TASKS_ALL_PASS / $TASK_COUNT:.4f}')")
else
  PASS_AT_K="0.0000"
  PASS_POW_K="0.0000"
  AVG_TRIAL_RATE="0.0000"
  GAP="0.0000"
fi

echo "========================================"
echo "           RESULTS SUMMARY"
echo "========================================"
echo ""
echo "Tasks:            $TASK_COUNT"
echo "Trials per task:  $K"
echo "Total trials:     $TOTAL_TRIALS"
echo "Model:            $MODEL"
echo "Tag:              $TAG"
echo ""
echo "-- Aggregate Metrics --"
echo ""
echo "  pass@$K  = $PASS_AT_K  ($TASKS_ANY_PASS/$TASK_COUNT tasks with >=1 success)"
echo "  pass^$K  = $PASS_POW_K  ($TASKS_ALL_PASS/$TASK_COUNT tasks with $K/$K success)"
echo "  avg_trial_rate = $AVG_TRIAL_RATE  ($TOTAL_TRIAL_PASS/$TOTAL_TRIALS individual trials)"
echo ""
if [ "$TASKS_WITH_ERROR" -gt 0 ]; then
  echo "  WARNING: $TASKS_WITH_ERROR task(s) had infrastructure errors"
  echo ""
fi
echo "-- Interpretation --"
echo ""
echo "  pass@$K measures CAPABILITY: can the agent solve this at all?"
echo "  pass^$K measures RELIABILITY: does the agent solve this every time?"
echo "  gap = pass@$K - pass^$K = $GAP (consistency gap)"
echo ""

# ── Write machine-readable output ──
if [ -n "$OUTPUT" ]; then
  # TSV line compatible with results.tsv
  COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$COMMIT" "$PASS_AT_K" "$PASS_POW_K" "$AVG_TRIAL_RATE" \
    "$TASKS_ANY_PASS" "$TASKS_ALL_PASS" "$TOTAL_TRIAL_PASS" \
    "$TOTAL_TRIALS" "$TASK_COUNT" "$K" "$TAG" >> "$OUTPUT"
  echo "Summary appended to $OUTPUT"
fi
