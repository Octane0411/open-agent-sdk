import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import { GlobTool } from '../../src/tools/glob';
import type { ToolContext } from '../../src/types/tools';

describe('Glob Tool', () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'glob-test-'));
    context = { cwd: tempDir, env: {} };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should match basic glob pattern **/*.ts', async () => {
    writeFileSync(join(tempDir, 'file1.ts'), '');
    writeFileSync(join(tempDir, 'file2.ts'), '');
    writeFileSync(join(tempDir, 'file.js'), '');

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: '**/*.ts' }, context);

    expect(result.files).toHaveLength(2);
    expect(result.files).toContain(join(tempDir, 'file1.ts'));
    expect(result.files).toContain(join(tempDir, 'file2.ts'));
    expect(result.count).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it('should search in subdirectory when path is specified', async () => {
    const subDir = join(tempDir, 'src');
    mkdirSync(subDir);
    writeFileSync(join(subDir, 'sub.ts'), '');
    writeFileSync(join(tempDir, 'root.ts'), '');

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: '*.ts', path: 'src' }, context);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toBe(join(subDir, 'sub.ts'));
    expect(result.count).toBe(1);
  });

  it('should return empty array when no matches', async () => {
    writeFileSync(join(tempDir, 'file.js'), '');

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: '*.nonexistent' }, context);

    expect(result.files).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('should handle invalid pattern gracefully', async () => {
    const tool = new GlobTool();
    const result = await tool.handler({ pattern: '[invalid' }, context);

    expect(typeof result.error).toBe('string');
    expect(result.files).toBeUndefined();
    expect(result.count).toBeUndefined();
  });

  it('should resolve relative path from cwd', async () => {
    writeFileSync(join(tempDir, 'relative.ts'), '');

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: '*.ts' }, context);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toBe(join(tempDir, 'relative.ts'));
  });

  it('should return results sorted alphabetically', async () => {
    writeFileSync(join(tempDir, 'z.ts'), '');
    writeFileSync(join(tempDir, 'a.ts'), '');
    writeFileSync(join(tempDir, 'm.ts'), '');

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: '*.ts' }, context);

    expect(result.files).toEqual([
      join(tempDir, 'a.ts'),
      join(tempDir, 'm.ts'),
      join(tempDir, 'z.ts'),
    ]);
  });

  it('should return results sorted by modification time desc', async () => {
    const file1 = join(tempDir, 'oldest.ts');
    const file2 = join(tempDir, 'middle.ts');
    const file3 = join(tempDir, 'newest.ts');

    writeFileSync(file1, '');
    // Small delay to ensure different mtime
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(file2, '');
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(file3, '');

    const tool = new GlobTool();
    const result = await tool.handler(
      { pattern: '*.ts', sort: 'mtime' },
      context
    );

    // Should be sorted by mtime desc (newest first)
    expect(result.files[0]).toBe(file3);
    expect(result.files[1]).toBe(file2);
    expect(result.files[2]).toBe(file1);
  });

  it('should support * wildcard for single directory', async () => {
    mkdirSync(join(tempDir, 'src'));
    writeFileSync(join(tempDir, 'src', 'file.ts'), '');
    writeFileSync(join(tempDir, 'root.ts'), '');

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: 'src/*.ts' }, context);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toBe(join(tempDir, 'src', 'file.ts'));
  });

  it('should support ? wildcard for single character', async () => {
    writeFileSync(join(tempDir, 'file1.ts'), '');
    writeFileSync(join(tempDir, 'file12.ts'), '');

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: 'file?.ts' }, context);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toBe(join(tempDir, 'file1.ts'));
  });

  it('should support ** recursive pattern', async () => {
    const deepDir = join(tempDir, 'a', 'b', 'c');
    mkdirSync(deepDir, { recursive: true });
    writeFileSync(join(deepDir, 'deep.ts'), '');

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: '**/*.ts' }, context);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toBe(join(deepDir, 'deep.ts'));
  });

  it('should limit results to max 1000 files', async () => {
    // Create 1005 files
    for (let i = 0; i < 1005; i++) {
      writeFileSync(join(tempDir, `file${i}.ts`), '');
    }

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: '*.ts' }, context);

    expect(result.files.length).toBeLessThanOrEqual(1000);
    expect(result.count).toBeLessThanOrEqual(1000);
  });

  it('should handle absolute path parameter', async () => {
    const subDir = join(tempDir, 'subdir');
    mkdirSync(subDir);
    writeFileSync(join(subDir, 'file.ts'), '');

    const tool = new GlobTool();
    const result = await tool.handler({ pattern: '*.ts', path: subDir }, context);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toBe(join(subDir, 'file.ts'));
  });
});
