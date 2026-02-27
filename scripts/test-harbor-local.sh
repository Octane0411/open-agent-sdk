#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print colored message
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check prerequisites
echo "Checking prerequisites..."

# Check Colima
if ! colima status &> /dev/null; then
    print_error "Colima is not running"
    echo "Please start Colima with: colima start"
    exit 1
fi
print_status "Colima is running"

# Check Docker
if ! docker ps &> /dev/null; then
    print_error "Docker is not available"
    echo "Please ensure Docker CLI is configured to use Colima"
    exit 1
fi
print_status "Docker is available"

# Check Harbor
if ! command -v harbor &> /dev/null; then
    print_error "Harbor is not installed"
    echo "Please install Harbor with: pip install harbor"
    exit 1
fi
print_status "Harbor is installed ($(harbor --version))"

# Check Python version
PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 12 ]); then
    print_error "Python version $PYTHON_VERSION is too old (need >= 3.12)"
    exit 1
fi
print_status "Python $PYTHON_VERSION"

# Check MiniMax API credentials
if [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
    print_error "ANTHROPIC_AUTH_TOKEN is not set"
    echo "Please set MiniMax API credentials:"
    echo "  export ANTHROPIC_AUTH_TOKEN=sk-api-..."
    exit 1
fi

if [ -z "${ANTHROPIC_BASE_URL:-}" ]; then
    print_error "ANTHROPIC_BASE_URL is not set"
    echo "Please set MiniMax API base URL:"
    echo "  export ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic/v1"
    exit 1
fi
print_status "MiniMax API credentials are set"

# Get repository root
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Register agent
echo ""
echo "Registering local development agent..."

HARBOR_AGENTS_DIR=$(python -c "import harbor; print(harbor.__path__[0])")/agents/installed
AGENT_SOURCE="$REPO_ROOT/benchmark/terminalbench/harbor/agent_local.py"
AGENT_TARGET="$HARBOR_AGENTS_DIR/open_agent_sdk_local.py"
TEMPLATE_SOURCE="$REPO_ROOT/benchmark/terminalbench/harbor/install-open-agent-sdk-local.sh.j2"
TEMPLATE_TARGET="$HARBOR_AGENTS_DIR/install-open-agent-sdk-local.sh.j2"

# Create symlinks for both agent and template
ln -sf "$AGENT_SOURCE" "$AGENT_TARGET"
ln -sf "$TEMPLATE_SOURCE" "$TEMPLATE_TARGET"
print_status "Agent registered at $AGENT_TARGET"
print_status "Template registered at $TEMPLATE_TARGET"

# Run test task
echo ""
echo "Running hello-world task with MiniMax-M2.5..."

TASK_PATH="$REPO_ROOT/benchmark/terminalbench/test-tasks/hello-world"

# Run Harbor job
if harbor jobs start \
    --path "$TASK_PATH" \
    --agent-import-path "harbor.agents.installed.open_agent_sdk_local:OpenAgentSDKAgentLocal" \
    --model MiniMax-M2.5; then

    print_status "Task completed successfully"

    # Note: Harbor's output includes the reward in the logs
    echo ""
    echo "Check the Harbor logs above for:"
    echo "  - Installation output (git clone, bun install, bun link)"
    echo "  - CLI execution output"
    echo "  - Verifier output (reward: 1 for success, 0 for failure)"
else
    print_error "Task failed"
    exit 1
fi

echo ""
echo "Test complete! If you see 'reward: 1' in the logs above, the test passed."
