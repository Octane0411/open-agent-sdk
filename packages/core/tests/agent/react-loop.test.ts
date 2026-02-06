import { describe, it, expect } from 'bun:test';
import { ReActLoop, type ReActLoopConfig } from '../../src/agent/react-loop';
import { ToolRegistry } from '../../src/tools/registry';
import { ReadTool } from '../../src/tools/read';
import { AskUserQuestionTool } from '../../src/tools/ask-user-question';
import { LLMProvider, type LLMChunk } from '../../src/providers/base';
import type { SDKMessage } from '../../src/types/messages';
import type { ToolDefinition } from '../../src/types/tools';

// Mock provider for testing
class MockProvider extends LLMProvider {
  private responses: SDKMessage[][] = [];
  private currentIndex = 0;

  setResponses(responses: SDKMessage[][]) {
    this.responses = responses;
    this.currentIndex = 0;
  }

  async *chat(
    messages: SDKMessage[],
    tools?: ToolDefinition[]
  ): AsyncIterable<LLMChunk> {
    const response = this.responses[this.currentIndex++];
    if (!response) {
      yield { type: 'done' };
      return;
    }

    const assistantMsg = response.find((m) => m.type === 'assistant');
    if (assistantMsg && 'content' in assistantMsg) {
      if (assistantMsg.content) {
        yield { type: 'content', delta: assistantMsg.content };
      }
      if ('tool_calls' in assistantMsg && assistantMsg.tool_calls) {
        for (const tc of assistantMsg.tool_calls) {
          yield {
            type: 'tool_call',
            tool_call: {
              id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          };
        }
      }
    }

    yield { type: 'usage', usage: { input_tokens: 10, output_tokens: 5 } };
    yield { type: 'done' };
  }
}

describe('ReAct Loop', () => {
  it('should return direct answer without tool calls', async () => {
    const registry = new ToolRegistry();
    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: 'The answer is 42',
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
    });

    const result = await loop.run('What is the answer?');

    expect(result.result).toBe('The answer is 42');
    expect(result.turnCount).toBe(1);
    expect(result.usage.input_tokens).toBe(10);
    expect(result.usage.output_tokens).toBe(5);
  });

  it('should respect max turns limit', async () => {
    const registry = new ToolRegistry();
    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    // Always returns tool call, never completes
    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'Read', arguments: '{}' },
            },
          ],
        },
      ],
      [
        {
          type: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'Read', arguments: '{}' },
            },
          ],
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 2,
    });

    const result = await loop.run('Keep going');

    expect(result.turnCount).toBe(2);
    expect(result.result).toContain('Maximum turns reached');
  });

  it('should handle tool execution', async () => {
    const registry = new ToolRegistry();
    registry.register(new ReadTool());

    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'Read',
                arguments: JSON.stringify({ file_path: '/nonexistent.txt' }),
              },
            },
          ],
        },
      ],
      [
        {
          type: 'assistant',
          content: 'File not found',
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
    });

    const result = await loop.run('Read a file');

    expect(result.result).toBe('File not found');
    expect(result.turnCount).toBe(2);
    expect(result.messages).toHaveLength(4); // system (optional), user, assistant, tool_result, assistant
  });

  it('should include system prompt when provided', async () => {
    const registry = new ToolRegistry();
    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: 'Done',
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
      systemPrompt: 'You are a helpful assistant',
    });

    const result = await loop.run('Hello');

    expect(result.messages.some((m) => m.type === 'system')).toBe(true);
  });

  it('should filter tools by allowedTools', async () => {
    const registry = new ToolRegistry();
    registry.register(new ReadTool());

    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: 'Done',
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
      allowedTools: ['Read'],
    });

    const result = await loop.run('Hello');
    expect(result.result).toBe('Done');
  });

  describe('AskUserQuestion special handling', () => {
    it('should return error when AskUserQuestion is called without canUseTool callback', async () => {
      const registry = new ToolRegistry();
      registry.register(new AskUserQuestionTool());

      const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

      mockProvider.setResponses([
        [
          {
            type: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'AskUserQuestion',
                  arguments: JSON.stringify({
                    questions: [
                      {
                        question: 'Which option?',
                        header: 'Option',
                        options: [
                          { label: 'A', description: 'Option A' },
                          { label: 'B', description: 'Option B' },
                        ],
                        multiSelect: false,
                      },
                    ],
                  }),
                },
              },
            ],
          },
        ],
        [
          {
            type: 'assistant',
            content: 'Received error',
          },
        ],
      ]);

      const loop = new ReActLoop(mockProvider, registry, {
        maxTurns: 5,
        allowedTools: ['AskUserQuestion'],
        // No canUseTool callback provided
      });

      const result = await loop.run('Ask a question');

      // The tool should fail with an error about missing canUseTool
      const toolResultMsg = result.messages.find(
        (m) => m.type === 'tool_result' && m.tool_name === 'AskUserQuestion'
      ) as { type: 'tool_result'; tool_use_id: string; tool_name: string; result: unknown; is_error: boolean } | undefined;
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg?.is_error).toBe(true);
      expect(toolResultMsg?.result).toContain(
        'requires a canUseTool callback'
      );
    });

    it('should allow AskUserQuestion when canUseTool callback is provided', async () => {
      const registry = new ToolRegistry();
      registry.register(new AskUserQuestionTool());

      const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

      mockProvider.setResponses([
        [
          {
            type: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'AskUserQuestion',
                  arguments: JSON.stringify({
                    questions: [
                      {
                        question: 'Which option?',
                        header: 'Option',
                        options: [
                          { label: 'A', description: 'Option A' },
                          { label: 'B', description: 'Option B' },
                        ],
                        multiSelect: false,
                      },
                    ],
                  }),
                },
              },
            ],
          },
        ],
        [
          {
            type: 'assistant',
            content: 'Got answer: A',
          },
        ],
      ]);

      const loop = new ReActLoop(mockProvider, registry, {
        maxTurns: 5,
        allowedTools: ['AskUserQuestion'],
        canUseTool: async (toolName, input) => {
          if (toolName === 'AskUserQuestion') {
            return {
              behavior: 'allow',
              updatedInput: {
                ...input,
                answers: { 'Which option?': 'A' },
              },
            };
          }
          return { behavior: 'allow', updatedInput: input };
        },
      });

      const result = await loop.run('Ask a question');

      // The tool should succeed
      const toolResultMsg = result.messages.find(
        (m) => m.type === 'tool_result' && m.tool_name === 'AskUserQuestion'
      ) as { type: 'tool_result'; tool_use_id: string; tool_name: string; result: unknown; is_error: boolean } | undefined;
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg?.is_error).toBe(false);
      expect(toolResultMsg?.result).toContain('A');
    });
  });
});

