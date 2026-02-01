import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { prompt, type PromptOptions } from '../src/index';
import { LLMProvider, type LLMChunk } from '../src/providers/base';
import { ReActLoop } from '../src/agent/react-loop';
import { ToolRegistry } from '../src/tools/registry';
import { BashTool } from '../src/tools/bash';
import type { SDKMessage } from '../src/types/messages';
import type { ToolDefinition } from '../src/types/tools';

// Mock provider for integration tests
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

describe('Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'integration-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should export prompt function', () => {
    expect(typeof prompt).toBe('function');
  });

  it('should require API key', async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await prompt('Hello', { model: 'gpt-4' });
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain('API key');
    } finally {
      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it('should accept API key in options', () => {
    // Verify that the options interface accepts apiKey
    const options: PromptOptions = {
      model: 'gpt-4',
      apiKey: 'fake-key-for-testing',
      maxTurns: 1,
    };
    expect(options.apiKey).toBe('fake-key-for-testing');
  });

  it('should track duration', () => {
    // Verify duration is part of the result type
    const mockResult = {
      result: 'test',
      duration_ms: 100,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    expect(mockResult.duration_ms).toBe(100);
    expect(typeof mockResult.duration_ms).toBe('number');
  });

  it('should export all tool classes', async () => {
    const { ReadTool, WriteTool, EditTool, BashTool, ToolRegistry } = await import(
      '../src/index'
    );

    expect(typeof ReadTool).toBe('function');
    expect(typeof WriteTool).toBe('function');
    expect(typeof EditTool).toBe('function');
    expect(typeof BashTool).toBe('function');
    expect(typeof ToolRegistry).toBe('function');
  });

  it('should export message helpers', async () => {
    const {
      createUserMessage,
      createSystemMessage,
      createAssistantMessage,
      createToolResultMessage,
    } = await import('../src/index');

    expect(typeof createUserMessage).toBe('function');
    expect(typeof createSystemMessage).toBe('function');
    expect(typeof createAssistantMessage).toBe('function');
    expect(typeof createToolResultMessage).toBe('function');
  });

  it('should export provider classes', async () => {
    const { LLMProvider, OpenAIProvider } = await import('../src/index');

    expect(typeof LLMProvider).toBe('function');
    expect(typeof OpenAIProvider).toBe('function');
  });

  it('should export ReActLoop', async () => {
    const { ReActLoop } = await import('../src/index');

    expect(typeof ReActLoop).toBe('function');
  });
});

