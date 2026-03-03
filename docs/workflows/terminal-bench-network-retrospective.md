# Terminal-Bench Network Retrospective (Colima + Harbor)

## Scope

This note summarizes non-code changes and operational findings from recent `terminal-bench` runs with Harbor in this workspace.

## Non-Code Changes Applied

### 1) Colima network baseline hardening

File touched outside repo:

- `~/.colima/default/colima.yaml`

Key changes:

- Set `docker.ipv6: false`
- Added `provision` scripts to:
  - disable IPv6 sysctls
  - remove injected proxy block from `/etc/environment`
  - preserve a clean PATH entry
  - attempt stable DNS setup for VM startup

### 2) Colima lifecycle reset and verification

Ran `colima stop/start/restart`, then verified inside VM:

- `/etc/environment` no longer contains global proxy variables
- IPv6 effectively disabled (`net.ipv6.conf.*.disable_ipv6 = 1`)
- DNS/network checks to `github.com` and `bun.sh` succeed

### 3) Harbor runs started with proxy vars removed

Used a no-proxy launch pattern:

- `env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY harbor run ...`

Purpose:

- avoid host global proxy/TUN leakage into task containers

### 4) In-container runtime diagnosis (no app code changes)

Used runtime inspection during trials:

- process tree checks (`docker exec ... /proc/.../cmdline`)
- install stage checks (`apt-get`, `bun.sh`, `bun add`)
- transcript/log checks under `/logs/agent/open-agent-transcript`
- direct connectivity probes with IPv4 (`curl -4`) to:
  - `api.minimaxi.com`
  - `github.com`
  - `bun.sh`

## What Actually Improved

- Failures moved from early bootstrap/network errors to later agent/task execution phases.
- `starting environment...` no longer consistently means hard network failure; in many cases it is long install/setup work.
- Model endpoint reachability became stable enough to start agent execution repeatedly.

## What Still Failed in Recent Runs

### `fix-git__umegfmW`

- Status: `CancelledError`
- Cause: manually interrupted run
- Interpretation: not a successful/complete trial

### `configure-git-webserver__d5RYj79`

- Status: `RuntimeError`
- Error: `Command timed out after 600 seconds`
- Interpretation: environment and setup passed, but agent execution exceeded timeout window

## Key Lessons for Terminal-Bench Ops

1. Do not trust spinner phase labels alone.

- `starting environment...` can include lengthy package install and `bun` bootstrap.
- Confirm by checking real container processes.

2. "Bun install success/failure" differences are often path-dependent, not deterministic.

- DNS/proxy/IPv6 state and mirror path can vary per run and per task image.

3. Host proxy/TUN settings can destabilize Docker-in-Colima runs.

- Prefer explicit no-proxy run env for benchmark reproducibility.

4. Disabling IPv6 reduced intermittent networking weirdness in this setup.

- Not a universal fix, but effective in this environment.

5. Ground truth is `jobs/*/result.json`.

- Final success/failure must be read from result files, not live console impressions.

## Suggested Run Checklist

Before run:

- Verify Colima is up and healthy
- Confirm no unwanted proxy vars in VM environment
- Confirm DNS and outbound HTTPS from VM/container
- Launch Harbor with proxy vars unset

During run:

- If spinner appears stalled, inspect container process state first
- Distinguish install-stage delay vs actual deadlock

After run:

- Read `jobs/<run>/result.json`
- Check per-trial `result.json` for `exception_type`, timeout stage, and whether verifier ran

## Minimal Command Snippets

```bash
# No-proxy Harbor launch pattern
env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  harbor run -d terminal-bench@2.0 --env docker ...
```

```bash
# Container process probe
docker exec <container> sh -lc 'for p in /proc/[0-9]*; do cmd=$(tr "\0" " " < "$p/cmdline" 2>/dev/null); [ -n "$cmd" ] && echo "$cmd"; done'
```

```bash
# IPv4 connectivity probe inside container
docker exec <container> sh -lc 'curl -4 -I --connect-timeout 8 --max-time 20 https://github.com'
```
