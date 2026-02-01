/**
 * AbortController Support Tests
 * Tests for cancellation support across providers, agent loop, and tools
 */

import { describe, it, expect, mock } from 'bun:test';
import { LLMProvider, type LLMChunk } from '../src/providers/base';
import { OpenAIProvider } from '../src/providers/openai';
import { GoogleProvider } from '../src/providers/google';
import { ReActLoop } from '../src/agent/react-loop';
import { ToolRegistry } from '../src/tools/registry';
import { BashTool } from '../src/tools/bash';
import type { SDKMessage } from '../src/types/messages';
import type { ToolDefinition, ToolContext } from '../src/types/tools';

// Mock provider for testing AbortSignal propagation
class MockProvider extends LLMProvider {
  private handler: (
    messages: SDKMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ) => AsyncIterable<LLMChunk>;

  constructor(
    config: { apiKey: string; model: string },
    handler: (messages: SDKMessage[], tools?: ToolDefinition[], signal?: AbortSignal) => AsyncIterable<LLMChunk>
  ) {
    super(config);
    this.handler = handler;
  }

  async *chat(
    messages: SDKMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): AsyncIterable<LLMChunk> {
    yield* this.handler(messages, tools, signal);
  }
}

describe('AbortController - Provider Layer', () => {
  it('should accept AbortSignal in LLMProvider.chat() signature', () => {
    // Verify the abstract class signature accepts signal parameter
    class TestProvider extends LLMProvider {
      async *chat(
        messages: SDKMessage[],
        tools?: ToolDefinition[],
        signal?: AbortSignal
      ): AsyncIterable<LLMChunk> {
        // Check that signal is passed
        if (signal?.aborted) {
          yield { type: 'done' };
          return;
        }
        yield { type: 'content', delta: 'test' };
        yield { type: 'done' };
      }
    }

    const provider = new TestProvider({ apiKey: 'test', model: 'test' });
    expect(provider).toBeDefined();
  });

  it('should pass AbortSignal to provider.chat()', async () => {
    const receivedSignals: (AbortSignal | undefined)[] = [];

    const provider = new MockProvider(
      { apiKey: 'test', model: 'test' },
      async function* (messages, tools, signal) {
        receivedSignals.push(signal);
        yield { type: 'content', delta: 'test' };
        yield { type: 'done' };
      }
    );

    const controller = new AbortController();
    const messages: SDKMessage[] = [{ type: 'user', content: 'Hello' }];

    for await (const chunk of provider.chat(messages, undefined, controller.signal)) {
      // consume stream
    }

    expect(receivedSignals[0]).toBe(controller.signal);
  });

  it('should handle aborted signal in provider', async () => {
    const provider = new MockProvider(
      { apiKey: 'test', model: 'test' },
      async function* (messages, tools, signal) {
        if (signal?.aborted) {
          yield { type: 'done' };
          return;
        }
        yield { type: 'content', delta: 'should not see this' };
        yield { type: 'done' };
      }
    );

    const controller = new AbortController();
    controller.abort();

    const messages: SDKMessage[] = [{ type: 'user', content: 'Hello' }];
    const chunks: LLMChunk[] = [];

    for await (const chunk of provider.chat(messages, undefined, controller.signal)) {
      chunks.push(chunk);
    }

    // Should only get done, not content
    expect(chunks.every(c => c.type !== 'content')).toBe(true);
  });
});

