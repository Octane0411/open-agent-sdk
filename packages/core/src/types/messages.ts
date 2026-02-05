/**
 * Message types for Open Agent SDK
 * Defines the communication protocol between user, agent, and tools
 * Aligned with Claude Agent SDK V2 API
 */

import type { PermissionMode } from '../permissions/types';

/** UUID type for message identification */
export type UUID = string;

/** Base message interface */
export interface BaseMessage {
  type: string;
  uuid: UUID;
  session_id: string;
}

/** Content block for assistant message */
export type AssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

/** Nested message structure for user messages */
export interface UserMessageContent {
  role: 'user';
  content: string;
}

/** Nested message structure for assistant messages */
export interface AssistantMessageContent {
  role: 'assistant';
  content: AssistantContentBlock[];
  tool_calls?: ToolCall[];
}

/** User message - input from the user */
export interface SDKUserMessage extends BaseMessage {
  type: 'user';
  message: UserMessageContent;
  parent_tool_use_id: string | null;
}

/** Tool call from assistant */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Assistant message - response from the LLM */
export interface SDKAssistantMessage extends BaseMessage {
  type: 'assistant';
  message: AssistantMessageContent;
  parent_tool_use_id: string | null;
}

/** Tool result message - output from tool execution */
export interface SDKToolResultMessage extends BaseMessage {
  type: 'tool_result';
  tool_use_id: string;
  tool_name: string;
  result: unknown;
  is_error: boolean;
}

/** API key source for the session */
export type ApiKeySource = 'env' | 'keychain' | 'custom';


/** MCP server info in system message */
export interface McpServerInfo {
  name: string;
  status: string;
}

/** System message - initialization metadata (aligned with Claude Agent SDK) */
export interface SDKSystemMessage extends BaseMessage {
  type: 'system';
  subtype: 'init';
  uuid: UUID;
  session_id: string;
  // Note: No content field - system prompt is passed via Provider options
  model: string;
  provider: string;
  tools: string[];
  cwd: string;
  apiKeySource?: ApiKeySource;
  mcp_servers?: McpServerInfo[];
  permissionMode?: PermissionMode;
  slash_commands?: string[];
  output_style?: string;
}

/** Result message - final output of the agent */
export interface SDKResultMessage extends BaseMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution';
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Union type for all SDK messages */
export type SDKMessage =
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKToolResultMessage
  | SDKSystemMessage
  | SDKResultMessage;

/** Helper function to create user message */
export function createUserMessage(
  content: string,
  sessionId: string,
  uuid: UUID,
  parentToolUseId: string | null = null
): SDKUserMessage {
  return {
    type: 'user',
    uuid,
    session_id: sessionId,
    message: { role: 'user', content },
    parent_tool_use_id: parentToolUseId,
  };
}

/** Options for creating system message */
export interface CreateSystemMessageOptions {
  apiKeySource?: ApiKeySource;
  mcp_servers?: McpServerInfo[];
  permissionMode?: PermissionMode;
  slash_commands?: string[];
  output_style?: string;
}

/** Helper function to create system message (aligned with Claude Agent SDK) */
export function createSystemMessage(
  model: string,
  provider: string,
  tools: string[],
  cwd: string,
  sessionId: string,
  uuid: UUID,
  options?: CreateSystemMessageOptions
): SDKSystemMessage {
  return {
    type: 'system',
    subtype: 'init',
    uuid,
    session_id: sessionId,
    model,
    provider,
    tools,
    cwd,
    apiKeySource: options?.apiKeySource,
    mcp_servers: options?.mcp_servers,
    permissionMode: options?.permissionMode,
    slash_commands: options?.slash_commands,
    output_style: options?.output_style,
  };
}

/** Helper function to create assistant message */
export function createAssistantMessage(
  contentBlocks: AssistantContentBlock[],
  sessionId: string,
  uuid: UUID,
  parentToolUseId: string | null = null,
  toolCalls?: ToolCall[]
): SDKAssistantMessage {
  return {
    type: 'assistant',
    uuid,
    session_id: sessionId,
    message: {
      role: 'assistant',
      content: contentBlocks,
      tool_calls: toolCalls,
    },
    parent_tool_use_id: parentToolUseId,
  };
}

/** Helper function to create tool result message */
export function createToolResultMessage(
  toolUseId: string,
  toolName: string,
  result: unknown,
  isError: boolean,
  sessionId: string,
  uuid: UUID
): SDKToolResultMessage {
  return {
    type: 'tool_result',
    uuid,
    session_id: sessionId,
    tool_use_id: toolUseId,
    tool_name: toolName,
    result,
    is_error: isError,
  };
}

/** Helper function to create result message */
export function createResultMessage(
  subtype: 'success' | 'error_max_turns' | 'error_during_execution',
  result: string,
  durationMs: number,
  durationApiMs: number,
  numTurns: number,
  usage: { input_tokens: number; output_tokens: number },
  sessionId: string,
  uuid: UUID
): SDKResultMessage {
  return {
    type: 'result',
    subtype,
    uuid,
    session_id: sessionId,
    duration_ms: durationMs,
    duration_api_ms: durationApiMs,
    is_error: subtype !== 'success',
    num_turns: numTurns,
    result,
    usage,
  };
}
