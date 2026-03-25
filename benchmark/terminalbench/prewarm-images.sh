#!/usr/bin/env bash
set -euo pipefail

#
# prewarm-images.sh — Pre-install bun + oas CLI + pytest into task Docker images
#
# Eliminates repeated ~100s setup overhead per task by baking dependencies
# into the task Docker images. The original images are backed up as
# oas-original/<name>:<tag> and the pre-warmed images replace the originals,
# so Harbor uses them transparently without any config changes.
#
# Usage:
#   ./benchmark/terminalbench/prewarm-images.sh
#   ./benchmark/terminalbench/prewarm-images.sh --tasks-file benchmark/terminalbench/task-lists/smoke-5.txt
#   ./benchmark/terminalbench/prewarm-images.sh --all
#   ./benchmark/terminalbench/prewarm-images.sh --force
#   ./benchmark/terminalbench/prewarm-images.sh --restore   # restore original images
#

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASKS_FILE="${REPO_ROOT}/benchmark/terminalbench/task-lists/smoke-5.txt"
PREWARM_ALL=false
FORCE=false
RESTORE=false
BACKUP_PREFIX="oas-original"
PREWARMED_PREFIX="oas-prewarmed"
PYPI_MIRROR="https://pypi.tuna.tsinghua.edu.cn/simple"
PYPI_FALLBACK_INDEX="https://pypi.org/simple"
UV_PREWARM_TIMEOUT="600"
PACK_LOCAL_TARBALLS=false
TARBALL_DIR="${REPO_ROOT}/benchmark/terminalbench/.local-tarballs"
TARBALL_PORT="8765"
TARBALL_HOST="host.docker.internal"
PACKAGE_VERSION=""
SERVER_LOG=""
TARBALL_SERVER_PID=""
DOCKER_ADD_HOST_ARGS=()

usage() {
  cat <<'EOF'
Usage: prewarm-images.sh [options]

Options:
  --tasks-file FILE    Task list file (default: smoke-5.txt)
  --all                Pre-warm ALL cached task images
  --force              Force rebuild even if already pre-warmed
  --restore            Restore original images from backup
  --pypi-mirror URL    PyPI mirror for pytest install (default: tsinghua)
  --pypi-fallback URL  Fallback PyPI index when the mirror misses packages
                       (default: https://pypi.org/simple)
  --uv-prewarm-timeout N
                     Best-effort verifier prewarm timeout in seconds (default: 600)
  --pack-local-tarballs
                     Build repo-local SDK/CLI tarballs and serve them temporarily
  --tarball-dir DIR    Directory used for generated local tarballs
  --tarball-port N     HTTP port for temporary tarball server (default: 8765)
  --tarball-host HOST  Hostname containers should use for tarball server
                       (default: host.docker.internal)
  -h, --help           Show help
EOF
}

while (($#)); do
  case "$1" in
    --tasks-file) TASKS_FILE="${2:-}"; shift 2 ;;
    --all) PREWARM_ALL=true; shift ;;
    --force) FORCE=true; shift ;;
    --restore) RESTORE=true; shift ;;
    --pypi-mirror) PYPI_MIRROR="${2:-}"; shift 2 ;;
    --pypi-fallback) PYPI_FALLBACK_INDEX="${2:-}"; shift 2 ;;
    --uv-prewarm-timeout) UV_PREWARM_TIMEOUT="${2:-}"; shift 2 ;;
    --pack-local-tarballs) PACK_LOCAL_TARBALLS=true; shift ;;
    --tarball-dir) TARBALL_DIR="${2:-}"; shift 2 ;;
    --tarball-port) TARBALL_PORT="${2:-}"; shift 2 ;;
    --tarball-host) TARBALL_HOST="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

cleanup() {
  rm -f "$TASK_MAP"
  if [ -n "${TARBALL_SERVER_PID:-}" ]; then
    kill "$TARBALL_SERVER_PID" >/dev/null 2>&1 || true
    wait "$TARBALL_SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${SERVER_LOG:-}" ]; then
    rm -f "$SERVER_LOG"
  fi
}

