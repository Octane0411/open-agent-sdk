import { describe, it, expect } from 'bun:test';
import { AnthropicProvider } from '../../src/providers/anthropic';
import { createUserMessage, type SDKMessage, type UUID } from '../../src/types/messages';

function generateUUID(): UUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe('AnthropicProvider', () => {
  const sessionId = 'test-session-anthropic';

  it('should initialize with correct config', () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-api-key',
      model: 'claude-sonnet-4-20250514',
    });

    expect(provider.getModel()).toBe('claude-sonnet-4-20250514');
  });

  it('should return correct cost for known models', () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-api-key',
      model: 'claude-sonnet-4-20250514',
    });

    const usage = { input_tokens: 1000000, output_tokens: 1000000 };
    const cost = provider.getCost?.(usage);

    // Input: $3 per 1M tokens, Output: $15 per 1M tokens
    // Total: $3 + $15 = $18
    expect(cost).toBe(18);
  });

  it('should return correct cost for haiku model', () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-api-key',
      model: 'claude-haiku-35-20241022',
    });

    const usage = { input_tokens: 1000000, output_tokens: 1000000 };
    const cost = provider.getCost?.(usage);

    // Input: $0.8 per 1M tokens, Output: $4 per 1M tokens
    // Total: $0.8 + $4 = $4.8
    expect(cost).toBe(4.8);
  });

  it('should return correct cost for opus model', () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-api-key',
      model: 'claude-opus-4-20250514',
    });

    const usage = { input_tokens: 1000000, output_tokens: 1000000 };
    const cost = provider.getCost?.(usage);

    // Input: $15 per 1M tokens, Output: $75 per 1M tokens
    // Total: $15 + $75 = $90
    expect(cost).toBe(90);
  });

  it('should return undefined for unknown models', () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-api-key',
      model: 'unknown-model',
    });

    const usage = { input_tokens: 1000000, output_tokens: 1000000 };
    const cost = provider.getCost?.(usage);

    expect(cost).toBeUndefined();
  });

  it('should handle partial token usage', () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-api-key',
      model: 'claude-sonnet-4-20250514',
    });

    const usage = { input_tokens: 500000, output_tokens: 250000 };
    const cost = provider.getCost?.(usage);

    // Input: $3 * 0.5 = $1.5, Output: $15 * 0.25 = $3.75
    // Total: $1.5 + $3.75 = $5.25
    expect(cost).toBe(5.25);
  });

  it('should stream response from Anthropic API', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.log('Skipping: ANTHROPIC_API_KEY not set');
      return;
    }

    const provider = new AnthropicProvider({
      apiKey: apiKey,
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    });

    const messages: SDKMessage[] = [
      createUserMessage('Say "Hello from Anthropic" and nothing else', sessionId, generateUUID()),
    ];

    const chunks: string[] = [];
    for await (const chunk of provider.chat(messages)) {
      if (chunk.type === 'content' && chunk.delta) {
        chunks.push(chunk.delta);
      }
    }

    const result = chunks.join('');
    console.log('Anthropic response:', result);

    expect(result.toLowerCase()).toContain('hello');
  }, 30000);
});