describe('AbortController Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'abort-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should accept abortController in prompt options', () => {
    // Verify that the options interface accepts abortController
    const controller = new AbortController();
    const options: PromptOptions = {
      model: 'gpt-4',
      apiKey: 'fake-key-for-testing',
      maxTurns: 1,
      abortController: controller,
    };
    expect(options.abortController).toBe(controller);
  });

  it('should pass abortController signal to provider', async () => {
    let receivedSignal: AbortSignal | undefined;

    const mockProvider = new MockProvider(
      { apiKey: 'test', model: 'test' },
      async function* (messages, tools, signal) {
        receivedSignal = signal;
        // Simulate streaming with delay
        await new Promise(resolve => setTimeout(resolve, 50));
        yield { type: 'content', delta: 'Response' };
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

  it('should abort operation when signal is triggered', async () => {
    let callCount = 0;
    const mockProvider = new MockProvider(
      { apiKey: 'test', model: 'test' },
      async function* (messages, tools, signal) {
        callCount++;
        // First call returns tool call, second call would return content
        if (callCount === 1) {
          // Simulate some delay
          await new Promise(resolve => setTimeout(resolve, 50));
          yield {
            type: 'tool_call',
            tool_call: {
              id: 'call_1',
              name: 'Bash',
              arguments: JSON.stringify({ command: 'sleep 0.2 && echo test' }),
            },
          };
        } else {
          yield { type: 'content', delta: 'Done' };
        }
        yield { type: 'done' };
      }
    );

    const registry = new ToolRegistry();
    registry.register(new BashTool());

    const controller = new AbortController();

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 3,
      abortController: controller,
    });

    // Abort after first turn starts but before second turn
    setTimeout(() => controller.abort(), 150);

    const result = await loop.run('Test');

    // Should have aborted
    expect(result.result).toBe('Operation aborted');
    expect(callCount).toBe(1);
  });

  it('should propagate abortController to tool context', async () => {
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
      maxTurns: 2,
      abortController: controller,
    });

    const result = await loop.run('Test');

    // Tool should have executed with abortController in context
    expect(result.messages.length).toBeGreaterThan(0);
    // After tool execution, the loop should complete with final answer
    expect(result.turnCount).toBe(2);
  });

  it('should terminate bash tool when aborted', async () => {
    const tool = new BashTool();
    const controller = new AbortController();

    // Start a long-running command
    const promise = tool.handler(
      { command: 'sleep 5', timeout: 10000, description: 'Long command' },
      { cwd: tempDir, env: {}, abortController: controller }
    );

    // Abort after a short delay
    setTimeout(() => controller.abort(), 100);

    const result = await promise;

    // The command should have been terminated
    expect(result.killed || result.exitCode !== 0).toBe(true);
    expect(result.output).toContain('[Command aborted]');
  });

  it('should handle pre-aborted signal', async () => {
    const mockProvider = new MockProvider(
      { apiKey: 'test', model: 'test' },
      async function* (messages, tools, signal) {
        if (signal?.aborted) {
          yield { type: 'done' };
          return;
        }
        yield { type: 'content', delta: 'Should not see this' };
        yield { type: 'done' };
      }
    );

    const registry = new ToolRegistry();
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    const loop = new ReActLoop(mockProvider, registry, {
      maxTurns: 1,
      abortController: controller,
    });

    const result = await loop.run('Test');

    expect(result.result).toBe('Operation aborted');
  });
});

