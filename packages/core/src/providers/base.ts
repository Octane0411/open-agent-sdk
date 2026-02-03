/**
 * Base provider interface for LLM integrations
 */

import { SDKMessage } from '../types/messages';
import { ToolDefinition } from '../types/tools';

/** Chunk from streaming LLM response */
export interface LLMChunk {
  /** Type of chunk */
  type: 'content' | 'tool_call' | 'usage' | 'done';
  /** Content delta (for content type) */
  delta?: string;
  /** Tool call info (for tool_call type) */
  tool_call?: {
    id: string;
    name: string;
    arguments: string;
  };
  /** Usage info (for usage type) */
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Provider configuration */
export interface ProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Base URL for API (for custom endpoints like Gemini) */
  baseURL?: string;
  /** Model identifier */
  model: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
}

/** Options for chat method */
export interface ChatOptions {
  /** System instruction to prepend to the conversation (not part of message history) */
  systemInstruction?: string;
}

/** Abstract base class for LLM providers */
export abstract class LLMProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Send messages to the LLM and get streaming response
   * @param messages - Conversation history (SDKSystemMessage is metadata only, skipped during conversion)
   * @param tools - Available tools
   * @param signal - Optional AbortSignal for cancellation
   * @param options - Optional chat configuration including systemInstruction
   * @returns Async iterable of response chunks
   */
  abstract chat(
    messages: SDKMessage[],
    tools?: ToolDefinition[],
    signal?: AbortSignal,
    options?: ChatOptions
  ): AsyncIterable<LLMChunk>;

  /**
   * Get the model identifier
   */
  getModel(): string {
    return this.config.model;
  }
}

/** Provider factory type */
export type ProviderFactory = (config: ProviderConfig) => LLMProvider;

/** Registry of available providers */
export class ProviderRegistry {
  private providers = new Map<string, ProviderFactory>();

  register(name: string, factory: ProviderFactory): void {
    this.providers.set(name, factory);
  }

  create(name: string, config: ProviderConfig): LLMProvider {
    const factory = this.providers.get(name);
    if (!factory) {
      throw new Error(`Unknown provider: ${name}`);
    }
    return factory(config);
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }
}

/** Global provider registry instance */
export const providerRegistry = new ProviderRegistry();
