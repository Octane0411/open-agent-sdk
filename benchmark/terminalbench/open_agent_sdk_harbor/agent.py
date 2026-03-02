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

Note: Environment variables MUST be passed via --ae flag for Docker container access.
"""

import os
from pathlib import Path

from harbor.agents.installed.base import BaseInstalledAgent, ExecInput
from harbor.models.agent.context import AgentContext


# CLI command (installed globally by install script)
CLI_COMMAND = "oas"


def is_minimax_model(model_name: str) -> bool:
    """Check if the model is a MiniMax model."""
    return model_name.lower().startswith("minimax")


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

    def create_run_agent_commands(self, instruction: str) -> list[ExecInput]:
        model = self.model_name or "gemini-2.0-flash"

        # Build CLI command with provider-specific flags.
        # IMPORTANT:
        # - Default to --no-persist to reduce container I/O and memory usage.
        # - When trajectory export is enabled, persistence must remain enabled,
        #   otherwise storage is disabled and trajectory export is skipped.
        # - Transcript/session artifacts are copied to /logs/agent so Harbor can
        #   pull them back into jobs/* for debugging.
        cli_flags = f"--model {model} --output-format json"
        save_trajectory = os.environ.get("OAS_HARBOR_SAVE_TRAJECTORY") == "1"
        if save_trajectory:
            cli_flags += " --save-trajectory /logs/agent/open-agent-transcript/trajectory.json"
        else:
            cli_flags += " --no-persist"
        if is_minimax_model(model):
            cli_flags = f'--provider anthropic --base-url "$ANTHROPIC_BASE_URL" {cli_flags}'

        # Use heredoc to safely pass instruction without escaping
        # This handles multi-line text and special characters correctly
        # Unset proxy variables to avoid connection issues in Docker containers
        # (containers can't access host's 127.0.0.1 proxy)
        command = f"""export PATH="$HOME/.bun/bin:$PATH" && \\
unset https_proxy http_proxy all_proxy HTTPS_PROXY HTTP_PROXY ALL_PROXY && \\
WORKDIR="/workspace" && \\
if [ ! -d "$WORKDIR" ]; then \\
  if [ -d /app/personal-site ]; then WORKDIR="/app/personal-site"; \\
  elif [ -d /app ]; then WORKDIR="/app"; \\
  else WORKDIR="$(pwd)"; fi; \\
fi && \\
mkdir -p /logs/agent/open-agent-transcript && \\
{CLI_COMMAND} -p "$(cat <<'INSTRUCTION_EOF'
{instruction}
INSTRUCTION_EOF
)" --cwd "$WORKDIR" {cli_flags}; RC=$?; \\
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
