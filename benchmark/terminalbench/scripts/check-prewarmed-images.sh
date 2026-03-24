#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TASKS_FILE="${REPO_ROOT}/benchmark/terminalbench/task-lists/smoke-5.txt"
BACKUP_PREFIX="oas-original"
TASK_MAP="$(mktemp)"

usage() {
  cat <<'EOF'
Usage: check-prewarmed-images.sh [options]

Verify that every task image in a task list is available locally and already
contains the required pre-warmed assets.

Checks:
  - image exists locally
  - `bun` exists in the image
  - `oas` exists in the image
  - `/opt/oas-verifier/bin/python` exists in the image

Options:
  --tasks-file FILE    Task list file (default: smoke-5.txt)
  -h, --help           Show help
EOF
}

cleanup() {
  rm -f "$TASK_MAP"
}

trap cleanup EXIT

while (($#)); do
  case "$1" in
    --tasks-file) TASKS_FILE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [ ! -f "$TASKS_FILE" ]; then
  echo "Tasks file not found: $TASKS_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH" >&2
  exit 1
fi

while IFS= read -r task_name; do
  [ -z "$task_name" ] && continue
  [[ "$task_name" == \#* ]] && continue
  toml="$(find ~/.cache/harbor/tasks/ -path "*/$task_name/task.toml" 2>/dev/null | head -1)"
  if [ -z "$toml" ]; then
    echo "WARN: task '$task_name' not found in Harbor cache"
    continue
  fi
  image="$(grep -E '^docker_image|^# original_docker_image' "$toml" | head -1 | sed 's/.*= *"//;s/"//')"
  printf '%s\t%s\n' "$task_name" "$image" >> "$TASK_MAP"
done < "$TASKS_FILE"

UNIQUE_IMAGES="$(cut -f2 "$TASK_MAP" | sort -u)"
FAILED=0
CHECKED=0

echo "=== Checking pre-warmed images ==="
echo ""

while IFS= read -r image; do
  [ -z "$image" ] && continue
  CHECKED=$((CHECKED + 1))
  image_base="$(echo "$image" | sed 's|.*/||')"
  backup="${BACKUP_PREFIX}/${image_base}"
  tasks="$(awk -F'\t' -v img="$image" '$2==img {printf "%s ", $1}' "$TASK_MAP")"

  echo "[CHECK] $image"
  echo "  tasks: $tasks"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "  FAIL: image is missing locally"
    if docker image inspect "$backup" >/dev/null 2>&1; then
      echo "  hint: backup exists at $backup"
      echo "  hint: rerun prewarm or retag the backup before evaluation"
    else
      echo "  hint: rerun prewarm for this task before evaluation"
    fi
    FAILED=$((FAILED + 1))
    echo ""
    continue
  fi

  if ! docker run --rm --entrypoint /bin/sh "$image" -lc \
    'export PATH="/root/.bun/bin:$HOME/.bun/bin:$PATH"; command -v bun >/dev/null 2>&1 && command -v oas >/dev/null 2>&1 && test -x /opt/oas-verifier/bin/python' \
    >/dev/null 2>&1; then
    echo "  FAIL: image is present but missing one or more pre-warmed assets"
    echo "  required: bun, oas, /opt/oas-verifier/bin/python"
    echo "  hint: rerun prewarm for this task before evaluation"
    FAILED=$((FAILED + 1))
    echo ""
    continue
  fi

  echo "  OK: pre-warmed image is ready"
  echo ""
done <<< "$UNIQUE_IMAGES"

echo "=== Summary ==="
echo "  Checked: $CHECKED  Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
