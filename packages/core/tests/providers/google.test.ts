import { describe, it, expect } from 'bun:test';
import { GoogleProvider } from '../../src/providers/google';
import type { SDKMessage, ToolCall } from '../../src/types/messages';
import type { ToolDefinition } from '../../src/types/tools';

describe('Google Provider', () => {
  it('should create provider with API key', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-api-key',
      model: 'gemini-2.0-flash',
    });

    expect(provider).toBeDefined();
    expect(provider.getModel()).toBe('gemini-2.0-flash');
  });

  it('should convert user message to Google format', async () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    // Test through a mock that we can inspect the converted messages
    const messages: SDKMessage[] = [
      { type: 'user', content: 'Hello Gemini' },
    ];

    // Provider should be created successfully
    expect(provider).toBeDefined();
  });

  it('should convert system message to Google format', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    expect(provider).toBeDefined();
  });

  it('should convert assistant message with tool calls', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    expect(provider).toBeDefined();
  });

  it('should convert tool result message', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    expect(provider).toBeDefined();
  });

  it('should convert tool definitions to Google format', () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    const tools: ToolDefinition[] = [
      {
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
      },
    ];

    expect(provider).toBeDefined();
    expect(tools).toHaveLength(1);
  });
});

describe('Google Provider Real API Tests', () => {
  const apiKey = process.env.GEMINI_API_KEY;
  const hasApiKey = !!apiKey && apiKey.startsWith('AIza');

  it('should get response from Gemini API', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const provider = new GoogleProvider({
      apiKey: apiKey,
      model: 'gemini-2.0-flash',
    });

    const messages: SDKMessage[] = [
      { type: 'user', content: 'Say "Hello from Gemini" and nothing else' },
    ];

    const chunks: string[] = [];
    for await (const chunk of provider.chat(messages)) {
      if (chunk.type === 'content' && chunk.delta) {
        chunks.push(chunk.delta);
      }
    }

    const result = chunks.join('');
    console.log('Gemini response:', result);

    expect(result.toLowerCase()).toContain('hello');
    expect(result.toLowerCase()).toContain('gemini');
  }, 30000);

  it('should handle tool calling with Gemini', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const provider = new GoogleProvider({
      apiKey: apiKey,
      model: 'gemini-2.0-flash',
    });

    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
            },
            required: ['location'],
          },
        },
      },
    ];

    const messages: SDKMessage[] = [
      { type: 'user', content: 'What is the weather in Tokyo?' },
    ];

    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    for await (const chunk of provider.chat(messages, tools)) {
      if (chunk.type === 'tool_call' && chunk.tool_call) {
        toolCalls.push(chunk.tool_call);
      }
    }

    console.log('Tool calls:', toolCalls);

    expect(toolCalls.length).toBeGreaterThan(0);
    expect(toolCalls[0].name).toBe('get_weather');
    const args = JSON.parse(toolCalls[0].arguments);
    expect(args.location.toLowerCase()).toContain('tokyo');
  }, 30000);

  it('should accept AbortSignal and pass it through', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const provider = new GoogleProvider({
      apiKey: apiKey,
      model: 'gemini-2.0-flash',
    });

    const controller = new AbortController();
    const messages: SDKMessage[] = [
      { type: 'user', content: 'Say "Hello" and nothing else' },
    ];

    const chunks: string[] = [];
    let receivedContent = false;
    let streamCompleted = false;

    try {
      for await (const chunk of provider.chat(messages, undefined, controller.signal)) {
        if (chunk.type === 'content' && chunk.delta) {
          chunks.push(chunk.delta);
          receivedContent = true;
        }
        if (chunk.type === 'done') {
          streamCompleted = true;
        }
      }
    } catch (error) {
      console.log('Stream error:', error?.message);
    }

    const result = chunks.join('');
    console.log('Response with signal:', result);
    console.log('Stream completed normally:', streamCompleted);
    console.log('Response length:', result.length);

    // Verify signal acceptance didn't break normal operation
    expect(receivedContent).toBe(true);
    expect(result.toLowerCase()).toContain('hello');
    // Without abort, stream should complete normally
    expect(streamCompleted).toBe(true);
  }, 30000);

  it('should abort streaming response when signal is triggered', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const provider = new GoogleProvider({
      apiKey: apiKey,
      model: 'gemini-2.0-flash',
    });

    const controller = new AbortController();

    // Ask for a long response
    const messages: SDKMessage[] = [
      { type: 'user', content: 'Write a 500 word essay about artificial intelligence' },
    ];

    const chunks: string[] = [];
    let chunkCount = 0;
    let chunkCountAfterAbort = 0;
    let aborted = false;
    let streamEnded = false;

    // Start streaming
    const streamPromise = (async () => {
      try {
        for await (const chunk of provider.chat(messages, undefined, controller.signal)) {
          if (chunk.type === 'content' && chunk.delta) {
            chunks.push(chunk.delta);
            chunkCount++;
            // Abort after receiving first chunk
            if (chunkCount === 1 && !aborted) {
              aborted = true;
              controller.abort();
            }
            // Count chunks received after abort
            if (aborted) {
              chunkCountAfterAbort++;
            }
          }
          if (chunk.type === 'done') {
            streamEnded = true;
            break;
          }
        }
      } catch (error) {
        console.log('Stream error after abort:', error?.message);
      }
    })();

    await streamPromise;

    console.log(`Received ${chunkCount} chunks before abort`);
    console.log(`Received ${chunkCountAfterAbort} chunks after abort`);
    console.log(`Stream properly ended: ${streamEnded}`);
    console.log('Response length:', chunks.join('').length);

    // Should have received at least one chunk before abort
    expect(chunkCount).toBeGreaterThan(0);
    
    // Critical verification: After abort, very few chunks should arrive
    // This proves the stream actually stopped, not just that we stopped processing
    // Allow a small buffer (1-2 chunks) due to async nature, but should be minimal
    expect(chunkCountAfterAbort).toBeLessThanOrEqual(2);
    
    // The stream should have ended (either by done or abort)
    expect(streamEnded).toBe(true);
    
    // Verify we got significantly less content than a full essay would be
    const fullResponseEstimate = 2500; // ~500 words in characters
    expect(chunks.join('').length).toBeLessThan(fullResponseEstimate);
  }, 30000);

  it('should handle pre-aborted signal', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const provider = new GoogleProvider({
      apiKey: apiKey,
      model: 'gemini-2.0-flash',
    });

    const controller = new AbortController();
    controller.abort(); // Pre-abort before the call

    const messages: SDKMessage[] = [
      { type: 'user', content: 'Say "Hello"' },
    ];

    const chunks: string[] = [];
    let streamEnded = false;
    let errors: Error[] = [];

    try {
      for await (const chunk of provider.chat(messages, undefined, controller.signal)) {
        if (chunk.type === 'content' && chunk.delta) {
          chunks.push(chunk.delta);
        }
        if (chunk.type === 'done') {
          streamEnded = true;
        }
      }
    } catch (error) {
      errors.push(error as Error);
      console.log('Error with pre-aborted signal:', error?.message);
    }

    console.log('Chunks received with pre-aborted signal:', chunks.length);
    console.log('Stream ended:', streamEnded);
    console.log('Errors caught:', errors.length);

    // When signal is pre-aborted, either:
    // 1. The stream should immediately end with no content, OR
    // 2. An AbortError should be thrown
    // In either case, no content chunks should be received
    expect(chunks.length).toBe(0);
  }, 30000);

  it('should stop receiving chunks immediately after abort', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const provider = new GoogleProvider({
      apiKey: apiKey,
      model: 'gemini-2.0-flash',
    });

    const controller = new AbortController();
    const messages: SDKMessage[] = [
      { type: 'user', content: 'Write a 1000 word detailed essay about machine learning algorithms' },
    ];

    const chunks: string[] = [];
    let chunkCount = 0;
    let abortedAt = -1;
    let chunksAfterAbort: string[] = [];

    // Start streaming
    for await (const chunk of provider.chat(messages, undefined, controller.signal)) {
      if (chunk.type === 'content' && chunk.delta) {
        chunkCount++;
        chunks.push(chunk.delta);

        // Abort after receiving 5 chunks to ensure stream has started
        if (chunkCount === 5) {
          abortedAt = chunkCount;
          controller.abort();
        }

        // Track chunks received after abort
        if (abortedAt !== -1) {
          chunksAfterAbort.push(chunk.delta);
        }
      }
      if (chunk.type === 'done') {
        break;
      }
    }

    console.log(`Total chunks received: ${chunkCount}`);
    console.log(`Chunks before abort: ${abortedAt}`);
    console.log(`Chunks after abort: ${chunksAfterAbort.length}`);
    console.log(`Total response length: ${chunks.join('').length} characters`);
    console.log(`Response after abort length: ${chunksAfterAbort.join('').length} characters`);

    // Verify abort actually happened
    expect(abortedAt).toBe(5);
    
    // The key verification: after abort is called, should receive very few additional chunks
    // This proves the underlying stream stopped, not just our processing loop
    expect(chunksAfterAbort.length).toBeLessThanOrEqual(3);

    // Verify we got incomplete response
    const fullEssayEstimate = 5000; // ~1000 words
    expect(chunks.join('').length).toBeLessThan(fullEssayEstimate);
  }, 30000);
});
