/**
 * MCP Tool Adapter tests
 * Tests conversion from MCP tool format to SDK tool format
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { McpToolAdapter } from '../../src/mcp/tool-adapter';
import type { McpTool } from '../../src/mcp/types';

// Mock Client
const mockCallTool = mock(() =>
  Promise.resolve({
    content: [{ type: 'text', text: 'Tool result' }],
  })
);

const MockClient = class {
  callTool = mockCallTool;
};

describe('McpToolAdapter', () => {
  let adapter: McpToolAdapter;
  let mockClient: InstanceType<typeof MockClient>;

  beforeEach(() => {
    mockClient = new MockClient() as unknown as InstanceType<typeof MockClient>;
    adapter = new McpToolAdapter('filesystem', mockClient as unknown as import('@modelcontextprotocol/sdk/client/index.js').Client);
    mockCallTool.mockClear();
  });

  describe('getPrefixedName', () => {
    test('should prefix tool name with server name', () => {
      const prefixed = adapter.getPrefixedName('readFile');
      expect(prefixed).toBe('mcp_filesystem_readFile');
    });

    test('should handle tool names with special characters', () => {
      const prefixed = adapter.getPrefixedName('read-file');
      expect(prefixed).toBe('mcp_filesystem_read-file');
    });

    test('should handle tool names with underscores', () => {
      const prefixed = adapter.getPrefixedName('read_file');
      expect(prefixed).toBe('mcp_filesystem_read_file');
    });
  });

  describe('toSdkTool', () => {
    test('should convert MCP tool to SDK tool', () => {
      const mcpTool: McpTool = {
        name: 'readFile',
        description: 'Read a file from the filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
          },
          required: ['path'],
        },
      };

      const sdkTool = adapter.toSdkTool(mcpTool);

      expect(sdkTool.name).toBe('mcp_filesystem_readFile');
      expect(sdkTool.description).toBe('[MCP:filesystem] Read a file from the filesystem');
      expect(sdkTool.parameters).toEqual({
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      });
      expect(typeof sdkTool.handler).toBe('function');
    });

    test('should handle tool without description', () => {
      const mcpTool: McpTool = {
        name: 'listFiles',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      };

      const sdkTool = adapter.toSdkTool(mcpTool);

      expect(sdkTool.description).toBe('[MCP:filesystem] ');
    });

    test('should handle tool without inputSchema', () => {
      const mcpTool: McpTool = {
        name: 'getStatus',
        description: 'Get server status',
      };

      const sdkTool = adapter.toSdkTool(mcpTool);

      expect(sdkTool.parameters).toEqual({
        type: 'object',
        properties: {},
      });
    });
  });

  describe('tool handler', () => {
    test('should call MCP tool and return result', async () => {
      const mcpTool: McpTool = {
        name: 'readFile',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: {} },
      };

      const sdkTool = adapter.toSdkTool(mcpTool);
      const result = await sdkTool.handler({ path: '/test.txt' }, { cwd: '/tmp', env: {} });

      expect(mockCallTool).toHaveBeenCalledWith({
        name: 'readFile',
        arguments: { path: '/test.txt' },
      });
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Tool result' }],
      });
    });

    test('should handle tool errors', async () => {
      mockCallTool.mockImplementationOnce(() =>
        Promise.resolve({
          content: [{ type: 'text', text: 'Error occurred' }],
          isError: true,
        })
      );

      const mcpTool: McpTool = {
        name: 'writeFile',
        description: 'Write a file',
        inputSchema: { type: 'object', properties: {} },
      };

      const sdkTool = adapter.toSdkTool(mcpTool);
      const result = await sdkTool.handler({ path: '/test.txt', content: 'data' }, { cwd: '/tmp', env: {} });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error occurred' }],
        isError: true,
      });
    });

    test('should handle MCP client errors', async () => {
      mockCallTool.mockImplementationOnce(() => Promise.reject(new Error('Connection lost')));

      const mcpTool: McpTool = {
        name: 'readFile',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: {} },
      };

      const sdkTool = adapter.toSdkTool(mcpTool);

      await expect(sdkTool.handler({ path: '/test.txt' }, { cwd: '/tmp', env: {} })).rejects.toThrow(
        'Connection lost'
      );
    });
  });

  describe('convertSchema', () => {
    test('should convert JSON schema to SDK format', () => {
      const mcpTool: McpTool = {
        name: 'searchFiles',
        description: 'Search files',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Search pattern' },
            recursive: { type: 'boolean', default: true },
            maxResults: { type: 'number' },
          },
          required: ['pattern'],
        },
      };

      const sdkTool = adapter.toSdkTool(mcpTool);

      expect(sdkTool.parameters).toEqual({
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern' },
          recursive: { type: 'boolean', default: true },
          maxResults: { type: 'number' },
        },
        required: ['pattern'],
      });
    });

    test('should handle schema with additionalProperties', () => {
      const mcpTool: McpTool = {
        name: 'customTool',
        description: 'Custom tool',
        inputSchema: {
          type: 'object',
          properties: {
            knownParam: { type: 'string' },
          },
          additionalProperties: true,
        },
      };

      const sdkTool = adapter.toSdkTool(mcpTool);

      expect(sdkTool.parameters.additionalProperties).toBe(true);
    });
  });

  describe('result conversion', () => {
    test('should convert text content', async () => {
      mockCallTool.mockImplementationOnce(() =>
        Promise.resolve({
          content: [{ type: 'text', text: 'File contents here' }],
        })
      );

      const mcpTool: McpTool = {
        name: 'readFile',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: {} },
      };

      const sdkTool = adapter.toSdkTool(mcpTool);
      const result = await sdkTool.handler({ path: '/test.txt' }, { cwd: '/tmp', env: {} });

      expect(result).toEqual({
        content: [{ type: 'text', text: 'File contents here' }],
      });
    });

    test('should convert multiple content items', async () => {
      mockCallTool.mockImplementationOnce(() =>
        Promise.resolve({
          content: [
            { type: 'text', text: 'First line' },
            { type: 'text', text: 'Second line' },
          ],
        })
      );

      const mcpTool: McpTool = {
        name: 'readLines',
        description: 'Read lines',
        inputSchema: { type: 'object', properties: {} },
      };

      const sdkTool = adapter.toSdkTool(mcpTool);
      const result = await sdkTool.handler({ count: 2 }, { cwd: '/tmp', env: {} });

      expect(result.content).toHaveLength(2);
    });
  });
});
