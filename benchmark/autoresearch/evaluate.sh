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
TASK_OUTPUT=""
DATASET="terminal-bench@2.0"
ENV_TYPE="docker"
AGENT_IMPORT_PATH="harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent"
AGENT_TIMEOUT_MULTIPLIER="1.0"
SLEEP_BETWEEN=3
HARBOR_BIN="${HARBOR_BIN:-harbor}"
TIMEOUT_MULTIPLIER_FLAG=""
AGENT_ENV_FLAG=""

usage() {
  cat <<'EOF'
Usage: evaluate.sh [options]

Options:
  --tasks-file FILE    Task list file, one task per line (default: smoke-5.txt)
  --model MODEL        LLM model name (default: MiniMax-M2.5)
  -k N                 Trials per task (default: 3)
  --tag TAG            Label for this run (default: "eval")
  --output FILE        Append TSV summary to file
  --task-output FILE   Append per-task TSV rows to file
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
    --task-output) TASK_OUTPUT="${2:-}"; shift 2 ;;
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

if [ "${OAS_DISABLE_LOCAL_TARBALLS:-}" = "1" ] || [ "${OAS_DISABLE_LOCAL_TARBALLS:-}" = "true" ]; then
  unset OAS_LOCAL_TARBALL_URL
fi

if ! command -v "$HARBOR_BIN" >/dev/null 2>&1 && [ ! -x "$HARBOR_BIN" ]; then
  echo "harbor not found: $HARBOR_BIN" >&2
  exit 1
fi

if "$HARBOR_BIN" run --agent-timeout-multiplier 1 --help >/dev/null 2>&1; then
  TIMEOUT_MULTIPLIER_FLAG="--agent-timeout-multiplier"
elif "$HARBOR_BIN" run --timeout-multiplier 1 --help >/dev/null 2>&1; then
  TIMEOUT_MULTIPLIER_FLAG="--timeout-multiplier"
else
  echo "Could not determine Harbor timeout multiplier flag for: $HARBOR_BIN run" >&2
  exit 1
fi

if "$HARBOR_BIN" run --ae FOO=bar --help >/dev/null 2>&1; then
  AGENT_ENV_FLAG="--ae"
fi

# Parse tasks
TASKS_TMP="$(mktemp)"
trap 'rm -f "$TASKS_TMP"' EXIT
awk 'NF && $1 !~ /^#/' "$TASKS_FILE" > "$TASKS_TMP"
TASK_COUNT="$(wc -l < "$TASKS_TMP" | tr -d ' ')"

echo "=== autoresearch evaluate ==="
echo "tasks=$TASK_COUNT  k=$K  model=$MODEL  tag=$TAG"
echo ""

COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"

ensure_tsv_header() {
  local path="$1"
  local header="$2"
  if [ -z "$path" ]; then
    return
  fi
  mkdir -p "$(dirname "$path")"
  if [ ! -s "$path" ]; then
    printf '%s\n' "$header" > "$path"
  fi
}

ensure_tsv_header "$TASK_OUTPUT" \
  'commit	tag	model	task_name	k	pass_count	fail_count	error_count	statuses	pass@k	pass^k	trial_rate'

# ── Helper: extract reward from a task-level Harbor result.json ──
extract_reward_from_result_file() {
  local result_file="$1"

  if [ ! -f "$result_file" ]; then
    echo "-1"
    return
  fi

  python3 - "$result_file" <<'PY' 2>/dev/null
import json
import sys

path = sys.argv[1]

try:
    with open(path) as f:
        d = json.load(f)

    vr = d.get("verifier_result") or {}
    rewards = vr.get("rewards") or {}
    reward = vr.get("reward", rewards.get("reward"))

    if reward is not None:
        print(int(float(reward) >= 0.5))
    elif d.get("exception_info"):
        print(-1)
    else:
        print(0)
except Exception:
    print(-1)
PY
}

# ── Helper: find the newest task-level result.json produced after a marker ──
find_latest_task_result() {
  local task_name="$1"
  local marker_file="$2"

  python3 - "$REPO_ROOT" "$task_name" "$marker_file" <<'PY' 2>/dev/null
import glob
import os
import sys

repo_root, task_name, marker_file = sys.argv[1:]
marker_mtime = os.path.getmtime(marker_file)

pattern = os.path.join(repo_root, "jobs", "*", f"{task_name}__*", "result.json")
candidates = []

for path in glob.glob(pattern):
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        continue
    if mtime >= marker_mtime:
        candidates.append((mtime, path))

if candidates:
    candidates.sort()
    print(candidates[-1][1])
PY
}