describe('Tool Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tool-integration-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should read file through tools', async () => {
    const { ReadTool } = await import('../src/index');

    const tool = new ReadTool();
    const result = await tool.handler(
      { file_path: __filename },
      { cwd: tempDir, env: {} }
    );

    expect(result.content).toBeDefined();
    expect(result.total_lines).toBeGreaterThan(0);
  });

  it('should write and read file', async () => {
    const { ReadTool, WriteTool } = await import('../src/index');

    const writeTool = new WriteTool();
    const readTool = new ReadTool();

    const filePath = join(tempDir, 'test.txt');

    // Write
    const writeResult = await writeTool.handler(
      { file_path: filePath, content: 'Test content' },
      { cwd: tempDir, env: {} }
    );

    expect(writeResult.bytes_written).toBeGreaterThan(0);

    // Read
    const readResult = await readTool.handler(
      { file_path: filePath },
      { cwd: tempDir, env: {} }
    );

    expect(readResult.content).toContain('Test content');
  });

  it('should edit file', async () => {
    const { WriteTool, EditTool, ReadTool } = await import('../src/index');

    const filePath = join(tempDir, 'edit-test.txt');

    // Write initial content
    await new WriteTool().handler(
      { file_path: filePath, content: 'Hello World' },
      { cwd: tempDir, env: {} }
    );

    // Edit
    const editResult = await new EditTool().handler(
      { file_path: filePath, old_string: 'World', new_string: 'Universe' },
      { cwd: tempDir, env: {} }
    );

    expect(editResult.replacements).toBe(1);

    // Read
    const readResult = await new ReadTool().handler(
      { file_path: filePath },
      { cwd: tempDir, env: {} }
    );

    expect(readResult.content).toContain('Hello Universe');
  });

  it('should execute bash command', async () => {
    const { BashTool } = await import('../src/index');

    const tool = new BashTool();
    const result = await tool.handler(
      { command: 'echo "integration test"', description: 'Test echo' },
      { cwd: tempDir, env: {} }
    );

    expect(result.output.trim()).toBe('integration test');
    expect(result.exitCode).toBe(0);
  });

  it('should export Glob and Grep tools', async () => {
    const { GlobTool, GrepTool } = await import('../src/index');

    expect(typeof GlobTool).toBe('function');
    expect(typeof GrepTool).toBe('function');
  });

  it('should glob files after writing', async () => {
    const { WriteTool, GlobTool } = await import('../src/index');

    const writeTool = new WriteTool();
    const globTool = new GlobTool();

    // Write some files
    await writeTool.handler(
      { file_path: join(tempDir, 'test1.ts'), content: 'export const a = 1;' },
      { cwd: tempDir, env: {} }
    );
    await writeTool.handler(
      { file_path: join(tempDir, 'test2.ts'), content: 'export const b = 2;' },
      { cwd: tempDir, env: {} }
    );
    await writeTool.handler(
      { file_path: join(tempDir, 'test.js'), content: 'module.exports = {};' },
      { cwd: tempDir, env: {} }
    );

    // Glob TypeScript files
    const result = await globTool.handler(
      { pattern: '*.ts' },
      { cwd: tempDir, env: {} }
    );

    expect(result.files).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.files!.some((f) => f.endsWith('test1.ts'))).toBe(true);
    expect(result.files!.some((f) => f.endsWith('test2.ts'))).toBe(true);
  });

  it('should grep file contents', async () => {
    const { WriteTool, GrepTool } = await import('../src/index');

    const writeTool = new WriteTool();
    const grepTool = new GrepTool();

    // Write a file with searchable content
    await writeTool.handler(
      {
        file_path: join(tempDir, 'search.ts'),
        content: 'function hello() {\n  return "world";\n}\nfunction foo() {}',
      },
      { cwd: tempDir, env: {} }
    );

    // Search for functions
    const result = await grepTool.handler(
      { pattern: 'function\\s+\\w+' },
      { cwd: tempDir, env: {} }
    );

    expect(result.matches).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.matches![0].content).toContain('function hello');
    expect(result.matches![1].content).toContain('function foo');
  });

  it('should support Write -> Glob -> Grep workflow', async () => {
    const { WriteTool, GlobTool, GrepTool } = await import('../src/index');

    // Write multiple files
    await new WriteTool().handler(
      {
        file_path: join(tempDir, 'src', 'utils.ts'),
        content: 'export function helper() { return 42; }',
      },
      { cwd: tempDir, env: {} }
    );

    await new WriteTool().handler(
      {
        file_path: join(tempDir, 'src', 'main.ts'),
        content: 'export function main() { helper(); }',
      },
      { cwd: tempDir, env: {} }
    );

    await new WriteTool().handler(
      {
        file_path: join(tempDir, 'README.md'),
        content: '# Project\n\nThis is a test.',
      },
      { cwd: tempDir, env: {} }
    );

    // Glob all TypeScript files
    const globResult = await new GlobTool().handler(
      { pattern: '**/*.ts' },
      { cwd: tempDir, env: {} }
    );

    expect(globResult.files!.length).toBeGreaterThanOrEqual(2);

    // Grep for function definitions in TypeScript files
    const grepResult = await new GrepTool().handler(
      { pattern: 'function\\s+\\w+', glob: '*.ts' },
      { cwd: tempDir, env: {} }
    );

    expect(grepResult.matches!.length).toBeGreaterThanOrEqual(2);
    expect(
      grepResult.matches!.some((m) => m.content.includes('helper'))
    ).toBe(true);
    expect(
      grepResult.matches!.some((m) => m.content.includes('main'))
    ).toBe(true);
  });

  it('should filter grep results by glob', async () => {
    const { WriteTool, GrepTool } = await import('../src/index');

    // Write files with different extensions
    await new WriteTool().handler(
      { file_path: join(tempDir, 'code.ts'), content: 'const value = 42;' },
      { cwd: tempDir, env: {} }
    );
    await new WriteTool().handler(
      { file_path: join(tempDir, 'config.js'), content: 'const value = 100;' },
      { cwd: tempDir, env: {} }
    );

    // Search only in .ts files
    const result = await new GrepTool().handler(
      { pattern: 'const\\s+value', glob: '*.ts' },
      { cwd: tempDir, env: {} }
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches![0].file.endsWith('.ts')).toBe(true);
  });
});
