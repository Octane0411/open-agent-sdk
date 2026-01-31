import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WriteTool } from '../../src/tools/write';
import type { ToolContext } from '../../src/types/tools';

describe('Write Tool', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'write-test-'));
    context = { cwd: tempDir, env: {} };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should write a new file', async () => {
    const filePath = join(tempDir, 'newfile.txt');

    const tool = new WriteTool();
    const result = await tool.handler(
      { file_path: filePath, content: 'New content' },
      context
    );

    expect(result.message).toContain('created');
    expect(readFileSync(filePath, 'utf-8')).toBe('New content');
  });

  it('should overwrite existing file', async () => {
    const filePath = join(tempDir, 'existing.txt');
    writeFileSync(filePath, 'Old content');

    const tool = new WriteTool();
    const result = await tool.handler(
      { file_path: filePath, content: 'New content' },
      context
    );

    expect(result.message).toContain('overwritten');
    expect(readFileSync(filePath, 'utf-8')).toBe('New content');
  });

  it('should create parent directories', async () => {
    const filePath = join(tempDir, 'nested', 'deep', 'file.txt');

    const tool = new WriteTool();
    const result = await tool.handler(
      { file_path: filePath, content: 'Nested content' },
      context
    );

    expect(result.message).toContain('created');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('Nested content');
  });

  it('should write relative to cwd', async () => {
    const tool = new WriteTool();
    const result = await tool.handler(
      { file_path: 'relative.txt', content: 'Relative content' },
      context
    );

    expect(existsSync(join(tempDir, 'relative.txt'))).toBe(true);
    expect(readFileSync(join(tempDir, 'relative.txt'), 'utf-8')).toBe('Relative content');
  });

  it('should handle empty content', async () => {
    const filePath = join(tempDir, 'empty.txt');

    const tool = new WriteTool();
    const result = await tool.handler({ file_path: filePath, content: '' }, context);

    expect(result.message).toContain('created');
    expect(readFileSync(filePath, 'utf-8')).toBe('');
  });
});

// Helper for writing files in tests
function writeFileSync(path: string, content: string): void {
  const { writeFileSync: fsWriteFileSync } = require('fs');
  fsWriteFileSync(path, content);
}
