/**
 * Session E2E Tests
 * Tests the Session class with real APIs
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createSession, SessionState, SessionClosedError, SessionNotIdleError, SessionNotReadyError, SessionAlreadyStreamingError } from '../../../src/session';
import type { Session } from '../../../src/session';
import {
  TEST_CONFIG,
  isProviderAvailable,
  skipIfNoProvider,
  getSessionOptions,
  createTempDir,
  cleanupTempDir,
} from '../setup';
import { join } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';

// Skip all tests if no providers are available
const hasProvider = isProviderAvailable('openai') || isProviderAvailable('google');
const describeIfProvider = hasProvider ? describe : describe.skip;

describeIfProvider('Session E2E', () => {
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

  describe('Creation and Basic Conversation', () => {
    test('should create a session with correct properties', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      expect(session.id).toBeDefined();
      expect(session.id.length).toBeGreaterThan(0);
      expect(session.model).toBe(TEST_CONFIG.openai.model);
      expect(session.provider).toBe('openai');
      expect(session.state).toBe(SessionState.IDLE);
      expect(session.createdAt).toBeGreaterThan(0);
    });

    test('should send message and transition to READY state', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      expect(session.state).toBe(SessionState.IDLE);

      await session.send('Hello!');

      expect(session.state).toBe(SessionState.RUNNING);
    });

    test('should stream response and return to IDLE', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Say "test passed"');

      const messages: unknown[] = [];
      for await (const message of session.stream()) {
        messages.push(message);
      }

      expect(messages.length).toBeGreaterThan(0);
      expect(session.state).toBe(SessionState.IDLE);
    });

    test('should receive assistant and done message types', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Say hello');

      const messages: Array<{ type: string }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string });
      }

      // Should have at least one assistant message
      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      expect(assistantMessages.length).toBeGreaterThan(0);
    });
  });

  describe('Context Retention', () => {
    test('should remember previous conversation', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // First turn
      await session.send('My name is Alice');
      const turn1Messages: unknown[] = [];
      for await (const message of session.stream()) {
        turn1Messages.push(message);
      }

      expect(session.state).toBe(SessionState.IDLE);

      // Second turn - should remember
      await session.send('What is my name?');
      const turn2Messages: Array<{ type: string; message?: { content?: unknown } }> = [];
      for await (const message of session.stream()) {
        turn2Messages.push(message as { type: string; message?: { content?: unknown } });
      }

      // Check if response contains "Alice"
      const assistantMessages = turn2Messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('alice');
    }, TEST_CONFIG.timeout * 2);

    test('should maintain context across multiple turns', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai', { maxTurns: 5 }));

      const conversation = [
        { q: '5 + 3 = ?', a: '8' },
        { q: 'Multiply that by 2', a: '16' },
        { q: 'Minus 1', a: '15' },
      ];

      for (const turn of conversation) {
        await session.send(turn.q);
        const messages: unknown[] = [];
        for await (const message of session.stream()) {
          messages.push(message);
        }
        expect(session.state).toBe(SessionState.IDLE);
      }

      // Verify history has all messages
      const history = session.getMessages();
      expect(history.length).toBeGreaterThanOrEqual(6); // 3 user + 3 assistant messages
    }, TEST_CONFIG.timeout * 3);
  });

  describe('Tool Calls in Session', () => {
    test('should use tools within a session', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      await session.send('Create a file called session-test.txt with "Hello from session"');

      const messages: Array<{ type: string; tool_name?: string; result?: unknown }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; tool_name?: string; result?: unknown });
      }

      // Verify file was created
      const filePath = join(tempDir, 'session-test.txt');
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, 'utf-8')).toContain('Hello');

      // Should have tool_result messages
      const toolResults = messages.filter((m) => m.type === 'tool_result');
      expect(toolResults.length).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout);

    test('should use multiple tools in sequence', async () => {
      if (skipIfNoProvider("openai")) return;

      // Create initial file
      writeFileSync(join(tempDir, 'data.txt'), 'initial content');

      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      await session.send('Read data.txt, then create a backup file called data-backup.txt with the same content');

      const messages: unknown[] = [];
      for await (const message of session.stream()) {
        messages.push(message);
      }

      // Verify backup was created
      expect(existsSync(join(tempDir, 'data-backup.txt'))).toBe(true);
    }, TEST_CONFIG.timeout);
  });

  describe('State Transitions', () => {
    test('should follow correct state machine transitions', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // Initial state
      expect(session.state).toBe(SessionState.IDLE);

      // After send, should transition through READY to RUNNING
      await session.send('Hello');
      expect(session.state).toBe(SessionState.RUNNING);

      // After stream completes, should return to IDLE
      for await (const _ of session.stream()) {
        // Consume stream
      }
      expect(session.state).toBe(SessionState.IDLE);
    });

    test('should allow multiple send/stream cycles', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      for (let i = 0; i < 3; i++) {
        expect(session.state).toBe(SessionState.IDLE);

        await session.send(`Message ${i + 1}`);
        expect(session.state).toBe(SessionState.RUNNING);

        for await (const _ of session.stream()) {
          // Consume stream
        }
        expect(session.state).toBe(SessionState.IDLE);
      }
    }, TEST_CONFIG.timeout * 3);
  });

  describe('Error Handling', () => {
    test('should throw SessionClosedError when using closed session', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));
      await session.close();

      expect(session.state).toBe(SessionState.CLOSED);

      await expect(session.send('Hello')).rejects.toThrow(SessionClosedError);
    });

    test('should throw SessionNotReadyError when streaming without send', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      expect(session.state).toBe(SessionState.IDLE);

      await expect(
        (async () => {
          for await (const _ of session.stream()) {
            // Should not reach here
          }
        })()
      ).rejects.toThrow(SessionNotReadyError);
    });

    test('should throw SessionAlreadyStreamingError when double streaming', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Write a very long story');

      // Start first stream (don't await to keep it running)
      const stream1 = session.stream();

      // Try to start second stream immediately
      await expect(
        (async () => {
          for await (const _ of session.stream()) {
            // Should not reach here
          }
        })()
      ).rejects.toThrow(SessionAlreadyStreamingError);

      // Clean up first stream
      for await (const _ of stream1) {
        // Consume
      }
    }, TEST_CONFIG.timeout);
  });

  describe('getMessages()', () => {
    test('should return complete message history', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // Initial history should be empty
      expect(session.getMessages().length).toBe(0);

      // First turn
      await session.send('Hello');
      for await (const _ of session.stream()) {
        // Consume
      }

      const history1 = session.getMessages();
      expect(history1.length).toBeGreaterThan(0);

      // Second turn
      await session.send('How are you?');
      for await (const _ of session.stream()) {
        // Consume
      }

      const history2 = session.getMessages();
      expect(history2.length).toBeGreaterThan(history1.length);
    }, TEST_CONFIG.timeout * 2);

    test('should return frozen copy of messages', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Hello');
      for await (const _ of session.stream()) {
        // Consume
      }

      const messages = session.getMessages();

      // Should not be able to modify
      expect(() => {
        (messages as unknown[]).push({ type: 'test' } as unknown);
      }).toThrow();
    }, TEST_CONFIG.timeout);
  });

  describe('Google Provider Sessions', () => {
    test('should work with Google provider', async () => {
      skipIfNoProvider('google');

      session = await createSession(getSessionOptions('google'));

      expect(session.model).toBe(TEST_CONFIG.google.model);
      expect(session.provider).toBe('google');

      await session.send('Say "Google test passed"');

      const messages: unknown[] = [];
      for await (const message of session.stream()) {
        messages.push(message);
      }

      expect(messages.length).toBeGreaterThan(0);
      expect(session.state).toBe(SessionState.IDLE);
    }, TEST_CONFIG.timeout);

    test('should maintain context with Google provider', async () => {
      skipIfNoProvider('google');

      session = await createSession(getSessionOptions('google'));

      await session.send('My favorite color is blue');
      for await (const _ of session.stream()) {
        // Consume
      }

      await session.send('What is my favorite color?');
      const messages: Array<{ type: string; message?: { content?: unknown } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: unknown } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('blue');
    }, TEST_CONFIG.timeout * 2);
  });
});
