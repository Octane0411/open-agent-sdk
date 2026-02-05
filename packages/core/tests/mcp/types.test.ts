/**
 * MCP types tests
 * Aligned with Claude Agent SDK
 */

import { describe, test, expect } from 'bun:test';
import type {
  McpServerConfig,
  McpStdioServerConfig,
  McpHttpServerConfig,
  McpSSEServerConfig,
  McpSdkServerConfig,
  McpServersConfig,
  McpServerStatus,
  McpTool,
  McpToolResult,
} from '../../src/mcp/types';
import {
  MCPError,
  MCPConnectionError,
  MCPTimeoutError,
  MCPProtocolError,
  MCPToolError,
} from '../../src/mcp/errors';

describe('MCP Types', () => {
  describe('McpStdioServerConfig', () => {
    test('should create valid stdio config', () => {
      const config: McpStdioServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: { NODE_ENV: 'production' },
      };

      expect(config.type).toBe('stdio');
      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem']);
      expect(config.env).toEqual({ NODE_ENV: 'production' });
    });

    test('should create stdio config without optional fields', () => {
      const config: McpStdioServerConfig = {
        type: 'stdio',
        command: 'node',
      };

      expect(config.type).toBe('stdio');
      expect(config.command).toBe('node');
      expect(config.args).toBeUndefined();
      expect(config.env).toBeUndefined();
    });
  });

  describe('McpHttpServerConfig', () => {
    test('should create valid HTTP config', () => {
      const config: McpHttpServerConfig = {
        type: 'http',
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer token' },
      };

      expect(config.type).toBe('http');
      expect(config.url).toBe('https://api.example.com/mcp');
      expect(config.headers).toEqual({ Authorization: 'Bearer token' });
    });

    test('should create HTTP config without headers', () => {
      const config: McpHttpServerConfig = {
        type: 'http',
        url: 'http://localhost:3000/mcp',
      };

      expect(config.type).toBe('http');
      expect(config.url).toBe('http://localhost:3000/mcp');
      expect(config.headers).toBeUndefined();
    });
  });

  describe('McpSSEServerConfig', () => {
    test('should create valid SSE config', () => {
      const config: McpSSEServerConfig = {
        type: 'sse',
        url: 'https://events.example.com/sse',
        headers: { 'X-API-Key': 'key' },
      };

      expect(config.type).toBe('sse');
      expect(config.url).toBe('https://events.example.com/sse');
    });
  });

  describe('McpSdkServerConfig', () => {
    test('should create valid SDK config', () => {
      const mockInstance = { name: 'test-server' };
      const config: McpSdkServerConfig = {
        type: 'sdk',
        name: 'my-server',
        instance: mockInstance,
      };

      expect(config.type).toBe('sdk');
      expect(config.name).toBe('my-server');
      expect(config.instance).toBe(mockInstance);
    });
  });

  describe('McpServerConfig union type', () => {
    test('should accept all config types', () => {
      const stdioConfig: McpServerConfig = {
        type: 'stdio',
        command: 'node',
      };

      const httpConfig: McpServerConfig = {
        type: 'http',
        url: 'https://example.com',
      };

      const sseConfig: McpServerConfig = {
        type: 'sse',
        url: 'https://example.com/sse',
      };

      const sdkConfig: McpServerConfig = {
        type: 'sdk',
        name: 'test',
        instance: {},
      };

      expect(stdioConfig.type).toBe('stdio');
      expect(httpConfig.type).toBe('http');
      expect(sseConfig.type).toBe('sse');
      expect(sdkConfig.type).toBe('sdk');
    });
  });

  describe('McpServersConfig', () => {
    test('should create servers config map', () => {
      const configs: McpServersConfig = {
        filesystem: {
          type: 'stdio',
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem'],
        },
        remote: {
          type: 'http',
          url: 'https://api.example.com/mcp',
        },
      };

      expect(Object.keys(configs)).toHaveLength(2);
      expect(configs.filesystem.type).toBe('stdio');
      expect(configs.remote.type).toBe('http');
    });
  });

  describe('McpServerStatus', () => {
    test('should create server status', () => {
      const status: McpServerStatus = {
        name: 'filesystem',
        status: 'connected',
        serverInfo: {
          name: 'server-filesystem',
          version: '1.0.0',
        },
        tools: ['readFile', 'writeFile'],
      };

      expect(status.name).toBe('filesystem');
      expect(status.status).toBe('connected');
      expect(status.serverInfo).toEqual({
        name: 'server-filesystem',
        version: '1.0.0',
      });
      expect(status.tools).toEqual(['readFile', 'writeFile']);
    });

    test('should create server status without optional fields', () => {
      const status: McpServerStatus = {
        name: 'filesystem',
        status: 'failed',
        tools: [],
      };

      expect(status.name).toBe('filesystem');
      expect(status.status).toBe('failed');
      expect(status.serverInfo).toBeUndefined();
      expect(status.tools).toEqual([]);
    });

    test('should have all valid status values', () => {
      const statuses: McpServerStatus['status'][] = [
        'connected',
        'failed',
        'needs-auth',
        'pending',
      ];

      expect(statuses).toContain('connected');
      expect(statuses).toContain('failed');
      expect(statuses).toContain('needs-auth');
      expect(statuses).toContain('pending');
    });
  });

  describe('McpTool', () => {
    test('should create tool definition', () => {
      const tool: McpTool = {
        name: 'readFile',
        description: 'Read a file from the filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      };

      expect(tool.name).toBe('readFile');
      expect(tool.description).toBe('Read a file from the filesystem');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
    });
  });

  describe('McpToolResult', () => {
    test('should create text result', () => {
      const result: McpToolResult = {
        content: [
          {
            type: 'text',
            text: 'File contents here',
          },
        ],
      };

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('File contents here');
      expect(result.isError).toBeUndefined();
    });

    test('should create error result', () => {
      const result: McpToolResult = {
        content: [
          {
            type: 'text',
            text: 'Error: File not found',
          },
        ],
        isError: true,
      };

      expect(result.isError).toBe(true);
    });
  });
});

describe('MCP Errors', () => {
  describe('MCPError', () => {
    test('should create base MCP error', () => {
      const error = new MCPError('Something went wrong', 'ERROR_CODE');

      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe('ERROR_CODE');
      expect(error.name).toBe('MCPError');
    });
  });

  describe('MCPConnectionError', () => {
    test('should create connection error', () => {
      const error = new MCPConnectionError('Failed to connect');

      expect(error.message).toBe('Failed to connect');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.name).toBe('MCPConnectionError');
    });
  });

  describe('MCPTimeoutError', () => {
    test('should create timeout error', () => {
      const error = new MCPTimeoutError('Request timed out');

      expect(error.message).toBe('Request timed out');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.name).toBe('MCPTimeoutError');
    });
  });

  describe('MCPProtocolError', () => {
    test('should create protocol error', () => {
      const error = new MCPProtocolError('Invalid response');

      expect(error.message).toBe('Invalid response');
      expect(error.code).toBe('PROTOCOL_ERROR');
      expect(error.name).toBe('MCPProtocolError');
    });
  });

  describe('MCPToolError', () => {
    test('should create tool error', () => {
      const error = new MCPToolError('Tool execution failed', 'readFile');

      expect(error.message).toBe('Tool execution failed');
      expect(error.code).toBe('TOOL_ERROR');
      expect(error.toolName).toBe('readFile');
      expect(error.name).toBe('MCPToolError');
    });
  });
});
