/**
 * Tool registry - manages available tools
 */

import type { Tool, ToolDefinition } from '../types/tools';
import { readTool, ReadTool } from './read';
import { writeTool, WriteTool } from './write';
import { editTool, EditTool } from './edit';
import { bashTool, BashTool } from './bash';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): Tool[] {
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

  getAllowedTools(allowedTools?: string[]): Tool[] {
    if (!allowedTools || allowedTools.length === 0) {
      return this.getAll();
    }
    return allowedTools
      .map((name) => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined);
  }
}

// Create default registry with built-in tools
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new ReadTool());
  registry.register(new WriteTool());
  registry.register(new EditTool());
  registry.register(new BashTool());
  return registry;
}

// Global default registry
export const defaultToolRegistry = createDefaultRegistry();

// Re-export tools
export { readTool, ReadTool } from './read';
export { writeTool, WriteTool } from './write';
export { editTool, EditTool } from './edit';
export { bashTool, BashTool } from './bash';
