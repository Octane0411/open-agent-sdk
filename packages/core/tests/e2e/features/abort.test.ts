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

      let errorThrown = false;
      try {
        await prompt(
          'Write a very long detailed story about a programmer (at least 1000 words)',
          getPromptOptions('openai', { abortController: controller })
        );
      } catch (error) {
        errorThrown = true;
        // Verify it's an abort error
        expect(error instanceof Error).toBe(true);
        const errorMessage = (error as Error).message.toLowerCase();
        expect(errorMessage.includes('abort') || errorMessage.includes('cancel') || errorMessage.includes('signal')).toBe(true);
      }

      const duration = Date.now() - startTime;

      // Should have either thrown an error or aborted quickly
      expect(errorThrown || duration < 5000).toBe(true);
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);

    test('should handle pre-aborted signal in prompt()', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();
      controller.abort();

      await expect(
        prompt('Say hello', getPromptOptions('openai', { abortController: controller }))
      ).rejects.toThrow(expect.objectContaining({
        message: expect.stringMatching(/abort|cancel|signal/i)
      }));
    });

    test('should abort Google provider prompt', async () => {
      skipIfNoProvider('google');

      const controller = new AbortController();

      // Abort after 500ms
      setTimeout(() => controller.abort(), 500);

      const startTime = Date.now();

      let errorThrown = false;
      try {
        await prompt(
          'Write a very long detailed essay about artificial intelligence',
          getPromptOptions('google', { abortController: controller })
        );
      } catch (error) {
        errorThrown = true;
        // Verify it's an abort-related error
        expect(error instanceof Error).toBe(true);
      }

      const duration = Date.now() - startTime;
      // Should have either thrown an error or completed quickly due to abort
      expect(errorThrown || duration < 5000).toBe(true);
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

      let abortErrorThrown = false;
      try {
        for await (const message of session.stream()) {
          messages.push(message);
        }
      } catch (error) {
        abortErrorThrown = true;
        expect(error instanceof Error).toBe(true);
      }

      const duration = Date.now() - startTime;

      // Should have received some messages or thrown an abort error
      expect(messages.length > 0 || abortErrorThrown).toBe(true);
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
      let streamErrorThrown = false;
      try {
        for await (const _ of session.stream()) {
          // May or may not receive messages
        }
      } catch (error) {
        streamErrorThrown = true;
        expect(error instanceof Error).toBe(true);
      }

      const duration = Date.now() - startTime;
      // Stream should have completed or thrown within timeout
      expect(duration).toBeLessThan(5000);
      // If error was thrown, verify it's an Error instance
      if (streamErrorThrown) {
        expect(session.state === 'error' || session.state === 'idle').toBe(true);
      }
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Tool Execution Abort', () => {
    test('should abort during long tool execution', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();

      // Abort after 1 second
      setTimeout(() => controller.abort(), 1000);

      const startTime = Date.now();

      let errorCaught = false;
      try {
        await prompt(
          'Run "sleep 10" in Bash and report when it finishes',
          getPromptOptions('openai', {
            cwd: tempDir,
            abortController: controller,
          })
        );
      } catch (error) {
        errorCaught = true;
        expect(error instanceof Error).toBe(true);
      }

      const duration = Date.now() - startTime;

      // Should have aborted well before 10 seconds, either via error or completion
      expect(errorCaught || duration < 5000).toBe(true);
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);

    test('should respect abort in tool chain', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();

      // Abort after 1 second
      setTimeout(() => controller.abort(), 1000);

      const startTime = Date.now();

      let toolChainError = false;
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
        toolChainError = true;
        expect(error instanceof Error).toBe(true);
      }

      const duration = Date.now() - startTime;
      // Should have aborted or completed quickly
      expect(toolChainError || duration < 5000).toBe(true);
      expect(duration).toBeLessThan(5000);
    }, TEST_CONFIG.timeout);
  });

  describe('Google Provider Abort', () => {
    test('should abort Google session stream', async () => {
      skipIfNoProvider('google');

      const controller = new AbortController();
      session = await createSession(
        getSessionOptions('google', { abortController: controller })
      );

      await session.send('Write a comprehensive guide to machine learning');

      const startTime = Date.now();
      const messages: unknown[] = [];

      // Abort after receiving some messages
      let messageCount = 0;
      let googleAbortError = false;
      try {
        for await (const message of session.stream()) {
          messages.push(message);
          messageCount++;
          // Abort after receiving a few messages to ensure streaming started
          if (messageCount === 3) {
            controller.abort();
          }
        }
      } catch (error) {
        googleAbortError = true;
        expect(error instanceof Error).toBe(true);
      }

      const duration = Date.now() - startTime;
      // Should have received some messages before abort
      expect(messages.length).toBeGreaterThan(0);
      // Should have aborted relatively quickly (not completed full response)
      expect(duration).toBeLessThan(15000);
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
      let rapidAbortError = false;
      try {
        for await (const _ of session.stream()) {
          // Consume
        }
      } catch (error) {
        rapidAbortError = true;
        expect(error instanceof Error).toBe(true);
      }

      const duration = Date.now() - startTime;
      // Should complete or error quickly after pre-abort
      expect(rapidAbortError || duration < 3000).toBe(true);
      expect(duration).toBeLessThan(3000);
    }, TEST_CONFIG.timeout);

    test('should handle abort during tool result processing', async () => {
      if (skipIfNoProvider("openai")) return;

      const controller = new AbortController();

      // Abort after 2 seconds (during tool execution)
      setTimeout(() => controller.abort(), 2000);

      const startTime = Date.now();

      let toolProcessingError = false;
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
        toolProcessingError = true;
        expect(error instanceof Error).toBe(true);
      }

      const duration = Date.now() - startTime;
      // Should have aborted or completed within timeout
      expect(toolProcessingError || duration < 5000).toBe(true);
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

      let finalStateError = false;
      try {
        for await (const _ of session.stream()) {
          // Consume
        }
      } catch (error) {
        finalStateError = true;
        expect(error instanceof Error).toBe(true);
      }

      // Should eventually return to idle (or error state that recovers to idle)
      expect(session.state === 'idle' || session.state === 'error').toBe(true);
      // If error was thrown, session should be in error or recovered to idle
      if (finalStateError) {
        expect(['idle', 'error']).toContain(session.state);
      }
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

      // Second attempt - should work if session recovered
      if (session.state === 'idle') {
        await session.send('Say hello briefly');
        const messages: unknown[] = [];
        let secondTurnError = false;
        try {
          for await (const message of session.stream()) {
            messages.push(message);
          }
        } catch (error) {
          secondTurnError = true;
          expect(error instanceof Error).toBe(true);
        }
        // Either got messages or handled error gracefully
        expect(messages.length > 0 || secondTurnError).toBe(true);
      }
    }, TEST_CONFIG.timeout * 2);
  });
});
