/**
 * KillBash tool - Kill a background bash process
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';
import { backgroundProcesses } from './bash';

export interface KillBashInput {
  shellId: string;
}

export interface KillBashOutput {
  success: boolean;
  message: string;
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

    const bgProcess = backgroundProcesses.get(shellId);

    if (!bgProcess) {
      return {
        success: false,
        message: `No background process found with ID: ${shellId}`,
      };
    }

    // Check if process has already exited
    if (bgProcess.exitCode !== null) {
      return {
        success: true,
        message: `Process ${shellId} already exited with code ${bgProcess.exitCode}`,
      };
    }

    // Send SIGTERM
    bgProcess.process.kill('SIGTERM');

    // Wait up to 5 seconds for graceful exit, then SIGKILL
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (bgProcess.exitCode !== null) {
          clearInterval(checkInterval);
          clearTimeout(forceKillTimeout);
          resolve({
            success: true,
            message: `Process ${shellId} terminated with exit code ${bgProcess.exitCode}`,
          });
        }
      }, 100);

      const forceKillTimeout = setTimeout(() => {
        clearInterval(checkInterval);
        if (bgProcess.exitCode === null) {
          bgProcess.process.kill('SIGKILL');
          resolve({
            success: true,
            message: `Process ${shellId} force-killed with SIGKILL`,
          });
        }
      }, 5000);
    });
  };
}

// Export singleton instance
export const killBashTool = new KillBashTool();
