import { describe, it, expect, jest, beforeEach, afterEach } from 'bun:test';
import { WebSearchTool } from '../../src/tools/web-search.js';
import { WebFetchTool } from '../../src/tools/web-fetch.js';
import type { ToolContext } from '../../src/types/tools.js';
import type { LLMProvider } from '../../src/providers/base.js';

// Store original fetch
const originalFetch = global.fetch;

// Mock fetch for mocked tests
const mockFetch = jest.fn();

// Helper to create async iterable
async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

// Real search tests (separate from mocked tests)
describe('WebSearch Real API Integration', () => {
  it('should perform real web search via Exa API', async () => {
    const tool = new WebSearchTool();
    const ctx: ToolContext = {
      cwd: '/tmp',
      env: {},
    };

    const result = await tool.handler(
      { query: 'TypeScript programming language' },
      ctx
    );

    // Should not have errors
    expect(result.error).toBeUndefined();

    // Should return content
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);

    // Should contain query
    expect(result.query).toBe('TypeScript programming language');

    // Content should contain relevant information
    expect(result.content.length).toBeGreaterThan(50);

    console.log('Real search result preview:', result.content.substring(0, 200) + '...');
    console.log('Full content length:', result.content.length);
  }, 30000);

  it('should handle search with numResults parameter', async () => {
    const tool = new WebSearchTool();
    const ctx: ToolContext = {
      cwd: '/tmp',
      env: {},
    };

    const result = await tool.handler(
      {
        query: 'Rust programming language',
        numResults: 3,
      },
      ctx
    );

    expect(result.error).toBeUndefined();
    expect(result.content).toBeTruthy();

    console.log('Search with numResults=3:', result.content.substring(0, 200) + '...');
  }, 30000);
});

// Mocked tests
describe('WebTools Mocked Integration', () => {
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
    // Set up mock fetch for mocked tests
    global.fetch = mockFetch;
    mockFetch.mockReset();
    (mockProvider.chat as jest.Mock).mockReset();
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('WebSearch + WebFetch workflow', () => {
    it('should search and then fetch a result', async () => {
      // Step 1: Mock search response
      const mockSearchResponse = `data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Search results:\\n\\n1. TypeScript Documentation - https://www.typescriptlang.org/docs/\\n   Official TypeScript documentation."}]}}`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockSearchResponse),
      });

      const searchResult = await searchTool.handler(
        { query: 'TypeScript docs' },
        context
      );

      expect(searchResult.error).toBeUndefined();
      expect(searchResult.content).toContain('TypeScript Documentation');

      // Step 2: Fetch the URL from search result
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

      mockFetch.mockResolvedValueOnce({
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
          url: 'https://www.typescriptlang.org/docs/',
          prompt: 'Summarize what TypeScript is',
        },
        context
      );

      expect(fetchResult.response).toContain('TypeScript');
      expect(fetchResult.status_code).toBe(200);
    });
  });

  describe('Error handling', () => {
    it('should handle search API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const result = await searchTool.handler(
        { query: 'test query' },
        context
      );

      expect(result.error).toContain('Search error (500)');
      expect(result.content).toBe('');
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

    it('should handle fetch 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'https://example.com/page',
        text: async () => 'Not found',
      });

      const fetchResult = await fetchTool.handler(
        {
          url: 'https://example.com/page',
          prompt: 'Extract content',
        },
        context
      );

      expect(fetchResult.error).toContain('404');
      expect(fetchResult.status_code).toBe(404);
    });
  });
});
