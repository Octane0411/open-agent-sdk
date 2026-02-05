/**
 * MCP (Model Context Protocol) module
 * Exports all MCP-related types and classes
 */

// Types
export type {
  McpServerConfig,
  McpServersConfig,
  McpStdioServerConfig,
  McpHttpServerConfig,
  McpSSEServerConfig,
  McpSdkServerConfig,
  McpServerStatus,
  McpTool,
  McpToolResult,
} from './types.js';

// Type guards
export {
  isStdioConfig,
  isHttpConfig,
  isSseConfig,
  isSdkConfig,
} from './types.js';

// Classes
export { McpManager } from './manager.js';
export { McpToolAdapter } from './tool-adapter.js';
export { McpServerRegistry } from './server-registry.js';

// Errors
export {
  MCPError,
  MCPConnectionError,
  MCPTimeoutError,
  MCPProtocolError,
  MCPToolError,
} from './errors.js';
