#!/usr/bin/env bash
set -euo pipefail

REPO_REGEX='^(ghcr.io/laude-institute/terminal-bench/|alexgshaw/)'
KEEP=1
DRY_RUN=0
PRUNE_STOPPED=1

usage() {
  cat <<'EOF'
Usage: cleanup-terminalbench-images.sh [options]

Options:
  --keep N           Keep N newest terminal-bench images (default: 1)
  --repo-regex REGEX Match image repositories by regex
  --dry-run          Print actions without deleting anything
  --no-prune-stopped Do not remove exited terminal-bench containers
  -h, --help         Show help

Examples:
  ./benchmark/terminalbench/scripts/cleanup-terminalbench-images.sh --dry-run --keep 2
  ./benchmark/terminalbench/scripts/cleanup-terminalbench-images.sh --keep 0
EOF
}

while (($#)); do
  case "$1" in
    --keep)
      KEEP="${2:-}"
      shift 2
      ;;
    --repo-regex)
      REPO_REGEX="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --no-prune-stopped)
      PRUNE_STOPPED=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! [[ "$KEEP" =~ ^[0-9]+$ ]]; then
  echo "--keep must be a non-negative integer: $KEEP" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH" >&2
  exit 1
fi

echo "== Docker usage before =="
docker system df || true
echo

TMP_META=""
TMP_RUNNING="$(mktemp)"
TMP_KEEP="$(mktemp)"
cleanup_tmp() {
  rm -f "$TMP_META" "$TMP_RUNNING" "$TMP_KEEP"
}
trap cleanup_tmp EXIT

while IFS= read -r cid; do
  [ -z "$cid" ] && continue
  iid="$(docker inspect -f '{{.Image}}' "$cid" 2>/dev/null || true)"
  [ -n "$iid" ] && echo "$iid" >> "$TMP_RUNNING"
done < <(docker ps -q)

TB_IMAGE_IDS=()
while IFS= read -r iid; do
  [ -n "$iid" ] && TB_IMAGE_IDS+=("$iid")
done < <(docker image ls --format '{{.ID}} {{.Repository}}' \
  | awk -v re="$REPO_REGEX" '$2 ~ re { print $1 }' \
  | awk '!seen[$0]++')

if [ "${#TB_IMAGE_IDS[@]}" -eq 0 ]; then
  echo "No terminal-bench images found for repo regex: $REPO_REGEX"
  exit 0
fi

TMP_META="$(mktemp)"

for iid in "${TB_IMAGE_IDS[@]}"; do
  created="$(docker image inspect -f '{{.Created}}' "$iid" 2>/dev/null || true)"
  tags="$(docker image inspect -f '{{join .RepoTags ","}}' "$iid" 2>/dev/null || true)"
  printf '%s\t%s\t%s\n' "$created" "$iid" "$tags" >> "$TMP_META"
done

SORTED=()
while IFS= read -r row; do
  [ -n "$row" ] && SORTED+=("$row")
done < <(sort -r "$TMP_META")

idx=0
for row in "${SORTED[@]}"; do
  iid="$(echo "$row" | cut -f2)"
  if [ "$idx" -lt "$KEEP" ]; then
    echo "$iid" >> "$TMP_KEEP"
  fi
  idx=$((idx + 1))
done

echo "Found ${#SORTED[@]} terminal-bench images. keep=$KEEP"
deleted=0
skipped_running=0
skipped_keep=0

for row in "${SORTED[@]}"; do
  created="$(echo "$row" | cut -f1)"
  iid="$(echo "$row" | cut -f2)"
  tags="$(echo "$row" | cut -f3)"

  if [ -s "$TMP_RUNNING" ] && grep -Fxq "$iid" "$TMP_RUNNING"; then
    echo "[skip running] $iid $tags"
    skipped_running=$((skipped_running + 1))
    continue
  fi

  if [ -s "$TMP_KEEP" ] && grep -Fxq "$iid" "$TMP_KEEP"; then
    echo "[keep newest]  $iid $tags ($created)"
    skipped_keep=$((skipped_keep + 1))
    continue
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run delete] $iid $tags ($created)"
  else
    echo "[delete] $iid $tags ($created)"
    docker rmi "$iid" >/dev/null
  fi
  deleted=$((deleted + 1))
done

if [ "$PRUNE_STOPPED" -eq 1 ]; then
  STOPPED_CIDS=()
  while IFS= read -r cid; do
    [ -n "$cid" ] && STOPPED_CIDS+=("$cid")
  done < <(docker ps -a --format '{{.ID}} {{.Image}} {{.Status}}' \
    | awk -v re="$REPO_REGEX" '$2 ~ re && $3 ~ /^Exited/ { print $1 }')

  if [ "${#STOPPED_CIDS[@]}" -gt 0 ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[dry-run] would remove ${#STOPPED_CIDS[@]} exited terminal-bench containers"
    else
      docker rm "${STOPPED_CIDS[@]}" >/dev/null
      echo "Removed ${#STOPPED_CIDS[@]} exited terminal-bench containers"
    fi
  fi
fi

echo
echo "Summary: deleted=$deleted kept_newest=$skipped_keep skipped_running=$skipped_running dry_run=$DRY_RUN"
echo
echo "== Docker usage after =="
docker system df || true
