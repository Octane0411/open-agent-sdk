/**
 * Session Integration Tests
 * Merged from session-storage.test.ts and fork.test.ts
 * Tests Session-Storage integration, persistence, and forking
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Session, SessionState } from '../../src/session/session';
import { createSession, forkSession } from '../../src/session/factory';
import { InMemoryStorage, type SessionData, type SessionStorage } from '../../src/session/storage';
import { ReActLoop } from '../../src/agent/react-loop';
import { ToolRegistry } from '../../src/tools/registry';
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

describe('Session Integration Tests', () => {
  let storage: SessionStorage;
  let mockProvider: MockProvider;
  let registry: ToolRegistry;
  let loop: ReActLoop;

  beforeEach(() => {
    storage = new InMemoryStorage();
    registry = new ToolRegistry();
    mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });
    loop = new ReActLoop(mockProvider, registry, { maxTurns: 5 });
  });

  function createTestSession(sessionStorage?: SessionStorage): Session {
    return new Session(loop, { model: 'test-model', provider: 'test-provider' }, sessionStorage);
  }

  describe('Automatic Persistence', () => {
    it('should save messages to storage after stream completes', async () => {
      const session = createTestSession(storage);

      mockProvider.setResponses([[{ type: 'assistant', content: 'Hello there' }]]);

      await session.send('Hi');
      for await (const _ of session.stream()) {}

      const saved = await storage.load(session.id);
      expect(saved).not.toBeNull();
      expect(saved?.messages).toHaveLength(2);
      expect(saved?.messages[0].type).toBe('user');
      expect(saved?.messages[1].type).toBe('assistant');
    });

    it('should update updatedAt timestamp on save', async () => {
      const session = createTestSession(storage);
      const beforeStream = Date.now();

      mockProvider.setResponses([[{ type: 'assistant', content: 'Response' }]]);

      await session.send('Hello');
      await new Promise((resolve) => setTimeout(resolve, 10));
      for await (const _ of session.stream()) {}

      const saved = await storage.load(session.id);
      expect(saved).not.toBeNull();
      expect(saved!.updatedAt).toBeGreaterThanOrEqual(beforeStream);
    });

    it('should save multiple turns to storage', async () => {
      const session = createTestSession(storage);

      mockProvider.setResponses([
        [{ type: 'assistant', content: 'Response 1' }],
        [{ type: 'assistant', content: 'Response 2' }],
      ]);

      await session.send('Message 1');
      for await (const _ of session.stream()) {}

      await session.send('Message 2');
      for await (const _ of session.stream()) {}

      const saved = await storage.load(session.id);
      expect(saved).not.toBeNull();
      expect(saved?.messages).toHaveLength(4);
    });

    it('should save correct session metadata', async () => {
      const session = createTestSession(storage);

      mockProvider.setResponses([[{ type: 'assistant', content: 'Response' }]]);

      await session.send('Hello');
      for await (const _ of session.stream()) {}

      const saved = await storage.load(session.id);
      expect(saved).not.toBeNull();
      expect(saved?.id).toBe(session.id);
      expect(saved?.model).toBe('test-model');
      expect(saved?.provider).toBe('test-provider');
      expect(saved?.createdAt).toBe(session.createdAt);
    });
  });

  describe('Loading from Storage', () => {
    it('should load session data from storage', async () => {
      const sessionData: SessionData = {
        id: 'test-session-123',
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          { type: 'user', uuid: 'msg-1', session_id: 'test-session-123', message: { role: 'user', content: 'Hello' }, parent_tool_use_id: null },
          { type: 'assistant', uuid: 'msg-2', session_id: 'test-session-123', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] }, parent_tool_use_id: null },
        ],
        options: { model: 'gpt-4o', provider: 'openai' },
      };

      await storage.save(sessionData);

      const loadedSession = await Session.loadFromStorage('test-session-123', storage, loop);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession?.id).toBe('test-session-123');
      expect(loadedSession?.getMessages()).toHaveLength(2);
      expect(loadedSession?.state).toBe(SessionState.IDLE);
    });

    it('should return null for non-existent session', async () => {
      const loadedSession = await Session.loadFromStorage('non-existent', storage, loop);
      expect(loadedSession).toBeNull();
    });

    it('should allow continuing conversation after loading', async () => {
      const sessionData: SessionData = {
        id: 'test-session',
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [{ type: 'user', uuid: 'uuid-1', session_id: 'test-session', message: { role: 'user', content: 'Hello' }, parent_tool_use_id: null }],
        options: { model: 'gpt-4o', provider: 'openai' },
      };

      await storage.save(sessionData);

      const loadedSession = await Session.loadFromStorage('test-session', storage, loop);
      expect(loadedSession).not.toBeNull();

      mockProvider.setResponses([[{ type: 'assistant', content: 'Continuing from where we left off' }]]);

      await loadedSession!.send('How are you?');
      expect(loadedSession?.state).toBe(SessionState.READY);

      const messages: SDKMessage[] = [];
      for await (const msg of loadedSession!.stream()) {
        messages.push(msg);
      }

      expect(messages.length).toBeGreaterThan(0);
      expect(loadedSession?.state).toBe(SessionState.IDLE);
    });
  });

  describe('Session Forking', () => {
    it('should have parentSessionId and forkedAt fields in SessionData interface', () => {
      const data: SessionData = {
        id: 'test-id',
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        options: { model: 'gpt-4o' },
        parentSessionId: 'parent-id',
        forkedAt: Date.now(),
      };

      expect(data.parentSessionId).toBe('parent-id');
      expect(typeof data.forkedAt).toBe('number');
    });

    it('should create new session with copied messages', async () => {
      const original = await createSession({
        model: 'gpt-4o',
        storage,
        apiKey: 'test-api-key',
      });

      const forked = await forkSession(original.id, { storage });

      expect(forked.id).not.toBe(original.id);
      expect(forked.model).toBe('gpt-4o');
      expect(forked.getMessages()).toEqual(original.getMessages());
    });

    it('should track parent relationship', async () => {
      const original = await createSession({
        model: 'gpt-4o',
        storage,
        apiKey: 'test-api-key',
      });

      const forked = await forkSession(original.id, { storage });

      const forkedData = await storage.load(forked.id);
      expect(forkedData?.parentSessionId).toBe(original.id);
      expect(forkedData?.forkedAt).toBeGreaterThan(0);
    });

    it('should support model override on fork', async () => {
      const original = await createSession({
        model: 'gpt-4o',
        storage,
        apiKey: 'test-api-key',
      });

      const forked = await forkSession(original.id, {
        storage,
        model: 'claude-sonnet-4',
        apiKey: 'test-api-key',
      });

      expect(forked.model).toBe('claude-sonnet-4');

      const forkedData = await storage.load(forked.id);
      expect(forkedData?.model).toBe('claude-sonnet-4');
    });

    it('should throw error when source session not found', async () => {
      await expect(forkSession('non-existent-id', { storage })).rejects.toThrow(
        'Source session "non-existent-id" not found'
      );
    });
  });
});
