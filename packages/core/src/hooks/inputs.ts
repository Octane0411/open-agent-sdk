/**
 * Helper functions for creating HookInput objects
 * Aligned with Claude Agent SDK
 */

import type {
  BaseHookInput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  PermissionRequestHookInput,
  PostToolUseFailureHookInput,
  ExitReason,
  PermissionUpdate,
} from './types';

/**
 * Create base hook input with common fields
 */
function createBaseHookInput(
  sessionId: string,
  cwd: string,
  transcriptPath: string = '',
  permissionMode?: string
): BaseHookInput {
  return {
    session_id: sessionId,
    transcript_path: transcriptPath,
    cwd,
    ...(permissionMode && { permission_mode: permissionMode }),
  };
}

/**
 * Create PreToolUse hook input
 */
export function createPreToolUseInput(
  sessionId: string,
  cwd: string,
  toolName: string,
  toolInput: unknown,
  transcriptPath?: string,
  permissionMode?: string
): PreToolUseHookInput {
  return {
    ...createBaseHookInput(sessionId, cwd, transcriptPath, permissionMode),
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
  };
}

/**
 * Create PostToolUse hook input
 */
export function createPostToolUseInput(
  sessionId: string,
  cwd: string,
  toolName: string,
  toolInput: unknown,
  toolResponse: unknown,
  transcriptPath?: string,
  permissionMode?: string
): PostToolUseHookInput {
  return {
    ...createBaseHookInput(sessionId, cwd, transcriptPath, permissionMode),
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_response: toolResponse,
  };
}

/**
 * Create SessionStart hook input
 */
export function createSessionStartInput(
  sessionId: string,
  cwd: string,
  source: SessionStartHookInput['source'] = 'startup',
  transcriptPath?: string,
  permissionMode?: string
): SessionStartHookInput {
  return {
    ...createBaseHookInput(sessionId, cwd, transcriptPath, permissionMode),
    hook_event_name: 'SessionStart',
    source,
  };
}

/**
 * Create SessionEnd hook input
 */
export function createSessionEndInput(
  sessionId: string,
  cwd: string,
  reason: ExitReason = 'completed',
  transcriptPath?: string,
  permissionMode?: string
): SessionEndHookInput {
  return {
    ...createBaseHookInput(sessionId, cwd, transcriptPath, permissionMode),
    hook_event_name: 'SessionEnd',
    reason,
  };
}

/**
 * Create PermissionRequest hook input
 */
export function createPermissionRequestInput(
  sessionId: string,
  cwd: string,
  toolName: string,
  toolInput: unknown,
  permissionSuggestions?: PermissionUpdate[],
  transcriptPath?: string,
  permissionMode?: string
): PermissionRequestHookInput {
  return {
    ...createBaseHookInput(sessionId, cwd, transcriptPath, permissionMode),
    hook_event_name: 'PermissionRequest',
    tool_name: toolName,
    tool_input: toolInput,
    permission_suggestions: permissionSuggestions,
  };
}

/**
 * Create PostToolUseFailure hook input
 */
export function createPostToolUseFailureInput(
  sessionId: string,
  cwd: string,
  toolName: string,
  toolInput: unknown,
  error: string,
  isInterrupt?: boolean,
  transcriptPath?: string,
  permissionMode?: string
): PostToolUseFailureHookInput {
  return {
    ...createBaseHookInput(sessionId, cwd, transcriptPath, permissionMode),
    hook_event_name: 'PostToolUseFailure',
    tool_name: toolName,
    tool_input: toolInput,
    error,
    is_interrupt: isInterrupt,
  };
}
