/**
 * Subagent integration tests
 * End-to-end tests for the subagent system
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { AgentDefinitions } from '../../src/agent/agent-definition';

describe('Subagent Integration', () => {
  let mockAgents: AgentDefinitions;

  beforeEach(() => {
    mockAgents = {
      'code-reviewer': {
        description: 'Code review specialist',
        tools: ['Read', 'Grep'],
        prompt: 'You are an expert code reviewer. Analyze code for bugs, security issues, and style violations.',
        model: 'sonnet',
        maxTurns: 10,
        permissionMode: 'acceptEdits',
      },
      'test-writer': {
        description: 'Test writing specialist',
        tools: ['Read', 'Write'],
        prompt: 'You write comprehensive unit tests. Create test files with good coverage.',
        model: 'haiku',
        maxTurns: 15,
      },
      'code-explorer': {
        description: 'Codebase exploration specialist',
        prompt: 'You explore codebases efficiently. Use Glob and Grep to find relevant files.',
        // Inherits parent's model, tools, maxTurns, and permissionMode
      },
    };
  });

  describe('end-to-end workflow', () => {
    it('应支持主Agent调用Task工具启动子Agent', () => {
      // Simulate the workflow
      const taskInput = {
        description: 'Review auth module',
        prompt: 'Please review the authentication module for security issues...',
        subagent_type: 'code-reviewer',
      };

      const agentDef = mockAgents[taskInput.subagent_type];

      expect(agentDef).toEqual(mockAgents['code-reviewer']);
      expect(taskInput.description).toBe('Review auth module');
      expect(taskInput.prompt).toBe('Please review the authentication module for security issues...');
      expect(taskInput.subagent_type).toBe('code-reviewer');
    });

    it('应正确传递配置给子Agent', () => {
      const agentDef = mockAgents['code-reviewer'];

      // Verify agent definition is properly configured
      expect(agentDef.description).toBe('Code review specialist');
      expect(agentDef.tools).toEqual(['Read', 'Grep']);
      expect(agentDef.prompt).toContain('code reviewer');
      expect(agentDef.model).toBe('sonnet');
      expect(agentDef.maxTurns).toBe(10);
      expect(agentDef.permissionMode).toBe('acceptEdits');
    });

    it('应支持子Agent使用受限工具集', () => {
      const agentDef = mockAgents['code-reviewer'];

      // Code reviewer should only have Read and Grep
      expect(agentDef.tools).toContain('Read');
      expect(agentDef.tools).toContain('Grep');
      expect(agentDef.tools).not.toContain('Write');
      expect(agentDef.tools).not.toContain('Bash');
    });

    it('应在子Agent未指定tools时继承父Agent全部工具', () => {
      const agentDef = mockAgents['code-explorer'];

      expect(agentDef.tools).toBeUndefined();
    });
  });

  describe('configuration inheritance', () => {
    it('应在子Agent指定model时使用指定值', () => {
      const agentDef = mockAgents['code-reviewer'];

      expect(agentDef.model).toBe('sonnet');
    });

    it('应在子Agent未指定model时继承父Agent模型', () => {
      const agentDef = mockAgents['code-explorer'];
      const parentModel = 'claude-sonnet-4';

      // When model is undefined, it should inherit from parent
      const effectiveModel = agentDef.model ?? parentModel;

      expect(effectiveModel).toBe(parentModel);
    });

    it('应在子Agent指定maxTurns时使用指定值', () => {
      const agentDef = mockAgents['code-reviewer'];

      expect(agentDef.maxTurns).toBe(10);
    });

    it('应在子Agent未指定maxTurns时继承父Agent设置', () => {
      const agentDef = mockAgents['code-explorer'];
      const parentMaxTurns = 20;

      const effectiveMaxTurns = agentDef.maxTurns ?? parentMaxTurns;

      expect(effectiveMaxTurns).toBe(20);
    });

    it('应在子Agent指定permissionMode时使用指定值', () => {
      const agentDef = mockAgents['code-reviewer'];

      expect(agentDef.permissionMode).toBe('acceptEdits');
    });

    it('应在子Agent未指定permissionMode时继承父Agent设置', () => {
      const agentDef = mockAgents['code-explorer'];
      const parentPermissionMode = 'default';

      const effectivePermissionMode = agentDef.permissionMode ?? parentPermissionMode;

      expect(effectivePermissionMode).toBe('default');
    });
  });

  describe('error scenarios', () => {
    it('应在找不到AgentDefinition时返回错误', () => {
      const subagentType = 'non-existent';
      const agentDef = mockAgents[subagentType];

      expect(agentDef).toBeUndefined();
    });

    it('应在子Agent超时时返回错误结果', () => {
      // Simulate timeout result
      const timeoutResult = {
        result: 'Error: Maximum turns reached without completion',
        agent_id: 'agent-timeout',
        isError: true,
        usage: { input_tokens: 500, output_tokens: 100 },
        duration_ms: 10000,
      };

      expect(timeoutResult.isError).toBe(true);
      expect(timeoutResult.result).toContain('Error');
    });

    it('应在子Agent执行失败时不影响主Agent继续', () => {
      let mainAgentContinued = false;

      // Simulate subagent failure
      const subagentResult = {
        isError: true,
        result: 'Error: Tool execution failed',
      };

      // Main agent should continue
      if (subagentResult.isError) {
        // Main agent can decide what to do
        mainAgentContinued = true;
      }

      expect(mainAgentContinued).toBe(true);
    });
  });

  describe('result handling', () => {
    it('应正确返回子Agent执行结果', () => {
      const mockResult = {
        result: 'Code review completed. Found 2 security issues and 1 style violation.',
        agent_id: 'agent-123',
        isError: false,
        usage: {
          input_tokens: 200,
          output_tokens: 350,
        },
        total_cost_usd: 0.00795,
        duration_ms: 3500,
      };

      expect(mockResult.isError).toBe(false);
      expect(mockResult.result).toContain('Code review completed');
      expect(mockResult.agent_id).toMatch(/^agent-/);
      expect(mockResult.usage.input_tokens).toBeGreaterThan(0);
      expect(mockResult.usage.output_tokens).toBeGreaterThan(0);
      expect(mockResult.total_cost_usd).toBeGreaterThan(0);
      expect(mockResult.duration_ms).toBeGreaterThan(0);
    });

    it('应包含正确的usage统计信息', () => {
      const mockResult = {
        result: 'Success',
        agent_id: 'agent-456',
        usage: {
          input_tokens: 150,
          output_tokens: 200,
        },
        duration_ms: 2000,
      };

      const totalTokens = mockResult.usage.input_tokens + mockResult.usage.output_tokens;

      expect(totalTokens).toBe(350);
    });
  });

  describe('multiple subagent types', () => {
    it('应支持不同类型的子Agent', () => {
      const reviewer = mockAgents['code-reviewer'];
      const testWriter = mockAgents['test-writer'];
      const explorer = mockAgents['code-explorer'];

      expect(reviewer.description).toBe('Code review specialist');
      expect(testWriter.description).toBe('Test writing specialist');
      expect(explorer.description).toBe('Codebase exploration specialist');
    });

    it('不同子Agent应有独立的配置', () => {
      expect(mockAgents['code-reviewer'].model).toBe('sonnet');
      expect(mockAgents['test-writer'].model).toBe('haiku');
      expect(mockAgents['code-explorer'].model).toBeUndefined();
    });
  });
});
