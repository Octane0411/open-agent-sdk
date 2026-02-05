import { createOpenAI } from '@ai-sdk/openai';
import { streamText, type ModelMessage, jsonSchema } from 'ai';
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
      model: this.openAI(this.config.model),
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

  private convertToCoreMessages(messages: SDKMessage[]): ModelMessage[] {
    return messages
      .filter((msg) => msg.type !== 'system')
      .map((msg) => {
        switch (msg.type) {
          case 'user':
            return { role: 'user', content: msg.message.content };
          case 'assistant': {
            const text = msg.message.content
              .filter((c: AssistantContentBlock) => c.type === 'text')
              .map((c: AssistantContentBlock & { type: 'text' }) => c.text)
              .join('');
            return { role: 'assistant', content: text };
          }
          case 'tool_result':
            return {
              role: 'tool',
              toolCallId: msg.tool_use_id,
              content: typeof msg.result === 'string'
                ? msg.result
                : JSON.stringify(msg.result),
            } as unknown as ModelMessage;
          default:
            return null;
        }
      })
      .filter((m): m is ModelMessage => m !== null);
  }
}
