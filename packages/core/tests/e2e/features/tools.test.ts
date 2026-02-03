/**
 * Tools E2E Tests
 * Tests each tool with real API interactions
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { prompt, createSession } from '../../../src/index';
import type { Session } from '../../../src/session';
import {
  TEST_CONFIG,
  isProviderAvailable,
  skipIfNoProvider,
  getPromptOptions,
  getSessionOptions,
  createTempDir,
  cleanupTempDir,
} from '../setup';
import { join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

// Skip all tests if no providers are available
const hasProvider = isProviderAvailable('openai') || isProviderAvailable('google');
const describeIfProvider = hasProvider ? describe : describe.skip;

describeIfProvider('Tools E2E', () => {
  let tempDir: string;
  let session: Session | null = null;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(async () => {
    if (session) {
      await session.close();
      session = null;
    }
    cleanupTempDir(tempDir);
  });

  describe('Read Tool', () => {
    test('should read text files', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'readme.txt'), 'Hello, this is a test file!');

      const result = await prompt(
        'Read the file readme.txt and tell me what it says',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result.toLowerCase()).toContain('hello');
      expect(result.result.toLowerCase()).toContain('test');
    }, TEST_CONFIG.timeout);

    test('should read code files and analyze', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(
        join(tempDir, 'utils.ts'),
        `export function add(a: number, b: number): number {\n  return a + b;\n}`
      );

      const result = await prompt(
        'Read utils.ts and tell me what function it contains and what it does',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result.toLowerCase()).toContain('add');
      expect(result.result.toLowerCase()).toContain('function');
    }, TEST_CONFIG.timeout);

    test('should handle file not found', async () => {
      if (skipIfNoProvider("openai")) return;

      const result = await prompt(
        'Try to read nonexistent.txt and report what happens',
        getPromptOptions('openai', { cwd: tempDir })
      );

      // Agent should report the error
      expect(result.result.toLowerCase()).toContain('not found');
    }, TEST_CONFIG.timeout);
  });

  describe('Write Tool', () => {
    test('should create new files', async () => {
      if (skipIfNoProvider("openai")) return;

      const result = await prompt(
        'Create a file called greeting.txt with the content "Hello World"',
        getPromptOptions('openai', { cwd: tempDir })
      );

      const filePath = join(tempDir, 'greeting.txt');
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, 'utf-8')).toContain('Hello World');
    }, TEST_CONFIG.timeout);

    test('should create project structure', async () => {
      if (skipIfNoProvider("openai")) return;

      await prompt(
        'Create a src directory with index.ts containing "export const app = {}"',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(existsSync(join(tempDir, 'src'))).toBe(true);
      expect(existsSync(join(tempDir, 'src', 'index.ts'))).toBe(true);
      expect(readFileSync(join(tempDir, 'src', 'index.ts'), 'utf-8')).toContain('export const app');
    }, TEST_CONFIG.timeout);

    test('should create files with special content', async () => {
      if (skipIfNoProvider("openai")) return;

      await prompt(
        'Create config.json with {"name": "test", "version": "1.0.0"}',
        getPromptOptions('openai', { cwd: tempDir })
      );

      const configPath = join(tempDir, 'config.json');
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      expect(config.name).toBe('test');
      expect(config.version).toBe('1.0.0');
    }, TEST_CONFIG.timeout);
  });

  describe('Edit Tool', () => {
    test('should modify existing files', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'config.txt'), 'version: 1.0\nname: old-name');

      const result = await prompt(
        'Edit config.txt to change "old-name" to "new-name"',
        getPromptOptions('openai', { cwd: tempDir })
      );

      const content = readFileSync(join(tempDir, 'config.txt'), 'utf-8');
      expect(content).toContain('new-name');
      expect(content).not.toContain('old-name');
    }, TEST_CONFIG.timeout);

    test('should update version numbers', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(
        join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2)
      );

      await prompt(
        'Update the version in package.json from 1.0.0 to 2.0.0',
        getPromptOptions('openai', { cwd: tempDir })
      );

      const pkg = JSON.parse(readFileSync(join(tempDir, 'package.json'), 'utf-8'));
      expect(pkg.version).toBe('2.0.0');
    }, TEST_CONFIG.timeout);
  });

  describe('Bash Tool', () => {
    test('should execute shell commands', async () => {
      if (skipIfNoProvider("openai")) return;

      const result = await prompt(
        'Use Bash to run "echo Hello from bash" and report the output',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result.toLowerCase()).toContain('hello');
      expect(result.result.toLowerCase()).toContain('bash');
    }, TEST_CONFIG.timeout);

    test('should check directory contents', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'a.txt'), 'a');
      writeFileSync(join(tempDir, 'b.txt'), 'b');

      const result = await prompt(
        'Use Bash to list all files and count how many there are',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result).toContain('2');
    }, TEST_CONFIG.timeout);

    test('should use allowedTools to restrict Bash', async () => {
      if (skipIfNoProvider("openai")) return;

      const result = await prompt(
        'Try to run "echo test" using Bash. If you cannot, say "Bash not available"',
        getPromptOptions('openai', {
          cwd: tempDir,
          allowedTools: ['Read', 'Write'],
        })
      );

      expect(result.result.toLowerCase()).toContain('not available');
    }, TEST_CONFIG.timeout);
  });

  describe('Glob Tool', () => {
    test('should find files by pattern', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'a.ts'), '');
      writeFileSync(join(tempDir, 'b.ts'), '');
      writeFileSync(join(tempDir, 'c.js'), '');

      const result = await prompt(
        'Use Glob to find all .ts files and tell me how many there are',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result).toContain('2');
    }, TEST_CONFIG.timeout);

    test('should find nested files', async () => {
      if (skipIfNoProvider("openai")) return;

      mkdirSync(join(tempDir, 'src', 'components'), { recursive: true });
      writeFileSync(join(tempDir, 'src', 'index.ts'), '');
      writeFileSync(join(tempDir, 'src', 'components', 'Button.ts'), '');
      writeFileSync(join(tempDir, 'src', 'components', 'Input.ts'), '');

      const result = await prompt(
        'Find all .ts files recursively and list them',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result.toLowerCase()).toContain('button');
      expect(result.result.toLowerCase()).toContain('input');
    }, TEST_CONFIG.timeout);
  });

  describe('Grep Tool', () => {
    test('should search for text patterns', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'file1.ts'), 'const user = "Alice";');
      writeFileSync(join(tempDir, 'file2.ts'), 'const admin = "Bob";');
      writeFileSync(join(tempDir, 'file3.ts'), 'const user = "Charlie";');

      const result = await prompt(
        'Use Grep to search for "user" and tell me how many matches there are',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result).toContain('2');
    }, TEST_CONFIG.timeout);

    test('should search with file filter', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'users.ts'), 'const users = [];');
      writeFileSync(join(tempDir, 'data.js'), 'const users = [];');

      const result = await prompt(
        'Search for "users" in .ts files only',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result.toLowerCase()).toContain('users.ts');
    }, TEST_CONFIG.timeout);
  });

  describe('Tool Chains', () => {
    test('should chain Write then Glob', async () => {
      if (skipIfNoProvider("openai")) return;

      const result = await prompt(
        'Create files test1.ts and test2.ts, then use Glob to list all .ts files',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(existsSync(join(tempDir, 'test1.ts'))).toBe(true);
      expect(existsSync(join(tempDir, 'test2.ts'))).toBe(true);
      expect(result.result).toContain('2');
    }, TEST_CONFIG.timeout);

    test('should chain Glob then Read', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'config.json'), '{"key": "secret123"}');

      const result = await prompt(
        'Find config.json and read its contents to tell me the key value',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result).toContain('secret123');
    }, TEST_CONFIG.timeout);

    test('should chain Read then Edit', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'data.txt'), 'status: pending');

      const result = await prompt(
        'Read data.txt, then edit it to change status to "completed"',
        getPromptOptions('openai', { cwd: tempDir })
      );

      const content = readFileSync(join(tempDir, 'data.txt'), 'utf-8');
      expect(content).toContain('completed');
      expect(content).not.toContain('pending');
    }, TEST_CONFIG.timeout);

    test('should create TypeScript project structure', async () => {
      if (skipIfNoProvider("openai")) return;

      const result = await prompt(
        'Create a TypeScript project with src/index.ts (exports main function) and ' +
        'src/utils.ts (exports helper function), then list all ts files',
        getPromptOptions('openai', { cwd: tempDir, maxTurns: 5 })
      );

      expect(existsSync(join(tempDir, 'src', 'index.ts'))).toBe(true);
      expect(existsSync(join(tempDir, 'src', 'utils.ts'))).toBe(true);
      expect(result.result).toContain('2');
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Session Tool Integration', () => {
    test('should use tools across multiple session turns', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      // Turn 1: Create file
      await session.send('Create a file called notes.txt with "Meeting at 3pm"');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Turn 2: Read and update
      await session.send('Read notes.txt and append " - Bring laptop" to it');
      const messages: Array<{ type: string; tool_name?: string; result?: unknown }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; tool_name?: string; result?: unknown });
      }

      // Verify file content
      const content = readFileSync(join(tempDir, 'notes.txt'), 'utf-8');
      expect(content).toContain('Meeting at 3pm');
      expect(content).toContain('Bring laptop');

      // Should have tool results
      const toolResults = messages.filter((m) => m.type === 'tool_result');
      expect(toolResults.length).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Google Provider Tools', () => {
    test('should use Read tool with Google', async () => {
      skipIfNoProvider('google');

      writeFileSync(join(tempDir, 'data.txt'), 'Google test content');

      const result = await prompt(
        'Read data.txt and tell me what it says',
        getPromptOptions('google', { cwd: tempDir })
      );

      expect(result.result.toLowerCase()).toContain('google');
      expect(result.result.toLowerCase()).toContain('test');
    }, TEST_CONFIG.timeout);

    test('should use Write tool with Google', async () => {
      skipIfNoProvider('google');

      const result = await prompt(
        'Create google-test.txt with "Created by Gemini"',
        getPromptOptions('google', { cwd: tempDir })
      );

      expect(existsSync(join(tempDir, 'google-test.txt'))).toBe(true);
      expect(readFileSync(join(tempDir, 'google-test.txt'), 'utf-8')).toContain('Gemini');
    }, TEST_CONFIG.timeout);
  });
});
