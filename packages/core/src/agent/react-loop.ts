/**
 * ReAct (Reasoning + Acting) loop implementation
 * Core agent logic for tool use and reasoning
 */

import type { LLMProvider, ChatOptions } from '../providers/base';
import type { ToolRegistry } from '../tools/registry';
import type { Tool, ToolContext } from '../types/tools';
import type { SkillRegistry } from '../skills/types';
import { preprocessContent } from '../skills/preprocessor';
import { logger } from '../utils/logger';
import { generateUUID } from '../utils/uuid';
import {
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKToolResultMessage,
  type SDKSkillSystemMessage,
  type ToolCall,
  type CreateAssistantMessageOptions,
  createUserMessage,
  createSystemMessage,
  createAssistantMessage,
  createToolResultMessage,
  createCompactBoundaryMessage,
  createSkillSystemMessage,
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
  createUserPromptSubmitInput,
  createStopInput,
  createPreCompactInput,
} from '../hooks/inputs';
import type { SyncHookJSONOutput } from '../hooks/types';
import type { OutputFormat } from '../types/output-format';
import { PermissionManager } from '../permissions/manager';
import type { PermissionMode, CanUseTool, PermissionCheckResult } from '../permissions/types';

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
  /** Auto-compact threshold (token count), undefined means no auto-compaction */
  autoCompactThreshold?: number;
  /** Number of recent conversation rounds to preserve during compaction (default: 2) */
  preserveRecentRounds?: number;
  /** Skill registry for loading skills */
  skillRegistry?: SkillRegistry;
  /** Output format for structured responses */
  outputFormat?: OutputFormat;
}

export interface ReActResult {
  result: string;
  messages: SDKMessage[];
  turnCount: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  /** Whether the execution resulted in an error or was aborted */
  isError?: boolean;
  /** Structured output when outputFormat is configured */
  structuredOutput?: unknown;
}

