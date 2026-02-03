/**
 * TaskGet tool - Get task details by ID
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';
import { taskStorage } from './task-storage';

export interface TaskGetInput {
  taskId: string;
}

export interface TaskGetOutput {
  task?: string;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      description: 'Task ID to retrieve',
    },
  },
  required: ['taskId'],
};

export class TaskGetTool implements Tool<TaskGetInput, TaskGetOutput> {
  name = 'TaskGet';
  description = 'Get the full details of a specific task by its ID.';
  parameters = parameters;

  handler = async (
    input: TaskGetInput,
    _context: ToolContext
  ): Promise<TaskGetOutput> => {
    const task = taskStorage.getById(input.taskId);

    if (!task) {
      return { error: `Task #${input.taskId} not found` };
    }

    let formattedTask = `Task #${task.id}: ${task.subject}\n`;
    formattedTask += `Status: ${task.status}\n`;
    formattedTask += `Description: ${task.description}`;

    if (task.activeForm) {
      formattedTask += `\nActive Form: ${task.activeForm}`;
    }

    if (task.owner) {
      formattedTask += `\nOwner: ${task.owner}`;
    }

    return { task: formattedTask };
  };
}

// Export singleton instance
export const taskGetTool = new TaskGetTool();
