/**
 * Hooks module - Public exports
 * Aligned with Claude Agent SDK
 */

// Types
export type {
  HookEvent,
  HookInput,
  BaseHookInput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
  NotificationHookInput,
  UserPromptSubmitHookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  ExitReason,
  StopHookInput,
  SubagentStartHookInput,
  SubagentStopHookInput,
  PreCompactHookInput,
  PermissionRequestHookInput,
  HookCallback,
  HookCallbackMatcher,
  HooksConfig,
  HookJSONOutput,
  AsyncHookJSONOutput,
  SyncHookJSONOutput,
  PermissionUpdate,
  PermissionBehavior,
  PermissionUpdateDestination,
  PermissionRuleValue,
} from './types';

// Manager
export { HookManager } from './manager';

// Input helpers
export {
  createPreToolUseInput,
  createPostToolUseInput,
  createSessionStartInput,
  createSessionEndInput,
} from './inputs';
