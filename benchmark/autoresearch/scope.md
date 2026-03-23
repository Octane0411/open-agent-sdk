# Autoresearch Scope

Defines what the optimizing agent can and cannot modify.

## Modifiable Files

### 1. System Prompt & CLI Configuration
- `packages/cli/src/index.ts`
  - `getSystemPrompt()` — wording, structure, guidelines
  - `maxTurns` default value
  - `allowedTools` list
  - Any new CLI flags that feed into `prompt()` options

### 2. Tool Descriptions & Behavior
- `packages/core/src/tools/bash.ts` — description, parameter descriptions, output formatting
- `packages/core/src/tools/read.ts` — description, parameter descriptions, output formatting
- `packages/core/src/tools/write.ts` — description, parameter descriptions, output formatting
- `packages/core/src/tools/edit.ts` — description, parameter descriptions, output formatting
- `packages/core/src/tools/glob.ts` — description, parameter descriptions, output formatting
- `packages/core/src/tools/grep.ts` — description, parameter descriptions, output formatting

What you can change in tool files:
- `name` — tool name as seen by the LLM
- `description` — how the tool is described to the LLM
- `parameters.properties.*.description` — parameter-level descriptions
- Output formatting (how results are presented back to the LLM)
- Output truncation thresholds (e.g., `MAX_CAPTURE_CHARS`)

What you should NOT change in tool files:
- Core execution logic (e.g., how `spawn()` works in bash.ts)
- Security boundaries (e.g., abort handling, timeout enforcement)
- TypeScript interfaces / public API signatures

### 3. ReAct Loop & Context Management
- `packages/core/src/agent/react-loop.ts`
  - Context window management / compaction strategy
  - Message formatting before sending to LLM
  - Turn counting and termination logic
  - How tool results are fed back into the conversation

What you should NOT change in react-loop.ts:
- Provider interface calls
- Hook/permission system integration
- Session persistence logic

## Read-Only Files (DO NOT MODIFY)

### Evaluation Infrastructure
- `benchmark/` — all evaluation scripts, adapters, task definitions
- `benchmark/autoresearch/` — this optimization environment itself

### Core Infrastructure
- `packages/core/src/providers/` — LLM provider adapters
- `packages/core/src/types/` — TypeScript type definitions
- `packages/core/src/session/` — session storage
- `packages/core/src/permissions/` — permission system
- `packages/core/src/hooks/` — hooks framework
- `packages/core/src/skills/` — skill loading

### Tests
- `packages/core/tests/` — must pass, but do not modify

## Constraints

1. `bun test` must pass after every modification — this is the safety net
2. Do not add new npm dependencies
3. Do not change public API signatures (`prompt()` function, exported types)
4. Do not break the Harbor adapter contract (CLI must accept the same flags)
5. One variable per experiment — change only one thing at a time for clear attribution
6. Complexity budget — a change that adds significant complexity must show proportionally large improvement