/** Stream event types for ReActLoop.runStream() */
export type ReActStreamEvent =
  | { type: 'assistant'; message: SDKAssistantMessage }
  | { type: 'skill_system'; message: SDKSkillSystemMessage }
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

    // Trigger UserPromptSubmit hook
    const userPromptSubmitInput = createUserPromptSubmitInput(
      this.sessionId,
      this.config.cwd ?? process.cwd(),
      userPrompt
    );
    await this.hookManager.emit('UserPromptSubmit', userPromptSubmitInput, undefined);

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
          isError: true,
        };
      }

      turnCount++;

      // Check for abort again after incrementing turn count
      // This prevents race conditions where abort was triggered between the start of the loop and turnCount++
      if (this.config.abortController?.signal.aborted) {
        return {
          result: 'Operation aborted',
          messages,
          turnCount,
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          },
          isError: true,
        };
      }

      // Call LLM
      let assistantMessage: SDKAssistantMessage;
      try {
        assistantMessage = await this.callLLM(
          messages,
          toolDefinitions,
          (tokens) => {
            totalInputTokens += tokens.input;
            totalOutputTokens += tokens.output;
          }
        );
      } catch (error) {
        // Handle abort error from provider
        if (error instanceof Error && error.message === 'Operation aborted') {
          return {
            result: 'Operation aborted',
            messages,
            turnCount,
            usage: {
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
            },
            isError: true,
          };
        }
        throw error;
      }

      messages.push(assistantMessage);

      // Check for auto-compaction after each LLM call
      if (
        this.config.autoCompactThreshold !== undefined &&
        totalInputTokens > this.config.autoCompactThreshold
      ) {
        logger.debug('[ReActLoop] Auto-compaction triggered:', {
          threshold: this.config.autoCompactThreshold,
          currentTokens: totalInputTokens,
        });

        const compactResult = await this.compact(messages, 'auto', totalInputTokens);

        if (compactResult.summaryGenerated) {
          // Replace messages with compacted version
          messages.length = 0;
          messages.push(...compactResult.messages);
          logger.debug('[ReActLoop] Auto-compaction completed:', {
            preservedRounds: compactResult.preservedRounds,
            newMessageCount: messages.length,
          });
        }
      }

      // Check if assistant wants to use tools
      const assistantToolCalls = assistantMessage.message.tool_calls;
      if (assistantToolCalls && assistantToolCalls.length > 0) {
        // Execute tools and add results
        for (const toolCall of assistantToolCalls) {
          const result = await this.executeTool(toolCall, availableTools, toolContext);

          // If this was a Skill tool, insert skill system message before tool result
          if (result.skillResult) {
            messages.push(
              createSkillSystemMessage(
                result.skillResult.name,
                result.skillResult.content,
                this.sessionId,
                generateUUID()
              )
            );
          }

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
        // No tool calls - agent produced final answer
        // Trigger Stop hook — allows hooks to request continuation via { continue: true }
        const shouldContinue = await this.emitStopHook();
        if (shouldContinue) {
          // Hook requested continuation — keep looping
          continue;
        }

        const textContent = assistantMessage.message.content.find((c) => c.type === 'text');
        return {
          result: textContent?.text ?? '',
          messages,
          turnCount,
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          },
          structuredOutput: (this as unknown as { lastStructuredOutput: unknown }).lastStructuredOutput,
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
      isError: true,
      structuredOutput: (this as unknown as { lastStructuredOutput: unknown }).lastStructuredOutput,
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

    // Trigger UserPromptSubmit hook
    const userPromptSubmitInput = createUserPromptSubmitInput(
      this.sessionId,
      this.config.cwd ?? process.cwd(),
      userPrompt
    );
    await this.hookManager.emit('UserPromptSubmit', userPromptSubmitInput, undefined);

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
      let assistantMessage: SDKAssistantMessage;
      try {
        assistantMessage = await this.callLLM(
          messages,
          toolDefinitions,
          (tokens) => {
            totalInputTokens += tokens.input;
            totalOutputTokens += tokens.output;
          }
        );
      } catch (error) {
        // Handle abort error from provider
        if (error instanceof Error && error.message === 'Operation aborted') {
          yield { type: 'done', result: 'Operation aborted' };

          // Trigger SessionEnd hook on abort
          const sessionEndInput = createSessionEndInput(
            this.sessionId,
            this.config.cwd ?? process.cwd(),
            'abort'
          );
          await this.hookManager.emit('SessionEnd', sessionEndInput, undefined);
          return;
        }
        throw error;
      }

      messages.push(assistantMessage);
      yield { type: 'assistant', message: assistantMessage };

      // Check for auto-compaction after each LLM call
      if (
        this.config.autoCompactThreshold !== undefined &&
        totalInputTokens > this.config.autoCompactThreshold
      ) {
        logger.debug('[ReActLoop] Auto-compaction triggered in stream:', {
          threshold: this.config.autoCompactThreshold,
          currentTokens: totalInputTokens,
        });

        const compactResult = await this.compact(messages, 'auto', totalInputTokens);

        if (compactResult.summaryGenerated) {
          // Replace messages with compacted version
          messages.length = 0;
          messages.push(...compactResult.messages);
          logger.debug('[ReActLoop] Auto-compaction completed in stream:', {
            preservedRounds: compactResult.preservedRounds,
            newMessageCount: messages.length,
          });
        }
      }

      // Check if assistant wants to use tools
      const assistantToolCalls = assistantMessage.message.tool_calls;
      if (assistantToolCalls && assistantToolCalls.length > 0) {
        // Execute tools and add results
        for (const toolCall of assistantToolCalls) {
          const result = await this.executeTool(toolCall, availableTools, toolContext);

          // If this was a Skill tool, insert skill system message before tool result
          if (result.skillResult) {
            const skillSystemMessage = createSkillSystemMessage(
              result.skillResult.name,
              result.skillResult.content,
              this.sessionId,
              generateUUID()
            );
            messages.push(skillSystemMessage);
            yield { type: 'skill_system', message: skillSystemMessage };
          }

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
        // No tool calls - agent produced final answer
        // Trigger Stop hook — allows hooks to request continuation via { continue: true }
        const shouldContinue = await this.emitStopHook();
        if (shouldContinue) {
          // Hook requested continuation — keep looping
          continue;
        }

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

  /**
   * Get the hook manager instance
   * Used for testing and inspection
   */
  getHookManager(): HookManager {
    return this.hookManager;
  }

  /**
   * Compact conversation history to reduce token usage.
   * Generates a summary of older messages and preserves recent rounds.
   *
   * @param messages - Current conversation messages
   * @param trigger - What triggered the compaction ('manual' or 'auto')
   * @param preTokens - Token count before compaction
   * @returns Compacted messages and metadata
   */
  async compact(
    messages: SDKMessage[],
    trigger: 'manual' | 'auto',
    preTokens: number
  ): Promise<{
    messages: SDKMessage[];
    preTokens: number;
    trigger: 'manual' | 'auto';
    preservedRounds: number;
    summaryGenerated: boolean;
  }> {
    const preserveRecentRounds = this.config.preserveRecentRounds ?? 2;

    // Separate system messages from conversation messages
    const systemInitMsg = messages.find(
      (m): m is typeof m & { subtype: 'init' } =>
        m.type === 'system' && 'subtype' in m && m.subtype === 'init'
    );

    // Get conversation messages (non-system)
    const conversationMessages = messages.filter(
      (m) => m.type !== 'system' || ('subtype' in m && m.subtype !== 'init')
    );

    // Group messages into rounds (user -> assistant -> optional tool results)
    const rounds: SDKMessage[][] = [];
    let currentRound: SDKMessage[] = [];

    for (const msg of conversationMessages) {
      if (msg.type === 'user') {
        // Start a new round
        if (currentRound.length > 0) {
          rounds.push(currentRound);
        }
        currentRound = [msg];
      } else {
        // Add to current round (assistant or tool_result)
        currentRound.push(msg);
      }
    }
    // Don't forget the last round
    if (currentRound.length > 0) {
      rounds.push(currentRound);
    }

    // Determine which rounds to preserve and which to summarize
    const totalRounds = rounds.length;
    const roundsToPreserve = Math.min(preserveRecentRounds, totalRounds);
    const roundsToSummarize = totalRounds - roundsToPreserve;

    if (roundsToSummarize <= 0) {
      // Nothing to compact
      return {
        messages,
        preTokens,
        trigger,
        preservedRounds: totalRounds,
        summaryGenerated: false,
      };
    }

    // Trigger PreCompact hook
    const preCompactInput = createPreCompactInput(
      this.sessionId,
      this.config.cwd ?? process.cwd(),
      trigger,
      null // custom_instructions - can be modified by hooks in future
    );
    const preCompactResults = await this.hookManager.emit('PreCompact', preCompactInput, undefined);

    // Check if any hook blocked the compaction
    for (const result of preCompactResults) {
      if (result && typeof result === 'object' && 'stopReason' in result) {
        const syncResult = result as { stopReason?: string };
        if (syncResult.stopReason) {
          logger.debug('[ReActLoop] PreCompact hook blocked compaction:', syncResult.stopReason);
          return {
            messages,
            preTokens,
            trigger,
            preservedRounds: totalRounds,
            summaryGenerated: false,
          };
        }
      }
    }

    // Messages to summarize (older rounds)
    const messagesToSummarize = rounds.slice(0, roundsToSummarize).flat();

    // Generate summary
    const summary = await this.generateSummary(messagesToSummarize);

    // Create compact boundary message
    const boundaryMessage = createCompactBoundaryMessage(
      this.sessionId,
      generateUUID(),
      trigger,
      preTokens
    );

    // Create summary message as an assistant message
    const summaryMessage = createAssistantMessage(
      [{ type: 'text', text: `Summary of previous conversation:\n${summary}` }],
      this.sessionId,
      generateUUID()
    );

    // Messages to preserve (recent rounds)
    const preservedMessages = rounds.slice(roundsToSummarize).flat();

    // Build compacted message list
    const compactedMessages: SDKMessage[] = [
      ...(systemInitMsg ? [systemInitMsg as SDKMessage] : []),
      boundaryMessage,
      summaryMessage,
      ...preservedMessages,
    ];

    return {
      messages: compactedMessages,
      preTokens,
      trigger,
      preservedRounds: roundsToPreserve,
      summaryGenerated: true,
    };
  }

  /**
   * Generate a summary of conversation messages using the LLM.
   */
  private async generateSummary(messages: SDKMessage[]): Promise<string> {
    const summaryPrompt = `Please summarize the following conversation history, keeping key information:
1. The user's original request/goal
2. Major steps completed so far
3. Important file modifications or code changes
4. Current pending tasks or unfinished work
5. Any significant errors and their solutions

Conversation history:
${JSON.stringify(messages, null, 2)}

Generate a concise but comprehensive summary.`;

    try {
      // Use the provider to generate summary
      const chatOptions = {
        systemInstruction: 'You are a helpful assistant that summarizes conversations concisely.',
      };

      // Create a minimal message list for summary generation
      const summaryMessages: SDKMessage[] = [
        createUserMessage(summaryPrompt, this.sessionId, generateUUID()),
      ];

      const stream = this.provider.chat(
        summaryMessages,
        [],
        this.config.abortController?.signal,
        chatOptions
      );

      let summary = '';
      for await (const chunk of stream) {
        if (chunk.type === 'content' && chunk.delta) {
          summary += chunk.delta;
        }
      }

      return summary.trim() || 'No summary available.';
    } catch (error) {
      logger.warn('[ReActLoop] Failed to generate summary:', error);
      return 'Summary generation failed. Continuing with preserved context.';
    }
  }

  /**
   * Emit the Stop hook and check if any handler requests continuation.
   * Returns true if the loop should continue (hook returned { continue: true }).
   */
  private async emitStopHook(): Promise<boolean> {
    const stopInput = createStopInput(
      this.sessionId,
      this.config.cwd ?? process.cwd(),
      true // stop_hook_active
    );
    const results = await this.hookManager.emit('Stop', stopInput, undefined);

    // Check if any hook result requests continuation
    for (const result of results) {
      if (result && typeof result === 'object' && 'continue' in result) {
        const syncResult = result as SyncHookJSONOutput;
        if (syncResult.continue === true) {
          logger.debug('[ReActLoop] Stop hook requested continuation');
          return true;
        }
      }
    }
    return false;
  }

  private async callLLM(
    messages: SDKMessage[],
    tools: ReturnType<ToolRegistry['getDefinitions']>,
    onUsage: (tokens: { input: number; output: number }) => void
  ): Promise<SDKAssistantMessage> {
    // Pass system prompt via ChatOptions, not in messages
    // Also pass outputSchema if outputFormat is configured
    const chatOptions: ChatOptions = {
      systemInstruction: this.config.systemPrompt,
      outputSchema: this.config.outputFormat?.schema as Record<string, unknown> | undefined,
    };
    const stream = this.provider.chat(messages, tools, this.config.abortController?.signal, chatOptions);

    let content = '';
    const toolCalls: Map<string, ToolCall> = new Map();
    let inputTokens = 0;
    let outputTokens = 0;
    let structuredOutput: unknown = undefined;

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

        case 'structured_output':
          // Capture structured output when outputFormat is configured
          if (chunk.structured_output !== undefined) {
            structuredOutput = chunk.structured_output;
          }
          break;

        case 'usage':
          if (chunk.usage) {
            inputTokens = chunk.usage.input_tokens;
            outputTokens = chunk.usage.output_tokens;
          }
          break;

        case 'error':
          if (chunk.error) {
            throw new Error(chunk.error);
          }
          break;
      }
    }

    onUsage({ input: inputTokens, output: outputTokens });

    // Store structured output on the instance for retrieval
    if (structuredOutput !== undefined) {
      (this as unknown as { lastStructuredOutput: unknown }).lastStructuredOutput = structuredOutput;
    }

    const contentBlocks: { type: 'text'; text: string }[] = content
      ? [{ type: 'text', text: content }]
      : [];

    const hasToolCalls = toolCalls.size > 0;
    const messageOptions: CreateAssistantMessageOptions = {
      model: this.provider.getModel(),
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      stop_reason: hasToolCalls ? 'tool_use' : 'end_turn',
    };

    return createAssistantMessage(
      contentBlocks,
      this.sessionId,
      generateUUID(),
      null,
      hasToolCalls ? Array.from(toolCalls.values()) : undefined,
      messageOptions
    );
  }

  private async executeTool(
    toolCall: ToolCall,
    availableTools: Tool[],
    context: ToolContext
  ): Promise<{ content: string; isError: boolean; skillResult?: { name: string; content: string } }> {
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

    // Special handling for AskUserQuestion tool
    if (toolCall.function.name === 'AskUserQuestion') {
      // AskUserQuestion requires canUseTool callback
      if (!this.config.canUseTool) {
        return {
          content: 'Error: AskUserQuestion requires a canUseTool callback to be configured. The tool cannot function without user interaction capability.',
          isError: true,
        };
      }
      // If canUseTool exists, it will be handled by the normal permission flow
      // The canUseTool callback will fill in the answers via updatedInput
    }

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
    // For AskUserQuestion, add 60-second timeout
    let permissionResult: PermissionCheckResult;

    if (toolCall.function.name === 'AskUserQuestion') {
      const timeoutMs = 60_000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AskUserQuestion timed out after 60 seconds')), timeoutMs)
      );

      try {
        permissionResult = await Promise.race([
          this.permissionManager.checkPermission(
            toolCall.function.name,
            modifiedInput as Record<string, unknown>,
            { signal: this.config.abortController?.signal ?? new AbortController().signal }
          ),
          timeoutPromise,
        ]);
      } catch (error) {
        return {
          content: `Error: ${error instanceof Error ? error.message : 'AskUserQuestion timed out'}`,
          isError: true,
        };
      }
    } else {
      permissionResult = await this.permissionManager.checkPermission(
        toolCall.function.name,
        modifiedInput as Record<string, unknown>,
        { signal: this.config.abortController?.signal ?? new AbortController().signal }
      );
    }

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

      // Special handling for Skill tool - look up skill and return content for system message
      if (toolCall.function.name === 'Skill' && this.config.skillRegistry) {
        const skillInput = finalInput as { name: string };
        const skill = this.config.skillRegistry.get(skillInput.name);

        if (skill) {
          // Preprocess skill content (substitute $ARGUMENTS if any)
          const processedContent = preprocessContent(skill.content, { arguments: '' });

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
            content: JSON.stringify({ loaded: true, skill_name: skill.frontmatter.name }),
            isError: false,
            skillResult: {
              name: skill.frontmatter.name,
              content: processedContent,
            },
          };
        } else {
          // Skill not found
          return {
            content: JSON.stringify({ loaded: false, skill_name: skillInput.name, error: `Skill "${skillInput.name}" not found` }),
            isError: true,
          };
        }
      }

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
