import type { Tool, ToolContext, JSONSchema } from '../types/tools.js';

export interface WebSearchInput {
  query: string;
  numResults?: number;
  type?: 'auto' | 'fast' | 'deep';
  livecrawl?: 'fallback' | 'preferred';
}

export interface WebSearchOutput {
  content: string;
  query: string;
  error?: string;
}

const API_CONFIG = {
  BASE_URL: 'https://mcp.exa.ai',
  ENDPOINTS: {
    SEARCH: '/mcp',
  },
  DEFAULT_NUM_RESULTS: 8,
  TIMEOUT_MS: 25000,
} as const;

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'The search query',
    },
    numResults: {
      type: 'number',
      description: 'Number of search results to return (default: 8)',
    },
    type: {
      type: 'string',
      enum: ['auto', 'fast', 'deep'],
      description: "Search type - 'auto': balanced (default), 'fast': quick, 'deep': comprehensive",
    },
    livecrawl: {
      type: 'string',
      enum: ['fallback', 'preferred'],
      description: "Live crawl mode - 'fallback': use as backup, 'preferred': prioritize (default: 'fallback')",
    },
  },
  required: ['query'],
};

export class WebSearchTool implements Tool<WebSearchInput, WebSearchOutput> {
  name = 'WebSearch';
  description = 'Search the web for information. Returns formatted search results optimized for LLM consumption.';
  parameters = parameters;

  handler = async (
    input: WebSearchInput,
    context: ToolContext
  ): Promise<WebSearchOutput> => {
    // Validate query
    if (!input.query || input.query.trim().length === 0) {
      return {
        content: '',
        query: input.query || '',
        error: 'Query is required',
      };
    }

    const searchRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: {
          query: input.query,
          type: input.type || 'auto',
          numResults: input.numResults || API_CONFIG.DEFAULT_NUM_RESULTS,
          livecrawl: input.livecrawl || 'fallback',
        },
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

    try {
      const abortSignals: AbortSignal[] = [controller.signal];
      if (context.abortController?.signal) {
        abortSignals.push(context.abortController.signal);
      }

      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH}`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify(searchRequest),
        signal: AbortSignal.any(abortSignals),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: '',
          query: input.query,
          error: `Search error (${response.status}): ${errorText}`,
        };
      }

      const responseText = await response.text();

      // Parse SSE response
      const lines = responseText.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.result?.content?.length > 0) {
              return {
                content: data.result.content[0].text,
                query: input.query,
              };
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }

      return {
        content: 'No search results found. Please try a different query.',
        query: input.query,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          content: '',
          query: input.query,
          error: 'Search request timed out after 25 seconds',
        };
      }

      return {
        content: '',
        query: input.query,
        error: error instanceof Error ? error.message : 'Search failed',
      };
    }
  };
}

export const webSearchTool = new WebSearchTool();
