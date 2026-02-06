/**
 * Tests for BashOutput tool
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { BashOutputTool } from '../../src/tools/bash-output';
import { BashTool, backgroundProcesses } from '../../src/tools/bash';
import type { ToolContext } from '../../src/types/tools';

describe('BashOutputTool', () => {
  let tool: BashOutputTool;
  let bashTool: BashTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new BashOutputTool();
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
    expect(tool.name).toBe('BashOutput');
    expect(tool.description).toContain('output');
    expect(tool.description.toLowerCase()).toContain('background');
  });

  test('should return error for invalid shellId', async () => {
    const result = await tool.handler(
      {
        shellId: 'invalid_shell_id',
      },
      context
    );

    expect(result.error).toBeDefined();
    expect(result.error).toContain('not found');
  });

  test('should return running status for active process', async () => {
    // Start a long-running background process
    const bashResult = await bashTool.handler(
      {
        command: 'sleep 10',
        run_in_background: true,
      },
      context
    );

    const shellId = bashResult.shellId!;

    const result = await tool.handler({ shellId }, context);

    expect(result.shellId).toBe(shellId);
    expect(result.running).toBe(true);
    expect(result.exitCode).toBeNull();

    // Clean up - kill the process
    const bgProcess = backgroundProcesses.get(shellId);
    if (bgProcess) {
      bgProcess.process.kill('SIGTERM');
    }
  });

  test('should return stdout for completed process', async () => {
    const bashResult = await bashTool.handler(
      {
        command: 'echo "hello world"',
        run_in_background: true,
      },
      context
    );

    const shellId = bashResult.shellId!;

    // Wait for process to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const result = await tool.handler({ shellId }, context);

    expect(result.shellId).toBe(shellId);
    expect(result.running).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello world');
  });

  test('should return stderr for process with errors', async () => {
    const bashResult = await bashTool.handler(
      {
        command: 'echo "error msg" >&2',
        run_in_background: true,
      },
      context
    );

    const shellId = bashResult.shellId!;

    // Wait for process to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const result = await tool.handler({ shellId }, context);

    expect(result.stderr).toContain('error msg');
  });

  test('should return correct exit code for failed process', async () => {
    const bashResult = await bashTool.handler(
      {
        command: 'exit 5',
        run_in_background: true,
      },
      context
    );

    const shellId = bashResult.shellId!;

    // Wait for process to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const result = await tool.handler({ shellId }, context);

    expect(result.exitCode).toBe(5);
    expect(result.running).toBe(false);
  });

  test('should include pid in output', async () => {
    const bashResult = await bashTool.handler(
      {
        command: 'echo "test"',
        run_in_background: true,
      },
      context
    );

    const shellId = bashResult.shellId!;

    const result = await tool.handler({ shellId }, context);

    expect(result.pid).toBeGreaterThan(0);
  });
});
