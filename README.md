# Open Agent SDK

[![Build in Public](https://img.shields.io/badge/Build%20in%20Public-blue)](https://twitter.com/octane0411)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

An open-source alternative to Claude Agent SDK — lightweight, customizable, and provider-agnostic.

---

## What is this?

Open Agent SDK is a TypeScript framework for building AI agents. It provides a developer experience similar to Claude Agent SDK but with full transparency and no vendor lock-in.

## Why Choose This?

### 🎯 API Compatible with Claude Agent SDK
Drop-in replacement with feature parity — same Agent loop, tools, sessions, permissions, and hooks. Minimal learning curve for existing Claude Agent SDK users.

### 🔓 Open Source & Extensible
Full MIT-licensed source code. Easily customize and extend with custom tools, providers, and hooks.

### 🚀 No Claude Code Dependency
Pure TypeScript implementation that runs independently. No need to install or run Claude Code — works with any LLM provider directly.

**Key features:**
- **Agent Loop** — Observation-thought-action cycle for autonomous agents
- **Built-in Tools** — File operations (read/write/edit), shell execution, code search (glob/grep), web search
- **Streaming Support** — Real-time response streaming with token usage tracking
- **Multi-Provider** — Works with OpenAI, Google Gemini, and Anthropic
- **Provider Extensibility** — Add custom providers with a simple interface
- **Session Management** — Persistent conversations with InMemory and File storage
- **Permission System** — 4 permission modes (default/acceptEdits/bypassPermissions/plan)
- **Hooks Framework** — Event-driven extensibility (10 hook events)
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

## API Reference

See the full [API Reference](./docs/api-reference.md) for detailed documentation on:

- `prompt()` - Execute single prompts with the agent
- `createSession()` / `resumeSession()` - Manage persistent conversations
- All configuration options and types

## Documentation

- [Built-in Tools](./docs/api-reference.md#built-in-tools) - File operations, shell execution, code search, web access
- [Provider Support](./docs/api-reference.md#providers) - OpenAI, Google Gemini, Anthropic
- [Permissions](./docs/api-reference.md#permissions) - Permission modes and management
- [Hooks](./docs/api-reference.md#hooks) - Event-driven extensibility

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Open Agent SDK                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User Code              Core SDK                      External              │
│  ┌─────────┐           ┌─────────┐                   ┌─────────┐            │
│  │ prompt()│──────────►│ Agent   │──────────────────►│ OpenAI  │            │
│  └─────────┘           │  Loop   │                   │ Google  │            │
│  ┌─────────┐           │         │                   │Anthropic│            │
│  │ Session │──────────►│ ┌─────┐ │                   └─────────┘            │
│  └─────────┘           │ │Tools│ │                                          │
│                        │ │(14) │ │                   ┌─────────┐            │
│                        │ └─────┘ │──────────────────►│  File   │            │
│                        │ ┌─────┐ │                   │  Edit   │            │
│                        │ │Hooks│ │                   │ Search  │            │
│                        │ │(10) │ │                   │  Web    │            │
│                        │ └─────┘ │                   │ Tasks   │            │
│                        └────┬────┘                   └─────────┘            │
│                             │                                               │
│                        ┌────┴────┐         ┌─────────┐                      │
│                        │ Session │◄───────►│Storage  │                      │
│                        │ Manager │         │Memory/  │                      │
│                        └─────────┘         │File     │                      │
│                                            └─────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Project Status

**Current Version:** v0.1.0-alpha.0

This project is being developed in public. Follow our progress:

- Twitter: [@octane0411](https://twitter.com/octane0411)
- Discussions: [GitHub Discussions](../../discussions)

### Roadmap

| Version | Features | Status |
|---------|----------|--------|
| v0.1.0-alpha | Core Agent loop, 14 tools, 3 providers, Session, Hooks, Permissions | ✅ Released |
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

# Run quickstart example
bun examples/quickstart/test-basic.ts
```

## Why build this?

Claude Agent SDK is excellent but closed-source. We wanted:

1. **Full transparency** — Open code, free to customize
2. **Provider independence** — No lock-in to a single vendor
3. **Lightweight core** — Focused, understandable architecture
4. **No Claude Code dependency** — Pure TypeScript, runs independently

## Contributing

Contributions welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2026 Octane0411
