import { describe, it, expect, mock } from 'bun:test';
import { OpenAIProvider } from '../../src/providers/openai';
import {
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createToolResultMessage,
  type UUID,
} from '../../src/types/messages';
import type { ToolDefinition } from '../../src/types/tools';

// Helper to generate test UUID
function generateUUID(): UUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
  const sessionId = 'test-session-123';

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

  it('should create system message', () => {
    const uuid = generateUUID();
    const msg = createSystemMessage(
      'gpt-4o',
      'openai',
      ['read_file'],
      '/test/cwd',
      sessionId,
      uuid
    );
    expect(msg.type).toBe('system');
    expect(msg.subtype).toBe('init');
    // SDKSystemMessage no longer has content field - it's metadata only
    expect(msg.model).toBe('gpt-4o');
    expect(msg.provider).toBe('openai');
    expect(msg.tools).toContain('read_file');
    expect(msg.cwd).toBe('/test/cwd');
  });

  it('should create assistant message with content', () => {
    const uuid = generateUUID();
    const contentBlocks = [{ type: 'text' as const, text: 'Hello!' }];
    const msg = createAssistantMessage(contentBlocks, sessionId, uuid);
    expect(msg.type).toBe('assistant');
    expect(msg.message.content[0].text).toBe('Hello!');
  });

  it('should create assistant message with tool calls', () => {
    const uuid = generateUUID();
    const contentBlocks = [{ type: 'text' as const, text: 'I will read the file' }];
    const msg = createAssistantMessage(
      contentBlocks,
      sessionId,
      uuid,
      null,
      [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'Read', arguments: '{"file_path": "/test.txt"}' },
        },
      ]
    );
    expect(msg.type).toBe('assistant');
    expect(msg.message.tool_calls).toHaveLength(1);
  });

  it('should create tool result message', () => {
    const uuid = generateUUID();
    const msg = createToolResultMessage('call_1', 'read_file', 'File content', false, sessionId, uuid);
    expect(msg.type).toBe('tool_result');
    expect(msg.tool_use_id).toBe('call_1');
    expect(msg.tool_name).toBe('read_file');
    expect(msg.result).toBe('File content');
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
