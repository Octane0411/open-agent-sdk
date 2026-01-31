import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EditTool } from '../../src/tools/edit';
import type { ToolContext } from '../../src/types/tools';

describe('Edit Tool', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'edit-test-'));
    context = { cwd: tempDir, env: {} };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should replace single occurrence', async () => {
    const filePath = join(tempDir, 'test.txt');
    writeFileSync(filePath, 'Hello World');

    const tool = new EditTool();
    const result = await tool.handler(
      { file_path: filePath, old_string: 'Hello', new_string: 'Hi' },
      context
    );

    expect(result.replacements).toBe(1);
    expect(readFileSync(filePath, 'utf-8')).toBe('Hi World');
  });

  it('should replace with replace_all', async () => {
    const filePath = join(tempDir, 'test.txt');
    writeFileSync(filePath, 'foo bar foo baz foo');

    const tool = new EditTool();
    const result = await tool.handler(
      { file_path: filePath, old_string: 'foo', new_string: 'xxx', replace_all: true },
      context
    );

    expect(result.replacements).toBe(3);
    expect(readFileSync(filePath, 'utf-8')).toBe('xxx bar xxx baz xxx');
  });

  it('should fail when old_string not found', async () => {
    const filePath = join(tempDir, 'test.txt');
    writeFileSync(filePath, 'Hello World');

    const tool = new EditTool();
    const result = await tool.handler(
      { file_path: filePath, old_string: 'NotFound', new_string: 'Replacement' },
      context
    );

    expect(result.error).toContain('not found');
    expect(readFileSync(filePath, 'utf-8')).toBe('Hello World');
  });

  it('should fail when old_string appears multiple times without replace_all', async () => {
    const filePath = join(tempDir, 'test.txt');
    writeFileSync(filePath, 'foo bar foo');

    const tool = new EditTool();
    const result = await tool.handler(
      { file_path: filePath, old_string: 'foo', new_string: 'xxx' },
      context
    );

    expect(result.error).toContain('appears');
    expect(result.error).toContain('times');
    expect(readFileSync(filePath, 'utf-8')).toBe('foo bar foo');
  });

  it('should handle multiline replacement', async () => {
    const filePath = join(tempDir, 'test.txt');
    writeFileSync(filePath, 'Line 1\nLine 2\nLine 3');

    const tool = new EditTool();
    const result = await tool.handler(
      { file_path: filePath, old_string: 'Line 2', new_string: 'Modified Line 2' },
      context
    );

    expect(result.replacements).toBe(1);
    expect(readFileSync(filePath, 'utf-8')).toBe('Line 1\nModified Line 2\nLine 3');
  });

  it('should handle non-existent file', async () => {
    const filePath = join(tempDir, 'nonexistent.txt');

    const tool = new EditTool();
    const result = await tool.handler(
      { file_path: filePath, old_string: 'foo', new_string: 'bar' },
      context
    );

    expect(result.error).toContain('does not exist');
  });

  it('should edit relative to cwd', async () => {
    writeFileSync(join(tempDir, 'relative.txt'), 'original content');

    const tool = new EditTool();
    const result = await tool.handler(
      { file_path: 'relative.txt', old_string: 'original', new_string: 'modified' },
      context
    );

    expect(result.replacements).toBe(1);
    expect(readFileSync(join(tempDir, 'relative.txt'), 'utf-8')).toBe('modified content');
  });
});
