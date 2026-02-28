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

  it('append() should add message to in-memory session', async () => {
    const sessionData: SessionData = {
      id: 'test-session-append',
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };
    await storage.save(sessionData);

    const msg: SDKMessage = {
      type: 'user',
      uuid: 'uuid-append-1',
      session_id: 'test-session-append',
      message: { role: 'user', content: 'hello' },
      parent_tool_use_id: null,
    };
    await storage.append('test-session-append', msg);

    const loaded = await storage.load('test-session-append');
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.messages[0].uuid).toBe('uuid-append-1');
  });

  it('append() on non-existent session is a no-op', async () => {
    // Should not throw
    const msg: SDKMessage = {
      type: 'user',
      uuid: 'uuid-noop',
      session_id: 'does-not-exist',
      message: { role: 'user', content: 'hello' },
      parent_tool_use_id: null,
    };
    await expect(storage.append('does-not-exist', msg)).resolves.toBeUndefined();
  });
});

import { generateUUID } from '../../src/utils/uuid';
import { createUserMessage, createAssistantMessage } from '../../src/types/messages';

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
    const sessionId = generateUUID();
    const sessionData: SessionData = {
      id: sessionId,
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);
    const loaded = await storage.load(sessionId);

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(sessionId);
    expect(loaded?.model).toBe('gpt-4o');
  });

  it('should return null for non-existent session', async () => {
    const nonExistentId = generateUUID();
    const loaded = await storage.load(nonExistentId);
    expect(loaded).toBeNull();
  });

  it('should check if session exists', async () => {
    const sessionId = generateUUID();
    const sessionData: SessionData = {
      id: sessionId,
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    expect(await storage.exists(sessionId)).toBe(false);
    await storage.save(sessionData);
    expect(await storage.exists(sessionId)).toBe(true);
  });

  it('should delete session file', async () => {
    const sessionId = generateUUID();
    const sessionData: SessionData = {
      id: sessionId,
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);
    expect(await storage.exists(sessionId)).toBe(true);

    await storage.delete(sessionId);
    expect(await storage.exists(sessionId)).toBe(false);
  });

  it('should reject invalid session ID format', async () => {
    const sessionData: SessionData = {
      id: 'invalid-session-id',  // Not UUID format
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    // Should throw error for non-UUID format
    expect(async () => {
      await storage.save(sessionData);
    }).toThrow('Invalid session ID format');
  });

  it('should write a .jsonl file (not .json)', async () => {
    const sessionId = generateUUID();
    const sessionData: SessionData = {
      id: sessionId,
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);

    const jsonlFile = Bun.file(`${testDir}/${sessionId}.jsonl`);
    const jsonFile = Bun.file(`${testDir}/${sessionId}.json`);

    expect(await jsonlFile.exists()).toBe(true);
    expect(await jsonFile.exists()).toBe(false);
  });

  it('should write valid JSONL: first line is session_header, each message on its own line', async () => {
    const sessionId = generateUUID();
    const messages = [
      {
        type: 'user' as const,
        uuid: 'uuid-1',
        session_id: sessionId,
        message: { role: 'user' as const, content: 'Hello' },
        parent_tool_use_id: null,
      },
      {
        type: 'assistant' as const,
        uuid: 'uuid-2',
        session_id: sessionId,
        message: { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Hi there!' }], tool_calls: [] },
        parent_tool_use_id: null,
      },
    ];

    const sessionData: SessionData = {
      id: sessionId,
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: 1000,
      updatedAt: 2000,
      messages,
      options: { model: 'gpt-4o' },
    };

    await storage.save(sessionData);

    const content = await Bun.file(`${testDir}/${sessionId}.jsonl`).text();
    const lines = content.split('\n').filter((l) => l.trim() !== '');

    // Should have 3 lines: 1 header + 2 messages
    expect(lines).toHaveLength(3);

    // Every line must be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    // First line must be session_header
    const header = JSON.parse(lines[0]);
    expect(header.type).toBe('session_header');
    expect(header.id).toBe(sessionId);
    expect(header.model).toBe('gpt-4o');
    expect(header.createdAt).toBe(1000);

    // Remaining lines are messages
    expect(JSON.parse(lines[1]).type).toBe('user');
    expect(JSON.parse(lines[2]).type).toBe('assistant');
  });

  it('should list sessions by reading .jsonl files', async () => {
    const id1 = generateUUID();
    const id2 = generateUUID();

    for (const id of [id1, id2]) {
      await storage.save({
        id,
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        options: { model: 'gpt-4o' },
      });
    }

    const list = await storage.list();
    expect(list).toContain(id1);
    expect(list).toContain(id2);
  });

  it('append() should add a new line to the JSONL file without rewriting it', async () => {
    const sessionId = generateUUID();
    await storage.save({
      id: sessionId,
      model: 'gpt-4o',
      provider: 'openai',
      createdAt: 1000,
      updatedAt: 1000,
      messages: [],
      options: { model: 'gpt-4o' },
    });

    const msg1: SDKMessage = {
      type: 'user',
      uuid: 'uuid-a1',
      session_id: sessionId,
      message: { role: 'user', content: 'hi' },
      parent_tool_use_id: null,
    };
    const msg2: SDKMessage = {
      type: 'assistant',
      uuid: 'uuid-a2',
      session_id: sessionId,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      parent_tool_use_id: null,
    };

    await storage.append(sessionId, msg1);
    await storage.append(sessionId, msg2);

    // load() should reconstruct both messages
    const loaded = await storage.load(sessionId);
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[0].uuid).toBe('uuid-a1');
    expect(loaded?.messages[1].uuid).toBe('uuid-a2');

    // File on disk: 1 header + 2 messages = 3 lines
    const content = await Bun.file(`${testDir}/${sessionId}.jsonl`).text();
    const lines = content.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(3);
  });

  it('append() on non-existent session is a no-op (does not throw)', async () => {
    const fakeId = generateUUID();
    const msg: SDKMessage = {
      type: 'user',
      uuid: 'uuid-noop',
      session_id: fakeId,
      message: { role: 'user', content: 'test' },
      parent_tool_use_id: null,
    };
    await expect(storage.append(fakeId, msg)).resolves.toBeUndefined();
    expect(await storage.exists(fakeId)).toBe(false);
  });

  it('should persist and reload P1 metadata fields (timestamp, model, usage, stop_reason)', async () => {
    const sessionId = generateUUID();
    const now = new Date().toISOString();

    const assistantMsg: SDKMessage = {
      type: 'assistant',
      uuid: 'uuid-p1',
      session_id: sessionId,
      message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      parent_tool_use_id: null,
      timestamp: now,
      model: 'gpt-4o-mini',
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: 'end_turn',
    };

    await storage.save({
      id: sessionId,
      model: 'gpt-4o-mini',
      provider: 'openai',
      createdAt: 1000,
      updatedAt: 1000,
      messages: [assistantMsg],
      options: { model: 'gpt-4o-mini' },
    });

    const loaded = await storage.load(sessionId);
    expect(loaded?.messages).toHaveLength(1);
    const msg = loaded?.messages[0] as (typeof assistantMsg);
    expect(msg.timestamp).toBe(now);
    expect(msg.model).toBe('gpt-4o-mini');
    expect(msg.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
    expect(msg.stop_reason).toBe('end_turn');
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

describe('P1 message metadata', () => {
  it('createUserMessage() sets timestamp as ISO 8601', () => {
    const before = Date.now();
    const msg = createUserMessage('hi', 'session-1', 'uuid-1');
    const after = Date.now();

    expect(msg.timestamp).toBeDefined();
    const ts = new Date(msg.timestamp!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('createAssistantMessage() sets timestamp, model, usage, stop_reason', () => {
    const before = Date.now();
    const msg = createAssistantMessage(
      [{ type: 'text', text: 'hello' }],
      'session-1',
      'uuid-2',
      null,
      undefined,
      { model: 'gpt-4o', usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn' }
    );
    const after = Date.now();

    expect(msg.timestamp).toBeDefined();
    const ts = new Date(msg.timestamp!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    expect(msg.model).toBe('gpt-4o');
    expect(msg.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(msg.stop_reason).toBe('end_turn');
  });

  it('createAssistantMessage() without options has undefined metadata fields', () => {
    const msg = createAssistantMessage(
      [{ type: 'text', text: 'hello' }],
      'session-1',
      'uuid-3'
    );
    expect(msg.model).toBeUndefined();
    expect(msg.usage).toBeUndefined();
    expect(msg.stop_reason).toBeUndefined();
    // timestamp still set
    expect(msg.timestamp).toBeDefined();
  });
});
