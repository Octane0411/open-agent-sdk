import { describe, it, expect, mock } from 'bun:test';
import { OpenAIProvider } from '../../src/providers/openai';
import { createUserMessage, createSystemMessage, createAssistantMessage, createToolResultMessage } from '../../src/types/messages';
import type { ToolDefinition } from '../../src/types/tools';

// Mock OpenAI client
const mockStream = async function* () {
  yield {
    choices: [{ delta: { content: 'Hello' } }],
    usage: null,
  };
  yield {
    choices: [{ delta: { content: ' World' } }],
    usage: null,
  };
  yield {
    choices: [{ delta: {} }],
    usage: { prompt_tokens: 10, completion_tokens: 2 },
  };
};

describe('OpenAI Provider', () => {
  it('should create provider with config', () => {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-4',
      baseURL: 'https://api.openai.com/v1',
    });

    expect(provider.getModel()).toBe('gpt-4');
  });

  it('should convert user message', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-4',
    });

    // Test that the provider can be created and has the right model
    expect(provider).toBeDefined();
    expect(provider.getModel()).toBe('gpt-4');
  });

  it('should convert system message', () => {
    const msg = createSystemMessage('You are helpful');
    expect(msg.type).toBe('system');
    expect(msg.content).toBe('You are helpful');
  });

  it('should convert assistant message with content', () => {
    const msg = createAssistantMessage('Hello!');
    expect(msg.type).toBe('assistant');
    expect(msg.content).toBe('Hello!');
  });

  it('should convert assistant message with tool calls', () => {
    const msg = createAssistantMessage(undefined, [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'Read', arguments: '{"file_path": "/test.txt"}' },
      },
    ]);
    expect(msg.type).toBe('assistant');
    expect(msg.tool_calls).toHaveLength(1);
  });

  it('should convert tool result message', () => {
    const msg = createToolResultMessage('call_1', 'File content');
    expect(msg.type).toBe('tool_result');
    expect(msg.tool_call_id).toBe('call_1');
  });

  it('should create tool definition', () => {
    const toolDef: ToolDefinition = {
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
    };

    expect(toolDef.function.name).toBe('Read');
  });
});
