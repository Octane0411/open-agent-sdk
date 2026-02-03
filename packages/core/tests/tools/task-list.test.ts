import { describe, it, expect, beforeEach } from 'bun:test';
import { TaskListTool } from '../../src/tools/task-list';
import { taskStorage } from '../../src/tools/task-storage';
import type { ToolContext } from '../../src/types/tools';

describe('TaskList Tool', () => {
  let tool: TaskListTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new TaskListTool();
    context = { cwd: '/tmp', env: {} };
    taskStorage.clear();
  });

  it('should return "No tasks found" when no tasks exist', async () => {
    const result = await tool.handler({}, context);

    expect(result.error).toBeUndefined();
    expect(result.tasks).toBe('No tasks found');
  });

  it('should list all tasks in formatted text', async () => {
    taskStorage.create({
      subject: 'First task',
      description: 'First description',
      status: 'pending',
    });
    taskStorage.create({
      subject: 'Second task',
      description: 'Second description',
      status: 'completed',
    });

    const result = await tool.handler({}, context);

    expect(result.error).toBeUndefined();
    expect(result.tasks).toContain('#1 [pending] First task');
    expect(result.tasks).toContain('#2 [completed] Second task');
  });

  it('should not include deleted tasks', async () => {
    const task = taskStorage.create({
      subject: 'Active task',
      description: 'Active description',
      status: 'pending',
    });
    taskStorage.create({
      subject: 'Deleted task',
      description: 'Deleted description',
      status: 'deleted',
    });

    const result = await tool.handler({}, context);

    expect(result.tasks).toContain('Active task');
    expect(result.tasks).not.toContain('Deleted task');
  });

  it('should sort tasks by creation time', async () => {
    taskStorage.create({
      subject: 'First created',
      description: 'First',
      status: 'pending',
    });
    taskStorage.create({
      subject: 'Second created',
      description: 'Second',
      status: 'pending',
    });
    taskStorage.create({
      subject: 'Third created',
      description: 'Third',
      status: 'in_progress',
    });

    const result = await tool.handler({}, context);

    // Tasks should appear in creation order
    const lines = result.tasks?.split('\n') ?? [];
    expect(lines[0]).toContain('#1 [pending] First created');
    expect(lines[1]).toContain('#2 [pending] Second created');
    expect(lines[2]).toContain('#3 [in_progress] Third created');
  });
});
