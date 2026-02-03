import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import type { Tool, ToolContext, JSONSchema } from '../types/tools.js';
import { createUserMessage, type UUID } from '../types/messages.js';

export interface WebFetchInput {
  url: string;
  prompt: string;
}

export interface WebFetchOutput {
  response?: string;
  url: string;
  final_url?: string;
  status_code?: number;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    url: {
      type: 'string',
      description: 'The URL to fetch (HTTP will be auto-upgraded to HTTPS)',
    },
    prompt: {
      type: 'string',
      description: 'The prompt to process the fetched content with',
    },
  },
  required: ['url', 'prompt'],
};

// Simple UUID generator for messages
function generateUUID(): UUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class WebFetchTool implements Tool<WebFetchInput, WebFetchOutput> {
  name = 'WebFetch';
  description = 'Fetch a webpage and analyze its content using an LLM. Returns the LLM analysis result.';
  parameters = parameters;

  handler = async (
    input: WebFetchInput,
    context: ToolContext
  ): Promise<WebFetchOutput> => {
    // Validate URL
    let url: URL;
    try {
      url = new URL(input.url);
      // Auto-upgrade HTTP to HTTPS
      if (url.protocol === 'http:') {
        url.protocol = 'https:';
      }
    } catch {
      return {
        url: input.url,
        error: 'Invalid URL provided',
      };
    }

    // Check for provider
    if (!context.provider) {
      return {
        url: input.url,
        error: 'No provider available for LLM analysis. WebFetch requires a provider to be configured.',
      };
    }

    try {
      // Fetch the webpage
      const fetchOptions: RequestInit = {
        signal: context.abortController?.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OpenAgentSDK/1.0)',
        },
      };

      const response = await fetch(url.toString(), fetchOptions);
      const finalUrl = response.url;
      const statusCode = response.status;

      if (!response.ok) {
        return {
          url: input.url,
          final_url: finalUrl,
          status_code: statusCode,
          error: `HTTP error ${statusCode}: ${response.statusText}`,
        };
      }

      const html = await response.text();

      // Extract readable content
      const markdown = this.extractContent(html, finalUrl);

      // Analyze with LLM using the chat method
      const analysisPrompt = `${input.prompt}\n\nContent from ${finalUrl}:\n\n${markdown}`;

      const message = createUserMessage(analysisPrompt, 'webfetch-session', generateUUID(), null);
      const chunks: string[] = [];

      for await (const chunk of context.provider.chat([message], undefined, context.abortController?.signal)) {
        if (chunk.type === 'content' && chunk.delta) {
          chunks.push(chunk.delta);
        }
      }

      const response_text = chunks.join('');

      return {
        response: response_text,
        url: input.url,
        final_url: finalUrl,
        status_code: statusCode,
      };
    } catch (error) {
      return {
        url: input.url,
        error: error instanceof Error ? error.message : 'Failed to fetch or analyze webpage',
      };
    }
  };

  private extractContent(html: string, url: string): string {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article && article.content) {
        // Convert to markdown
        const turndownService = new TurndownService({
          headingStyle: 'atx',
          codeBlockStyle: 'fenced',
        });
        return turndownService.turndown(article.content);
      }
    } catch {
      // Fall through to raw HTML conversion
    }

    // Fallback: convert entire body to markdown
    try {
      const dom = new JSDOM(html);
      const turndownService = new TurndownService();
      const body = dom.window.document.body;
      return body ? turndownService.turndown(body.innerHTML) : '';
    } catch {
      // Final fallback: return plain text
      return html.replace(/<[^>]*>/g, '');
    }
  }
}

export const webFetchTool = new WebFetchTool();
