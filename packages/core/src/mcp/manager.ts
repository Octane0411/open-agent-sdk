/**
 * MCP Manager
 * Wraps the official MCP SDK to manage multiple server connections
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
  McpServerConfig,
  McpServerStatus,
  McpTool,
  McpToolResult,
} from './types.js';
import { isStdioConfig, isHttpConfig, isSseConfig, isSdkConfig } from './types.js';
import { MCPConnectionError } from './errors.js';

/**
 * Manages multiple MCP server connections
 * Wraps the official MCP SDK Client and Transport classes
 */
export class McpManager {
  private clients = new Map<string, Client>();
  private transports = new Map<string, StdioClientTransport | StreamableHTTPClientTransport>();
  private statuses = new Map<string, McpServerStatus>();

  /**
   * Connect to an MCP server
   * Creates appropriate Transport and Client based on config type
   */
  async connect(name: string, config: McpServerConfig): Promise<void> {
    // Initialize status as pending
    this.statuses.set(name, {
      name,
      status: 'pending',
      tools: [],
    });

    try {
      let transport: StdioClientTransport | StreamableHTTPClientTransport;

      if (isStdioConfig(config)) {
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env,
        });
      } else if (isHttpConfig(config)) {
        // StreamableHTTPClientTransport options may vary by SDK version
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const httpOptions: any = {};
        if (config.headers) {
          httpOptions.headers = config.headers;
        }
        transport = new StreamableHTTPClientTransport(new URL(config.url), httpOptions);
      } else if (isSseConfig(config)) {
        throw new Error('SSE transport not yet implemented');
      } else if (isSdkConfig(config)) {
        throw new Error('SDK transport not yet implemented');
      } else {
        throw new Error(`Unknown MCP config type: ${(config as { type: string }).type}`);
      }

      const client = new Client({
        name: 'open-agent-sdk',
        version: '0.1.0',
      });

      await client.connect(transport);

      // Store client and transport
      this.clients.set(name, client);
      this.transports.set(name, transport);

      // Update status to connected
      this.statuses.set(name, {
        name,
        status: 'connected',
        tools: [],
      });

      // Fetch and store tools list
      try {
        const toolsResponse = await client.listTools();
        const tools = toolsResponse.tools.map((t: { name: string }) => t.name);
        this.statuses.set(name, {
          name,
          status: 'connected',
          tools,
        });
      } catch (error) {
        // Tools list not critical, just log
        console.warn(`Failed to list tools for MCP server "${name}":`, error);
      }
    } catch (error) {
      // Update status to failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.statuses.set(name, {
        name,
        status: 'failed',
        tools: [],
        error: errorMessage,
      });

      throw new MCPConnectionError(
        `Failed to connect to MCP server "${name}": ${errorMessage}`
      );
    }
  }

  /**
   * Disconnect all MCP servers
   */
  async disconnect(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
      } catch (error) {
        console.warn(`Error closing MCP client "${name}":`, error);
      }
    }

    this.clients.clear();
    this.transports.clear();
    // Keep statuses for reference
  }

  /**
   * Get a client by server name
   */
  getClient(name: string): Client | undefined {
    return this.clients.get(name);
  }

  /**
   * Get all server statuses
   */
  getAllStatuses(): McpServerStatus[] {
    return Array.from(this.statuses.values());
  }

  /**
   * Get status for a specific server
   */
  getStatus(name: string): McpServerStatus | undefined {
    return this.statuses.get(name);
  }

  /**
   * List tools from all connected servers
   * Returns a map of server name to tool list
   */
  async listAllTools(): Promise<Map<string, McpTool[]>> {
    const result = new Map<string, McpTool[]>();

    for (const [name, client] of this.clients) {
      try {
        const response = await client.listTools();
        result.set(name, response.tools as McpTool[]);
      } catch (error) {
        console.warn(`Failed to list tools for server "${name}":`, error);
        result.set(name, []);
      }
    }

    return result;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: unknown
  ): Promise<McpToolResult> {
    const client = this.clients.get(serverName);

    if (!client) {
      throw new Error(`MCP server "${serverName}" not found`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args as Record<string, unknown>,
    });

    return result as McpToolResult;
  }

  /**
   * Get all connected clients
   */
  getClients(): Map<string, Client> {
    return new Map(this.clients);
  }
}
