# Contributing Guide

Thanks for your interest in Open Agent SDK! This document will help you understand how to contribute to the project.

## Development Environment

- **Runtime**: Bun >= 1.0.0
- **Language**: TypeScript 5.x

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Octane0411/open-agent-sdk.git
cd open-agent-sdk

# Install dependencies
bun install

# Run tests
bun test

# Run specific test
bun test tests/agent/react-loop.test.ts

# Run with coverage
bun test --coverage
```

## Project Structure

```
packages/core/
├── src/
│   ├── index.ts      # Public API exports
│   ├── types/        # Type definitions
│   ├── tools/        # Tool implementations
│   ├── providers/    # AI provider implementations
│   ├── agent/        # ReAct loop, subagents
│   ├── session/      # Session management
│   ├── permissions/  # Permission system
│   └── hooks/        # Hooks framework
└── tests/            # Test files
```

## Submission Guidelines

- Use clear commit messages
- One PR per feature or fix
- Ensure all tests pass before submitting
- Test files go in `tests/` directory

## Reporting Issues

If you find bugs or have feature suggestions, please submit a GitHub Issue with:
- Problem description
- Steps to reproduce
- Expected behavior
- Environment information

## License

By submitting code, you agree to release your contributions under the MIT License.
