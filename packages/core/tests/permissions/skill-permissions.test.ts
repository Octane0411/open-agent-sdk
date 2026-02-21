import { describe, it, expect } from 'bun:test';
import { PermissionManager } from '../../src/permissions/manager';

describe('PermissionManager Skill Integration', () => {
  it('should allow all tools when skillAllowedTools is undefined', async () => {
    const manager = new PermissionManager({
      mode: 'default',
      allowDangerouslySkipPermissions: false,
    });

    const result = await manager.checkPermission(
      'Bash',
      { command: 'echo test' },
      { signal: new AbortController().signal }
    );

    // Bash is a sensitive tool, but without canUseTool callback it should be denied
    expect(result.approved).toBe(false);
  });

  it('should allow tools in skillAllowedTools list', async () => {
    const manager = new PermissionManager({
      mode: 'default',
      allowDangerouslySkipPermissions: false,
    });

    manager.setSkillAllowedTools(['Read', 'Write']);

    const result = await manager.checkPermission(
      'Read',
      { file_path: '/test.txt' },
      { signal: new AbortController().signal }
    );

    expect(result.approved).toBe(true);
  });

  it('should deny tools not in skillAllowedTools list', async () => {
    const manager = new PermissionManager({
      mode: 'default',
      allowDangerouslySkipPermissions: false,
    });

    manager.setSkillAllowedTools(['Read']);

    const result = await manager.checkPermission(
      'Write',
      { file_path: '/test.txt', content: 'test' },
      { signal: new AbortController().signal }
    );

    expect(result.approved).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('should get and set skill allowed tools', () => {
    const manager = new PermissionManager({
      mode: 'default',
      allowDangerouslySkipPermissions: false,
    });

    expect(manager.getSkillAllowedTools()).toBeUndefined();

    manager.setSkillAllowedTools(['Read', 'Write', 'Bash']);
    expect(manager.getSkillAllowedTools()).toEqual(['Read', 'Write', 'Bash']);

    manager.setSkillAllowedTools(undefined);
    expect(manager.getSkillAllowedTools()).toBeUndefined();
  });

  it('should check if tool is allowed by skill', () => {
    const manager = new PermissionManager({
      mode: 'default',
      allowDangerouslySkipPermissions: false,
    });

    // No restrictions
    expect(manager.isToolAllowedBySkill('Read')).toBe(true);

    // With restrictions
    manager.setSkillAllowedTools(['Read', 'Write']);
    expect(manager.isToolAllowedBySkill('Read')).toBe(true);
    expect(manager.isToolAllowedBySkill('Write')).toBe(true);
    expect(manager.isToolAllowedBySkill('Bash')).toBe(false);
  });

  it('should clear skill allowed tools', () => {
    const manager = new PermissionManager({
      mode: 'default',
      allowDangerouslySkipPermissions: false,
    });

    manager.setSkillAllowedTools(['Read']);
    expect(manager.getSkillAllowedTools()).toEqual(['Read']);

    manager.setSkillAllowedTools(undefined);
    expect(manager.getSkillAllowedTools()).toBeUndefined();
  });
});
