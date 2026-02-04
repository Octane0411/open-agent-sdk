/**
 * ReAct (Reasoning + Acting) loop implementation
 * Core agent logic for tool use and reasoning
 */

import type { LLMProvider, ChatOptions } from '../providers/base';
import type { ToolRegistry } from '../tools/registry';
import type { Tool, ToolContext } from '../types/tools';
import { logger } from '../utils/logger';
import {
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKToolResultMessage,
  type ToolCall,
  type UUID,
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createToolResultMessage,
} from '../types/messages';
import { HookManager } from '../hooks/manager';
import type { HooksConfig } from '../hooks/types';
import {
  createPreToolUseInput,
  createPostToolUseInput,
  createSessionStartInput,
  createSessionEndInput,
  createPermissionRequestInput,
  createPostToolUseFailureInput,
} from '../hooks/inputs';
import { PermissionManager } from '../permissions/manager';
import type { PermissionMode, CanUseTool } from '../permissions/types';

/** Generate a simple UUID v4 */
function generateUUID(): UUID {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ReActLoopConfig {
  maxTurns: number;
  systemPrompt?: string;
  allowedTools?: string[];
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  // Additional config options aligned with Claude Agent SDK
  apiKeySource?: 'env' | 'keychain' | 'custom';
  /** Permission mode for tool execution (default: 'default') */
  permissionMode?: PermissionMode;
  /** Required to be true when using bypassPermissions mode */
  allowDangerouslySkipPermissions?: boolean;
  /** Custom callback for tool permission checks */
  canUseTool?: CanUseTool;
  /** MCP servers configuration */
  mcpServers?: Record<string, unknown>;
  /** Hooks manager or config */
  hooks?: HookManager | HooksConfig;
}

export interface ReActResult {
  result: string;
  messages: SDKMessage[];
  turnCount: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Stream event types for ReActLoop.runStream() */
export type ReActStreamEvent =
  | { type: 'assistant'; message: SDKAssistantMessage }
  | { type: 'tool_result'; message: SDKToolResultMessage }
  | { type: 'usage'; usage: { input_tokens: number; output_tokens: number } }
  | { type: 'done'; result: string };

export class ReActLoop {
  private provider: LLMProvider;
  private toolRegistry: ToolRegistry;
  private config: ReActLoopConfig;
  private sessionId: string;
  private hookManager: HookManager;
  private permissionManager: PermissionManager;

  constructor(
    provider: LLMProvider,
    toolRegistry: ToolRegistry,
    config: ReActLoopConfig,
    sessionId?: string
  ) {
    this.provider = provider;
    this.toolRegistry = toolRegistry;
    this.config = {
      maxTurns: config.maxTurns,
      systemPrompt: config.systemPrompt,
      allowedTools: config.allowedTools,
      cwd: config.cwd ?? process.cwd(),
      env: config.env ?? {},
      abortController: config.abortController,
      permissionMode: config.permissionMode,
      allowDangerouslySkipPermissions: config.allowDangerouslySkipPermissions,
      canUseTool: config.canUseTool,
      mcpServers: config.mcpServers,
      hooks: config.hooks,
    };
    this.sessionId = sessionId ?? generateUUID();

    // Initialize HookManager
    if (config.hooks instanceof HookManager) {
      this.hookManager = config.hooks;
    } else if (config.hooks) {
      this.hookManager = new HookManager(config.hooks);
    } else {
      this.hookManager = new HookManager();
    }

    // Initialize PermissionManager
    this.permissionManager = new PermissionManager({
      mode: config.permissionMode ?? 'default',
      allowDangerouslySkipPermissions: config.allowDangerouslySkipPermissions ?? false,
      canUseTool: config.canUseTool,
    });
  }

  /**
   * Get the permission manager instance
   * Used for testing and inspection
   */
  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  async run(userPrompt: string): Promise<ReActResult> {
    const messages: SDKMessage[] = [];

    // Add system message metadata if system prompt is configured
    // The actual system prompt content is passed via ChatOptions to the provider
    if (this.config.systemPrompt) {
      messages.push(
        createSystemMessage(
          this.provider.getModel(),
          this.provider.constructor.name.toLowerCase().replace('provider', ''),
          this.config.allowedTools ?? this.toolRegistry.getAll().map((t) => t.name),
          this.config.cwd ?? process.cwd(),
          this.sessionId,
          generateUUID(),
          {
            permissionMode: this.config.permissionMode,
          }
        )
      );
    }

    // Add user message
    messages.push(createUserMessage(userPrompt, this.sessionId, generateUUID()));

    let turnCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Get allowed tools
    const availableTools = this.config.allowedTools
      ? this.toolRegistry.getAllowedTools(this.config.allowedTools)
      : this.toolRegistry.getAll();

    const toolDefinitions = availableTools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const toolContext: ToolContext = {
      cwd: this.config.cwd!,
      env: this.config.env!,
      abortController: this.config.abortController,
      provider: this.provider,
    };

    while (turnCount < this.config.maxTurns) {
      // Check for abort
      if (this.config.abortController?.signal.aborted) {
        return {
          result: 'Operation aborted',
          messages,
          turnCount,
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          },
        };
      }

      turnCount++;

      // Call LLM
      const assistantMessage = await this.callLLM(
        messages,
        toolDefinitions,
        (tokens) => {
          totalInputTokens += tokens.input;
          totalOutputTokens += tokens.output;
        }
      );

      messages.push(assistantMessage);

      // Check if assistant wants to use tools
      const assistantToolCalls = assistantMessage.message.tool_calls;
      if (assistantToolCalls && assistantToolCalls.length > 0) {
        // Execute tools and add results
        for (const toolCall of assistantToolCalls) {
          const result = await this.executeTool(toolCall, availableTools, toolContext);
          messages.push(
            createToolResultMessage(
              toolCall.id,
              toolCall.function.name,
              result.content,
              result.isError,
              this.sessionId,
              generateUUID()
            )
          );
        }
      } else {
        // No tool calls - we have the final answer
        const textContent = assistantMessage.message.content.find((c) => c.type === 'text');
        return {
          result: textContent?.text ?? '',
          messages,
          turnCount,
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          },
        };
      }
    }

    // Max turns reached
    return {
      result: 'Maximum turns reached without completion',
      messages,
      turnCount,
      usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
      },
    };
  }

  /**
   * Run the ReAct loop with streaming output
   * Yields events for assistant messages, tool results, usage stats, and completion
   * @param userPrompt - The current user message content
   * @param history - Previous conversation messages (optional)
   */
  async *runStream(
    userPrompt: string,
    history: SDKMessage[] = []
  ): AsyncGenerator<ReActStreamEvent> {
    // Trigger SessionStart hook
    const sessionStartInput = createSessionStartInput(
      this.sessionId,
      this.config.cwd ?? process.cwd(),
      history.length > 0 ? 'resume' : 'startup'
    );
    await this.hookManager.emit('SessionStart', sessionStartInput, undefined);

    // Check if history already has a system message (metadata)
    const hasSystemInHistory = history.some((msg) => msg.type === 'system');

    const messages: SDKMessage[] = [
      // Add system message metadata if system prompt is configured and not already in history
      // The actual system prompt content is passed via ChatOptions to the provider
      ...(this.config.systemPrompt && !hasSystemInHistory
        ? [
            createSystemMessage(
              this.provider.getModel(),
              this.provider.constructor.name.toLowerCase().replace('provider', ''),
              this.config.allowedTools ?? this.toolRegistry.getAll().map((t) => t.name),
              this.config.cwd ?? process.cwd(),
              this.sessionId,
              generateUUID(),
              {
                permissionMode: this.config.permissionMode,
              }
            ),
          ]
        : []),
      // Add history messages
      ...history,
      // Add current user message
      createUserMessage(userPrompt, this.sessionId, generateUUID()),
    ];
    logger.debug('[ReActLoop] Total messages:', messages.length);
    logger.debug('[ReActLoop] Messages:', JSON.stringify(messages, null, 2));

    let turnCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Get allowed tools
    const availableTools = this.config.allowedTools
      ? this.toolRegistry.getAllowedTools(this.config.allowedTools)
      : this.toolRegistry.getAll();

    const toolDefinitions = availableTools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const toolContext: ToolContext = {
      cwd: this.config.cwd!,
      env: this.config.env!,
      abortController: this.config.abortController,
      provider: this.provider,
    };

    while (turnCount < this.config.maxTurns) {
      // Check for abort
      if (this.config.abortController?.signal.aborted) {
        yield {
          type: 'done',
          result: 'Operation aborted',
        };

        // Trigger SessionEnd hook on abort
        const sessionEndInput = createSessionEndInput(
          this.sessionId,
          this.config.cwd ?? process.cwd(),
          'abort'
        );
        await this.hookManager.emit('SessionEnd', sessionEndInput, undefined);
        return;
      }

      turnCount++;

      // Call LLM
      const assistantMessage = await this.callLLM(
        messages,
        toolDefinitions,
        (tokens) => {
          totalInputTokens += tokens.input;
          totalOutputTokens += tokens.output;
        }
      );

      messages.push(assistantMessage);
      yield { type: 'assistant', message: assistantMessage };

      // Check if assistant wants to use tools
      const assistantToolCalls = assistantMessage.message.tool_calls;
      if (assistantToolCalls && assistantToolCalls.length > 0) {
        // Execute tools and add results
        for (const toolCall of assistantToolCalls) {
          const result = await this.executeTool(toolCall, availableTools, toolContext);
          const toolResultMessage = createToolResultMessage(
            toolCall.id,
            toolCall.function.name,
            result.content,
            result.isError,
            this.sessionId,
            generateUUID()
          );
          messages.push(toolResultMessage);
          yield { type: 'tool_result', message: toolResultMessage };
        }
      } else {
        // No tool calls - we have the final answer
        const textContent = assistantMessage.message.content.find((c) => c.type === 'text');
        const result = textContent?.text ?? '';
        yield { type: 'usage', usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } };
        yield { type: 'done', result };

        // Trigger SessionEnd hook on successful completion
        const sessionEndInput = createSessionEndInput(
          this.sessionId,
          this.config.cwd ?? process.cwd(),
          'completed'
        );
        await this.hookManager.emit('SessionEnd', sessionEndInput, undefined);
        return;
      }
    }

    // Max turns reached
    yield { type: 'usage', usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } };
    yield { type: 'done', result: 'Maximum turns reached without completion' };

    // Trigger SessionEnd hook
    const sessionEndInput = createSessionEndInput(
      this.sessionId,
      this.config.cwd ?? process.cwd(),
      'max_turns_reached'
    );
    await this.hookManager.emit('SessionEnd', sessionEndInput, undefined);
  }

  private async callLLM(
    messages: SDKMessage[],
    tools: ReturnType<ToolRegistry['getDefinitions']>,
    onUsage: (tokens: { input: number; output: number }) => void
  ): Promise<SDKAssistantMessage> {
    // Pass system prompt via ChatOptions, not in messages
    const chatOptions: ChatOptions = {
      systemInstruction: this.config.systemPrompt,
    };
    const stream = this.provider.chat(messages, tools, this.config.abortController?.signal, chatOptions);

    let content = '';
    const toolCalls: Map<string, ToolCall> = new Map();
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'content':
          if (chunk.delta) {
            content += chunk.delta;
          }
          break;

        case 'tool_call':
          if (chunk.tool_call) {
            const existing = toolCalls.get(chunk.tool_call.id);
            if (existing) {
              existing.function.arguments += chunk.tool_call.arguments;
            } else {
              toolCalls.set(chunk.tool_call.id, {
                id: chunk.tool_call.id,
                type: 'function',
                function: {
                  name: chunk.tool_call.name,
                  arguments: chunk.tool_call.arguments,
                },
              });
            }
          }
          break;

        case 'usage':
          if (chunk.usage) {
            inputTokens = chunk.usage.input_tokens;
            outputTokens = chunk.usage.output_tokens;
          }
          break;
      }
    }

    onUsage({ input: inputTokens, output: outputTokens });

    const contentBlocks: { type: 'text'; text: string }[] = content
      ? [{ type: 'text', text: content }]
      : [];

    return createAssistantMessage(
      contentBlocks,
      this.sessionId,
      generateUUID(),
      null,
      toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined
    );
  }

  private async executeTool(
    toolCall: ToolCall,
    availableTools: Tool[],
    context: ToolContext
  ): Promise<{ content: string; isError: boolean }> {
    const tool = availableTools.find((t) => t.name === toolCall.function.name);

    if (!tool) {
      return {
        content: `Error: Tool "${toolCall.function.name}" not found`,
        isError: true,
      };
    }

    let args: unknown;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (error) {
      return {
        content: `Error: Invalid JSON arguments - ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }

    const cwd = this.config.cwd ?? process.cwd();

    // Trigger PreToolUse hook
    const preToolInput = createPreToolUseInput(
      this.sessionId,
      cwd,
      toolCall.function.name,
      args
    );
    const preToolResults = await this.hookManager.emitForTool(
      'PreToolUse',
      preToolInput,
      toolCall.function.name,
      toolCall.id
    );

    // Check if any PreToolUse hook denied the tool
    const hookDenial = preToolResults.find((r): r is {
      hookSpecificOutput: { hookEventName: 'PreToolUse'; permissionDecision: 'deny'; permissionDecisionReason?: string }
    } =>
      r !== null && r !== undefined && typeof r === 'object' && 'hookSpecificOutput' in r &&
      (r as Record<string, unknown>).hookSpecificOutput !== undefined &&
      ((r as Record<string, unknown>).hookSpecificOutput as Record<string, unknown>)?.hookEventName === 'PreToolUse' &&
      ((r as Record<string, unknown>).hookSpecificOutput as Record<string, unknown>)?.permissionDecision === 'deny'
    );

    if (hookDenial) {
      const errorMsg = hookDenial.hookSpecificOutput?.permissionDecisionReason || 'Tool denied by PreToolUse hook';

      // Trigger PermissionRequest hook
      const permissionRequestInput = createPermissionRequestInput(
        this.sessionId,
        cwd,
        toolCall.function.name,
        args
      );
      await this.hookManager.emit('PermissionRequest', permissionRequestInput, toolCall.id);

      return {
        content: `Error: ${errorMsg}`,
        isError: true,
      };
    }

    // Apply any input modifications from PreToolUse hooks
    let modifiedInput = args;
    const inputModification = preToolResults.find((r): r is {
      hookSpecificOutput: { hookEventName: 'PreToolUse'; updatedInput: Record<string, unknown> }
    } =>
      r !== null && r !== undefined && typeof r === 'object' && 'hookSpecificOutput' in r &&
      (r as Record<string, unknown>).hookSpecificOutput !== undefined &&
      ((r as Record<string, unknown>).hookSpecificOutput as Record<string, unknown>)?.hookEventName === 'PreToolUse' &&
      ((r as Record<string, unknown>).hookSpecificOutput as Record<string, unknown>)?.updatedInput !== undefined
    );

    if (inputModification?.hookSpecificOutput?.updatedInput) {
      modifiedInput = inputModification.hookSpecificOutput.updatedInput;
    }

    // Check permissions using PermissionManager
    const permissionResult = await this.permissionManager.checkPermission(
      toolCall.function.name,
      modifiedInput as Record<string, unknown>,
      { signal: this.config.abortController?.signal ?? new AbortController().signal }
    );

    if (!permissionResult.approved) {
      // Trigger PermissionRequest hook on denial
      const permissionRequestInput = createPermissionRequestInput(
        this.sessionId,
        cwd,
        toolCall.function.name,
        modifiedInput
      );
      await this.hookManager.emit('PermissionRequest', permissionRequestInput, toolCall.id);

      return {
        content: `Error: ${permissionResult.error || 'Permission denied'}`,
        isError: true,
      };
    }

    // Use modified input from permission check (if any)
    const finalInput = permissionResult.updatedInput ?? modifiedInput;

    try {
      const result = await tool.handler(finalInput, context);

      // Trigger PostToolUse hook
      const postToolInput = createPostToolUseInput(
        this.sessionId,
        cwd,
        toolCall.function.name,
        finalInput,
        result
      );
      await this.hookManager.emitForTool('PostToolUse', postToolInput, toolCall.function.name, toolCall.id);

      return {
        content: JSON.stringify(result),
        isError: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Trigger PostToolUseFailure hook
      const postToolFailureInput = createPostToolUseFailureInput(
        this.sessionId,
        cwd,
        toolCall.function.name,
        finalInput,
        errorMessage
      );
      await this.hookManager.emit('PostToolUseFailure', postToolFailureInput, toolCall.id);

      return {
        content: `Error: ${errorMessage}`,
        isError: true,
      };
    }
  }
}
