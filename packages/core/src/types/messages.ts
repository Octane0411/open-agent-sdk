/**
 * Message types for Open Agent SDK
 * Defines the communication protocol between user, agent, and tools
 */

/** Base message interface */
export interface BaseMessage {
  type: string;
}

/** User message - input from the user */
export interface SDKUserMessage extends BaseMessage {
  type: 'user';
  content: string;
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
  content?: string;
  tool_calls?: ToolCall[];
}

/** Tool result message - output from tool execution */
export interface SDKToolResultMessage extends BaseMessage {
  type: 'tool_result';
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

/** System message - initialization or context */
export interface SDKSystemMessage extends BaseMessage {
  type: 'system';
  content: string;
}

/** Result message - final output of the agent */
export interface SDKResultMessage extends BaseMessage {
  type: 'result';
  subtype: 'success' | 'error';
  result: string;
  duration_ms: number;
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
export function createUserMessage(content: string): SDKUserMessage {
  return { type: 'user', content };
}

/** Helper function to create system message */
export function createSystemMessage(content: string): SDKSystemMessage {
  return { type: 'system', content };
}

/** Helper function to create assistant message */
export function createAssistantMessage(
  content?: string,
  tool_calls?: ToolCall[]
): SDKAssistantMessage {
  return { type: 'assistant', content, tool_calls };
}

/** Helper function to create tool result message */
export function createToolResultMessage(
  tool_call_id: string,
  content: string,
  is_error?: boolean
): SDKToolResultMessage {
  return { type: 'tool_result', tool_call_id, content, is_error };
}
