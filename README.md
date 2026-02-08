# Open Agent SDK

[![Build in Public](https://img.shields.io/badge/Build%20in%20Public-blue)](https://twitter.com/octane0411)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

An open-source alternative to Claude Agent SDK — lightweight, customizable, and provider-agnostic.

[中文文档](./README.zh.md)

---

## What is this?

Open Agent SDK is a TypeScript framework for building AI agents. It provides a developer experience similar to Claude Agent SDK but with full transparency and no vendor lock-in.

## Why Choose This?

### 🎯 API Compatible with Claude Agent SDK
- **Aligned API Design** - Drop-in replacement for most Claude Agent SDK use cases
- **Feature Parity** - Core features like ReAct loop, tools, sessions, permissions, and hooks
- **Familiar DX** - Same concepts, similar patterns, minimal learning curve

### 🔓 Open Source & Transparent
- **Full Source Access** - Understand exactly how your agent works
- **MIT License** - Use freely in commercial projects
- **Community-Driven** - Contribute features and fixes directly

### 🔌 Provider Agnostic
- **No Vendor Lock-in** - Works with OpenAI, Google Gemini, and Anthropic
- **Easy to Extend** - Add custom providers with a simple interface
- **Cost Flexibility** - Switch between providers based on pricing and performance

### 🛠️ Highly Customizable
- **Custom Tools** - Register your own tools with simple API
- **Hook System** - Extend behavior at 9 different lifecycle points
- **Permission Control** - Fine-grained control over what agents can do
- **No Claude Code Dependencies** - Pure TypeScript implementation, doesn't require Claude Code process

**Key features:**
- **ReAct Loop** — Observation-thought-action cycle for autonomous agents
- **Built-in Tools** — File operations (read/write/edit), shell execution, code search (glob/grep), web search
- **Streaming Support** — Real-time response streaming with token usage tracking
- **Multi-Provider** — Works with OpenAI, Google Gemini, and Anthropic
- **Provider Extensibility** — Add custom providers with a simple interface
- **Session Management** — Persistent conversations with InMemory and File storage
- **Permission System** — 4 permission modes (default/acceptEdits/bypassPermissions/plan)
- **Hooks Framework** — Event-driven extensibility (9 hook events)
- **Subagent System** — Delegate tasks to specialized agents
- **Type Safety** — Full TypeScript support with strict type constraints
- **Cancellation** — AbortController support for interrupting long-running operations

## Installation

```bash
npm install open-agent-sdk@alpha
```

Or with specific package manager:

```bash
# npm
npm install open-agent-sdk@alpha

# yarn
yarn add open-agent-sdk@alpha

# pnpm
pnpm add open-agent-sdk@alpha

# bun
bun add open-agent-sdk@alpha
```

> **Note**: Currently in alpha. Use `@alpha` tag to install the latest alpha version.

**Requirements:**
- Bun >= 1.0.0 (primary runtime)
- Node.js >= 20 (with peer dependencies)
- TypeScript >= 5.0

## Quick Start

### Basic Usage

```typescript
import { prompt } from 'open-agent-sdk';

const result = await prompt("What files are in the current directory?", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
});

console.log(result.result);
console.log(`Duration: ${result.duration_ms}ms`);
console.log(`Tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`);
```

### Using Gemini

```typescript
const result = await prompt("Explain quantum computing", {
  model: 'your-model',
  provider: 'google',
  apiKey: process.env.GEMINI_API_KEY,
});
```

### Session-Based Conversations

```typescript
import { createSession } from 'open-agent-sdk';

const session = createSession({
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
});

// Send message
await session.send("What is 5 + 3?");

// Stream the response
for await (const message of session.stream()) {
  if (message.type === 'assistant') {
    console.log(message.content);
  }
}

// Continue conversation (context preserved)
await session.send("Multiply that by 2");
for await (const message of session.stream()) {
  console.log(message.content);
}

session.close();
```

### Advanced Options

```typescript
const result = await prompt("Analyze the codebase", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  systemPrompt: "You are a code review assistant.",
  maxTurns: 15,
  allowedTools: ['Read', 'Glob', 'Grep'],
  cwd: './src',
  env: { NODE_ENV: 'development' },
  permissionMode: 'default', // 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
});
```

### With Cancellation

```typescript
const abortController = new AbortController();

setTimeout(() => abortController.abort(), 30000);

const result = await prompt("Long running analysis...", {
  model: 'your-model',
  apiKey: process.env.OPENAI_API_KEY,
  abortController,
});
```

## API Reference

### `prompt(prompt, options)`

Execute a single prompt with the agent using the ReAct loop.

**Parameters:**
- `prompt` (`string`): User's question or task
- `options` (`PromptOptions`): Configuration object
  - `model` (`string`, **required**): Model identifier
  - `apiKey` (`string`): API key (defaults to env var)
  - `provider` (`'openai' | 'google' | 'anthropic'`): Provider (auto-detected if not specified)
  - `baseURL` (`string`): Base URL for API (OpenAI-compatible)
  - `maxTurns` (`number`): Maximum conversation turns (default: 10)
  - `allowedTools` (`string[]`): Allowed tools whitelist
  - `systemPrompt` (`string`): System prompt
  - `cwd` (`string`): Working directory (default: `process.cwd()`)
  - `env` (`Record<string, string>`): Environment variables
  - `abortController` (`AbortController`): Cancellation support
  - `permissionMode` (`PermissionMode`): Permission mode
  - `hooks` (`HooksConfig`): Event hooks configuration

**Returns:** `Promise<PromptResult>`
- `result` (`string`): Final result text
- `duration_ms` (`number`): Execution time in milliseconds
- `usage` (`object`): Token usage statistics

### `createSession(options)` / `resumeSession(id, options)`

Create or resume a persistent conversation session.

**Methods:**
- `send(message: string): Promise<void>`
- `stream(): AsyncGenerator<SDKMessage>`
- `close(): void`

## Built-in Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `Read` | Read file contents, supports images | `file_path`, `offset?`, `limit?` |
| `Write` | Write content to a file | `file_path`, `content` |
| `Edit` | Edit file with search/replace | `file_path`, `old_string`, `new_string` |
| `Bash` | Execute shell commands | `command`, `timeout?`, `run_in_background?` |
| `Glob` | Find files matching patterns | `pattern`, `path?` |
| `Grep` | Search code with regex | `pattern`, `path?`, `output_mode?` |
| `WebSearch` | Search the web | `query`, `numResults?` |
| `WebFetch` | Fetch webpage content | `url`, `prompt?` |
| `Task` | Delegate to subagent (includes task management) | `description`, `prompt`, `subagent_type` |

## Provider Support

| Provider | Status |
|----------|--------|
| OpenAI | ✅ Supported |
| Google Gemini | ✅ Supported |
| Anthropic | ✅ Supported |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Open Agent SDK                           │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   prompt()   │  │   Session    │  │  ReActLoop       │  │
│  │  (One-shot)  │  │ (Persistent) │  │ (Reason + Act)   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         └─────────────────┴───────────────────┘            │
│                           │                                │
│         ┌─────────────────┼─────────────────┐              │
│         ▼                 ▼                 ▼              │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────┐     │
│  │  Provider  │   │ ToolRegistry │   │  Permission  │     │
│  │(OpenAI/    │   │(Read/Write/  │   │   Manager    │     │
│  │ Google)    │   │ Bash/Web...) │   │(4 modes)     │     │
│  └────────────┘   └──────────────┘   └──────────────┘     │
│         │                 │                 │              │
│         └─────────────────┴─────────────────┘              │
│                           │                                │
│                    ┌──────▼──────┐                         │
│                    │HookManager  │                         │
│                    │(9 events)   │                         │
│                    └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Project Status

**Current Version:** v0.1.0-alpha.0

This project is being developed in public. Follow our progress:

- Twitter: [@octane0411](https://twitter.com/octane0411)
- Discussions: [GitHub Discussions](../../discussions)

### Roadmap

| Version | Features | Status |
|---------|----------|--------|
| v0.1.0-alpha | Core ReAct loop, 17 tools, 3 providers, Session, Hooks, Permissions | ✅ Released |
| v0.1.0-beta | Structured outputs, File checkpointing, Session forking enhancements | 🚧 In Progress |
| v0.1.0 | Stable release | 📋 Planned |
| v0.2.0 | Browser automation, Skill system, Query class | 📋 Planned |
| v1.0.0 | Full Claude Agent SDK compatibility, Python SDK | 📋 Planned |

### Benchmarks

We're preparing comprehensive benchmarks comparing Open Agent SDK with Claude Agent SDK across various real-world scenarios:

- **Code Understanding** - Analyze and explain complex codebases
- **File Operations** - Read, write, and edit files efficiently
- **Task Completion** - Multi-step task execution and reasoning
- **Tool Usage** - Effectiveness in using built-in tools
- **Performance** - Response time, token usage, and accuracy

**Status**: 📋 Coming Soon

Results will be published in the [`docs/benchmarks/`](./docs/benchmarks/) directory with full methodology and reproducible test cases.

## Development

```bash
# Clone the repository
git clone https://github.com/Octane0411/open-agent-sdk.git
cd open-agent-sdk

# Install dependencies
bun install

# Run tests
bun test

# Run with coverage
bun test --coverage

# Type checking
cd packages/core && npx tsc --noEmit

# Run demo
GEMINI_API_KEY=your-key bun examples/demo.ts
```

## Why build this?

Claude Agent SDK is excellent but closed-source. We wanted:

1. **Full transparency** — Open code, free to customize
2. **Provider independence** — No lock-in to a single vendor
3. **Lightweight core** — Focused, understandable architecture
4. **Interview-friendly** — Every design decision is explainable

## Contributing

Contributions welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2026 Octane0411
