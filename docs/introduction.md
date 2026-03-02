# Open Agent SDK - Introduction

---

## Overview

Open Agent SDK is an open-source TypeScript framework for building AI agents. It provides a developer experience similar to Claude Agent SDK but with full transparency and no vendor lock-in.

## What Makes It Different?

### 🔓 Open Source & Transparent
- Full source code visibility
- MIT License
- Community-driven development
- No black boxes

### 🔌 Provider Agnostic
- **Multi-Provider Support**: OpenAI, Google Gemini, Anthropic
- **Easy to Extend**: Add custom providers with a simple interface
- **No Vendor Lock-in**: Switch providers without code changes

### 🎯 Production Ready
- **Type Safety**: Full TypeScript support with strict type constraints
- **High Test Coverage**: 86%+ code coverage
- **Battle-Tested**: Core Agent loop validated across multiple providers
- **Cancellation Support**: AbortController for operation interruption

## Core Concepts

### Agent Loop

The SDK implements an agentic reasoning pattern:

1. **Observe**: Agent receives input and current state
2. **Think**: Agent reasons about what action to take
3. **Act**: Agent executes tools (file operations, shell commands, web search, etc.)
4. **Repeat**: Loop continues until task completion or max turns reached

```
User Input → [Observe → Think → Act] → Result
                    ↑_________↓
                   (Loop until done)
```

### Tools

Tools are the agent's capabilities. The SDK provides 14 built-in tools:

- **File Operations**: Read, Write, Edit files
- **Shell Execution**: Run bash commands with timeout and background support
- **Code Search**: Glob (find files), Grep (search content)
- **Web Access**: WebSearch, WebFetch
- **Task Management**: Delegate to subagents (includes TaskList, TaskCreate, TaskGet, TaskUpdate)

### Sessions

Sessions enable persistent conversations:

- **Create**: Start a new conversation with `createSession()`
- **Resume**: Continue from where you left off with `resumeSession()`
- **Fork**: Create branches for exploring different paths with `forkSession()`
- **Storage**: InMemory (default) or File-based persistence

### Permissions

Control what the agent can do with 4 permission modes:

- `default`: Ask user before destructive operations (edit/write/bash)
- `acceptEdits`: Auto-approve edits, ask for write/bash
- `bypassPermissions`: Auto-approve everything
- `plan`: Generate execution plan without running

### Hooks

Extend agent behavior with event hooks:

- `onTurnStart` / `onTurnEnd`: Track conversation turns
- `onToolExecute` / `onToolResult`: Monitor tool usage
- `onPermissionRequest` / `onPermissionDecision`: Custom permission logic
- `onStreamChunk` / `onStreamComplete`: Stream processing
- `onError`: Error handling

## Architecture

### High-Level Overview

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

