import { describe, it, expect, beforeEach, jest } from 'bun:test';
import { WebSearchTool } from '../../src/tools/web-search.js';
import type { ToolContext } from '../../src/types/tools.js';

// Mock duck-duck-scrape
jest.mock('duck-duck-scrape', () => ({
  search: jest.fn(),
}));

import { search } from 'duck-duck-scrape';

describe('WebSearchTool', () => {
  let tool: WebSearchTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new WebSearchTool();
    context = {
      cwd: '/tmp',
      env: {},
    };
    // Reset mock
    (search as jest.Mock).mockReset();
  });

  describe('schema', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('WebSearch');
    });

    it('should have required parameters', () => {
      expect(tool.parameters.required).toContain('query');
    });

    it('should have optional domain filters', () => {
      expect(tool.parameters.properties.allowed_domains).toBeDefined();
      expect(tool.parameters.properties.blocked_domains).toBeDefined();
    });
  });

  describe('handler', () => {
    it('should return search results', async () => {
      const mockResults = [
        {
          title: 'TypeScript Documentation',
          url: 'https://www.typescriptlang.org/docs/',
          snippet: 'TypeScript is a typed superset of JavaScript.',
        },
        {
          title: 'TypeScript Tutorial',
          url: 'https://www.example.com/ts-tutorial',
          snippet: 'Learn TypeScript step by step.',
        },
      ];

      (search as jest.Mock).mockResolvedValue({
        results: mockResults,
        totalResults: 2,
      });

      const result = await tool.handler(
        { query: 'TypeScript documentation 2026' },
        context
      );

      expect(result.results).toHaveLength(2);
      expect(result.total_results).toBe(2);
      expect(result.query).toBe('TypeScript documentation 2026');
      expect(result.results[0].title).toBe('TypeScript Documentation');
      expect(result.results[0].url).toBe('https://www.typescriptlang.org/docs/');
    });

    it('should filter by allowed_domains', async () => {
      const mockResults = [
        {
          title: 'TypeScript Documentation',
          url: 'https://www.typescriptlang.org/docs/',
          snippet: 'Official docs.',
        },
        {
          title: 'Unofficial Guide',
          url: 'https://www.example.com/guide',
          snippet: 'Third party guide.',
        },
      ];

      (search as jest.Mock).mockResolvedValue({
        results: mockResults,
        totalResults: 2,
      });

      const result = await tool.handler(
        {
          query: 'TypeScript',
          allowed_domains: ['typescriptlang.org'],
        },
        context
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].url).toContain('typescriptlang.org');
    });

    it('should filter by blocked_domains', async () => {
      const mockResults = [
        {
          title: 'Good Result',
          url: 'https://www.typescriptlang.org/docs/',
          snippet: 'Official docs.',
        },
        {
          title: 'Bad Result',
          url: 'https://www.spam-site.com/',
          snippet: 'Spam content.',
        },
      ];

      (search as jest.Mock).mockResolvedValue({
        results: mockResults,
        totalResults: 2,
      });

      const result = await tool.handler(
        {
          query: 'TypeScript',
          blocked_domains: ['spam-site.com'],
        },
        context
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].url).not.toContain('spam-site.com');
    });

    it('should handle empty results', async () => {
      (search as jest.Mock).mockResolvedValue({
        results: [],
        totalResults: 0,
      });

      const result = await tool.handler(
        { query: 'xyznonexistent12345' },
        context
      );

      expect(result.results).toHaveLength(0);
      expect(result.total_results).toBe(0);
    });

    it('should handle search errors', async () => {
      (search as jest.Mock).mockRejectedValue(new Error('Rate limit exceeded'));

      const result = await tool.handler(
        { query: 'TypeScript' },
        context
      );

      expect(result.error).toBeDefined();
      expect(result.results).toHaveLength(0);
      expect(result.total_results).toBe(0);
    });

    it('should require query parameter', async () => {
      const result = await tool.handler(
        { query: '' },
        context
      );

      expect(result.error).toContain('Query');
    });

    it('should require query with at least 2 characters', async () => {
      const result = await tool.handler(
        { query: 'a' },
        context
      );

      expect(result.error).toContain('at least 2 characters');
    });
  });
});
