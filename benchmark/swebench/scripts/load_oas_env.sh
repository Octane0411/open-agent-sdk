#!/usr/bin/env bash

resolve_primary_repo_root() {
  local repo_root="$1"
  if [[ "${repo_root}" == *"/.worktrees/"* ]]; then
    printf "%s\n" "${repo_root%%/.worktrees/*}"
  else
    printf "%s\n" "${repo_root}"
  fi
}

load_env_file_if_exists() {
  local env_file="$1"
  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "${env_file}"
    set +a
    export SWEBENCH_ENV_FILE="${env_file}"
    return 0
  fi
  return 1
}

normalize_oas_env() {
  if [[ -z "${OAS_PROVIDER:-}" ]]; then
    if [[ -n "${OPENAI_MODEL:-}${OPENAI_API_KEY:-}" ]]; then
      export OAS_PROVIDER="openai"
    elif [[ -n "${ANTHROPIC_MODEL:-}${ANTHROPIC_API_KEY:-}" ]]; then
      export OAS_PROVIDER="anthropic"
    elif [[ -n "${GOOGLE_MODEL:-}${GOOGLE_API_KEY:-}${GEMINI_MODEL:-}${GEMINI_API_KEY:-}" ]]; then
      export OAS_PROVIDER="google"
    fi
  fi

  case "${OAS_PROVIDER:-}" in
    openai)
      if [[ -z "${OAS_MODEL:-}" && -n "${OPENAI_MODEL:-}" ]]; then
        export OAS_MODEL="${OPENAI_MODEL}"
      fi
      if [[ -z "${OAS_BASE_URL:-}" && -n "${OPENAI_BASE_URL:-}" ]]; then
        export OAS_BASE_URL="${OPENAI_BASE_URL}"
      fi
      ;;
    anthropic)
      if [[ -z "${OAS_MODEL:-}" && -n "${ANTHROPIC_MODEL:-}" ]]; then
        export OAS_MODEL="${ANTHROPIC_MODEL}"
      fi
      if [[ -z "${OAS_BASE_URL:-}" && -n "${ANTHROPIC_BASE_URL:-}" ]]; then
        export OAS_BASE_URL="${ANTHROPIC_BASE_URL}"
      fi
      ;;
    google)
      if [[ -z "${OAS_MODEL:-}" ]]; then
        if [[ -n "${GOOGLE_MODEL:-}" ]]; then
          export OAS_MODEL="${GOOGLE_MODEL}"
        elif [[ -n "${GEMINI_MODEL:-}" ]]; then
          export OAS_MODEL="${GEMINI_MODEL}"
        fi
      fi
      if [[ -z "${OAS_BASE_URL:-}" ]]; then
        if [[ -n "${GOOGLE_BASE_URL:-}" ]]; then
          export OAS_BASE_URL="${GOOGLE_BASE_URL}"
        elif [[ -n "${GEMINI_BASE_URL:-}" ]]; then
          export OAS_BASE_URL="${GEMINI_BASE_URL}"
        fi
      fi
      ;;
  esac
}

bootstrap_oas_env() {
  local repo_root="$1"
  local primary_repo_root
  primary_repo_root="$(resolve_primary_repo_root "${repo_root}")"

  if [[ -z "${SWEBENCH_SKIP_DOTENV:-}" ]]; then
    if ! load_env_file_if_exists "${primary_repo_root}/.env"; then
      load_env_file_if_exists "${repo_root}/.env" || true
    fi
  fi

  normalize_oas_env
}
