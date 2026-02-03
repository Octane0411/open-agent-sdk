/**
 * Task storage - in-memory storage for tasks
 */

import type { Task, TaskStorage, TaskStatus } from '../types/task';

// Module-level storage - persists for the lifetime of the process
const tasks = new Map<string, Task>();
let taskIdCounter = 0;

function generateTaskId(): string {
  return `${++taskIdCounter}`;
}

export const taskStorage: TaskStorage = {
  getAll(): Task[] {
    return Array.from(tasks.values())
      .filter((t) => t.status !== 'deleted')
      .sort((a, b) => a.createdAt - b.createdAt);
  },

  getById(id: string): Task | undefined {
    return tasks.get(id);
  },

  create(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const now = Date.now();
    const task: Task = {
      ...taskData,
      id: generateTaskId(),
      blockedBy: taskData.blockedBy ?? [],
      blocks: taskData.blocks ?? [],
      createdAt: now,
      updatedAt: now,
    };
    tasks.set(task.id, task);
    return task;
  },

  update(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>> & {
      addBlockedBy?: string[];
      addBlocks?: string[];
    }
  ): Task | undefined {
    const task = tasks.get(id);
    if (!task) return undefined;

    const now = Date.now();
    const updated: Task = {
      ...task,
      updatedAt: now,
    };

    // Handle basic field updates
    if (updates.status !== undefined) updated.status = updates.status as TaskStatus;
    if (updates.subject !== undefined) updated.subject = updates.subject;
    if (updates.description !== undefined) updated.description = updates.description;
    if (updates.activeForm !== undefined) updated.activeForm = updates.activeForm;
    if (updates.owner !== undefined) updated.owner = updates.owner;

    // Handle metadata merge
    if (updates.metadata) {
      updated.metadata = { ...task.metadata };
      for (const [key, value] of Object.entries(updates.metadata)) {
        if (value === null) {
          delete updated.metadata[key];
        } else {
          updated.metadata[key] = value;
        }
      }
    }

    // Handle blockedBy append
    if (updates.addBlockedBy && updates.addBlockedBy.length > 0) {
      updated.blockedBy = [...new Set([...(task.blockedBy ?? []), ...updates.addBlockedBy])];
    }

    // Handle blocks append
    if (updates.addBlocks && updates.addBlocks.length > 0) {
      updated.blocks = [...new Set([...(task.blocks ?? []), ...updates.addBlocks])];
    }

    tasks.set(id, updated);
    return updated;
  },

  delete(id: string): boolean {
    return tasks.delete(id);
  },

  clear(): void {
    tasks.clear();
    taskIdCounter = 0;
  },
};
