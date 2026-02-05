/**
 * Tool registry - manages available tools
 */

import type { Tool, ToolDefinition } from '../types/tools';
import { ReadTool } from './read';
import { WriteTool } from './write';
import { EditTool } from './edit';
import { BashTool } from './bash';
import { GlobTool } from './glob';
import { GrepTool } from './grep';
import { TaskListTool } from './task-list';
import { TaskCreateTool } from './task-create';
import { TaskGetTool } from './task-get';
import { TaskUpdateTool } from './task-update';
import { WebSearchTool } from './web-search';
import { WebFetchTool } from './web-fetch';

export class ToolRegistry {
  private tools = new Map<string, Tool<any, any>>();

  register(tool: Tool<any, any>): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): Tool<any, any> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): Tool<any, any>[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): ToolDefinition[] {
    return this.getAll().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  getAllowedTools(allowedTools?: string[]): Tool<any, any>[] {
    if (!allowedTools || allowedTools.length === 0) {
      return this.getAll();
    }
    return allowedTools
      .map((name) => this.tools.get(name))
      .filter((tool): tool is Tool<any, any> => tool !== undefined);
  }
}

// Create default registry with built-in tools
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new ReadTool());
  registry.register(new WriteTool());
  registry.register(new EditTool());
  registry.register(new BashTool());
  registry.register(new GlobTool());
  registry.register(new GrepTool());
  registry.register(new TaskListTool());
  registry.register(new TaskCreateTool());
  registry.register(new TaskGetTool());
  registry.register(new TaskUpdateTool());
  registry.register(new WebSearchTool());
  registry.register(new WebFetchTool());
  return registry;
}

// Global default registry with specific tool types
export const defaultToolRegistry = createDefaultRegistry();

// Re-export tools
export { readTool, ReadTool } from './read';
export { writeTool, WriteTool } from './write';
export { editTool, EditTool } from './edit';
export { bashTool, BashTool } from './bash';
export { globTool, GlobTool } from './glob';
export { grepTool, GrepTool } from './grep';
export { taskListTool, TaskListTool } from './task-list';
export { taskCreateTool, TaskCreateTool } from './task-create';
export { taskGetTool, TaskGetTool } from './task-get';
export { taskUpdateTool, TaskUpdateTool } from './task-update';
export { webSearchTool, WebSearchTool } from './web-search';
export { webFetchTool, WebFetchTool } from './web-fetch';
