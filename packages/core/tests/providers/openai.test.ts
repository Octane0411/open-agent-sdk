import { describe, it, expect } from 'bun:test';
import { OpenAIProvider } from '../../src/providers/openai';
import { createUserMessage, type SDKMessage, type UUID } from '../../src/types/messages';

function generateUUID(): UUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe('OpenAIProvider with Vercel AI SDK', () => {
  const sessionId = 'test-session-vercel-openai';

  it('should stream response from OpenAI API', async () => {
    // Only test with real OpenAI API (DeepSeek and other compat APIs may not work)
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.log('Skipping: OPENAI_API_KEY not set');
      return;
    }

    const provider = new OpenAIProvider({
      apiKey: apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    });

    const messages: SDKMessage[] = [
      createUserMessage('Say "Hello from Vercel AI SDK OpenAI" and nothing else', sessionId, generateUUID()),
    ];

    const chunks: string[] = [];
    for await (const chunk of provider.chat(messages)) {
      if (chunk.type === 'content' && chunk.delta) {
        chunks.push(chunk.delta);
      }
    }

    const result = chunks.join('');
    console.log('OpenAI response:', result);

    expect(result.toLowerCase()).toContain('hello');
  }, 30000);
});
