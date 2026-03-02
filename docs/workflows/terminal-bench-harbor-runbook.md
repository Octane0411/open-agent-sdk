# Terminal-Bench Harbor Runbook

This document summarizes the reproducible way to run `terminal-bench` with Harbor in this repo, including known pitfalls seen during debugging on March 2, 2026.

## 1. Prerequisites

- Docker runtime available (for example: Colima running)
- Harbor installed (`python >= 3.12`)
- Open Agent SDK Harbor agent symlinked into Harbor installed agents

Example:

```bash
pip install harbor
ln -sf "$(pwd)/benchmark/terminalbench/open_agent_sdk_harbor/agent.py" \
  "$(python -c 'import harbor; print(harbor.__path__[0])')/agents/installed/open_agent_sdk.py"
```

## 2. Load Environment Variables

Use the repository `.env` as the source of truth:

```bash
set -a
source .env
set +a
```

Required for MiniMax Anthropic-compatible endpoint:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL` (for example `https://api.minimaxi.com/anthropic/v1`)

If these are empty, `command-0` fails quickly with invalid URL/provider errors.

## 3. Proxy Handling (Important)

Use proxy settings for host tooling only if needed, but run Harbor process with proxy vars removed to avoid container networking issues with local `127.0.0.1` proxies.

Recommended pattern:

```bash
env -u https_proxy -u http_proxy -u all_proxy \
    -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY \
    harbor run ...
```

## 4. Recommended Single-Task Validation Command

Use `fix-git` as a quick real-task smoke test:

```bash
env -u https_proxy -u http_proxy -u all_proxy \
    -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY \
harbor run -d terminal-bench@2.0 \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model MiniMax-M2.5 \
  --ae ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --ae ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL" \
  --timeout-multiplier 3.0 \
  --task-name "fix-git" \
  --override-memory-mb 4096 \
  --no-delete
```

Notes:

- `--override-memory-mb 4096` is for debugging stability and may not be leaderboard-valid.
- `--no-delete` keeps containers for postmortem.

## 5. Known Failure Modes and Meanings

- `return code 137`: container killed by OOM.
- `TypeError: fetch() URL is invalid` in `agent/command-0/stdout.txt`: missing or empty `ANTHROPIC_BASE_URL`.
- `reward=0` with no exception: run completed but task solution incorrect (not an infra failure).

## 6. Quick Post-Run Checks

After each run, inspect:

```bash
latest="$(ls -1dt jobs/* | head -n 1)"
find "$latest" -maxdepth 3 -type f | rg 'result.json|return-code.txt|stdout.txt|trial.log'
```

Key files:

- `jobs/<run>/<trial>/result.json`
- `jobs/<run>/<trial>/agent/command-0/return-code.txt`
- `jobs/<run>/<trial>/agent/command-0/stdout.txt`
- `jobs/<run>/<trial>/verifier/test-stdout.txt`

## 7. OOM Confirmation Checklist (When 137 Happens)

With `--no-delete`, inspect cgroup metrics in the container:

```bash
docker exec <container> sh -lc 'cat /sys/fs/cgroup/memory.max; cat /sys/fs/cgroup/memory.peak; cat /sys/fs/cgroup/memory.events'
```

OOM evidence:

- `memory.peak` close to `memory.max`
- `memory.events` has `oom_kill > 0`

## 8. Current Practical Baseline

- For local debugging: use `4GB` memory override + proxy unsetting pattern above.
- Ensure `.env` is sourced before running Harbor.
- Distinguish infra failures (`137`, invalid URL) from task-quality failures (`reward=0`).
