import { describe, it, expect, jest, beforeEach } from 'bun:test';
import { WebSearchTool } from '../../src/tools/web-search.js';
import { WebFetchTool } from '../../src/tools/web-fetch.js';
import type { ToolContext } from '../../src/types/tools.js';
import type { LLMProvider } from '../../src/providers/base.js';

// Mock duck-duck-scrape
jest.mock('duck-duck-scrape', () => ({
  search: jest.fn(),
}));

import { search } from 'duck-duck-scrape';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper to create async iterable
async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe('WebTools Integration', () => {
  let searchTool: WebSearchTool;
  let fetchTool: WebFetchTool;
  let context: ToolContext;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    searchTool = new WebSearchTool();
    fetchTool = new WebFetchTool();
    mockProvider = {
      chat: jest.fn(),
      getModel: jest.fn().mockReturnValue('claude-sonnet'),
    } as unknown as LLMProvider;
    context = {
      cwd: '/tmp',
      env: {},
      provider: mockProvider,
    };
    (search as jest.Mock).mockReset();
    mockFetch.mockReset();
    (mockProvider.chat as jest.Mock).mockReset();
  });

  describe('WebSearch + WebFetch workflow', () => {
    it('should search and then fetch a result', async () => {
      // Step 1: Search
      const mockResults = [
        {
          title: 'TypeScript Documentation',
          url: 'https://www.typescriptlang.org/docs/',
          snippet: 'Official TypeScript documentation.',
        },
      ];

      (search as jest.Mock).mockResolvedValue({
        results: mockResults,
        totalResults: 1,
      });

      const searchResult = await searchTool.handler(
        { query: 'TypeScript docs' },
        context
      );

      expect(searchResult.results).toHaveLength(1);
      expect(searchResult.results[0].url).toBe('https://www.typescriptlang.org/docs/');

      // Step 2: Fetch the first result
      const htmlContent = `
        <html>
          <head><title>TypeScript Docs</title></head>
          <body>
            <article>
              <h1>TypeScript Documentation</h1>
              <p>TypeScript is a typed superset of JavaScript.</p>
            </article>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.typescriptlang.org/docs/',
        text: async () => htmlContent,
      });

      (mockProvider.chat as jest.Mock).mockReturnValue(
        createAsyncIterable([
          { type: 'content' as const, delta: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.' },
          { type: 'done' as const },
        ])
      );

      const fetchResult = await fetchTool.handler(
        {
          url: searchResult.results[0].url,
          prompt: 'Summarize what TypeScript is',
        },
        context
      );

      expect(fetchResult.response).toContain('TypeScript');
      expect(fetchResult.status_code).toBe(200);
    });
  });

  describe('Error handling', () => {
    it('should handle search failure gracefully', async () => {
      (search as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await searchTool.handler(
        { query: 'test query' },
        context
      );

      expect(result.error).toBeDefined();
      expect(result.results).toHaveLength(0);
    });

    it('should handle fetch without provider', async () => {
      const contextWithoutProvider = {
        cwd: '/tmp',
        env: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com',
        text: async () => '<html><body>Content</body></html>',
      });

      const result = await fetchTool.handler(
        {
          url: 'https://example.com',
          prompt: 'Analyze this',
        },
        contextWithoutProvider
      );

      expect(result.error).toContain('provider');
    });

    it('should handle fetch 404 after successful search', async () => {
      // First search succeeds
      (search as jest.Mock).mockResolvedValue({
        results: [{ title: 'Test', url: 'https://example.com/page', snippet: 'Test' }],
        totalResults: 1,
      });

      const searchResult = await searchTool.handler(
        { query: 'test' },
        context
      );

      // Then fetch fails
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'https://example.com/page',
        text: async () => 'Not found',
      });

      const fetchResult = await fetchTool.handler(
        {
          url: searchResult.results[0].url,
          prompt: 'Extract content',
        },
        context
      );

      expect(fetchResult.error).toContain('404');
      expect(fetchResult.status_code).toBe(404);
    });
  });

  describe('Domain filtering', () => {
    it('should respect allowed_domains in search', async () => {
      const mockResults = [
        { title: 'Good', url: 'https://docs.example.com/guide', snippet: 'Good' },
        { title: 'Bad', url: 'https://spam.com/ad', snippet: 'Bad' },
      ];

      (search as jest.Mock).mockResolvedValue({
        results: mockResults,
        totalResults: 2,
      });

      const result = await searchTool.handler(
        {
          query: 'guide',
          allowed_domains: ['docs.example.com'],
        },
        context
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].url).toContain('docs.example.com');
    });

    it('should respect blocked_domains in search', async () => {
      const mockResults = [
        { title: 'Good', url: 'https://docs.example.com/guide', snippet: 'Good' },
        { title: 'Bad', url: 'https://spam.com/ad', snippet: 'Bad' },
      ];

      (search as jest.Mock).mockResolvedValue({
        results: mockResults,
        totalResults: 2,
      });

      const result = await searchTool.handler(
        {
          query: 'guide',
          blocked_domains: ['spam.com'],
        },
        context
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].url).not.toContain('spam.com');
    });
  });
});
