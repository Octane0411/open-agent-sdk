/**
 * Session Unit Tests
 * Merged from session.test.ts and session-factory.test.ts
 * Tests Session class core functionality and factory functions
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Session, SessionState, SessionNotIdleError, SessionNotReadyError, SessionAlreadyStreamingError, SessionClosedError } from '../../src/session/session';
import { createSession, resumeSession } from '../../src/session/factory';
import { ReActLoop } from '../../src/agent/react-loop';
import { ToolRegistry } from '../../src/tools/registry';
import { LLMProvider, type LLMChunk } from '../../src/providers/base';
import { InMemoryStorage, FileStorage, type SessionStorage, type SessionData } from '../../src/session/storage';
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

function createTestSession(): { session: Session; mockProvider: MockProvider; registry: ToolRegistry } {
  const registry = new ToolRegistry();
  const mockProvider = new MockProvider({ apiKey: 'test', model: 'test' });
  const loop = new ReActLoop(mockProvider, registry, { maxTurns: 5 });
  const session = new Session(loop, { model: 'test-model', provider: 'test-provider' });
  return { session, mockProvider, registry };
}

describe('Session Unit Tests', () => {
  describe('Session Creation', () => {
    it('should create session with correct properties', () => {
      const { session } = createTestSession();

      expect(session.id).toBeDefined();
      expect(session.model).toBe('test-model');
      expect(session.provider).toBe('test-provider');
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.state).toBe(SessionState.IDLE);
    });

    it('should generate unique IDs for different sessions', () => {
      const { session: session1 } = createTestSession();
      const { session: session2 } = createTestSession();

      expect(session1.id).not.toBe(session2.id);
    });

    it('should create session via factory with default options', async () => {
      const session = await createSession({
        model: 'gpt-4o',
        apiKey: 'test-api-key',
      });

      expect(session).toBeInstanceOf(Session);
      expect(session.model).toBe('gpt-4o');
      expect(session.provider).toBe('openai');
      expect(session.state).toBe(SessionState.IDLE);

      await session.close();
    });

    it('should auto-detect google provider from model name', async () => {
      const session = await createSession({
        model: 'gemini-2.0-flash',
        apiKey: 'test-api-key',
      });

      expect(session.provider).toBe('google');
      await session.close();
    });

    it('should throw if API key not provided', async () => {
      const originalOpenAIKey = process.env.OPENAI_API_KEY;
      const originalGeminiKey = process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        await createSession({ model: 'gpt-4o' });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('API key is required');
      } finally {
        if (originalOpenAIKey) process.env.OPENAI_API_KEY = originalOpenAIKey;
        if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
      }
    });
  });

  describe('Session State Management', () => {
    it('should add user message and change state to ready', async () => {
      const { session } = createTestSession();

      expect(session.state).toBe(SessionState.IDLE);
      await session.send('Hello');
      expect(session.state).toBe(SessionState.READY);

      const messages = session.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('user');
    });

    it('should throw when send() called in non-idle state', async () => {
      const { session } = createTestSession();

      await session.send('Hello');
      expect(session.state).toBe(SessionState.READY);

      expect(async () => {
        await session.send('Another message');
      }).toThrow(SessionNotIdleError);
    });

    it('should throw when send() called in closed state', async () => {
      const { session } = createTestSession();

      await session.close();
      expect(session.state).toBe(SessionState.CLOSED);

      expect(async () => {
        await session.send('Hello');
      }).toThrow(SessionClosedError);
    });

    it('should follow correct state transitions: idle -> ready -> running -> idle', async () => {
      const { session, mockProvider } = createTestSession();

      mockProvider.setResponses([[{ type: 'assistant', content: 'Response' }]]);

      expect(session.state).toBe(SessionState.IDLE);

      await session.send('Hello');
      expect(session.state).toBe(SessionState.READY);

      const stream = session.stream();
      await stream.next();
      expect(session.state).toBe(SessionState.RUNNING);

      for await (const _ of stream) {}
      expect(session.state).toBe(SessionState.IDLE);
    });
  });

  describe('Session Streaming', () => {
    it('should yield messages and change state', async () => {
      const { session, mockProvider } = createTestSession();

      mockProvider.setResponses([[{ type: 'assistant', content: 'Response' }]]);

      await session.send('Hello');
      expect(session.state).toBe(SessionState.READY);

      const messages: SDKMessage[] = [];
      for await (const message of session.stream()) {
        messages.push(message);
      }

      expect(messages.length).toBeGreaterThan(0);
      expect(session.state).toBe(SessionState.IDLE);
    });

    it('should throw when stream() called in non-ready state', async () => {
      const { session } = createTestSession();

      expect(session.state).toBe(SessionState.IDLE);

      expect(async () => {
        const generator = session.stream();
        await generator.next();
      }).toThrow(SessionNotReadyError);
    });

    it('should prevent concurrent stream calls', async () => {
      const { session, mockProvider } = createTestSession();

      mockProvider.setResponses([
        [{ type: 'assistant', content: 'Response 1' }],
        [{ type: 'assistant', content: 'Response 2' }],
      ]);

      await session.send('Hello');

      const stream1 = session.stream();
      await stream1.next();

      expect(async () => {
        const stream2 = session.stream();
        await stream2.next();
      }).toThrow(SessionAlreadyStreamingError);

      for await (const _ of stream1) {}
    });
  });

  describe('Session Persistence', () => {
    it('should save initial session data to storage', async () => {
      const storage = new InMemoryStorage();

      const session = await createSession({
        model: 'gpt-4o',
        apiKey: 'test-api-key',
        storage,
      });

      const saved = await storage.load(session.id);
      expect(saved).not.toBeNull();
      expect(saved?.id).toBe(session.id);
      expect(saved?.model).toBe('gpt-4o');

      await session.close();
    });

    it('should resume session from storage by ID', async () => {
      const storage = new InMemoryStorage();

      const session = await createSession({
        model: 'gpt-4o',
        apiKey: 'test-api-key',
        storage,
      });

      const sessionId = session.id;
      await session.close();

      const resumedSession = await resumeSession(sessionId, { storage });

      expect(resumedSession).toBeInstanceOf(Session);
      expect(resumedSession.id).toBe(sessionId);
      expect(resumedSession.model).toBe('gpt-4o');

      await resumedSession.close();
    });

    it('should throw if session not found', async () => {
      const storage = new InMemoryStorage();

      try {
        await resumeSession('non-existent-session-id', { storage });
        expect(false).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('not found');
      }
    });

    it('should restore all messages and state', async () => {
      const storage = new InMemoryStorage();
      const messages: SDKMessage[] = [
        {
          type: 'user',
          uuid: 'uuid-1',
          session_id: 'test-resume-session',
          message: { role: 'user', content: 'Hello' },
          parent_tool_use_id: null,
        },
        {
          type: 'assistant',
          uuid: 'uuid-2',
          session_id: 'test-resume-session',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
          parent_tool_use_id: null,
        },
      ];

      const sessionData: SessionData = {
        id: 'test-resume-session',
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages,
        options: { model: 'gpt-4o', provider: 'openai' },
      };

      await storage.save(sessionData);

      const resumedSession = await resumeSession('test-resume-session', { storage, apiKey: 'test-api-key' });

      const loadedMessages = resumedSession.getMessages();
      expect(loadedMessages).toHaveLength(2);
      expect(loadedMessages[0].type).toBe('user');
      expect(loadedMessages[1].type).toBe('assistant');

      await resumedSession.close();
    });
  });

  describe('Session Cleanup', () => {
    it('should change state to closed', async () => {
      const { session } = createTestSession();

      expect(session.state).toBe(SessionState.IDLE);
      await session.close();
      expect(session.state).toBe(SessionState.CLOSED);
    });

    it('should throw when operations called after close', async () => {
      const { session } = createTestSession();

      await session.close();

      expect(async () => {
        await session.send('Hello');
      }).toThrow(SessionClosedError);

      expect(async () => {
        const generator = session.stream();
        await generator.next();
      }).toThrow(SessionClosedError);
    });

    it('should support async dispose pattern', async () => {
      const { session } = createTestSession();

      expect(typeof session[Symbol.asyncDispose]).toBe('function');
      await session[Symbol.asyncDispose]();

      expect(session.state).toBe(SessionState.CLOSED);
    });
  });
});
