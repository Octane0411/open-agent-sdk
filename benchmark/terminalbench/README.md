# Terminal-Bench Run Guide

This directory contains local Terminal-Bench experiments and Harbor adapter code for Open Agent SDK.

## Goal

Run `terminal-bench@2.0` reliably with Harbor, then inspect reproducible artifacts under `jobs/`.

## Directory Layout

- `benchmark/terminalbench/open_agent_sdk_harbor/`: Harbor agent adapter and install scripts.
- `benchmark/terminalbench/test-tasks/`: local hello-world style task.
- `benchmark/terminalbench/jobs/`: historical local benchmark outputs.
- `docs/workflows/terminal-bench-harbor-runbook.md`: extended troubleshooting notes.

## Setup

From repo root:

```bash
pip install harbor

ln -sf "$(pwd)/benchmark/terminalbench/open_agent_sdk_harbor/agent.py" \
  "$(python -c 'import harbor; print(harbor.__path__[0])')/agents/installed/open_agent_sdk.py"

set -a
source .env
set +a
```

Required env for MiniMax Anthropic-compatible mode:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`

## Recommended Smoke Test (Docker)

```bash
env -u https_proxy -u http_proxy -u all_proxy \
    -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY \
harbor run -d terminal-bench@2.0 \
  --env docker \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model MiniMax-M2.5 \
  --ae ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --ae ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL" \
  --ae OAS_HARBOR_SAVE_TRAJECTORY=1 \
  --task-name "fix-git" \
  --n-concurrent 1 \
  --timeout-multiplier 3.0 \
  --override-memory-mb 4096
```

Notes:

- `--override-memory-mb 4096` is for debugging stability, not leaderboard submission.
- Keep proxy vars unset for Harbor run if host proxy is `127.0.0.1`.

## Batch Run (Docker)

```bash
env -u https_proxy -u http_proxy -u all_proxy \
    -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY \
harbor run -d terminal-bench@2.0 \
  --env docker \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model MiniMax-M2.5 \
  --ae ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --ae ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL" \
  --n-concurrent 4
```

## Where to Check Results

```bash
latest="$(ls -1dt jobs/* | head -n 1)"
find "$latest" -maxdepth 5 -type f | \
  grep -E 'result.json|return-code.txt|stdout.txt|stderr.txt|trial.log|open-agent-transcript'
```

Key files:

- `jobs/<run>/result.json`
- `jobs/<run>/<trial>/result.json`
- `jobs/<run>/<trial>/agent/setup/stdout.txt`
- `jobs/<run>/<trial>/agent/command-0/return-code.txt`
- `jobs/<run>/<trial>/agent/command-0/stderr.txt`
- `jobs/<run>/<trial>/agent/open-agent-transcript/sessions-index.json`
- `jobs/<run>/<trial>/agent/open-agent-transcript/*.jsonl`

## Known Pitfalls

- `return code 137`: container OOM kill. Increase memory only for debugging.
- Setup fails while installing CLI: adapter install script now has npm registry fallback (`npmjs` then `npmmirror`).
- MiniMax region mismatch:
  - `api.minimaxi.com` and `api.minimax.io` are different endpoint domains.
  - A key valid on one region endpoint may fail on the other.
- Daytona + MiniMax currently observed `ECONNRESET` from sandbox egress to MiniMax endpoints in this environment.

## Daytona (Current Status)

Daytona environment can start tasks, but MiniMax calls from sandbox showed repeated `ECONNRESET` during this debugging cycle. Use Docker for stable MiniMax runs until daytona network path is fixed.

## Related Docs

- `benchmark/terminalbench/open_agent_sdk_harbor/README.md`
- `docs/workflows/terminal-bench-harbor-runbook.md`
- `docs/research/harbor-137-debugging-handoff.md`
