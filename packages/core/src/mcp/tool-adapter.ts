/**
 * MCP Tool Adapter
 * Converts MCP tool format to Open Agent SDK tool format
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpTool, McpToolResult } from './types.js';
import type { Tool, ToolContext, JSONSchema } from '../types/tools.js';

/**
 * Adapts MCP tools to SDK tool format
 */
export class McpToolAdapter {
  private prefixSeparator = '_';

  constructor(
    private serverName: string,
    private client: Client
  ) {}

  /**
   * Generate prefixed tool name to avoid conflicts
   * Format: mcp_<server>_<tool>
   */
  getPrefixedName(toolName: string): string {
    return `mcp${this.prefixSeparator}${this.serverName}${this.prefixSeparator}${toolName}`;
  }

  /**
   * Convert MCP tool to SDK Tool format
   */
  toSdkTool(mcpTool: McpTool): Tool {
    const prefixedName = this.getPrefixedName(mcpTool.name);
    const description = `[MCP:${this.serverName}] ${mcpTool.description || ''}`;

    // Convert JSON schema to SDK format
    const parameters: JSONSchema = mcpTool.inputSchema
      ? this.convertSchema(mcpTool.inputSchema)
      : { type: 'object', properties: {} };

    return {
      name: prefixedName,
      description,
      parameters,
      handler: this.createHandler(mcpTool.name),
    };
  }

  /**
   * Create tool execution handler
   */
  private createHandler(originalToolName: string) {
    return async (input: unknown, _context: ToolContext): Promise<McpToolResult> => {
      const result = await this.client.callTool({
        name: originalToolName,
        arguments: input as Record<string, unknown>,
      });

      return result as McpToolResult;
    };
  }

  /**
   * Convert JSON schema to SDK JSONSchema format
   */
  private convertSchema(schema: unknown): JSONSchema {
    // Default schema if conversion fails
    const defaultSchema: JSONSchema = {
      type: 'object',
      properties: {},
    };

    if (!schema || typeof schema !== 'object') {
      return defaultSchema;
    }

    const s = schema as Record<string, unknown>;

    // Ensure type is 'object'
    if (s.type !== 'object') {
      return defaultSchema;
    }

    return {
      type: 'object',
      properties: (s.properties as Record<string, unknown>) || {},
      required: Array.isArray(s.required) ? s.required : undefined,
      additionalProperties: s.additionalProperties as boolean | undefined,
    };
  }

  /**
   * Get server name
   */
  getServerName(): string {
    return this.serverName;
  }

  /**
   * Get client
   */
  getClient(): Client {
    return this.client;
  }
}
