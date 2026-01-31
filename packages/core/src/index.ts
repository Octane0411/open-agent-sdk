/**
 * Open Agent SDK - Core API
 * Single-query prompt function for one-shot agent interactions
 */

import { OpenAIProvider } from './providers/openai';
import { GoogleProvider } from './providers/google';
import { createDefaultRegistry } from './tools/registry';
import { ReActLoop } from './agent/react-loop';
import type { ToolRegistry } from './tools/registry';

export interface PromptOptions {
  /** Model identifier (e.g., 'gpt-4', 'gpt-4o', 'gemini-2.0-flash') */
  model: string;
  /** API key (defaults to OPENAI_API_KEY or GEMINI_API_KEY env var based on provider) */
  apiKey?: string;
  /** Provider to use: 'openai' or 'google' (auto-detected from model name if not specified) */
  provider?: 'openai' | 'google';
  /** Base URL for API (OpenAI only) */
  baseURL?: string;
  /** Maximum conversation turns (default: 10) */
  maxTurns?: number;
  /** Allowed tools whitelist (default: all) */
  allowedTools?: string[];
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** AbortController for cancellation */
  abortController?: AbortController;
}

export interface PromptResult {
  /** Final result text from the agent */
  result: string;
  /** Total execution time in milliseconds */
  duration_ms: number;
  /** Token usage statistics */
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Execute a single prompt with the agent
 * @param prompt - User's question or task
 * @param options - Configuration options
 * @returns Promise with result, duration, and usage
 *
 * @example
 * ```typescript
 * const result = await prompt("What files are in the current directory?", {
 *   model: "gpt-4o",
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 * console.log(result.result);
 * ```
 */
export async function prompt(
  prompt: string,
  options: PromptOptions
): Promise<PromptResult> {
  const startTime = Date.now();

  // Auto-detect provider from model name if not specified
  const providerType = options.provider ??
    (options.model.toLowerCase().includes('gemini') ? 'google' : 'openai');

  // Get API key based on provider
  const apiKey = options.apiKey ??
    (providerType === 'google' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY);

  if (!apiKey) {
    const keyName = providerType === 'google' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(
      `${providerType} API key is required. Provide it via options.apiKey or ${keyName} environment variable.`
    );
  }

  // Create provider
  const provider = providerType === 'google'
    ? new GoogleProvider({ apiKey, model: options.model })
    : new OpenAIProvider({ apiKey, model: options.model, baseURL: options.baseURL });

  // Create tool registry with default tools
  const toolRegistry = createDefaultRegistry();

  // Create ReAct loop
  const loop = new ReActLoop(provider, toolRegistry, {
    maxTurns: options.maxTurns ?? 10,
    systemPrompt: options.systemPrompt,
    allowedTools: options.allowedTools,
    cwd: options.cwd,
    env: options.env,
    abortController: options.abortController,
  });

  // Run the loop
  const result = await loop.run(prompt);

  const duration_ms = Date.now() - startTime;

  return {
    result: result.result,
    duration_ms,
    usage: result.usage,
  };
}

// Re-export types
export type { PromptOptions, PromptResult };

// Re-export core types
export type {
  SDKMessage,
  SDKUserMessage,
  SDKAssistantMessage,
  SDKToolResultMessage,
  SDKSystemMessage,
  SDKResultMessage,
  ToolCall,
} from './types/messages';

export type {
  Tool,
  ToolDefinition,
  ToolContext,
  ToolInput,
  ToolOutput,
  ToolHandler,
  JSONSchema,
} from './types/tools';

// Re-export providers
export { LLMProvider, type LLMChunk, type ProviderConfig } from './providers/base';
export { OpenAIProvider, type OpenAIConfig } from './providers/openai';
export { GoogleProvider, type GoogleConfig } from './providers/google';

// Re-export tools
export {
  ToolRegistry,
  createDefaultRegistry,
  ReadTool,
  readTool,
  WriteTool,
  writeTool,
  EditTool,
  editTool,
  BashTool,
  bashTool,
} from './tools/registry';

// Re-export agent
export { ReActLoop, type ReActLoopConfig, type ReActResult } from './agent/react-loop';

// Re-export message helpers
export {
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createToolResultMessage,
} from './types/messages';
