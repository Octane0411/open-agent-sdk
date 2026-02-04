/**
 * Hooks usage example and integration test
 * Demonstrates how to use hooks with createSession
 */

import { describe, test, expect } from 'bun:test';
import { HookManager } from '../../src/hooks/manager';
import type { HookCallback, SessionStartHookInput, PreToolUseHookInput, PostToolUseHookInput } from '../../src/hooks/types';

describe('Hooks Usage Example', () => {
  test('should demonstrate basic hook registration', async () => {
    const events: string[] = [];

    // Create hook callbacks
    const sessionStartCallback: HookCallback = async (input) => {
      const sessionInput = input as SessionStartHookInput;
      events.push(`Session started: ${sessionInput.session_id}`);
      return { continue: true };
    };

    const preToolCallback: HookCallback = async (input) => {
      const toolInput = input as PreToolUseHookInput;
      events.push(`Before tool: ${toolInput.tool_name}`);
      return { continue: true };
    };

    const postToolCallback: HookCallback = async (input) => {
      const toolInput = input as PostToolUseHookInput;
      events.push(`After tool: ${toolInput.tool_name}`);
      return { continue: true };
    };

    // Create HookManager with config
    const manager = new HookManager({
      SessionStart: [{ hooks: [sessionStartCallback] }],
      PreToolUse: [{ hooks: [preToolCallback] }],
      PostToolUse: [{ hooks: [postToolCallback] }],
    });

    // Simulate session start
    await manager.emit('SessionStart', {
      session_id: 'test-123',
      transcript_path: '/tmp/test.json',
      cwd: '/home/user',
      hook_event_name: 'SessionStart',
      source: 'startup',
    }, undefined);

    // Simulate tool execution
    await manager.emitForTool('PreToolUse', {
      session_id: 'test-123',
      transcript_path: '/tmp/test.json',
      cwd: '/home/user',
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test.txt' },
    }, 'Read', 'tool-1');

    await manager.emitForTool('PostToolUse', {
      session_id: 'test-123',
      transcript_path: '/tmp/test.json',
      cwd: '/home/user',
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test.txt' },
      tool_response: { content: 'Hello World' },
    }, 'Read', 'tool-1');

    // Verify events
    expect(events).toEqual([
      'Session started: test-123',
      'Before tool: Read',
      'After tool: Read',
    ]);
  });

  test('should demonstrate matcher filtering', async () => {
    const bashEvents: string[] = [];
    const allEvents: string[] = [];

    // Bash-specific hook
    const bashHook: HookCallback = async (input) => {
      const toolInput = input as PreToolUseHookInput;
      bashEvents.push(`Bash: ${toolInput.tool_input}`);
      return { continue: true };
    };

    // Global hook for all tools
    const globalHook: HookCallback = async (input) => {
      const toolInput = input as PreToolUseHookInput;
      allEvents.push(`All: ${toolInput.tool_name}`);
      return { continue: true };
    };

    const manager = new HookManager({
      PreToolUse: [
        { matcher: 'Bash', hooks: [bashHook] },
        { hooks: [globalHook] },
      ],
    });

    // Execute Bash tool - both hooks should fire
    await manager.emitForTool('PreToolUse', {
      session_id: 'test',
      transcript_path: '',
      cwd: '/home/user',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
    }, 'Bash', 'tool-1');

    // Execute Read tool - only global hook should fire
    await manager.emitForTool('PreToolUse', {
      session_id: 'test',
      transcript_path: '',
      cwd: '/home/user',
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test' },
    }, 'Read', 'tool-2');

    expect(bashEvents).toHaveLength(1);
    expect(allEvents).toHaveLength(2);
    expect(bashEvents[0]).toContain('Bash:');
    expect(allEvents).toContain('All: Bash');
    expect(allEvents).toContain('All: Read');
  });

  test('should demonstrate async hook with timeout', async () => {
    let completed = false;

    const asyncHook: HookCallback = async () => {
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 50));
      completed = true;
      return { async: true, asyncTimeout: 1000 };
    };

    const manager = new HookManager({
      SessionStart: [{ hooks: [asyncHook] }],
    });

    await manager.emit('SessionStart', {
      session_id: 'test',
      transcript_path: '',
      cwd: '/home/user',
      hook_event_name: 'SessionStart',
      source: 'startup',
    }, undefined);

    expect(completed).toBe(true);
  });
});
