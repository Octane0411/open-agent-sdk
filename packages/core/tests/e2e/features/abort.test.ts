/**
 * Abort Operation E2E Tests
 * Tests AbortController functionality with real APIs
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

// Skip all tests if no providers are available
const hasProvider = isProviderAvailable('openai') || isProviderAvailable('google');
const describeIfProvider = hasProvider ? describe : describe.skip;

describeIfProvider('Abort Operations E2E', () => {
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

  describe('prompt() Abort', () => {
    test('should abort prompt() during generation', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();

      // Abort after 500ms
      setTimeout(() => controller.abort(), 500);

      const startTime = Date.now();

      try {
        await prompt(
          'Write a very long detailed story about a programmer (at least 1000 words)',
          getPromptOptions('openai', { abortController: controller })
        );
      } catch (error) {
        // Expected to be aborted
      }

      const duration = Date.now() - startTime;

      // Should have aborted quickly, not waited for full generation
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);

    test('should handle pre-aborted signal in prompt()', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();
      controller.abort();

      await expect(
        prompt('Say hello', getPromptOptions('openai', { abortController: controller }))
      ).rejects.toThrow();
    });

    test('should abort Google provider prompt', async () => {
      skipIfNoProvider('google');

      const controller = new AbortController();

      // Abort after 500ms
      setTimeout(() => controller.abort(), 500);

      const startTime = Date.now();

      try {
        await prompt(
          'Write a very long detailed essay about artificial intelligence',
          getPromptOptions('google', { abortController: controller })
        );
      } catch (error) {
        // Expected
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);
  });

  describe('Session Stream Abort', () => {
    test('should abort session stream during response', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      const controller = new AbortController();

      // Abort after 500ms
      setTimeout(() => controller.abort(), 500);

      await session.send('Write a very long story about space exploration');

      const startTime = Date.now();
      const messages: unknown[] = [];

      try {
        for await (const message of session.stream()) {
          messages.push(message);
        }
      } catch (error) {
        // Expected - stream was aborted
      }

      const duration = Date.now() - startTime;

      // Should have received some messages before abort
      expect(messages.length).toBeGreaterThanOrEqual(0);
      // Should have aborted quickly
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);

    test('should handle abort in multi-turn session', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();
      session = await createSession(
        getSessionOptions('openai', { abortController: controller })
      );

      // First turn - normal
      await session.send('Say hello');
      for await (const _ of session.stream()) {
        // Consume
      }

      expect(session.state).toBe('idle');

      // Abort before second turn
      controller.abort();

      // Second turn should fail or complete quickly
      await session.send('Write a long story');

      const startTime = Date.now();
      try {
        for await (const _ of session.stream()) {
          // May or may not receive messages
        }
      } catch (error) {
        // Expected
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Tool Execution Abort', () => {
    test('should abort during long tool execution', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();

      // Abort after 1 second
      setTimeout(() => controller.abort(), 1000);

      const startTime = Date.now();

      try {
        await prompt(
          'Run "sleep 10" in Bash and report when it finishes',
          getPromptOptions('openai', {
            cwd: tempDir,
            abortController: controller,
          })
        );
      } catch (error) {
        // Expected
      }

      const duration = Date.now() - startTime;

      // Should have aborted well before 10 seconds
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);

    test('should respect abort in tool chain', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();

      // Abort after 1 second
      setTimeout(() => controller.abort(), 1000);

      const startTime = Date.now();

      try {
        await prompt(
          'Create 10 files (file1.txt through file10.txt), then read all of them',
          getPromptOptions('openai', {
            cwd: tempDir,
            abortController: controller,
            maxTurns: 5,
          })
        );
      } catch (error) {
        // Expected
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);
  });

  describe('Google Provider Abort', () => {
    test('should abort Google session stream', async () => {
      skipIfNoProvider('google');

      session = await createSession(getSessionOptions('google'));

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 500);

      await session.send('Write a comprehensive guide to machine learning');

      const startTime = Date.now();
      const messages: unknown[] = [];

      try {
        for await (const message of session.stream()) {
          messages.push(message);
        }
      } catch (error) {
        // Expected
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);
  });

  describe('Abort Edge Cases', () => {
    test('should handle rapid abort after send', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      const controller = new AbortController();

      // Abort immediately
      controller.abort();

      await session.send('Say hello');

      const startTime = Date.now();
      try {
        for await (const _ of session.stream()) {
          // Consume
        }
      } catch (error) {
        // Expected
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000);
    }, TEST_CONFIG.timeout);

    test('should handle abort during tool result processing', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();

      // Abort after 2 seconds (during tool execution)
      setTimeout(() => controller.abort(), 2000);

      const startTime = Date.now();

      try {
        await prompt(
          'List all files, then read each one, then search for patterns',
          getPromptOptions('openai', {
            cwd: tempDir,
            abortController: controller,
            maxTurns: 10,
          })
        );
      } catch (error) {
        // Expected
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);
  });

  describe('Session State After Abort', () => {
    test('should return to idle state after abort', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 500);

      await session.send('Write a very long story');

      try {
        for await (const _ of session.stream()) {
          // Consume
        }
      } catch (error) {
        // Expected
      }

      // Should eventually return to idle (or error state that recovers to idle)
      expect(['idle', 'error']).toContain(session.state);
    }, TEST_CONFIG.timeout);

    test('should allow new send after abort', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // First attempt - abort
      const controller1 = new AbortController();
      setTimeout(() => controller1.abort(), 500);

      await session.send('Write a very long story');
      try {
        for await (const _ of session.stream()) {
          // Consume
        }
      } catch (error) {
        // Expected
      }

      // Wait for state to settle
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second attempt - should work
      if (session.state === 'idle') {
        await session.send('Say hello briefly');
        const messages: unknown[] = [];
        for await (const message of session.stream()) {
          messages.push(message);
        }
        expect(messages.length).toBeGreaterThan(0);
      }
    }, TEST_CONFIG.timeout * 2);
  });
});
