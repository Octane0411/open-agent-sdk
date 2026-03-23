"""
open-agent-sdk Harbor Agent Adapter

Implements Harbor's BaseInstalledAgent interface to run open-agent-sdk
on terminal-bench and other Harbor benchmarks.

Usage:
    # Standard providers (Gemini)
    harbor run -d terminal-bench@2.0 \
      --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
      --model gemini-2.0-flash \
      --ae GEMINI_API_KEY=$GEMINI_API_KEY

    # MiniMax (Anthropic compatible endpoint)
    harbor run -d terminal-bench@2.0 \
      --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
      --model MiniMax-M2.5 \
      --ae ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
      --ae ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL

    # Claude
    harbor run -d terminal-bench@2.0 \
      --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
      --model claude-sonnet-4 \
      --ae ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY

    # Codex / GPT-5.4 (via OAuth credentials JSON)
    harbor run -d terminal-bench@2.0 \
      --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
      --model gpt-5.4 \
      --ae OAS_CODEX_OAUTH_JSON='{"access":"...","refresh":"...","expires":...}'

    # Codex / GPT-5.4 (via API key)
    harbor run -d terminal-bench@2.0 \
      --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
      --model gpt-5.4 \
      --ae OAS_CODEX_API_KEY=$OAS_CODEX_API_KEY

Note: Environment variables MUST be passed via --ae flag for Docker container access.
"""

import os
from pathlib import Path

from harbor.agents.installed.base import BaseInstalledAgent, ExecInput
from harbor.models.agent.context import AgentContext


# CLI command (installed globally by install script)
CLI_COMMAND = "/usr/local/bin/bun /root/.bun/bin/oas"


def is_minimax_model(model_name: str) -> bool:
    """Check if the model is a MiniMax model."""
    return model_name.lower().startswith("minimax")


def is_codex_model(model_name: str) -> bool:
    """Check if the model should use the Codex provider.

    Returns True if:
    - Model name starts with 'codex', OR
    - Codex auth credentials are available via env vars (OAS_CODEX_API_KEY or OAS_CODEX_OAUTH_JSON),
      which indicates the user wants to use the Codex/ChatGPT backend for this model.
    """
    if model_name.lower().startswith("codex"):
        return True
    # If codex auth is explicitly provided, treat any model as codex
    return bool(os.environ.get("OAS_CODEX_API_KEY") or os.environ.get("OAS_CODEX_OAUTH_JSON"))


def get_required_env_var_names(model_name: str) -> list[str]:
    """
    Determine required environment variable names based on model name.
    Returns a list of environment variable names that should be passed to the container.

    Note: This function does NOT check if the variables exist in the host environment.
    Harbor will pass them via --ae flag, and they will be available in the container.
    """
    model_lower = model_name.lower()

    # MiniMax uses Anthropic compatible endpoint
    if is_minimax_model(model_name):
        return ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]

    # Codex uses its own auth (API key or OAuth)
    if is_codex_model(model_name):
        return ["OAS_CODEX_API_KEY", "OAS_CODEX_OAUTH_JSON"]

    # Standard providers
    if model_lower.startswith("gemini") or model_lower.startswith("google"):
        return ["GEMINI_API_KEY"]
    elif model_lower.startswith("claude"):
        return ["ANTHROPIC_API_KEY"]
    elif model_lower.startswith("gpt") or model_lower.startswith("openai"):
        return ["OPENAI_API_KEY"]
    else:
        # Default to Gemini for unknown models
        return ["GEMINI_API_KEY"]


