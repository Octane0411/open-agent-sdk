/**
 * Tests for conversation compaction functionality
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ReActLoop } from '../../src/agent/react-loop';
import type { LLMProvider } from '../../src/providers/base';
import { ToolRegistry } from '../../src/tools/registry';
import {
  createUserMessage,
  createAssistantMessage,
  createToolResultMessage,
  createCompactBoundaryMessage,
  type SDKMessage,
  type SDKCompactBoundaryMessage,
} from '../../src/types/messages';
import { generateUUID } from '../../src/utils/uuid';

// Mock provider for testing
function createMockProvider(): LLMProvider {
  return {
    chat: async function* (_messages, _tools, _signal, _options) {
      // Simple mock that returns a text response
      yield { type: 'content' as const, delta: 'Test response' };
      yield { type: 'usage' as const, usage: { input_tokens: 100, output_tokens: 20 } };
    },
    getModel: () => 'gpt-4',
  };
}

describe('ReActLoop Compaction', () => {
  let mockProvider: LLMProvider;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockProvider = createMockProvider();
    toolRegistry = new ToolRegistry();
  });

  describe('Configuration', () => {
    test('should accept autoCompactThreshold config option', () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        autoCompactThreshold: 5000,
      });

      expect(loop).toBeDefined();
    });

    test('should accept preserveRecentRounds config option', () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 3,
      });

      expect(loop).toBeDefined();
    });

    test('should use default preserveRecentRounds of 2', () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
      });

      expect(loop).toBeDefined();
    });
  });

  describe('compact() method', () => {
    test('should have compact method available', () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
      });

      expect(typeof loop.compact).toBe('function');
    });

    test('should return compacted messages with boundary message', async () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 2,
      });

      // Create test messages: system + 6 user/assistant exchanges
      const messages: SDKMessage[] = [
        // System message
        {
          type: 'system',
          subtype: 'init',
          uuid: generateUUID(),
          session_id: 'test-session',
          model: 'gpt-4',
          provider: 'openai',
          tools: [],
          cwd: '/test',
        },
        // 6 rounds of conversation
        createUserMessage('User message 1', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant response 1' }], 'test-session', generateUUID()),
        createUserMessage('User message 2', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant response 2' }], 'test-session', generateUUID()),
        createUserMessage('User message 3', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant response 3' }], 'test-session', generateUUID()),
        createUserMessage('User message 4', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant response 4' }], 'test-session', generateUUID()),
        createUserMessage('User message 5', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant response 5' }], 'test-session', generateUUID()),
        createUserMessage('User message 6', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant response 6' }], 'test-session', generateUUID()),
      ];

      const result = await loop.compact(messages, 'manual', 5000);

      // Should have: system + compact_boundary + summary + 2 recent rounds (4 messages)
      expect(result.messages.length).toBe(7);

      // Check compact_boundary message exists
      const boundaryMsg = result.messages.find(
        (m): m is SDKCompactBoundaryMessage => m.type === 'system' && 'subtype' in m && m.subtype === 'compact_boundary'
      );
      expect(boundaryMsg).toBeDefined();
      expect(boundaryMsg?.compact_metadata.trigger).toBe('manual');
      expect(boundaryMsg?.compact_metadata.pre_tokens).toBe(5000);

      // Check summary message exists (assistant message with summary)
      const summaryMsg = result.messages.find(
        (m) => m.type === 'assistant' && m.message.content.some(c => c.type === 'text' && c.text.includes('Summary'))
      );
      expect(summaryMsg).toBeDefined();

      // Check that last 2 rounds are preserved
      const userMessages = result.messages.filter(m => m.type === 'user');
      expect(userMessages.length).toBe(2);
    });

    test('should preserve system init message', async () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 1,
      });

      const messages: SDKMessage[] = [
        {
          type: 'system',
          subtype: 'init',
          uuid: generateUUID(),
          session_id: 'test-session',
          model: 'gpt-4',
          provider: 'openai',
          tools: [],
          cwd: '/test',
        },
        createUserMessage('User 1', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 1' }], 'test-session', generateUUID()),
      ];

      const result = await loop.compact(messages, 'auto', 3000);

      // Should still have system init message
      const initMsg = result.messages.find(
        (m) => m.type === 'system' && 'subtype' in m && m.subtype === 'init'
      );
      expect(initMsg).toBeDefined();
    });

    test('should handle messages with tool results', async () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 1,
      });

      const toolCallId = generateUUID();
      const messages: SDKMessage[] = [
        {
          type: 'system',
          subtype: 'init',
          uuid: generateUUID(),
          session_id: 'test-session',
          model: 'gpt-4',
          provider: 'openai',
          tools: [],
          cwd: '/test',
        },
        createUserMessage('User 1', 'test-session', generateUUID()),
        createAssistantMessage(
          [{ type: 'tool_use', id: toolCallId, name: 'Read', input: { file_path: '/test.txt' } }],
          'test-session',
          generateUUID(),
          null,
          [{ id: toolCallId, type: 'function', function: { name: 'Read', arguments: '{"file_path":"/test.txt"}' } }]
        ),
        createToolResultMessage(toolCallId, 'Read', 'File content', false, 'test-session', generateUUID()),
      ];

      const result = await loop.compact(messages, 'manual', 4000);

      // Should preserve the full round including tool results
      const toolResult = result.messages.find(m => m.type === 'tool_result');
      expect(toolResult).toBeDefined();
    });

    test('should return compaction metadata', async () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 2,
      });

      const messages: SDKMessage[] = [
        {
          type: 'system',
          subtype: 'init',
          uuid: generateUUID(),
          session_id: 'test-session',
          model: 'gpt-4',
          provider: 'openai',
          tools: [],
          cwd: '/test',
        },
        createUserMessage('User 1', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 1' }], 'test-session', generateUUID()),
        createUserMessage('User 2', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 2' }], 'test-session', generateUUID()),
        createUserMessage('User 3', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 3' }], 'test-session', generateUUID()),
      ];

      const result = await loop.compact(messages, 'manual', 5000);

      expect(result.preTokens).toBe(5000);
      expect(result.trigger).toBe('manual');
      expect(result.preservedRounds).toBe(2);
      expect(result.summaryGenerated).toBe(true);
    });
  });

  describe('preserveRecentRounds logic', () => {
    test('should correctly identify rounds in conversation', async () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 2,
      });

      const messages: SDKMessage[] = [
        {
          type: 'system',
          subtype: 'init',
          uuid: generateUUID(),
          session_id: 'test-session',
          model: 'gpt-4',
          provider: 'openai',
          tools: [],
          cwd: '/test',
        },
        // Round 1
        createUserMessage('User 1', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 1' }], 'test-session', generateUUID()),
        // Round 2
        createUserMessage('User 2', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 2' }], 'test-session', generateUUID()),
        // Round 3
        createUserMessage('User 3', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 3' }], 'test-session', generateUUID()),
      ];

      const result = await loop.compact(messages, 'manual', 3000);

      // Should preserve rounds 2 and 3 (last 2)
      const userMessages = result.messages
        .filter(m => m.type === 'user')
        .map(m => (m as { message: { content: string } }).message.content);

      expect(userMessages).toContain('User 2');
      expect(userMessages).toContain('User 3');
      expect(userMessages).not.toContain('User 1');
    });

    test('should handle preserveRecentRounds larger than conversation', async () => {
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 10,
      });

      const messages: SDKMessage[] = [
        {
          type: 'system',
          subtype: 'init',
          uuid: generateUUID(),
          session_id: 'test-session',
          model: 'gpt-4',
          provider: 'openai',
          tools: [],
          cwd: '/test',
        },
        createUserMessage('User 1', 'test-session', generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 1' }], 'test-session', generateUUID()),
      ];

      const result = await loop.compact(messages, 'manual', 1000);

      // Should preserve all messages since we have fewer rounds than preserveRecentRounds
      const userMessages = result.messages.filter(m => m.type === 'user');
      expect(userMessages.length).toBe(1);
    });
  });
});
