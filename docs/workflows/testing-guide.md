# Testing Guide

## TDD Decision Rules

### ✅ Use TDD (Tests First) For:

- Core agent logic (ReAct loop, tool execution, subagent spawning)
- New tool implementations
- Provider integrations (API calls, response parsing, retry logic, abort handling)
- Permission system (rule evaluation, inheritance, deny/allow logic)

### ✅ Tests After Implementation OK For:

- Simple utility functions
- Documentation updates
- Configuration changes
- Obvious bug fixes

## Test Organization

**Location**: `tests/` directory (mirrors `src/` structure)
**Naming**: `foo.ts` → `foo.test.ts`

## Integration Tests with LLM APIs

### Environment Variables

Integration tests require `.env` file with API keys:
```bash
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
# Optional proxy
OPENAI_BASE_URL=https://api.openai.com/v1
HTTP_PROXY=http://localhost:7890
```

### Running with Environment

```bash
env $(cat .env | xargs) bun test
```

### Skip Pattern

```typescript
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
describe.skipIf(!hasOpenAIKey)('OpenAI Integration', () => { ... });
```

## Coverage Targets

- **Overall**: > 80%
- **Core Logic**: > 90% (agent loop, tools, providers)
- **Utilities**: > 70%

## CI Behavior

- Integration tests **skipped** in CI (no API keys)
- Only unit tests and mocked tests run
- Coverage reports generated