build_commit_change_args() {
  local image="$1"
  local -n out_ref="$2"
  local entrypoint_json=""
  local cmd_json=""
  local workdir=""
  local user=""

  entrypoint_json="$(docker image inspect "$image" --format '{{json .Config.Entrypoint}}')"
  cmd_json="$(docker image inspect "$image" --format '{{json .Config.Cmd}}')"
  workdir="$(docker image inspect "$image" --format '{{.Config.WorkingDir}}')"
  user="$(docker image inspect "$image" --format '{{.Config.User}}')"

  out_ref=()
  if [ "$entrypoint_json" = "null" ]; then
    out_ref+=(--change 'ENTRYPOINT []')
  else
    out_ref+=(--change "ENTRYPOINT ${entrypoint_json}")
  fi
  if [ "$cmd_json" != "null" ]; then
    out_ref+=(--change "CMD ${cmd_json}")
  fi
  if [ -n "$workdir" ]; then
    out_ref+=(--change "WORKDIR ${workdir}")
  fi
  if [ -n "$user" ]; then
    out_ref+=(--change "USER ${user}")
  fi
}

# Load env
MAIN_GIT_DIR="$(git -C "$REPO_ROOT" rev-parse --git-common-dir)"
MAIN_ENV_FILE="$(cd "$MAIN_GIT_DIR/.." && pwd)/.env"
if [ -f "$MAIN_ENV_FILE" ]; then
  set -a; source "$MAIN_ENV_FILE"; set +a
fi

# Collect unique docker images from tasks
TASK_MAP=$(mktemp)
trap cleanup EXIT

if [ "$PREWARM_ALL" = true ]; then
  while IFS= read -r toml; do
    image=$(grep 'docker_image' "$toml" 2>/dev/null | head -1 | sed 's/.*= *"//;s/"//')
    [ -z "$image" ] && continue
    task_name=$(basename "$(dirname "$toml")")
    printf '%s\t%s\n' "$task_name" "$image" >> "$TASK_MAP"
  done < <(find ~/.cache/harbor/tasks/ -name "task.toml" 2>/dev/null)
