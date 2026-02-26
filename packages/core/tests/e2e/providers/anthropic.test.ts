/**
 * Anthropic Provider E2E Tests
 * Tests real API connectivity and core functionality
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { AnthropicProvider } from '../../../src/providers/anthropic';
import {
  TEST_CONFIG,
  isProviderAvailable,
  skipIfNoProvider,
} from '../setup';
import type { ToolDefinition } from '../../../src/types/tools';

// Skip all tests if Anthropic API key is not available
const describeIfAnthropic = isProviderAvailable('anthropic') ? describe : describe.skip;

describeIfAnthropic('Anthropic Provider E2E', () => {
  let provider: AnthropicProvider;

  beforeAll(() => {
    skipIfNoProvider('anthropic');
    provider = new AnthropicProvider({
      apiKey: TEST_CONFIG.anthropic.apiKey,
      authToken: TEST_CONFIG.anthropic.authToken,
      baseURL: TEST_CONFIG.anthropic.baseURL,
      model: TEST_CONFIG.anthropic.model,
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
          message: {
            role: 'user' as const,
            content: 'What is the weather in Paris? Use the get_weather tool.',
          },
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
        systemInstruction: 'You are a helpful assistant named ClaudeBot. Always mention your name.',
      })) {
        if (chunk.type === 'content') {
          chunks.push(chunk.delta || '');
        }
      }

      const response = chunks.join('');
      expect(response.toLowerCase()).toContain('claudebot');
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
});
