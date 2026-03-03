/**
 * BashOutput tool - Get output from a background bash process
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';
import { readFileSync } from 'fs';
import { backgroundProcesses } from './bash';

const MAX_CAPTURE_CHARS = 200_000;
const TRUNCATED_NOTICE = '\n[Output truncated to avoid excessive memory usage]';

function truncateOutput(value: string): { value: string; truncated: boolean } {
  if (value.length <= MAX_CAPTURE_CHARS) return { value, truncated: false };
  return { value: value.slice(0, MAX_CAPTURE_CHARS), truncated: true };
}

export interface BashOutputInput {
  shellId: string;
}

export interface BashOutputOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  running: boolean;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    shellId: {
      type: 'string',
      description: 'The shell ID returned by Bash tool when run_in_background is true',
    },
  },
  required: ['shellId'],
};

export class BashOutputTool implements Tool<BashOutputInput, BashOutputOutput> {
  name = 'BashOutput';
  description =
    'Get the output and status of a background bash process started with run_in_background.';
  parameters = parameters;

  handler = async (
    input: BashOutputInput,
    _context: ToolContext
  ): Promise<BashOutputOutput> => {
    const { shellId } = input;

    const process = backgroundProcesses.get(shellId);

    if (!process) {
      return {
        stdout: '',
        stderr: '',
        exitCode: null,
        running: false,
        error: `No background process found with ID: ${shellId}`,
      };
    }

    // Check if process is still running
    const running = process.exitCode === null;

    // For detached background processes, refresh output from redirected log files.
    if (process.stdoutPath) {
      try {
        const content = readFileSync(process.stdoutPath, 'utf8');
        const next = truncateOutput(content);
        process.stdout = next.value;
        process.stdoutTruncated = next.truncated;
      } catch {
        // Ignore missing/temporary read failures.
      }
    }
    if (process.stderrPath) {
      try {
        const content = readFileSync(process.stderrPath, 'utf8');
        const next = truncateOutput(content);
        process.stderr = next.value;
        process.stderrTruncated = next.truncated;
      } catch {
        // Ignore missing/temporary read failures.
      }
    }

    return {
      stdout: process.stdout + (process.stdoutTruncated ? TRUNCATED_NOTICE : ''),
      stderr: process.stderr + (process.stderrTruncated ? TRUNCATED_NOTICE : ''),
      exitCode: process.exitCode,
      running,
    };
  };
}

// Export singleton instance
export const bashOutputTool = new BashOutputTool();