# ── Helper: fallback to parsing Harbor stdout when artifacts are unavailable ──
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
    extract_reward_from_result_file "$trial_result"
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
  local marker_file
  marker_file="$(mktemp)"
  local disable_local_tarballs=false
  if [ "${OAS_DISABLE_LOCAL_TARBALLS:-}" = "1" ] || [ "${OAS_DISABLE_LOCAL_TARBALLS:-}" = "true" ]; then
    disable_local_tarballs=true
  fi

  # Build harbor command as array
  local -a cmd=(
    "$HARBOR_BIN" run -d "$DATASET"
    --env "$ENV_TYPE"
    --agent-import-path "$AGENT_IMPORT_PATH"
    --model "$MODEL"
    --task-name "$task_name"
    --n-concurrent 1
    -k 1
    "$TIMEOUT_MULTIPLIER_FLAG" "$AGENT_TIMEOUT_MULTIPLIER"
  )
  if [ "$disable_local_tarballs" = true ]; then
    cmd+=(--no-delete)
  fi

  # Pass mirror/registry env vars for faster installs in China
  if [ -n "$AGENT_ENV_FLAG" ] && [ -n "${OAS_GITHUB_MIRROR:-}" ]; then
    cmd+=("$AGENT_ENV_FLAG" "OAS_GITHUB_MIRROR=${OAS_GITHUB_MIRROR}")
  fi
  if [ -n "$AGENT_ENV_FLAG" ] && [ -n "${OAS_NPM_REGISTRIES:-}" ]; then
    cmd+=("$AGENT_ENV_FLAG" "OAS_NPM_REGISTRIES=${OAS_NPM_REGISTRIES}")
  fi

  local model_lower
  model_lower="$(echo "$MODEL" | tr '[:upper:]' '[:lower:]')"

  # Detect codex provider: explicit codex* model OR codex auth env vars present
  local is_codex=false
  if [[ "$model_lower" == codex* ]] || [ -n "${OAS_CODEX_API_KEY:-}" ] || [ -n "${OAS_CODEX_OAUTH_JSON:-}" ]; then
    is_codex=true
  fi

  if [[ "$model_lower" == minimax* ]]; then
    if [ -n "$AGENT_ENV_FLAG" ]; then
      cmd+=("$AGENT_ENV_FLAG" "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}")
      cmd+=("$AGENT_ENV_FLAG" "ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-}")
    fi
  elif [ "$is_codex" = true ]; then
    # Note: OAS_CODEX_OAUTH_JSON is NOT passed via --ae because:
    # 1. JSON with quotes breaks shell escaping in Docker env vars
    # 2. The adapter embeds credentials directly in the command via heredoc
    # The adapter reads OAS_CODEX_OAUTH_JSON from the host's os.environ instead.
    if [ -n "$AGENT_ENV_FLAG" ] && [ -n "${OAS_CODEX_API_KEY:-}" ]; then
      cmd+=("$AGENT_ENV_FLAG" "OAS_CODEX_API_KEY=${OAS_CODEX_API_KEY}")
    fi
  elif [[ "$model_lower" == gemini* ]] || [[ "$model_lower" == google* ]]; then
    if [ -n "$AGENT_ENV_FLAG" ]; then
      cmd+=("$AGENT_ENV_FLAG" "GEMINI_API_KEY=${GEMINI_API_KEY:-}")
    fi
  elif [[ "$model_lower" == claude* ]]; then
    if [ -n "$AGENT_ENV_FLAG" ]; then
      cmd+=("$AGENT_ENV_FLAG" "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}")
    fi
  elif [[ "$model_lower" == gpt* ]] || [[ "$model_lower" == openai* ]]; then
    if [ -n "$AGENT_ENV_FLAG" ]; then
      cmd+=("$AGENT_ENV_FLAG" "OPENAI_API_KEY=${OPENAI_API_KEY:-}")
    fi
  fi

  local -a run_env=(
    env
    -u http_proxy
    -u https_proxy
    -u all_proxy
    -u HTTP_PROXY
    -u HTTPS_PROXY
    -u ALL_PROXY
  )
  if [ "$disable_local_tarballs" = true ]; then
    run_env+=(-u OAS_LOCAL_TARBALL_URL "OAS_DISABLE_LOCAL_TARBALLS=1")
  fi

  local run_output rc
  set +e
  run_output=$("${run_env[@]}" "${cmd[@]}" 2>&1)
  rc=$?
  set -e

  local latest_result reward
  latest_result="$(find_latest_task_result "$task_name" "$marker_file")"
  rm -f "$marker_file"

  if [ -n "$latest_result" ]; then
    reward="$(extract_reward_from_result_file "$latest_result")"
    printf '%s\t%s\n' "${reward:--1}" "$latest_result"
    return
  fi

  if [ "$rc" -ne 0 ]; then
    # Harbor exited non-zero, but still may have written result.json
    reward=$(extract_reward_from_output "$run_output")
    if [ "$reward" != "-1" ]; then
      printf '%s\t%s\n' "$reward" ""
    else
      printf '%s\t%s\n' "-1" ""
    fi
    return
  fi

  reward="$(extract_reward_from_output "$run_output")"
  printf '%s\t%s\n' "${reward:--1}" ""
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

    trial_output="$(run_single_trial "$task_name")"
    IFS=$'\t' read -r result latest_result <<< "$trial_output"
    status_word=""

    if [ "$result" = "1" ]; then
      task_pass=$((task_pass + 1))
      trial_results="${trial_results}P"
      status_word="PASS"
      echo "PASS"
    elif [ "$result" = "0" ]; then
      task_fail=$((task_fail + 1))
      trial_results="${trial_results}F"
      status_word="FAIL"
      echo "FAIL"
    else
      task_error=$((task_error + 1))
      trial_results="${trial_results}E"
      status_word="ERROR"
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

  task_trial_rate="$(python3 -c "print(f'{$task_pass / $K:.4f}')")"

  echo "  => $task_name: $trial_results  ($task_pass/$K pass)  pass@k=$any_pass  pass^k=$all_pass"
  echo ""

  if [ -n "$TASK_OUTPUT" ]; then
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$COMMIT" "$TAG" "$MODEL" "$task_name" "$K" \
      "$task_pass" "$task_fail" "$task_error" "$trial_results" \
      "$any_pass" "$all_pass" "$task_trial_rate" >> "$TASK_OUTPUT"
  fi

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
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$COMMIT" "$PASS_AT_K" "$PASS_POW_K" "$AVG_TRIAL_RATE" \
    "$TASKS_ANY_PASS" "$TASKS_ALL_PASS" "$TOTAL_TRIAL_PASS" \
    "$TOTAL_TRIALS" "$TASK_COUNT" "$K" "$TAG" >> "$OUTPUT"
  echo "Summary appended to $OUTPUT"
fi
