import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test';
import { WebSearchTool } from '../../src/tools/web-search.js';
import type { ToolContext } from '../../src/types/tools.js';

// Store original fetch
const originalFetch = global.fetch;

describe('WebSearchTool', () => {
  let tool: WebSearchTool;
  let context: ToolContext;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    tool = new WebSearchTool();
    context = {
      cwd: '/tmp',
      env: {},
    };
    // Mock fetch
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('schema', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('WebSearch');
    });

    it('should have required query parameter', () => {
      expect(tool.parameters.required).toContain('query');
    });

    it('should have optional numResults parameter', () => {
      expect(tool.parameters.properties.numResults).toBeDefined();
      expect(tool.parameters.properties.numResults.type).toBe('number');
    });

    it('should have optional type parameter', () => {
      expect(tool.parameters.properties.type).toBeDefined();
      expect(tool.parameters.properties.type.enum).toContain('auto');
      expect(tool.parameters.properties.type.enum).toContain('fast');
      expect(tool.parameters.properties.type.enum).toContain('deep');
    });

    it('should have optional livecrawl parameter', () => {
      expect(tool.parameters.properties.livecrawl).toBeDefined();
      expect(tool.parameters.properties.livecrawl.enum).toContain('fallback');
      expect(tool.parameters.properties.livecrawl.enum).toContain('preferred');
    });
  });

  describe('handler', () => {
    it('should return search results from Exa API', async () => {
      const mockResponse = `data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Search results for TypeScript:\\n\\n1. TypeScript Documentation - https://www.typescriptlang.org/docs/\\n   TypeScript is a typed superset of JavaScript."}]}}`;

      fetchMock.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockResponse),
      });

      const result = await tool.handler(
        { query: 'TypeScript documentation' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.query).toBe('TypeScript documentation');
      expect(result.content).toContain('TypeScript Documentation');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://mcp.exa.ai/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
          }),
          body: expect.stringContaining('web_search_exa'),
        })
      );
    });

    it('should use default parameters', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Results"}]}}'),
      });

      await tool.handler({ query: 'test' }, context);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.params.arguments.type).toBe('auto');
      expect(callBody.params.arguments.numResults).toBe(8);
      expect(callBody.params.arguments.livecrawl).toBe('fallback');
    });

    it('should accept custom parameters', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Results"}]}}'),
      });

      await tool.handler(
        {
          query: 'test',
          type: 'deep',
          numResults: 5,
          livecrawl: 'preferred',
        },
        context
      );

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.params.arguments.type).toBe('deep');
      expect(callBody.params.arguments.numResults).toBe(5);
      expect(callBody.params.arguments.livecrawl).toBe('preferred');
    });

    it('should handle empty results', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[]}}'),
      });

      const result = await tool.handler(
        { query: 'xyznonexistent12345' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.content).toBe('No search results found. Please try a different query.');
    });

    it('should handle HTTP errors', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const result = await tool.handler(
        { query: 'test' },
        context
      );

      expect(result.error).toContain('Search error (500)');
      expect(result.content).toBe('');
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      const result = await tool.handler(
        { query: 'test' },
        context
      );

      expect(result.error).toBe('Network error');
      expect(result.content).toBe('');
    });

    it('should handle timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValue(abortError);

      const result = await tool.handler(
        { query: 'test' },
        context
      );

      expect(result.error).toContain('timed out');
      expect(result.content).toBe('');
    });

    it('should require query parameter', async () => {
      const result = await tool.handler(
        { query: '' },
        context
      );

      expect(result.error).toContain('Query is required');
    });

    it('should pass abort signal to fetch', async () => {
      const abortController = new AbortController();
      context.abortController = abortController;

      fetchMock.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('data: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"Results"}]}}'),
      });

      await tool.handler({ query: 'test' }, context);

      // Verify that fetch was called with a signal
      const fetchCall = fetchMock.mock.calls[0];
      expect(fetchCall[1].signal).toBeDefined();
    });
  });
});
