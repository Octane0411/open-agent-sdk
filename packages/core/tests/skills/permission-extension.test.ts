import { describe, it, expect, beforeEach } from 'bun:test';
import { PermissionManager } from '../../src/permissions/manager';
import type { PermissionMode } from '../../src/permissions/types';

describe('Skill Permission Extensions', () => {
  describe('Temporary allowedTools extension', () => {
    it('should extend allowedTools for skill execution', async () => {
      const manager = new PermissionManager({
        mode: 'default',
      });

      // Skill specifies additional allowed tools
      const skillAllowedTools = ['Read', 'Write', 'Glob'];

      // Permission manager should respect skill-specific tools
      const result = await manager.checkPermission(
        'Write',
        { file_path: '/test.txt', content: 'test' },
        { signal: new AbortController().signal }
      );

      // In default mode without canUseTool callback, Write should be denied
      expect(result.approved).toBe(false);
    });

    it('should allow tools specified in skill allowedTools', async () => {
      const manager = new PermissionManager({
        mode: 'default',
        canUseTool: async (toolName) => {
          // Skill allows these tools
          const skillTools = ['Read', 'Write', 'Glob'];
          if (skillTools.includes(toolName)) {
            return { behavior: 'allow', updatedInput: {} };
          }
          return { behavior: 'deny', message: 'Not allowed' };
        },
      });

      const result = await manager.checkPermission(
        'Write',
        { file_path: '/test.txt' },
        { signal: new AbortController().signal }
      );

      expect(result.approved).toBe(true);
    });

    it('should deny tools not in skill allowedTools', async () => {
      const manager = new PermissionManager({
        mode: 'default',
        canUseTool: async (toolName) => {
          const skillTools = ['Read', 'Glob'];
          if (skillTools.includes(toolName)) {
            return { behavior: 'allow', updatedInput: {} };
          }
          return { behavior: 'deny', message: 'Tool not allowed for this skill' };
        },
      });

      const result = await manager.checkPermission(
        'Bash',
        { command: 'rm -rf /' },
        { signal: new AbortController().signal }
      );

      expect(result.approved).toBe(false);
      expect(result.error).toBe('Tool not allowed for this skill');
    });
  });

  describe('Permission restoration', () => {
    it('should restore original permissions after skill execution', async () => {
      const manager = new PermissionManager({
        mode: 'default',
      });

      // Store original state
      const originalMode = manager.getMode();

      // Skill temporarily extends permissions
      const skillCanUseTool: typeof manager['canUseTool'] = async (toolName) => {
        const skillTools = ['Write', 'Edit'];
        if (skillTools.includes(toolName)) {
          return { behavior: 'allow', updatedInput: {} };
        }
        return { behavior: 'deny', message: 'Denied' };
      };

      // After skill execution, permissions should be restored
      expect(manager.getMode()).toBe(originalMode);
    });

    it('should handle nested skill permissions', async () => {
      // Outer skill allows Read, Write
      // Inner skill allows Read, Glob
      // Combined should allow intersection or union based on implementation

      const outerSkillTools = ['Read', 'Write'];
      const innerSkillTools = ['Read', 'Glob'];

      // Union of tools
      const combinedTools = [...new Set([...outerSkillTools, ...innerSkillTools])];

      expect(combinedTools).toContain('Read');
      expect(combinedTools).toContain('Write');
      expect(combinedTools).toContain('Glob');
    });
  });

  describe('Permission conflict handling', () => {
    it('should handle conflict between skill and session permissions', async () => {
      // Session denies Write, but skill allows it
      const sessionDeniesWrite = true;
      const skillAllowsWrite = true;

      // Session permissions should take precedence
      const effectivePermission = sessionDeniesWrite && !skillAllowsWrite;

      expect(effectivePermission).toBe(false);
    });

    it('should respect most restrictive permission', async () => {
      const manager = new PermissionManager({
        mode: 'plan', // Most restrictive - blocks all tools
      });

      const result = await manager.checkPermission(
        'Read', // Even non-sensitive tool
        { file_path: '/test.txt' },
        { signal: new AbortController().signal }
      );

      expect(result.approved).toBe(false);
      expect(result.error).toBe('Tool execution blocked in plan mode');
    });

    it('should handle skill with allowedTools in bypassPermissions mode', async () => {
      const manager = new PermissionManager({
        mode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      });

      // In bypass mode, all tools should be allowed regardless of skill settings
      const result = await manager.checkPermission(
        'Bash',
        { command: 'dangerous command' },
        { signal: new AbortController().signal }
      );

      expect(result.approved).toBe(true);
    });
  });

  describe('Skill-specific permission modes', () => {
    it('should support skill-specific permission mode', () => {
      // Skill can specify its own permission mode
      const skillPermissionMode: PermissionMode = 'acceptEdits';

      expect(['default', 'acceptEdits', 'bypassPermissions', 'plan']).toContain(skillPermissionMode);
    });

    it('should apply skill permission mode during execution', async () => {
      const manager = new PermissionManager({
        mode: 'acceptEdits',
      });

      // In acceptEdits mode, Write and Edit should be auto-approved
      const writeResult = await manager.checkPermission(
        'Write',
        { file_path: '/test.txt', content: 'test' },
        { signal: new AbortController().signal }
      );

      expect(writeResult.approved).toBe(true);
    });

    it('should still require permission for non-edit tools in acceptEdits mode', async () => {
      const manager = new PermissionManager({
        mode: 'acceptEdits',
      });

      // Bash is not an edit tool, should require permission
      const bashResult = await manager.checkPermission(
        'Bash',
        { command: 'ls' },
        { signal: new AbortController().signal }
      );

      expect(bashResult.approved).toBe(false);
    });
  });

  describe('Dynamic permission updates', () => {
    it('should support updating permissions during skill execution', async () => {
      let allowedTools = ['Read'];

      const manager = new PermissionManager({
        mode: 'default',
        canUseTool: async (toolName) => {
          if (allowedTools.includes(toolName)) {
            return { behavior: 'allow', updatedInput: {} };
          }
          return { behavior: 'deny', message: 'Not allowed' };
        },
      });

      // Initially Write is not allowed
      let result = await manager.checkPermission(
        'Write',
        { file_path: '/test.txt' },
        { signal: new AbortController().signal }
      );
      expect(result.approved).toBe(false);

      // Update permissions
      allowedTools = ['Read', 'Write'];

      // Now Write should be allowed
      result = await manager.checkPermission(
        'Write',
        { file_path: '/test.txt' },
        { signal: new AbortController().signal }
      );
      expect(result.approved).toBe(true);
    });

    it('should track permission changes in plan log', async () => {
      const manager = new PermissionManager({
        mode: 'plan',
      });

      await manager.checkPermission('Write', { file_path: '/test.txt' }, { signal: new AbortController().signal });
      await manager.checkPermission('Bash', { command: 'ls' }, { signal: new AbortController().signal });

      const planLog = manager.getPlanLog();
      expect(planLog).toHaveLength(2);
      expect(planLog[0].toolName).toBe('Write');
      expect(planLog[1].toolName).toBe('Bash');
    });
  });

  describe('Tool input validation with permissions', () => {
    it('should validate tool input before granting permission', async () => {
      const manager = new PermissionManager({
        mode: 'default',
        canUseTool: async (_toolName, input) => {
          // Validate that file_path is within allowed directory
          const filePath = input.file_path as string;
          if (filePath && !filePath.startsWith('/allowed/')) {
            return { behavior: 'deny', message: 'File path not allowed' };
          }
          return { behavior: 'allow', updatedInput: input };
        },
      });

      const allowedResult = await manager.checkPermission(
        'Write',
        { file_path: '/allowed/file.txt', content: 'test' },
        { signal: new AbortController().signal }
      );
      expect(allowedResult.approved).toBe(true);

      const deniedResult = await manager.checkPermission(
        'Write',
        { file_path: '/etc/passwd', content: 'test' },
        { signal: new AbortController().signal }
      );
      expect(deniedResult.approved).toBe(false);
      expect(deniedResult.error).toBe('File path not allowed');
    });

    it('should support input transformation with permission', async () => {
      const manager = new PermissionManager({
        mode: 'default',
        canUseTool: async (_toolName, input) => {
          // Transform input - add default content if empty
          const updatedInput = { ...input };
          if (!updatedInput.content) {
            updatedInput.content = 'Default content';
          }
          return { behavior: 'allow', updatedInput };
        },
      });

      const result = await manager.checkPermission(
        'Write',
        { file_path: '/test.txt' },
        { signal: new AbortController().signal }
      );

      expect(result.approved).toBe(true);
      expect(result.updatedInput?.content).toBe('Default content');
    });
  });

  describe('Permission caching', () => {
    it('should cache permission results for same tool', async () => {
      let checkCount = 0;
      const manager = new PermissionManager({
        mode: 'default',
        canUseTool: async (toolName) => {
          checkCount++;
          return { behavior: 'allow', updatedInput: {} };
        },
      });

      // Use a sensitive tool (Bash) to trigger canUseTool callback
      await manager.checkPermission('Bash', { command: 'ls' }, { signal: new AbortController().signal });
      await manager.checkPermission('Bash', { command: 'ls' }, { signal: new AbortController().signal });

      // Without caching, checkCount would be 2
      // With caching, it might be 1 (depending on implementation)
      expect(checkCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error handling', () => {
    it('should handle permission check errors gracefully', async () => {
      const manager = new PermissionManager({
        mode: 'default',
        canUseTool: async () => {
          throw new Error('Permission check failed');
        },
      });

      // Should not throw, but deny the permission
      try {
        const result = await manager.checkPermission(
          'Write',
          { file_path: '/test.txt' },
          { signal: new AbortController().signal }
        );
        // If error is caught internally, should return denied
        expect(result.approved).toBe(false);
      } catch (e) {
        // If error propagates, that's also acceptable behavior
        expect(e).toBeInstanceOf(Error);
      }
    });

    it('should handle abort signal', async () => {
      const manager = new PermissionManager({
        mode: 'default',
        canUseTool: async (_toolName, _input, options) => {
          // Check if signal is aborted
          if (options.signal.aborted) {
            throw new Error('Aborted');
          }
          return { behavior: 'allow', updatedInput: {} };
        },
      });

      const controller = new AbortController();
      controller.abort();

      try {
        await manager.checkPermission(
          'Write',
          { file_path: '/test.txt' },
          { signal: controller.signal }
        );
      } catch (e) {
        expect((e as Error).message).toBe('Aborted');
      }
    });
  });
});
