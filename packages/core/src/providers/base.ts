/**
 * Base provider interface for LLM integrations
 */

import { SDKMessage } from '../types/messages';
import { ToolDefinition } from '../types/tools';

/** Chunk from streaming LLM response */
export interface LLMChunk {
  /** Type of chunk */
  type: 'content' | 'tool_call' | 'usage' | 'done' | 'error' | 'structured_output';
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
  /** Error message (for error type) */
  error?: string;
  /** Structured output object (for structured_output type) */
  structured_output?: unknown;
}

/** Provider configuration */
export interface ProviderConfig {
  /** API key for the provider (optional for providers that support authToken) */
  apiKey?: string;
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
  /** Output schema for structured output generation */
  outputSchema?: Record<string, unknown>;
}

/** Token usage for cost calculation */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
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

  /**
   * Calculate cost for token usage
   * Override this method to provide accurate cost calculation
   * @param usage Token usage statistics
   * @returns Cost in USD, or undefined if not available
   */
  getCost?(usage: TokenUsage): number | undefined;
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
