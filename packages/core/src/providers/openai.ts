import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateObject, type ModelMessage, jsonSchema } from 'ai';
import { LLMProvider, type ProviderConfig, type LLMChunk, type ChatOptions } from './base';
import type { SDKMessage, AssistantContentBlock } from '../types/messages';
import type { ToolDefinition } from '../types/tools';

/** Vercel AI SDK tool definition format
 * Note: Vercel AI SDK expects 'inputSchema' to be a Schema object from jsonSchema()
 */
interface VercelTool {
  description: string;
  inputSchema: ReturnType<typeof jsonSchema>;
}

export interface OpenAIConfig extends ProviderConfig {
  // OpenAI-specific config
}

export class OpenAIProvider extends LLMProvider {
  private openAI: ReturnType<typeof createOpenAI>;

  constructor(config: OpenAIConfig) {
    super(config);
    this.openAI = createOpenAI({
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
    // When using a custom baseURL (e.g., Gemini's OpenAI-compatible endpoint),
    // use openai.chat() to explicitly use Chat Completions API instead of Responses API
    const model = this.config.baseURL
      ? this.openAI.chat(this.config.model)
      : this.openAI(this.config.model);
    const result = streamText({
      model,
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
          // input can be undefined if the tool has no parameters, default to empty object
          arguments: JSON.stringify(toolCall.input ?? {}),
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
      // Convert message format (exclude system messages and tool results)
      const coreMessages = this.convertToCoreMessages(messages);

      // Use Vercel AI SDK's generateObject for structured output
      const model = this.config.baseURL
        ? this.openAI.chat(this.config.model)
        : this.openAI(this.config.model);

      const result = await generateObject({
        model,
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

  private convertToCoreMessages(messages: SDKMessage[]): ModelMessage[] {
    return messages
      .filter((msg) => msg.type !== 'system')
      .map((msg) => {
        switch (msg.type) {
          case 'user':
            return { role: 'user', content: msg.message.content };
          case 'assistant': {
            const toolCalls = msg.message.tool_calls ?? [];
            const text = msg.message.content
              .filter((c: AssistantContentBlock) => c.type === 'text')
              .map((c: AssistantContentBlock & { type: 'text' }) => c.text)
              .join('');

            if (toolCalls.length > 0) {
              // Build content array with text + tool-call blocks
              const content: Array<Record<string, unknown>> = [];
              if (text) {
                content.push({ type: 'text', text });
              }
              for (const tc of toolCalls) {
                content.push({
                  type: 'tool-call',
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  input: JSON.parse(tc.function.arguments || '{}'),
                });
              }
              return { role: 'assistant', content } as unknown as ModelMessage;
            }

            // Text-only assistant message (no tool calls)
            return { role: 'assistant', content: text };
          }
          case 'tool_result': {
            const outputValue = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result);
            return {
              role: 'tool',
              content: [{
                type: 'tool-result',
                toolCallId: msg.tool_use_id,
                toolName: msg.tool_name,
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
