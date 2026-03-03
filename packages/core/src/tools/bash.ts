/**
 * Bash tool - Execute shell commands with timeout and background support
 */

import { spawn, ChildProcess } from 'child_process';
import { mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Tool, ToolContext, JSONSchema } from '../types/tools';

export interface BackgroundProcess {
  pid: number;
  startTime: number;
  stdout: string;
  stderr: string;
  stdoutPath?: string;
  stderrPath?: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  exitCode: number | null;
  process: ChildProcess;
  detached: boolean;
}

export interface BashInput {
  command: string;
  timeout?: number;
  description?: string;
  run_in_background?: boolean;
}

export interface BashOutput {
  output: string;
  exitCode: number;
  killed?: boolean;
  shellId?: string;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'Shell command to execute',
    },
    timeout: {
      type: 'number',
      description: 'Maximum execution time in milliseconds (max 600000)',
    },
    description: {
      type: 'string',
      description: 'Brief description of the command (5-10 words)',
    },
    run_in_background: {
      type: 'boolean',
      description: 'Run the command in the background',
    },
  },
  required: ['command'],
};

// Track background processes
let backgroundProcessId = 0;
export const backgroundProcesses = new Map<string, BackgroundProcess>();

// Cap captured output to avoid OOM when commands print large streams.
const MAX_CAPTURE_CHARS = 200_000;
const TRUNCATED_NOTICE = '\n[Output truncated to avoid excessive memory usage]';
const BG_LOG_DIR = join(tmpdir(), 'open-agent-sdk-bg');

function appendCapped(
  current: string,
  chunk: string,
  maxChars: number
): { value: string; truncated: boolean } {
  if (current.length >= maxChars) {
    return { value: current, truncated: true };
  }

  const remaining = maxChars - current.length;
  if (chunk.length <= remaining) {
    return { value: current + chunk, truncated: false };
  }

  return { value: current + chunk.slice(0, remaining), truncated: true };
}

export class BashTool implements Tool<BashInput, BashOutput> {
  name = 'Bash';
  description =
    'Execute a shell command. Supports timeout (max 600000ms), background execution, and captures stdout/stderr.';
  parameters = parameters;

