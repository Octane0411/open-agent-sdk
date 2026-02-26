import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BashTool } from '../../src/tools/bash';
import type { ToolContext } from '../../src/types/tools';

describe('Bash Tool', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bash-test-'));
    context = { cwd: tempDir, env: {} };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should execute echo command', async () => {
    const tool = new BashTool();
    const result = await tool.handler(
      { command: 'echo "Hello World"', description: 'Test echo' },
      context
    );

    expect(result.output.trim()).toBe('Hello World');
    expect(result.exitCode).toBe(0);
  });

  it('should capture stdout', async () => {
    const tool = new BashTool();
    const result = await tool.handler(
      { command: 'echo "stdout content"', description: 'Test stdout' },
      context
    );

    expect(result.output).toContain('stdout content');
    expect(result.exitCode).toBe(0);
  });

  it('should capture stderr', async () => {
    const tool = new BashTool();
    const result = await tool.handler(
      { command: 'echo "error message" >&2', description: 'Test stderr' },
      context
    );

    expect(result.output).toContain('error message');
  });

  it('should return non-zero exit code on failure', async () => {
    const tool = new BashTool();
    const result = await tool.handler(
      { command: 'exit 42', description: 'Test exit code' },
      context
    );

    expect(result.exitCode).toBe(42);
  });

  it('should respect cwd', async () => {
    const tool = new BashTool();
    const result = await tool.handler(
      { command: 'pwd', description: 'Test cwd' },
      context
    );

    expect(result.output.trim()).toBe(tempDir);
  });

  it('should timeout long-running commands', async () => {
    const tool = new BashTool();
    const result = await tool.handler(
      { command: 'sleep 10', timeout: 100, description: 'Test timeout' },
      context
    );

    expect(result.killed).toBe(true);
    expect(result.output).toContain('timed out');
  });

  it('should run command in background', async () => {
    const tool = new BashTool();
    const result = await tool.handler(
      { command: 'sleep 1 && echo done', run_in_background: true, description: 'Test background' },
      context
    );

    expect(typeof result.shellId).toBe('string');
    expect(result.shellId.length).toBeGreaterThan(0);
    expect(result.output).toContain('background');
  });

  it('should handle empty command', async () => {
    const tool = new BashTool();
    const result = await tool.handler(
      { command: '', description: 'Test empty' },
      context
    );

    expect(result.exitCode).toBe(0);
  });

  it('should handle environment variables', async () => {
    const tool = new BashTool();
    const result = await tool.handler(
      { command: 'echo $TEST_VAR', description: 'Test env' },
      { cwd: tempDir, env: { TEST_VAR: 'test_value' } }
    );

    expect(result.output.trim()).toBe('test_value');
  });
});
