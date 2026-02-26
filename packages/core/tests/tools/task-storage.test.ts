import { describe, it, expect, beforeEach } from 'bun:test';
import { taskStorage } from '../../src/tools/task-storage';

describe('TaskStorage', () => {
  beforeEach(() => {
    taskStorage.clear();
  });

  describe('create', () => {
    it('should create a task with required fields', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });

      expect(task.id).toBe('1');
      expect(task.subject).toBe('Test task');
      expect(task.description).toBe('Test description');
      expect(task.status).toBe('pending');
      expect(typeof task.createdAt).toBe('number');
      expect(typeof task.updatedAt).toBe('number');
      expect(task.createdAt).toBeGreaterThan(0);
      expect(task.updatedAt).toBeGreaterThan(0);
    });

    it('should create a task with all optional fields', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'in_progress',
        activeForm: 'Testing task',
        owner: 'test-agent',
        metadata: { priority: 'high' },
        blockedBy: ['1'],
        blocks: ['3'],
      });

      expect(task.activeForm).toBe('Testing task');
      expect(task.owner).toBe('test-agent');
      expect(task.metadata).toEqual({ priority: 'high' });
      expect(task.blockedBy).toEqual(['1']);
      expect(task.blocks).toEqual(['3']);
    });

    it('should auto-increment task IDs', () => {
      const task1 = taskStorage.create({
        subject: 'Task 1',
        description: 'Description 1',
        status: 'pending',
      });
      const task2 = taskStorage.create({
        subject: 'Task 2',
        description: 'Description 2',
        status: 'pending',
      });

      expect(task1.id).toBe('1');
      expect(task2.id).toBe('2');
    });
  });

  describe('getAll', () => {
    it('should return empty array when no tasks exist', () => {
      const tasks = taskStorage.getAll();
      expect(tasks).toEqual([]);
    });

    it('should return all non-deleted tasks', () => {
      taskStorage.create({ subject: 'Task 1', description: 'Desc 1', status: 'pending' });
      taskStorage.create({ subject: 'Task 2', description: 'Desc 2', status: 'completed' });

      const tasks = taskStorage.getAll();
      expect(tasks.length).toBe(2);
    });

    it('should not include deleted tasks', () => {
      const task = taskStorage.create({
        subject: 'Task 1',
        description: 'Desc 1',
        status: 'pending',
      });
      taskStorage.update(task.id, { status: 'deleted' });

      const tasks = taskStorage.getAll();
      expect(tasks.length).toBe(0);
    });

    it('should sort tasks by creation time', () => {
      taskStorage.create({ subject: 'Task 1', description: 'Desc 1', status: 'pending' });
      taskStorage.create({ subject: 'Task 2', description: 'Desc 2', status: 'pending' });
      taskStorage.create({ subject: 'Task 3', description: 'Desc 3', status: 'pending' });

      const tasks = taskStorage.getAll();
      expect(tasks[0].subject).toBe('Task 1');
      expect(tasks[1].subject).toBe('Task 2');
      expect(tasks[2].subject).toBe('Task 3');
    });
  });

  describe('getById', () => {
    it('should return task by ID', () => {
      const created = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });

      const found = taskStorage.getById(created.id);
      expect(found).toEqual(created);
      expect(found?.subject).toBe('Test task');
    });

    it('should return undefined for non-existent task', () => {
      const found = taskStorage.getById('999');
      expect(found).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update task status', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });

      const updated = taskStorage.update(task.id, { status: 'in_progress' });
      expect(updated?.status).toBe('in_progress');
    });

    it('should update task subject', () => {
      const task = taskStorage.create({
        subject: 'Old subject',
        description: 'Test description',
        status: 'pending',
      });

      const updated = taskStorage.update(task.id, { subject: 'New subject' });
      expect(updated?.subject).toBe('New subject');
    });

    it('should update task description', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Old description',
        status: 'pending',
      });

      const updated = taskStorage.update(task.id, { description: 'New description' });
      expect(updated?.description).toBe('New description');
    });

    it('should update activeForm', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
        activeForm: 'Old form',
      });

      const updated = taskStorage.update(task.id, { activeForm: 'New form' });
      expect(updated?.activeForm).toBe('New form');
    });

    it('should update owner', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });

      const updated = taskStorage.update(task.id, { owner: 'new-owner' });
      expect(updated?.owner).toBe('new-owner');
    });

    it('should merge metadata', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
        metadata: { key1: 'value1' },
      });

      const updated = taskStorage.update(task.id, { metadata: { key2: 'value2' } });
      expect(updated?.metadata).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should allow deleting metadata keys by setting to null', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
        metadata: { key1: 'value1', key2: 'value2' },
      });

      const updated = taskStorage.update(task.id, { metadata: { key1: null } });
      expect(updated?.metadata).toEqual({ key2: 'value2' });
    });

    it('should add blockedBy relationships', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
        blockedBy: ['1'],
      });

      const updated = taskStorage.update(task.id, { addBlockedBy: ['2', '3'] });
      expect(updated?.blockedBy).toEqual(['1', '2', '3']);
    });

    it('should add blocks relationships', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
        blocks: ['1'],
      });

      const updated = taskStorage.update(task.id, { addBlocks: ['2', '3'] });
      expect(updated?.blocks).toEqual(['1', '2', '3']);
    });

    it('should prevent duplicates in blockedBy/blocks', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
        blockedBy: ['1'],
        blocks: ['2'],
      });

      const updated = taskStorage.update(task.id, {
        addBlockedBy: ['1', '2'],
        addBlocks: ['2', '3'],
      });
      expect(updated?.blockedBy).toEqual(['1', '2']);
      expect(updated?.blocks).toEqual(['2', '3']);
    });

    it('should update updatedAt timestamp', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });

      const originalUpdatedAt = task.updatedAt;
      // Small delay to ensure timestamp changes
      const updated = taskStorage.update(task.id, { status: 'in_progress' });
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });

    it('should not modify createdAt', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });

      const originalCreatedAt = task.createdAt;
      const updated = taskStorage.update(task.id, { status: 'in_progress' });
      expect(updated?.createdAt).toBe(originalCreatedAt);
    });

    it('should return undefined for non-existent task', () => {
      const updated = taskStorage.update('999', { status: 'completed' });
      expect(updated).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete task by ID', () => {
      const task = taskStorage.create({
        subject: 'Test task',
        description: 'Test description',
        status: 'pending',
      });

      const deleted = taskStorage.delete(task.id);
      expect(deleted).toBe(true);
      expect(taskStorage.getById(task.id)).toBeUndefined();
    });

    it('should return false for non-existent task', () => {
      const deleted = taskStorage.delete('999');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all tasks', () => {
      taskStorage.create({ subject: 'Task 1', description: 'Desc 1', status: 'pending' });
      taskStorage.create({ subject: 'Task 2', description: 'Desc 2', status: 'pending' });

      taskStorage.clear();
      expect(taskStorage.getAll()).toEqual([]);
    });

    it('should reset task ID counter', () => {
      taskStorage.create({ subject: 'Task 1', description: 'Desc 1', status: 'pending' });
      taskStorage.clear();

      const newTask = taskStorage.create({
        subject: 'New task',
        description: 'New description',
        status: 'pending',
      });
      expect(newTask.id).toBe('1');
    });
  });
});
