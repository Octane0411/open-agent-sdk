<div align="center">
  <img src="./docs/branding/pixel-banner.svg" alt="Open Agent SDK Banner" width="100%">

  <h1>Open Agent SDK</h1>

  <p><strong>TypeScript SDK for building production-grade AI agents with tool use and multi-provider support.</strong></p>

  <p>
    <a href="https://twitter.com/octane0411"><img src="https://img.shields.io/badge/Build%20in%20Public-000000?style=for-the-badge&logo=x&logoColor=white" alt="Build in Public"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-000000?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License: MIT"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-000000?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.0+-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun"></a>
  </p>
</div>

- Compatible developer experience with Claude Agent SDK concepts
- Open and extensible architecture for custom tools, providers, and hooks
- Strong operational controls with sessions, permissions, and MCP integration

## Highlights

<div align="center">
  <img src="./docs/branding/pixel-demo.svg" alt="Open Agent SDK Demo" width="100%">
</div>
- ReAct-style agent loop with multi-turn execution
- Built-in toolset for files, shell, search, web, and task orchestration
- Session persistence with resume and fork support
- Permission system (`default`, `acceptEdits`, `bypassPermissions`, `plan`)
- Hook system for lifecycle and tool events
- Multi-provider support (OpenAI, Google Gemini, Anthropic)
- MCP integration support
- Strict TypeScript typing across public APIs

## Installation

```bash
npm install open-agent-sdk@alpha
```

Alternative package managers:

```bash
yarn add open-agent-sdk@alpha
pnpm add open-agent-sdk@alpha
bun add open-agent-sdk@alpha
```

## Requirements

- Bun `>= 1.0.0`
- Node.js `>= 18`
- TypeScript `>= 5.0`

## Quick Start

### One-shot prompt

```typescript
import { prompt } from "open-agent-sdk";

const result = await prompt("Summarize the repository structure.", {
  model: "gpt-5.3-codex",
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
});

console.log(result.result);
console.log(result.usage);
```

### Session workflow

```typescript
import { createSession } from "open-agent-sdk";

const session = await createSession({
  model: "gpt-5.3-codex",
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
});

await session.send("Read the current directory and list key files.");

for await (const message of session.stream()) {
  if (message.type === "assistant") {
    console.log(message.message.content);
  }
}

session.close();
```

## Documentation

- [API Reference](./docs/api-reference.md)
- [Introduction](./docs/introduction.md)
- [Comparison with Claude Agent SDK](./docs/claude-agent-sdk-comparison.md)

## Monorepo Structure

```text
packages/
  core/        # SDK implementation
examples/      # usage examples
docs/          # technical docs, workflows, ADRs
```

## Development

```bash
# install dependencies
bun install

# build core package
bun run build

# run tests
bun test

# run coverage
bun test --coverage

# type check
bun run typecheck
```

Integration tests with real LLM APIs:

```bash
env $(cat .env | xargs) bun test
```

## Project Status

Current release line: `0.1.0-alpha.x`.

This repository is under active development. APIs may evolve before the stable `1.0.0` release.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening PRs.

## License

[MIT](./LICENSE)
