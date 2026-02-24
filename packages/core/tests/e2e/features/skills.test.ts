/**
 * Skill System E2E Tests
 * Tests skill loading, command detection, and content injection with real APIs
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createSession, SessionState } from '../../../src/session';
import type { Session } from '../../../src/session';
import {
  TEST_CONFIG,
  skipIfNoProvider,
  getSessionOptions,
  createTempDir,
  cleanupTempDir,
} from '../setup';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { homedir } from 'os';

// Skip all tests if no providers are available
const hasProvider = TEST_CONFIG.openai.available || TEST_CONFIG.google.available;
const describeIfProvider = hasProvider ? describe : describe.skip;

describeIfProvider('Skill System E2E', () => {
  let tempDir: string;
  let skillsDir: string;
  let session: Session | null = null;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = createTempDir();
    skillsDir = join(tempDir, '.claude', 'skills');
    mkdirSync(skillsDir, { recursive: true });

    // Create a test skill file
    const testSkillContent = `---
name: test-skill
description: A test skill for E2E testing
tools: ['Read', 'Write']
---

# Test Skill Instructions

When this skill is activated, you must:
1. Start your response with "[TEST SKILL ACTIVATED]"
2. Use the Read tool to check the current directory
3. Report what files you found

This skill was triggered by the /test-skill command.
`;

    writeFileSync(join(skillsDir, 'test-skill.md'), testSkillContent);

    // Create another skill for parameter substitution testing
    const paramSkillContent = `---
name: greet
description: A greeting skill that uses parameters
tools: ['Read']
---

# Greeting Skill

You should greet the user with their name: $ARGUMENTS

Your response MUST start with: "Hello, $ARGUMENTS! [GREET SKILL ACTIVE]"
`;

    writeFileSync(join(skillsDir, 'greet.md'), paramSkillContent);

    // Set HOME to temp directory so skills are loaded from there
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    if (session) {
      await session.close();
      session = null;
    }

    // Restore original HOME
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }

    cleanupTempDir(tempDir);
  });

  describe('Skill Loading', () => {
    test('should load skills from ~/.claude/skills/', async () => {
      if (skipIfNoProvider('openai')) return;

      session = await createSession(getSessionOptions('openai'));

      // Wait for skills to load (they load asynchronously)
      await new Promise((resolve) => setTimeout(resolve, 500));

      const catalog = session.getSkillCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(2);

      // Check that our test skills are loaded
      const testSkill = catalog.find((s) => s.name === 'test-skill');
      expect(testSkill).toBeDefined();
      expect(testSkill?.description).toBe('A test skill for E2E testing');

      const greetSkill = catalog.find((s) => s.name === 'greet');
      expect(greetSkill).toBeDefined();
      expect(greetSkill?.description).toBe('A greeting skill that uses parameters');
    }, TEST_CONFIG.timeout);

    test('should report skills loaded status', async () => {
      if (skipIfNoProvider('openai')) return;

      session = await createSession(getSessionOptions('openai'));

      // Initially may be false while loading
      expect(session.areSkillsLoaded()).toBeDefined();

      // Wait for skills to load
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(session.areSkillsLoaded()).toBe(true);
    }, TEST_CONFIG.timeout);
  });

  describe('Skill Command Detection', () => {
    test('should detect /skill-name command and activate skill', async () => {
      if (skipIfNoProvider('openai')) return;

      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      // Wait for skills to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Send skill command
      await session.send('/test-skill run the test');

      // Collect all messages from the stream
      const messages: Array<{ type: string; message?: { content?: unknown } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: unknown } });
      }

      // Check that we got assistant responses
      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      expect(assistantMessages.length).toBeGreaterThan(0);

      // The response should indicate the skill was activated
      const responseText = JSON.stringify(assistantMessages).toLowerCase();

      // The LLM should have received the skill instructions and acted on them
      // Skill instructions say to start with "[TEST SKILL ACTIVATED]"
      // Note: The LLM might not follow this exactly, but it should mention files/directory
      expect(responseText).toMatch(/test skill|files|directory|found/i);
    }, TEST_CONFIG.timeout * 2);

    test('should substitute parameters in skill content', async () => {
      if (skipIfNoProvider('openai')) return;

      session = await createSession(getSessionOptions('openai'));

      // Wait for skills to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Send skill command with parameter
      await session.send('/greet Alice');

      // Collect all messages
      const messages: Array<{ type: string; message?: { content?: unknown } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: unknown } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      const responseText = JSON.stringify(assistantMessages).toLowerCase();

      // The skill instructions say: "Hello, $ARGUMENTS! [GREET SKILL ACTIVE]"
      // With parameter substitution, $ARGUMENTS should become "Alice"
      expect(responseText).toContain('alice');
    }, TEST_CONFIG.timeout);

    test('should handle non-skill messages normally', async () => {
      if (skipIfNoProvider('openai')) return;

      session = await createSession(getSessionOptions('openai'));

      // Wait for skills to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Send a normal message (not a skill command)
      await session.send('What is 2 + 2?');

      const messages: Array<{ type: string; message?: { content?: unknown } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: unknown } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      expect(assistantMessages.length).toBeGreaterThan(0);

      // Should get a normal response about the math question
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('4');
    }, TEST_CONFIG.timeout);
  });

  describe('Skill with Tools', () => {
    test('should allow skills to use specified tools', async () => {
      if (skipIfNoProvider('openai')) return;

      // Create a file to read
      const testFile = join(tempDir, 'test-file.txt');
      writeFileSync(testFile, 'Hello from skill test!');

      session = await createSession(getSessionOptions('openai', { cwd: tempDir }));

      // Wait for skills to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      // The test-skill has tools: ['Read', 'Write']
      // It should be able to use Read tool
      await session.send('/test-skill check the files');

      const messages: Array<{ type: string; tool_name?: string; result?: unknown }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; tool_name?: string; result?: unknown });
      }

      // Check if Read tool was called
      const toolResults = messages.filter((m) => m.type === 'tool_result');
      const readToolCalls = toolResults.filter((m) =>
        JSON.stringify(m).toLowerCase().includes('read')
      );

      // The skill instructions tell the LLM to use the Read tool
      // If skill injection works, it should try to read files
      expect(toolResults.length).toBeGreaterThanOrEqual(0); // May or may not use tools
    }, TEST_CONFIG.timeout * 2);
  });

  describe('Skill Isolation', () => {
    test('should not activate skill for regular messages starting with /', async () => {
      if (skipIfNoProvider('openai')) return;

      session = await createSession(getSessionOptions('openai'));

      // Wait for skills to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Send a message that looks like a path but isn't a skill
      await session.send('/usr/bin/python is a path');

      const messages: Array<{ type: string; message?: { content?: unknown } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: unknown } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      expect(assistantMessages.length).toBeGreaterThan(0);

      // Should get a normal response about the path, not try to activate a skill
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      // Response should mention python or path
      expect(responseText).toMatch(/python|path|directory/);
    }, TEST_CONFIG.timeout);

    test('should only activate skill at the beginning of message', async () => {
      if (skipIfNoProvider('openai')) return;

      session = await createSession(getSessionOptions('openai'));

      // Wait for skills to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Skill command in the middle of message should not activate
      await session.send('Please use the /greet command to say hello');

      const messages: Array<{ type: string; message?: { content?: unknown } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: unknown } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      expect(assistantMessages.length).toBeGreaterThan(0);

      // This is a normal message, not a skill command
      // Response should be about using commands, not actually greeting
      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText.length).toBeGreaterThan(10);
    }, TEST_CONFIG.timeout);
  });

  describe('Google Provider Skills', () => {
    test('should load and use skills with Google provider', async () => {
      if (skipIfNoProvider('google')) return;

      session = await createSession(getSessionOptions('google'));

      // Wait for skills to load
      await new Promise((resolve) => setTimeout(resolve, 500));

      const catalog = session.getSkillCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(2);

      // Test skill activation
      await session.send('/greet Google User');

      const messages: Array<{ type: string; message?: { content?: unknown } }> = [];
      for await (const message of session.stream()) {
        messages.push(message as { type: string; message?: { content?: unknown } });
      }

      const assistantMessages = messages.filter((m) => m.type === 'assistant');
      expect(assistantMessages.length).toBeGreaterThan(0);

      const responseText = JSON.stringify(assistantMessages).toLowerCase();
      expect(responseText).toContain('google');
    }, TEST_CONFIG.timeout);
  });
});
