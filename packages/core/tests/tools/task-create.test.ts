import { describe, it, expect, beforeEach } from 'bun:test';
import { TaskCreateTool } from '../../src/tools/task-create';
import { taskStorage } from '../../src/tools/task-storage';
import type { ToolContext } from '../../src/types/tools';

describe('TaskCreate Tool', () => {
  let tool: TaskCreateTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new TaskCreateTool();
    context = { cwd: '/tmp', env: {} };
    taskStorage.clear();
  });

  it('should create a task with required fields', async () => {
    const result = await tool.handler(
      {
        subject: 'Test task',
        description: 'This is a test task',
      },
      context
    );

    expect(result.error).toBeUndefined();
    expect(result.message).toBe('Task #1 created successfully: Test task');
    expect(result.taskId).toBe('1');
  });

  it('should create a task with optional activeForm', async () => {
    const result = await tool.handler(
      {
        subject: 'Run tests',
        description: 'Run all unit tests',
        activeForm: 'Running tests',
      },
      context
    );

    expect(result.error).toBeUndefined();
    expect(result.message).toContain('Run tests');

    // Verify the task was stored with activeForm
    const task = taskStorage.getById('1');
    expect(task?.activeForm).toBe('Running tests');
  });

  it('should auto-assign pending status', async () => {
    await tool.handler(
      {
        subject: 'Test task',
        description: 'Test description',
      },
      context
    );

    const task = taskStorage.getById('1');
    expect(task?.status).toBe('pending');
  });

  it('should set createdAt and updatedAt timestamps', async () => {
    const before = Date.now();
    await tool.handler(
      {
        subject: 'Test task',
        description: 'Test description',
      },
      context
    );
    const after = Date.now();

    const task = taskStorage.getById('1');
    expect(task?.createdAt).toBeGreaterThanOrEqual(before);
    expect(task?.createdAt).toBeLessThanOrEqual(after);
    expect(task?.updatedAt).toBe(task?.createdAt);
  });

  it('should create multiple tasks with incrementing IDs', async () => {
    const result1 = await tool.handler(
      { subject: 'First task', description: 'First' },
      context
    );
    const result2 = await tool.handler(
      { subject: 'Second task', description: 'Second' },
      context
    );

    expect(result1.taskId).toBe('1');
    expect(result2.taskId).toBe('2');
  });
});
