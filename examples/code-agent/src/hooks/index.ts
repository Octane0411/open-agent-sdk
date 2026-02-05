/**
 * Built-in hooks for the Code Agent CLI
 * Demonstrates the hooks framework functionality
 */

import type {
  HookCallback,
  HookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  PreToolUseHookInput,
  PostToolUseHookInput,
} from '@open-agent-sdk/core';
import chalk from 'chalk';

/** Store tool execution start times for duration calculation */
const toolStartTimes = new Map<string, number>();

/**
 * Type guard for SessionStartHookInput
 */
function isSessionStartInput(input: HookInput): input is SessionStartHookInput {
  return input.hook_event_name === 'SessionStart';
}

/**
 * Type guard for SessionEndHookInput
 */
function isSessionEndInput(input: HookInput): input is SessionEndHookInput {
  return input.hook_event_name === 'SessionEnd';
}

/**
 * Type guard for PreToolUseHookInput
 */
function isPreToolUseInput(input: HookInput): input is PreToolUseHookInput {
  return input.hook_event_name === 'PreToolUse';
}

/**
 * Type guard for PostToolUseHookInput
 */
function isPostToolUseInput(input: HookInput): input is PostToolUseHookInput {
  return input.hook_event_name === 'PostToolUse';
}

/**
 * Hook: SessionStart
 * Logs when a session begins
 */
export const sessionStartHook: HookCallback = async (input) => {
  if (isSessionStartInput(input)) {
    console.log(chalk.gray(`[Session ${input.session_id.slice(0, 8)}... started]`));
  }
  return {};
};

/**
 * Hook: SessionEnd
 * Logs when a session ends
 */
export const sessionEndHook: HookCallback = async (input) => {
  if (isSessionEndInput(input)) {
    console.log(chalk.gray(`[Session ended: ${input.reason}]`));
  }
  return {};
};

/**
 * Hook: PreToolUse
 * Records the start time before tool execution
 */
export const preToolUseTimingHook: HookCallback = async (input) => {
  if (isPreToolUseInput(input)) {
    toolStartTimes.set(input.tool_name, Date.now());
  }
  return {};
};

/**
 * Hook: PostToolUse
 * Calculates and displays tool execution time
 */
export const postToolUseTimingHook: HookCallback = async (input) => {
  if (isPostToolUseInput(input)) {
    const startTime = toolStartTimes.get(input.tool_name);
    if (startTime) {
      const duration = Date.now() - startTime;
      toolStartTimes.delete(input.tool_name);

      // Only show for operations that take noticeable time (> 100ms)
      if (duration > 100) {
        console.log(chalk.gray(`  (${input.tool_name} took ${duration}ms)`));
      }
    }
  }
  return {};
};

/**
 * Hook: PreToolUse for WebSearch
 * Logs search queries
 */
export const webSearchLoggingHook: HookCallback = async (input) => {
  if (isPreToolUseInput(input) && input.tool_name === 'WebSearch') {
    const toolInput = input.tool_input as { query?: string };
    if (toolInput.query) {
      console.log(chalk.gray(`  [Searching: "${toolInput.query}"]`));
    }
  }
  return {};
};

/**
 * Create a hooks configuration object for use with createSession
 * Includes all built-in demonstration hooks
 */
export function createBuiltInHooksConfig() {
  return {
    SessionStart: [{ hooks: [sessionStartHook] }],
    SessionEnd: [{ hooks: [sessionEndHook] }],
    PreToolUse: [
      { hooks: [preToolUseTimingHook, webSearchLoggingHook] },
    ],
    PostToolUse: [{ hooks: [postToolUseTimingHook] }],
  };
}
