/**
 * Tests for Session-Storage integration
 * Verifies automatic saving and loading of session data
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { Session, SessionState } from '../../src/session/session';
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

describe('Session-Storage Integration', () => {
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

  describe('automatic saving', () => {
    it('should save messages to storage after stream completes', async () => {
      const session = createTestSession(storage);

      mockProvider.setResponses([
        [{ type: 'assistant', content: 'Hello there' }],
      ]);

      await session.send('Hi');

      // Stream should trigger save after completion
      for await (const _ of session.stream()) {
        // Consume stream
      }

      // Verify saved to storage
      const saved = await storage.load(session.id);
      expect(saved).not.toBeNull();
      expect(saved?.messages).toHaveLength(2); // user + assistant
      expect(saved?.messages[0].type).toBe('user');
      expect(saved?.messages[1].type).toBe('assistant');
    });

    it('should update updatedAt timestamp on save', async () => {
      const session = createTestSession(storage);
      const beforeStream = Date.now();

      mockProvider.setResponses([
        [{ type: 'assistant', content: 'Response' }],
      ]);

      await session.send('Hello');

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      for await (const _ of session.stream()) {
        // Consume stream
      }

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

      // First turn
      await session.send('Message 1');
      for await (const _ of session.stream()) {}

      // Second turn
      await session.send('Message 2');
      for await (const _ of session.stream()) {}

      const saved = await storage.load(session.id);
      expect(saved).not.toBeNull();
      expect(saved?.messages).toHaveLength(4); // 2 user + 2 assistant
    });

    it('should not save if no storage provided', async () => {
      const session = createTestSession(); // No storage

      mockProvider.setResponses([
        [{ type: 'assistant', content: 'Response' }],
      ]);

      await session.send('Hello');
      for await (const _ of session.stream()) {}

      // Should complete without error even without storage
      expect(session.state).toBe(SessionState.IDLE);
    });
  });

  describe('session data structure', () => {
    it('should save correct session metadata', async () => {
      const session = createTestSession(storage);

      mockProvider.setResponses([
        [{ type: 'assistant', content: 'Response' }],
      ]);

      await session.send('Hello');
      for await (const _ of session.stream()) {}

      const saved = await storage.load(session.id);
      expect(saved).not.toBeNull();
      expect(saved?.id).toBe(session.id);
      expect(saved?.model).toBe('test-model');
      expect(saved?.provider).toBe('test-provider');
      expect(saved?.createdAt).toBe(session.createdAt);
      expect(saved?.options.model).toBe('test-model');
      expect(saved?.options.provider).toBe('test-provider');
    });

    it('should preserve all message fields', async () => {
      const session = createTestSession(storage);

      mockProvider.setResponses([
        [{ type: 'assistant', content: 'Response' }],
      ]);

      await session.send('Hello');
      for await (const _ of session.stream()) {}

      const saved = await storage.load(session.id);
      expect(saved).not.toBeNull();

      const userMessage = saved?.messages[0];
      expect(userMessage?.type).toBe('user');
      expect(userMessage?.session_id).toBe(session.id);
      expect(userMessage?.uuid).toBeDefined();
      expect(userMessage?.parent_tool_use_id).toBeNull();
    });
  });

  describe('loadFromStorage', () => {
    it('should load session data from storage', async () => {
      // Create and save a session first
      const sessionData: SessionData = {
        id: 'test-session-123',
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          {
            type: 'user',
            uuid: 'msg-1',
            session_id: 'test-session-123',
            message: { role: 'user', content: 'Hello' },
            parent_tool_use_id: null,
          },
          {
            type: 'assistant',
            uuid: 'msg-2',
            session_id: 'test-session-123',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Hi there!' }],
            },
            parent_tool_use_id: null,
          },
        ],
        options: { model: 'gpt-4o', provider: 'openai' },
      };

      await storage.save(sessionData);

      // Load the session
      const loadedSession = await Session.loadFromStorage('test-session-123', storage, loop);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession?.id).toBe('test-session-123');
      expect(loadedSession?.model).toBe('gpt-4o');
      expect(loadedSession?.provider).toBe('openai');
      expect(loadedSession?.getMessages()).toHaveLength(2);
    });

    it('should return null for non-existent session', async () => {
      const loadedSession = await Session.loadFromStorage('non-existent', storage, loop);
      expect(loadedSession).toBeNull();
    });

    it('should restore message history', async () => {
      const messages: SDKMessage[] = [
        {
          type: 'user',
          uuid: 'uuid-1',
          session_id: 'test-session',
          message: { role: 'user', content: 'First message' },
          parent_tool_use_id: null,
        },
        {
          type: 'assistant',
          uuid: 'uuid-2',
          session_id: 'test-session',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'First response' }],
          },
          parent_tool_use_id: null,
        },
        {
          type: 'user',
          uuid: 'uuid-3',
          session_id: 'test-session',
          message: { role: 'user', content: 'Second message' },
          parent_tool_use_id: null,
        },
      ];

      const sessionData: SessionData = {
        id: 'test-session',
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages,
        options: { model: 'gpt-4o', provider: 'openai' },
      };

      await storage.save(sessionData);

      const loadedSession = await Session.loadFromStorage('test-session', storage, loop);

      expect(loadedSession).not.toBeNull();
      const loadedMessages = loadedSession!.getMessages();
      expect(loadedMessages).toHaveLength(3);
      expect(loadedMessages[0].type).toBe('user');
      expect(loadedMessages[1].type).toBe('assistant');
      expect(loadedMessages[2].type).toBe('user');
    });

    it('should be in IDLE state after loading', async () => {
      const sessionData: SessionData = {
        id: 'test-session',
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        options: { model: 'gpt-4o', provider: 'openai' },
      };

      await storage.save(sessionData);

      const loadedSession = await Session.loadFromStorage('test-session', storage, loop);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession?.state).toBe(SessionState.IDLE);
    });

    it('should allow continuing conversation after loading', async () => {
      const sessionData: SessionData = {
        id: 'test-session',
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          {
            type: 'user',
            uuid: 'uuid-1',
            session_id: 'test-session',
            message: { role: 'user', content: 'Hello' },
            parent_tool_use_id: null,
          },
        ],
        options: { model: 'gpt-4o', provider: 'openai' },
      };

      await storage.save(sessionData);

      const loadedSession = await Session.loadFromStorage('test-session', storage, loop);
      expect(loadedSession).not.toBeNull();

      mockProvider.setResponses([
        [{ type: 'assistant', content: 'Continuing from where we left off' }],
      ]);

      // Should be able to send new message
      await loadedSession!.send('How are you?');
      expect(loadedSession?.state).toBe(SessionState.READY);

      // Should be able to stream
      const messages: SDKMessage[] = [];
      for await (const msg of loadedSession!.stream()) {
        messages.push(msg);
      }

      expect(messages.length).toBeGreaterThan(0);
      expect(loadedSession?.state).toBe(SessionState.IDLE);
    });
  });
});
