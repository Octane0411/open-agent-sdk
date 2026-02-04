/**
 * Open Agent SDK - Core API
 * Single-query prompt function for one-shot agent interactions
 */

import { logger, type LogLevel } from './utils/logger';
import { OpenAIProvider } from './providers/openai';
import { GoogleProvider } from './providers/google';
import { createDefaultRegistry } from './tools/registry';
import { ReActLoop } from './agent/react-loop';
// ToolRegistry type used indirectly through createDefaultRegistry

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
  /** Permission mode for the session */
  permissionMode?: 'accept' | 'reject' | 'prompt';
  /** MCP servers configuration */
  mcpServers?: Record<string, unknown>;
  /** Log level: 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'info') */
  logLevel?: LogLevel;
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
  // Set log level from options or environment variable
  const logLevel = options.logLevel ??
    (process.env.OPEN_AGENT_SDK_LOG_LEVEL as LogLevel) ??
    'info';
  logger.setLevel(logLevel);

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
    permissionMode: options.permissionMode,
    mcpServers: options.mcpServers,
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

// PromptOptions and PromptResult are already exported as interfaces above

// Re-export core types
export type {
  SDKMessage,
  SDKUserMessage,
  SDKAssistantMessage,
  SDKToolResultMessage,
  SDKSystemMessage,
  SDKResultMessage,
  ToolCall,
  ApiKeySource,
  PermissionMode,
  McpServerConfig,
  CreateSystemMessageOptions,
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

// Re-export tool input/output types
export type { ReadInput, ReadOutput } from './tools/read';
export type { WriteInput, WriteOutput } from './tools/write';
export type { EditInput, EditOutput } from './tools/edit';
export type { BashInput, BashOutput } from './tools/bash';
export type { GlobInput, GlobOutput } from './tools/glob';
export type { GrepInput, GrepOutput, GrepMatch } from './tools/grep';
export type { TaskListInput, TaskListOutput } from './tools/task-list';
export type { TaskCreateInput, TaskCreateOutput } from './tools/task-create';
export type { TaskGetInput, TaskGetOutput } from './tools/task-get';
export type { TaskUpdateInput, TaskUpdateOutput } from './tools/task-update';
export type { WebSearchInput, WebSearchOutput } from './tools/web-search';
export type { WebFetchInput, WebFetchOutput } from './tools/web-fetch';

// Re-export task types
export type { Task, TaskStatus, TaskStorage } from './types/task';

// Re-export providers
export { LLMProvider, type LLMChunk, type ProviderConfig, type ChatOptions } from './providers/base';
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
  GlobTool,
  globTool,
  GrepTool,
  grepTool,
  TaskListTool,
  taskListTool,
  TaskCreateTool,
  taskCreateTool,
  TaskGetTool,
  taskGetTool,
  TaskUpdateTool,
  taskUpdateTool,
  WebSearchTool,
  webSearchTool,
  WebFetchTool,
  webFetchTool,
} from './tools/registry';

// Re-export agent
export { ReActLoop, type ReActLoopConfig, type ReActResult, type ReActStreamEvent } from './agent/react-loop';

// Re-export message helpers
export {
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createToolResultMessage,
  createResultMessage,
} from './types/messages';

// Re-export session
export {
  Session,
  SessionState,
  SessionError,
  SessionNotIdleError,
  SessionNotReadyError,
  SessionAlreadyStreamingError,
  SessionClosedError,
  InMemoryStorage,
  FileStorage,
  createSession,
  resumeSession,
  type SessionStorage,
  type SessionData,
  type SessionOptions as SessionStorageOptions,
  type FileStorageOptions,
  type CreateSessionOptions,
  type ResumeSessionOptions,
} from './session';

// Re-export logger
export { logger, type LogLevel } from './utils/logger';
