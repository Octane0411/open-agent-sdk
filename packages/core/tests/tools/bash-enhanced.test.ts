/**
 * Tests for enhanced bash background process tracking
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { BashTool, getBackgroundProcess } from '../../src/tools/bash';
import type { ToolContext } from '../../src/types/tools';

describe('BashTool - Enhanced Background Process Tracking', () => {
  let tool: BashTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new BashTool();
    context = {
      cwd: process.cwd(),
      env: {},
      abortController: new AbortController(),
    };
  });

  test('should return shellId when running in background', async () => {
    const result = await tool.handler(
      {
        command: 'echo "hello"',
        run_in_background: true,
      },
      context
    );

    expect(result.shellId).toBeDefined();
    expect(result.shellId).toMatch(/^shell_\d+$/);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('running in background');
  });

  test('should store process in backgroundProcesses map', async () => {
    const result = await tool.handler(
      {
        command: 'sleep 0.1',
        run_in_background: true,
      },
      context
    );

    const shellId = result.shellId!;
    const process = getBackgroundProcess(shellId);

    expect(process).toBeDefined();
    expect(process?.pid).toBeGreaterThan(0);
    expect(process?.startTime).toBeGreaterThan(0);
    expect(process?.stdout).toBeDefined();
    expect(process?.stderr).toBeDefined();
  });

  test('should capture stdout in background process', async () => {
    const result = await tool.handler(
      {
        command: 'echo "test output"',
        run_in_background: true,
      },
      context
    );

    const shellId = result.shellId!;

    // Wait for process to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const process = getBackgroundProcess(shellId);
    expect(process?.stdout).toContain('test output');
  });

  test('should capture stderr in background process', async () => {
    const result = await tool.handler(
      {
        command: 'echo "error message" >&2',
        run_in_background: true,
      },
      context
    );

    const shellId = result.shellId!;

    // Wait for process to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const process = getBackgroundProcess(shellId);
    expect(process?.stderr).toContain('error message');
  });

  test('should set exitCode when process exits', async () => {
    const result = await tool.handler(
      {
        command: 'exit 42',
        run_in_background: true,
      },
      context
    );

    const shellId = result.shellId!;

    // Wait for process to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const process = getBackgroundProcess(shellId);
    expect(process?.exitCode).toBe(42);
  });

  test('should keep process in map after exit', async () => {
    const result = await tool.handler(
      {
        command: 'echo "done"',
        run_in_background: true,
      },
      context
    );

    const shellId = result.shellId!;

    // Wait for process to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Process should still be in the map
    const process = getBackgroundProcess(shellId);
    expect(process).toBeDefined();
    expect(process?.stdout).toContain('done');
  });

  test('should store process reference in backgroundProcesses', async () => {
    const result = await tool.handler(
      {
        command: 'sleep 0.5',
        run_in_background: true,
      },
      context
    );

    const shellId = result.shellId!;
    const process = getBackgroundProcess(shellId);

    expect(process?.process).toBeDefined();
    expect(process?.process.pid).toBe(process?.pid);
  });
});
