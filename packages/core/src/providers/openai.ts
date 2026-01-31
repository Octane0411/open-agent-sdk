/**
 * OpenAI Provider implementation
 */

import OpenAI from 'openai';
import { LLMProvider, type LLMChunk } from './base';
import type { SDKMessage, SDKAssistantMessage, SDKToolResultMessage } from '../types/messages';
import type { ToolDefinition } from '../types/tools';

export interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;

  constructor(config: OpenAIConfig) {
    super({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async *chat(
    messages: SDKMessage[],
    tools?: ToolDefinition[]
  ): AsyncIterable<LLMChunk> {
    // Convert SDK messages to OpenAI format
    const openaiMessages = this.convertMessages(messages);

    // Convert tools to OpenAI format
    const openaiTools = tools?.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));

    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages: openaiMessages,
      tools: openaiTools,
      tool_choice: openaiTools && openaiTools.length > 0 ? 'auto' : undefined,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
    });

    let currentToolCall: {
      id: string;
      name: string;
      arguments: string;
    } | null = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Handle content
      if (delta?.content) {
        yield {
          type: 'content',
          delta: delta.content,
        };
      }

      // Handle tool calls
      if (delta?.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.id) {
            // New tool call starting
            if (currentToolCall) {
              // Yield previous tool call
              yield {
                type: 'tool_call',
                tool_call: { ...currentToolCall },
              };
            }
            currentToolCall = {
              id: toolCall.id,
              name: toolCall.function?.name || '',
              arguments: toolCall.function?.arguments || '',
            };
          } else if (currentToolCall && toolCall.function?.arguments) {
            // Accumulate arguments
            currentToolCall.arguments += toolCall.function.arguments;
          }
        }
      }

      // Handle usage (in final chunk)
      if (chunk.usage) {
        yield {
          type: 'usage',
          usage: {
            input_tokens: chunk.usage.prompt_tokens,
            output_tokens: chunk.usage.completion_tokens,
          },
        };
      }
    }

    // Yield any pending tool call
    if (currentToolCall) {
      yield {
        type: 'tool_call',
        tool_call: { ...currentToolCall },
      };
    }

    yield { type: 'done' };
  }

  private convertMessages(
    messages: SDKMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
      switch (msg.type) {
        case 'user':
          return { role: 'user', content: msg.content };

        case 'system':
          return { role: 'system', content: msg.content };

        case 'assistant':
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            return {
              role: 'assistant',
              content: msg.content || null,
              tool_calls: msg.tool_calls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              })),
            };
          }
          return { role: 'assistant', content: msg.content || '' };

        case 'tool_result':
          return {
            role: 'tool',
            tool_call_id: msg.tool_call_id,
            content: msg.content,
          };

        default:
          // Skip result messages - they're not part of the conversation
          return { role: 'user', content: '' };
      }
    });
  }
}

// Register with provider registry
import { providerRegistry } from './base';
providerRegistry.register('openai', (config) => new OpenAIProvider(config as OpenAIConfig));
