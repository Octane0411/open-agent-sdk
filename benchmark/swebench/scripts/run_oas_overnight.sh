#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWEBENCH_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORT_DIR="${SWEBENCH_DIR}/outputs/reports"
mkdir -p "${REPORT_DIR}"

TOTAL_TARGET="${SWEBENCH_TOTAL_TARGET:-300}"
BATCH_SIZE="${SWEBENCH_BATCH_SIZE:-25}"
START_INDEX="${SWEBENCH_START_INDEX:-0}"
MAX_ERROR_RETRIES="${SWEBENCH_ERROR_RETRIES:-1}"
RESUME="${SWEBENCH_RESUME:-1}"
CLEANUP_EACH_BATCH="${SWEBENCH_CLEANUP_EACH_BATCH:-1}"

RUN_ID="${SWEBENCH_OVERNIGHT_RUN_ID:-oas-overnight-$(date +%Y%m%d-%H%M%S)}"
RUN_DIR="${REPORT_DIR}/${RUN_ID}"
mkdir -p "${RUN_DIR}"
MASTER_LOG="${RUN_DIR}/master.log"
STATE_FILE="${RUN_DIR}/state.json"
MANIFEST_FILE="${RUN_DIR}/batch_summaries.txt"
FINAL_SUMMARY="${RUN_DIR}/final-summary.json"

touch "${MASTER_LOG}" "${MANIFEST_FILE}"

log() {
  printf '%s %s\n' "[$(date '+%F %T')]" "$*" | tee -a "${MASTER_LOG}"
}

run_batch() {
  local batch_output
  batch_output="$(
    env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
      "$@" 2>&1 | tee -a "${MASTER_LOG}"
  )"
  local summary_path
  summary_path="$(printf '%s\n' "${batch_output}" | awk -F= '/^batch_summary=/{print $2}' | tail -1)"
  if [[ -z "${summary_path}" ]]; then
    log "Batch did not produce batch_summary path."
    return 1
  fi
  if [[ ! -f "${summary_path}" ]]; then
    log "Batch summary path missing on disk: ${summary_path}"
    return 1
  fi
  printf '%s\n' "${summary_path}" >> "${MANIFEST_FILE}"
  printf '%s\n' "${summary_path}"
}

collect_errors_csv() {
  local summary_path="$1"
  python - <<'PY' "${summary_path}"
import json
import sys

path = sys.argv[1]
errors = []
with open(path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        if row.get("status") in {"error", "runner_error", "missing_report"}:
            errors.append(row["instance_id"])
print(",".join(errors))
PY
}

write_state() {
  local next_index="$1"
  local completed_batches="$2"
  local status="$3"
  local note="$4"
  python - <<'PY' "${STATE_FILE}" "${RUN_ID}" "${next_index}" "${completed_batches}" "${status}" "${note}" "${MANIFEST_FILE}" "${MASTER_LOG}" "${FINAL_SUMMARY}"
import json
import sys
from datetime import datetime, timezone

(
    state_file,
    run_id,
    next_index,
    completed_batches,
    status,
    note,
    manifest_file,
    master_log,
    final_summary,
) = sys.argv[1:]

payload = {
    "run_id": run_id,
    "next_index": int(next_index),
    "completed_batches": int(completed_batches),
    "status": status,
    "note": note,
    "updated_at": datetime.now(timezone.utc).isoformat(),
    "manifest_file": manifest_file,
    "master_log": master_log,
    "final_summary": final_summary,
}
with open(state_file, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2, ensure_ascii=True)
    f.write("\n")
PY
}

if [[ "${RESUME}" == "1" && -f "${STATE_FILE}" ]]; then
  read -r START_INDEX_FROM_STATE COMPLETED_BATCHES_FROM_STATE < <(
    python - <<'PY' "${STATE_FILE}"
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    state = json.load(f)
print(state.get("next_index", 0), state.get("completed_batches", 0))
PY
  )
  START_INDEX="${START_INDEX_FROM_STATE}"
  COMPLETED_BATCHES="${COMPLETED_BATCHES_FROM_STATE}"
  log "Resuming from state: next_index=${START_INDEX}, completed_batches=${COMPLETED_BATCHES}"
else
  COMPLETED_BATCHES=0
  : > "${MANIFEST_FILE}"
fi

END_INDEX=$((START_INDEX + TOTAL_TARGET))
CURRENT_INDEX="${START_INDEX}"

log "run_id=${RUN_ID} start_index=${START_INDEX} total_target=${TOTAL_TARGET} batch_size=${BATCH_SIZE} end_index=${END_INDEX}"

while (( CURRENT_INDEX < END_INDEX )); do
  remaining=$((END_INDEX - CURRENT_INDEX))
  count="${BATCH_SIZE}"
  if (( remaining < BATCH_SIZE )); then
    count="${remaining}"
  fi

  log "Batch start: index=${CURRENT_INDEX} count=${count}"
  batch_summary="$(
    run_batch \
      env \
      SWEBENCH_START_INDEX="${CURRENT_INDEX}" \
      SWEBENCH_SMOKE_COUNT="${count}" \
      "${SCRIPT_DIR}/run_oas_smoke_batch.sh"
  )"
  COMPLETED_BATCHES=$((COMPLETED_BATCHES + 1))

  error_csv="$(collect_errors_csv "${batch_summary}")"
  if [[ -n "${error_csv}" && "${MAX_ERROR_RETRIES}" -gt 0 ]]; then
    for ((attempt=1; attempt<=MAX_ERROR_RETRIES; attempt++)); do
      log "Retry attempt=${attempt} for error instances: ${error_csv}"
      retry_summary="$(
        run_batch \
          env \
          SWEBENCH_INSTANCE_IDS="${error_csv}" \
          "${SCRIPT_DIR}/run_oas_smoke_batch.sh"
      )"
      error_csv="$(collect_errors_csv "${retry_summary}")"
      if [[ -z "${error_csv}" ]]; then
        log "Retry attempt=${attempt} cleared all previous errors."
        break
      fi
    done
  fi

  if [[ "${CLEANUP_EACH_BATCH}" == "1" ]]; then
    log "Docker cleanup after batch."
    docker container prune -f >> "${MASTER_LOG}" 2>&1 || true
    docker image prune -f >> "${MASTER_LOG}" 2>&1 || true
  fi

  CURRENT_INDEX=$((CURRENT_INDEX + count))
  write_state "${CURRENT_INDEX}" "${COMPLETED_BATCHES}" "running" "batch completed"
done

python - <<'PY' "${MANIFEST_FILE}" "${FINAL_SUMMARY}"
import json
import sys
from pathlib import Path

manifest = Path(sys.argv[1])
out = Path(sys.argv[2])

status_counts = {"resolved": 0, "unresolved": 0, "empty_patch": 0, "error": 0, "unknown": 0}
rows = []
for line in manifest.read_text(encoding="utf-8").splitlines():
    p = Path(line.strip())
    if not p.exists():
        continue
    for row_line in p.read_text(encoding="utf-8").splitlines():
        row_line = row_line.strip()
        if not row_line:
            continue
        row = json.loads(row_line)
        rows.append(row)
        status = row.get("status", "unknown")
        if status not in status_counts:
            status = "unknown"
        status_counts[status] += 1

payload = {
    "total_rows": len(rows),
    "status_counts": status_counts,
    "rows": rows,
}
out.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
print(str(out))
PY

write_state "${CURRENT_INDEX}" "${COMPLETED_BATCHES}" "completed" "all batches completed"
log "Overnight run completed. final_summary=${FINAL_SUMMARY}"
