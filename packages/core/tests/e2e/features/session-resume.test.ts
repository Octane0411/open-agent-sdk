/**
 * Session Persistence E2E Tests
 * Tests session save, load, and resume functionality with real APIs
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createSession, resumeSession, FileStorage, InMemoryStorage } from '../../../src/session';
import type { Session } from '../../../src/session';
import {
  TEST_CONFIG,
  isProviderAvailable,
  skipIfNoProvider,
  getSessionOptions,
  createTempDir,
  cleanupTempDir,
} from '../setup';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Skip all tests if no providers are available
const hasProvider = isProviderAvailable('openai') || isProviderAvailable('google');
const describeIfProvider = hasProvider ? describe : describe.skip;

describeIfProvider('Session Persistence E2E', () => {
  let tempDir: string;
  let sessionsDir: string;
  let session: Session | null = null;

  beforeEach(() => {
    tempDir = createTempDir();
    sessionsDir = join(tempDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    if (session) {
      await session.close();
      session = null;
    }
    cleanupTempDir(tempDir);
  });

  describe('FileStorage Persistence', () => {
    test('should save session to file storage', async () => {
      if (skipIfNoProvider("openai")) return;

      const storage = new FileStorage({ directory: sessionsDir });

      session = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });

      // Have a conversation
      await session.send('Hello');
      for await (const _ of session.stream()) {
        // Consume
      }

      // Close session to trigger save
      await session.close();

      // Verify file was created
      const sessionFile = join(sessionsDir, `${session.id}.json`);
      expect(existsSync(sessionFile)).toBe(true);
    }, TEST_CONFIG.timeout);

    test('should persist message history', async () => {
      if (skipIfNoProvider("openai")) return;

      const storage = new FileStorage({ directory: sessionsDir });

      session = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });

      const sessionId = session.id;

      // Have a conversation
      await session.send('My name is Bob');
      for await (const _ of session.stream()) {
        // Consume
      }

      await session.send('I like pizza');
      for await (const _ of session.stream()) {
        // Consume
      }

      const messageCount = session.getMessages().length;
      expect(messageCount).toBeGreaterThan(0);

      // Close session
      await session.close();
      session = null;

      // Resume session
      const resumedSession = await resumeSession(sessionId, {
        storage,
        apiKey: TEST_CONFIG.openai.apiKey,
      });

      // Verify history is preserved
      const resumedMessages = resumedSession.getMessages();
      expect(resumedMessages.length).toBe(messageCount);

      await resumedSession.close();
    }, TEST_CONFIG.timeout * 2);

    test('should resume and continue conversation', async () => {
      if (skipIfNoProvider("openai")) return;

      const storage = new FileStorage({ directory: sessionsDir });

      session = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });

      const sessionId = session.id;

      // Initial conversation
      await session.send('Remember this: the secret code is 12345');
      for await (const _ of session.stream()) {
        // Consume
      }

      await session.close();
      session = null;

      // Resume and ask about the secret
      const resumedSession = await resumeSession(sessionId, {
        storage,
        apiKey: TEST_CONFIG.openai.apiKey,
      });

      await resumedSession.send('What is the secret code I told you earlier?');
      const messages: Array<{ type: string; message?: { content?: unknown } }> = [];
      for await (const message of resumedSession.stream()) {
        messages.push(message as { type: string; message?: { content?: unknown } });
      }

      // Verify the agent remembers
      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('12345');

      await resumedSession.close();
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Multiple Sessions', () => {
    test('should keep multiple sessions independent', async () => {
      if (skipIfNoProvider("openai")) return;

      const storage = new FileStorage({ directory: sessionsDir });

      // Create first session
      const session1 = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });

      await session1.send('My name is Alice');
      for await (const _ of session1.stream()) {
        // Consume
      }

      // Create second session
      const session2 = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });

      await session2.send('My name is Bob');
      for await (const _ of session2.stream()) {
        // Consume
      }

      // Verify different IDs
      expect(session1.id).not.toBe(session2.id);

      // Verify different histories
      const history1 = session1.getMessages();
      const history2 = session2.getMessages();

      expect(history1.length).toBeGreaterThan(0);
      expect(history2.length).toBeGreaterThan(0);

      // Convert to string and check for names
      const history1Text = JSON.stringify(history1).toLowerCase();
      const history2Text = JSON.stringify(history2).toLowerCase();

      expect(history1Text).toContain('alice');
      expect(history2Text).toContain('bob');
      expect(history1Text).not.toContain('bob');
      expect(history2Text).not.toContain('alice');

      await session1.close();
      await session2.close();
    }, TEST_CONFIG.timeout * 2);

    test('should list all sessions', async () => {
      if (skipIfNoProvider("openai")) return;

      const storage = new FileStorage({ directory: sessionsDir });

      // Create multiple sessions
      const session1 = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });
      const session2 = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });
      const session3 = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });

      // List sessions
      const sessionIds = await storage.list();

      expect(sessionIds.length).toBe(3);
      expect(sessionIds).toContain(session1.id);
      expect(sessionIds).toContain(session2.id);
      expect(sessionIds).toContain(session3.id);

      await session1.close();
      await session2.close();
      await session3.close();
    });

    test('should check session existence', async () => {
      if (skipIfNoProvider("openai")) return;

      const storage = new FileStorage({ directory: sessionsDir });

      session = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });

      const sessionId = session.id;

      expect(await storage.exists(sessionId)).toBe(true);
      expect(await storage.exists('non-existent-id')).toBe(false);
    });
  });

  describe('Session Data Integrity', () => {
    test('should preserve all session metadata', async () => {
      if (skipIfNoProvider("openai")) return;

      const storage = new FileStorage({ directory: sessionsDir });
      const systemPrompt = 'You are a test assistant';

      session = await createSession({
        ...getSessionOptions('openai', { systemPrompt }),
        storage,
      });

      const originalId = session.id;
      const originalModel = session.model;
      const originalProvider = session.provider;
      const originalCreatedAt = session.createdAt;

      await session.send('Hello');
      for await (const _ of session.stream()) {
        // Consume
      }

      await session.close();
      session = null;

      // Resume and verify metadata
      const resumedSession = await resumeSession(originalId, {
        storage,
        apiKey: TEST_CONFIG.openai.apiKey,
      });

      expect(resumedSession.id).toBe(originalId);
      expect(resumedSession.model).toBe(originalModel);
      expect(resumedSession.provider).toBe(originalProvider);
      expect(resumedSession.createdAt).toBe(originalCreatedAt);

      await resumedSession.close();
    }, TEST_CONFIG.timeout * 2);

    test('should handle session not found', async () => {
      const storage = new FileStorage({ directory: sessionsDir });

      await expect(
        resumeSession('non-existent-session-id', {
          storage,
          apiKey: TEST_CONFIG.openai.apiKey || 'dummy',
        })
      ).rejects.toThrow(/not found/);
    });
  });

  describe('InMemoryStorage', () => {
    test('should work with in-memory storage', async () => {
      if (skipIfNoProvider("openai")) return;

      const storage = new InMemoryStorage();

      session = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });

      const sessionId = session.id;

      await session.send('Test message');
      for await (const _ of session.stream()) {
        // Consume
      }

      const messageCount = session.getMessages().length;

      await session.close();
      session = null;

      // Resume from memory
      const resumedSession = await resumeSession(sessionId, {
        storage,
        apiKey: TEST_CONFIG.openai.apiKey,
      });

      expect(resumedSession.getMessages().length).toBe(messageCount);

      await resumedSession.close();
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Cross-Provider Persistence', () => {
    test('should preserve provider information when resuming', async () => {
      skipIfNoProvider('google');

      const storage = new FileStorage({ directory: sessionsDir });

      session = await createSession({
        ...getSessionOptions('google'),
        storage,
      });

      const sessionId = session.id;

      await session.send('Hello from Google');
      for await (const _ of session.stream()) {
        // Consume
      }

      await session.close();
      session = null;

      // Resume with Google provider
      const resumedSession = await resumeSession(sessionId, {
        storage,
        apiKey: TEST_CONFIG.google.apiKey,
      });

      expect(resumedSession.provider).toBe('google');
      expect(resumedSession.model).toBe(TEST_CONFIG.google.model);

      // Continue conversation
      await resumedSession.send('What provider are you using?');
      const messages: unknown[] = [];
      for await (const message of resumedSession.stream()) {
        messages.push(message);
      }

      expect(messages.length).toBeGreaterThan(0);

      await resumedSession.close();
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Session Deletion', () => {
    test('should delete session from storage', async () => {
      if (skipIfNoProvider("openai")) return;

      const storage = new FileStorage({ directory: sessionsDir });

      session = await createSession({
        ...getSessionOptions('openai'),
        storage,
      });

      const sessionId = session.id;

      await session.close();
      session = null;

      // Verify exists
      expect(await storage.exists(sessionId)).toBe(true);

      // Delete
      await storage.delete(sessionId);

      // Verify deleted
      expect(await storage.exists(sessionId)).toBe(false);
    });
  });
});
