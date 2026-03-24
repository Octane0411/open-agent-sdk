#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT="${REPO_ROOT}/benchmark/autoresearch/results.tsv"
TASKS_FILE="${REPO_ROOT}/benchmark/terminalbench/task-lists/smoke-5.txt"
MODEL="MiniMax-M2.5"
K=3
TAG=""
SLEEP_BETWEEN=3
SKIP_TESTS=false
REVERT_ON_REGRESS=false
FULL_TESTS=false
TEST_CMD=(
  "bun" "test"
  "packages/core/tests/agent/react-loop.test.ts"
  "packages/core/tests/agent/react-loop-system-prompt.test.ts"
  "packages/core/tests/agent/compact.test.ts"
  "packages/core/tests/agent/compact-auto-trigger.test.ts"
  "packages/core/tests/tools/bash.test.ts"
  "packages/core/tests/tools/read.test.ts"
  "packages/core/tests/tools/write.test.ts"
  "packages/core/tests/tools/edit.test.ts"
  "packages/core/tests/tools/glob.test.ts"
  "packages/core/tests/tools/grep.test.ts"
  "packages/core/tests/integration.test.ts"
)
OUTPUT_REL=""
USE_LOCAL_TARBALLS=true
TARBALL_DIR="${REPO_ROOT}/benchmark/terminalbench/.local-tarballs"
TARBALL_PORT="8765"
TARBALL_HOST="host.docker.internal"
TARBALL_SERVER_PID=""
TARBALL_SERVER_LOG=""
HARBOR_BIN="${HARBOR_BIN:-harbor}"
HARBOR_PYTHON="${HARBOR_PYTHON:-}"
SKIP_PREWARM_CHECK=false

usage() {
  cat <<'EOF'
Usage: run-experiment.sh --tag <label> [options]

Runs the standard autoresearch iteration:
1. Run tests
2. Run terminal-bench evaluation
3. Compare the latest row in results.tsv to the previous row
4. Print KEEP/REVERT decision
5. Optionally reset the latest code commit while preserving results.tsv

Options:
  --tag LABEL             Required label written into results.tsv
  --tasks-file FILE       Task list passed to evaluate.sh
  --model MODEL           Model name passed to evaluate.sh
  -k N                    Trials per task (default: 3)
  --sleep N               Sleep between trials (default: 3)
  --output FILE           results.tsv path (default: benchmark/autoresearch/results.tsv)
  --no-local-tarballs     Use whatever is already installed in task images
  --tarball-dir DIR       Directory for generated local tarballs
  --tarball-port N        HTTP port for temporary local tarball server
  --tarball-host HOST     Hostname containers should use for tarball server
  --full-tests            Run full `bun test` instead of the targeted autoresearch gate
  --skip-tests            Skip `bun test`
  --skip-prewarm-check    Skip the pre-warmed image readiness check
  --revert-on-regress     If decision is REVERT, reset HEAD~1 and restore results.tsv
  -h, --help              Show help
EOF
}

while (($#)); do
  case "$1" in
    --tag) TAG="${2:-}"; shift 2 ;;
    --tasks-file) TASKS_FILE="${2:-}"; shift 2 ;;
    --model) MODEL="${2:-}"; shift 2 ;;
    -k) K="${2:-}"; shift 2 ;;
    --sleep) SLEEP_BETWEEN="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    --no-local-tarballs) USE_LOCAL_TARBALLS=false; shift ;;
    --tarball-dir) TARBALL_DIR="${2:-}"; shift 2 ;;
    --tarball-port) TARBALL_PORT="${2:-}"; shift 2 ;;
    --tarball-host) TARBALL_HOST="${2:-}"; shift 2 ;;
    --full-tests) FULL_TESTS=true; shift ;;
    --skip-tests) SKIP_TESTS=true; shift ;;
    --skip-prewarm-check) SKIP_PREWARM_CHECK=true; shift ;;
    --revert-on-regress) REVERT_ON_REGRESS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

cleanup() {
  if [ -n "${TARBALL_SERVER_PID:-}" ]; then
    kill "$TARBALL_SERVER_PID" >/dev/null 2>&1 || true
    wait "$TARBALL_SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${TARBALL_SERVER_LOG:-}" ]; then
    rm -f "$TARBALL_SERVER_LOG"
  fi
}

trap cleanup EXIT

resolve_harbor_python() {
  if [ -n "$HARBOR_PYTHON" ]; then
    if [ ! -x "$HARBOR_PYTHON" ]; then
      echo "HARBOR_PYTHON is not executable: $HARBOR_PYTHON" >&2
      exit 1
    fi
    return
  fi

  if command -v "$HARBOR_BIN" >/dev/null 2>&1; then
    local harbor_path
    local harbor_shebang
    harbor_path="$(command -v "$HARBOR_BIN")"
    harbor_shebang="$(head -n 1 "$harbor_path" 2>/dev/null || true)"
    if [[ "$harbor_shebang" == '#!'* ]]; then
      local candidate="${harbor_shebang#\#!}"
      candidate="${candidate%% *}"
      if [ -x "$candidate" ]; then
        HARBOR_PYTHON="$candidate"
        return
      fi
    fi
  fi

  if python3 -c 'import harbor' >/dev/null 2>&1; then
    HARBOR_PYTHON="python3"
    return
  fi

  echo "Could not resolve a Python interpreter that can import harbor." >&2
  echo "Set HARBOR_PYTHON and HARBOR_BIN explicitly, for example:" >&2
  echo "  HARBOR_PYTHON=\$HOME/.local/share/oas-harbor/bin/python" >&2
  echo "  HARBOR_BIN=\$HOME/.local/share/oas-harbor/bin/harbor" >&2
  exit 1
}

