"""
open-agent-sdk Harbor Agent Adapter (Local Development)

This is a standalone variant that installs from local source code instead of npm packages.
Use this for testing before publishing to npm.

Usage:
    # Register agent
    ln -sf $(pwd)/benchmark/terminalbench/harbor/agent_local.py \
      $(python -c "import harbor; print(harbor.__path__[0])")/agents/installed/open_agent_sdk_local.py

    # Run with MiniMax
    export ANTHROPIC_AUTH_TOKEN=your_token
    export ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic/v1
    harbor jobs start \
      --path benchmark/terminalbench/test-tasks/hello-world \
      --agent-import-path "harbor.agents.installed.open_agent_sdk_local:OpenAgentSDKAgentLocal" \
      --model MiniMax-M2.5
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


def get_required_env_vars(model_name: str) -> dict[str, str]:
    """
    Determine required environment variables based on model name.
    Returns a dict of {env_var_name: env_var_value}.
    """
    env_vars = {}
    model_lower = model_name.lower()

    # MiniMax uses Anthropic compatible endpoint with custom auth
    if is_minimax_model(model_name):
        auth_token = os.environ.get("ANTHROPIC_AUTH_TOKEN")
        base_url = os.environ.get("ANTHROPIC_BASE_URL")

        if not auth_token:
            raise ValueError(
                "MiniMax model requires ANTHROPIC_AUTH_TOKEN environment variable. "
                "This is used for Bearer token authentication."
            )
        if not base_url:
            raise ValueError(
                "MiniMax model requires ANTHROPIC_BASE_URL environment variable. "
                "Example: https://api.minimaxi.com/anthropic/v1"
            )

        env_vars["ANTHROPIC_AUTH_TOKEN"] = auth_token
        env_vars["ANTHROPIC_BASE_URL"] = base_url
        return env_vars

    # Standard providers
    if model_lower.startswith("gemini") or model_lower.startswith("google"):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("Gemini model requires GEMINI_API_KEY environment variable.")
        env_vars["GEMINI_API_KEY"] = api_key
    elif model_lower.startswith("claude"):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("Claude model requires ANTHROPIC_API_KEY environment variable.")
        env_vars["ANTHROPIC_API_KEY"] = api_key
    elif model_lower.startswith("gpt") or model_lower.startswith("openai"):
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI model requires OPENAI_API_KEY environment variable.")
        env_vars["OPENAI_API_KEY"] = api_key
    else:
        # Default to Gemini for unknown models
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError(f"Unknown model '{model_name}'. Please set GEMINI_API_KEY for default Gemini provider.")
        env_vars["GEMINI_API_KEY"] = api_key

    return env_vars


class OpenAgentSDKAgentLocal(BaseInstalledAgent):
    """
    Local development variant of OpenAgentSDKAgent.
    Installs from GitHub repository instead of npm.
    """

    @staticmethod
    def name() -> str:
        return "open-agent-sdk-local"

    def version(self) -> str | None:
        return "local-dev"

    @property
    def _install_agent_template_path(self) -> Path:
        """Override to use local installation script."""
        return Path(__file__).parent / "install-open-agent-sdk-local.sh.j2"

    def create_run_agent_commands(self, instruction: str) -> list[ExecInput]:
        model = self.model_name or "gemini-2.0-flash"

        # Get required environment variables
        env_vars = get_required_env_vars(model)

        # Escape instruction for shell
        escaped = instruction.replace('"', '\\"').replace('$', '\\$')

        # Build CLI command with env vars inline (for Daytona compatibility)
        # Daytona uses shlex.quote on env values which breaks shell variable assignment
        env_exports = " && ".join([f'export {k}="{v}"' for k, v in env_vars.items()])

        # Build base command (always use /workspace as cwd for Harbor compatibility)
        cmd_parts = [
            'export PATH="$HOME/.bun/bin:$PATH"',
            env_exports,
            f'{CLI_COMMAND} -p "{escaped}" --model {model} --cwd /workspace --output-format json'
        ]

        # For MiniMax, add --provider and --base-url flags
        if is_minimax_model(model) and "ANTHROPIC_BASE_URL" in env_vars:
            base_url = env_vars["ANTHROPIC_BASE_URL"]
            # Use anthropic provider with custom base URL
            cmd_parts[2] = f'{CLI_COMMAND} --provider anthropic --base-url {base_url} -p "{escaped}" --model {model} --cwd /workspace --output-format json'

        return [
            ExecInput(
                command=" && ".join(cmd_parts),
                timeout_sec=600,
            )
        ]

    def populate_context_post_run(self, context: AgentContext) -> None:
        # Harbor reads stdout from create_run_agent_commands automatically
        pass
