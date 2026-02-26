#!/usr/bin/env bun
import { prompt } from 'open-agent-sdk';

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const instruction = getFlag('-p');
const model = getFlag('--model') ?? process.env.OAS_MODEL;
const provider = getFlag('--provider') as 'openai' | 'google' | 'anthropic' | undefined;
const outputFormat = getFlag('--output-format') ?? 'text';
const maxTurns = parseInt(getFlag('--max-turns') ?? '50', 10);
const cwd = getFlag('--cwd') ?? process.cwd();
const baseURL = getFlag('--base-url') ?? process.env.ANTHROPIC_BASE_URL ?? process.env.OPENAI_BASE_URL;

if (!instruction) {
  console.error('Usage: oas -p <instruction> [--model <model>] [--provider openai|google|anthropic] [--output-format text|json] [--max-turns <n>] [--cwd <path>]');
  process.exit(1);
}

if (!model) {
  console.error('Error: --model flag or OAS_MODEL environment variable is required');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a terminal agent. Complete the given task using the available tools.

Guidelines:
- Complete the task fully before stopping
- After making changes, verify the result (e.g., read the file back, run a check command)
- If a command fails, diagnose why and try an alternative approach
- Be efficient: don't repeat commands that already succeeded
- When the task is complete, provide a brief summary of what was accomplished`;

async function main() {
  try {
    const result = await prompt(instruction!, {
      model: model!,
      provider,
      maxTurns,
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'BashOutput', 'KillBash'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      baseURL,
      logLevel: 'error',
    });

    if (outputFormat === 'json') {
      console.log(JSON.stringify({
        result: result.result,
        duration_ms: result.duration_ms,
        usage: result.usage,
      }));
    } else {
      console.log(result.result);
    }
  } catch (err) {
    if (outputFormat === 'json') {
      console.log(JSON.stringify({ error: String(err) }));
    } else {
      console.error(String(err));
    }
    process.exit(1);
  }
}

main();
