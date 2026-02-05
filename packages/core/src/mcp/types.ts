/**
 * MCP (Model Context Protocol) type definitions
 * Aligned with Claude Agent SDK
 */

/** stdio transport configuration */
export interface McpStdioServerConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** HTTP transport configuration */
export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

/** SSE transport configuration */
export interface McpSSEServerConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

/** SDK transport configuration (direct instance) */
export interface McpSdkServerConfig {
  type: 'sdk';
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any; // McpServer from @modelcontextprotocol/sdk
}

/** Union type for all MCP server configurations */
export type McpServerConfig =
  | McpStdioServerConfig
  | McpHttpServerConfig
  | McpSSEServerConfig
  | McpSdkServerConfig;

/** Configuration map for multiple MCP servers */
export type McpServersConfig = Record<string, McpServerConfig>;

/** MCP Server status */
export interface McpServerStatus {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending';
  serverInfo?: {
    name: string;
    version: string;
  };
  tools: string[];
  error?: string;
}

/** MCP Tool definition from server */
export interface McpTool {
  name: string;
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema?: any; // JSON Schema
}

/** MCP Tool call result */
export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    mimeType?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any;
    };
  }>;
  isError?: boolean;
}

/** Type guard for stdio config */
export function isStdioConfig(config: McpServerConfig): config is McpStdioServerConfig {
  return config.type === 'stdio';
}

/** Type guard for HTTP config */
export function isHttpConfig(config: McpServerConfig): config is McpHttpServerConfig {
  return config.type === 'http';
}

/** Type guard for SSE config */
export function isSseConfig(config: McpServerConfig): config is McpSSEServerConfig {
  return config.type === 'sse';
}

/** Type guard for SDK config */
export function isSdkConfig(config: McpServerConfig): config is McpSdkServerConfig {
  return config.type === 'sdk';
}
