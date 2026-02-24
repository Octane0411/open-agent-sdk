# Open Agent SDK Examples

This directory contains example scripts and demonstrations of the Open Agent SDK features.

## Quick Start Example

See [`quickstart.ts`](./quickstart.ts) for a comprehensive introduction to the SDK.

```bash
# Set your API key
export OPENAI_API_KEY="your-api-key"
# or
export GEMINI_API_KEY="your-api-key"

# Run the example
bun run examples/quickstart.ts
```

## Skill System Demo

The [`skills-demo.ts`](./skills-demo.ts) example demonstrates the skill system:

1. Skills are automatically loaded from `~/.claude/skills/` and `./.claude/skills/`
2. Use `/skill-name` to activate a skill
3. The skill content is injected into the system prompt
4. The LLM follows the skill instructions

### Example Skills

See the [`skills/`](./skills/) directory for example skill files:

- **`code-reviewer`** - Thorough code review specialist
- **`refactor`** - Code refactoring expert

### Using Skills

To use these example skills, copy them to your skills directory:

```bash
# Create personal skills directory
mkdir -p ~/.claude/skills

# Copy example skills
cp examples/skills/*.md ~/.claude/skills/

# Or copy to your project
mkdir -p .claude/skills
cp examples/skills/*.md .claude/skills/
```

Then run the demo:

```bash
bun run examples/skills-demo.ts
```

### Creating Your Own Skills

Skills are Markdown files with YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does
tools: ['Read', 'Write', 'Edit']
---

# Skill Instructions

Your detailed instructions here. You can use:
- Markdown formatting
- Code blocks
- Lists
- etc.

## Parameter Substitution

Use $ARGUMENTS to reference what the user typed after /skill-name.
```

## Available Examples

| Example | Description |
|---------|-------------|
| `quickstart.ts` | Comprehensive SDK overview |
| `skills-demo.ts` | Skill system demonstration |
| `skills/` | Example skill files |

## Running Examples

All examples require an API key. Set one of these environment variables:

- `OPENAI_API_KEY` - For OpenAI provider
- `GEMINI_API_KEY` - For Google Gemini provider

Then run with:

```bash
bun run examples/<example-name>.ts
```
