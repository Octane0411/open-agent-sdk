import { describe, it, expect } from 'bun:test';
import {
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createToolResultMessage,
  type SDKMessage,
  type ToolCall,
  type UUID,
} from '../src/types/messages';
import { createToolDefinition, type ToolDefinition } from '../src/types/tools';
import { LLMProvider, type ProviderConfig, type LLMChunk } from '../src/providers/base';

// Helper to generate test UUID
function generateUUID(): UUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe('Message Types', () => {
  const sessionId = 'test-session-123';

  it('should create user message', () => {
    const uuid = generateUUID();
    const msg = createUserMessage('Hello', sessionId, uuid);
    expect(msg.type).toBe('user');
    expect(msg.uuid).toBe(uuid);
    expect(msg.session_id).toBe(sessionId);
    expect(msg.message.content).toBe('Hello');
    expect(msg.message.role).toBe('user');
    expect(msg.parent_tool_use_id).toBeNull();
  });

  it('should create system message', () => {
    const uuid = generateUUID();
    const msg = createSystemMessage('gpt-4o', 'openai', ['read_file', 'write_file'], sessionId, uuid);
    expect(msg.type).toBe('system');
    expect(msg.subtype).toBe('init');
    expect(msg.uuid).toBe(uuid);
    expect(msg.session_id).toBe(sessionId);
    expect(msg.model).toBe('gpt-4o');
    expect(msg.provider).toBe('openai');
    expect(msg.tools).toContain('read_file');
    expect(msg.tools).toContain('write_file');
  });

  it('should create assistant message with content', () => {
    const uuid = generateUUID();
    const contentBlocks = [{ type: 'text' as const, text: 'Hello there!' }];
    const msg = createAssistantMessage(contentBlocks, sessionId, uuid);
    expect(msg.type).toBe('assistant');
    expect(msg.uuid).toBe(uuid);
    expect(msg.session_id).toBe(sessionId);
    expect(msg.message.content).toHaveLength(1);
    expect(msg.message.content[0].type).toBe('text');
    expect(msg.message.content[0].text).toBe('Hello there!');
    expect(msg.message.tool_calls).toBeUndefined();
  });

  it('should create assistant message with tool calls', () => {
    const uuid = generateUUID();
    const toolCalls: ToolCall[] = [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'Read', arguments: '{"file_path": "/test.txt"}' },
      },
    ];
    const contentBlocks = [{ type: 'text' as const, text: 'I will read the file' }];
    const msg = createAssistantMessage(contentBlocks, sessionId, uuid, null, toolCalls);
    expect(msg.type).toBe('assistant');
    expect(msg.message.tool_calls).toHaveLength(1);
    expect(msg.message.tool_calls?.[0].function.name).toBe('Read');
  });

  it('should create tool result message', () => {
    const uuid = generateUUID();
    const msg = createToolResultMessage('call_1', 'read_file', 'File content here', false, sessionId, uuid);
    expect(msg.type).toBe('tool_result');
    expect(msg.uuid).toBe(uuid);
    expect(msg.session_id).toBe(sessionId);
    expect(msg.tool_use_id).toBe('call_1');
    expect(msg.tool_name).toBe('read_file');
    expect(msg.result).toBe('File content here');
    expect(msg.is_error).toBe(false);
  });

  it('should create tool result message with error', () => {
    const uuid = generateUUID();
    const msg = createToolResultMessage(
      'call_1',
      'read_file',
      'Error: file not found',
      true,
      sessionId,
      uuid
    );
    expect(msg.type).toBe('tool_result');
    expect(msg.is_error).toBe(true);
    expect(msg.result).toBe('Error: file not found');
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
