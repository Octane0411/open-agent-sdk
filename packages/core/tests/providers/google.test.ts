import { describe, it, expect } from 'bun:test';
import { GoogleProvider } from '../../src/providers/google';
import { createUserMessage, type SDKMessage, type UUID } from '../../src/types/messages';

function generateUUID(): UUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe('GoogleProvider with Vercel AI SDK', () => {
  const sessionId = 'test-session-vercel-google';

  it('should stream response from Gemini API', async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    // Use new Vercel AI SDK Provider
    const provider = new GoogleProvider({
      apiKey: apiKey,
      model: 'gemini-2.0-flash',
    });

    const messages: SDKMessage[] = [
      createUserMessage('Say "Hello from Vercel AI SDK" and nothing else', sessionId, generateUUID()),
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
  }, 30000);
});
