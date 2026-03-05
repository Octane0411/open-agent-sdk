<div align="center">
  <img src="./docs/branding/pixel-banner.svg" alt="Open Agent SDK Banner" width="100%">

  <h1>Open Agent SDK</h1>

  <p><strong>Minimal, production-ready TypeScript SDK for building tool-using AI agents.</strong></p>

  <p>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-000000?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License: MIT"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-000000?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun"></a>
  </p>
</div>

Build agents with a ReAct loop, tool permissions, hooks, subagents, session persistence, and multi-provider support.

## 1-Minute Quickstart

```bash
npx open-agent-sdk@alpha init my-agent
cd my-agent
npm install
cp .env.example .env
npm run dev
```

Or with Bun:

```bash
bunx open-agent-sdk@alpha init my-agent
```

## 30-Second Demo

<div align="center">
  <img src="./docs/branding/pixel-demo.svg" alt="Open Agent SDK Demo" width="100%">
</div>

More runnable demos: [Demo Gallery](./DEMO_GALLERY.md).

## Why Open Agent SDK

- Production safety controls: permission modes (`default`, `plan`, `acceptEdits`, `bypassPermissions`) and per-tool gating via `canUseTool`.
- Agent extensibility core: hooks, skills, subagents, and MCP-compatible tool integration.
- Reproducible evaluation path: local SWE-bench and Terminal-bench harnesses in `benchmark/`.

See details in:
- [API Reference](./docs/api-reference.md)
- [SWE-bench Guide](./benchmark/swebench/README.md)
- [Terminal-bench Guide](./benchmark/terminalbench/README.md)
- [Benchmarks](./BENCHMARKS.md)

## Concepts

- `Agent loop`: multi-turn ReAct with tool execution.
- `Tool permissions`: explicit allow/deny policy hooks.
- `Hooks`: lifecycle/tool events for observability and control.
- `Subagents`: task delegation and orchestration.
- `Sessions`: create, save, resume, and fork conversations.

## Example Gallery

- [Interactive Code Agent CLI](./examples/code-agent/README.md)
- [Quickstart Tests (basic/session/tools)](./examples/quickstart/README.md)
- [Skill System Demo](./examples/README.md#skill-system-demo)
- [Structured Output Demo](./examples/structured-output-demo.ts)
- [File Checkpoint Demo](./examples/file-checkpoint-demo.ts)

## Evaluation

- SWE-bench Lite smoke/batch runners: `benchmark/swebench/scripts/`
- Terminal-bench Harbor adapter and runbook: `benchmark/terminalbench/`
- Result summarization scripts and artifacts: see [BENCHMARKS.md](./BENCHMARKS.md)

## Integrations

Current provider support in core SDK:

- OpenAI
- Google Gemini
- Anthropic

Ecosystem integrations:

- MCP server integration support
- Harbor adapter for Terminal-bench

## Docs

- Homepage: https://openagentsdk.dev
- Docs: https://docs.openagentsdk.dev
- GitHub: https://github.com/OasAIStudio/open-agent-sdk
- [Introduction](./docs/introduction.md)
- [Comparison with Claude Agent SDK](./docs/claude-agent-sdk-comparison.md)

## Monorepo Layout

```text
packages/
  core/        # SDK implementation
  web/         # product homepage (Next.js)
  docs/        # docs site (Astro + Starlight)
examples/      # runnable examples
benchmark/     # eval harness and scripts
docs/          # engineering docs, workflows, ADRs
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

The repository is under active development. APIs may evolve before stable `1.0.0`.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening PRs.

## License

[MIT](./LICENSE)
