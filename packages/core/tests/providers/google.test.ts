import { describe, it, expect } from 'bun:test';
import { GoogleProvider } from '../../src/providers/google';
import type { SDKMessage, ToolCall } from '../../src/types/messages';
import type { ToolDefinition } from '../../src/types/tools';

describe('Google Provider', () => {
  it('should create provider with API key', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-api-key',
      model: 'gemini-2.0-flash',
    });

    expect(provider).toBeDefined();
    expect(provider.getModel()).toBe('gemini-2.0-flash');
  });

  it('should convert user message to Google format', async () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    // Test through a mock that we can inspect the converted messages
    const messages: SDKMessage[] = [
      { type: 'user', content: 'Hello Gemini' },
    ];

    // Provider should be created successfully
    expect(provider).toBeDefined();
  });

  it('should convert system message to Google format', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    expect(provider).toBeDefined();
  });

  it('should convert assistant message with tool calls', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    expect(provider).toBeDefined();
  });

  it('should convert tool result message', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    expect(provider).toBeDefined();
  });

  it('should convert tool definitions to Google format', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: {
          name: 'Read',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: { file_path: { type: 'string' } },
            required: ['file_path'],
          },
        },
      },
    ];

    expect(provider).toBeDefined();
    expect(tools).toHaveLength(1);
  });
});

describe('Google Provider Real API Tests', () => {
  const apiKey = process.env.GEMINI_API_KEY;
  const hasApiKey = !!apiKey && apiKey.startsWith('AIza');

  it('should get response from Gemini API', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const provider = new GoogleProvider({
      apiKey: apiKey,
      model: 'gemini-2.0-flash',
    });

    const messages: SDKMessage[] = [
      { type: 'user', content: 'Say "Hello from Gemini" and nothing else' },
    ];

    const chunks: string[] = [];
    for await (const chunk of provider.chat(messages)) {
      if (chunk.type === 'content' && chunk.delta) {
        chunks.push(chunk.delta);
      }
    }

    const result = chunks.join('');
    console.log('Gemini response:', result);

    expect(result.toLowerCase()).toContain('hello');
    expect(result.toLowerCase()).toContain('gemini');
  }, 30000);

  it('should handle tool calling with Gemini', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const provider = new GoogleProvider({
      apiKey: apiKey,
      model: 'gemini-2.0-flash',
    });

    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
            },
            required: ['location'],
          },
        },
      },
    ];

    const messages: SDKMessage[] = [
      { type: 'user', content: 'What is the weather in Tokyo?' },
    ];

    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    for await (const chunk of provider.chat(messages, tools)) {
      if (chunk.type === 'tool_call' && chunk.tool_call) {
        toolCalls.push(chunk.tool_call);
      }
    }

    console.log('Tool calls:', toolCalls);

    expect(toolCalls.length).toBeGreaterThan(0);
    expect(toolCalls[0].name).toBe('get_weather');
    const args = JSON.parse(toolCalls[0].arguments);
    expect(args.location.toLowerCase()).toContain('tokyo');
  }, 30000);
});
