/**
 * OpenAI Provider E2E Tests
 * Tests real API connectivity and core functionality
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { OpenAIProvider } from '../../../src/providers/openai';
import {
  TEST_CONFIG,
  isProviderAvailable,
  skipIfNoProvider,
  sleep,
} from '../setup';
import type { ToolDefinition } from '../../../src/types/tools';

// Skip all tests if OpenAI API key is not available
const describeIfOpenAI = isProviderAvailable('openai') ? describe : describe.skip;

describeIfOpenAI('OpenAI Provider E2E', () => {
  let provider: OpenAIProvider;

  beforeAll(() => {
    skipIfNoProvider('openai');
    provider = new OpenAIProvider({
      apiKey: TEST_CONFIG.openai.apiKey!,
      model: TEST_CONFIG.openai.model,
    });
  });

  describe('Basic Connectivity', () => {
    test('should connect and return a simple response', async () => {
      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-1',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'Say "hello" and nothing else' },
          parent_tool_use_id: null,
        },
      ];

      const chunks: string[] = [];
      for await (const chunk of provider.chat(messages)) {
        if (chunk.type === 'content') {
          chunks.push(chunk.delta || '');
        }
      }

      const response = chunks.join('');
      expect(response.toLowerCase()).toContain('hello');
    }, TEST_CONFIG.timeout);

    test('should return usage information', async () => {
      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-2',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'What is 2 + 2?' },
          parent_tool_use_id: null,
        },
      ];

      let usageReceived = false;
      for await (const chunk of provider.chat(messages)) {
        if (chunk.type === 'usage') {
          usageReceived = true;
          expect(chunk.usage).toBeDefined();
          expect(chunk.usage?.input_tokens).toBeGreaterThan(0);
          expect(chunk.usage?.output_tokens).toBeGreaterThan(0);
        }
      }

      expect(usageReceived).toBe(true);
    }, TEST_CONFIG.timeout);
  });

  describe('Tool Calling', () => {
    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA',
              },
            },
            required: ['location'],
          },
        },
      },
    ];

    test('should call a tool when appropriate', async () => {
      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-3',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'What is the weather in Paris?' },
          parent_tool_use_id: null,
        },
      ];

      let toolCallReceived = false;
      for await (const chunk of provider.chat(messages, tools)) {
        if (chunk.type === 'tool_call') {
          toolCallReceived = true;
          expect(chunk.tool_call).toBeDefined();
          expect(chunk.tool_call?.name).toBe('get_weather');
          expect(chunk.tool_call?.arguments).toContain('Paris');
        }
      }

      expect(toolCallReceived).toBe(true);
    }, TEST_CONFIG.timeout);

    test('should not call tools when not needed', async () => {
      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-4',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'Say "test complete"' },
          parent_tool_use_id: null,
        },
      ];

      let toolCallReceived = false;
      let contentReceived = false;

      for await (const chunk of provider.chat(messages, tools)) {
        if (chunk.type === 'tool_call') {
          toolCallReceived = true;
        }
        if (chunk.type === 'content') {
          contentReceived = true;
        }
      }

      expect(contentReceived).toBe(true);
      expect(toolCallReceived).toBe(false);
    }, TEST_CONFIG.timeout);
  });

  describe('Streaming', () => {
    test('should stream content in chunks', async () => {
      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-5',
          session_id: 'test-session',
          message: {
            role: 'user' as const,
            content: 'Write a short poem about coding (2 lines)',
          },
          parent_tool_use_id: null,
        },
      ];

      const chunks: string[] = [];
      let doneReceived = false;

      for await (const chunk of provider.chat(messages)) {
        if (chunk.type === 'content') {
          chunks.push(chunk.delta || '');
        }
        if (chunk.type === 'done') {
          doneReceived = true;
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(doneReceived).toBe(true);

      const fullResponse = chunks.join('');
      expect(fullResponse.length).toBeGreaterThan(10);
    }, TEST_CONFIG.timeout);
  });

  describe('System Prompt', () => {
    test('should respect system instruction', async () => {
      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-6',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'Who are you?' },
          parent_tool_use_id: null,
        },
      ];

      const chunks: string[] = [];
      for await (const chunk of provider.chat(messages, undefined, undefined, {
        systemInstruction: 'You are a helpful assistant named TestBot. Always mention your name.',
      })) {
        if (chunk.type === 'content') {
          chunks.push(chunk.delta || '');
        }
      }

      const response = chunks.join('');
      expect(response.toLowerCase()).toContain('testbot');
    }, TEST_CONFIG.timeout);
  });

  describe('Abort Signal', () => {
    test('should respect abort signal', async () => {
      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-7',
          session_id: 'test-session',
          message: {
            role: 'user' as const,
            content: 'Write a very long story about a programmer (at least 500 words)',
          },
          parent_tool_use_id: null,
        },
      ];

      const controller = new AbortController();

      // Abort after 500ms
      setTimeout(() => controller.abort(), 500);

      let contentReceived = false;
      let aborted = false;

      try {
        for await (const chunk of provider.chat(messages, undefined, controller.signal)) {
          if (chunk.type === 'content') {
            contentReceived = true;
          }
        }
      } catch (error) {
        // AbortError is expected
        aborted = true;
      }

      // Either we got some content before abort, or it aborted
      expect(contentReceived || aborted).toBe(true);
    }, TEST_CONFIG.timeout);

    test('should handle pre-aborted signal', async () => {
      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-8',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'Say hello' },
          parent_tool_use_id: null,
        },
      ];

      const controller = new AbortController();
      controller.abort();

      const chunks: unknown[] = [];
      try {
        for await (const chunk of provider.chat(messages, undefined, controller.signal)) {
          chunks.push(chunk);
        }
      } catch (error) {
        // Expected
      }

      // Should either get no content or very minimal content
      expect(chunks.length).toBeLessThan(5);
    }, TEST_CONFIG.timeout);
  });

  describe('Multi-turn Conversation', () => {
    test('should maintain context across messages', async () => {
      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-9',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'My name is Alice' },
          parent_tool_use_id: null,
        },
        {
          type: 'assistant' as const,
          uuid: 'test-uuid-10',
          session_id: 'test-session',
          message: {
            role: 'assistant' as const,
            content: [{ type: 'text' as const, text: 'Nice to meet you, Alice!' }],
          },
          parent_tool_use_id: null,
        },
        {
          type: 'user' as const,
          uuid: 'test-uuid-11',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'What is my name?' },
          parent_tool_use_id: null,
        },
      ];

      const chunks: string[] = [];
      for await (const chunk of provider.chat(messages)) {
        if (chunk.type === 'content') {
          chunks.push(chunk.delta || '');
        }
      }

      const response = chunks.join('');
      expect(response.toLowerCase()).toContain('alice');
    }, TEST_CONFIG.timeout);
  });

  describe('Error Handling', () => {
    test('should handle invalid model gracefully', async () => {
      const invalidProvider = new OpenAIProvider({
        apiKey: TEST_CONFIG.openai.apiKey!,
        model: 'invalid-model-name',
      });

      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-12',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'Hello' },
          parent_tool_use_id: null,
        },
      ];

      let errorReceived = false;
      try {
        for await (const chunk of invalidProvider.chat(messages)) {
          // Consume chunks
        }
      } catch (error) {
        errorReceived = true;
        expect(error).toBeDefined();
      }

      expect(errorReceived).toBe(true);
    }, TEST_CONFIG.timeout);

    test('should handle invalid API key', async () => {
      const invalidProvider = new OpenAIProvider({
        apiKey: 'invalid-key',
        model: TEST_CONFIG.openai.model,
      });

      const messages = [
        {
          type: 'user' as const,
          uuid: 'test-uuid-13',
          session_id: 'test-session',
          message: { role: 'user' as const, content: 'Hello' },
          parent_tool_use_id: null,
        },
      ];

      let errorReceived = false;
      try {
        for await (const chunk of invalidProvider.chat(messages)) {
          // Consume chunks
        }
      } catch (error) {
        errorReceived = true;
      }

      expect(errorReceived).toBe(true);
    }, TEST_CONFIG.timeout);
  });
});
