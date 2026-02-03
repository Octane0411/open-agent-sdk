/**
 * Google Gemini Provider implementation using @google/genai
 */

import { GoogleGenAI, type Content, type Part, type Schema } from '@google/genai';
import { LLMProvider, type LLMChunk, type ChatOptions } from './base';
import type { SDKMessage } from '../types/messages';
import type { ToolDefinition } from '../types/tools';

export interface GoogleConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export class GoogleProvider extends LLMProvider {
  private client: GoogleGenAI;

  constructor(config: GoogleConfig) {
    super({
      apiKey: config.apiKey,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async *chat(
    messages: SDKMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal,
    options?: ChatOptions
  ): AsyncIterable<LLMChunk> {
    try {
      console.log('[GoogleProvider] Received messages:', messages.length);

      // System instruction comes from options, not from SDKSystemMessage
      const systemInstruction = options?.systemInstruction;
      const history: Content[] = [];

      for (const msg of messages) {
        // Skip SDKSystemMessage - it's metadata only, no content
        if (msg.type === 'system') {
          continue;
        }
        const content = this.convertMessage(msg);
        console.log(`[GoogleProvider] Converted ${msg.type}:`, content);
        if (content) {
          history.push(content);
        }
      }

      console.log('[GoogleProvider] Converted history:', JSON.stringify(history, null, 2));

    // Convert tools to Google format
    const googleTools = tools?.map((tool) => ({
      functionDeclarations: [
        {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters as unknown as Schema,
        },
      ],
    }));

    const config: {
      maxOutputTokens?: number;
      temperature?: number;
      systemInstruction?: string;
      tools?: Array<{ functionDeclarations: Array<{
        name: string;
        description: string;
        parameters?: Schema;
      }> }>;
    } = {
      maxOutputTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }

    if (googleTools && googleTools.length > 0) {
      config.tools = googleTools;
    }

    // Check signal before making request
    if (signal?.aborted) {
      yield { type: 'done' };
      return;
    }

    // Use generateContentStream with full history
    const response = await this.client.models.generateContentStream({
      model: this.config.model,
      contents: history,
      config,
    });

    for await (const chunk of response) {
      // Check for abort signal after receiving each chunk
      if (signal?.aborted) {
        yield { type: 'done' };
        return;
      }
      // Handle text content
      if (chunk.text) {
        yield {
          type: 'content',
          delta: chunk.text,
        };
      }

      // Handle function calls (tool calls)
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        for (const funcCall of chunk.functionCalls) {
          yield {
            type: 'tool_call',
            tool_call: {
              id: funcCall.id || `call_${Date.now()}`,
              name: funcCall.name || '',
              arguments: JSON.stringify(funcCall.args || {}),
            },
          };
        }
      }

      // Handle usage metadata
      if (chunk.usageMetadata) {
        yield {
          type: 'usage',
          usage: {
            input_tokens: chunk.usageMetadata.promptTokenCount || 0,
            output_tokens: chunk.usageMetadata.candidatesTokenCount || 0,
          },
        };
      }
    }

    yield { type: 'done' };
    } catch (error) {
      console.error('[GoogleProvider] Error:', error);
      yield {
        type: 'content',
        delta: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
      yield { type: 'done' };
    }
  }

  private convertMessage(msg: SDKMessage): Content | null {
    switch (msg.type) {
      case 'user':
        return {
          role: 'user',
          parts: [{ text: msg.message.content }],
        };

      case 'assistant': {
        const parts: Part[] = [];
        const textContent = msg.message.content.find((c) => c.type === 'text');

        if (textContent) {
          parts.push({ text: textContent.text });
        }

        const toolCalls = msg.message.tool_calls;
        if (toolCalls) {
          for (const tc of toolCalls) {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments),
              },
            });
          }
        }

        return { role: 'model', parts };
      }

      case 'tool_result': {
        const resultText =
          typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result);
        return {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.tool_name,
                response: { result: resultText },
              },
            },
          ],
        };
      }

      default:
        return null;
    }
  }
}

// Register with provider registry
import { providerRegistry } from './base';
providerRegistry.register('google', (config) => new GoogleProvider(config as GoogleConfig));
