import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GrepTool } from '../../src/tools/grep';
import type { ToolContext } from '../../src/types/tools';

describe('Grep Tool', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'grep-test-'));
    context = { cwd: tempDir, env: {} };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should match basic regex pattern', async () => {
    writeFileSync(
      join(tempDir, 'test.ts'),
      'function hello() {}\nfunction world() {}\nconst x = 1;'
    );

    const tool = new GrepTool();
    const result = await tool.handler(
      { pattern: 'function\\s+\\w+' },
      context
    );

    expect(result.matches).toHaveLength(2);
    expect(result.matches![0].content).toContain('function hello');
    expect(result.matches![1].content).toContain('function world');
    expect(result.count).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it('should search in specific directory when path is specified', async () => {
    const srcDir = join(tempDir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'file.ts'), 'function srcFunc() {}');
    writeFileSync(join(tempDir, 'root.ts'), 'function rootFunc() {}');

    const tool = new GrepTool();
    const result = await tool.handler(
      { pattern: 'function', path: 'src' },
      context
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches![0].file).toBe(join(srcDir, 'file.ts'));
    expect(result.matches![0].content).toContain('srcFunc');
  });

  it('should filter by glob pattern', async () => {
    writeFileSync(join(tempDir, 'file.ts'), 'function test() {}');
    writeFileSync(join(tempDir, 'file.js'), 'function test() {}');

    const tool = new GrepTool();
    const result = await tool.handler(
      { pattern: 'function', glob: '*.ts' },
      context
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches![0].file).toBe(join(tempDir, 'file.ts'));
  });

  it('should support multiline matching', async () => {
    writeFileSync(
      join(tempDir, 'test.ts'),
      'function test() {\n  return 1;\n}'
    );

    const tool = new GrepTool();
    const result = await tool.handler(
      { pattern: 'function.*\\{[\\s\\S]*?\\}', multiline: true },
      context
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches![0].content).toContain('function test');
  });

  it('should return empty array when no matches', async () => {
    writeFileSync(join(tempDir, 'test.ts'), 'const x = 1;');

    const tool = new GrepTool();
    const result = await tool.handler(
      { pattern: 'nonexistent' },
      context
    );

    expect(result.matches).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('should handle invalid regex gracefully', async () => {
    const tool = new GrepTool();
    const result = await tool.handler(
      { pattern: '[invalid' },
      context
    );

    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.matches).toBeUndefined();
    expect(result.count).toBeUndefined();
  });

  it('should return file, line, and content for each match', async () => {
    const filePath = join(tempDir, 'test.ts');
    writeFileSync(filePath, 'line 1\nfunction test() {}\nline 3');

    const tool = new GrepTool();
    const result = await tool.handler({ pattern: 'function' }, context);

    expect(result.matches).toHaveLength(1);
    expect(result.matches![0].file).toBe(filePath);
    expect(result.matches![0].line).toBe(2);
    expect(result.matches![0].content).toBe('function test() {}');
  });

  it('should resolve relative path from cwd', async () => {
    writeFileSync(join(tempDir, 'test.ts'), 'function test() {}');

    const tool = new GrepTool();
    const result = await tool.handler({ pattern: 'function' }, context);

    expect(result.matches).toHaveLength(1);
    expect(result.matches![0].file).toBe(join(tempDir, 'test.ts'));
  });

  it('should limit matches to max 100', async () => {
    // Create file with many matches
    const lines = Array(150).fill('function test() {}');
    writeFileSync(join(tempDir, 'test.ts'), lines.join('\n'));

    const tool = new GrepTool();
    const result = await tool.handler({ pattern: 'function' }, context);

    expect(result.matches!.length).toBeLessThanOrEqual(100);
    expect(result.count).toBeLessThanOrEqual(100);
  });

  it('should search recursively in subdirectories', async () => {
    const deepDir = join(tempDir, 'a', 'b', 'c');
    mkdirSync(deepDir, { recursive: true });
    writeFileSync(join(deepDir, 'deep.ts'), 'function deepFunc() {}');

    const tool = new GrepTool();
    const result = await tool.handler({ pattern: 'function' }, context);

    expect(result.matches).toHaveLength(1);
    expect(result.matches![0].content).toContain('deepFunc');
  });

  it('should handle case insensitive flag', async () => {
    writeFileSync(join(tempDir, 'test.ts'), 'FUNCTION test() {}');

    const tool = new GrepTool();
    const result = await tool.handler(
      { pattern: 'function', ignoreCase: true },
      context
    );

    expect(result.matches).toHaveLength(1);
  });

  it('should handle binary files gracefully', async () => {
    // Create a binary-like file
    const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    writeFileSync(join(tempDir, 'binary.bin'), binaryContent);

    const tool = new GrepTool();
    const result = await tool.handler({ pattern: 'test' }, context);

    // Should not crash, may or may not find matches
    expect(result.error).toBeUndefined();
  });

  it('should skip files larger than 1MB', async () => {
    // Create a large file (> 1MB)
    const largeContent = 'x'.repeat(2 * 1024 * 1024);
    writeFileSync(join(tempDir, 'large.ts'), largeContent);

    const tool = new GrepTool();
    const result = await tool.handler({ pattern: 'x' }, context);

    // Should not find matches in skipped file
    const largeFileMatches = result.matches!.filter((m) =>
      m.file.includes('large.ts')
    );
    expect(largeFileMatches).toHaveLength(0);
  });

  it('should handle multiple files with matches', async () => {
    writeFileSync(join(tempDir, 'file1.ts'), 'function a() {}');
    writeFileSync(join(tempDir, 'file2.ts'), 'function b() {}');

    const tool = new GrepTool();
    const result = await tool.handler({ pattern: 'function' }, context);

    expect(result.matches).toHaveLength(2);
    const files = result.matches!.map((m) => m.file);
    expect(files).toContain(join(tempDir, 'file1.ts'));
    expect(files).toContain(join(tempDir, 'file2.ts'));
  });

  describe('output_mode', () => {
    it('should return only file paths when output_mode is files_with_matches', async () => {
      writeFileSync(join(tempDir, 'file1.ts'), 'function a() {}\nfunction b() {}');
      writeFileSync(join(tempDir, 'file2.ts'), 'function c() {}');
      writeFileSync(join(tempDir, 'file3.ts'), 'const x = 1;');

      const tool = new GrepTool();
      const result = await tool.handler(
        { pattern: 'function', output_mode: 'files_with_matches' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.files).toHaveLength(2);
      expect(result.files).toContain(join(tempDir, 'file1.ts'));
      expect(result.files).toContain(join(tempDir, 'file2.ts'));
      expect(result.matches).toBeUndefined();
      expect(result.count).toBeUndefined();
    });

    it('should return count per file when output_mode is count', async () => {
      writeFileSync(join(tempDir, 'file1.ts'), 'function a() {}\nfunction b() {}');
      writeFileSync(join(tempDir, 'file2.ts'), 'function c() {}');

      const tool = new GrepTool();
      const result = await tool.handler(
        { pattern: 'function', output_mode: 'count' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(typeof result.fileCounts).toBe('object');
      expect(result.fileCounts).not.toBeNull();
      expect(result.fileCounts![join(tempDir, 'file1.ts')]).toBe(2);
      expect(result.fileCounts![join(tempDir, 'file2.ts')]).toBe(1);
      expect(result.matches).toBeUndefined();
      expect(result.count).toBeUndefined();
    });

    it('should return content matches when output_mode is content (default)', async () => {
      writeFileSync(join(tempDir, 'file.ts'), 'function test() {}');

      const tool = new GrepTool();
      const result = await tool.handler(
        { pattern: 'function', output_mode: 'content' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.matches).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.files).toBeUndefined();
      expect(result.fileCounts).toBeUndefined();
    });

    it('should default to content mode when output_mode is not specified', async () => {
      writeFileSync(join(tempDir, 'file.ts'), 'function test() {}');

      const tool = new GrepTool();
      const result = await tool.handler({ pattern: 'function' }, context);

      expect(result.error).toBeUndefined();
      expect(result.matches).toHaveLength(1);
      expect(result.count).toBe(1);
    });
  });

  describe('head_limit', () => {
    it('should limit results to head_limit count', async () => {
      const lines = Array(150).fill('function test() {}');
      writeFileSync(join(tempDir, 'test.ts'), lines.join('\n'));

      const tool = new GrepTool();
      const result = await tool.handler(
        { pattern: 'function', head_limit: 10 },
        context
      );

      expect(result.matches).toHaveLength(10);
      expect(result.count).toBe(10);
    });

    it('should default to 100 when head_limit not specified', async () => {
      const lines = Array(150).fill('function test() {}');
      writeFileSync(join(tempDir, 'test.ts'), lines.join('\n'));

      const tool = new GrepTool();
      const result = await tool.handler({ pattern: 'function' }, context);

      expect(result.matches!.length).toBe(100);
      expect(result.count).toBe(100);
    });
  });

  describe('offset', () => {
    it('should skip first N matches when offset is specified', async () => {
      const lines = Array(10).fill('function test() {}');
      writeFileSync(join(tempDir, 'test.ts'), lines.join('\n'));

      const tool = new GrepTool();
      const result = await tool.handler(
        { pattern: 'function', head_limit: 5, offset: 5 },
        context
      );

      expect(result.matches).toHaveLength(5);
      expect(result.matches![0].line).toBe(6);
      expect(result.matches![4].line).toBe(10);
    });

    it('should return empty when offset exceeds total matches', async () => {
      writeFileSync(join(tempDir, 'test.ts'), 'function test() {}');

      const tool = new GrepTool();
      const result = await tool.handler(
        { pattern: 'function', offset: 10 },
        context
      );

      expect(result.matches).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('context lines', () => {
    it('should include context lines with -C option', async () => {
      writeFileSync(
        join(tempDir, 'test.ts'),
        'line 1\nline 2\nfunction test() {}\nline 4\nline 5'
      );

      const tool = new GrepTool();
      const result = await tool.handler(
        { pattern: 'function', context: 2 },
        context
      );

      expect(result.matches).toHaveLength(1);
      expect(result.matches![0].content).toContain('function test() {}');
      expect(result.matches![0].context_before).toEqual(['line 1', 'line 2']);
      expect(result.matches![0].context_after).toEqual(['line 4', 'line 5']);
    });

    it('should support separate -B (before) option', async () => {
      writeFileSync(
        join(tempDir, 'test.ts'),
        'line 1\nline 2\nfunction test() {}\nline 4'
      );

      const tool = new GrepTool();
      const result = await tool.handler(
        { pattern: 'function', before_context: 2 },
        context
      );

      expect(result.matches![0].context_before).toEqual(['line 1', 'line 2']);
      expect(result.matches![0].context_after).toBeUndefined();
    });

    it('should support separate -A (after) option', async () => {
      writeFileSync(
        join(tempDir, 'test.ts'),
        'line 1\nfunction test() {}\nline 3\nline 4'
      );

      const tool = new GrepTool();
      const result = await tool.handler(
        { pattern: 'function', after_context: 2 },
        context
      );

      expect(result.matches![0].context_before).toBeUndefined();
      expect(result.matches![0].context_after).toEqual(['line 3', 'line 4']);
    });
  });
});
