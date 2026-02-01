/**
 * Gemini AbortController Integration Tests
 * Tests AbortController with real Gemini API via prompt() function
 *
 * Run with: GEMINI_API_KEY=your_key bun test tests/integration/gemini-abort.test.ts
 *
 * Note: Google GenAI SDK may not natively support AbortSignal at the HTTP level.
 * The abort is checked between chunks in the streaming response. If the SDK is
 * waiting for the next chunk, the abort will only take effect when that chunk arrives.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { prompt } from '../../src/index';

describe('Gemini AbortController Integration', () => {
  let tempDir: string;
  const apiKey = process.env.GEMINI_API_KEY;
  const hasApiKey = !!apiKey && apiKey.startsWith('AIza');

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gemini-abort-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should complete request without abort', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const controller = new AbortController();

    const result = await prompt('Say "Test passed" and nothing else', {
      model: 'gemini-2.0-flash',
      apiKey: apiKey,
      provider: 'google',
      maxTurns: 1,
      abortController: controller,
    });

    console.log('Result:', result.result);
    console.log('Duration:', result.duration_ms, 'ms');
    console.log('Usage:', result.usage);

    expect(result.result.toLowerCase()).toContain('test passed');
    expect(result.duration_ms).toBeGreaterThan(0);
  }, 30000);

  it('should abort long-running request', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const controller = new AbortController();

    // Start the request
    const promptPromise = prompt(
      'Write a detailed 1000 word essay about the history of artificial intelligence, ' +
      'including major milestones, key figures, and future implications. ' +
      'Be very comprehensive and thorough.',
      {
        model: 'gemini-2.0-flash',
        apiKey: apiKey,
        provider: 'google',
        maxTurns: 1,
        abortController: controller,
      }
    );

    // Abort after 500ms (should interrupt the streaming)
    setTimeout(() => {
      console.log('Triggering abort...');
      controller.abort();
    }, 500);

    const result = await promptPromise;

    console.log('Result after abort:', result.result.substring(0, 100) + '...');
    console.log('Duration:', result.duration_ms, 'ms');

    // The request should have been aborted
    // Note: Depending on timing, we might get partial content or 'Operation aborted'
    expect(result.duration_ms).toBeLessThan(10000); // Should be much faster than full completion
  }, 30000);

  it('should abort multi-turn conversation', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const controller = new AbortController();

    // Ask a question that might trigger tool use (file operations)
    const promptPromise = prompt(
      `Please create a file at ${join(tempDir, 'test.txt')} with content "Hello from Gemini"`,
      {
        model: 'gemini-2.0-flash',
        apiKey: apiKey,
        provider: 'google',
        maxTurns: 5,
        abortController: controller,
        cwd: tempDir,
      }
    );

    // Abort after 2 seconds
    setTimeout(() => {
      console.log('Aborting multi-turn conversation...');
      controller.abort();
    }, 2000);

    const result = await promptPromise;

    console.log('Multi-turn result:', result.result);
    console.log('Duration:', result.duration_ms, 'ms');

    // Should have completed or aborted, not hung indefinitely
    expect(result.duration_ms).toBeLessThan(30000);
  }, 30000);

  it('should handle immediate abort', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    const controller = new AbortController();

    // Abort immediately before the request starts
    controller.abort();

    const result = await prompt('Say "Hello"', {
      model: 'gemini-2.0-flash',
      apiKey: apiKey,
      provider: 'google',
      maxTurns: 1,
      abortController: controller,
    });

    console.log('Immediate abort result:', result.result);

    // Should indicate operation was aborted
    expect(result.result).toBe('Operation aborted');
  }, 30000);

  it('should measure time saved by abort', async () => {
    if (!hasApiKey) {
      console.log('Skipping: GEMINI_API_KEY not set');
      return;
    }

    // First, do a normal request to estimate time
    console.log('Measuring normal request time...');
    const normalResult = await prompt(
      'Write a 500 word essay about machine learning',
      {
        model: 'gemini-2.0-flash',
        apiKey: apiKey,
        provider: 'google',
        maxTurns: 1,
      }
    );
    console.log('Normal request took:', normalResult.duration_ms, 'ms');

    // Now do an aborted request
    const controller = new AbortController();
    const abortedPromise = prompt(
      'Write a 500 word essay about machine learning',
      {
        model: 'gemini-2.0-flash',
        apiKey: apiKey,
        provider: 'google',
        maxTurns: 1,
        abortController: controller,
      }
    );

    // Abort after 300ms
    setTimeout(() => controller.abort(), 300);

    const abortedResult = await abortedPromise;
    console.log('Aborted request took:', abortedResult.duration_ms, 'ms');

    // Aborted request should be significantly faster
    const timeSaved = normalResult.duration_ms - abortedResult.duration_ms;
    console.log('Time saved:', timeSaved, 'ms');

    expect(abortedResult.duration_ms).toBeLessThan(normalResult.duration_ms);
    expect(timeSaved).toBeGreaterThan(0);
  }, 60000);
});
