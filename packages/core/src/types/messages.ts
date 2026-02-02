/**
 * Message types for Open Agent SDK
 * Defines the communication protocol between user, agent, and tools
 * Aligned with Claude Agent SDK V2 API
 */

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

/** System message - initialization or context */
export interface SDKSystemMessage extends BaseMessage {
  type: 'system';
  subtype: 'init';
  model: string;
  provider: string;
  tools: string[];
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

/** Helper function to create system message */
export function createSystemMessage(
  model: string,
  provider: string,
  tools: string[],
  sessionId: string,
  uuid: UUID
): SDKSystemMessage {
  return {
    type: 'system',
    subtype: 'init',
    uuid,
    session_id: sessionId,
    model,
    provider,
    tools,
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