### Detailed Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Open Agent SDK Architecture                         │
│                              v0.1.0-alpha.0                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗   │
│  ║                         PUBLIC API LAYER                               ║   │
│  ║  ┌─────────────┐    ┌─────────────────────────────────────────────┐   ║   │
│  ║  │   prompt()  │    │              Session API                     │   ║   │
│  ║  │  (One-shot) │    │  ┌──────────┐ ┌───────────┐ ┌────────────┐ │   ║   │
│  ║  │             │    │  │ create() │ │ resume()  │ │  fork()    │ │   ║   │
│  ║  └─────────────┘    │  └──────────┘ └───────────┘ └────────────┘ │   ║   │
│  ║                     │  ┌──────────┐ ┌───────────┐ ┌────────────┐ │   ║   │
│  ║                     │  │  send()  │ │ stream()  │ │ compact()  │ │   ║   │
│  ║                     │  └──────────┘ └───────────┘ └────────────┘ │   ║   │
│  ║                     └─────────────────────────────────────────────┘   ║   │
│  ╚═══════════════════════════════════════════════╦═══════════════════════╝   │
│                                                  ║                          │
│  ╔═══════════════════════════════════════════════╩═══════════════════════╗   │
│  ║                      CORE EXECUTION ENGINE                             ║   │
│  ║                                                                        ║   │
│  ║   ┌──────────────────────────────────────────────────────────────┐    ║   │
│  ║   │                    Agent Loop                                 │    ║   │
│  ║   │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │    ║   │
│  ║   │  │  Observe    │───→│    Think    │───→│     Act         │  │    ║   │
│  ║   │  └─────────────┘    └─────────────┘    └─────────────────┘  │    ║   │
│  ║   │                              ↑_______________________________│    ║   │
│  ║   └──────────────────────────────────────────────────────────────┘    ║   │
│  ║                                                                        ║   │
│  ║   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────┐  ║   │
│  ║   │   Provider  │   │   Tool      │   │  Permission │   │  Hook   │  ║   │
│  ║   │   Manager   │   │   Registry  │   │   Manager   │   │ Manager │  ║   │
│  ║   └─────────────┘   └─────────────┘   └─────────────┘   └─────────┘  ║   │
│  ║                                                                        ║   │
│  ╚═══════════════════════════════════════════════╦═══════════════════════╝   │
│                                                  ║                          │
│  ╔═══════════════════════════════════════════════╩═══════════════════════╗   │
│  ║                     PROVIDER ADAPTERS                                  ║   │
│  ║  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐  ║   │
│  ║  │    OpenAI    │  │    Google    │  │         Anthropic          │  ║   │
│  ║  │   Provider   │  │   Provider   │  │        Provider            │  ║   │
│  ║  └──────────────┘  └──────────────┘  └────────────────────────────┘  ║   │
│  ╚══════════════════════════════════════════════════════════════════════╝   │
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗   │
│  ║                      TOOL ECOSYSTEM (14 Tools)                         ║   │
│  ║                                                                         ║   │
│  ║   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    ║   │
│  ║   │    Read     │ │    Write    │ │    Edit     │ │    Bash     │    ║   │
│  ║   └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    ║   │
│  ║   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    ║   │
│  ║   │    Glob     │ │    Grep     │ │  WebSearch  │ │   WebFetch  │    ║   │
│  ║   └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    ║   │
│  ║   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    ║   │
│  ║   │  BashOutput │ │   KillBash  │ │  TaskList   │ │  TaskCreate │    ║   │
│  ║   └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘    ║   │
│  ║   ┌─────────────┐ ┌─────────────┐                                     ║   │
│  ║   │   TaskGet   │ │ TaskUpdate  │                                     ║   │
│  ║   └─────────────┘ └─────────────┘                                     ║   │
│  ╚═══════════════════════════════════════════════════════════════════════╝   │
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗   │
│  ║              SESSION MANAGEMENT & PERSISTENCE                          ║   │
│  ║                                                                         ║   │
│  ║   ┌──────────────────┐         ┌──────────────────────────────────┐   ║   │
│  ║   │  Session State   │         │      Storage Implementations     │   ║   │
│  ║   │  ┌────────────┐  │         │  ┌──────────────┐ ┌────────────┐ │   ║   │
│  ║   │  │   IDLE     │  │         │  │  In-Memory   │ │   File     │ │   ║   │
│  ║   │  │   READY    │  │◄────────┼──┤  (default)   │ │ (SQLite)   │ │   ║   │
│  ║   │  │  RUNNING   │  │         │  └──────────────┘ └────────────┘ │   ║   │
│  ║   │  │   ERROR    │  │         └──────────────────────────────────┘   ║   │
│  ║   │  │   CLOSED   │  │                                              ║   │
│  ║   │  └────────────┘  │                                              ║   │
│  ║   │                  │                                              ║   │
│  ║   │  [Message History] [Compaction] [Forking]                        ║   │
│  ║   └──────────────────┘                                              ║   │
│  ╚═══════════════════════════════════════════════════════════════════════╝   │
│                                                                              │
│  ╔═══════════════════════════════════════════════════════════════════════╗   │
│  ║                   MESSAGE TYPE SYSTEM                                  ║   │
│  ║  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐  ║   │
│  ║  │    User     │ │  Assistant  │ │ Tool Result │ │ CompactBoundary │  ║   │
│  ║  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘  ║   │
│  ╚═══════════════════════════════════════════════════════════════════════╝   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Dependencies

