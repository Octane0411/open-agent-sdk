/**
 * Tests for ReActLoop system prompt handling
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ReActLoop } from '../../src/agent/react-loop';
import { ToolRegistry } from '../../src/tools/registry';
import { LLMProvider, type LLMChunk, type ChatOptions } from '../../src/providers/base';
import type { SDKMessage, SDKAssistantMessage } from '../../src/types/messages';
import type { ToolDefinition } from '../../src/types/tools';

// Mock provider for testing
class MockProvider extends LLMProvider {
  public lastMessages: SDKMessage[] = [];
  public lastOptions: ChatOptions | undefined;
  public responseQueue: SDKAssistantMessage[] = [];

  constructor() {
    super({ apiKey: 'test', model: 'test-model' });
  }

  async *chat(
    messages: SDKMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal,
    options?: ChatOptions
  ): AsyncIterable<LLMChunk> {
    this.lastMessages = messages;
    this.lastOptions = options;

    // Yield a simple text response
    yield {
      type: 'content',
      delta: 'Test response',
    };

    yield {
      type: 'usage',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    yield { type: 'done' };
  }
}

describe('ReActLoop with system prompt', () => {
  let mockProvider: MockProvider;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockProvider = new MockProvider();
    toolRegistry = new ToolRegistry();
  });

  it('should include system message metadata when systemPrompt is provided', async () => {
    const systemPrompt = 'You are a helpful coding assistant';
    const loop = new ReActLoop(
      mockProvider,
      toolRegistry,
      {
        maxTurns: 1,
        systemPrompt,
      },
      'test-session'
    );

    const generator = loop.runStream('Hello');
    await generator.next(); // Run through the generator

    // Check that the first message is a system message (metadata only)
    expect(mockProvider.lastMessages.length).toBeGreaterThan(0);
    expect(mockProvider.lastMessages[0].type).toBe('system');
    // SDKSystemMessage no longer has content field - it's metadata only
    // System prompt is passed via ChatOptions
    expect(mockProvider.lastOptions?.systemInstruction).toBe(systemPrompt);
  });

  it('should not include system message when systemPrompt is not provided', async () => {
    const loop = new ReActLoop(
      mockProvider,
      toolRegistry,
      {
        maxTurns: 1,
      },
      'test-session'
    );

    const generator = loop.runStream('Hello');
    await generator.next();

    // Check that no system message is present
    const hasSystemMessage = mockProvider.lastMessages.some(
      (msg) => msg.type === 'system'
    );
    expect(hasSystemMessage).toBe(false);
    expect(mockProvider.lastOptions?.systemInstruction).toBeUndefined();
  });

  it('should pass systemInstruction via ChatOptions when systemPrompt is provided', async () => {
    const systemPrompt = 'You are a helpful assistant';
    const loop = new ReActLoop(
      mockProvider,
      toolRegistry,
      {
        maxTurns: 1,
        systemPrompt,
      },
      'test-session'
    );

    const generator = loop.runStream('Hello');
    await generator.next();

    const systemMessages = mockProvider.lastMessages.filter(
      (msg) => msg.type === 'system'
    );
    expect(systemMessages.length).toBe(1);
    // System prompt is passed via ChatOptions, not in message content
    expect(mockProvider.lastOptions?.systemInstruction).toBe(systemPrompt);
  });

  it('should preserve system message metadata in history for subsequent turns', async () => {
    const systemPrompt = 'You are a helpful assistant';
    const loop = new ReActLoop(
      mockProvider,
      toolRegistry,
      {
        maxTurns: 1,
        systemPrompt,
      },
      'test-session'
    );

    // First turn - system message metadata should be added
    const generator1 = loop.runStream('First message');
    await generator1.next();

    const firstTurnMessages = [...mockProvider.lastMessages];
    expect(firstTurnMessages[0].type).toBe('system');

    // Second turn - pass history including system message metadata
    const generator2 = loop.runStream('Second message', firstTurnMessages);
    await generator2.next();

    // System message metadata should still be present in the messages sent to provider
    const hasSystemInSecondTurn = mockProvider.lastMessages.some(
      (msg) => msg.type === 'system'
    );
    expect(hasSystemInSecondTurn).toBe(true);
    // System instruction is still passed via options
    expect(mockProvider.lastOptions?.systemInstruction).toBe(systemPrompt);
  });
});
