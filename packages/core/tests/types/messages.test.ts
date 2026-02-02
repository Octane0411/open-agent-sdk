/**
 * Tests for SDK message types
 * Verifies message structures match Claude Agent SDK V2 format
 */
import { describe, it, expect } from 'bun:test';
import type {
  SDKMessage,
  SDKUserMessage,
  SDKAssistantMessage,
  SDKToolResultMessage,
  SDKResultMessage,
  SDKSystemMessage,
  ToolCall,
} from '../../src/types/messages';

describe('SDKMessage Types', () => {
  describe('UUID and session_id fields', () => {
    it('should have uuid field on all message types', () => {
      const userMsg: SDKUserMessage = {
        type: 'user',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        session_id: 'session-123',
        message: {
          role: 'user',
          content: 'Hello',
        },
        parent_tool_use_id: null,
      };

      expect(userMsg.uuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should have session_id field on all message types', () => {
      const assistantMsg: SDKAssistantMessage = {
        type: 'assistant',
        uuid: '550e8400-e29b-41d4-a716-446655440001',
        session_id: 'session-123',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
        },
        parent_tool_use_id: null,
      };

      expect(assistantMsg.session_id).toBe('session-123');
    });
  });

  describe('SDKUserMessage', () => {
    it('should have correct structure with nested message', () => {
      const msg: SDKUserMessage = {
        type: 'user',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        session_id: 'session-123',
        message: {
          role: 'user',
          content: 'Hello world',
        },
        parent_tool_use_id: null,
      };

      expect(msg.type).toBe('user');
      expect(msg.message.role).toBe('user');
      expect(msg.message.content).toBe('Hello world');
      expect(msg.parent_tool_use_id).toBeNull();
    });

    it('should allow parent_tool_use_id to reference a tool', () => {
      const msg: SDKUserMessage = {
        type: 'user',
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        session_id: 'session-123',
        message: {
          role: 'user',
          content: 'Yes, please proceed',
        },
        parent_tool_use_id: 'tool-123',
      };

      expect(msg.parent_tool_use_id).toBe('tool-123');
    });
  });

  describe('SDKAssistantMessage', () => {
    it('should have nested message structure with content array', () => {
      const msg: SDKAssistantMessage = {
        type: 'assistant',
        uuid: '550e8400-e29b-41d4-a716-446655440001',
        session_id: 'session-123',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello!' },
            {
              type: 'tool_use',
              id: 'tool-123',
              name: 'read_file',
              input: { path: '/test.txt' },
            },
          ],
        },
        parent_tool_use_id: null,
      };

      expect(msg.message.content[0].type).toBe('text');
      expect(msg.message.content[1].type).toBe('tool_use');
    });

    it('should support tool_calls in message', () => {
      const toolCall: ToolCall = {
        id: 'call-123',
        type: 'function',
        function: {
          name: 'read_file',
          arguments: '{"path":"/test.txt"}',
        },
      };

      const msg: SDKAssistantMessage = {
        type: 'assistant',
        uuid: '550e8400-e29b-41d4-a716-446655440001',
        session_id: 'session-123',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Let me read that file' }],
          tool_calls: [toolCall],
        },
        parent_tool_use_id: null,
      };

      expect(msg.message.tool_calls).toHaveLength(1);
      expect(msg.message.tool_calls?.[0].function.name).toBe('read_file');
    });
  });

  describe('SDKToolResultMessage', () => {
    it('should use tool_use_id instead of tool_call_id', () => {
      const msg: SDKToolResultMessage = {
        type: 'tool_result',
        uuid: '550e8400-e29b-41d4-a716-446655440002',
        session_id: 'session-123',
        tool_use_id: 'tool-123',
        tool_name: 'read_file',
        result: 'File contents here',
        is_error: false,
      };

      expect(msg.tool_use_id).toBe('tool-123');
      expect(msg.tool_name).toBe('read_file');
      expect(msg.result).toBe('File contents here');
    });

    it('should support error results', () => {
      const msg: SDKToolResultMessage = {
        type: 'tool_result',
        uuid: '550e8400-e29b-41d4-a716-446655440002',
        session_id: 'session-123',
        tool_use_id: 'tool-123',
        tool_name: 'read_file',
        result: 'File not found',
        is_error: true,
      };

      expect(msg.is_error).toBe(true);
    });
  });

  describe('SDKResultMessage', () => {
    it('should have extended fields for execution results', () => {
      const msg: SDKResultMessage = {
        type: 'result',
        subtype: 'success',
        uuid: '550e8400-e29b-41d4-a716-446655440003',
        session_id: 'session-123',
        duration_ms: 1500,
        duration_api_ms: 1200,
        is_error: false,
        num_turns: 3,
        result: 'Task completed successfully',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      expect(msg.subtype).toBe('success');
      expect(msg.duration_api_ms).toBe(1200);
      expect(msg.is_error).toBe(false);
      expect(msg.num_turns).toBe(3);
    });

    it('should support error_max_turns subtype', () => {
      const msg: SDKResultMessage = {
        type: 'result',
        subtype: 'error_max_turns',
        uuid: '550e8400-e29b-41d4-a716-446655440003',
        session_id: 'session-123',
        duration_ms: 5000,
        duration_api_ms: 4500,
        is_error: true,
        num_turns: 10,
        result: 'Maximum turns exceeded',
        usage: {
          input_tokens: 500,
          output_tokens: 200,
        },
      };

      expect(msg.subtype).toBe('error_max_turns');
      expect(msg.is_error).toBe(true);
    });

    it('should support error_during_execution subtype', () => {
      const msg: SDKResultMessage = {
        type: 'result',
        subtype: 'error_during_execution',
        uuid: '550e8400-e29b-41d4-a716-446655440003',
        session_id: 'session-123',
        duration_ms: 2000,
        duration_api_ms: 1500,
        is_error: true,
        num_turns: 2,
        result: 'An error occurred during execution',
        usage: {
          input_tokens: 150,
          output_tokens: 75,
        },
      };

      expect(msg.subtype).toBe('error_during_execution');
    });
  });

  describe('SDKSystemMessage', () => {
    it('should have init subtype with model and provider info', () => {
      const msg: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: '550e8400-e29b-41d4-a716-446655440004',
        session_id: 'session-123',
        model: 'gpt-4o',
        provider: 'openai',
        tools: ['read_file', 'write_file', 'bash'],
      };

      expect(msg.subtype).toBe('init');
      expect(msg.model).toBe('gpt-4o');
      expect(msg.provider).toBe('openai');
      expect(msg.tools).toContain('read_file');
    });
  });

  describe('SDKMessage union type', () => {
    it('should accept all message types', () => {
      const messages: SDKMessage[] = [
        {
          type: 'user',
          uuid: '550e8400-e29b-41d4-a716-446655440000',
          session_id: 'session-123',
          message: { role: 'user', content: 'Hello' },
          parent_tool_use_id: null,
        },
        {
          type: 'assistant',
          uuid: '550e8400-e29b-41d4-a716-446655440001',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hi!' }],
          },
          parent_tool_use_id: null,
        },
        {
          type: 'tool_result',
          uuid: '550e8400-e29b-41d4-a716-446655440002',
          session_id: 'session-123',
          tool_use_id: 'tool-123',
          tool_name: 'read_file',
          result: 'content',
          is_error: false,
        },
        {
          type: 'result',
          subtype: 'success',
          uuid: '550e8400-e29b-41d4-a716-446655440003',
          session_id: 'session-123',
          duration_ms: 1000,
          duration_api_ms: 800,
          is_error: false,
          num_turns: 1,
          result: 'Done',
          usage: { input_tokens: 10, output_tokens: 5 },
        },
        {
          type: 'system',
          subtype: 'init',
          uuid: '550e8400-e29b-41d4-a716-446655440004',
          session_id: 'session-123',
          model: 'gpt-4o',
          provider: 'openai',
          tools: ['read_file'],
        },
      ];

      expect(messages).toHaveLength(5);
      expect(messages[0].type).toBe('user');
      expect(messages[1].type).toBe('assistant');
      expect(messages[2].type).toBe('tool_result');
      expect(messages[3].type).toBe('result');
      expect(messages[4].type).toBe('system');
    });
  });
});
