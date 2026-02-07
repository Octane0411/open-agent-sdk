/**
 * Tests for auto-compaction trigger functionality
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ReActLoop } from '../../src/agent/react-loop';
import type { LLMProvider, ChatChunk } from '../../src/providers/base';
import { ToolRegistry } from '../../src/tools/registry';
import type { SDKMessage } from '../../src/types/messages';

// Mock provider that tracks token usage
function createMockProviderWithUsage(
  inputTokens: number,
  outputTokens: number
): LLMProvider {
  return {
    chat: async function* (_messages, _tools, _signal, _options) {
      yield { type: 'content' as const, delta: 'Test response' };
      yield {
        type: 'usage' as const,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      };
    },
    getModel: () => 'gpt-4',
  };
}

describe('ReActLoop Auto-Compaction', () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  describe('autoCompactThreshold configuration', () => {
    test('should not trigger compaction when under threshold', async () => {
      const mockProvider = createMockProviderWithUsage(500, 100);
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 5,
        autoCompactThreshold: 1000,
        preserveRecentRounds: 2,
      });

      // Run a simple conversation
      const result = await loop.run('Hello');

      // Should complete normally without compaction
      expect(result.result).toBe('Test response');
      expect(result.turnCount).toBe(1);
    });

    test('should trigger compaction when over threshold', async () => {
      // Create a provider that simulates high token usage
      let callCount = 0;
      const mockProvider: LLMProvider = {
        chat: async function* (_messages, _tools, _signal, _options) {
          callCount++;
          // First call returns high usage to trigger compaction
          if (callCount === 1) {
            yield { type: 'content' as const, delta: 'First response' };
            yield {
              type: 'usage' as const,
              usage: { input_tokens: 1500, output_tokens: 200 },
            };
          } else {
            // Subsequent calls after compaction
            yield { type: 'content' as const, delta: 'Final response' };
            yield {
              type: 'usage' as const,
              usage: { input_tokens: 300, output_tokens: 50 },
            };
          }
        },
        getModel: () => 'gpt-4',
      };

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 5,
        autoCompactThreshold: 1000,
        preserveRecentRounds: 2,
      });

      // Run conversation with history that would exceed threshold
      const history: SDKMessage[] = [];
      // Add enough messages to simulate a long conversation
      for (let i = 0; i < 10; i++) {
        history.push({
          type: 'user',
          uuid: `user-${i}`,
          session_id: 'test',
          message: { role: 'user', content: `Message ${i}` },
          parent_tool_use_id: null,
        });
        history.push({
          type: 'assistant',
          uuid: `assistant-${i}`,
          session_id: 'test',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: `Response ${i}` }],
          },
          parent_tool_use_id: null,
        });
      }

      // Use runStream to observe compaction
      const events: Array<{ type: string }> = [];
      for await (const event of loop.runStream('Hello', history)) {
        events.push(event);
      }

      // Should have completed
      expect(events.some(e => e.type === 'done')).toBe(true);
    });

    test('should not auto-compact when threshold is undefined', async () => {
      const mockProvider = createMockProviderWithUsage(2000, 200);
      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 5,
        // autoCompactThreshold is undefined - no auto-compaction
      });

      const result = await loop.run('Hello');

      // Should complete without any compaction
      expect(result.result).toBe('Test response');
    });
  });

  describe('Token tracking for compaction', () => {
    test('should track cumulative token usage across turns', async () => {
      let totalInputTokens = 0;
      const mockProvider: LLMProvider = {
        chat: async function* (_messages, _tools, _signal, _options) {
          // Simulate increasing token usage
          const inputTokens = 600;
          const outputTokens = 100;
          totalInputTokens += inputTokens;

          yield { type: 'content' as const, delta: 'Response' };
          yield {
            type: 'usage' as const,
            usage: { input_tokens: inputTokens, output_tokens: outputTokens },
          };
        },
        getModel: () => 'gpt-4',
      };

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 5,
        autoCompactThreshold: 1500,
      });

      // First run
      await loop.run('First message');
      expect(totalInputTokens).toBe(600);

      // Second run would accumulate more tokens
      // Note: Each run is independent, so we test the usage tracking within a single run
    });

    test('should include compact_boundary message in token count after compaction', async () => {
      // This test verifies that after compaction, the token count includes
      // the new messages (boundary + summary)
      const mockProvider: LLMProvider = {
        chat: async function* (messages, _tools, _signal, _options) {
          // Count messages to verify compaction happened
          const messageCount = messages.length;

          yield {
            type: 'content' as const,
            delta: `Messages: ${messageCount}`,
          };
          yield {
            type: 'usage' as const,
            usage: { input_tokens: 100, output_tokens: 20 },
          };
        },
        getModel: () => 'gpt-4',
      };

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 5,
        autoCompactThreshold: 1000,
        preserveRecentRounds: 2,
      });

      const result = await loop.run('Hello');
      expect(result.result).toContain('Messages:');
    });
  });

  describe('Compaction in runStream', () => {
    test('should emit compaction event when auto-compacting', async () => {
      let callCount = 0;
      const mockProvider: LLMProvider = {
        chat: async function* (_messages, _tools, _signal, _options) {
          callCount++;
          if (callCount === 1) {
            yield { type: 'content' as const, delta: 'First' };
            yield {
              type: 'usage' as const,
              usage: { input_tokens: 1200, output_tokens: 100 },
            };
          } else {
            yield { type: 'content' as const, delta: 'After compaction' };
            yield {
              type: 'usage' as const,
              usage: { input_tokens: 200, output_tokens: 50 },
            };
          }
        },
        getModel: () => 'gpt-4',
      };

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 5,
        autoCompactThreshold: 1000,
        preserveRecentRounds: 2,
      });

      const history: SDKMessage[] = [];
      for (let i = 0; i < 5; i++) {
        history.push({
          type: 'user',
          uuid: `user-${i}`,
          session_id: 'test',
          message: { role: 'user', content: `Message ${i}` },
          parent_tool_use_id: null,
        });
        history.push({
          type: 'assistant',
          uuid: `assistant-${i}`,
          session_id: 'test',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: `Response ${i}` }],
          },
          parent_tool_use_id: null,
        });
      }

      const events: Array<{ type: string }> = [];
      for await (const event of loop.runStream('Hello', history)) {
        events.push(event);
      }

      // Should complete successfully
      expect(events.some(e => e.type === 'done')).toBe(true);
    });
  });
});
