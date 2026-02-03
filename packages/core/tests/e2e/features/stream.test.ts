/**
 * Stream Response E2E Tests
 * Tests stream response integrity and completeness
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createSession, prompt } from '../../../src/index';
import type { Session } from '../../../src/session';
import type { ReActStreamEvent } from '../../../src/agent/react-loop';
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
import { writeFileSync } from 'fs';

// Skip all tests if no providers are available
const hasProvider = isProviderAvailable('openai') || isProviderAvailable('google');
const describeIfProvider = hasProvider ? describe : describe.skip;

describeIfProvider('Stream Response E2E', () => {
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

  describe('Message Types in Stream', () => {
    test('should receive assistant message type', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Say hello');

      const messageTypes: string[] = [];
      for await (const message of session.stream()) {
        const msg = message as { type: string };
        messageTypes.push(msg.type);
      }

      expect(messageTypes).toContain('assistant');
    }, TEST_CONFIG.timeout);

    test('should receive tool_result message type when using tools', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'test.txt'), 'Hello');
      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      await session.send('Read test.txt');

      const messageTypes: string[] = [];
      for await (const message of session.stream()) {
        const msg = message as { type: string };
        messageTypes.push(msg.type);
      }

      expect(messageTypes).toContain('tool_result');
    }, TEST_CONFIG.timeout);

    test('should have correct message structure', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Say "test message"');

      const assistantMessages: Array<{
        type: string;
        message?: { content?: Array<{ type: string; text?: string }> };
      }> = [];
      for await (const message of session.stream()) {
        const msg = message as { type: string; message?: { content?: Array<{ type: string; text?: string }> } };
        if (msg.type === 'assistant') {
          assistantMessages.push(msg);
        }
      }

      expect(assistantMessages.length).toBeGreaterThan(0);

      // Check message structure
      const firstMessage = assistantMessages[0];
      expect(firstMessage.message).toBeDefined();
      expect(firstMessage.message?.content).toBeDefined();
      expect(Array.isArray(firstMessage.message?.content)).toBe(true);
    }, TEST_CONFIG.timeout);
  });

  describe('Stream Content Correctness', () => {
    test('should accumulate content correctly', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Count from 1 to 5');

      let accumulatedContent = '';
      for await (const message of session.stream()) {
        const msg = message as {
          type: string;
          message?: { content?: Array<{ type: string; text?: string }> };
        };
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const content of msg.message.content) {
            if (content.type === 'text' && content.text) {
              accumulatedContent += content.text;
            }
          }
        }
      }

      // Content should contain the numbers
      expect(accumulatedContent).toContain('1');
      expect(accumulatedContent.length).toBeGreaterThan(10);
    }, TEST_CONFIG.timeout);

    test('should stream complete responses', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Write a short greeting');

      const messages: unknown[] = [];
      for await (const message of session.stream()) {
        messages.push(message);
      }

      // Should have received messages
      expect(messages.length).toBeGreaterThan(0);

      // All messages should have required fields
      for (const msg of messages) {
        const message = msg as { type: string };
        expect(message.type).toBeDefined();
        expect(['assistant', 'tool_result']).toContain(message.type);
      }
    }, TEST_CONFIG.timeout);
  });

  describe('Multi-turn Streaming', () => {
    test('should stream correctly across multiple turns', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      const turns = [
        'What is 2 + 2?',
        'What is 3 + 3?',
        'What is 4 + 4?',
      ];

      for (const turn of turns) {
        await session.send(turn);

        const messages: unknown[] = [];
        for await (const message of session.stream()) {
          messages.push(message);
        }

        expect(messages.length).toBeGreaterThan(0);
        expect(session.state).toBe('idle');
      }
    }, TEST_CONFIG.timeout * 3);

    test('should maintain message history consistency', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      // Turn 1
      await session.send('My name is Alice');
      const turn1Messages: unknown[] = [];
      for await (const message of session.stream()) {
        turn1Messages.push(message);
      }

      // Turn 2
      await session.send('What is my name?');
      const turn2Messages: unknown[] = [];
      for await (const message of session.stream()) {
        turn2Messages.push(message);
      }

      // Verify history
      const history = session.getMessages();
      const historyText = JSON.stringify(history).toLowerCase();

      expect(historyText).toContain('alice');
      expect(history.length).toBeGreaterThanOrEqual(
        turn1Messages.length + turn2Messages.length
      );
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Tool Streaming', () => {
    test('should stream tool calls and results', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'data.json'), '{"value": 42}');
      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      await session.send('Read data.json and tell me the value');

      const events: Array<{ type: string; tool_name?: string; result?: unknown }> = [];
      for await (const message of session.stream()) {
        const msg = message as { type: string; tool_name?: string; result?: unknown };
        events.push(msg);
      }

      // Should have both assistant and tool_result messages
      const assistantEvents = events.filter((e) => e.type === 'assistant');
      const toolResultEvents = events.filter((e) => e.type === 'tool_result');

      expect(assistantEvents.length).toBeGreaterThan(0);
      expect(toolResultEvents.length).toBeGreaterThan(0);

      // Tool results should have proper structure
      for (const toolEvent of toolResultEvents) {
        expect(toolEvent.tool_name).toBeDefined();
      }
    }, TEST_CONFIG.timeout);

    test('should stream multiple tool calls', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'a.txt'), 'A');
      writeFileSync(join(tempDir, 'b.txt'), 'B');
      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      await session.send('Read a.txt and b.txt');

      const toolResults: Array<{ type: string; tool_name?: string }> = [];
      for await (const message of session.stream()) {
        const msg = message as { type: string; tool_name?: string };
        if (msg.type === 'tool_result') {
          toolResults.push(msg);
        }
      }

      // Should have tool results for both files
      expect(toolResults.length).toBeGreaterThanOrEqual(2);
    }, TEST_CONFIG.timeout);
  });

  describe('Stream with Google Provider', () => {
    test('should stream with Google provider', async () => {
      skipIfNoProvider('google');

      session = await createSession(getSessionOptions('google'));

      await session.send('Say hello from Gemini');

      const messageTypes: string[] = [];
      for await (const message of session.stream()) {
        const msg = message as { type: string };
        messageTypes.push(msg.type);
      }

      expect(messageTypes).toContain('assistant');
    }, TEST_CONFIG.timeout);

    test('should stream tool results with Google', async () => {
      skipIfNoProvider('google');

      writeFileSync(join(tempDir, 'google-test.txt'), 'Google test');
      session = await createSession(getSessionOptions('google', { cwd: tempDir }));

      await session.send('Read google-test.txt');

      const events: Array<{ type: string }> = [];
      for await (const message of session.stream()) {
        const msg = message as { type: string };
        events.push(msg);
      }

      const hasToolResult = events.some((e) => e.type === 'tool_result');
      expect(hasToolResult).toBe(true);
    }, TEST_CONFIG.timeout);
  });

  describe('Stream Completion', () => {
    test('should complete stream without errors', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Write a short poem');

      let errorOccurred = false;
      const messages: unknown[] = [];

      try {
        for await (const message of session.stream()) {
          messages.push(message);
        }
      } catch (error) {
        errorOccurred = true;
      }

      expect(errorOccurred).toBe(false);
      expect(messages.length).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout);

    test('should return to idle after stream completes', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Say done');

      for await (const _ of session.stream()) {
        // Consume all messages
      }

      expect(session.state).toBe('idle');
    }, TEST_CONFIG.timeout);
  });

  describe('Stream Content Validation', () => {
    test('should have valid assistant message content', async () => {
      if (skipIfNoProvider("openai")) return;

      session = await createSession(getSessionOptions('openai'));

      await session.send('Say "streaming works"');

      const assistantMessages: Array<{
        type: string;
        uuid?: string;
        session_id?: string;
        message?: {
          role?: string;
          content?: Array<{ type: string; text?: string }>;
          tool_calls?: unknown[];
        };
      }> = [];

      for await (const message of session.stream()) {
        const msg = message as {
          type: string;
          uuid?: string;
          session_id?: string;
          message?: {
            role?: string;
            content?: Array<{ type: string; text?: string }>;
            tool_calls?: unknown[];
          };
        };
        if (msg.type === 'assistant') {
          assistantMessages.push(msg);
        }
      }

      // Validate structure
      for (const msg of assistantMessages) {
        expect(msg.uuid).toBeDefined();
        expect(msg.session_id).toBeDefined();
        expect(msg.message).toBeDefined();
        expect(msg.message?.role).toBe('assistant');
        expect(Array.isArray(msg.message?.content)).toBe(true);
      }
    }, TEST_CONFIG.timeout);

    test('should have valid tool_result message content', async () => {
      if (skipIfNoProvider("openai")) return;

      writeFileSync(join(tempDir, 'test.txt'), 'content');
      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      await session.send('Read test.txt');

      const toolResults: Array<{
        type: string;
        uuid?: string;
        tool_use_id?: string;
        tool_name?: string;
        result?: unknown;
      }> = [];

      for await (const message of session.stream()) {
        const msg = message as {
          type: string;
          uuid?: string;
          tool_use_id?: string;
          tool_name?: string;
          result?: unknown;
        };
        if (msg.type === 'tool_result') {
          toolResults.push(msg);
        }
      }

      // Validate structure
      for (const msg of toolResults) {
        expect(msg.uuid).toBeDefined();
        expect(msg.tool_use_id).toBeDefined();
        expect(msg.tool_name).toBeDefined();
        expect(msg.result).toBeDefined();
      }
    }, TEST_CONFIG.timeout);
  });
});
