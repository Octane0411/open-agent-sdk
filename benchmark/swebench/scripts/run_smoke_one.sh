#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWEBENCH_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SWEBENCH_DIR}/../.." && pwd)"

if [[ -d "${REPO_ROOT}/.venv-swebench311" ]]; then
  VENV_PATH="${REPO_ROOT}/.venv-swebench311"
elif [[ -d "${REPO_ROOT}/.venv-swebench" ]]; then
  VENV_PATH="${REPO_ROOT}/.venv-swebench"
else
  VENV_PATH="${REPO_ROOT}/.venv-swebench311"
  echo "Missing venv: ${VENV_PATH}"
  echo "Create it first:"
  echo "  cd ${REPO_ROOT}"
  echo "  ~/.pyenv/versions/3.11.8/bin/python -m venv .venv-swebench311"
  echo "  . .venv-swebench311/bin/activate"
  echo "  pip install -U pip"
  echo "  pip install swebench datasets"
  exit 1
fi

# shellcheck disable=SC1090
. "${VENV_PATH}/bin/activate"

# Ensure Docker SDK (used by swebench harness) points to the active docker context socket.
# On macOS + Colima, docker CLI works via context, but python docker.from_env() needs DOCKER_HOST.
if [[ -z "${DOCKER_HOST:-}" ]]; then
  DOCKER_CONTEXT_NAME="$(docker context show 2>/dev/null || true)"
  if [[ -n "${DOCKER_CONTEXT_NAME}" ]]; then
    CONTEXT_HOST="$(docker context inspect "${DOCKER_CONTEXT_NAME}" --format '{{(index .Endpoints "docker").Host}}' 2>/dev/null || true)"
    if [[ -n "${CONTEXT_HOST}" ]]; then
      export DOCKER_HOST="${CONTEXT_HOST}"
    fi
  fi
fi

PRED_DIR="${SWEBENCH_DIR}/outputs/predictions"
REPORT_DIR="${SWEBENCH_DIR}/outputs/reports"
mkdir -p "${PRED_DIR}" "${REPORT_DIR}"

PRED_FILE="${PRED_DIR}/one_lite_gold.jsonl"
RUN_ID="smoke-lite-one-$(date +%Y%m%d-%H%M%S)"
export PRED_FILE
TIMEOUT_SECONDS="${SWEBENCH_TIMEOUT:-120}"

echo "[1/3] Generating single-instance predictions file..."
python "${SCRIPT_DIR}/generate_one_gold_prediction.py" \
  --output "${PRED_FILE}"

INSTANCE_ID="$(python - <<'PY'
import json, os
path=os.environ["PRED_FILE"]
with open(path, "r", encoding="utf-8") as f:
    line=f.readline().strip()
print(json.loads(line)["instance_id"])
PY
)"

echo "[2/3] Running harness for instance: ${INSTANCE_ID}"
echo "Using DOCKER_HOST=${DOCKER_HOST:-<unset>}"
echo "Using timeout=${TIMEOUT_SECONDS}s"
python -m swebench.harness.run_evaluation \
  --dataset_name princeton-nlp/SWE-bench_Lite \
  --split test \
  --instance_ids "${INSTANCE_ID}" \
  --predictions_path "${PRED_FILE}" \
  --max_workers 1 \
  --timeout "${TIMEOUT_SECONDS}" \
  --cache_level env \
  --run_id "${RUN_ID}" \
  --report_dir "${REPORT_DIR}"

REPORT_BASENAME="gold-smoke.${RUN_ID}.json"
if [[ -f "${SWEBENCH_DIR}/${REPORT_BASENAME}" ]]; then
  mv "${SWEBENCH_DIR}/${REPORT_BASENAME}" "${REPORT_DIR}/${REPORT_BASENAME}"
fi

echo "[3/3] Done"
echo "run_id=${RUN_ID}"
echo "predictions=${PRED_FILE}"
echo "reports=${REPORT_DIR}"
