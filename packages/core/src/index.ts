/**
 * Open Agent SDK - Core API
 * Single-query prompt function for one-shot agent interactions
 */

import { logger, type LogLevel } from './utils/logger';
import type { PermissionMode } from './permissions/types';
import type { McpServersConfig } from './mcp/types';
import { OpenAIProvider } from './providers/openai';
import { GoogleProvider } from './providers/google';
import { AnthropicProvider } from './providers/anthropic';
import { createDefaultRegistry } from './tools/registry';
import { ReActLoop } from './agent/react-loop';
// ToolRegistry type used indirectly through createDefaultRegistry

// Export permission system
export {
  PermissionManager,
  type PermissionMode,
  type PermissionOptions,
  type PermissionResult,
  type CanUseTool,
  type PermissionCheckResult,
  type PlanLogEntry,
  SENSITIVE_TOOLS,
  EDIT_TOOLS,
  isSensitiveTool,
  isEditTool,
} from './permissions';

export interface PromptOptions {
  /** Model identifier (e.g., 'gpt-4', 'gpt-4o', 'gemini-2.0-flash') */
  model: string;
  /** API key (defaults to OPENAI_API_KEY or GEMINI_API_KEY env var based on provider) */
  apiKey?: string;
  /** Provider to use: 'openai', 'google', or 'anthropic' (auto-detected from model name if not specified) */
  provider?: 'openai' | 'google' | 'anthropic';
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
  /** Permission mode for the session (default: 'default') */
  permissionMode?: PermissionMode;
  /** Required to be true when using bypassPermissions mode */
  allowDangerouslySkipPermissions?: boolean;
  /** MCP servers configuration */
  mcpServers?: McpServersConfig;
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
  const modelLower = options.model.toLowerCase();
  const providerType = options.provider ??
    (modelLower.includes('gemini') ? 'google' :
     modelLower.includes('claude') ? 'anthropic' : 'openai');

  // Get API key based on provider
  const apiKey = options.apiKey ??
    (providerType === 'google' ? process.env.GEMINI_API_KEY :
     providerType === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);

  if (!apiKey) {
    const keyName = providerType === 'google' ? 'GEMINI_API_KEY' :
                    providerType === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(
      `${providerType} API key is required. Provide it via options.apiKey or ${keyName} environment variable.`
    );
  }

  // Create provider
  let provider;
  if (providerType === 'google') {
    provider = new GoogleProvider({ apiKey, model: options.model });
  } else if (providerType === 'anthropic') {
    provider = new AnthropicProvider({ apiKey, model: options.model });
  } else {
    provider = new OpenAIProvider({ apiKey, model: options.model, baseURL: options.baseURL });
  }

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
  McpServerInfo,
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
export type { BashInput, BashOutput, BackgroundProcess } from './tools/bash';
export type { GlobInput, GlobOutput } from './tools/glob';
export type { GrepInput, GrepOutput, GrepMatch } from './tools/grep';
export type { TaskListInput, TaskListOutput } from './tools/task-list';
export type { TaskCreateInput, TaskCreateOutput } from './tools/task-create';
export type { TaskGetInput, TaskGetOutput } from './tools/task-get';
export type { TaskUpdateInput, TaskUpdateOutput } from './tools/task-update';
export type { WebSearchInput, WebSearchOutput } from './tools/web-search';
export type { WebFetchInput, WebFetchOutput } from './tools/web-fetch';
export type { BashOutputInput, BashOutputOutput } from './tools/bash-output';
export type { KillBashInput, KillBashOutput } from './tools/kill-bash';

// Re-export task types
export type { Task, TaskStatus, TaskStorage } from './types/task';

// Re-export providers
export { LLMProvider, type LLMChunk, type ProviderConfig, type ChatOptions, type TokenUsage } from './providers/base';
export { OpenAIProvider, type OpenAIConfig } from './providers/openai';
export { GoogleProvider, type GoogleConfig } from './providers/google';
export { AnthropicProvider, type AnthropicConfig } from './providers/anthropic';

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
  BashOutputTool,
  bashOutputTool,
  KillBashTool,
  killBashTool,
} from './tools/registry';

// Re-export agent
export { ReActLoop, type ReActLoopConfig, type ReActResult, type ReActStreamEvent } from './agent/react-loop';

// Re-export agent definitions
export {
  AgentDefinitionSchema,
  validateAgentDefinition,
  safeValidateAgentDefinition,
  createAgentDefinition,
  hasCustomTools,
  inheritsModel,
  hasCustomMaxTurns,
  hasCustomPermissionMode,
  type AgentDefinition,
  type AgentDefinitions,
  type ModelIdentifier,
} from './agent/agent-definition';

// Re-export subagent runner
export {
  runSubagent,
  isSubagentSuccess,
  formatSubagentResult,
  type SubagentResult,
  type SubagentContext,
} from './agent/subagent-runner';

// Re-export task tool
export { TaskTool, createTaskTool, createTaskToolFromConfig, type TaskInput, type TaskOutput, type TaskToolConfig } from './tools/task';

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

// Re-export hooks
export {
  HookManager,
  type HookEvent,
  type HookInput,
  type BaseHookInput,
  type PreToolUseHookInput,
  type PostToolUseHookInput,
  type NotificationHookInput,
  type UserPromptSubmitHookInput,
  type SessionStartHookInput,
  type SessionEndHookInput,
  type StopHookInput,
  type SubagentStartHookInput,
  type SubagentStopHookInput,
  type PreCompactHookInput,
  type ExitReason,
  type HookCallback,
  type HookCallbackMatcher,
  type HooksConfig,
  type HookJSONOutput,
  type AsyncHookJSONOutput,
  type SyncHookJSONOutput,
  createPreToolUseInput,
  createPostToolUseInput,
  createSessionStartInput,
  createSessionEndInput,
  createSubagentStartInput,
  createSubagentStopInput,
  createNotificationInput,
  createStopInput,
  createPreCompactInput,
  createUserPromptSubmitInput,
} from './hooks';

// Re-export MCP module
export * from './mcp';
