/**
 * Bash tool - Execute shell commands with timeout and background support
 */

import { spawn } from 'child_process';
import type { Tool, ToolContext, JSONSchema } from '../types/tools';

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
const backgroundProcesses = new Map<string, { pid: number; startTime: number }>();

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

    return new Promise((resolve) => {
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      const shellFlag = process.platform === 'win32' ? '/c' : '-c';

      const child = spawn(shell, [shellFlag, command], {
        cwd: context.cwd,
        env: { ...process.env, ...context.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Handle background execution
      if (run_in_background) {
        const shellId = `shell_${++backgroundProcessId}`;
        backgroundProcesses.set(shellId, {
          pid: child.pid!,
          startTime: Date.now(),
        });

        // Don't wait for completion
        resolve({
          output: `Command running in background with ID: ${shellId}`,
          exitCode: 0,
          shellId,
        });

        // Clean up when process exits
        child.on('exit', () => {
          backgroundProcesses.delete(shellId);
        });

        return;
      }

      let stdout = '';
      let stderr = '';
      let killed = false;

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
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

        let output = stdout + (stderr ? '\n' + stderr : '');

        // Normalize macOS /private prefix for pwd command
        if (command.trim() === 'pwd' && output.startsWith('/private/')) {
          output = output.substring('/private'.length);
        }

        resolve({
          output: killed ? output + '\n[Command timed out]' : output,
          exitCode: code ?? (killed ? -1 : 0),
          killed,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
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
