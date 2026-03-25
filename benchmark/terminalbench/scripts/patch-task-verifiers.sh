#!/usr/bin/env bash
set -euo pipefail

TASKS_FILE=""
TASK_CACHE_ROOT="${HOME}/.cache/harbor/tasks"
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: patch-task-verifiers.sh --tasks-file FILE [options]

Patch cached Harbor verifier scripts so they prefer the pre-warmed
/opt/oas-verifier environment when it exists.

Options:
  --tasks-file FILE       Task list file to patch
  --task-cache-root DIR   Harbor task cache root (default: ~/.cache/harbor/tasks)
  --dry-run               Print what would be patched without modifying files
  -h, --help              Show help
EOF
}

while (($#)); do
  case "$1" in
    --tasks-file) TASKS_FILE="${2:-}"; shift 2 ;;
    --task-cache-root) TASK_CACHE_ROOT="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [ -z "$TASKS_FILE" ]; then
  echo "--tasks-file is required" >&2
  exit 1
fi

python3 - "$TASKS_FILE" "$TASK_CACHE_ROOT" "$DRY_RUN" <<'PY'
from pathlib import Path
from typing import Optional
import sys

tasks_file = Path(sys.argv[1]).expanduser()
task_cache_root = Path(sys.argv[2]).expanduser()
dry_run = sys.argv[3].lower() == "true"

marker = 'OAS_PREWARMED_VERIFIER_PYTHON="/opt/oas-verifier/bin/python"'
pwd_check = 'if [ "$PWD" = "/" ]; then'

if not tasks_file.is_file():
    raise SystemExit(f"tasks file not found: {tasks_file}")

if not task_cache_root.is_dir():
    raise SystemExit(f"task cache root not found: {task_cache_root}")

tasks: list[str] = []
for raw in tasks_file.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    tasks.append(line)

patched = 0
skipped = 0
warnings = 0

def find_pytest_args(lines: list[str]) -> Optional[str]:
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "pytest " not in stripped:
            continue
        return stripped.split("pytest ", 1)[1].strip()
    return None

def insertion_index(lines: list[str]) -> int:
    idx = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            idx = i + 1
            continue
        if stripped.startswith("#") or stripped.startswith("#!") or stripped.startswith("export "):
            idx = i + 1
            continue
        break
    return idx

for task in tasks:
    matches = sorted(task_cache_root.glob(f"*/{task}/tests/test.sh"))
    if not matches:
        print(f"WARN: no cached verifier found for task '{task}'")
        warnings += 1
        continue

    for path in matches:
        original = path.read_text()
        if marker in original:
            print(f"SKIP: already patched {path}")
            skipped += 1
            continue

        lines = original.splitlines()
        pytest_args = find_pytest_args(lines)
        if pytest_args is None:
            print(f"WARN: could not find pytest invocation in {path}")
            warnings += 1
            continue

        insert_at = insertion_index(lines)
        snippet_lines = [
            'OAS_PREWARMED_VERIFIER_PYTHON="/opt/oas-verifier/bin/python"',
            'if [ -x "$OAS_PREWARMED_VERIFIER_PYTHON" ]; then',
            f'  {pwd_check}',
            '      echo "Error: No working directory set. Please set a WORKDIR in your Dockerfile before running this script."',
            '      exit 1',
            '  fi',
            f'  "$OAS_PREWARMED_VERIFIER_PYTHON" -m pytest {pytest_args}',
            '  pytest_status=$?',
            '  if [ "$pytest_status" -eq 0 ]; then',
            '    echo 1 > /logs/verifier/reward.txt',
            '  else',
            '    echo 0 > /logs/verifier/reward.txt',
            '  fi',
            '  exit 0',
            'fi',
            "",
        ]
        new_lines = lines[:insert_at] + snippet_lines + lines[insert_at:]
        updated = "\n".join(new_lines) + "\n"

        if dry_run:
            print(f"PATCH: {path}")
            patched += 1
            continue

        backup = path.with_suffix(path.suffix + ".oas-orig")
        if not backup.exists():
            backup.write_text(original)
        path.write_text(updated)
        print(f"PATCHED: {path}")
        patched += 1

print("")
print(f"Patched: {patched}  Skipped: {skipped}  Warnings: {warnings}")
PY