  handler = async (
    input: BashInput,
    context: ToolContext
  ): Promise<BashOutput> => {
    const { command, timeout = 120000, run_in_background } = input;

    if (!command.trim()) {
      return { output: '', exitCode: 0 };
    }

    // Check if already aborted
    if (context.abortController?.signal.aborted) {
      return {
        output: 'Command aborted before execution',
        exitCode: -1,
        killed: true,
      };
    }

    return new Promise((resolve) => {
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      const shellFlag = process.platform === 'win32' ? '/c' : '-c';
      let shellId: string | undefined;
      let stdoutPath: string | undefined;
      let stderrPath: string | undefined;
      let detachedBackground = false;

      if (run_in_background) {
        shellId = `shell_${++backgroundProcessId}`;
        if (process.platform !== 'win32') {
          detachedBackground = true;
          mkdirSync(BG_LOG_DIR, { recursive: true });
          stdoutPath = join(BG_LOG_DIR, `${shellId}.stdout.log`);
          stderrPath = join(BG_LOG_DIR, `${shellId}.stderr.log`);
        }
      }

      const normalizedCommand = run_in_background
        ? command.replace(/\s*&\s*$/, '').trim()
        : command;
      const commandToRun = run_in_background && stdoutPath && stderrPath
        ? `( ${normalizedCommand} ) >>"${stdoutPath}" 2>>"${stderrPath}"`
        : normalizedCommand;

      const child = spawn(shell, [shellFlag, commandToRun], {
        cwd: context.cwd,
        env: { ...process.env, ...context.env },
        stdio: run_in_background && detachedBackground ? ['ignore', 'ignore', 'ignore'] : ['ignore', 'pipe', 'pipe'],
        detached: run_in_background ? detachedBackground : false,
      });

      // Set up abort handler
      let abortHandler: (() => void) | undefined;
      if (context.abortController?.signal) {
        abortHandler = () => {
          killed = true;
          child.kill('SIGTERM');
          // Force kill after 5 seconds if still running
          setTimeout(() => child.kill('SIGKILL'), 5000);
        };
        context.abortController.signal.addEventListener('abort', abortHandler);
      }

      // Handle background execution
      if (run_in_background) {
        const bgProcess: BackgroundProcess = {
          pid: child.pid!,
          startTime: Date.now(),
          stdout: '',
          stderr: '',
          stdoutPath,
          stderrPath,
          stdoutTruncated: false,
          stderrTruncated: false,
          exitCode: null,
          process: child,
          detached: detachedBackground,
        };
        backgroundProcesses.set(shellId!, bgProcess);

        if (!detachedBackground) {
          // Capture stdout/stderr in-process when not detached.
          child.stdout?.on('data', (data) => {
            const next = appendCapped(bgProcess.stdout, data.toString(), MAX_CAPTURE_CHARS);
            bgProcess.stdout = next.value;
            if (next.truncated) bgProcess.stdoutTruncated = true;
          });

          child.stderr?.on('data', (data) => {
            const next = appendCapped(bgProcess.stderr, data.toString(), MAX_CAPTURE_CHARS);
            bgProcess.stderr = next.value;
            if (next.truncated) bgProcess.stderrTruncated = true;
          });
        }

        // Set exit code when process exits (don't delete from map)
        child.on('exit', (code) => {
          bgProcess.exitCode = code ?? -1;
          if (bgProcess.stdoutPath) {
            try {
              const content = readFileSync(bgProcess.stdoutPath, 'utf8');
              const next = appendCapped('', content, MAX_CAPTURE_CHARS);
              bgProcess.stdout = next.value;
              bgProcess.stdoutTruncated = next.truncated;
            } catch {
              // Ignore read errors for best-effort output capture.
            }
          }
          if (bgProcess.stderrPath) {
            try {
              const content = readFileSync(bgProcess.stderrPath, 'utf8');
              const next = appendCapped('', content, MAX_CAPTURE_CHARS);
              bgProcess.stderr = next.value;
              bgProcess.stderrTruncated = next.truncated;
            } catch {
              // Ignore read errors for best-effort output capture.
            }
          }
        });

        // Prevent background child handles from keeping the process alive.
        child.unref();
        (child.stdout as unknown as { unref?: () => void } | null)?.unref?.();
        (child.stderr as unknown as { unref?: () => void } | null)?.unref?.();

        // Don't wait for completion
        resolve({
          output: `Command running in background with ID: ${shellId!}`,
          exitCode: 0,
          shellId: shellId!,
        });

        return;
      }

      let stdout = '';
      let stderr = '';
      let killed = false;
      let stdoutTruncated = false;
      let stderrTruncated = false;

      child.stdout?.on('data', (data) => {
        const next = appendCapped(stdout, data.toString(), MAX_CAPTURE_CHARS);
        stdout = next.value;
        if (next.truncated) stdoutTruncated = true;
      });

      child.stderr?.on('data', (data) => {
        const next = appendCapped(stderr, data.toString(), MAX_CAPTURE_CHARS);
        stderr = next.value;
        if (next.truncated) stderrTruncated = true;
      });

      // Set up timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        // Force kill after 5 seconds if still running
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }, Math.min(timeout, 600000));

      child.on('exit', (code, signal) => {
        clearTimeout(timeoutId);

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          killed = true;
        }

        // Clean up abort listener
        if (abortHandler && context.abortController?.signal) {
          context.abortController.signal.removeEventListener('abort', abortHandler);
        }

        let output = stdout + (stderr ? '\n' + stderr : '');

        // Normalize macOS /private prefix for pwd command
        if (command.trim() === 'pwd' && output.startsWith('/private/')) {
          output = output.substring('/private'.length);
        }

        // Check if killed due to abort
        const wasAborted = context.abortController?.signal.aborted;
        const outputMessage = wasAborted
          ? output + '\n[Command aborted]'
          : killed
            ? output + '\n[Command timed out]'
            : output;

        const finalOutput = stdoutTruncated || stderrTruncated
          ? outputMessage + TRUNCATED_NOTICE
          : outputMessage;

        resolve({
          output: finalOutput,
          exitCode: code ?? (killed ? -1 : 0),
          killed,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);

        // Clean up abort listener
        if (abortHandler && context.abortController?.signal) {
          context.abortController.signal.removeEventListener('abort', abortHandler);
        }

        resolve({
          output: '',
          exitCode: -1,
          error: `Failed to execute command: ${err.message}`,
        });
      });
    });
  };
}

// Export singleton instance
export const bashTool = new BashTool();

// Export function to get background process info (for future BashOutput tool)
export function getBackgroundProcess(shellId: string) {
  return backgroundProcesses.get(shellId);
}

/**
 * Best-effort cleanup for any running background bash processes.
 * Intended for process shutdown paths (e.g. CLI exit) to avoid hangs.
 */
export async function cleanupBackgroundProcesses(
  forceKillAfterMs = 1000
): Promise<void> {
  const entries = Array.from(backgroundProcesses.values()).filter((p) => p.exitCode === null);

  await Promise.all(
    entries.map(
      (bgProcess) =>
        new Promise<void>((resolve) => {
          if (bgProcess.exitCode !== null) {
            resolve();
            return;
          }

          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            clearTimeout(forceKillTimer);
            resolve();
          };

          bgProcess.process.once('exit', (code) => {
            bgProcess.exitCode = code ?? -1;
            done();
          });

          try {
            if (bgProcess.detached && process.platform !== 'win32') {
              process.kill(-bgProcess.pid, 'SIGTERM');
            } else {
              bgProcess.process.kill('SIGTERM');
            }
          } catch {
            // Ignore errors if process already exited.
          }

          const forceKillTimer = setTimeout(() => {
            if (bgProcess.exitCode === null) {
              try {
                if (bgProcess.detached && process.platform !== 'win32') {
                  process.kill(-bgProcess.pid, 'SIGKILL');
                } else {
                  bgProcess.process.kill('SIGKILL');
                }
              } catch {
                // Ignore errors if process already exited.
              }
            }
            done();
          }, Math.max(1, forceKillAfterMs));
        })
    )
  );
}
