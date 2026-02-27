# Session Storage Gap Analysis: Open Agent SDK vs Claude Code

Reference: [Claude Code Session Storage Research](../../../benchmark/terminalbench/harbor/) and direct inspection of `~/.claude/`.

---

## Current State (after PR #23)

- `FileStorage` writes `.jsonl` files to `~/.open-agent/sessions/{uuid}.jsonl`
- First line: `session_header` (metadata), subsequent lines: `SDKMessage` entries
- `session_id` is now consistent across all message types
- Single LLM execution per `prompt()` call (double-execution bug fixed)

---

## Gap Analysis

### P0 — Data Reliability

| Gap | Claude Code | Us | Risk |
|-----|-------------|-----|------|
| **Real-time append writes** | Each message appended immediately on creation | `save()` rewrites the entire file after stream completes | Agent crash = all messages lost |

Claude Code appends each message to the JSONL file the moment it is generated. Our current `saveToStorage()` is called once at the end of `session.stream()`, meaning a mid-run crash loses the entire conversation.

**Fix:** `FileStorage` should expose an `append(id, message)` method. `Session.stream()` should call `append()` per message instead of `saveToStorage()` at the end.

---

### P1 — Basic Observability

Missing per-message fields that Claude Code stores:

| Field | Stored on | Claude Code | Us |
|-------|-----------|-------------|-----|
| `timestamp` | Every message | ✅ ISO 8601 | ❌ |
| `model` | `assistant` messages | ✅ per message | ❌ session-level only |
| `usage` | `assistant` messages | ✅ `{ inputTokens, outputTokens }` | ❌ global estimate only |
| `stopReason` | `assistant` messages | ✅ `tool_use` / `end_turn` | ❌ |

All of this data is already available in the react-loop at the time messages are created — it just isn't being persisted.

---

### P2 — Engineering Experience

| Gap | Claude Code | Us |
|-----|-------------|-----|
| **Project-grouped directories** | `~/.claude/projects/{encoded-path}/{uuid}.jsonl` | Flat `~/.open-agent/sessions/` |
| **sessions-index.json** | Per-project index with `firstPrompt`, AI summary, `messageCount`, `created`, `modified`, `gitBranch`, `projectPath` | None — listing sessions requires reading every file |

Without an index, tools that want to list/search sessions must read every JSONL file. Without project grouping, sessions from different projects are indistinguishable at a glance.

---

### P3 — Enhanced Features (future)

| Feature | Claude Code | Us |
|---------|-------------|-----|
| AI-generated session summary | ✅ generated on session close | ❌ |
| `parentUuid` message tree | ✅ | ❌ |
| Context fields per message | `gitBranch`, `cwd`, `permissionMode`, `version`, `userType` | ❌ |
| `progress` message type | ✅ tool execution progress | ❌ |
| Tool result cache files | `{sessionId}/tool-results/{id}.txt` | ❌ |
| Global input history | `history.jsonl` across all sessions | ❌ |
| Project-level memory system | `projects/memory/MEMORY.md` | ❌ (skills system is different) |

---

## Implementation Plan

### Iteration 1 — P0: Real-time append writes (PR #24)

- Add `append(id: string, message: SDKMessage): Promise<void>` to `SessionStorage` interface
- Implement in `FileStorage`: write header on first message, then append each subsequent message
- Implement no-op in `InMemoryStorage` (already holds messages in memory)
- Change `Session.stream()` to call `storage.append()` per message instead of `saveToStorage()` at the end
- Keep `saveToStorage()` for session resume (header updates, etc.)
- Update tests

### Iteration 2 — P1: Per-message timestamp, model, usage, stopReason (PR #25)

- Add `timestamp: string` (ISO 8601) to `SDKAssistantMessage` and `SDKUserMessage`
- Add `model: string`, `usage: { input_tokens, output_tokens }`, `stop_reason: string` to `SDKAssistantMessage`
- Propagate these values from react-loop to message creation
- Update ATIF conversion to use real usage data

### Iteration 3 — P2: Project-grouped storage + sessions index (PR #26)

- Change `FileStorage` default path from `~/.open-agent/sessions/` to `~/.open-agent/projects/{encoded-cwd}/`
- Add `sessions-index.json` per project: written on session close, contains `firstPrompt`, `messageCount`, `created`, `modified`, `projectPath`
- Update `list()` to read index first, fall back to directory scan
- Pass `cwd` through to `FileStorage` so it knows which project directory to use
