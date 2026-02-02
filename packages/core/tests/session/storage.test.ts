/**
 * Tests for Session Storage interfaces and implementations
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
  InMemoryStorage,
  FileStorage,
  type SessionData,
  type SessionStorage,
} from '../../src/session/storage';
import type { SDKMessage } from '../../src/types/messages';

describe('InMemoryStorage', () => {
  let storage: SessionStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  it('should save and load session', async () => {
    const sessionData: SessionData = {
      id: 'test-session-1',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);
    const loaded = await storage.load('test-session-1');

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe('test-session-1');
    expect(loaded?.model).toBe('gpt-4o');
  });

  it('should return null for non-existent session', async () => {
    const loaded = await storage.load('non-existent');
    expect(loaded).toBeNull();
  });

  it('should check if session exists', async () => {
    const sessionData: SessionData = {
      id: 'test-session-2',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    expect(await storage.exists('test-session-2')).toBe(false);
    await storage.save(sessionData);
    expect(await storage.exists('test-session-2')).toBe(true);
  });

  it('should delete session', async () => {
    const sessionData: SessionData = {
      id: 'test-session-3',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);
    expect(await storage.exists('test-session-3')).toBe(true);

    await storage.delete('test-session-3');
    expect(await storage.exists('test-session-3')).toBe(false);
    expect(await storage.load('test-session-3')).toBeNull();
  });

  it('should list all sessions', async () => {
    const session1: SessionData = {
      id: 'session-a',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    const session2: SessionData = {
      id: 'session-b',
      model: 'claude-3-opus',
      provider: 'anthropic',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'claude-3-opus' },
    };

    await storage.save(session1);
    await storage.save(session2);

    const list = await storage.list();
    expect(list).toHaveLength(2);
    expect(list).toContain('session-a');
    expect(list).toContain('session-b');
  });

  it('should update existing session', async () => {
    const sessionData: SessionData = {
      id: 'test-session-4',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);

    const updatedData: SessionData = {
      ...sessionData,
      model: 'gpt-4-turbo',
      updatedAt: Date.now(),
    };

    await storage.save(updatedData);
    const loaded = await storage.load('test-session-4');

    expect(loaded?.model).toBe('gpt-4-turbo');
  });

  it('should preserve message data', async () => {
    const messages: SDKMessage[] = [
      {
        type: 'user',
        uuid: 'uuid-1',
        session_id: 'test-session-5',
        message: { role: 'user', content: 'Hello' },
        parent_tool_use_id: null,
      },
      {
        type: 'assistant',
        uuid: 'uuid-2',
        session_id: 'test-session-5',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
        },
        parent_tool_use_id: null,
      },
    ];

    const sessionData: SessionData = {
      id: 'test-session-5',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages,
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);
    const loaded = await storage.load('test-session-5');

    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[0].type).toBe('user');
    expect(loaded?.messages[1].type).toBe('assistant');
  });
});

describe('FileStorage', () => {
  let storage: FileStorage;
  const testDir = '/tmp/open-agent-test-sessions';

  beforeEach(async () => {
    // Clean up test directory
    try {
      await Bun.spawn(['rm', '-rf', testDir]).exited;
    } catch {
      // Ignore cleanup errors
    }

    storage = new FileStorage({ directory: testDir });
  });

  it('should save and load session', async () => {
    const sessionData: SessionData = {
      id: 'file-test-1',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);
    const loaded = await storage.load('file-test-1');

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe('file-test-1');
    expect(loaded?.model).toBe('gpt-4o');
  });

  it('should return null for non-existent session', async () => {
    const loaded = await storage.load('non-existent-file');
    expect(loaded).toBeNull();
  });

  it('should check if session exists', async () => {
    const sessionData: SessionData = {
      id: 'file-test-2',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    expect(await storage.exists('file-test-2')).toBe(false);
    await storage.save(sessionData);
    expect(await storage.exists('file-test-2')).toBe(true);
  });

  it('should delete session file', async () => {
    const sessionData: SessionData = {
      id: 'file-test-3',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);
    expect(await storage.exists('file-test-3')).toBe(true);

    await storage.delete('file-test-3');
    expect(await storage.exists('file-test-3')).toBe(false);
  });

  it('should handle special characters in session ID', async () => {
    const sessionData: SessionData = {
      id: 'test/session:with.special!chars',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);
    // Should sanitize the ID
    expect(await storage.exists('test/session:with.special!chars')).toBe(true);
  });
});

describe('SessionData interface', () => {
  it('should have all required fields', () => {
    const sessionData: SessionData = {
      id: 'test',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: 1234567890,
      updatedAt: 1234567890,
      messages: [],
      options: {
        model: 'gpt-4o',
        provider: 'openai',
        apiKey: 'test-key',
        maxTurns: 10,
        allowedTools: ['read_file'],
        systemPrompt: 'You are helpful',
        cwd: '/tmp',
        env: { KEY: 'value' },
      },
    };

    expect(sessionData.id).toBe('test');
    expect(sessionData.model).toBe('gpt-4o');
    expect(sessionData.provider).toBe('openai');
    expect(sessionData.createdAt).toBe(1234567890);
    expect(sessionData.updatedAt).toBe(1234567890);
    expect(sessionData.messages).toEqual([]);
    expect(sessionData.options.model).toBe('gpt-4o');
    expect(sessionData.options.maxTurns).toBe(10);
  });
});
