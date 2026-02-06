/**
 * BashOutput tool - Get output from a background bash process
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';
import { backgroundProcesses } from './bash';

export interface BashOutputInput {
  shellId: string;
}

export interface BashOutputOutput {
  shellId: string;
  pid: number;
  running: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
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
        shellId,
        pid: -1,
        running: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        error: `Background process with ID '${shellId}' not found`,
      };
    }

    // Check if process is still running
    const running = process.exitCode === null;

    return {
      shellId,
      pid: process.pid,
      running,
      exitCode: process.exitCode,
      stdout: process.stdout,
      stderr: process.stderr,
    };
  };
}

// Export singleton instance
export const bashOutputTool = new BashOutputTool();
