import { search } from 'duck-duck-scrape';
import type { Tool, ToolContext, JSONSchema } from '../types/tools.js';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  metadata?: Record<string, unknown>;
}

export interface WebSearchInput {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export interface WebSearchOutput {
  results: WebSearchResult[];
  total_results: number;
  query: string;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'The search query (at least 2 characters)',
    },
    allowed_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only include results from these domains',
    },
    blocked_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exclude results from these domains',
    },
  },
  required: ['query'],
};

export class WebSearchTool implements Tool<WebSearchInput, WebSearchOutput> {
  name = 'WebSearch';
  description = 'Search the web for information. Returns search results with titles, URLs, and snippets.';
  parameters = parameters;

  handler = async (
    input: WebSearchInput,
    _context: ToolContext
  ): Promise<WebSearchOutput> => {
    // Validate query
    if (!input.query || input.query.trim().length < 2) {
      return {
        results: [],
        total_results: 0,
        query: input.query || '',
        error: 'Query must be at least 2 characters long',
      };
    }

    try {
      const searchResults = await search(input.query, {
        safeSearch: 0,
      });

      let results: WebSearchResult[] = searchResults.results.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.description,
        metadata: {
          icon: result.icon,
        },
      }));

      // Apply domain filters
      if (input.allowed_domains && input.allowed_domains.length > 0) {
        results = results.filter((result) =>
          input.allowed_domains!.some((domain) => result.url.includes(domain))
        );
      }

      if (input.blocked_domains && input.blocked_domains.length > 0) {
        results = results.filter(
          (result) =>
            !input.blocked_domains!.some((domain) => result.url.includes(domain))
        );
      }

      return {
        results,
        total_results: results.length,
        query: input.query,
      };
    } catch (error) {
      return {
        results: [],
        total_results: 0,
        query: input.query,
        error: error instanceof Error ? error.message : 'Search failed',
      };
    }
  };
}

export const webSearchTool = new WebSearchTool();
