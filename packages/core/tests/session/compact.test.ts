/**
 * Tests for Session compact API
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { Session } from '../../src/session/session';
import { ReActLoop } from '../../src/agent/react-loop';
import type { LLMProvider } from '../../src/providers/base';
import { ToolRegistry } from '../../src/tools/registry';
import {
  createUserMessage,
  createAssistantMessage,
  type SDKCompactBoundaryMessage,
} from '../../src/types/messages';
import { generateUUID } from '../../src/utils/uuid';

// Mock provider for testing
function createMockProvider(): LLMProvider {
  return {
    chat: async function* (_messages, _tools, _signal, _options) {
      yield { type: 'content' as const, delta: 'Test response' };
      yield { type: 'usage' as const, usage: { input_tokens: 100, output_tokens: 20 } };
    },
    getModel: () => 'gpt-4',
  };
}

describe('Session compact API', () => {
  let mockProvider: LLMProvider;
  let toolRegistry: ToolRegistry;
  let loop: ReActLoop;

  beforeEach(() => {
    mockProvider = createMockProvider();
    toolRegistry = new ToolRegistry();
    loop = new ReActLoop(mockProvider, toolRegistry, {
      maxTurns: 10,
      preserveRecentRounds: 2,
    });
  });

  describe('compact() method', () => {
    test('should have compact method available', () => {
      const session = new Session(loop, {
        model: 'gpt-4',
        provider: 'openai',
      });

      expect(typeof session.compact).toBe('function');
    });

    test('should compact session messages', async () => {
      const session = new Session(loop, {
        model: 'gpt-4',
        provider: 'openai',
      });

      // Add messages to session
      const messages = [
        createUserMessage('User 1', session.id, generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 1' }], session.id, generateUUID()),
        createUserMessage('User 2', session.id, generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 2' }], session.id, generateUUID()),
        createUserMessage('User 3', session.id, generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 3' }], session.id, generateUUID()),
      ];

      // Add messages via reflection (simulating internal state)
      (session as unknown as { messages: typeof messages }).messages = messages;

      const result = await session.compact();

      expect(result.success).toBe(true);
      expect(result.preTokens).toBeDefined();
      expect(result.preservedRounds).toBe(2);

      // Check that compact_boundary message is in history
      const sessionMessages = session.getMessages();
      const boundaryMsg = sessionMessages.find(
        (m): m is SDKCompactBoundaryMessage =>
          m.type === 'system' && 'subtype' in m && m.subtype === 'compact_boundary'
      );
      expect(boundaryMsg).toBeDefined();
      expect(boundaryMsg?.compact_metadata.trigger).toBe('manual');
    });

    test('should return false when nothing to compact', async () => {
      const session = new Session(loop, {
        model: 'gpt-4',
        provider: 'openai',
      });

      // Only 1 round - nothing to compact with preserveRecentRounds=2
      const messages = [
        createUserMessage('User 1', session.id, generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 1' }], session.id, generateUUID()),
      ];

      (session as unknown as { messages: typeof messages }).messages = messages;

      const result = await session.compact();

      expect(result.success).toBe(false);
      expect(result.reason).toBe('nothing_to_compact');
    });

    test('should be blocked when session is closed', async () => {
      const session = new Session(loop, {
        model: 'gpt-4',
        provider: 'openai',
      });

      await session.close();

      await expect(session.compact()).rejects.toThrow('Session is closed');
    });

    test('should update session messages after compaction', async () => {
      const session = new Session(loop, {
        model: 'gpt-4',
        provider: 'openai',
      });

      // Add 4 rounds of messages
      const messages = [
        createUserMessage('User 1', session.id, generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 1' }], session.id, generateUUID()),
        createUserMessage('User 2', session.id, generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 2' }], session.id, generateUUID()),
        createUserMessage('User 3', session.id, generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 3' }], session.id, generateUUID()),
        createUserMessage('User 4', session.id, generateUUID()),
        createAssistantMessage([{ type: 'text', text: 'Assistant 4' }], session.id, generateUUID()),
      ];

      (session as unknown as { messages: typeof messages }).messages = messages;

      const beforeCount = session.getMessages().length;
      expect(beforeCount).toBe(8);

      await session.compact();

      const afterCount = session.getMessages().length;
      // Should have: summary message + compact_boundary + 2 preserved rounds (4 messages)
      expect(afterCount).toBeLessThan(beforeCount);

      // Verify last messages are preserved
      const finalMessages = session.getMessages();
      const userMessages = finalMessages.filter(m => m.type === 'user');
      expect(userMessages.length).toBe(2); // 2 preserved rounds
    });
  });
});
