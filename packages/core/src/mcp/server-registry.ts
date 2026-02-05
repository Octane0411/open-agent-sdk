/**
 * MCP Server Registry
 * Manages registration of MCP tools to SDK ToolRegistry
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ToolRegistry } from '../tools/registry.js';
import { McpToolAdapter } from './tool-adapter.js';
import type { McpTool } from './types.js';

/**
 * Manages registration of MCP server tools to SDK ToolRegistry
 */
export class McpServerRegistry {
  private registeredTools = new Map<string, Set<string>>(); // serverName -> Set of tool names

  constructor(private toolRegistry: ToolRegistry) {}

  /**
   * Register all tools from an MCP server
   * Returns list of registered tool names (with prefixes)
   */
  async registerServer(name: string, client: Client): Promise<string[]> {
    const adapter = new McpToolAdapter(name, client);
    const registeredNames: string[] = [];

    try {
      // Fetch tools from MCP server
      const response = await client.listTools();
      const tools = (response.tools as McpTool[]) || [];

      // Track tools for this server
      const serverTools = new Set<string>();

      for (const tool of tools) {
        // Convert to SDK tool format
        const sdkTool = adapter.toSdkTool(tool);

        // Register with ToolRegistry
        this.toolRegistry.register(sdkTool);

        // Track the registered tool
        serverTools.add(sdkTool.name);
        registeredNames.push(sdkTool.name);
      }

      // Store tracking info
      this.registeredTools.set(name, serverTools);

      return registeredNames;
    } catch (error) {
      console.warn(`Failed to register MCP server "${name}" tools:`, error);
      return [];
    }
  }

  /**
   * Unregister all tools from a server
   */
  unregisterServer(name: string): void {
    const serverTools = this.registeredTools.get(name);

    if (!serverTools) {
      return; // Server not registered
    }

    // Unregister each tool from ToolRegistry
    for (const toolName of serverTools) {
      this.toolRegistry.unregister(toolName);
    }

    // Remove tracking
    this.registeredTools.delete(name);
  }

  /**
   * Check if a tool name is an MCP tool
   */
  isMcpTool(toolName: string): boolean {
    // Check if it's in our tracking
    for (const serverTools of this.registeredTools.values()) {
      if (serverTools.has(toolName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Parse MCP tool name to extract server and tool name
   * Format: mcp_<server>_<tool>
   */
  parseMcpToolName(prefixedName: string): { serverName: string; toolName: string } | null {
    if (!prefixedName.startsWith('mcp_')) {
      return null;
    }

    const parts = prefixedName.slice(4).split('_'); // Remove 'mcp_' prefix

    if (parts.length < 2) {
      return null; // Need at least server name and tool name
    }

    const serverName = parts[0];
    const toolName = parts.slice(1).join('_');

    if (!serverName || !toolName) {
      return null;
    }

    return { serverName, toolName };
  }

  /**
   * Get server name for a registered MCP tool
   */
  getServerForTool(toolName: string): string | null {
    const parsed = this.parseMcpToolName(toolName);
    if (!parsed) {
      return null;
    }

    // Verify it's actually registered
    const serverTools = this.registeredTools.get(parsed.serverName);
    if (serverTools && serverTools.has(toolName)) {
      return parsed.serverName;
    }

    return null;
  }

  /**
   * Get all registered server names
   */
  getRegisteredServers(): string[] {
    return Array.from(this.registeredTools.keys());
  }

  /**
   * Get tools registered for a specific server
   */
  getServerTools(serverName: string): string[] {
    const tools = this.registeredTools.get(serverName);
    return tools ? Array.from(tools) : [];
  }
}
