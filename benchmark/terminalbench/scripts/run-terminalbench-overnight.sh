#!/usr/bin/env bash
set -euo pipefail

DATASET="terminal-bench@2.0"
MODEL=""
ENV_TYPE="docker"
AGENT_IMPORT_PATH="harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent"
TASKS_FILE=""
BATCH_SIZE=0
KEEP_IMAGES=2
AGENT_TIMEOUT_MULTIPLIER="1.0"
TIMEOUT_MULTIPLIER=""
SLEEP_SECONDS=5
TASK_REPEATS=1
NO_PROXY_RUN=1

usage() {
  cat <<'EOF'
Usage: run-terminalbench-overnight.sh --tasks-file <file> [options]

Required:
  --tasks-file FILE          Task names, one per line (comments with # allowed)

Options:
  --dataset NAME             Harbor dataset (default: terminal-bench@2.0)
  --model NAME               Required model name (for example: gpt-5.4)
  --env NAME                 Harbor env type (default: docker)
  --batch-size N             Cleanup every N tasks; 0 disables cleanup (default: 0)
  --keep-images N            Keep newest N terminal-bench images (default: 2)
  --task-repeats K           Harbor -k value per task (default: 1)
  --agent-timeout-multiplier X
                             Harbor --agent-timeout-multiplier (default: 1.0)
  --timeout-multiplier X     Harbor --timeout-multiplier (optional)
  --sleep-seconds N          Sleep between tasks (default: 5)
  --keep-proxy               Do not unset proxy env for harbor run
  -h, --help                 Show help

Example:
  ./benchmark/terminalbench/scripts/run-terminalbench-overnight.sh \
    --tasks-file benchmark/terminalbench/task-lists/smoke-5.txt \
    --batch-size 0 --task-repeats 1
EOF
}

while (($#)); do
  case "$1" in
    --tasks-file) TASKS_FILE="${2:-}"; shift 2 ;;
    --dataset) DATASET="${2:-}"; shift 2 ;;
    --model) MODEL="${2:-}"; shift 2 ;;
    --env) ENV_TYPE="${2:-}"; shift 2 ;;
    --batch-size) BATCH_SIZE="${2:-}"; shift 2 ;;
    --keep-images) KEEP_IMAGES="${2:-}"; shift 2 ;;
    --task-repeats) TASK_REPEATS="${2:-}"; shift 2 ;;
    --agent-timeout-multiplier) AGENT_TIMEOUT_MULTIPLIER="${2:-}"; shift 2 ;;
    --timeout-multiplier) TIMEOUT_MULTIPLIER="${2:-}"; shift 2 ;;
    --sleep-seconds) SLEEP_SECONDS="${2:-}"; shift 2 ;;
    --keep-proxy) NO_PROXY_RUN=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [ -z "$TASKS_FILE" ] || [ ! -f "$TASKS_FILE" ]; then
  echo "--tasks-file is required and must exist" >&2
  exit 1
fi

if [ -z "$MODEL" ]; then
  echo "--model is required (for example: gpt-5.4)" >&2
  exit 1
fi

for n in "$BATCH_SIZE" "$KEEP_IMAGES" "$TASK_REPEATS" "$SLEEP_SECONDS"; do
  if ! [[ "$n" =~ ^[0-9]+$ ]]; then
    echo "Numeric option must be non-negative integer: $n" >&2
    exit 1
  fi
done

if ! command -v harbor >/dev/null 2>&1; then
  echo "harbor not found in PATH" >&2
  exit 1
fi

COMMON_GIT_DIR="$(git rev-parse --git-common-dir)"
MAIN_REPO_ROOT="$(cd "$COMMON_GIT_DIR/.." && pwd)"
MAIN_ENV_FILE="${MAIN_REPO_ROOT}/.env"

if [ ! -f "$MAIN_ENV_FILE" ]; then
  echo "Main workspace .env not found: $MAIN_ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$MAIN_ENV_FILE"
set +a

if [ -z "${ANTHROPIC_API_KEY:-}" ] || [ -z "${ANTHROPIC_BASE_URL:-}" ]; then
  echo "Missing ANTHROPIC_API_KEY or ANTHROPIC_BASE_URL after sourcing $MAIN_ENV_FILE" >&2
  exit 1
