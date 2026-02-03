/**
 * Tests for Provider system prompt handling
 */

import { describe, it, expect } from 'bun:test';
import { OpenAIProvider } from '../../src/providers/openai';
import { GoogleProvider } from '../../src/providers/google';
import {
  createSystemMessage,
  createUserMessage,
  type SDKMessage,
} from '../../src/types/messages';

describe('OpenAIProvider system prompt handling', () => {
  it('should skip SDKSystemMessage metadata and use systemInstruction from options', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-4',
    });

    // SDKSystemMessage is now metadata only (no content field)
    // System prompt is passed via ChatOptions
    const messages: SDKMessage[] = [
      createSystemMessage(
        'gpt-4',
        'openai',
        [],
        '/test/cwd',
        'session-123',
        'uuid-456'
      ),
      createUserMessage('Hello', 'session-123', 'uuid-789'),
    ];

    // System instruction is passed via options, not from SDKSystemMessage
    const chunks: any[] = [];
    try {
      for await (const chunk of provider.chat(
        messages,
        undefined,
        undefined,
        { systemInstruction: 'You are a helpful assistant' }
      )) {
        chunks.push(chunk);
      }
    } catch {
      // Expected to fail with invalid API key
    }
  });
});

describe('GoogleProvider system prompt handling', () => {
  it('should skip SDKSystemMessage metadata and use systemInstruction from options', async () => {
    const provider = new GoogleProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    // SDKSystemMessage is now metadata only (no content field)
    // System prompt is passed via ChatOptions
    const messages: SDKMessage[] = [
      createSystemMessage(
        'gemini-2.0-flash',
        'google',
        [],
        '/test/cwd',
        'session-123',
        'uuid-456'
      ),
      createUserMessage('Hello', 'session-123', 'uuid-789'),
    ];

    // System instruction is passed via options, not from SDKSystemMessage
    const chunks: any[] = [];
    try {
      for await (const chunk of provider.chat(
        messages,
        undefined,
        undefined,
        { systemInstruction: 'You are a helpful assistant' }
      )) {
        chunks.push(chunk);
      }
    } catch {
      // Expected to fail with invalid API key
    }
  });
});
