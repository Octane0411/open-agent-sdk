/**
 * TaskCreate tool - Create a new task
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';
import { taskStorage } from './task-storage';

export interface TaskCreateInput {
  subject: string;
  description: string;
  activeForm?: string;
}

export interface TaskCreateOutput {
  message?: string;
  taskId?: string;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description: 'Task title in imperative form (e.g., "Run tests")',
    },
    description: {
      type: 'string',
      description: 'Detailed description with context and acceptance criteria',
    },
    activeForm: {
      type: 'string',
      description: 'Present continuous form shown when in_progress (e.g., "Running tests")',
    },
  },
  required: ['subject', 'description'],
};

export class TaskCreateTool implements Tool<TaskCreateInput, TaskCreateOutput> {
  name = 'TaskCreate';
  description = 'Create a new task with a subject, description, and optional active form.';
  parameters = parameters;

  handler = async (
    input: TaskCreateInput,
    _context: ToolContext
  ): Promise<TaskCreateOutput> => {
    const task = taskStorage.create({
      subject: input.subject,
      description: input.description,
      status: 'pending',
      activeForm: input.activeForm,
    });

    return {
      message: `Task #${task.id} created successfully: ${task.subject}`,
      taskId: task.id,
    };
  };
}

// Export singleton instance
export const taskCreateTool = new TaskCreateTool();
