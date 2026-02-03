/**
 * OpenAI Provider implementation
 */

import OpenAI from 'openai';
import { LLMProvider, type LLMChunk, type ChatOptions } from './base';
import type { SDKMessage } from '../types/messages';
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
    tools?: ToolDefinition[],
    signal?: AbortSignal,
    options?: ChatOptions
  ): AsyncIterable<LLMChunk> {
    // Convert SDK messages to OpenAI format
    // systemInstruction from options is prepended as a system message
    const openaiMessages = this.convertMessages(messages, options?.systemInstruction);

    // Convert tools to OpenAI format
    const openaiTools = tools?.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));

    const stream = await this.client.chat.completions.create(
      {
        model: this.config.model,
        messages: openaiMessages,
        tools: openaiTools,
        tool_choice: openaiTools && openaiTools.length > 0 ? 'auto' : undefined,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: true,
      },
      { signal }
    );

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
    messages: SDKMessage[],
    systemInstruction?: string
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // Add system instruction from options if provided
    if (systemInstruction) {
      result.push({ role: 'system', content: systemInstruction });
    }

    for (const msg of messages) {
      switch (msg.type) {
        case 'user':
          result.push({ role: 'user', content: msg.message.content });
          break;

        case 'system':
          // SDKSystemMessage is metadata only (no content field), skip it
          // System instruction comes from options.systemInstruction
          break;

        case 'assistant': {
          const toolCalls = msg.message.tool_calls;
          const textContent = msg.message.content.find((c) => c.type === 'text');
          if (toolCalls && toolCalls.length > 0) {
            result.push({
              role: 'assistant',
              content: textContent?.text ?? null,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              })),
            });
          } else {
            result.push({ role: 'assistant', content: textContent?.text ?? '' });
          }
          break;
        }

        case 'tool_result':
          result.push({
            role: 'tool',
            tool_call_id: msg.tool_use_id,
            content: typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result),
          });
          break;

        default:
          // Skip result messages - they're not part of the conversation
          break;
      }
    }

    return result;
  }
}

// Register with provider registry
import { providerRegistry } from './base';
providerRegistry.register('openai', (config) => new OpenAIProvider(config as OpenAIConfig));
