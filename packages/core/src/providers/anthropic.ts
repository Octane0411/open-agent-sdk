import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateObject, type ModelMessage, jsonSchema } from 'ai';
import { LLMProvider, type ProviderConfig, type LLMChunk, type ChatOptions, type TokenUsage } from './base';
import type { SDKMessage, AssistantContentBlock } from '../types/messages';
import type { ToolDefinition } from '../types/tools';

/** Vercel AI SDK tool definition format
 * Note: Vercel AI SDK expects 'inputSchema' to be a Schema object from jsonSchema()
 */
interface VercelTool {
  description: string;
  inputSchema: ReturnType<typeof jsonSchema>;
}

/** Anthropic pricing per million tokens (in USD) */
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-35-20241022': { input: 0.8, output: 4 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
};

export interface AnthropicConfig extends ProviderConfig {
  /** Auth token for Bearer authentication (used by some compatible endpoints like MiniMax) */
  authToken?: string;
}

export class AnthropicProvider extends LLMProvider {
  private anthropic: ReturnType<typeof createAnthropic>;

  constructor(config: AnthropicConfig) {
    super(config);
    this.anthropic = createAnthropic({
      apiKey: config.apiKey,
      authToken: config.authToken,
      baseURL: config.baseURL,
    });
  }

  async *chat(
    messages: SDKMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal,
    options?: ChatOptions
  ): AsyncIterable<LLMChunk> {
    // If outputSchema is provided, use generateObject for structured output
    if (options?.outputSchema) {
      yield* this.generateStructuredOutput(messages, options, signal);
      return;
    }

    // Convert message format
    const coreMessages = this.convertToCoreMessages(messages);

    // Convert tools to Vercel AI SDK format
    // ToolDefinition format: { type: 'function', function: { name, description, parameters } }
    // Vercel AI SDK expects: { [name]: { description, inputSchema: Schema } }
    const vercelTools: Record<string, VercelTool> | undefined = tools?.length
      ? Object.fromEntries(
          tools.map((toolDef) => [
            toolDef.function.name,
            {
              description: toolDef.function.description,
              inputSchema: jsonSchema(toolDef.function.parameters),
            },
          ])
        )
      : undefined;

    // Use Vercel AI SDK's streamText
    const result = streamText({
      model: this.anthropic(this.config.model),
      messages: coreMessages,
      system: options?.systemInstruction,
      maxOutputTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      abortSignal: signal,
      tools: vercelTools,
    });

    // Process stream response
    for await (const textDelta of result.textStream) {
      yield { type: 'content', delta: textDelta };
    }

    // Get tool calls after stream completes (they are complete at this point)
    const toolCalls = await result.toolCalls;
    for (const toolCall of toolCalls) {
      yield {
        type: 'tool_call',
        tool_call: {
          id: toolCall.toolCallId,
          name: toolCall.toolName,
          // input may be a pre-serialized string (e.g. from @ai-sdk/anthropic) or an object
          arguments: typeof toolCall.input === 'string'
            ? toolCall.input
            : JSON.stringify(toolCall.input ?? {}),
        },
      };
    }

    // Get usage stats
    const usage = await result.usage;
    yield {
      type: 'usage',
      usage: {
        input_tokens: usage.inputTokens ?? 0,
        output_tokens: usage.outputTokens ?? 0,
      },
    };

    yield { type: 'done' };
  }

  /**
   * Generate structured output using generateObject
   * This is a non-streaming operation that returns a complete object
   */
  private async *generateStructuredOutput(
    messages: SDKMessage[],
    options: ChatOptions,
    signal?: AbortSignal
  ): AsyncIterable<LLMChunk> {
    try {
      // Convert message format
      const coreMessages = this.convertToCoreMessages(messages);

      // Use Vercel AI SDK's generateObject for structured output
      const result = await generateObject({
        model: this.anthropic(this.config.model),
        schema: jsonSchema(options.outputSchema!),
        messages: coreMessages,
        system: options.systemInstruction,
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        abortSignal: signal,
      });

      // Yield the structured output object
      yield {
        type: 'structured_output',
        structured_output: result.object,
      };

      // Also yield as content for backward compatibility
      yield {
        type: 'content',
        delta: JSON.stringify(result.object),
      };

      // Yield usage stats
      yield {
        type: 'usage',
        usage: {
          input_tokens: result.usage?.inputTokens ?? 0,
          output_tokens: result.usage?.outputTokens ?? 0,
        },
      };

      yield { type: 'done' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield { type: 'error', error: errorMessage };
      yield { type: 'done' };
    }
  }

  /**
   * Calculate cost for token usage based on Anthropic pricing
   * @param usage Token usage statistics
   * @returns Cost in USD, or undefined if pricing not available for the model
   */
  getCost(usage: TokenUsage): number | undefined {
    const pricing = ANTHROPIC_PRICING[this.config.model];
    if (!pricing) {
      return undefined;
    }

    // Calculate cost: (input_tokens / 1M) * input_price + (output_tokens / 1M) * output_price
    const inputCost = (usage.input_tokens / 1000000) * pricing.input;
    const outputCost = (usage.output_tokens / 1000000) * pricing.output;
    return inputCost + outputCost;
  }

  private convertToCoreMessages(messages: SDKMessage[]): ModelMessage[] {
    return messages
      .filter((msg) => msg.type !== 'system')
      .map((msg) => {
        switch (msg.type) {
          case 'user':
            return { role: 'user', content: msg.message.content };
          case 'assistant': {
            const content: unknown[] = [];
            for (const block of msg.message.content as AssistantContentBlock[]) {
              if (block.type === 'text') {
                content.push({ type: 'text', text: block.text });
              }
            }
            for (const tc of msg.message.tool_calls ?? []) {
              content.push({
                type: 'tool-call',
                toolCallId: tc.id,
                toolName: tc.function.name,
                input: JSON.parse(tc.function.arguments || '{}'),
              });
            }
            return { role: 'assistant', content };
          }
          case 'tool_result': {
            // Get tool name from the tool call in the previous assistant message
            const toolName = msg.tool_use_id ? 'Tool' : 'unknown';
            // Output must be wrapped in {type, value} format per Vercel AI SDK schema
            const outputValue = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result);
            return {
              role: 'tool',
              content: [{
                type: 'tool-result',
                toolCallId: msg.tool_use_id,
                toolName,
                output: {
                  type: 'text',
                  value: outputValue,
                },
              }],
            } as unknown as ModelMessage;
          }
          default:
            return null;
        }
      })
      .filter((m): m is ModelMessage => m !== null);
  }
}
