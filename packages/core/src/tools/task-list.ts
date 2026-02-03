/**
 * TaskList tool - List all tasks
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';
import { taskStorage } from './task-storage';

export interface TaskListInput {
  // No parameters
}

export interface TaskListOutput {
  tasks?: string;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {},
  required: [],
};

export class TaskListTool implements Tool<TaskListInput, TaskListOutput> {
  name = 'TaskList';
  description = 'List all tasks with their status and subject.';
  parameters = parameters;

  handler = async (
    _input: TaskListInput,
    _context: ToolContext
  ): Promise<TaskListOutput> => {
    const tasks = taskStorage.getAll();

    if (tasks.length === 0) {
      return { tasks: 'No tasks found' };
    }

    const formattedTasks = tasks
      .map((task) => `#${task.id} [${task.status}] ${task.subject}`)
      .join('\n');

    return { tasks: formattedTasks };
  };
}

// Export singleton instance
export const taskListTool = new TaskListTool();
