/**
 * Tests for KillBash tool
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { KillBashTool } from '../../src/tools/kill-bash';
import { BashTool, backgroundProcesses } from '../../src/tools/bash';
import type { ToolContext } from '../../src/types/tools';

describe('KillBashTool', () => {
  let tool: KillBashTool;
  let bashTool: BashTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new KillBashTool();
    bashTool = new BashTool();
    context = {
      cwd: process.cwd(),
      env: {},
      abortController: new AbortController(),
    };
    // Clear background processes before each test
    backgroundProcesses.clear();
  });

  test('should have correct name and description', () => {
    expect(tool.name).toBe('KillBash');
    expect(tool.description).toContain('Kill');
    expect(tool.description.toLowerCase()).toContain('background');
  });

  test('should return error for invalid shellId', async () => {
    const result = await tool.handler(
      {
        shellId: 'invalid_shell_id',
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain('No background process');
  });

  test('should kill a running background process', async () => {
    // Start a long-running background process
    const bashResult = await bashTool.handler(
      {
        command: 'sleep 30',
        run_in_background: true,
      },
      context
    );

    const shellId = bashResult.shellId!;

    // Verify process is running
    const beforeProcess = backgroundProcesses.get(shellId);
    expect(beforeProcess?.exitCode).toBeNull();

    // Kill the process
    const result = await tool.handler({ shellId }, context);

    expect(result.success).toBe(true);
    expect(result.message).toContain('terminated');

    // Wait a bit for the kill to take effect
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify process has exited
    const afterProcess = backgroundProcesses.get(shellId);
    expect(afterProcess?.exitCode).not.toBeNull();
  });

  test('should handle already exited process', async () => {
    // Start a quick background process
    const bashResult = await bashTool.handler(
      {
        command: 'echo "done"',
        run_in_background: true,
      },
      context
    );

    const shellId = bashResult.shellId!;

    // Wait for process to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Try to kill the already exited process
    const result = await tool.handler({ shellId }, context);

    expect(result.success).toBe(true);
    expect(result.message).toContain('already exited');
  });
});
