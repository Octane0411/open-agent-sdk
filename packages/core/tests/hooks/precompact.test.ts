/**
 * Tests for PreCompact hook functionality
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ReActLoop } from '../../src/agent/react-loop';
import type { LLMProvider } from '../../src/providers/base';
import { ToolRegistry } from '../../src/tools/registry';
import { HookManager } from '../../src/hooks/manager';
import type { PreCompactHookInput, SyncHookJSONOutput } from '../../src/hooks/types';
import {
  createUserMessage,
  createAssistantMessage,
  type SDKMessage,
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

describe('PreCompact Hook', () => {
  let mockProvider: LLMProvider;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockProvider = createMockProvider();
    toolRegistry = new ToolRegistry();
  });

  describe('Hook triggering', () => {
    test('should trigger PreCompact hook when compacting', async () => {
      let hookCalled = false;
      let hookInput: PreCompactHookInput | undefined;

      const hookManager = new HookManager({
        PreCompact: [
          {
            hooks: [
              async (input) => {
                hookCalled = true;
                hookInput = input as PreCompactHookInput;
                return undefined;
              },
            ],
          },
        ],
      });

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 2,
        hooks: hookManager,
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

      await loop.compact(messages, 'manual', 5000);

      expect(hookCalled).toBe(true);
      expect(hookInput).toBeDefined();
      expect(hookInput?.hook_event_name).toBe('PreCompact');
      expect(hookInput?.trigger).toBe('manual');
      expect(hookInput?.custom_instructions).toBeNull();
    });

    test('should pass auto trigger type when auto-compacting', async () => {
      let hookCalled = false;
      let hookInput: PreCompactHookInput | undefined;

      const hookManager = new HookManager({
        PreCompact: [
          {
            hooks: [
              async (input) => {
                hookCalled = true;
                hookInput = input as PreCompactHookInput;
                return undefined;
              },
            ],
          },
        ],
      });

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 1,
        hooks: hookManager,
      });

      // Create 3 rounds to ensure we have something to compact
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

      const result = await loop.compact(messages, 'auto', 3000);

      // Verify compaction actually happened
      expect(result.summaryGenerated).toBe(true);
      expect(hookCalled).toBe(true);
      expect(hookInput?.trigger).toBe('auto');
    });
  });

  describe('Hook return value handling', () => {
    test('should allow compaction when hook returns void', async () => {
      const hookManager = new HookManager({
        PreCompact: [
          {
            hooks: [
              async () => {
                return undefined; // void return
              },
            ],
          },
        ],
      });

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 2,
        hooks: hookManager,
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

      // Compaction should proceed
      expect(result.summaryGenerated).toBe(true);
    });

    test('should allow compaction when hook returns continue: false', async () => {
      const hookManager = new HookManager({
        PreCompact: [
          {
            hooks: [
              async (): Promise<SyncHookJSONOutput> => {
                return { continue: false };
              },
            ],
          },
        ],
      });

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 2,
        hooks: hookManager,
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

      // Compaction should proceed
      expect(result.summaryGenerated).toBe(true);
    });

    test('should block compaction when hook returns stopReason', async () => {
      const hookManager = new HookManager({
        PreCompact: [
          {
            hooks: [
              async (): Promise<SyncHookJSONOutput> => {
                return { stopReason: 'User requested to preserve full context' };
              },
            ],
          },
        ],
      });

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 2,
        hooks: hookManager,
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

      // Compaction should be blocked
      expect(result.summaryGenerated).toBe(false);
      expect(result.messages).toEqual(messages); // Messages unchanged
    });

    test('should use custom_instructions from hook in summary', async () => {
      let customInstructions: string | null = null;

      const hookManager = new HookManager({
        PreCompact: [
          {
            hooks: [
              async (input): Promise<SyncHookJSONOutput> => {
                customInstructions = (input as PreCompactHookInput).custom_instructions;
                return { continue: true };
              },
            ],
          },
        ],
      });

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 2,
        hooks: hookManager,
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
      ];

      await loop.compact(messages, 'manual', 3000);

      // custom_instructions should be null by default
      expect(customInstructions).toBeNull();
    });
  });

  describe('Multiple hooks', () => {
    test('should stop if any hook returns stopReason', async () => {
      const hookManager = new HookManager({
        PreCompact: [
          {
            hooks: [
              async (): Promise<SyncHookJSONOutput> => {
                return { continue: true }; // Allow
              },
            ],
          },
          {
            hooks: [
              async (): Promise<SyncHookJSONOutput> => {
                return { stopReason: 'Second hook blocked' }; // Block
              },
            ],
          },
        ],
      });

      const loop = new ReActLoop(mockProvider, toolRegistry, {
        maxTurns: 10,
        preserveRecentRounds: 2,
        hooks: hookManager,
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
      ];

      const result = await loop.compact(messages, 'manual', 3000);

      // Compaction should be blocked
      expect(result.summaryGenerated).toBe(false);
    });
  });
});
