/**
 * Multi-turn Conversation E2E Tests
 * Tests complex multi-turn scenarios that previously had bugs
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createSession, prompt } from '../../../src/index';
import type { Session } from '../../../src/session';
import {
  TEST_CONFIG,
  isProviderAvailable,
  skipIfNoProvider,
  getSessionOptions,
  getPromptOptions,
  createTempDir,
  cleanupTempDir,
} from '../setup';
import { join } from 'path';
import { writeFileSync, readFileSync, existsSync } from 'fs';

// Skip all tests if no providers are available
const hasProvider = isProviderAvailable('openai') || isProviderAvailable('google');
const describeIfProvider = hasProvider ? describe : describe.skip;

describeIfProvider('Multi-turn Conversation E2E', () => {
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

  describe('Continuous Q&A', () => {
    test('should maintain math context across turns', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      const conversation = [
        { q: 'Calculate 5 + 3', expected: '8' },
        { q: 'Multiply that result by 2', expected: '16' },
        { q: 'Subtract 1 from that', expected: '15' },
      ];

      for (const turn of conversation) {
        await session.send(turn.q);

        const messages: Array<{ type: string; message?: { content?: Array<{ text?: string }> } }> = [];
        for await (const message of session.stream()) {
          messages.push(message as { type: string; message?: { content?: Array<{ text?: string }> } });
        }

        // Check assistant response contains expected answer
        const assistantMessages = messages.filter((m) => m.type === 'assistant');
        const responseText = JSON.stringify(assistantMessages).toLowerCase();

        expect(responseText).toContain(turn.expected);
        expect(session.state).toBe('idle');
      }
    }, TEST_CONFIG.timeout * 3);

    test('should remember facts across many turns', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // Turn 1: Set context
      await session.send('I live in Paris');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Turn 2: Different topic
      await session.send('What is the capital of France?');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Turn 3: Ask about original context
      await session.send('Where do I live?');
      const messages: Array<{ type: string; message?: { content?: Array<{ text?: string }> } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: Array<{ text?: string }> } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('paris');
    }, TEST_CONFIG.timeout * 3);
  });

  describe('Multi-turn Tool Chains', () => {
    test('should chain file operations across turns', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      // Turn 1: Create file A
      await session.send('Create a file called data.txt with "version 1"');
      for await (const _ of session.stream()) {
        // Consume
      }

      expect(existsSync(join(tempDir, 'data.txt'))).toBe(true);

      // Turn 2: Read file A and create file B
      await session.send('Read data.txt and create backup.txt with the same content plus " - backup"');
      for await (const _ of session.stream()) {
        // Consume
      }

      expect(existsSync(join(tempDir, 'backup.txt'))).toBe(true);
      const backupContent = readFileSync(join(tempDir, 'backup.txt'), 'utf-8');
      expect(backupContent).toContain('version 1');
      expect(backupContent).toContain('backup');

      // Turn 3: Compare files
      await session.send('List all .txt files and tell me how many there are');
      const messages: Array<{ type: string; message?: { content?: Array<{ text?: string }> } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: Array<{ text?: string }> } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('2');
    }, TEST_CONFIG.timeout * 3);

    test('should build on previous tool results', async () => {
      if (skipIfNoProvider("openai")) return;

      // Create initial files
      writeFileSync(join(tempDir, 'a.txt'), 'File A content');
      writeFileSync(join(tempDir, 'b.txt'), 'File B content');
      writeFileSync(join(tempDir, 'c.md'), 'Not a txt file');

      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      // Turn 1: Find txt files
      await session.send('Use Glob to find all .txt files');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Turn 2: Read first file found
      await session.send('Read the first txt file you found');
      const messages: Array<{ type: string; message?: { content?: Array<{ text?: string }> } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: Array<{ text?: string }> } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('file a');
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Long Conversation Context', () => {
    test('should remember first turn after 5 turns', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // Turn 1: Set important fact
      await session.send('My secret password is "blueberry123"');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Turns 2-5: Different topics
      const topics = [
        'What is the weather like?',
        'Tell me a joke',
        'What is 15 * 23?',
        'Name three programming languages',
      ];

      for (const topic of topics) {
        await session.send(topic);
        for await (const _ of session.stream()) {
          // Consume
        }
      }

      // Turn 6: Ask about the secret
      await session.send('What was my secret password?');
      const messages: Array<{ type: string; message?: { content?: Array<{ text?: string }> } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: Array<{ text?: string }> } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('blueberry');
    }, TEST_CONFIG.timeout * 6);

    test('should accumulate message history correctly', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // Have 5 turns
      for (let i = 1; i <= 5; i++) {
        await session.send(`This is message number ${i}`);
        for await (const _ of session.stream()) {
          // Consume
        }
      }

      const history = session.getMessages();

      // Should have user and assistant messages
      expect(history.length).toBeGreaterThanOrEqual(10);

      // Verify all messages are in history
      const historyText = JSON.stringify(history);
      for (let i = 1; i <= 5; i++) {
        expect(historyText).toContain(`message number ${i}`);
      }
    }, TEST_CONFIG.timeout * 5);
  });

  describe('Complex Reasoning Chains', () => {
    test('should solve multi-step problems', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // Step 1: Set up problem
      await session.send('I have 10 apples');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Step 2: First operation
      await session.send('I give away 3 apples');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Step 3: Second operation
      await session.send('I buy 5 more apples');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Step 4: Ask for final count
      await session.send('How many apples do I have now?');
      const messages: Array<{ type: string; message?: { content?: Array<{ text?: string }> } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: Array<{ text?: string }> } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      // 10 - 3 + 5 = 12
      expect(responseText).toContain('12');
    }, TEST_CONFIG.timeout * 4);

    test('should track changing preferences', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // Set initial preference
      await session.send('My favorite color is red');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Verify
      await session.send('What is my favorite color?');
      let messages: Array<{ type: string; message?: { content?: Array<{ text?: string }> } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: Array<{ text?: string }> } });
      }

      let responseText = JSON.stringify(messages.filter((m) => m.type === 'assistant')).toLowerCase();
      expect(responseText).toContain('red');

      // Change preference
      await session.send('Actually, I changed my mind. My favorite color is now blue');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Verify new preference
      await session.send('What is my favorite color now?');
      messages = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: Array<{ text?: string }> } });
      }

      responseText = JSON.stringify(messages.filter((m) => m.type === 'assistant')).toLowerCase();
      expect(responseText).toContain('blue');
      expect(responseText).not.toContain('red');
    }, TEST_CONFIG.timeout * 4);
  });

  describe('prompt() Multi-turn', () => {
    test('should handle tool chains in single prompt', async () => {
      if (skipIfNoProvider("openai")) return;

      // Create test files
      writeFileSync(join(tempDir, 'file1.txt'), 'Content 1');
      writeFileSync(join(tempDir, 'file2.txt'), 'Content 2');

      const result = await prompt(
        'List all .txt files, then read each one and summarize what you found',
        getPromptOptions('openai', { cwd: tempDir, maxTurns: 5 })
      );

      expect(result.result.toLowerCase()).toContain('content');
      expect(result.result.toLowerCase()).toContain('1');
      expect(result.result.toLowerCase()).toContain('2');
    }, TEST_CONFIG.timeout);

    test('should respect maxTurns in complex scenarios', async () => {
      if (skipIfNoProvider("openai")) return;

      const result = await prompt(
        'Ask me a question, wait for my answer, then ask another question. Keep going.',
        getPromptOptions('openai', { maxTurns: 3 })
      );

      // Should complete within maxTurns
      expect(result.result.length).toBeGreaterThan(0);
      expect(result.duration_ms).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout);
  });

  describe('Google Provider Multi-turn', () => {
    test('should maintain context with Google provider', async () => {
      skipIfNoProvider('google');

      session = await createSession(getSessionOptions('google'));

      // Turn 1
      await session.send('The magic word is "abracadabra"');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Turn 2: Different topic
      await session.send('What is 2 + 2?');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Turn 3: Ask about magic word
      await session.send('What was the magic word I told you?');
      const messages: Array<{ type: string; message?: { content?: Array<{ text?: string }> } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: Array<{ text?: string }> } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('abracadabra');
    }, TEST_CONFIG.timeout * 3);
  });
});
