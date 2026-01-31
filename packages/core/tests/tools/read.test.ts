import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ReadTool } from '../../src/tools/read';
import type { ToolContext } from '../../src/types/tools';

describe('Read Tool', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'read-test-'));
    context = { cwd: tempDir, env: {} };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should read a text file', async () => {
    const filePath = join(tempDir, 'test.txt');
    writeFileSync(filePath, 'Hello, World!');

    const tool = new ReadTool();
    const result = await tool.handler({ file_path: filePath }, context);

    expect(result.content).toBe('1\tHello, World!');
    expect(result.total_lines).toBe(1);
    expect(result.lines_returned).toBe(1);
  });

  it('should read file with line numbers', async () => {
    const filePath = join(tempDir, 'multiline.txt');
    writeFileSync(filePath, 'Line 1\nLine 2\nLine 3');

    const tool = new ReadTool();
    const result = await tool.handler({ file_path: filePath }, context);

    expect(result.content).toContain('1\tLine 1');
    expect(result.content).toContain('2\tLine 2');
    expect(result.content).toContain('3\tLine 3');
    expect(result.total_lines).toBe(3);
  });

  it('should read with offset and limit', async () => {
    const filePath = join(tempDir, 'multiline.txt');
    writeFileSync(filePath, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

    const tool = new ReadTool();
    const result = await tool.handler(
      { file_path: filePath, offset: 2, limit: 2 },
      context
    );

    expect(result.content).toContain('2\tLine 2');
    expect(result.content).toContain('3\tLine 3');
    expect(result.content).not.toContain('Line 1');
    expect(result.content).not.toContain('Line 4');
    expect(result.total_lines).toBe(5);
    expect(result.lines_returned).toBe(2);
  });

  it('should handle non-existent file', async () => {
    const tool = new ReadTool();
    const result = await tool.handler(
      { file_path: join(tempDir, 'nonexistent.txt') },
      context
    );

    expect(result.error).toContain('does not exist');
    expect(result.content).toBeUndefined();
  });

  it('should read relative path from cwd', async () => {
    writeFileSync(join(tempDir, 'relative.txt'), 'Relative content');

    const tool = new ReadTool();
    const result = await tool.handler({ file_path: 'relative.txt' }, context);

    expect(result.content).toBe('1\tRelative content');
  });

  it('should read image file as base64', async () => {
    const filePath = join(tempDir, 'test.png');
    // Create a minimal PNG header
    const pngData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    writeFileSync(filePath, pngData);

    const tool = new ReadTool();
    const result = await tool.handler({ file_path: filePath }, context);

    expect(result.image).toBeDefined();
    expect(result.mime_type).toBe('image/png');
    expect(result.content).toBeUndefined();
  });
});
