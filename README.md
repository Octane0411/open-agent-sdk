<div align="center">
  <img src="./docs/branding/open-agent-sdk-banner.svg" alt="Open Agent SDK logo" width="420">

  <h1>Open Agent SDK</h1>

  <p><strong>Lightweight, general-purpose TypeScript agent runtime. Open-source alternative to Claude Agent SDK.</strong></p>

  <p>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-000000?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="License: MIT"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-000000?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
    <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun"></a>
  </p>
</div>

Lightweight, general-purpose TypeScript agent runtime. Open-source alternative to Claude Agent SDK.

Use it when you want a lightweight open runtime with sessions, tools, hooks, subagents, and multi-provider support in a codebase you can actually inspect and extend.

More runnable examples: [Demo Gallery](./DEMO_GALLERY.md).

## Quickstart

```bash
npx open-agent-sdk@alpha init my-agent
cd my-agent
npm install
cp .env.example .env
npm run dev
```

With Bun:

```bash
bunx open-agent-sdk@alpha init my-agent
```

Run `codex login` once first if you want to use Codex OAuth. The SDK reuses your local Codex login state from `~/.codex/auth.json`.

If you already manage Codex OAuth outside the CLI, you can point `oas` at another auth file with `OAS_CODEX_AUTH_PATH`, inject refreshable credentials JSON with `OAS_CODEX_OAUTH_JSON`, or pass a short-lived token with `OAS_CODEX_API_KEY`.

## Why Open Agent SDK

- Open runtime, not a black box: MIT-licensed core, readable implementation, and extension points you can actually own.
- Real workflow model: prompts, sessions, resume, fork, storage, and tool execution in one TypeScript surface.
- Safety and control built in: permission modes, per-tool gating, and lifecycle hooks for product-grade behavior.
- Provider flexibility: Codex OAuth, OpenAI, Gemini, and Anthropic support without changing the overall mental model.
- Evaluation path included: local SWE-bench and Terminal-bench harnesses live in the same repo.

## What You Can Ship

- One-shot prompts and long-lived session workflows
- Create, resume, and fork sessions with storage-backed history
- Tool-enabled loops with bash, file operations, web search, web fetch, MCP, and task delegation
- Hook surfaces for observability, safety policy, and runtime customization
- CLI-first local development and migration from Claude-style workflows
- Benchmark-oriented evaluation flows for harder agent tasks

## Start Here

- Homepage: https://openagentsdk.dev
- Docs: https://docs.openagentsdk.dev
- Quickstart: https://docs.openagentsdk.dev/getting-started/quickstart/
- API Reference: https://docs.openagentsdk.dev/api-reference/overview/
- Provider & Auth Strategy: https://docs.openagentsdk.dev/guides/provider-auth-strategy/
- Permissions & Safety: https://docs.openagentsdk.dev/guides/permissions-and-safety/
- Quick Migration Guide: https://docs.openagentsdk.dev/migration/quick-migration/
- [Demo Gallery](./DEMO_GALLERY.md)
- [Benchmarks](./BENCHMARKS.md)

## Product Surface

- `packages/core/`: published SDK package
- `packages/web/`: product homepage
- `packages/docs/`: docs site
- `examples/`: runnable usage examples
- `benchmark/`: evaluation harnesses and scripts
- `docs/`: engineering docs, ADRs, workflows, and supporting research

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

Codex smoke test with your existing local login:

```bash
cd packages/core
bun test tests/e2e/providers/codex.test.ts
```

## Additional Reading

- [Introduction](./docs/introduction.md)
- [Comparison with Claude Agent SDK](./docs/claude-agent-sdk-comparison.md)
- [SWE-bench Guide](./benchmark/swebench/README.md)
- [Terminal-bench Guide](./benchmark/terminalbench/README.md)

## Project Status

Current release line: `0.1.0-alpha.x`.

The repository is under active development. APIs may evolve before stable `1.0.0`.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening PRs.

## License

[MIT](./LICENSE)
