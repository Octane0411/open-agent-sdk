import { createOpenAI } from '@ai-sdk/openai';
import { streamText, type ModelMessage } from 'ai';
import { LLMProvider, type ProviderConfig, type LLMChunk, type ChatOptions } from './base';
import type { SDKMessage, AssistantContentBlock } from '../types/messages';
import type { ToolDefinition } from '../types/tools';

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
    _tools?: ToolDefinition[],
    signal?: AbortSignal,
    options?: ChatOptions
  ): AsyncIterable<LLMChunk> {
    // Convert message format
    const coreMessages = this.convertToCoreMessages(messages);

    // Use Vercel AI SDK's streamText
    const result = streamText({
      model: this.openAI(this.config.model),
      messages: coreMessages,
      system: options?.systemInstruction,
      maxOutputTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      abortSignal: signal,
    });

    // Process stream response
    for await (const textDelta of result.textStream) {
      yield { type: 'content', delta: textDelta };
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
