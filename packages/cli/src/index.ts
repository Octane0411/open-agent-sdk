#!/usr/bin/env bun
import { prompt, FileStorage, convertToATIF, cleanupBackgroundProcesses } from 'open-agent-sdk';
import { resolveCodexCliAuth } from './codex-auth';
import { resolveWorkingDirectory } from './cwd';

const args = process.argv.slice(2);
type CleanupBackgroundMode = 'never' | 'on-error' | 'always';

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function resolveCleanupBackgroundMode(): CleanupBackgroundMode {
  const mode = (getFlag('--cleanup-background') ?? process.env.OAS_CLEANUP_BACKGROUND ?? 'on-error')
    .toLowerCase();

  if (mode === 'never' || mode === 'on-error' || mode === 'always') {
    return mode;
  }

  console.error(
    `Invalid cleanup mode "${mode}". Expected one of: never, on-error, always. Falling back to on-error.`
  );
  return 'on-error';
}

const instruction = getFlag('-p');
const model = getFlag('--model') ?? process.env.OAS_MODEL;
const provider = (getFlag('--provider') ?? process.env.OAS_PROVIDER) as
  'openai' | 'google' | 'anthropic' | 'codex' | 'openai-codex' | undefined;
const outputFormat = getFlag('--output-format') ?? 'text';
const maxTurns = parseInt(getFlag('--max-turns') ?? '50', 10);
const cwd = resolveWorkingDirectory(getFlag('--cwd'));
const baseURL = getFlag('--base-url') ?? process.env.ANTHROPIC_BASE_URL ?? process.env.OPENAI_BASE_URL;
const saveTrajectory = getFlag('--save-trajectory');
const sessionDir = getFlag('--session-dir');
const noPersist = args.includes('--no-persist');
const cleanupBackgroundMode = resolveCleanupBackgroundMode();
const codexCliAuth = resolveCodexCliAuth(args);

if (!instruction) {
  console.error('Usage: oas -p <instruction> [--model <model>] [--provider openai|google|anthropic|codex] [--output-format text|json] [--max-turns <n>] [--cwd <path>] [--save-trajectory <path>] [--session-dir <path>] [--codex-api-key <token>] [--codex-oauth-json <json>] [--codex-interactive-login] [--codex-auth-path <path>] [--codex-credentials-path <path>] [--cleanup-background never|on-error|always] [--no-persist]');
  process.exit(1);
}

if (!model) {
  console.error('Error: --model flag or OAS_MODEL environment variable is required');
  process.exit(1);
}

const getSystemPrompt = (cwd: string) => `You are a terminal agent. Complete the given task using the available tools.

Current working directory: ${cwd}

Guidelines:
- Complete the task fully before stopping
- After making changes, verify the result (e.g., read the file back, run a check command)
- If a command fails, diagnose why and try an alternative approach
- Be efficient: don't repeat commands that already succeeded
- When using file paths, use relative paths from the current working directory (${cwd})
- When the task is complete, provide a brief summary of what was accomplished`;

async function main() {
  // Default to FileStorage for session persistence; --no-persist disables it
  const storage = noPersist
    ? undefined
    : new FileStorage(sessionDir ? { directory: sessionDir } : {});

  let exitCode = 0;
  try {
    const result = await prompt(instruction!, {
      model: model!,
      provider,
      ...(provider === 'codex' || provider === 'openai-codex'
        ? {
            ...(codexCliAuth.apiKey ? { apiKey: codexCliAuth.apiKey } : {}),
            ...(codexCliAuth.codexOAuth ? { codexOAuth: codexCliAuth.codexOAuth } : {}),
          }
        : {}),
      maxTurns,
      systemPrompt: getSystemPrompt(cwd),
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'BashOutput', 'KillBash'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd,
      ...(provider !== 'codex' && provider !== 'openai-codex' && baseURL ? { baseURL } : {}),
      logLevel: 'error',
      storage,
    });

    // Export trajectory if requested
    if (saveTrajectory && result.session_id && storage) {
      const sessionData = await storage.load(result.session_id);
      if (sessionData) {
        const atif = convertToATIF(sessionData, { model: model! });
        await Bun.write(saveTrajectory, JSON.stringify(atif, null, 2));
      }
    }

    if (outputFormat === 'json') {
      console.log(JSON.stringify({
        result: result.result,
        duration_ms: result.duration_ms,
        usage: result.usage,
        session_id: result.session_id,
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
    exitCode = 1;
  } finally {
    const shouldCleanupBackground =
      cleanupBackgroundMode === 'always' ||
      (cleanupBackgroundMode === 'on-error' && exitCode !== 0);

    if (shouldCleanupBackground) {
      // Best-effort cleanup during error paths or when explicitly requested.
      await cleanupBackgroundProcesses();
    }

    if (exitCode !== 0) process.exit(exitCode);
  }
}

main();
