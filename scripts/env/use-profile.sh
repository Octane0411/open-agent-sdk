#!/usr/bin/env bash
# Usage:
#   source scripts/env/use-profile.sh minimax-global
#
# This script is intended to be sourced, not executed.
# It loads .env.base (if present) and .env.profiles/<name>.env.

set -euo pipefail

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Use this script with 'source', e.g.:"
  echo "  source scripts/env/use-profile.sh minimax-global"
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: source scripts/env/use-profile.sh <profile-name>"
  return 1
fi

PROFILE_NAME="$1"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_FILE="${REPO_ROOT}/.env.base"
PROFILE_FILE="${REPO_ROOT}/.env.profiles/${PROFILE_NAME}.env"

if [[ ! -f "${PROFILE_FILE}" ]]; then
  echo "Profile file not found: ${PROFILE_FILE}"
  echo "Available examples:"
  ls -1 "${REPO_ROOT}/.env.profiles/"*.env.example 2>/dev/null || true
  return 1
fi

set -a
if [[ -f "${BASE_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${BASE_FILE}"
fi
# shellcheck disable=SC1090
source "${PROFILE_FILE}"
set +a

echo "Loaded profile: ${PROFILE_NAME}"
