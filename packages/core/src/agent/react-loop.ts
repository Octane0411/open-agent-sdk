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
  type PermissionMode,
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createToolResultMessage,
} from '../types/messages';

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
  permissionMode?: PermissionMode;
  mcpServers?: Record<string, unknown>;
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
    };
    this.sessionId = sessionId ?? generateUUID();
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
        return;
      }
    }

    // Max turns reached
    yield { type: 'usage', usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } };
    yield { type: 'done', result: 'Maximum turns reached without completion' };
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

    try {
      const args = JSON.parse(toolCall.function.arguments);
      const result = await tool.handler(args, context);
      return {
        content: JSON.stringify(result),
        isError: false,
      };
    } catch (error) {
      return {
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
}