ensure_harbor_registration() {
  local agents_dir
  agents_dir="$("$HARBOR_PYTHON" - <<'PY'
import harbor
from pathlib import Path
print(Path(harbor.__path__[0]) / "agents" / "installed")
PY
)"

  ln -sf "${REPO_ROOT}/benchmark/terminalbench/open_agent_sdk_harbor/agent.py" \
    "${agents_dir}/open_agent_sdk.py"
  ln -sf "${REPO_ROOT}/benchmark/terminalbench/open_agent_sdk_harbor/install-open-agent-sdk.sh.j2" \
    "${agents_dir}/install-open-agent-sdk.sh.j2"

  echo "Harbor agent registered from current repo:"
  echo "  harbor bin: ${HARBOR_BIN}"
  echo "  harbor python: ${HARBOR_PYTHON}"
  echo "  ${agents_dir}/open_agent_sdk.py"
  echo "  ${agents_dir}/install-open-agent-sdk.sh.j2"
  echo ""
}

patch_cached_verifiers() {
  local patcher="${REPO_ROOT}/benchmark/terminalbench/scripts/patch-task-verifiers.sh"
  if [ ! -f "$patcher" ]; then
    echo "WARN: verifier patcher not found: $patcher" >&2
    return 0
  fi

  echo "=== Patching cached verifier scripts ==="
  bash "$patcher" --tasks-file "$TASKS_FILE"
  echo ""
}

check_prewarmed_images() {
  if [ "$USE_LOCAL_TARBALLS" = true ] || [ "$SKIP_PREWARM_CHECK" = true ]; then
    return 0
  fi

  local checker="${REPO_ROOT}/benchmark/terminalbench/scripts/check-prewarmed-images.sh"
  if [ ! -f "$checker" ]; then
    echo "Missing prewarm checker: $checker" >&2
    exit 1
  fi

  echo "=== Verifying pre-warmed images ==="
  bash "$checker" --tasks-file "$TASKS_FILE"
  echo ""
}

if [ -z "$TAG" ]; then
  echo "--tag is required" >&2
  exit 1
fi

if ! [[ "$K" =~ ^[1-9][0-9]*$ ]]; then
  echo "-k must be a positive integer, got: $K" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
if [ ! -f "$OUTPUT" ]; then
  printf 'commit\tpass@k\tpass^k\tavg_trial\tany_pass\tall_pass\ttrial_pass\ttotal_trials\ttasks\tk\tdescription\n' > "$OUTPUT"
fi
OUTPUT_REL="$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$OUTPUT" "$REPO_ROOT")"

if [ "$USE_LOCAL_TARBALLS" = true ]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required for local tarball mode" >&2
    exit 1
  fi
  echo "=== Preparing local tarballs ==="
  bash "${REPO_ROOT}/benchmark/terminalbench/scripts/pack-local-tarballs.sh" --output-dir "$TARBALL_DIR"
  REQUESTED_PORT="$TARBALL_PORT"
  TARBALL_PORT="$(python3 - "$REQUESTED_PORT" <<'PY'
import socket
import sys

start = int(sys.argv[1])
for port in range(start, start + 50):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("0.0.0.0", port))
    except OSError:
        sock.close()
        continue
    sock.close()
    print(port)
    break
else:
    raise SystemExit("no free port found")
PY
)"
  if [ "$TARBALL_PORT" != "$REQUESTED_PORT" ]; then
    echo "Port $REQUESTED_PORT already in use; using $TARBALL_PORT instead."
  fi
  TARBALL_SERVER_LOG="$(mktemp)"
  python3 -m http.server "$TARBALL_PORT" --bind 0.0.0.0 --directory "$TARBALL_DIR" \
    >"$TARBALL_SERVER_LOG" 2>&1 &
  TARBALL_SERVER_PID=$!
  sleep 1
  if ! kill -0 "$TARBALL_SERVER_PID" >/dev/null 2>&1; then
    echo "failed to start tarball server on port $TARBALL_PORT" >&2
    cat "$TARBALL_SERVER_LOG" >&2 || true
    exit 1
  fi
  export OAS_LOCAL_TARBALL_URL="http://${TARBALL_HOST}:${TARBALL_PORT}"
  echo "Local tarball URL: $OAS_LOCAL_TARBALL_URL"
  echo ""
else
  unset OAS_LOCAL_TARBALL_URL
fi

