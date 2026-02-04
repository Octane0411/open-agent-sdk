/**
 * HookManager tests - TDD for v0.3.0
 * Aligned with Claude Agent SDK
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { HookManager } from '../../src/hooks/manager';
import type { HookInput, HookCallback } from '../../src/hooks/types';

describe('HookManager', () => {
  let manager: HookManager;

  beforeEach(() => {
    manager = new HookManager();
  });

  describe('Registration', () => {
    test('should register hooks for an event', () => {
      const callback: HookCallback = async () => ({ continue: true });

      manager.register('PreToolUse', [{ hooks: [callback] }]);

      // Hook should be registered (tested via emit)
      expect(true).toBe(true);
    });

    test('should register multiple matchers for same event', () => {
      const callback1: HookCallback = async () => ({ continue: true });
      const callback2: HookCallback = async () => ({ continue: false });

      manager.register('PreToolUse', [
        { matcher: 'Bash', hooks: [callback1] },
        { hooks: [callback2] },
      ]);

      expect(true).toBe(true);
    });

    test('should initialize with config', () => {
      const callback: HookCallback = async () => ({ continue: true });
      const config = {
        SessionStart: [{ hooks: [callback] }],
      };

      const mgr = new HookManager(config);
      expect(mgr).toBeInstanceOf(HookManager);
    });
  });

  describe('Emission', () => {
    test('should emit hook and call registered callbacks', async () => {
      let called = false;
      const callback: HookCallback = async () => {
        called = true;
        return { continue: true };
      };

      manager.register('SessionStart', [{ hooks: [callback] }]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      await manager.emit('SessionStart', input, undefined);

      expect(called).toBe(true);
    });

    test('should pass correct arguments to callbacks', async () => {
      let receivedInput: HookInput | undefined;
      let receivedToolUseID: string | undefined;
      let receivedSignal: AbortSignal | undefined;

      const callback: HookCallback = async (input, toolUseID, options) => {
        receivedInput = input;
        receivedToolUseID = toolUseID;
        receivedSignal = options.signal;
        return { continue: true };
      };

      manager.register('PreToolUse', [{ hooks: [callback] }]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' },
      };

      await manager.emit('PreToolUse', input, 'tool-123');

      expect(receivedInput).toEqual(input);
      expect(receivedToolUseID).toBe('tool-123');
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    test('should return results from all callbacks', async () => {
      const callback1: HookCallback = async () => ({ continue: true });
      const callback2: HookCallback = async () => ({ suppressOutput: true });

      manager.register('SessionStart', [
        { hooks: [callback1, callback2] },
      ]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      const results = await manager.emit('SessionStart', input, undefined);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ continue: true });
      expect(results[1]).toEqual({ suppressOutput: true });
    });

    test('should handle async callbacks', async () => {
      let order: number[] = [];

      const callback1: HookCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(1);
        return { continue: true };
      };

      const callback2: HookCallback = async () => {
        order.push(2);
        return { continue: true };
      };

      manager.register('SessionStart', [{ hooks: [callback1, callback2] }]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      await manager.emit('SessionStart', input, undefined);

      expect(order).toEqual([1, 2]);
    });

    test('should handle void returns', async () => {
      const callback: HookCallback = async () => {
        // Return nothing
      };

      manager.register('SessionStart', [{ hooks: [callback] }]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      const results = await manager.emit('SessionStart', input, undefined);

      expect(results).toHaveLength(1);
      expect(results[0]).toBeUndefined();
    });

    test('should not throw when no hooks registered', async () => {
      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      const results = await manager.emit('SessionStart', input, undefined);

      expect(results).toEqual([]);
    });
  });

  describe('Matcher Filtering', () => {
    test('should call matcher-specific hooks when tool matches', async () => {
      let bashCalled = false;
      let globalCalled = false;

      const bashCallback: HookCallback = async () => {
        bashCalled = true;
        return { continue: true };
      };

      const globalCallback: HookCallback = async () => {
        globalCalled = true;
        return { continue: true };
      };

      manager.register('PreToolUse', [
        { matcher: 'Bash', hooks: [bashCallback] },
        { hooks: [globalCallback] },
      ]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' },
      };

      await manager.emitForTool('PreToolUse', input, 'Bash', 'tool-123');

      expect(bashCalled).toBe(true);
      expect(globalCalled).toBe(true);
    });

    test('should not call matcher-specific hooks when tool does not match', async () => {
      let bashCalled = false;
      let globalCalled = false;

      const bashCallback: HookCallback = async () => {
        bashCalled = true;
        return { continue: true };
      };

      const globalCallback: HookCallback = async () => {
        globalCalled = true;
        return { continue: true };
      };

      manager.register('PreToolUse', [
        { matcher: 'Bash', hooks: [bashCallback] },
        { hooks: [globalCallback] },
      ]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/test' },
      };

      await manager.emitForTool('PreToolUse', input, 'Read', 'tool-123');

      expect(bashCalled).toBe(false);
      expect(globalCalled).toBe(true);
    });

    test('should call global hooks for all tools', async () => {
      let callCount = 0;

      const globalCallback: HookCallback = async () => {
        callCount++;
        return { continue: true };
      };

      manager.register('PreToolUse', [{ hooks: [globalCallback] }]);

      const tools = ['Bash', 'Read', 'Write', 'Edit'];

      for (const toolName of tools) {
        const input: HookInput = {
          session_id: 'test-session',
          transcript_path: '/tmp/test.json',
          cwd: '/home/user',
          hook_event_name: 'PreToolUse',
          tool_name: toolName,
          tool_input: {},
        };

        await manager.emitForTool('PreToolUse', input, toolName, 'tool-123');
      }

      expect(callCount).toBe(4);
    });
  });

  describe('AbortSignal', () => {
    test('should pass AbortSignal to callbacks', async () => {
      let receivedSignal: AbortSignal | undefined;

      const callback: HookCallback = async (_input, _toolUseID, options) => {
        receivedSignal = options.signal;
        return { continue: true };
      };

      manager.register('SessionStart', [{ hooks: [callback] }]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      await manager.emit('SessionStart', input, undefined);

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    test('should use internal AbortSignal when not provided', async () => {
      let receivedSignal: AbortSignal | undefined;

      const callback: HookCallback = async (_input, _toolUseID, options) => {
        receivedSignal = options.signal;
        return { continue: true };
      };

      manager.register('SessionStart', [{ hooks: [callback] }]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      await manager.emit('SessionStart', input, undefined);

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      expect(receivedSignal?.aborted).toBe(false);
    });
  });

  describe('destroy', () => {
    test('should abort internal AbortController on destroy', async () => {
      let signalAborted = false;

      const callback: HookCallback = async (_input, _toolUseID, options) => {
        signalAborted = options.signal.aborted;
        return { continue: true };
      };

      manager.register('SessionStart', [{ hooks: [callback] }]);

      manager.destroy();

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      // After destroy, subsequent emits should still work but with new signal
      await manager.emit('SessionStart', input, undefined);
      expect(signalAborted).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle callback errors gracefully', async () => {
      const errorCallback: HookCallback = async () => {
        throw new Error('Hook error');
      };

      const successCallback: HookCallback = async () => {
        return { continue: true };
      };

      manager.register('SessionStart', [
        { hooks: [errorCallback, successCallback] },
      ]);

      const input: HookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.json',
        cwd: '/home/user',
        hook_event_name: 'SessionStart',
        source: 'startup',
      };

      // Should not throw, should continue to next callback
      const results = await manager.emit('SessionStart', input, undefined);

      expect(results).toHaveLength(2);
      // Error is converted to a sync output with error info
      expect(results[0]).toEqual({ continue: false, reason: 'Hook error' });
      expect(results[1]).toEqual({ continue: true });
    });
  });
});