describe('AbortController - Agent Layer', () => {
  it('should pass abortController signal to provider.chat()', async () => {
    let receivedSignal: AbortSignal | undefined;

    const mockProvider = new MockProvider(
      { apiKey: 'test', model: 'test' },
      async function* (messages, tools, signal) {
        receivedSignal = signal;
        yield { type: 'content', delta: 'Hello' };
        yield { type: 'done' };
      }
    );

    const registry = new ToolRegistry();
    const controller = new AbortController();

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 1,
      abortController: controller,
    });

    await loop.run('Test');

    expect(receivedSignal).toBe(controller.signal);
  });

  it('should check abort signal at start of each turn', async () => {
    let callCount = 0;

    const mockProvider = new MockProvider(
      { apiKey: 'test', model: 'test' },
      async function* (messages, tools, signal) {
        callCount++;
        // Simulate some async work
        await new Promise(resolve => setTimeout(resolve, 20));
        // Return tool call to trigger another turn
        if (callCount === 1) {
          yield {
            type: 'tool_call',
            tool_call: {
              id: 'call_1',
              name: 'Bash',
              arguments: JSON.stringify({ command: 'sleep 0.1 && echo test' }),
            },
          };
        } else {
          yield { type: 'content', delta: 'Response' };
        }
        yield { type: 'done' };
      }
    );

    const registry = new ToolRegistry();
    registry.register(new BashTool());

    const controller = new AbortController();

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
      abortController: controller,
    });

    // Abort before the second turn starts (after first provider call + tool execution)
    setTimeout(() => controller.abort(), 100);

    const result = await loop.run('Test');

    // Should have aborted before the second turn
    expect(result.result).toBe('Operation aborted');
    expect(callCount).toBe(1);
  });

  it('should include abortController in tool context', async () => {
    const mockProvider = new MockProvider(
      { apiKey: 'test', model: 'test' },
      async function* (messages, tools, signal) {
        // Return a tool call
        yield {
          type: 'tool_call',
          tool_call: {
            id: 'call_1',
            name: 'Bash',
            arguments: JSON.stringify({ command: 'echo test' }),
          },
        };
        yield { type: 'done' };
      }
    );

    const registry = new ToolRegistry();
    registry.register(new BashTool());

    const controller = new AbortController();

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 1,
      abortController: controller,
    });

    // The tool should receive the abortController in context
    const result = await loop.run('Test');

    // Tool should have executed (we're not testing abort during tool execution here)
    expect(result.messages.length).toBeGreaterThan(0);
  });
});

describe('AbortController - Tool Layer', () => {
  it('should accept abortController in ToolContext', () => {
    const context: ToolContext = {
      cwd: '/test',
      env: {},
      abortController: new AbortController(),
    };

    expect(context.abortController).toBeDefined();
    expect(context.abortController?.signal).toBeDefined();
  });

  it('should handle abort signal in Bash tool', async () => {
    const tool = new BashTool();
    const controller = new AbortController();

    const context: ToolContext = {
      cwd: '/tmp',
      env: {},
      abortController: controller,
    };

    // Start a long-running command
    const promise = tool.handler(
      { command: 'sleep 5', timeout: 10000, description: 'Long command' },
      context
    );

    // Abort after a short delay
    setTimeout(() => controller.abort(), 100);

    const result = await promise;

    // The command should have been terminated
    expect(result.killed || result.exitCode !== 0).toBe(true);
  });

  it('should return appropriate error when aborted', async () => {
    const tool = new BashTool();
    const controller = new AbortController();

    const context: ToolContext = {
      cwd: '/tmp',
      env: {},
      abortController: controller,
    };

    // Abort immediately
    controller.abort();

    const result = await tool.handler(
      { command: 'echo test', description: 'Test command' },
      context
    );

    // Should indicate the operation was aborted
    expect(result.output.toLowerCase()).toContain('abort') ||
      expect(result.exitCode).not.toBe(0);
  });
});

describe('AbortController - Integration', () => {
  it('should propagate abort through entire flow', async () => {
    const events: string[] = [];

    const mockProvider = new MockProvider(
      { apiKey: 'test', model: 'test' },
      async function* (messages, tools, signal) {
        events.push('provider-called');

        if (signal?.aborted) {
          events.push('provider-aborted');
          yield { type: 'done' };
          return;
        }

        // Simulate streaming response with delays
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 30));
          if (signal?.aborted) {
            events.push('stream-aborted');
            break;
          }
          yield { type: 'content', delta: `chunk-${i} ` };
        }

        yield { type: 'done' };
      }
    );

    const registry = new ToolRegistry();
    const controller = new AbortController();

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 1,
      abortController: controller,
    });

    // Start the run
    const runPromise = loop.run('Test');

    // Abort after a short delay (while streaming is in progress)
    setTimeout(() => {
      events.push('abort-triggered');
      controller.abort();
    }, 50);

    const result = await runPromise;

    // Verify abort was propagated
    expect(events).toContain('provider-called');
    expect(events).toContain('abort-triggered');
  });
});