resolve_harbor_python
ensure_harbor_registration
patch_cached_verifiers
check_prewarmed_images

if [ "$SKIP_TESTS" != true ]; then
  if [ "$FULL_TESTS" = true ]; then
    TEST_CMD=("bun" "test")
  fi
  echo "=== Running tests ==="
  (
    cd "$REPO_ROOT"
    "${TEST_CMD[@]}"
  )
  echo ""
fi

echo "=== Running benchmark evaluation ==="
"${REPO_ROOT}/benchmark/autoresearch/evaluate.sh" \
  --tasks-file "$TASKS_FILE" \
  --model "$MODEL" \
  -k "$K" \
  --sleep "$SLEEP_BETWEEN" \
  --tag "$TAG" \
  --output "$OUTPUT"
echo ""

DECISION_JSON="$(
  python3 - "$OUTPUT" <<'PY'
import csv
import json
import math
import sys

path = sys.argv[1]
with open(path, newline="") as f:
    rows = list(csv.DictReader(f, delimiter="\t"))

if not rows:
    raise SystemExit("results.tsv is empty after evaluation")

cur = rows[-1]
prev = rows[-2] if len(rows) >= 2 else None

def f(row, key):
    return float(row[key])

result = {
    "decision": "KEEP",
    "reason": "first recorded run" if prev is None else "non-regression",
    "current": cur,
    "previous": prev,
}

if prev is not None:
    cur_pass_at = f(cur, "pass@k")
    prev_pass_at = f(prev, "pass@k")
    cur_pass_pow = f(cur, "pass^k")
    prev_pass_pow = f(prev, "pass^k")
    cur_gap = cur_pass_at - cur_pass_pow
    prev_gap = prev_pass_at - prev_pass_pow

    if cur_pass_at > prev_pass_at:
        result["decision"] = "KEEP"
        result["reason"] = "pass@k improved"
    elif cur_pass_at == prev_pass_at and cur_pass_pow > prev_pass_pow:
        result["decision"] = "KEEP"
        result["reason"] = "pass^k improved while pass@k held"
    elif cur_pass_at < prev_pass_at:
        result["decision"] = "REVERT"
        result["reason"] = "pass@k regressed"
    elif cur_pass_pow < prev_pass_pow:
        result["decision"] = "REVERT"
        result["reason"] = "pass^k regressed without pass@k gain"
    elif cur_gap < prev_gap:
        result["decision"] = "KEEP"
        result["reason"] = "consistency gap narrowed"
    else:
        result["decision"] = "KEEP"
        result["reason"] = "metrics held steady"

print(json.dumps(result))
PY
)"

DECISION="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["decision"])' "$DECISION_JSON")"
REASON="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["reason"])' "$DECISION_JSON")"
CURRENT_DESC="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["current"]["description"])' "$DECISION_JSON")"

echo "=== Decision ==="
echo "Decision: $DECISION"
echo "Reason:   $REASON"

python3 - "$DECISION_JSON" <<'PY'
import json
import sys

info = json.loads(sys.argv[1])
cur = info["current"]
prev = info.get("previous")

print("Current:")
print(f"  commit={cur['commit']} tag={cur['description']} pass@k={cur['pass@k']} pass^k={cur['pass^k']} avg_trial={cur['avg_trial']}")
if prev:
    print("Previous:")
    print(f"  commit={prev['commit']} tag={prev['description']} pass@k={prev['pass@k']} pass^k={prev['pass^k']} avg_trial={prev['avg_trial']}")
PY

if [ "$DECISION" = "REVERT" ] && [ "$REVERT_ON_REGRESS" = true ]; then
  echo ""
  echo "=== Reverting latest code commit ==="
  TRACKED_STATUS="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)"
  if [ -n "$TRACKED_STATUS" ]; then
    OTHER_TRACKED="$(printf '%s\n' "$TRACKED_STATUS" | grep -v " ${OUTPUT_REL}$" || true)"
    if [ -n "$OTHER_TRACKED" ]; then
      echo "Skipping auto-revert because tracked files besides ${OUTPUT_REL} are modified:"
      printf '%s\n' "$OTHER_TRACKED"
      exit 0
    fi
  fi
  RESULTS_BACKUP="$(mktemp)"
  cp "$OUTPUT" "$RESULTS_BACKUP"
  python3 - "$RESULTS_BACKUP" "$CURRENT_DESC" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
tag = sys.argv[2]
lines = path.read_text().splitlines()
if len(lines) < 2:
    raise SystemExit(0)
last = lines[-1].split("\t")
if last[-1] == tag and "[REVERTED]" not in last[-1]:
    last[-1] = f"{last[-1]} [REVERTED]"
    lines[-1] = "\t".join(last)
path.write_text("\n".join(lines) + "\n")
PY
  git -C "$REPO_ROOT" reset --hard HEAD~1
  cp "$RESULTS_BACKUP" "$OUTPUT"
  rm -f "$RESULTS_BACKUP"
  echo "Reverted HEAD~1 and restored $OUTPUT with [REVERTED] marker."
fi
