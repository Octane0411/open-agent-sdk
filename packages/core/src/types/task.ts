/**
 * Task type definitions for Task System
 */

/** Task status values */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';

/** Task data structure */
export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  activeForm?: string;
  owner?: string;
  metadata?: Record<string, unknown>;
  blockedBy?: string[];
  blocks?: string[];
  createdAt: number;
  updatedAt: number;
}

/** Task storage interface */
export interface TaskStorage {
  getAll(): Task[];
  getById(id: string): Task | undefined;
  create(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task;
  update(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | undefined;
  delete(id: string): boolean;
  clear(): void;
}
