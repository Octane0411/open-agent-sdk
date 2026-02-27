"""
open-agent-sdk Harbor Agent Adapter

Implements Harbor's BaseInstalledAgent interface to run open-agent-sdk
on terminal-bench and other Harbor benchmarks.

Usage:
    # Standard providers
    harbor run -d terminal-bench@2.0 --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" --model gemini-2.0-flash

    # MiniMax (Anthropic compatible endpoint)
    export ANTHROPIC_AUTH_TOKEN=your_token
    export ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic/v1
    harbor run -d terminal-bench@2.0 --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" --model MiniMax-M2.5
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