```
                    prompt() / Session API
                           │
                           ▼
                    ┌──────────────┐
                    │ Agent Loop   │
                    └──────┬───────┘
                           │
                 ┌─────────┼─────────┐
                 │         │         │
                 ▼         ▼         ▼
           ┌────────┐ ┌──────────┐ ┌──────────────┐
           │Provider│ │ToolReg   │ │  Permission  │
           │Manager │ │istry     │ │   Manager    │
           └────────┘ └──────────┘ └──────────────┘
                 │         │              │
                 └─────────┴──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Hook Manager │
                    │  (10 events) │
                    └──────────────┘
```

## Use Cases

### 1. Code Assistant
```typescript
const result = await prompt("Analyze this codebase and suggest improvements", {
  model: 'gpt-5.3-codex',
  apiKey: process.env.OPENAI_API_KEY,
  allowedTools: ['Read', 'Glob', 'Grep'],
  cwd: './src',
});
```

### 2. DevOps Automation
```typescript
const result = await prompt("Check server health and restart if needed", {
  model: 'gpt-5.3-codex',
  apiKey: process.env.OPENAI_API_KEY,
  allowedTools: ['Bash', 'Read'],
  permissionMode: 'default', // Requires approval for dangerous operations
});
```

### 3. Research Assistant
```typescript
const session = createSession({
  model: 'gpt-5.3-codex',
  apiKey: process.env.OPENAI_API_KEY,
  allowedTools: ['WebSearch', 'WebFetch', 'Write'],
});

await session.send("Research the latest AI developments and write a summary");
for await (const msg of session.stream()) {
  console.log(msg);
}
```

### 4. Interactive Development
```typescript
const session = createSession({
  model: 'gpt-5.3-codex',
  apiKey: process.env.OPENAI_API_KEY,
  hooks: {
    onPermissionRequest: async (request) => {
      // Custom approval logic
      return request.type === 'edit' ? 'approve' : 'reject';
    },
  },
});
```

## Comparison with Claude Agent SDK

| Feature | Open Agent SDK | Claude Agent SDK |
|---------|---------------|------------------|
| Open Source | ✅ Yes | ❌ No |
| Multi-Provider | ✅ OpenAI/Gemini/Anthropic | ❌ Anthropic only |
| Agent Loop | ✅ | ✅ |
| Built-in Tools | ✅ 14 tools | ✅ Similar |
| Session Management | ✅ | ✅ |
| Permission System | ✅ | ✅ |
| Hooks | ✅ 10 events | ✅ Similar |
| Subagents | ✅ | ✅ |
| Browser Automation | 🚧 Planned | ✅ |
| Structured Output | 🚧 Planned | ✅ |

**Feature Completeness**: ~70-80%

## Getting Started

1. **Installation**
   ```bash
   npm install open-agent-sdk@alpha
   ```

2. **Quick Example**
   ```typescript
   import { prompt } from 'open-agent-sdk';
   
   const result = await prompt("What files are in the current directory?", {
     model: 'gpt-5.3-codex',
     apiKey: process.env.OPENAI_API_KEY,
   });
   
   console.log(result.result);
   ```

3. **Next Steps**
   - Check out the [API Reference](./api-reference.md)
   - Explore [examples](../examples/)
   - Join the [community discussions](https://github.com/Octane0411/open-agent-sdk/discussions)

## Community & Support

- **GitHub**: https://github.com/Octane0411/open-agent-sdk
- **Issues**: https://github.com/Octane0411/open-agent-sdk/issues
- **Discussions**: https://github.com/Octane0411/open-agent-sdk/discussions
- **Twitter**: [@octane0411](https://twitter.com/octane0411)

## License

MIT License © 2026 Octane0411