fi

RUN_TAG="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="jobs/overnight-${RUN_TAG}"
mkdir -p "$LOG_DIR"
RUN_LOG="${LOG_DIR}/runner.log"
FAIL_LOG="${LOG_DIR}/failed-tasks.txt"

cleanup_script="benchmark/terminalbench/scripts/cleanup-terminalbench-images.sh"
if [ ! -x "$cleanup_script" ]; then
  chmod +x "$cleanup_script"
fi

task_index=0
task_total=0
success_count=0
fail_count=0

TASKS_TMP="$(mktemp)"
trap 'rm -f "$TASKS_TMP"' EXIT
awk 'NF && $1 !~ /^#/' "$TASKS_FILE" > "$TASKS_TMP"
task_total="$(wc -l < "$TASKS_TMP" | tr -d ' ')"

echo "[$(date)] start overnight run" | tee -a "$RUN_LOG"
echo "tasks_file=$TASKS_FILE total_tasks=$task_total dataset=$DATASET model=$MODEL" | tee -a "$RUN_LOG"
echo "main_env=$MAIN_ENV_FILE anthropic_key_length=${#ANTHROPIC_API_KEY}" | tee -a "$RUN_LOG"

while IFS= read -r task_name; do
  [ -z "$task_name" ] && continue
  task_index=$((task_index + 1))
  echo "[$(date)] ($task_index/$task_total) task=$task_name start" | tee -a "$RUN_LOG"

  cmd=(
    harbor run -d "$DATASET"
    --env "$ENV_TYPE"
    --agent-import-path "$AGENT_IMPORT_PATH"
    --model "$MODEL"
    --ae "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
    --ae "ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"
    --ae "OAS_HARBOR_SAVE_TRAJECTORY=1"
    ${OAS_GITHUB_MIRROR:+--ae "OAS_GITHUB_MIRROR=$OAS_GITHUB_MIRROR"}
    ${OAS_NPM_REGISTRIES:+--ae "OAS_NPM_REGISTRIES=$OAS_NPM_REGISTRIES"}
    --task-name "$task_name"
    --n-concurrent 1
    -k "$TASK_REPEATS"
    --agent-timeout-multiplier "$AGENT_TIMEOUT_MULTIPLIER"
  )

  if [ -n "$TIMEOUT_MULTIPLIER" ]; then
    cmd+=(--timeout-multiplier "$TIMEOUT_MULTIPLIER")
  fi

  set +e
  if [ "$NO_PROXY_RUN" -eq 1 ]; then
    env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
      "${cmd[@]}" | tee -a "$RUN_LOG"
    rc=${PIPESTATUS[0]}
  else
    "${cmd[@]}" | tee -a "$RUN_LOG"
    rc=${PIPESTATUS[0]}
  fi
  set -e

  if [ "$rc" -eq 0 ]; then
    success_count=$((success_count + 1))
    echo "[$(date)] task=$task_name done rc=0" | tee -a "$RUN_LOG"
  else
    fail_count=$((fail_count + 1))
    echo "$task_name" >> "$FAIL_LOG"
    echo "[$(date)] task=$task_name failed rc=$rc" | tee -a "$RUN_LOG"
  fi

  if [ "$BATCH_SIZE" -gt 0 ] && [ $((task_index % BATCH_SIZE)) -eq 0 ]; then
    echo "[$(date)] batch cleanup start (keep_images=$KEEP_IMAGES)" | tee -a "$RUN_LOG"
    set +e
    "$cleanup_script" --keep "$KEEP_IMAGES" | tee -a "$RUN_LOG"
    cleanup_rc=${PIPESTATUS[0]}
    set -e
    echo "[$(date)] batch cleanup done rc=$cleanup_rc" | tee -a "$RUN_LOG"
  fi

  if [ "$SLEEP_SECONDS" -gt 0 ]; then
    sleep "$SLEEP_SECONDS"
  fi
done < "$TASKS_TMP"

echo "[$(date)] finished total=$task_total success=$success_count fail=$fail_count log=$RUN_LOG" | tee -a "$RUN_LOG"
if [ -f "$FAIL_LOG" ]; then
  echo "failed tasks saved to: $FAIL_LOG" | tee -a "$RUN_LOG"
fi
