/**
 * Hooks types tests - TDD for v0.3.0
 * Aligned with Claude Agent SDK
 */

import { describe, test, expect } from 'bun:test';

// Import types to test (will implement after tests)
import type {
  HookEvent,
  HookInput,
  BaseHookInput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  ExitReason,
  HookCallback,
  HookCallbackMatcher,
  HooksConfig,
  HookJSONOutput,
  AsyncHookJSONOutput,
  SyncHookJSONOutput,
} from '../../src/hooks/types';

describe('Hook Types', () => {
  describe('HookEvent', () => {
    test('should include all 12 events', () => {
      const events: HookEvent[] = [
        'PreToolUse',
        'PostToolUse',
        'PostToolUseFailure',
        'Notification',
        'UserPromptSubmit',
        'SessionStart',
        'SessionEnd',
        'Stop',
        'SubagentStart',
        'SubagentStop',
        'PreCompact',
        'PermissionRequest',
      ];

      expect(events).toHaveLength(12);
      // Verify all events are valid by TypeScript (compile-time check)
      expect(true).toBe(true);
    });
  });

  describe('BaseHookInput', () => {
    test('should have required fields', () => {
      const baseInput: BaseHookInput = {
        session_id: 'test-session-123',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user/project',
        permission_mode: 'default',
      };

      expect(baseInput.session_id).toBe('test-session-123');
      expect(baseInput.transcript_path).toBe('/tmp/test.json');
      expect(baseInput.cwd).toBe('/home/user/project');
      expect(baseInput.permission_mode).toBe('default');
    });

    test('should have optional permission_mode', () => {
      const baseInput: BaseHookInput = {
        session_id: 'test-session-123',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user/project',
      };

      expect(baseInput.permission_mode).toBeUndefined();
    });
  });

  describe('PreToolUseHookInput', () => {
    test('should have correct structure', () => {
      const input: PreToolUseHookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' },
      };

      expect(input.hook_event_name).toBe('PreToolUse');
      expect(input.tool_name).toBe('Bash');
      expect(input.tool_input).toEqual({ command: 'echo hello' });
    });
  });

  describe('PostToolUseHookInput', () => {
    test('should have correct structure', () => {
      const input: PostToolUseHookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' },
        tool_response: { output: 'hello', exitCode: 0 },
      };

      expect(input.hook_event_name).toBe('PostToolUse');
      expect(input.tool_response).toEqual({ output: 'hello', exitCode: 0 });
    });
  });

  describe('SessionStartHookInput', () => {
    test('should have correct structure with source', () => {
      const input: SessionStartHookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      expect(input.hook_event_name).toBe('SessionStart');
      expect(input.source).toBe('startup');
    });

    test('should support all source types', () => {
      const sources: Array<SessionStartHookInput['source']> = [
        'startup',
        'resume',
        'clear',
        'compact',
      ];

      expect(sources).toHaveLength(4);
    });
  });

  describe('SessionEndHookInput', () => {
    test('should have correct structure with reason', () => {
      const input: SessionEndHookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionEnd',
        reason: 'completed',
      };

      expect(input.hook_event_name).toBe('SessionEnd');
      expect(input.reason).toBe('completed');
    });
  });

  describe('ExitReason', () => {
    test('should support all exit reasons', () => {
      const reasons: ExitReason[] = [
        'completed',
        'error',
        'interrupted',
        'max_turns_reached',
        'abort',
      ];

      expect(reasons).toHaveLength(5);
    });
  });

  describe('HookCallback', () => {
    test('should have correct signature', async () => {
      const callback: HookCallback = async (_input, _toolUseID, options) => {
        expect(options.signal).toBeInstanceOf(AbortSignal);
        return { continue: true };
      };

      // Test the callback can be called
      const mockInput = {
        session_id: 'test',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse' as const,
        tool_name: 'Bash',
        tool_input: {},
      };

      const result = await callback(mockInput, 'tool-123', {
        signal: new AbortController().signal,
      });

      expect(result).toEqual({ continue: true });
    });

    test('should return void', async () => {
      const callback: HookCallback = async () => {
        // Return nothing
      };

      const result = await callback({} as HookInput, undefined, {
        signal: new AbortController().signal,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('HookCallbackMatcher', () => {
    test('should support matcher filter', () => {
      const matcher: HookCallbackMatcher = {
        matcher: 'Bash',
        hooks: [async () => ({ continue: true })],
      };

      expect(matcher.matcher).toBe('Bash');
      expect(matcher.hooks).toHaveLength(1);
    });

    test('should support global hooks without matcher', () => {
      const matcher: HookCallbackMatcher = {
        hooks: [async () => ({ continue: true })],
      };

      expect(matcher.matcher).toBeUndefined();
      expect(matcher.hooks).toHaveLength(1);
    });
  });

  describe('HooksConfig', () => {
    test('should support partial event mapping', () => {
      const config: HooksConfig = {
        PreToolUse: [
          { matcher: 'Bash', hooks: [async () => ({})] },
        ],
        SessionStart: [
          { hooks: [async () => ({})] },
        ],
      };

      expect(Object.keys(config)).toHaveLength(2);
      expect(config.PreToolUse).toHaveLength(1);
      expect(config.SessionStart).toHaveLength(1);
    });
  });

  describe('HookJSONOutput', () => {
    test('should support async output', () => {
      const output: AsyncHookJSONOutput = {
        async: true,
        asyncTimeout: 5000,
      };

      expect(output.async).toBe(true);
      expect(output.asyncTimeout).toBe(5000);
    });

    test('should support sync output with continue', () => {
      const output: SyncHookJSONOutput = {
        continue: true,
        suppressOutput: false,
      };

      expect(output.continue).toBe(true);
      expect(output.suppressOutput).toBe(false);
    });

    test('should support sync output with decision', () => {
      const output: SyncHookJSONOutput = {
        decision: 'approve',
        systemMessage: 'Approved by hook',
      };

      expect(output.decision).toBe('approve');
      expect(output.systemMessage).toBe('Approved by hook');
    });

    test('should support hookSpecificOutput for PreToolUse', () => {
      const output: SyncHookJSONOutput = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: { command: 'modified' },
        },
      };

      expect(output.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    });

    test('should support void return', () => {
      const output: HookJSONOutput = undefined;
      expect(output).toBeUndefined();
    });
  });
});
