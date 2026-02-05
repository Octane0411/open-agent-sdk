/**
 * MCP Server Registry tests
 * Tests registration of MCP tools to SDK ToolRegistry
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { McpServerRegistry } from '../../src/mcp/server-registry';
import { ToolRegistry } from '../../src/tools/registry';
import type { McpTool } from '../../src/mcp/types';

// Mock Client
const mockListTools = mock(() =>
  Promise.resolve({
    tools: [
      { name: 'readFile', description: 'Read a file' },
      { name: 'writeFile', description: 'Write a file' },
    ],
  })
);

const mockCallTool = mock(() =>
  Promise.resolve({
    content: [{ type: 'text', text: 'Result' }],
  })
);

const MockClient = class {
  listTools = mockListTools;
  callTool = mockCallTool;
};

describe('McpServerRegistry', () => {
  let registry: ToolRegistry;
  let mcpRegistry: McpServerRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    mcpRegistry = new McpServerRegistry(registry);
    mockListTools.mockClear();
    mockCallTool.mockClear();
  });

  describe('registerServer', () => {
    test('should register all tools from server', async () => {
      const mockClient = new MockClient() as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client;

      const registeredNames = await mcpRegistry.registerServer('filesystem', mockClient);

      expect(registeredNames).toHaveLength(2);
      expect(registeredNames).toContain('mcp_filesystem_readFile');
      expect(registeredNames).toContain('mcp_filesystem_writeFile');

      // Verify tools are registered in ToolRegistry
      const readTool = registry.get('mcp_filesystem_readFile');
      expect(readTool).toBeDefined();
      expect(readTool?.description).toBe('[MCP:filesystem] Read a file');
    });

    test('should return empty array when server has no tools', async () => {
      mockListTools.mockImplementationOnce(() => Promise.resolve({ tools: [] }));

      const mockClient = new MockClient() as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client;
      const registeredNames = await mcpRegistry.registerServer('empty', mockClient);

      expect(registeredNames).toEqual([]);
    });

    test('should track registered MCP tools', async () => {
      const mockClient = new MockClient() as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client;
      await mcpRegistry.registerServer('filesystem', mockClient);

      expect(mcpRegistry.isMcpTool('mcp_filesystem_readFile')).toBe(true);
      expect(mcpRegistry.isMcpTool('mcp_filesystem_writeFile')).toBe(true);
      expect(mcpRegistry.isMcpTool('Read')).toBe(false);
    });
  });

  describe('unregisterServer', () => {
    test('should remove all tools from server', async () => {
      const mockClient = new MockClient() as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client;
      await mcpRegistry.registerServer('filesystem', mockClient);

      mcpRegistry.unregisterServer('filesystem');

      expect(registry.get('mcp_filesystem_readFile')).toBeUndefined();
      expect(registry.get('mcp_filesystem_writeFile')).toBeUndefined();
      expect(mcpRegistry.isMcpTool('mcp_filesystem_readFile')).toBe(false);
    });

    test('should handle unregistering non-existent server', () => {
      // Should not throw
      mcpRegistry.unregisterServer('nonexistent');
    });
  });

  describe('isMcpTool', () => {
    test('should return true for MCP tool names', () => {
      expect(mcpRegistry.isMcpTool('mcp_server_tool')).toBe(false); // Not registered yet

      // Manually register to test
      registry.register({
        name: 'mcp_test_tool',
        description: 'Test',
        parameters: { type: 'object', properties: {} },
        handler: async () => ({}),
      });

      // Add to tracking manually - use the proper Map structure
      const serverTools = new Set<string>();
      serverTools.add('mcp_test_tool');
      (mcpRegistry as unknown as { registeredTools: Map<string, Set<string>> }).registeredTools.set('test', serverTools);

      expect(mcpRegistry.isMcpTool('mcp_test_tool')).toBe(true);
    });

    test('should return false for non-MCP tool names', () => {
      expect(mcpRegistry.isMcpTool('Read')).toBe(false);
      expect(mcpRegistry.isMcpTool('Write')).toBe(false);
      expect(mcpRegistry.isMcpTool('Bash')).toBe(false);
    });

    test('should return false for names starting with mcp but not registered', () => {
      expect(mcpRegistry.isMcpTool('mcp_something')).toBe(false);
    });
  });

  describe('parseMcpToolName', () => {
    test('should parse valid MCP tool name', () => {
      const parsed = mcpRegistry.parseMcpToolName('mcp_filesystem_readFile');

      expect(parsed).toEqual({
        serverName: 'filesystem',
        toolName: 'readFile',
      });
    });

    test('should parse tool name with multiple underscores', () => {
      const parsed = mcpRegistry.parseMcpToolName('mcp_my_server_read_file');

      expect(parsed).toEqual({
        serverName: 'my',
        toolName: 'server_read_file',
      });
    });

    test('should return null for non-MCP tool name', () => {
      expect(mcpRegistry.parseMcpToolName('Read')).toBeNull();
      expect(mcpRegistry.parseMcpToolName('Write')).toBeNull();
      expect(mcpRegistry.parseMcpToolName('')).toBeNull();
    });

    test('should return null for invalid format', () => {
      expect(mcpRegistry.parseMcpToolName('mcp_')).toBeNull(); // Missing server and tool
      expect(mcpRegistry.parseMcpToolName('mcp_server_')).toBeNull(); // Missing tool
    });
  });

  describe('getServerForTool', () => {
    test('should return server name for registered MCP tool', async () => {
      const mockClient = new MockClient() as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client;
      await mcpRegistry.registerServer('filesystem', mockClient);

      const serverName = mcpRegistry.getServerForTool('mcp_filesystem_readFile');
      expect(serverName).toBe('filesystem');
    });

    test('should return null for non-MCP tool', () => {
      const serverName = mcpRegistry.getServerForTool('Read');
      expect(serverName).toBeNull();
    });
  });

  describe('multiple servers', () => {
    test('should handle multiple servers without conflicts', async () => {
      // First server
      mockListTools.mockImplementationOnce(() =>
        Promise.resolve({
          tools: [
            { name: 'readFile', description: 'Read file' },
          ],
        })
      );
      const mockClient1 = new MockClient() as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client;
      await mcpRegistry.registerServer('fs1', mockClient1);

      // Second server
      mockListTools.mockImplementationOnce(() =>
        Promise.resolve({
          tools: [
            { name: 'readFile', description: 'Read file from fs2' },
          ],
        })
      );
      const mockClient2 = new MockClient() as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client;
      await mcpRegistry.registerServer('fs2', mockClient2);

      // Both tools should be registered with different prefixed names
      const tool1 = registry.get('mcp_fs1_readFile');
      const tool2 = registry.get('mcp_fs2_readFile');

      expect(tool1).toBeDefined();
      expect(tool2).toBeDefined();
      expect(tool1?.description).toBe('[MCP:fs1] Read file');
      expect(tool2?.description).toBe('[MCP:fs2] Read file from fs2');
    });

    test('should unregister only one server tools', async () => {
      // First server
      mockListTools.mockImplementationOnce(() =>
        Promise.resolve({
          tools: [{ name: 'tool1', description: 'Tool 1' }],
        })
      );
      const mockClient1 = new MockClient() as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client;
      await mcpRegistry.registerServer('server1', mockClient1);

      // Second server
      mockListTools.mockImplementationOnce(() =>
        Promise.resolve({
          tools: [{ name: 'tool2', description: 'Tool 2' }],
        })
      );
      const mockClient2 = new MockClient() as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client;
      await mcpRegistry.registerServer('server2', mockClient2);

      // Unregister only server1
      mcpRegistry.unregisterServer('server1');

      expect(registry.get('mcp_server1_tool1')).toBeUndefined();
      expect(registry.get('mcp_server2_tool2')).toBeDefined();
    });
  });
});
