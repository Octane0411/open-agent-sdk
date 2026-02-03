# Open Agent SDK - E2E Integration Tests

This directory contains comprehensive end-to-end tests using real API connections to OpenAI and Google Gemini. These tests verify the SDK works correctly in real-world scenarios.

## Prerequisites

### API Keys

You need at least one of the following API keys:

```bash
# OpenAI (optional but recommended)
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini  # optional, defaults to gpt-4o-mini

# Google Gemini (optional)
export GEMINI_API_KEY=AIza...
export GEMINI_MODEL=gemini-2.0-flash  # optional, defaults to gemini-2.0-flash
```

### Using Gemini with OpenAI-Compatible API

If you don't have an OpenAI API key, you can use Gemini's OpenAI-compatible endpoint to run the OpenAI provider tests:

```bash
# Use Gemini API Key with OpenAI-compatible endpoint
export GEMINI_API_KEY=AIza...
export OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
export OPENAI_MODEL=gemini-2.0-flash

# Now you can run OpenAI provider tests using Gemini
bun test tests/e2e/providers/openai.test.ts
```

This works because Gemini provides an OpenAI-compatible API endpoint that accepts the same request format as OpenAI.

### Test Control

```bash
# Skip expensive/long-running tests
export E2E_SKIP_EXPENSIVE=true

# Set custom timeout (default: 30000ms)
export E2E_TIMEOUT=60000
```

## Running Tests

### Run All E2E Tests

```bash
# From the packages/core directory
bun test tests/e2e
```

### Run Specific Provider Tests

```bash
# OpenAI only
OPENAI_API_KEY=xxx bun test tests/e2e/providers/openai.test.ts

# Google only
GEMINI_API_KEY=xxx bun test tests/e2e/providers/google.test.ts
```

### Run Specific Feature Tests

```bash
# Session tests
bun test tests/e2e/features/session.test.ts

# Multi-turn conversation tests
bun test tests/e2e/features/multi-turn.test.ts

# Tool tests
bun test tests/e2e/features/tools.test.ts

# Abort/ cancellation tests
bun test tests/e2e/features/abort.test.ts

# Stream tests
bun test tests/e2e/features/stream.test.ts

# Prompt function tests
bun test tests/e2e/features/prompt.test.ts

# Session persistence tests
bun test tests/e2e/features/session-resume.test.ts
```

## Test Structure

```
tests/e2e/
├── setup.ts                      # Test configuration and utilities
├── providers/
│   ├── openai.test.ts            # OpenAI Provider tests
│   └── google.test.ts            # Google Gemini Provider tests
└── features/
    ├── prompt.test.ts            # prompt() function tests
    ├── session.test.ts           # Session class tests
    ├── session-resume.test.ts    # Session persistence tests
    ├── multi-turn.test.ts        # Multi-turn conversation tests
    ├── tools.test.ts             # Tool integration tests
    ├── abort.test.ts             # AbortController tests
    └── stream.test.ts            # Stream response tests
```

## Test Categories

### Provider Tests (`providers/`)

Test the LLM providers directly with real APIs:

- **Basic Connectivity**: Simple conversation
- **Tool Calling**: Function calling with tools
- **Streaming**: Chunked response handling
- **System Prompt**: Custom system instructions
- **Abort Signal**: Cancellation support
- **Multi-turn**: Context retention
- **Error Handling**: Invalid inputs

### Feature Tests (`features/`)

#### prompt.test.ts
Tests the main `prompt()` function:
- Simple Q&A without tools
- Single tool calls (Bash, Read)
- Multi-tool chains
- maxTurns limiting
- allowedTools filtering
- systemPrompt effects
- Working directory handling

#### session.test.ts
Tests the Session class:
- Creation and properties
- send() and stream() methods
- Context retention across turns
- Tool calls within sessions
- State machine transitions
- Error handling (SessionClosedError, etc.)
- getMessages() history

#### session-resume.test.ts
Tests session persistence:
- FileStorage save/load
- Message history preservation
- Resume and continue conversation
- Multiple independent sessions
- Session metadata integrity
- Session deletion

#### multi-turn.test.ts
Tests complex multi-turn scenarios:
- Continuous Q&A with context
- Multi-turn tool chains
- Long conversation context (10+ turns)
- Complex reasoning chains
- Changing preferences tracking
- Both providers

#### tools.test.ts
Tests each tool individually:
- Read: text files, code files
- Write: new files, project structure
- Edit: modifying existing files
- Bash: shell commands
- Glob: file pattern matching
- Grep: text search
- Tool chains: combinations

#### abort.test.ts
Tests AbortController functionality:
- prompt() abortion
- Session stream abortion
- Tool execution abortion
- Pre-aborted signals
- State after abort
- Recovery after abort

#### stream.test.ts
Tests stream response integrity:
- Message type completeness
- Content accumulation
- Multi-turn streaming
- Tool result streaming
- Stream completion
- Message structure validation

## Cost and Time Considerations

### Model Selection

Tests use cost-effective models by default:
- **OpenAI**: `gpt-4o-mini` (~$0.15/1M tokens)
- **Google**: `gemini-2.0-flash` (free/low-cost tier)

### Timeout Configuration

Default timeout is 30 seconds per test. Adjust with:
```bash
export E2E_TIMEOUT=60000  # 60 seconds
```

### Skipping Tests

If a provider API key is not set, tests for that provider are automatically skipped.

To skip expensive/long tests:
```bash
export E2E_SKIP_EXPENSIVE=true
```

## Troubleshooting

### Tests Time Out

- Increase timeout: `export E2E_TIMEOUT=60000`
- Check internet connection
- Verify API keys are valid

### Rate Limiting

If you hit rate limits:
- Wait a few minutes between test runs
- Use different API keys
- Run tests sequentially (not in parallel)

### API Errors

Common issues:
- **Invalid API key**: Check key format and permissions
- **Model not found**: Verify model name is correct
- **Billing issues**: Check account has available credits

## Writing New E2E Tests

### Template

```typescript
import { describe, test, expect } from 'bun:test';
import { prompt } from '../../../src/index';
import {
  TEST_CONFIG,
  isProviderAvailable,
  skipIfNoProvider,
  getPromptOptions,
  createTempDir,
  cleanupTempDir,
} from '../setup';

describe('My Feature E2E', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('should do something', async () => {
    skipIfNoProvider('openai');

    const result = await prompt(
      'My test prompt',
      getPromptOptions('openai', { cwd: tempDir })
    );

    expect(result.result).toContain('expected');
    expect(result.duration_ms).toBeGreaterThan(0);
  }, TEST_CONFIG.timeout);
});
```

### Best Practices

1. **Use temp directories**: Always use `createTempDir()` for file operations
2. **Clean up**: Always clean up in `afterEach`
3. **Check provider availability**: Use `skipIfNoProvider()` at test start
4. **Set reasonable timeouts**: Use `TEST_CONFIG.timeout`
5. **Verify results**: Check both result content and metadata (duration, usage)
6. **Test with both providers**: When possible, test with both OpenAI and Google

## CI Integration

For CI environments, you can:

1. **Run with mocks only**: Skip E2E tests
   ```bash
   bun test tests/unit  # Skip tests/e2e
   ```

2. **Run with specific provider**:
   ```bash
   OPENAI_API_KEY=${{ secrets.OPENAI_API_KEY }} bun test tests/e2e/providers/openai.test.ts
   ```

3. **Use E2E_SKIP_EXPENSIVE**:
   ```bash
   E2E_SKIP_EXPENSIVE=true bun test tests/e2e
   ```
