#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWEBENCH_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SWEBENCH_DIR}/../.." && pwd)"
REPORT_DIR="${SWEBENCH_DIR}/outputs/reports"
mkdir -p "${REPORT_DIR}"

if [[ -z "${OAS_MODEL:-}" ]]; then
  echo "Missing required env: OAS_MODEL"
  echo "Example:"
  echo "  export OAS_MODEL='MiniMax-M2.5'"
  exit 1
fi

COUNT="${SWEBENCH_SMOKE_COUNT:-5}"
START_INDEX="${SWEBENCH_START_INDEX:-0}"
SPLIT="${SWEBENCH_SPLIT:-test}"
DATASET="${SWEBENCH_DATASET:-princeton-nlp/SWE-bench_Lite}"

BATCH_ID="oas-smoke-batch-$(date +%Y%m%d-%H%M%S)"
BATCH_LOG="${REPORT_DIR}/${BATCH_ID}.log"
BATCH_SUMMARY_JSONL="${REPORT_DIR}/${BATCH_ID}.jsonl"

echo "batch_id=${BATCH_ID}" | tee -a "${BATCH_LOG}"
echo "dataset=${DATASET} split=${SPLIT} count=${COUNT} start_index=${START_INDEX}" | tee -a "${BATCH_LOG}"

if [[ -n "${SWEBENCH_INSTANCE_IDS:-}" ]]; then
  # comma-separated list, e.g. "id1,id2,id3"
  IFS=',' read -r -a INSTANCE_IDS <<< "${SWEBENCH_INSTANCE_IDS}"
else
  if [[ -d "${REPO_ROOT}/.venv-swebench311" ]]; then
    # shellcheck disable=SC1090
    . "${REPO_ROOT}/.venv-swebench311/bin/activate"
  elif [[ -d "${REPO_ROOT}/.venv-swebench" ]]; then
    # shellcheck disable=SC1090
    . "${REPO_ROOT}/.venv-swebench/bin/activate"
  fi

  INSTANCE_IDS=()
  while IFS= read -r line; do
    INSTANCE_IDS+=("${line}")
  done < <(
    DATASET="${DATASET}" SPLIT="${SPLIT}" COUNT="${COUNT}" START_INDEX="${START_INDEX}" python - <<'PY'
from datasets import load_dataset
import os

dataset = os.environ["DATASET"]
split = os.environ["SPLIT"]
count = int(os.environ["COUNT"])
start = int(os.environ["START_INDEX"])
ds = load_dataset(dataset, split=split)
for i in range(start, min(start + count, len(ds))):
    print(ds[i]["instance_id"])
PY
  )
fi

if [[ "${#INSTANCE_IDS[@]}" -eq 0 ]]; then
  echo "No instance ids selected." | tee -a "${BATCH_LOG}"
  exit 1
fi

for instance_id in "${INSTANCE_IDS[@]}"; do
  echo "" | tee -a "${BATCH_LOG}"
  echo "=== instance=${instance_id} ===" | tee -a "${BATCH_LOG}"
  RUN_OUTPUT="$(
    SWEBENCH_INSTANCE_ID="${instance_id}" \
    "${SCRIPT_DIR}/run_oas_smoke_one.sh" 2>&1 | tee -a "${BATCH_LOG}"
  )"

  run_id="$(printf '%s\n' "${RUN_OUTPUT}" | awk -F= '/^run_id=/{print $2}' | tail -1)"
  if [[ -z "${run_id}" ]]; then
    echo "{\"instance_id\":\"${instance_id}\",\"run_id\":null,\"status\":\"runner_error\"}" >> "${BATCH_SUMMARY_JSONL}"
    continue
  fi

  report_file="$(find "${REPORT_DIR}" -maxdepth 1 -type f -name "*.${run_id}.json" | head -1)"
  if [[ -z "${report_file}" ]]; then
    echo "{\"instance_id\":\"${instance_id}\",\"run_id\":\"${run_id}\",\"status\":\"missing_report\"}" >> "${BATCH_SUMMARY_JSONL}"
    continue
  fi

  INSTANCE_ID="${instance_id}" RUN_ID="${run_id}" REPORT_FILE="${report_file}" python - <<'PY' >> "${BATCH_SUMMARY_JSONL}"
import json, os

instance_id = os.environ["INSTANCE_ID"]
run_id = os.environ["RUN_ID"]
report_file = os.environ["REPORT_FILE"]
with open(report_file, "r", encoding="utf-8") as f:
    r = json.load(f)

status = "unknown"
if r.get("error_instances", 0) > 0:
    status = "error"
elif r.get("resolved_instances", 0) > 0:
    status = "resolved"
elif r.get("unresolved_instances", 0) > 0:
    status = "unresolved"
elif r.get("empty_patch_instances", 0) > 0:
    status = "empty_patch"

row = {
    "instance_id": instance_id,
    "run_id": run_id,
    "status": status,
    "resolved_instances": r.get("resolved_instances"),
    "unresolved_instances": r.get("unresolved_instances"),
    "error_instances": r.get("error_instances"),
    "report_file": report_file,
}
print(json.dumps(row, ensure_ascii=True))
PY
done

echo "" | tee -a "${BATCH_LOG}"
echo "batch_summary=${BATCH_SUMMARY_JSONL}" | tee -a "${BATCH_LOG}"
python "${SCRIPT_DIR}/summarize_reports.py" --reports-dir "${REPORT_DIR}" --limit 20 | tee -a "${BATCH_LOG}"
