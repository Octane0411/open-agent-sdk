#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/benchmark/terminalbench/.local-tarballs"
SKIP_BUILD=false
NPM_CACHE_DIR=""

usage() {
  cat <<'EOF'
Usage: pack-local-tarballs.sh [options]

Options:
  --output-dir DIR    Directory to write tarballs into
  --skip-build        Reuse existing packages/core/dist without rebuilding
  -h, --help          Show help
EOF
}

while (($#)); do
  case "$1" in
    --output-dir) OUTPUT_DIR="${2:-}"; shift 2 ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found in PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR"/open-agent-sdk*.tgz "$OUTPUT_DIR"/open-agent-sdk-cli*.tgz
NPM_CACHE_DIR="${OUTPUT_DIR}/.npm-cache"
mkdir -p "$NPM_CACHE_DIR"

if [ "$SKIP_BUILD" != true ]; then
  echo "=== Building core package ==="
  (
    cd "$REPO_ROOT/packages/core"
    bun run build
  )
fi

echo "=== Packing local tarballs ==="
CORE_TARBALL="$(
  cd "$REPO_ROOT/packages/core"
  NPM_CONFIG_CACHE="$NPM_CACHE_DIR" npm pack --silent --pack-destination "$OUTPUT_DIR"
)"
CLI_TARBALL="$(
  cd "$REPO_ROOT/packages/cli"
  NPM_CONFIG_CACHE="$NPM_CACHE_DIR" npm pack --silent --pack-destination "$OUTPUT_DIR"
)"

cp "$OUTPUT_DIR/$CORE_TARBALL" "$OUTPUT_DIR/open-agent-sdk.tgz"
cp "$OUTPUT_DIR/$CLI_TARBALL" "$OUTPUT_DIR/open-agent-sdk-cli.tgz"

echo "Output dir: $OUTPUT_DIR"
echo "Core tarball: $CORE_TARBALL"
echo "CLI tarball: $CLI_TARBALL"
echo "Stable aliases:"
echo "  - open-agent-sdk.tgz"
echo "  - open-agent-sdk-cli.tgz"
