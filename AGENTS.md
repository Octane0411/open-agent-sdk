# Open Agent SDK - Codex Agent Guide

This file defines how Codex should work in this repository.

## Goal

Build and maintain a TypeScript SDK for AI agents with tool use, ReAct loop, and multi-provider support.

## Source Of Truth

- Product requirements: `REQUIREMENTS.md`
- Architecture decisions: `docs/adr/`
- Gap analysis: `docs/gap-analysis.md`
- Git workflow: `docs/workflows/git-workflow.md`
- Testing guide: `docs/workflows/testing-guide.md`

## Repository Layout

- Root workspace: Bun workspaces monorepo
- Core package: `packages/core/`
- Source code: `packages/core/src/`
- Tests: `packages/core/tests/` (mirror `src/` structure)

## Runtime And Language

- Runtime: Bun >= 1.0.0
- Language: TypeScript 5.x, strict mode

## Commands

- Install deps: `bun install`
- Build: `bun run build`
- Test: `bun test`
- Coverage: `bun test --coverage`
- Type check: `bun run typecheck`

For integration tests with real LLM APIs:

```bash
env $(cat .env | xargs) bun test
```

## Engineering Rules

### TDD Policy

Use tests-first for:
- Core agent logic (ReAct loop, tool execution, subagent spawning)
- Tool implementations
- Provider integrations
- Permission system

Tests-after is acceptable for:
- Docs changes
- Config updates
- Simple utilities
- Obvious low-risk fixes

### Quality Bar

- Keep public APIs fully typed
- Preserve backward compatibility unless explicitly requested
- Add or update tests for behavior changes
- Keep changes minimal and focused (one logical change per PR)

### Git And PR

- Use Conventional Commits: `type(scope): description`
- PR title/description/comments in English
- Never push new changes to a branch whose PR is already merged
- If branch is merged, create a new branch from latest `main`

## Codex-Specific Operating Rules

- Prefer `rg` for search (`rg --files` for file listing)
- Read before edit; avoid broad refactors unless required
- Do not run destructive git commands unless explicitly requested
- Do not revert unrelated local changes
- Validate with targeted tests first, then broader tests if needed
- Summarize exact files changed and verification commands run

## Notes For Multi-Agent Tooling

This repository may still include `CLAUDE.md` for Claude Code context. Keep both files aligned on core engineering rules. For Codex, `AGENTS.md` is the primary instruction entry.