else
  if [ ! -f "$TASKS_FILE" ]; then
    echo "Tasks file not found: $TASKS_FILE" >&2
    exit 1
  fi
  while IFS= read -r task_name; do
    [ -z "$task_name" ] && continue
    [[ "$task_name" == \#* ]] && continue
    found=false
    while IFS= read -r toml; do
      [ -z "$toml" ] && continue
      found=true
      image=$(grep -E '^docker_image|^# original_docker_image' "$toml" | head -1 | sed 's/.*= *"//;s/"//')
      [ -z "$image" ] && continue
      printf '%s\t%s\n' "$task_name" "$image" >> "$TASK_MAP"
    done < <(find ~/.cache/harbor/tasks/ -path "*/$task_name/task.toml" 2>/dev/null | sort)
    if [ "$found" != true ]; then
      echo "WARN: task '$task_name' not found in cache, skipping"
    fi
  done < "$TASKS_FILE"
fi

UNIQUE_IMAGES=$(cut -f2 "$TASK_MAP" | sort -u)
UNIQUE_COUNT=$(echo "$UNIQUE_IMAGES" | grep -c . || true)
TASK_COUNT=$(wc -l < "$TASK_MAP" | tr -d ' ')

# --restore: swap back original images
if [ "$RESTORE" = true ]; then
  echo "=== Restoring original images ==="
  RESTORED=0
  while IFS= read -r image; do
    [ -z "$image" ] && continue
    image_base=$(echo "$image" | sed 's|.*/||')
    backup="${BACKUP_PREFIX}/${image_base}"
    if docker image inspect "$backup" &>/dev/null; then
      docker tag "$backup" "$image"
      echo "  [OK] $backup -> $image"
      RESTORED=$((RESTORED + 1))
    fi
  done <<< "$UNIQUE_IMAGES"
  echo "Restored: $RESTORED"
  exit 0
fi

echo "=== Pre-warm Docker images ==="
echo "Tasks: $TASK_COUNT  Unique images: $UNIQUE_COUNT"
echo ""

if [ "$PACK_LOCAL_TARBALLS" = true ]; then
  PACK_SCRIPT="${REPO_ROOT}/benchmark/terminalbench/scripts/pack-local-tarballs.sh"
  if [ ! -f "$PACK_SCRIPT" ]; then
    echo "ERROR: pack script not found: $PACK_SCRIPT" >&2
    exit 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 is required for --pack-local-tarballs" >&2
    exit 1
  fi

  echo "=== Preparing local tarballs ==="
  bash "$PACK_SCRIPT" --output-dir "$TARBALL_DIR"

  SERVER_LOG=$(mktemp)
  python3 -m http.server "$TARBALL_PORT" --bind 0.0.0.0 --directory "$TARBALL_DIR" \
    >"$SERVER_LOG" 2>&1 &
  TARBALL_SERVER_PID=$!
  sleep 1
  if ! kill -0 "$TARBALL_SERVER_PID" >/dev/null 2>&1; then
    echo "ERROR: failed to start local tarball server on port $TARBALL_PORT" >&2
    cat "$SERVER_LOG" >&2 || true
    exit 1
  fi

  OAS_LOCAL_TARBALL_URL="http://${TARBALL_HOST}:${TARBALL_PORT}"
  export OAS_LOCAL_TARBALL_URL
  DOCKER_ADD_HOST_ARGS=(--add-host "${TARBALL_HOST}:host-gateway")
  echo "Serving local tarballs from: $OAS_LOCAL_TARBALL_URL"
  echo ""
fi

if command -v python3 >/dev/null 2>&1; then
  PACKAGE_VERSION="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' "${REPO_ROOT}/package.json")"
fi

INSTALL_SCRIPT="${REPO_ROOT}/benchmark/terminalbench/open_agent_sdk_harbor/install-open-agent-sdk.sh.j2"
if [ ! -f "$INSTALL_SCRIPT" ]; then
  echo "ERROR: install script not found: $INSTALL_SCRIPT" >&2
  exit 1
fi

WARMED=0
SKIPPED=0
FAILED=0

while IFS= read -r image; do
  [ -z "$image" ] && continue

  image_base=$(echo "$image" | sed 's|.*/||')
  backup="${BACKUP_PREFIX}/${image_base}"
  prewarmed_backup="${PREWARMED_PREFIX}/${image_base}"
  tasks=$(awk -F'\t' -v img="$image" '$2==img {printf "%s ", $1}' "$TASK_MAP")

  # Check if already pre-warmed (backup exists = already done)
  if [ "$FORCE" != true ] && docker image inspect "$backup" &>/dev/null; then
    echo "[SKIP] $image (already pre-warmed, use --force to rebuild)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "[BUILD] $image"
  echo "  tasks: $tasks"

  if docker image inspect "$backup" &>/dev/null; then
    # Prefer the local backup to avoid unnecessary registry pulls on rebuild.
    echo "  restoring original image from backup before rebuild"
    docker tag "$backup" "$image"
  elif ! docker image inspect "$image" &>/dev/null; then
    echo "  pulling $image ..."
    if ! docker pull "$image"; then
      echo "  FAIL: pull failed"
      FAILED=$((FAILED + 1))
      continue
    fi
    docker tag "$image" "$backup"
  else
    # Backup original image on first pre-warm
    docker tag "$image" "$backup"
  fi

  COMMIT_CHANGE_ARGS=()
  build_commit_change_args "$image" COMMIT_CHANGE_ARGS

  container_name="oas-prewarm-$$"

  # Build combined setup script
  SETUP_SCRIPT=$(mktemp)
  cat > "$SETUP_SCRIPT" << 'SETUP_HEADER'
#!/bin/bash
set -euo pipefail
mkdir -p /installed-agent
SETUP_HEADER

  # Append agent install script (strip jinja)
  sed 's/{%.*%}//g; s/{{.*}}//g' "$INSTALL_SCRIPT" >> "$SETUP_SCRIPT"

  # Append pytest pre-install
  cat >> "$SETUP_SCRIPT" << SETUP_FOOTER

# Pre-install uv + pytest for verifier
echo "=== Pre-installing uv + pytest ==="
if ! command -v curl &>/dev/null; then
  apt-get update -qq && apt-get install -y -qq curl >/dev/null 2>&1 || true
fi
curl -LsSf https://astral.sh/uv/0.9.5/install.sh | sh
export PATH="\$HOME/.local/bin:\$PATH"

install_verifier_packages() {
  local python_bin="/opt/oas-verifier/bin/python"
  local index=""
  for index in "${PYPI_FALLBACK_INDEX}" "${PYPI_MIRROR}"; do
    [ -z "\$index" ] && continue
    echo "Installing verifier packages via \${index}"
    if "\$python_bin" -m pip install \
      --disable-pip-version-check \
      --default-timeout 15 \
      --retries 1 \
      -i "\$index" \
      pytest==8.4.1 \
      pytest-json-ctrf==0.3.5; then
      return 0
    fi
    echo "Verifier package install failed on \${index}, trying next index..."
  done
  return 1
}

build_verifier_env() {
  rm -rf /opt/oas-verifier
  UV_HTTP_TIMEOUT=300 uv venv --python 3.13 /opt/oas-verifier
  /opt/oas-verifier/bin/python -m ensurepip >/dev/null
  install_verifier_packages
  /opt/oas-verifier/bin/python -m pytest --version
  chmod -R a+rX /opt/oas-verifier || true
}

prewarm_verifier_env() {
  local uv_pid=""
  local watchdog_pid=""
  local status=0

  (
    build_verifier_env
  ) &
  uv_pid=\$!

  (
    sleep "${UV_PREWARM_TIMEOUT}"
    if kill -0 "\$uv_pid" >/dev/null 2>&1; then
      echo "WARN: uv/pytest prewarm timed out after ${UV_PREWARM_TIMEOUT}s; continuing without verifier cache"
      kill -TERM "\$uv_pid" >/dev/null 2>&1 || true
      sleep 3
      kill -KILL "\$uv_pid" >/dev/null 2>&1 || true
    fi
  ) &
  watchdog_pid=\$!

  wait "\$uv_pid" || status=\$?
  kill "\$watchdog_pid" >/dev/null 2>&1 || true
  wait "\$watchdog_pid" 2>/dev/null || true
  return "\$status"
}

if prewarm_verifier_env; then
  echo "Verifier environment ready: /opt/oas-verifier"
else
  echo "WARN: uv/pytest prewarm failed; continuing without /opt/oas-verifier"
fi
echo "=== Pre-warm complete ==="
SETUP_FOOTER

  # Run in container
  if docker run --name "$container_name" \
    "${DOCKER_ADD_HOST_ARGS[@]}" \
    -e "OAS_GITHUB_MIRROR=${OAS_GITHUB_MIRROR:-}" \
    -e "OAS_NPM_REGISTRIES=${OAS_NPM_REGISTRIES:-}" \
    -e "OAS_LOCAL_TARBALL_URL=${OAS_LOCAL_TARBALL_URL:-}" \
    -e "OAS_PACKAGE_VERSION=${PACKAGE_VERSION}" \
    "$image" \
    bash -c "$(cat "$SETUP_SCRIPT")" 2>&1 | tail -5; then

    # Replace original image with pre-warmed version
    docker commit "${COMMIT_CHANGE_ARGS[@]}" "$container_name" "$image" > /dev/null
    docker tag "$image" "$prewarmed_backup"
    docker rm -f "$container_name" > /dev/null
    echo "  OK: pre-warmed (original: $backup, warm: $prewarmed_backup)"
    WARMED=$((WARMED + 1))
  else
    echo "  FAIL: setup exited with error"
    # Restore original from backup
    docker tag "$backup" "$image"
    docker rm -f "$container_name" &>/dev/null || true
    FAILED=$((FAILED + 1))
  fi
  rm -f "$SETUP_SCRIPT"

done <<< "$UNIQUE_IMAGES"

echo ""
echo "=== Summary ==="
echo "  Warmed: $WARMED  Skipped: $SKIPPED  Failed: $FAILED"
echo ""
echo "Done. Pre-warmed images replace originals — no config changes needed."
echo "Use --restore to revert to original images."