class OpenAgentSDKAgent(BaseInstalledAgent):
    """
    Harbor adapter for open-agent-sdk.
    Calls the `oas` CLI in headless mode (-p flag).
    """

    @staticmethod
    def name() -> str:
        return "open-agent-sdk"

    def version(self) -> str | None:
        return "0.1.0-alpha.1"

    @property
    def _install_agent_template_path(self) -> Path:
        """Path to the install script template."""
        return Path(__file__).parent / "install-open-agent-sdk.sh.j2"

    def _setup_env(self) -> dict[str, str]:
        """Pass mirror/local-install env vars to install script."""
        env = super()._setup_env()
        for key in ("OAS_GITHUB_MIRROR", "OAS_NPM_REGISTRIES", "OAS_LOCAL_TARBALL_URL"):
            val = os.environ.get(key)
            if val:
                env[key] = val
        return env

    def create_run_agent_commands(self, instruction: str) -> list[ExecInput]:
        model = self.model_name or "gemini-2.0-flash"

        # Build CLI command with provider-specific flags.
        # IMPORTANT:
        # - Persist sessions by default for postmortem debugging in Harbor jobs.
        # - Keep --no-persist only when both transcript and trajectory export are off.
        # - While the CLI canary may lag behind local code, keep best-effort sync
        #   from /root/.open-agent/sessions to /logs/agent/open-agent-transcript.
        cli_flags = f"--model {model} --output-format json --cleanup-background never"
        save_trajectory = os.environ.get("OAS_HARBOR_SAVE_TRAJECTORY") == "1"
        save_transcript = os.environ.get("OAS_HARBOR_SAVE_TRANSCRIPT", "1") == "1"
        if save_trajectory:
            cli_flags += " --save-trajectory /logs/agent/open-agent-transcript/trajectory.json"
        if save_transcript:
            cli_flags += " --session-dir /logs/agent/open-agent-transcript"
        elif not save_trajectory:
            cli_flags += " --no-persist"
        if is_minimax_model(model):
            cli_flags = f'--provider anthropic --base-url "$ANTHROPIC_BASE_URL" {cli_flags}'
        elif is_codex_model(model):
            # Codex provider with API key or OAuth credentials.
            # OAuth JSON is written to a temp file to avoid shell quoting issues
            # (JSON contains double quotes that break $VAR expansion in shell).
            codex_auth_flags = '--provider codex'
            if os.environ.get("OAS_CODEX_API_KEY"):
                codex_auth_flags += ' --codex-api-key "$OAS_CODEX_API_KEY"'
            elif os.environ.get("OAS_CODEX_OAUTH_JSON"):
                codex_auth_flags += ' --codex-auth-path /tmp/.oas-codex-creds.json'
            cli_flags = f'{codex_auth_flags} {cli_flags}'

        # Use heredoc to safely pass instruction without escaping
        # This handles multi-line text and special characters correctly
        # Unset proxy variables to avoid connection issues in Docker containers
        # (containers can't access host's 127.0.0.1 proxy)
        # Write OAuth JSON to credentials file using heredoc (avoids shell quoting issues).
        # Also unset OAS_CODEX_OAUTH_JSON so the CLI doesn't try to parse it from env.
        codex_creds_setup = ""
        oauth_json = os.environ.get("OAS_CODEX_OAUTH_JSON", "").strip()
        if is_codex_model(model) and oauth_json:
            # Wrap in provider map format: {"openai-codex": <credentials>}
            import json
            try:
                creds = json.loads(oauth_json)
                # If already wrapped, use as-is; otherwise wrap it
                if "openai-codex" not in creds:
                    creds = {"openai-codex": creds}
                wrapped_json = json.dumps(creds)
            except json.JSONDecodeError:
                wrapped_json = oauth_json
            codex_creds_setup = f"""cat > /tmp/.oas-codex-creds.json <<'CREDS_EOF'
{wrapped_json}
CREDS_EOF
unset OAS_CODEX_OAUTH_JSON && \\
"""

        command = f"""export PATH="/root/.bun/bin:$HOME/.bun/bin:$PATH" && \\
unset https_proxy http_proxy all_proxy HTTPS_PROXY HTTP_PROXY ALL_PROXY && \\
{codex_creds_setup}WORKDIR="/workspace" && \\
if [ ! -d "$WORKDIR" ]; then \\
  if [ -d /app/personal-site ]; then WORKDIR="/app/personal-site"; \\
  elif [ -d /app ]; then WORKDIR="/app"; \\
  else WORKDIR="$(pwd)"; fi; \\
fi && \\
mkdir -p /logs/agent/open-agent-transcript && \\
(while true; do cp -f /root/.open-agent/sessions/sessions-index.json /logs/agent/open-agent-transcript/ 2>/dev/null || true; cp -f /root/.open-agent/sessions/*.jsonl /logs/agent/open-agent-transcript/ 2>/dev/null || true; sleep 2; done) & SYNC_PID=$! && \\
{CLI_COMMAND} -p "$(cat <<'INSTRUCTION_EOF'
{instruction}
INSTRUCTION_EOF
)" --cwd "$WORKDIR" {cli_flags}; RC=$?; \\
kill "$SYNC_PID" 2>/dev/null || true; \\
cp -f /root/.open-agent/sessions/sessions-index.json /logs/agent/open-agent-transcript/ 2>/dev/null || true; \\
cp -f /root/.open-agent/sessions/*.jsonl /logs/agent/open-agent-transcript/ 2>/dev/null || true; \\
exit $RC"""

        return [
            ExecInput(
                command=command,
                timeout_sec=600,
            )
        ]

    def populate_context_post_run(self, context: AgentContext) -> None:
        # Harbor reads stdout from create_run_agent_commands automatically
        pass
