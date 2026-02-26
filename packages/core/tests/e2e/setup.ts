/**
 * E2E Test Setup and Utilities
 * Shared configuration and helper functions for real API integration tests
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { PromptOptions } from '../../src/index';
import type { CreateSessionOptions } from '../../src/session/factory';

// Test configuration from environment
export const TEST_CONFIG = {
  // OpenAI settings
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    baseURL: process.env.OPENAI_BASE_URL, // Optional: for custom endpoints like Gemini OpenAI-compatible API
    available: !!process.env.OPENAI_API_KEY,
  },
  // Google settings
  google: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    available: !!process.env.GEMINI_API_KEY,
  },
  // Anthropic settings
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN, // For MiniMax compatible endpoints
    baseURL: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    available: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  },
  // Test control
  skipExpensive: process.env.E2E_SKIP_EXPENSIVE === 'true',
  timeout: parseInt(process.env.E2E_TIMEOUT || '30000', 10),
};

/**
 * Check if a provider is available for testing
 * For OpenAI, checks either OPENAI_API_KEY or GEMINI_API_KEY (when using OpenAI-compatible endpoint)
 */
export function isProviderAvailable(provider: 'openai' | 'google' | 'anthropic'): boolean {
  if (provider === 'openai') {
    // OpenAI is available if:
    // 1. OPENAI_API_KEY is set, OR
    // 2. GEMINI_API_KEY is set AND OPENAI_BASE_URL is set to Gemini's OpenAI-compatible endpoint
    return TEST_CONFIG.openai.available ||
      (!!process.env.GEMINI_API_KEY && !!process.env.OPENAI_BASE_URL);
  }
  return TEST_CONFIG[provider].available;
}

/**
 * Check if provider is available, return boolean
 * Use at the beginning of test: if (skipIfNoProvider('openai')) return;
 */
export function skipIfNoProvider(provider: 'openai' | 'google' | 'anthropic'): boolean {
  const available = isProviderAvailable(provider);
  if (!available) {
    console.log(`Skipping test: ${provider} API key not available`);
  }
  return !available;
}

/**
 * Get test options for prompt() with specified provider
 */
export function getPromptOptions(
  provider: 'openai' | 'google' | 'anthropic',
  overrides: Partial<PromptOptions> = {}
): PromptOptions {
  const config = TEST_CONFIG[provider];

  // For OpenAI provider, if using Gemini's OpenAI-compatible endpoint, use GEMINI_API_KEY
  const apiKey = provider === 'openai' && !TEST_CONFIG.openai.available && process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY
    : config.apiKey!;

  return {
    model: config.model,
    apiKey,
    provider,
    // Include baseURL for OpenAI provider (supports custom endpoints like Gemini OpenAI-compatible API)
    ...(provider === 'openai' && 'baseURL' in config ? { baseURL: config.baseURL } : {}),
    ...overrides,
  };
}

/**
 * Get test options for createSession() with specified provider
 */
export function getSessionOptions(
  provider: 'openai' | 'google' | 'anthropic',
  overrides: Partial<CreateSessionOptions> = {}
): CreateSessionOptions {
  const config = TEST_CONFIG[provider];

  // For OpenAI provider, if using Gemini's OpenAI-compatible endpoint, use GEMINI_API_KEY
  const apiKey = provider === 'openai' && !TEST_CONFIG.openai.available && process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY
    : config.apiKey!;

  return {
    model: config.model,
    apiKey,
    provider,
    // Include baseURL for OpenAI provider (supports custom endpoints like Gemini OpenAI-compatible API)
    ...(provider === 'openai' && 'baseURL' in config ? { baseURL: config.baseURL } : {}),
    ...overrides,
  };
}

/**
 * Create a temporary directory for test files
 */
export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'e2e-test-'));
}

/**
 * Clean up a temporary directory
 */
export function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Run test with both providers if available
 * Returns array of results for each provider tested
 */
export async function testWithBothProviders<T>(
  testFn: (provider: 'openai' | 'google') => Promise<T>,
  options: { skipIfUnavailable?: boolean } = {}
): Promise<Array<{ provider: 'openai' | 'google'; result: T }>> {
  const results: Array<{ provider: 'openai' | 'google'; result: T }> = [];
  const providers: Array<'openai' | 'google'> = ['openai', 'google'];

  for (const provider of providers) {
    if (!isProviderAvailable(provider)) {
      if (options.skipIfUnavailable) {
        console.log(`Skipping ${provider} tests - API key not set`);
        continue;
      }
      throw new Error(`${provider} API key not set`);
    }

    const result = await testFn(provider);
    results.push({ provider, result });
  }

  return results;
}

/**
 * Run test with a single provider (first available)
 */
export async function testWithFirstAvailableProvider<T>(
  testFn: (provider: 'openai' | 'google') => Promise<T>
): Promise<T> {
  for (const provider of ['openai', 'google'] as const) {
    if (isProviderAvailable(provider)) {
      return testFn(provider);
    }
  }
  throw new Error('No provider API keys available for testing');
}

/**
 * Wait for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Collect all values from an async iterator
 */
export async function collectAsyncIterator<T>(
  iterator: AsyncIterable<T>
): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iterator) {
    results.push(item);
  }
  return results;
}

/**
 * Test helper to verify a string contains expected content
 */
export function expectContains(haystack: string, needle: string): void {
  if (!haystack.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(
      `Expected string to contain "${needle}" but got: ${haystack.substring(0, 200)}...`
    );
  }
}

/**
 * Test helper to verify a condition
 */
export function expectTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000 } = options;
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < maxRetries - 1) {
        await sleep(delayMs * Math.pow(2, i));
      }
    }
  }

  throw lastError;
}

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  const durationMs = Date.now() - start;
  return { result, durationMs };
}

/**
 * Create a delayed abort controller
 */
export function createDelayedAbortController(delayMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), delayMs);
  return controller;
}

/**
 * Verify that a file exists and has content
 */
export async function verifyFileContent(
  filePath: string,
  expectedContent?: string
): Promise<boolean> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return false;
    }
    if (expectedContent !== undefined) {
      const content = await file.text();
      return content.includes(expectedContent);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Test categories for selective running
 */
export const TEST_CATEGORIES = {
  FAST: 'fast',       // < 5s
  STANDARD: 'standard', // < 30s
  EXPENSIVE: 'expensive', // < 120s
} as const;

/**
 * Check if a test category should be run
 */
export function shouldRunCategory(category: string): boolean {
  if (category === TEST_CATEGORIES.EXPENSIVE && TEST_CONFIG.skipExpensive) {
    return false;
  }
  return true;
}
