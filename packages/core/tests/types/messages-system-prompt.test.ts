/**
 * Tests for SDKSystemMessage (aligned with Claude Agent SDK)
 */

import { describe, it, expect } from 'bun:test';
import {
  createSystemMessage,
  type SDKSystemMessage,
} from '../../src/types/messages';

describe('SDKSystemMessage', () => {
  it('should create system message with metadata', () => {
    const model = 'gpt-4';
    const provider = 'openai';
    const tools = ['read', 'write'];
    const cwd = '/home/user/project';
    const sessionId = 'session-123';
    const uuid = 'uuid-456';

    const message = createSystemMessage(
      model,
      provider,
      tools,
      cwd,
      sessionId,
      uuid
    );

    expect(message.type).toBe('system');
    expect(message.subtype).toBe('init');
    // SDKSystemMessage no longer has content field - it's metadata only
    // System prompt is passed via ChatOptions to the provider
    expect(message.model).toBe(model);
    expect(message.provider).toBe(provider);
    expect(message.tools).toEqual(tools);
    expect(message.cwd).toBe(cwd);
    expect(message.session_id).toBe(sessionId);
    expect(message.uuid).toBe(uuid);
  });

  it('should handle empty tools array', () => {
    const message = createSystemMessage(
      'gpt-4',
      'openai',
      [],
      '/tmp',
      'session-123',
      'uuid-456'
    );

    expect(message.tools).toEqual([]);
    expect(message.cwd).toBe('/tmp');
  });

  it('should handle optional fields', () => {
    const message = createSystemMessage(
      'gpt-4',
      'openai',
      ['tool1', 'tool2'],
      '/workspace',
      'session-123',
      'uuid-456',
      {
        apiKeySource: 'env',
        permissionMode: 'prompt',
        slash_commands: ['/help', '/clear'],
        output_style: 'concise',
        mcp_servers: [{ name: 'test-server', status: 'connected' }],
      }
    );

    expect(message.apiKeySource).toBe('env');
    expect(message.permissionMode).toBe('prompt');
    expect(message.slash_commands).toEqual(['/help', '/clear']);
    expect(message.output_style).toBe('concise');
    expect(message.mcp_servers).toEqual([{ name: 'test-server', status: 'connected' }]);
  });

  it('should create system message without optional options', () => {
    const message = createSystemMessage(
      'gemini-2.0-flash',
      'google',
      ['read', 'glob'],
      '/project',
      'session-789',
      'uuid-abc'
    );

    expect(message.type).toBe('system');
    expect(message.model).toBe('gemini-2.0-flash');
    expect(message.provider).toBe('google');
    expect(message.apiKeySource).toBeUndefined();
    expect(message.permissionMode).toBeUndefined();
  });
});
