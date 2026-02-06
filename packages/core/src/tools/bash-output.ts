/**
 * BashOutput tool - Get output from a background bash process
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';
import { backgroundProcesses } from './bash';

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

    return {
      stdout: process.stdout,
      stderr: process.stderr,
      exitCode: process.exitCode,
      running,
    };
  };
}

// Export singleton instance
export const bashOutputTool = new BashOutputTool();
