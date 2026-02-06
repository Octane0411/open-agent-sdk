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

// Constants for kill behavior
const KILL_TIMEOUT_MS = 5000;
const KILL_CHECK_INTERVAL_MS = 100;
const SIGKILL_WAIT_MS = 100;

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
        success: false,
        message: `Process ${shellId} (PID: ${process.pid}) has already exited with code ${process.exitCode}`,
      };
    }

    // Send SIGTERM
    try {
      process.process.kill('SIGTERM');
    } catch (err) {
      return {
        shellId,
        pid: process.pid,
        success: false,
        message: '',
        error: `Failed to send SIGTERM: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    // Wait up to 5 seconds for process to exit
    const startTime = Date.now();

    while (Date.now() - startTime < KILL_TIMEOUT_MS) {
      if (process.exitCode !== null) {
        // Process exited after SIGTERM
        return {
          shellId,
          pid: process.pid,
          success: true,
          message: `Process ${shellId} (PID: ${process.pid}) terminated successfully`,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, KILL_CHECK_INTERVAL_MS));
    }

    // Process still running, send SIGKILL
    try {
      process.process.kill('SIGKILL');
    } catch (err) {
      return {
        shellId,
        pid: process.pid,
        success: false,
        message: '',
        error: `Failed to send SIGKILL: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }

    // Wait a bit more for SIGKILL to take effect
    await new Promise((resolve) => setTimeout(resolve, SIGKILL_WAIT_MS));

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
