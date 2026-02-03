import { describe, it, expect, beforeEach } from 'bun:test';
import { TaskListTool } from '../../src/tools/task-list';
import { TaskCreateTool } from '../../src/tools/task-create';
import { TaskGetTool } from '../../src/tools/task-get';
import { TaskUpdateTool } from '../../src/tools/task-update';
import { taskStorage } from '../../src/tools/task-storage';
import type { ToolContext } from '../../src/types/tools';

describe('Task System Integration', () => {
  let context: ToolContext;

  beforeEach(() => {
    context = { cwd: '/tmp', env: {} };
    taskStorage.clear();
  });

  it('should perform full CRUD workflow', async () => {
    const listTool = new TaskListTool();
    const createTool = new TaskCreateTool();
    const getTool = new TaskGetTool();
    const updateTool = new TaskUpdateTool();

    // Step 1: List should show no tasks
    const list1 = await listTool.handler({}, context);
    expect(list1.tasks).toBe('No tasks found');

    // Step 2: Create a task
    const create1 = await createTool.handler(
      {
        subject: 'Implement feature',
        description: 'Implement the new feature',
        activeForm: 'Implementing feature',
      },
      context
    );
    expect(create1.taskId).toBe('1');
    expect(create1.message).toContain('Implement feature');

    // Step 3: List should show the task
    const list2 = await listTool.handler({}, context);
    expect(list2.tasks).toContain('#1 [pending] Implement feature');

    // Step 4: Get task details
    const get1 = await getTool.handler({ taskId: '1' }, context);
    expect(get1.task).toContain('Task #1: Implement feature');
    expect(get1.task).toContain('Status: pending');

    // Step 5: Update task status
    const update1 = await updateTool.handler(
      { taskId: '1', status: 'in_progress' },
      context
    );
    expect(update1.message).toBe('Updated task #1 status');

    // Step 6: Verify status change
    const get2 = await getTool.handler({ taskId: '1' }, context);
    expect(get2.task).toContain('Status: in_progress');

    // Step 7: Create another task
    const create2 = await createTool.handler(
      {
        subject: 'Write tests',
        description: 'Write unit tests',
      },
      context
    );
    expect(create2.taskId).toBe('2');

    // Step 8: List should show both tasks
    const list3 = await listTool.handler({}, context);
    expect(list3.tasks).toContain('#1 [in_progress] Implement feature');
    expect(list3.tasks).toContain('#2 [pending] Write tests');

    // Step 9: Mark first task as completed
    await updateTool.handler({ taskId: '1', status: 'completed' }, context);

    // Step 10: Verify completion
    const list4 = await listTool.handler({}, context);
    expect(list4.tasks).toContain('#1 [completed] Implement feature');
  });

  it('should handle task dependencies', async () => {
    const createTool = new TaskCreateTool();
    const updateTool = new TaskUpdateTool();

    // Create three tasks
    await createTool.handler(
      { subject: 'Task A', description: 'First task' },
      context
    );
    await createTool.handler(
      { subject: 'Task B', description: 'Second task' },
      context
    );
    await createTool.handler(
      { subject: 'Task C', description: 'Third task' },
      context
    );

    // Set up dependencies: Task C is blocked by Task A and Task B
    const update = await updateTool.handler(
      {
        taskId: '3',
        addBlockedBy: ['1', '2'],
      },
      context
    );
    expect(update.message).toContain('blockedBy');

    // Verify dependencies
    const task = taskStorage.getById('3');
    expect(task?.blockedBy).toEqual(['1', '2']);

    // Add more dependencies
    await updateTool.handler(
      {
        taskId: '3',
        addBlocks: ['1'],
      },
      context
    );

    const task2 = taskStorage.getById('3');
    expect(task2?.blocks).toEqual(['1']);
  });
});
