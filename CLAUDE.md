# Open Agent SDK - Claude Code Context

TypeScript SDK for building AI agents with tool use, ReAct loop, and multi-provider support.

## Navigation

| Document | Purpose |
|----------|---------|
| [Requirements](REQUIREMENTS.md) | Feature requirements |
| [Gap Analysis](docs/gap-analysis.md) | vs Claude Agent SDK |
| [ADRs](docs/adr/) | Architecture decisions |
| [Git Workflow](docs/workflows/git-workflow.md) | Worktree & PR rules |
| [Testing Guide](docs/workflows/testing-guide.md) | TDD & env setup |

## Project Structure

```
open-agent-sdk/
├── CLAUDE.md              # This file: Claude Code context
├── package.json           # Bun workspaces configuration
├── REQUIREMENTS.md        # Product requirements
└── packages/
    └── core/              # Core SDK package
        ├── src/
        │   ├── index.ts      # Public API exports
        │   ├── types/        # Message, tool, provider types
        │   ├── tools/        # Tool implementations
        │   ├── providers/    # LLM provider adapters
        │   ├── agent/        # ReAct loop, subagent system
        │   ├── session/      # Session management
        │   ├── permissions/  # Permission system
        │   ├── skills/       # Skill loading system
        │   └── hooks/        # Hooks framework
        └── tests/            # Test files (mirror src/ structure)
```

## Tech Stack

- TypeScript 5.x (strict), Bun runtime
- Testing: Bun test framework
- Dependencies: `ai` (Vercel AI SDK), `@ai-sdk/google`, `zod`

## Decision Rules

### TDD
- **Use TDD for**: Core agent logic, tools, providers, permissions
- **Tests after OK for**: Utils, docs, config, obvious fixes

### Worktrees
- **Recommended for**: Features, refactoring, experiments
- **Optional for**: Typo fixes, single-line fixes, hotfixes
- See [Git Workflow](docs/workflows/git-workflow.md)

### Commits
- Format: `type(scope): description` (Conventional Commits)
- Frequency: After each logical unit
- Language: English only
- Incremental: Break features into multiple commits

## Standards

### Structure
- Tests: `tests/` (mirrors `src/`), e.g., `src/foo.ts` → `tests/foo.test.ts`
- Directories: `types/`, `tools/`, `providers/`, `agent/`, `session/`, `permissions/`, `skills/`, `hooks/`

### Types
- Public APIs: Complete type definitions required
- Strict mode enforced

### Coverage
- Target: >80% overall, >90% core logic
- Integration tests need `.env` with API keys

## Testing with LLM APIs

Run tests with `.env` variables:
```bash
env $(cat .env | xargs) bun test
```

## Provider Compatibility

### Google Provider (Gemini)
- ✅ Fully compatible with Google native API
- Default model: `gemini-3-flash-preview`

### OpenAI Provider
- ✅ Works with OpenAI API
- ✅ Compatible with DeepSeek, OpenRouter (via `baseURL`)
- ⚠️ Gemini's OpenAI-compatible endpoint has limitations (missing `index` field in tool calls)
  - **Workaround**: Use Google Provider for Gemini models

## Related References

- [Claude Agent SDK TypeScript](docs/dev/claude-agent-sdk-ts.md) - Reference product API
- [Claude Agent SDK V2 Preview](docs/dev/claude-agent-sdk-ts-v2/) - V2 interface design
