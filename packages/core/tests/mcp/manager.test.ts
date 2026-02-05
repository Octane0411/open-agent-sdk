/**
 * MCP Manager tests
 * Tests the McpManager class that wraps the official MCP SDK
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { McpManager } from '../../src/mcp/manager';
import { MCPConnectionError } from '../../src/mcp/errors';
import type { McpStdioServerConfig, McpHttpServerConfig } from '../../src/mcp/types';

// Mock the official MCP SDK
const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockListTools = mock(() =>
  Promise.resolve({
    tools: [
      { name: 'readFile', description: 'Read a file' },
      { name: 'writeFile', description: 'Write a file' },
    ],
  })
);
const mockCallTool = mock((params: { name: string }) =>
  Promise.resolve({
    content: [{ type: 'text', text: `Result from ${params.name}` }],
  })
);

mock.module('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = mockConnect;
    close = mockClose;
    listTools = mockListTools;
    callTool = mockCallTool;
  },
}));

mock.module('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class MockStdioTransport {
    constructor(public config: unknown) {}
  },
}));

mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class MockHttpTransport {
    constructor(public config: unknown) {}
  },
}));

describe('McpManager', () => {
  let manager: McpManager;

  beforeEach(() => {
    manager = new McpManager();
    mockConnect.mockClear();
    mockClose.mockClear();
    mockListTools.mockClear();
    mockCallTool.mockClear();
  });

  describe('connect', () => {
    test('should connect to stdio server', async () => {
      const config: McpStdioServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem'],
      };

      await manager.connect('filesystem', config);

      const client = manager.getClient('filesystem');
      expect(client).toBeDefined();
      expect(mockConnect).toHaveBeenCalled();
    });

    test('should connect to HTTP server', async () => {
      const config: McpHttpServerConfig = {
        type: 'http',
        url: 'https://api.example.com/mcp',
        headers: { Authorization: 'Bearer token' },
      };

      await manager.connect('remote', config);

      const client = manager.getClient('remote');
      expect(client).toBeDefined();
      expect(mockConnect).toHaveBeenCalled();
    });

    test('should throw error for SSE config (not implemented)', async () => {
      const config = {
        type: 'sse' as const,
        url: 'https://events.example.com/sse',
      };

      expect(manager.connect('sse-server', config)).rejects.toThrow('SSE transport not yet implemented');
    });

    test('should throw error for SDK config (not implemented)', async () => {
      const config = {
        type: 'sdk' as const,
        name: 'test-server',
        instance: {},
      };

      expect(manager.connect('sdk-server', config)).rejects.toThrow('SDK transport not yet implemented');
    });

    test('should update status on successful connection', async () => {
      const config: McpStdioServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem'],
      };

      await manager.connect('filesystem', config);

      const statuses = manager.getAllStatuses();
      expect(statuses).toHaveLength(1);
      expect(statuses[0].name).toBe('filesystem');
      expect(statuses[0].status).toBe('connected');
    });

    test('should update status on connection failure', async () => {
      mockConnect.mockImplementationOnce(() => Promise.reject(new Error('Connection failed')));

      const config: McpStdioServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem'],
      };

      await expect(manager.connect('filesystem', config)).rejects.toThrow(MCPConnectionError);

      const statuses = manager.getAllStatuses();
      expect(statuses).toHaveLength(1);
      expect(statuses[0].status).toBe('failed');
      expect(statuses[0].error).toBe('Connection failed');
    });
  });

  describe('getClient', () => {
    test('should return undefined for unknown server', () => {
      const client = manager.getClient('unknown');
      expect(client).toBeUndefined();
    });

    test('should return client for connected server', async () => {
      const config: McpStdioServerConfig = {
        type: 'stdio',
        command: 'npx',
      };

      await manager.connect('test', config);
      const client = manager.getClient('test');

      expect(client).toBeDefined();
    });
  });

  describe('getAllStatuses', () => {
    test('should return empty array when no servers', () => {
      const statuses = manager.getAllStatuses();
      expect(statuses).toEqual([]);
    });

    test('should return all server statuses', async () => {
      await manager.connect('server1', { type: 'stdio', command: 'cmd1' });
      await manager.connect('server2', { type: 'http', url: 'https://example.com' });

      const statuses = manager.getAllStatuses();
      expect(statuses).toHaveLength(2);
      expect(statuses.map(s => s.name)).toContain('server1');
      expect(statuses.map(s => s.name)).toContain('server2');
    });
  });

  describe('disconnect', () => {
    test('should close all connections', async () => {
      await manager.connect('server1', { type: 'stdio', command: 'cmd1' });
      await manager.connect('server2', { type: 'http', url: 'https://example.com' });

      await manager.disconnect();

      expect(mockClose).toHaveBeenCalledTimes(2);
    });

    test('should clear all clients after disconnect', async () => {
      await manager.connect('server1', { type: 'stdio', command: 'cmd1' });

      await manager.disconnect();

      expect(manager.getClient('server1')).toBeUndefined();
    });

    test('should handle disconnect with no connections', async () => {
      await manager.disconnect();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('listAllTools', () => {
    test('should return empty map when no servers', async () => {
      const tools = await manager.listAllTools();
      expect(tools.size).toBe(0);
    });

    test('should aggregate tools from all servers', async () => {
      await manager.connect('server1', { type: 'stdio', command: 'cmd1' });
      await manager.connect('server2', { type: 'http', url: 'https://example.com' });

      const tools = await manager.listAllTools();

      expect(tools.size).toBe(2);
      expect(tools.has('server1')).toBe(true);
      expect(tools.has('server2')).toBe(true);
      expect(tools.get('server1')).toHaveLength(2);
    });

    test('should handle server without tools', async () => {
      // Override mock for this test to return empty tools
      mockListTools.mockImplementation(() => Promise.resolve({ tools: [] }));

      // Use a fresh manager to avoid interference from other tests
      const freshManager = new McpManager();
      await freshManager.connect('server1', { type: 'stdio', command: 'cmd1' });

      const tools = await freshManager.listAllTools();

      expect(tools.get('server1')).toEqual([]);

      // Restore original mock
      mockListTools.mockRestore();
      mockListTools.mockImplementation(() =>
        Promise.resolve({
          tools: [
            { name: 'readFile', description: 'Read a file' },
            { name: 'writeFile', description: 'Write a file' },
          ],
        })
      );
    });
  });

  describe('callTool', () => {
    test('should call tool on correct server', async () => {
      await manager.connect('filesystem', { type: 'stdio', command: 'npx' });

      const result = await manager.callTool('filesystem', 'readFile', { path: '/test.txt' });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'readFile',
        arguments: { path: '/test.txt' },
      });
      expect(result.content[0].text).toBe('Result from readFile');
    });

    test('should throw error for unknown server', async () => {
      await expect(manager.callTool('unknown', 'tool', {})).rejects.toThrow('MCP server "unknown" not found');
    });

    test('should propagate tool errors', async () => {
      mockCallTool.mockImplementationOnce(() =>
        Promise.resolve({
          content: [{ type: 'text', text: 'Error' }],
          isError: true,
        })
      );

      await manager.connect('filesystem', { type: 'stdio', command: 'npx' });

      const result = await manager.callTool('filesystem', 'readFile', { path: '/test.txt' });

      expect(result.isError).toBe(true);
    });
  });

  describe('status tracking', () => {
    test('should track tool list in status', async () => {
      await manager.connect('filesystem', { type: 'stdio', command: 'npx' });

      const statuses = manager.getAllStatuses();
      expect(statuses[0].tools).toEqual(['readFile', 'writeFile']);
    });
  });
});
