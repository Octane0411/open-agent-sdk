#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TASKS_FILE="${REPO_ROOT}/benchmark/terminalbench/task-lists/smoke-5.txt"
BACKUP_PREFIX="oas-original"
PREWARMED_PREFIX="oas-prewarmed"
TASK_MAP="$(mktemp)"
RESTORE_MISSING=false

usage() {
  cat <<'EOF'
Usage: check-prewarmed-images.sh [options]

Verify that every task image in a task list is available locally and already
contains the required pre-warmed assets.

Checks:
  - image exists locally
  - `/usr/local/bin/bun` exists in the image
  - `bun` exists in the image
  - `oas` exists in the image
  - `/opt/oas-verifier/bin/python` exists in the image
  - `/installed-agent` exists in the image
  - image can still start with a Harbor-style `sh -c 'sleep ...'` command override

Options:
  --tasks-file FILE    Task list file (default: smoke-5.txt)
  --restore-missing-from-backup
                      Retag missing images from `oas-original/...` before checking
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
    --restore-missing-from-backup) RESTORE_MISSING=true; shift ;;
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
  found=false
  while IFS= read -r toml; do
    [ -z "$toml" ] && continue
    found=true
    image="$(grep -E '^docker_image|^# original_docker_image' "$toml" | head -1 | sed 's/.*= *"//;s/"//')"
    [ -z "$image" ] && continue
    printf '%s\t%s\n' "$task_name" "$image" >> "$TASK_MAP"
  done < <(find ~/.cache/harbor/tasks/ -path "*/$task_name/task.toml" 2>/dev/null | sort)
  if [ "$found" != true ]; then
    echo "WARN: task '$task_name' not found in Harbor cache"
  fi
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
  prewarmed_backup="${PREWARMED_PREFIX}/${image_base}"
  tasks="$(awk -F'\t' -v img="$image" '$2==img {printf "%s ", $1}' "$TASK_MAP")"

  echo "[CHECK] $image"
  echo "  tasks: $tasks"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    if docker image inspect "$prewarmed_backup" >/dev/null 2>&1; then
      if [ "$RESTORE_MISSING" = true ]; then
        echo "  restore: retagging missing image from warm backup $prewarmed_backup"
        docker tag "$prewarmed_backup" "$image"
      else
        echo "  FAIL: image is missing locally"
        echo "  hint: warm backup exists at $prewarmed_backup"
        echo "  hint: rerun prewarm or retag the warm backup before evaluation"
        FAILED=$((FAILED + 1))
        echo ""
        continue
      fi
    elif docker image inspect "$backup" >/dev/null 2>&1; then
      if [ "$RESTORE_MISSING" = true ]; then
        echo "  restore: retagging missing image from original backup $backup"
        docker tag "$backup" "$image"
      else
        echo "  FAIL: image is missing locally"
        echo "  hint: backup exists at $backup"
        echo "  hint: rerun prewarm or retag the backup before evaluation"
        FAILED=$((FAILED + 1))
        echo ""
        continue
      fi
    else
      echo "  FAIL: image is missing locally"
      echo "  hint: rerun prewarm for this task before evaluation"
      FAILED=$((FAILED + 1))
      echo ""
      continue
    fi
  fi

  if ! docker run --rm --entrypoint /bin/sh "$image" -lc \
    'export PATH="/root/.bun/bin:$HOME/.bun/bin:$PATH"; test -x /usr/local/bin/bun && command -v bun >/dev/null 2>&1 && command -v oas >/dev/null 2>&1 && test -x /opt/oas-verifier/bin/python && test -d /installed-agent' \
    >/dev/null 2>&1; then
    echo "  FAIL: image is present but missing one or more pre-warmed assets"
    echo "  required: /usr/local/bin/bun, bun, oas, /opt/oas-verifier/bin/python, /installed-agent"
    echo "  hint: rerun prewarm for this task before evaluation"
    FAILED=$((FAILED + 1))
    echo ""
    continue
  fi

  probe_container="$(docker run -d "$image" sh -c 'sleep 30' 2>/dev/null || true)"
  if [ -z "$probe_container" ]; then
    echo "  FAIL: image could not start with a Harbor-style command override"
    echo "  hint: image entrypoint/cmd metadata is corrupted; rerun prewarm after restoring the original image"
    FAILED=$((FAILED + 1))
    echo ""
    continue
  fi

  sleep 1
  probe_running="$(docker inspect --format '{{.State.Running}}' "$probe_container" 2>/dev/null || echo false)"
  docker rm -f "$probe_container" >/dev/null 2>&1 || true
  if [ "$probe_running" != "true" ]; then
    echo "  FAIL: image exited immediately under a Harbor-style command override"
    echo "  hint: image entrypoint/cmd metadata is corrupted; rerun prewarm after restoring the original image"
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
