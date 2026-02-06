/**
 * KillBash tool - Kill a background bash process
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';
import { backgroundProcesses } from './bash';

export interface KillBashInput {
  shellId: string;
}

export interface KillBashOutput {
  shellId: string;
  pid: number;
  success: boolean;
  message: string;
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

export class KillBashTool implements Tool<KillBashInput, KillBashOutput> {
  name = 'KillBash';
  description =
    'Kill a background bash process started with run_in_background. Sends SIGTERM first, then SIGKILL after 5 seconds if still running.';
  parameters = parameters;

  handler = async (
    input: KillBashInput,
    _context: ToolContext
  ): Promise<KillBashOutput> => {
    const { shellId } = input;

    const process = backgroundProcesses.get(shellId);

    if (!process) {
      return {
        shellId,
        pid: -1,
        success: false,
        message: '',
        error: `Background process with ID '${shellId}' not found`,
      };
    }

    // Check if process has already exited
    if (process.exitCode !== null) {
      return {
        shellId,
        pid: process.pid,
        success: true,
        message: `Process ${shellId} (PID: ${process.pid}) has already exited with code ${process.exitCode}`,
      };
    }

    // Send SIGTERM
    process.process.kill('SIGTERM');

    // Wait up to 5 seconds for process to exit
    const waitTime = 5000;
    const checkInterval = 100;
    const startTime = Date.now();

    while (Date.now() - startTime < waitTime) {
      if (process.exitCode !== null) {
        // Process exited after SIGTERM
        return {
          shellId,
          pid: process.pid,
          success: true,
          message: `Process ${shellId} (PID: ${process.pid}) terminated successfully`,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    // Process still running, send SIGKILL
    process.process.kill('SIGKILL');

    // Wait a bit more for SIGKILL to take effect
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      shellId,
      pid: process.pid,
      success: true,
      message: `Process ${shellId} (PID: ${process.pid}) force killed`,
    };
  };
}

// Export singleton instance
export const killBashTool = new KillBashTool();
