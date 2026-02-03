import { describe, it, expect, beforeEach } from 'bun:test';
import { TaskUpdateTool } from '../../src/tools/task-update';
import { taskStorage } from '../../src/tools/task-storage';
import type { ToolContext } from '../../src/types/tools';

describe('TaskUpdate Tool', () => {
  let tool: TaskUpdateTool;
  let context: ToolContext;

  beforeEach(() => {
    tool = new TaskUpdateTool();
    context = { cwd: '/tmp', env: {} };
    taskStorage.clear();
  });

  describe('basic updates', () => {
    beforeEach(() => {
      taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });
    });

    it('should update task status', async () => {
      const result = await tool.handler(
        { taskId: '1', status: 'in_progress' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.message).toBe('Updated task #1 status');

      const task = taskStorage.getById('1');
      expect(task?.status).toBe('in_progress');
    });

    it('should update task subject', async () => {
      const result = await tool.handler(
        { taskId: '1', subject: 'Updated subject' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.message).toBe('Updated task #1 subject');

      const task = taskStorage.getById('1');
      expect(task?.subject).toBe('Updated subject');
    });

    it('should update task description', async () => {
      const result = await tool.handler(
        { taskId: '1', description: 'Updated description' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.message).toBe('Updated task #1 description');

      const task = taskStorage.getById('1');
      expect(task?.description).toBe('Updated description');
    });

    it('should update activeForm', async () => {
      const result = await tool.handler(
        { taskId: '1', activeForm: 'Updating task' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.message).toBe('Updated task #1 activeForm');

      const task = taskStorage.getById('1');
      expect(task?.activeForm).toBe('Updating task');
    });

    it('should update owner', async () => {
      const result = await tool.handler(
        { taskId: '1', owner: 'new-owner' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.message).toBe('Updated task #1 owner');

      const task = taskStorage.getById('1');
      expect(task?.owner).toBe('new-owner');
    });

    it('should update multiple fields at once', async () => {
      const result = await tool.handler(
        {
          taskId: '1',
          status: 'completed',
          subject: 'All updated',
        },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.message).toBe('Updated task #1');

      const task = taskStorage.getById('1');
      expect(task?.status).toBe('completed');
      expect(task?.subject).toBe('All updated');
    });

    it('should update updatedAt timestamp', async () => {
      const before = Date.now();
      await new Promise((r) => setTimeout(r, 10)); // Small delay

      await tool.handler({ taskId: '1', status: 'in_progress' }, context);

      const task = taskStorage.getById('1');
      expect(task?.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('metadata handling', () => {
    beforeEach(() => {
      taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
        metadata: { key1: 'value1', key2: 'value2' },
      });
    });

    it('should merge metadata', async () => {
      await tool.handler(
        { taskId: '1', metadata: { key3: 'value3' } },
        context
      );

      const task = taskStorage.getById('1');
      expect(task?.metadata).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: 'value3',
      });
    });

    it('should allow deleting metadata keys by setting to null', async () => {
      await tool.handler(
        { taskId: '1', metadata: { key1: null } },
        context
      );

      const task = taskStorage.getById('1');
      expect(task?.metadata).toEqual({ key2: 'value2' });
    });

    it('should update existing metadata keys', async () => {
      await tool.handler(
        { taskId: '1', metadata: { key1: 'updated' } },
        context
      );

      const task = taskStorage.getById('1');
      expect(task?.metadata).toEqual({
        key1: 'updated',
        key2: 'value2',
      });
    });
  });

  describe('task dependencies', () => {
    beforeEach(() => {
      taskStorage.create({
        subject: 'Task 1',
        description: 'First task',
        status: 'pending',
        blockedBy: ['1'],
        blocks: ['2'],
      });
    });

    it('should add blockedBy relationships', async () => {
      await tool.handler(
        { taskId: '1', addBlockedBy: ['2', '3'] },
        context
      );

      const task = taskStorage.getById('1');
      expect(task?.blockedBy).toEqual(['1', '2', '3']);
    });

    it('should add blocks relationships', async () => {
      await tool.handler(
        { taskId: '1', addBlocks: ['3', '4'] },
        context
      );

      const task = taskStorage.getById('1');
      expect(task?.blocks).toEqual(['2', '3', '4']);
    });

    it('should prevent duplicates in blockedBy/blocks', async () => {
      await tool.handler(
        {
          taskId: '1',
          addBlockedBy: ['1', '2'],
          addBlocks: ['2', '3'],
        },
        context
      );

      const task = taskStorage.getById('1');
      expect(task?.blockedBy).toEqual(['1', '2']);
      expect(task?.blocks).toEqual(['2', '3']);
    });
  });

  describe('error handling', () => {
    it('should return error for non-existent task', async () => {
      const result = await tool.handler(
        { taskId: '999', status: 'completed' },
        context
      );

      expect(result.error).toBe('Task #999 not found');
      expect(result.message).toBeUndefined();
    });

    it('should return error for invalid status', async () => {
      taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });

      const result = await tool.handler(
        { taskId: '1', status: 'invalid_status' as any },
        context
      );

      expect(result.error).toBe('Invalid status: invalid_status');
    });
  });

  describe('status to deleted', () => {
    it('should mark task as deleted', async () => {
      taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });

      const result = await tool.handler(
        { taskId: '1', status: 'deleted' },
        context
      );

      expect(result.error).toBeUndefined();
      expect(result.message).toBe('Updated task #1 status');

      // Task should not appear in list but still be gettable by ID
      const allTasks = taskStorage.getAll();
      expect(allTasks.length).toBe(0);

      const task = taskStorage.getById('1');
      expect(task?.status).toBe('deleted');
    });
  });
});
