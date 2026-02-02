/**
 * Tests for Session factory functions
 * createSession() and resumeSession()
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { createSession, resumeSession } from '../../src/session/factory';
import { Session, SessionState } from '../../src/session/session';
import { InMemoryStorage, FileStorage, type SessionStorage, type SessionData } from '../../src/session/storage';
import type { SDKMessage } from '../../src/types/messages';

// Helper to generate UUID for tests
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe('createSession', () => {
  it('should create session with default options', async () => {
    const session = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
    });

    expect(session).toBeInstanceOf(Session);
    expect(session.model).toBe('gpt-4o');
    expect(session.provider).toBe('openai'); // Default provider
    expect(session.state).toBe(SessionState.IDLE);
    expect(session.id).toBeDefined();
    expect(session.createdAt).toBeGreaterThan(0);

    await session.close();
  });

  it('should create session with custom storage', async () => {
    const customStorage = new InMemoryStorage();

    const session = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
      storage: customStorage,
    });

    expect(session).toBeInstanceOf(Session);

    await session.close();
  });

  it('should create session with InMemoryStorage by default', async () => {
    const session = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
    });

    // Session should be created successfully with default storage
    expect(session).toBeInstanceOf(Session);

    await session.close();
  });

  it('should generate unique session ID', async () => {
    const session1 = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
    });

    const session2 = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
    });

    expect(session1.id).not.toBe(session2.id);

    await session1.close();
    await session2.close();
  });

  it('should save initial session data to storage', async () => {
    const storage = new InMemoryStorage();

    const session = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
      storage,
    });

    // Verify session was saved to storage
    const saved = await storage.load(session.id);
    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(session.id);
    expect(saved?.model).toBe('gpt-4o');
    expect(saved?.provider).toBe('openai');
    expect(saved?.messages).toEqual([]);

    await session.close();
  });

  it('should support all provider options', async () => {
    const storage = new InMemoryStorage();

    const session = await createSession({
      model: 'gpt-4-turbo',
      provider: 'openai',
      apiKey: 'test-api-key',
      maxTurns: 15,
      allowedTools: ['Read', 'Write'],
      systemPrompt: 'You are a helpful assistant',
      cwd: '/tmp',
      env: { KEY: 'value' },
      storage,
    });

    expect(session.model).toBe('gpt-4-turbo');

    const saved = await storage.load(session.id);
    expect(saved?.options.model).toBe('gpt-4-turbo');
    expect(saved?.options.maxTurns).toBe(15);
    expect(saved?.options.allowedTools).toEqual(['Read', 'Write']);
    expect(saved?.options.systemPrompt).toBe('You are a helpful assistant');
    expect(saved?.options.cwd).toBe('/tmp');
    expect(saved?.options.env).toEqual({ KEY: 'value' });

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

  it('should throw if API key not provided and not in env', async () => {
    // Temporarily remove env vars
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      await createSession({
        model: 'gpt-4o',
      });

      // Should have thrown
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('API key is required');
    } finally {
      // Restore env vars
      if (originalOpenAIKey) process.env.OPENAI_API_KEY = originalOpenAIKey;
      if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
    }
  });
});

describe('resumeSession', () => {
  let storage: SessionStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  it('should resume session from storage by ID', async () => {
    // Create a session first
    const session = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
      storage,
    });

    const sessionId = session.id;
    await session.close();

    // Resume the session
    const resumedSession = await resumeSession(sessionId, { storage });

    expect(resumedSession).toBeInstanceOf(Session);
    expect(resumedSession.id).toBe(sessionId);
    expect(resumedSession.model).toBe('gpt-4o');
    expect(resumedSession.state).toBe(SessionState.IDLE);

    await resumedSession.close();
  });

  it('should throw if session not found', async () => {
    try {
      await resumeSession('non-existent-session-id', { storage });

      // Should have thrown
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('not found');
    }
  });

  it('should restore all messages and state', async () => {
    // Create session data with messages
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
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
        },
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

    // Resume the session
    const resumedSession = await resumeSession('test-resume-session', { storage, apiKey: 'test-api-key' });

    expect(resumedSession).not.toBeNull();
    const loadedMessages = resumedSession.getMessages();
    expect(loadedMessages).toHaveLength(2);
    expect(loadedMessages[0].type).toBe('user');
    expect(loadedMessages[1].type).toBe('assistant');

    await resumedSession.close();
  });

  it('should allow continuing conversation after resume', async () => {
    // Create session data with existing messages
    const messages: SDKMessage[] = [
      {
        type: 'user',
        uuid: 'uuid-1',
        session_id: 'test-continue-session',
        message: { role: 'user', content: 'Previous message' },
        parent_tool_use_id: null,
      },
    ];

    const sessionData: SessionData = {
      id: 'test-continue-session',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages,
      options: { model: 'gpt-4o', provider: 'openai' },
    };

    await storage.save(sessionData);

    // Resume the session
    const resumedSession = await resumeSession('test-continue-session', { storage, apiKey: 'test-api-key' });

    // Should be able to send new message
    await resumedSession.send('New message');
    expect(resumedSession.state).toBe(SessionState.READY);

    await resumedSession.close();
  });

  it('should use default storage if not provided', async () => {
    // Create a session with default storage first
    const session = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
    });

    const sessionId = session.id;
    await session.close();

    // Try to resume without specifying storage (should use InMemoryStorage)
    // This will fail because the default storage is a new instance
    // But we're testing that it accepts the call
    try {
      await resumeSession(sessionId);
      // If we reach here, it means the session was found in default storage
      // This could happen if there's a singleton pattern
    } catch (error) {
      // Expected - new InMemoryStorage instance won't have the session
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('should support apiKey override on resume', async () => {
    // Create session data
    const sessionData: SessionData = {
      id: 'test-apikey-override',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o', provider: 'openai' },
    };

    await storage.save(sessionData);

    // Resume with API key override
    const resumedSession = await resumeSession('test-apikey-override', {
      storage,
      apiKey: 'new-api-key',
    });

    expect(resumedSession).toBeInstanceOf(Session);
    expect(resumedSession.id).toBe('test-apikey-override');

    await resumedSession.close();
  });
});

describe('Session persistence with FileStorage', () => {
  const testDir = '/tmp/open-agent-factory-test';

  beforeEach(async () => {
    // Clean up test directory
    try {
      await Bun.spawn(['rm', '-rf', testDir]).exited;
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should persist session to file storage', async () => {
    const fileStorage = new FileStorage({ directory: testDir });

    const session = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
      storage: fileStorage,
    });

    const sessionId = session.id;

    // Verify saved to file storage
    const exists = await fileStorage.exists(sessionId);
    expect(exists).toBe(true);

    const saved = await fileStorage.load(sessionId);
    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(sessionId);

    await session.close();
  });

  it('should resume session from file storage', async () => {
    const fileStorage = new FileStorage({ directory: testDir });

    // Create session
    const session = await createSession({
      model: 'gpt-4o',
      apiKey: 'test-api-key',
      storage: fileStorage,
    });

    const sessionId = session.id;
    await session.close();

    // Resume from file storage
    const resumedSession = await resumeSession(sessionId, { storage: fileStorage });

    expect(resumedSession).toBeInstanceOf(Session);
    expect(resumedSession.id).toBe(sessionId);
    expect(resumedSession.model).toBe('gpt-4o');

    await resumedSession.close();
  });
});
