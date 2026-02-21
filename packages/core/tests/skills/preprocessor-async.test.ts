import { describe, it, expect } from 'bun:test';
import { preprocessContentAsync } from '../../src/skills/preprocessor';

describe('preprocessContentAsync', () => {
  it('should replace dynamic commands with output', async () => {
    const content = 'Current directory: !`pwd`';
    const context = {
      args: [],
      env: {},
      arguments: '',
    };

    const result = await preprocessContentAsync(content, context);
    expect(result).not.toContain('!`pwd`');
    expect(result).toContain('Current directory:');
  });

  it('should handle echo command', async () => {
    const content = 'Hello !`echo World`';
    const context = {
      args: [],
      env: {},
      arguments: '',
    };

    const result = await preprocessContentAsync(content, context);
    expect(result).toBe('Hello World');
  });

  it('should handle multiple commands', async () => {
    const content = 'A: !`echo 1`, B: !`echo 2`';
    const context = {
      args: [],
      env: {},
      arguments: '',
    };

    const result = await preprocessContentAsync(content, context);
    expect(result).toBe('A: 1, B: 2');
  });

  it('should handle command failure gracefully', async () => {
    const content = 'Result: !`exit 1`';
    const context = {
      args: [],
      env: {},
      arguments: '',
    };

    const result = await preprocessContentAsync(content, context);
    expect(result).toContain('[Command failed:');
  });

  it('should respect timeout option', async () => {
    const content = 'Result: !`sleep 10`';
    const context = {
      args: [],
      env: {},
      arguments: '',
    };

    const start = Date.now();
    const result = await preprocessContentAsync(content, context, { commandTimeout: 100 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    expect(result).toContain('[Command failed:');
  });

  it('should work with regular variable substitution', async () => {
    const content = 'Hello $0, today is !`date +%A`';
    const context = {
      args: ['World'],
      env: {},
      arguments: 'World',
    };

    const result = await preprocessContentAsync(content, context);
    expect(result).toContain('Hello World');
    expect(result).not.toContain('!`');
  });

  it('should handle empty command output', async () => {
    const content = 'Output: !`true`';
    const context = {
      args: [],
      env: {},
      arguments: '',
    };

    const result = await preprocessContentAsync(content, context);
    expect(result).toBe('Output: ');
  });

  it('should use cwd option', async () => {
    const content = 'Dir: !`pwd`';
    const context = {
      args: [],
      env: {},
      arguments: '',
    };

    const result = await preprocessContentAsync(content, context, { cwd: '/tmp' });
    expect(result).toContain('/tmp');
  });
});
