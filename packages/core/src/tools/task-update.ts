/**
 * TaskUpdate tool - Update task properties
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';
import type { TaskStatus } from '../types/task';
import { taskStorage } from './task-storage';

export interface TaskUpdateInput {
  taskId: string;
  status?: TaskStatus;
  subject?: string;
  description?: string;
  activeForm?: string;
  owner?: string;
  metadata?: Record<string, unknown>;
  addBlockedBy?: string[];
  addBlocks?: string[];
}

export interface TaskUpdateOutput {
  message?: string;
  error?: string;
}

const VALID_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed', 'deleted'];

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      description: 'Task ID to update',
    },
    status: {
      type: 'string',
      enum: ['pending', 'in_progress', 'completed', 'deleted'],
      description: 'New task status',
    },
    subject: {
      type: 'string',
      description: 'New task title',
    },
    description: {
      type: 'string',
      description: 'New task description',
    },
    activeForm: {
      type: 'string',
      description: 'New present continuous form text',
    },
    owner: {
      type: 'string',
      description: 'Task owner/agent name',
    },
    metadata: {
      type: 'object',
      description: 'Metadata to merge (set key to null to delete)',
    },
    addBlockedBy: {
      type: 'array',
      items: { type: 'string' },
      description: 'Task IDs that block this task',
    },
    addBlocks: {
      type: 'array',
      items: { type: 'string' },
      description: 'Task IDs that are blocked by this task',
    },
  },
  required: ['taskId'],
};

export class TaskUpdateTool implements Tool<TaskUpdateInput, TaskUpdateOutput> {
  name = 'TaskUpdate';
  description = 'Update a task\'s status, subject, description, or other properties.';
  parameters = parameters;

  handler = async (
    input: TaskUpdateInput,
    _context: ToolContext
  ): Promise<TaskUpdateOutput> => {
    // Check if task exists
    const existingTask = taskStorage.getById(input.taskId);
    if (!existingTask) {
      return { error: `Task #${input.taskId} not found` };
    }

    // Validate status if provided
    if (input.status && !VALID_STATUSES.includes(input.status)) {
      return { error: `Invalid status: ${input.status}` };
    }

    // Build update object
    const updates: Parameters<typeof taskStorage.update>[1] & {
      addBlockedBy?: string[];
      addBlocks?: string[];
    } = {};
    const updatedFields: string[] = [];

    if (input.status !== undefined) {
      updates.status = input.status;
      updatedFields.push('status');
    }
    if (input.subject !== undefined) {
      updates.subject = input.subject;
      updatedFields.push('subject');
    }
    if (input.description !== undefined) {
      updates.description = input.description;
      updatedFields.push('description');
    }
    if (input.activeForm !== undefined) {
      updates.activeForm = input.activeForm;
      updatedFields.push('activeForm');
    }
    if (input.owner !== undefined) {
      updates.owner = input.owner;
      updatedFields.push('owner');
    }
    if (input.metadata !== undefined) {
      updates.metadata = input.metadata;
      updatedFields.push('metadata');
    }
    if (input.addBlockedBy !== undefined && input.addBlockedBy.length > 0) {
      updates.addBlockedBy = input.addBlockedBy;
      updatedFields.push('blockedBy');
    }
    if (input.addBlocks !== undefined && input.addBlocks.length > 0) {
      updates.addBlocks = input.addBlocks;
      updatedFields.push('blocks');
    }

    // Apply updates
    taskStorage.update(input.taskId, updates);

    // Build success message
    let message: string;
    if (updatedFields.length === 0) {
      message = `No changes made to task #${input.taskId}`;
    } else if (updatedFields.length === 1) {
      message = `Updated task #${input.taskId} ${updatedFields[0]}`;
    } else {
      message = `Updated task #${input.taskId}`;
    }

    return { message };
  };
}

// Export singleton instance
export const taskUpdateTool = new TaskUpdateTool();
