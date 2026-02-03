# Gemini CLI Code Agent Demo

An interactive CLI demo showcasing the Open Agent SDK's core features using the Gemini API.

## Features

| Feature | Description | SDK API Used |
|---------|-------------|--------------|
| **Interactive Chat** | REPL-style conversation with AI | `createSession`, `session.send()`, `session.stream()` |
| **Code Operations** | Read, write, edit, search files | `Read`, `Write`, `Edit`, `Glob`, `Grep` tools |
| **Shell Execution** | Run commands and get output | `Bash` tool |
| **Session Persistence** | Save and restore conversations | `FileStorage`, `resumeSession()` |
| **Streaming Output** | Real-time AI response display | `session.stream()` |
| **Cancel Operations** | Ctrl+C to cancel requests | `AbortController` |

## Quick Start

```bash
# Navigate to the demo directory
cd examples/code-agent

# Install dependencies
bun install

# Run with your Gemini API key
GEMINI_API_KEY=your-api-key bun dev
```

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help message |
| `/exit` or `/quit` | Exit the program |
| `/save` | Manually save current session |
| `/load <id>` | Load a saved session |
| `/list` | List all saved sessions |
| `/clear` | Clear conversation history |
| `/info` | Show current session info |

## Example Usage

```
🤖 Gemini Code Agent Demo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Session created (ID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)

Type /help for available commands, or just start chatting!

You: List all TypeScript files in the current directory

Assistant:
I'll help you find all TypeScript files in the current directory.

[Tool: glob({"pattern": "**/*.ts"})]
✓ Tool result: glob
  Files: 5

Here are the TypeScript files:
- src/index.ts
- src/cli.ts
- src/commands.ts
- src/utils.ts
- types.ts

You: /save

✓ Session saved (ID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)

You: /exit

👋 Goodbye!
```

## Project Structure

```
code-agent/
├── src/
│   ├── index.ts      # Entry point
│   ├── cli.ts        # REPL interaction loop
│   ├── commands.ts   # Command handlers
│   └── utils.ts      # Utility functions
├── package.json      # Dependencies
├── tsconfig.json     # TypeScript config
└── README.md         # This file
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Your Gemini API key |

## Session Storage

Sessions are automatically saved to `~/.open-agent/sessions/` after each interaction. You can:
- Resume sessions with `/load <session-id>`
- List saved sessions with `/list`
- Sessions persist across restarts

## SDK Coverage

This demo covers the following Open Agent SDK APIs:

- **Session Management**: `createSession()`, `resumeSession()`, `Session` class
- **Storage**: `FileStorage`, `InMemoryStorage`
- **Streaming**: `session.stream()` with async generators
- **Tools**: All built-in tools (Read, Write, Edit, Bash, Glob, Grep)
- **Cancellation**: `AbortController` support
- **Message Types**: `SDKMessage`, `SDKAssistantMessage`, `SDKToolResultMessage`