describe('ReActLoop.runStream()', () => {
  it('should yield assistant messages', async () => {
    const registry = new ToolRegistry();
    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: 'Hello from assistant',
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
    });

    const events: { type: string }[] = [];
    for await (const event of loop.runStream('Test prompt')) {
      events.push({ type: event.type });
    }

    expect(events.some((e) => e.type === 'assistant')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('should yield tool_result messages', async () => {
    const registry = new ToolRegistry();
    registry.register(new ReadTool());

    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'Read',
                arguments: JSON.stringify({ file_path: '/nonexistent.txt' }),
              },
            },
          ],
        },
      ],
      [
        {
          type: 'assistant',
          content: 'Done reading',
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
    });

    const events: { type: string }[] = [];
    for await (const event of loop.runStream('Read a file')) {
      events.push({ type: event.type });
    }

    expect(events.some((e) => e.type === 'assistant')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('should yield usage stats', async () => {
    const registry = new ToolRegistry();
    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: 'Response',
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
    });

    const events: { type: string; usage?: unknown }[] = [];
    for await (const event of loop.runStream('Test')) {
      events.push(event as { type: string; usage?: unknown });
    }

    const usageEvents = events.filter((e) => e.type === 'usage');
    expect(usageEvents.length).toBeGreaterThan(0);
    expect(usageEvents[0].usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
    });
  });

  it('should yield done event with result', async () => {
    const registry = new ToolRegistry();
    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: 'Final answer',
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
    });

    const events: { type: string; result?: string }[] = [];
    for await (const event of loop.runStream('Test')) {
      events.push(event as { type: string; result?: string });
    }

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.result).toBe('Final answer');
  });

  it('should stream multiple turns', async () => {
    const registry = new ToolRegistry();
    registry.register(new ReadTool());

    const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });

    mockProvider.setResponses([
      [
        {
          type: 'assistant',
          content: 'First response',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'Read',
                arguments: '{}',
              },
            },
          ],
        },
      ],
      [
        {
          type: 'assistant',
          content: 'Second response',
        },
      ],
    ]);

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 5,
    });

    const events: { type: string }[] = [];
    for await (const event of loop.runStream('Test')) {
      events.push({ type: event.type });
    }

    const assistantEvents = events.filter((e) => e.type === 'assistant');
    expect(assistantEvents.length).toBe(2);
    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents.length).toBe(1);
  });
});
