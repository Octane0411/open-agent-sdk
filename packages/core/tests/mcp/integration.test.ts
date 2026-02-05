/**
 * MCP Integration tests
 * Tests the full MCP flow
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { McpManager } from '../../src/mcp/manager';
import { McpServerRegistry } from '../../src/mcp/server-registry';
import { ToolRegistry } from '../../src/tools/registry';
import { MCPConnectionError } from '../../src/mcp/errors';

// Mock the official MCP SDK with default implementation
const defaultTools = [
  { name: 'readFile', description: 'Read a file', inputSchema: { type: 'object', properties: {} } },
  { name: 'listFiles', description: 'List files', inputSchema: { type: 'object', properties: {} } },
];

const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockListTools = mock(() => Promise.resolve({ tools: defaultTools }));
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
    constructor(public url: URL, public options: unknown) {}
  },
}));

describe('MCP Integration', () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockClear();
    mockListTools.mockClear();
    mockCallTool.mockClear();
    // Reset to default
    mockListTools.mockImplementation(() => Promise.resolve({ tools: defaultTools }));
  });

  describe('McpManager + McpServerRegistry', () => {
    test('should register MCP tools to ToolRegistry', async () => {
      const toolRegistry = new ToolRegistry();
      const mcpManager = new McpManager();

      // Connect to MCP server
      await mcpManager.connect('filesystem', {
        type: 'stdio',
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem'],
      });

      // Register tools to ToolRegistry
      const mcpRegistry = new McpServerRegistry(toolRegistry);
      const registeredTools = await mcpRegistry.registerServer('filesystem', mcpManager.getClient('filesystem')!);

      // Verify tools are registered
      expect(registeredTools).toHaveLength(2);
      expect(registeredTools).toContain('mcp_filesystem_readFile');
      expect(registeredTools).toContain('mcp_filesystem_listFiles');

      // Verify tools can be retrieved from ToolRegistry
      const readTool = toolRegistry.get('mcp_filesystem_readFile');
      expect(readTool).toBeDefined();
      expect(readTool?.description).toBe('[MCP:filesystem] Read a file');

      // Cleanup
      await mcpManager.disconnect();
    });

    test('should execute MCP tools through ToolRegistry', async () => {
      const toolRegistry = new ToolRegistry();
      const mcpManager = new McpManager();

      // Setup
      await mcpManager.connect('filesystem', {
        type: 'stdio',
        command: 'npx',
      });

      const mcpRegistry = new McpServerRegistry(toolRegistry);
      await mcpRegistry.registerServer('filesystem', mcpManager.getClient('filesystem')!);

      // Execute tool through ToolRegistry
      const tool = toolRegistry.get('mcp_filesystem_readFile')!;
      const result = await tool.handler({ path: '/test.txt' }, { cwd: '/tmp', env: {} });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Result from readFile' }],
      });

      // Cleanup
      await mcpManager.disconnect();
    });

    test('should unregister server tools', async () => {
      const toolRegistry = new ToolRegistry();
      const mcpManager = new McpManager();

      // Setup
      await mcpManager.connect('filesystem', {
        type: 'stdio',
        command: 'npx',
      });

      const mcpRegistry = new McpServerRegistry(toolRegistry);
      await mcpRegistry.registerServer('filesystem', mcpManager.getClient('filesystem')!);

      // Verify tools are registered
      expect(toolRegistry.get('mcp_filesystem_readFile')).toBeDefined();

      // Unregister server
      mcpRegistry.unregisterServer('filesystem');

      // Verify tools are removed
      expect(toolRegistry.get('mcp_filesystem_readFile')).toBeUndefined();

      // Cleanup
      await mcpManager.disconnect();
    });
  });

  describe('Error handling', () => {
    test('should handle MCP server connection failure gracefully', async () => {
      mockConnect.mockImplementationOnce(() => Promise.reject(new Error('Connection refused')));

      const mcpManager = new McpManager();

      await expect(
        mcpManager.connect('bad-server', {
          type: 'stdio',
          command: 'nonexistent',
        })
      ).rejects.toThrow(MCPConnectionError);

      const status = mcpManager.getStatus('bad-server');
      expect(status?.status).toBe('failed');
      expect(status?.error).toBe('Connection refused');
    });

    test('should handle tool execution errors', async () => {
      mockCallTool.mockImplementationOnce(() =>
        Promise.resolve({
          content: [{ type: 'text', text: 'Permission denied' }],
          isError: true,
        })
      );

      const toolRegistry = new ToolRegistry();
      const mcpManager = new McpManager();

      await mcpManager.connect('filesystem', { type: 'stdio', command: 'npx' });

      const mcpRegistry = new McpServerRegistry(toolRegistry);
      await mcpRegistry.registerServer('filesystem', mcpManager.getClient('filesystem')!);

      const tool = toolRegistry.get('mcp_filesystem_readFile')!;
      const result = await tool.handler({ path: '/restricted' }, { cwd: '/tmp', env: {} });

      expect(result.isError).toBe(true);

      await mcpManager.disconnect();
    });
  });

  describe('Tool name handling', () => {
    test('should correctly parse MCP tool names', () => {
      const toolRegistry = new ToolRegistry();
      const mcpRegistry = new McpServerRegistry(toolRegistry);

      // Test parsing
      expect(mcpRegistry.parseMcpToolName('mcp_server_tool')).toEqual({
        serverName: 'server',
        toolName: 'tool',
      });

      expect(mcpRegistry.parseMcpToolName('mcp_my_server_read_file')).toEqual({
        serverName: 'my',
        toolName: 'server_read_file',
      });

      expect(mcpRegistry.parseMcpToolName('Read')).toBeNull();
      expect(mcpRegistry.parseMcpToolName('')).toBeNull();
    });

    test('should identify MCP tools correctly', async () => {
      const toolRegistry = new ToolRegistry();
      const mcpManager = new McpManager();

      await mcpManager.connect('fs', { type: 'stdio', command: 'npx' });

      const mcpRegistry = new McpServerRegistry(toolRegistry);
      await mcpRegistry.registerServer('fs', mcpManager.getClient('fs')!);

      expect(mcpRegistry.isMcpTool('mcp_fs_readFile')).toBe(true);
      expect(mcpRegistry.isMcpTool('Read')).toBe(false);
      expect(mcpRegistry.isMcpTool('mcp_unregistered_tool')).toBe(false);

      await mcpManager.disconnect();
    });

    test('should get server for tool', async () => {
      const toolRegistry = new ToolRegistry();
      const mcpManager = new McpManager();

      await mcpManager.connect('filesystem', { type: 'stdio', command: 'npx' });

      const mcpRegistry = new McpServerRegistry(toolRegistry);
      await mcpRegistry.registerServer('filesystem', mcpManager.getClient('filesystem')!);

      expect(mcpRegistry.getServerForTool('mcp_filesystem_readFile')).toBe('filesystem');
      expect(mcpRegistry.getServerForTool('Read')).toBeNull();

      await mcpManager.disconnect();
    });
  });

  describe('Status tracking', () => {
    test('should track server status correctly', async () => {
      const mcpManager = new McpManager();

      // Initially no servers
      expect(mcpManager.getAllStatuses()).toEqual([]);

      // After connect
      await mcpManager.connect('fs', { type: 'stdio', command: 'npx' });

      const statuses = mcpManager.getAllStatuses();
      expect(statuses).toHaveLength(1);
      expect(statuses[0].name).toBe('fs');
      expect(statuses[0].status).toBe('connected');
      expect(statuses[0].tools).toContain('readFile');
      expect(statuses[0].tools).toContain('listFiles');

      await mcpManager.disconnect();
    });

    test('should return undefined for unknown server', () => {
      const mcpManager = new McpManager();
      expect(mcpManager.getStatus('unknown')).toBeUndefined();
    });
  });

  describe('Manager lifecycle', () => {
    test('should disconnect all servers', async () => {
      const mcpManager = new McpManager();

      await mcpManager.connect('server1', { type: 'stdio', command: 'cmd1' });
      await mcpManager.connect('server2', { type: 'stdio', command: 'cmd2' });

      expect(mcpManager.getClient('server1')).toBeDefined();
      expect(mcpManager.getClient('server2')).toBeDefined();

      await mcpManager.disconnect();

      expect(mcpManager.getClient('server1')).toBeUndefined();
      expect(mcpManager.getClient('server2')).toBeUndefined();
    });
  });
});
