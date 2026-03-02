# Open Agent SDK vs Claude Agent SDK

This document summarizes the current comparison at the time of writing for the `0.1.0-alpha.x` line.

## Scope

- Focuses on SDK capabilities relevant to application developers
- Reflects the current implementation in this repository
- Does not attempt to evaluate model quality or vendor service quality

## Feature Comparison

| Area | Open Agent SDK | Claude Agent SDK |
|------|----------------|------------------|
| Source model | Open source (MIT) | Closed source |
| Provider strategy | Multi-provider (OpenAI / Google / Anthropic) | Primarily Anthropic ecosystem |
| Agent loop model | Aligned: ReAct-style loop with tool execution | ReAct-style loop with tool execution |
| Built-in tools | Aligned: core agent tool categories (file/shell/search/web/task) | Agent-oriented toolset |
| Session support | Aligned: create / resume / fork workflows | Session-based workflows |
| Permission controls | Aligned: permission-gated execution with multiple modes | Permission-gated execution model |
| Hooks / extensibility | Aligned: lifecycle and tool event hooks | Hook-like extensibility concepts |
| MCP support | Aligned: MCP-based integration supported | MCP-based integration supported |
| Runtime stack | TypeScript + Bun/Node | TypeScript SDK + Anthropic tooling stack |

## Compatibility Notes

- Open Agent SDK intentionally adopts familiar concepts from Claude Agent SDK: sessions, tool-first execution, permission gating, and extensibility hooks.
- API-level parity is not guaranteed for every release. Treat compatibility as directional, not binary.
- For migration-critical scenarios, validate specific APIs in your target version before rollout.

## Current Positioning

Open Agent SDK is best suited for teams that need:

- Source-level control and customizability
- Flexibility to run across providers
- A transparent agent runtime that can be adapted to internal infrastructure

Claude Agent SDK is best suited for teams that prioritize:

- Tight integration with Anthropic's ecosystem
- Official vendor-maintained defaults and workflows

## Change Log Policy for This Comparison

This page should be updated when one of the following changes:

- Provider support matrix
- Permission mode behavior
- Session lifecycle capabilities
- Major compatibility milestones or breaking differences
