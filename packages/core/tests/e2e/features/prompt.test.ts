/**
 * prompt() Function E2E Tests
 * Tests the main prompt() function with real APIs
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { prompt } from '../../../src/index';
import {
  TEST_CONFIG,
  isProviderAvailable,
  skipIfNoProvider,
  getPromptOptions,
  createTempDir,
  cleanupTempDir,
} from '../setup';
import { join } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';

// Skip all tests if no providers are available
const hasProvider = isProviderAvailable('openai') || isProviderAvailable('google');
const describeIfProvider = hasProvider ? describe : describe.skip;

describeIfProvider('prompt() E2E', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('Simple Q&A', () => {
    test('should answer simple question without tools', async () => {
      if (skipIfNoProvider('openai')) return;

      const result = await prompt(
        'What is 2 + 2? Answer with just the number.',
        getPromptOptions('openai')
      );

      expect(result.result).toContain('4');
      expect(result.duration_ms).toBeGreaterThan(0);
      expect(result.usage.input_tokens).toBeGreaterThan(0);
      expect(result.usage.output_tokens).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout);

    test('should work with Google provider', async () => {
      if (skipIfNoProvider('google')) return;

      const result = await prompt(
        'What is 3 + 3? Answer with just the number.',
        getPromptOptions('google')
      );

      expect(result.result).toContain('6');
      expect(result.duration_ms).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout);
  });

  describe('Single Tool Call', () => {
    test('should use Bash tool to check current directory', async () => {
      if (skipIfNoProvider('openai')) return;

      const result = await prompt(
        'Use the Bash tool to run "pwd" and tell me the current directory name only (last part of the path).',
        getPromptOptions('openai', { cwd: tempDir })
      );

      // The result should contain the temp directory name
      const tempDirName = tempDir.split('/').pop();
      expect(result.result.toLowerCase()).toContain(tempDirName?.toLowerCase());
    }, TEST_CONFIG.timeout);

    test('should use Read tool to read a file', async () => {
      if (skipIfNoProvider('openai')) return;

      // Create a test file
      const testFile = join(tempDir, 'test.txt');
      writeFileSync(testFile, 'Hello from E2E test!');

      const result = await prompt(
        'Read the file test.txt and tell me its contents.',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result.toLowerCase()).toContain('hello');
      expect(result.result.toLowerCase()).toContain('e2e');
    }, TEST_CONFIG.timeout);
  });

  describe('Multi-tool Chain', () => {
    test('should chain Glob and Read tools', async () => {
      if (skipIfNoProvider('openai')) return;

      // Create multiple test files
      writeFileSync(join(tempDir, 'file1.ts'), 'export const a = 1;');
      writeFileSync(join(tempDir, 'file2.ts'), 'export const b = 2;');
      writeFileSync(join(tempDir, 'c.md'), '# README');

      const result = await prompt(
        'List all .ts files in the current directory, then tell me how many there are.',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result).toContain('2');
    }, TEST_CONFIG.timeout);

    test('should use Write then Read tools', async () => {
      if (skipIfNoProvider('openai')) return;

      const result = await prompt(
        'Create a file called greeting.txt with the content "Hello World", then read it back to confirm.',
        getPromptOptions('openai', { cwd: tempDir })
      );

      // Verify file was created
      const filePath = join(tempDir, 'greeting.txt');
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, 'utf-8')).toContain('Hello');

      // Verify response mentions the content
      expect(result.result.toLowerCase()).toContain('hello');
    }, TEST_CONFIG.timeout);
  });

  describe('maxTurns Limit', () => {
    test('should respect maxTurns limit', async () => {
      if (skipIfNoProvider('openai')) return;

      const result = await prompt(
        'Keep asking me questions about my favorite color, then my favorite food, then my hobby.',
        getPromptOptions('openai', { maxTurns: 2 })
      );

      // With maxTurns: 2, the agent should stop after 2 turns
      // We can't directly verify turn count, but we can verify we got a result
      expect(result.result.length).toBeGreaterThan(0);
      expect(result.duration_ms).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout);
  });

  describe('allowedTools Filtering', () => {
    test('should only use allowed tools', async () => {
      if (skipIfNoProvider('openai')) return;

      // Create a file to read
      writeFileSync(join(tempDir, 'data.txt'), 'secret data');

      const result = await prompt(
        'Read data.txt and try to run "echo test" in bash. Only report what you were able to do.',
        getPromptOptions('openai', {
          cwd: tempDir,
          allowedTools: ['Read'],
        })
      );

      // Should be able to read the file
      expect(result.result.toLowerCase()).toContain('secret');
    }, TEST_CONFIG.timeout);

    test('should fail gracefully when tool is not allowed', async () => {
      if (skipIfNoProvider('openai')) return;

      const result = await prompt(
        'Try to use Bash to run "echo hello". If you cannot, say "I cannot use Bash".',
        getPromptOptions('openai', {
          allowedTools: ['Read', 'Write'],
        })
      );

      // The agent should indicate it cannot use Bash
      expect(result.result.toLowerCase()).toContain('cannot');
    }, TEST_CONFIG.timeout);
  });

  describe('System Prompt', () => {
    test('should respect systemPrompt', async () => {
      if (skipIfNoProvider('openai')) return;

      const result = await prompt(
        'Who are you? Introduce yourself in one sentence.',
        getPromptOptions('openai', {
          systemPrompt: 'You are a helpful coding assistant named CodeBot. Always mention your name.',
        })
      );

      expect(result.result.toLowerCase()).toContain('codebot');
    }, TEST_CONFIG.timeout);

    test('should work with Google provider and system prompt', async () => {
      if (skipIfNoProvider('google')) return;

      const result = await prompt(
        'Who are you? Introduce yourself in one sentence.',
        getPromptOptions('google', {
          systemPrompt: 'You are a helpful coding assistant named GeminiCoder. Always mention your name.',
        })
      );

      expect(result.result.toLowerCase()).toContain('geminicoder');
    }, TEST_CONFIG.timeout);
  });

  describe('Working Directory', () => {
    test('should use specified cwd for tool operations', async () => {
      if (skipIfNoProvider('openai')) return;

      // Create file in temp dir
      writeFileSync(join(tempDir, 'location.txt'), `Location: ${tempDir}`);

      const result = await prompt(
        'Use Glob to find all .txt files, then read location.txt and tell me the directory path.',
        getPromptOptions('openai', { cwd: tempDir })
      );

      expect(result.result).toContain(tempDir.split('/').pop());
    }, TEST_CONFIG.timeout);
  });

  describe('Error Handling', () => {
    test('should handle missing API key gracefully', async () => {
      await expect(
        prompt('Hello', {
          model: 'gpt-4o-mini',
          apiKey: '',
        })
      ).rejects.toThrow(/API key/);
    });

    test('should handle invalid model', async () => {
      if (skipIfNoProvider('openai')) return;

      await expect(
        prompt('Hello', {
          model: 'invalid-model-xyz',
          apiKey: TEST_CONFIG.openai.apiKey!,
        })
      ).rejects.toThrow();
    }, TEST_CONFIG.timeout);
  });

  describe('Complex Scenarios', () => {
    test('should handle file creation and analysis', async () => {
      if (skipIfNoProvider('openai')) return;

      const result = await prompt(
        'Create a file called numbers.txt with numbers 1-5 each on a new line, ' +
        'then read it and calculate the sum.',
        getPromptOptions('openai', { cwd: tempDir })
      );

      // Verify file was created
      const filePath = join(tempDir, 'numbers.txt');
      expect(existsSync(filePath)).toBe(true);

      // Verify sum was calculated (1+2+3+4+5 = 15)
      expect(result.result).toContain('15');
    }, TEST_CONFIG.timeout);

    test('should use Edit tool to modify files', async () => {
      if (skipIfNoProvider('openai')) return;

      // Create initial file
      writeFileSync(join(tempDir, 'config.txt'), 'version: 1.0\nname: test');

      const result = await prompt(
        'Edit config.txt to change version from 1.0 to 2.0, then read the file to confirm.',
        getPromptOptions('openai', { cwd: tempDir })
      );

      // Verify file was edited
      const content = readFileSync(join(tempDir, 'config.txt'), 'utf-8');
      expect(content).toContain('2.0');
      expect(content).not.toContain('1.0');

      // Verify response mentions the change
      expect(result.result).toContain('2.0');
    }, TEST_CONFIG.timeout);
  });
});
