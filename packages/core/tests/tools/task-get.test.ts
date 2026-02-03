import { describe, it, expect, beforeEach } from 'bun:test';
import { TaskGetTool } from '../../src/tools/task-get';
import { taskStorage } from '../../src/tools/task-storage';
import type { ToolContext } from '../../src/types/tools';

describe('TaskGet Tool', () => {
  let tool: TaskGetTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new TaskGetTool();
    context = { cwd: '/tmp', env: {} };
    taskStorage.clear();
  });

  it('should get task details by ID', async () => {
    taskStorage.create({
      subject: 'Test task',
      description: 'This is a test task description',
      status: 'pending',
      activeForm: 'Testing task',
      owner: 'test-agent',
    });

    const result = await tool.handler({ taskId: '1' }, context);

    expect(result.error).toBeUndefined();
    expect(result.task).toContain('Task #1: Test task');
    expect(result.task).toContain('Status: pending');
    expect(result.task).toContain('Description: This is a test task description');
    expect(result.task).toContain('Active Form: Testing task');
    expect(result.task).toContain('Owner: test-agent');
  });

  it('should return error for non-existent task', async () => {
    const result = await tool.handler({ taskId: '999' }, context);

    expect(result.error).toBe('Task #999 not found');
    expect(result.task).toBeUndefined();
  });

  it('should format task details correctly', async () => {
    taskStorage.create({
      subject: 'Complex task',
      description: 'A complex task with all fields',
      status: 'in_progress',
      activeForm: 'Working on complex task',
      owner: 'developer',
      metadata: { priority: 'high', tags: ['urgent'] },
      blockedBy: ['1'],
      blocks: ['3', '4'],
    });

    const result = await tool.handler({ taskId: '1' }, context);

    expect(result.task).toContain('Task #1: Complex task');
    expect(result.task).toContain('Status: in_progress');
    expect(result.task).toContain('Description: A complex task with all fields');
    expect(result.task).toContain('Active Form: Working on complex task');
    expect(result.task).toContain('Owner: developer');
  });
});
