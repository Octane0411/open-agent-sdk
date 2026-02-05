/**
 * MCP (Model Context Protocol) error classes
 */

/** Base MCP error */
export class MCPError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

/** Connection error */
export class MCPConnectionError extends MCPError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'MCPConnectionError';
  }
}

/** Timeout error */
export class MCPTimeoutError extends MCPError {
  constructor(message: string) {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'MCPTimeoutError';
  }
}

/** Protocol error */
export class MCPProtocolError extends MCPError {
  constructor(message: string) {
    super(message, 'PROTOCOL_ERROR');
    this.name = 'MCPProtocolError';
  }
}

/** Tool execution error */
export class MCPToolError extends MCPError {
  constructor(
    message: string,
    public toolName: string
  ) {
    super(message, 'TOOL_ERROR');
    this.name = 'MCPToolError';
  }
}
