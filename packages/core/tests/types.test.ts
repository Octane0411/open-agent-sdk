import { describe, it, expect } from 'bun:test';
import {
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createToolResultMessage,
  type SDKMessage,
  type ToolCall,
} from '../src/types/messages';
import { createToolDefinition, type ToolDefinition } from '../src/types/tools';
import { LLMProvider, type ProviderConfig, type LLMChunk } from '../src/providers/base';

describe('Message Types', () => {
  it('should create user message', () => {
    const msg = createUserMessage('Hello');
    expect(msg.type).toBe('user');
    expect(msg.content).toBe('Hello');
  });

  it('should create system message', () => {
    const msg = createSystemMessage('You are a helpful assistant');
    expect(msg.type).toBe('system');
    expect(msg.content).toBe('You are a helpful assistant');
  });

  it('should create assistant message with content', () => {
    const msg = createAssistantMessage('Hello there!');
    expect(msg.type).toBe('assistant');
    expect(msg.content).toBe('Hello there!');
    expect(msg.tool_calls).toBeUndefined();
  });

  it('should create assistant message with tool calls', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'Read', arguments: '{"file_path": "/test.txt"}' },
      },
    ];
    const msg = createAssistantMessage(undefined, toolCalls);
    expect(msg.type).toBe('assistant');
    expect(msg.content).toBeUndefined();
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls?.[0].function.name).toBe('Read');
  });

  it('should create tool result message', () => {
    const msg = createToolResultMessage('call_1', 'File content here');
    expect(msg.type).toBe('tool_result');
    expect(msg.tool_call_id).toBe('call_1');
    expect(msg.content).toBe('File content here');
    expect(msg.is_error).toBeUndefined();
  });

  it('should create tool result message with error', () => {
    const msg = createToolResultMessage('call_1', 'Error: file not found', true);
    expect(msg.type).toBe('tool_result');
    expect(msg.is_error).toBe(true);
  });
});

describe('Tool Types', () => {
  it('should create tool definition', () => {
    const toolDef: ToolDefinition = createToolDefinition(
      'Read',
      'Read a file from the filesystem',
      {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          offset: { type: 'number' },
          limit: { type: 'number' },
        },
        required: ['file_path'],
      }
    );

    expect(toolDef.type).toBe('function');
    expect(toolDef.function.name).toBe('Read');
    expect(toolDef.function.description).toBe('Read a file from the filesystem');
    expect(toolDef.function.parameters.type).toBe('object');
    expect(toolDef.function.parameters.required).toContain('file_path');
  });
});

describe('Provider Base', () => {
  it('should store config in provider', () => {
    const config: ProviderConfig = {
      apiKey: 'test-key',
      model: 'gpt-4',
      baseURL: 'https://api.openai.com/v1',
    };

    // Create a concrete implementation for testing
    class TestProvider extends LLMProvider {
      async *chat(): AsyncIterable<LLMChunk> {
        yield { type: 'done' };
      }
    }

    const provider = new TestProvider(config);
    expect(provider.getModel()).toBe('gpt-4');
  });
});
