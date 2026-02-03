import { describe, it, expect, beforeEach, jest } from 'bun:test';
import { WebFetchTool } from '../../src/tools/web-fetch.js';
import type { ToolContext } from '../../src/types/tools.js';
import type { LLMProvider } from '../../src/providers/base.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper to create async iterable
async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe('WebFetchTool', () => {
  let tool: WebFetchTool;
  let context: ToolContext;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    tool = new WebFetchTool();
    mockProvider = {
      chat: jest.fn(),
      getModel: jest.fn().mockReturnValue('claude-sonnet'),
    } as unknown as LLMProvider;
    context = {
      cwd: '/tmp',
      env: {},
      provider: mockProvider,
      model: 'claude-sonnet',
    };
    mockFetch.mockReset();
    (mockProvider.chat as jest.Mock).mockReset();
  });

  describe('schema', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('WebFetch');
    });

    it('should have required url parameter', () => {
      expect(tool.parameters.required).toContain('url');
    });

    it('should have required prompt parameter', () => {
      expect(tool.parameters.required).toContain('prompt');
    });
  });

  describe('handler', () => {
    it('should fetch and analyze webpage content', async () => {
      const htmlContent = `
        <html>
          <head><title>Test Page</title></head>
          <body>
            <article>
              <h1>Main Content</h1>
              <p>This is the main content of the page.</p>
            </article>
          </body>
        </html>
      `;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com/article',
        text: async () => htmlContent,
      });

      (mockProvider.chat as jest.Mock).mockReturnValue(
        createAsyncIterable([
          { type: 'content' as const, delta: 'The page discusses main content and provides information.' },
          { type: 'done' as const },
        ])
      );

      const result = await tool.handler(
        {
          url: 'https://example.com/article',
          prompt: 'Extract the main content',
        },
        context
      );

      expect(result.url).toBe('https://example.com/article');
      expect(result.final_url).toBe('https://example.com/article');
      expect(result.status_code).toBe(200);
      expect(result.response).toBe('The page discusses main content and provides information.');
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/article', expect.any(Object));
    });

    it('should handle HTTP to HTTPS upgrade', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com/page',
        text: async () => '<html><body>Content</body></html>',
      });

      (mockProvider.chat as jest.Mock).mockReturnValue(
        createAsyncIterable([
          { type: 'content' as const, delta: 'Analysis result' },
          { type: 'done' as const },
        ])
      );

      const result = await tool.handler(
        {
          url: 'http://example.com/page',
          prompt: 'Extract content',
        },
        context
      );

      expect(result.url).toBe('http://example.com/page');
      expect(result.final_url).toBe('https://example.com/page');
    });

    it('should handle redirects', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com/final-destination',
        text: async () => '<html><body>Final content</body></html>',
      });

      (mockProvider.chat as jest.Mock).mockReturnValue(
        createAsyncIterable([
          { type: 'content' as const, delta: 'Analysis of final content' },
          { type: 'done' as const },
        ])
      );

      const result = await tool.handler(
        {
          url: 'https://example.com/redirect',
          prompt: 'Extract content',
        },
        context
      );

      expect(result.url).toBe('https://example.com/redirect');
      expect(result.final_url).toBe('https://example.com/final-destination');
    });

    it('should return error for 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'https://example.com/not-found',
        text: async () => 'Not found',
      });

      const result = await tool.handler(
        {
          url: 'https://example.com/not-found',
          prompt: 'Extract content',
        },
        context
      );

      expect(result.error).toContain('404');
      expect(result.status_code).toBe(404);
      expect(result.response).toBeUndefined();
    });

    it('should return error for network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await tool.handler(
        {
          url: 'https://example.com/page',
          prompt: 'Extract content',
        },
        context
      );

      expect(result.error).toContain('Network error');
    });

    it('should return error for timeout', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'));

      const result = await tool.handler(
        {
          url: 'https://example.com/slow-page',
          prompt: 'Extract content',
        },
        context
      );

      expect(result.error).toContain('Timeout');
    });

    it('should handle missing provider gracefully', async () => {
      const contextWithoutProvider = {
        cwd: '/tmp',
        env: {},
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://example.com/page',
        text: async () => '<html><body>Content</body></html>',
      });

      const result = await tool.handler(
        {
          url: 'https://example.com/page',
          prompt: 'Extract content',
        },
        contextWithoutProvider
      );

      expect(result.error).toContain('provider');
    });

    it('should handle invalid URL', async () => {
      const result = await tool.handler(
        {
          url: 'not-a-valid-url',
          prompt: 'Extract content',
        },
        context
      );

      expect(result.error).toContain('URL');
    });

    it('should respect abort signal', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const contextWithAbort = {
        ...context,
        abortController,
      };

      mockFetch.mockRejectedValue(new Error('Aborted'));

      const result = await tool.handler(
        {
          url: 'https://example.com/page',
          prompt: 'Extract content',
        },
        contextWithAbort
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: abortController.signal,
        })
      );
    });
  });
});
