# Open Agent SDK - Claude Code Project Context

## Quick Navigation

| Document | Content |
|----------|---------|
| [Architecture Decision Records](docs/adr/) | Technical decision background |
| [Requirements](REQUIREMENTS.md) | Feature requirements, version planning |
| [Gap Analysis](docs/gap-analysis.md) | Comparison with Claude Agent SDK |

## Project Structure

```
open-agent-sdk/
├── CLAUDE.md              # This file: project context entry
├── README.md              # Project documentation
├── package.json           # Bun workspaces configuration
├── REQUIREMENTS.md        # Product requirements
└── packages/
    └── core/              # Core SDK
        ├── src/
        │   ├── index.ts      # Public API
        │   ├── types/        # Message, tool types
        │   ├── tools/        # Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch/Task
        │   ├── providers/    # OpenAI/Google providers
        │   ├── agent/        # ReAct loop, subagent system
        │   ├── session/      # Session management
        │   ├── permissions/  # Permission system
        │   ├── skills/       # Skill system (auto-load from ~/.claude/skills/)
        │   └── hooks/        # Hooks framework
        └── tests/
```

## Architecture Decisions

The project uses a **core + extensions** packaging strategy. See [ADR 001](docs/adr/001-monorepo-structure.md) for details.

## Tech Stack

- **Language**: TypeScript 5.x (strict mode)
- **Runtime**: Bun
- **Testing**: Bun built-in test framework
- **Core Dependencies**: `ai` (Vercel AI SDK), `@ai-sdk/google`, `zod`

## Common Commands

```bash
bun install          # Install dependencies
bun test             # Run tests
bun test --coverage  # Run tests with coverage
bun run build        # Build
```

## Coding Standards

- **TDD**: Write tests first, then implementation
- **Test Directory**: Test files go in `tests/` directory (sibling to `src/`), e.g., `tests/permissions/manager.test.ts`
- **Coverage**: > 80%
- **Types**: All public APIs must have complete types
- **Structure**: `types/` (types), `tools/` (tools), `providers/` (providers), `agent/` (core logic), `session/` (session management), `permissions/` (permission system), `hooks/` (hooks framework)

## Testing with LLM API

When running tests that require LLM API access:
- Load environment variables from the `.env` file (contains API keys and proxy configurations)
- This applies to running specific tests or the full test suite

```bash
# Example: Run tests with env variables
env $(cat /path/to/.env | xargs) bun test

# Example: Run specific test file
env $(cat /path/to/.env | xargs) bun test tests/providers/openai.test.ts
```

## Related Documents

- [Requirements](REQUIREMENTS.md) - Complete feature requirements
- [Claude Agent SDK Reference](docs/dev/claude-agent-sdk-ts.md) - Reference product API
- [Claude Agent SDK V2 Preview](docs/dev/claude-agent-sdk-ts-v2/) - V2 interface design reference
- [Gap Analysis](docs/gap-analysis.md) - Feature gap analysis with Claude Agent SDK

## Provider Compatibility Notes

1. **Google Provider (Gemini)**
   - Works correctly with Google native API
   - Default model: `gemini-3-flash-preview`

2. **OpenAI Provider with Gemini OpenAI-Compatible Endpoint**
   - **Status**: Partially compatible
   - **Issue**: Gemini's OpenAI-compatible endpoint returns tool calls without the `index` field required by Vercel AI SDK
   - **Workaround**: Use Google Provider for Gemini models

3. **OpenAI Provider with Other Compatible Endpoints**
   - Should work with DeepSeek, OpenRouter, etc.
   - Automatically uses Chat Completions API when `baseURL` is configured
