/**
 * ATIF (Agent Trajectory Interchange Format) conversion utility
 * Converts SDKMessage[] from session data to ATIF-v1.6 format
 */

import type { SessionData } from '../session/storage';
import type {
  SDKAssistantMessage,
  SDKToolResultMessage,
  SDKResultMessage,
} from '../types/messages';

/** ATIF tool call entry */
export interface ATIFToolCall {
  tool_call_id: string;
  function_name: string;
  arguments: unknown;
}

/** ATIF observation (tool results) */
export interface ATIFObservation {
  results: Array<{
    source_call_id: string;
    content: string;
    is_error?: boolean;
  }>;
}

/** ATIF metrics for a step */
export interface ATIFMetrics {
  prompt_tokens?: number;
  completion_tokens?: number;
}

/** ATIF step entry */
export interface ATIFStep {
  step_id: number;
  source: 'user' | 'agent';
  message?: string;
  tool_calls?: ATIFToolCall[];
  observation?: ATIFObservation;
  metrics?: ATIFMetrics;
}

/** ATIF agent metadata */
export interface ATIFAgent {
  name: string;
  version: string;
  model_name: string;
}

/** ATIF final metrics */
export interface ATIFFinalMetrics {
  prompt_tokens?: number;
  completion_tokens?: number;
  duration_ms?: number;
}

/** ATIF-v1.6 trajectory document */
export interface ATIFTrajectory {
  schema_version: 'ATIF-v1.6';
  session_id: string;
  agent: ATIFAgent;
  steps: ATIFStep[];
  final_metrics?: ATIFFinalMetrics;
}

/** Options for convertToATIF */
export interface ConvertToATIFOptions {
  /** Model name override (defaults to session model) */
  model?: string;
  /** Agent name (defaults to 'open-agent-sdk') */
  agentName?: string;
  /** Agent version (defaults to '0.1.0') */
  agentVersion?: string;
}

/**
 * Convert session data to ATIF-v1.6 trajectory format.
 *
 * Mapping rules:
 * - `user` message → step with source: "user"
 * - `assistant` message (text + tool_use blocks) → step with source: "agent"
 * - `tool_result` message → appended to previous agent step's observation
 * - `result` message → fills final_metrics
 */
export function convertToATIF(
  sessionData: SessionData,
  options: ConvertToATIFOptions = {}
): ATIFTrajectory {
  const agentName = options.agentName ?? 'open-agent-sdk';
  const agentVersion = options.agentVersion ?? '0.1.0';
  const modelName = options.model ?? sessionData.model;

  const steps: ATIFStep[] = [];
  let stepId = 1;
  let finalMetrics: ATIFFinalMetrics | undefined;

  // Track the last agent step index to append tool_results to it
  let lastAgentStepIdx = -1;

  for (const msg of sessionData.messages) {
    if (msg.type === 'user') {
      const content = msg.message.content;
      steps.push({
        step_id: stepId++,
        source: 'user',
        message: content,
      });
      lastAgentStepIdx = -1; // reset after user turn
    } else if (msg.type === 'assistant') {
      const agentMsg = msg as SDKAssistantMessage;

      // Text is in message.content (text blocks only)
      const textParts = agentMsg.message.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // Tool calls are stored in message.tool_calls (separate from content)
      const toolCallsList = agentMsg.message.tool_calls ?? [];

      const step: ATIFStep = {
        step_id: stepId++,
        source: 'agent',
      };

      if (textParts) {
        step.message = textParts;
      }

      if (toolCallsList.length > 0) {
        step.tool_calls = toolCallsList.map((tc) => ({
          tool_call_id: tc.id,
          function_name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || '{}'),
        }));
      }

      lastAgentStepIdx = steps.length;
      steps.push(step);
    } else if (msg.type === 'tool_result') {
      const toolResult = msg as SDKToolResultMessage;

      // Append to last agent step's observation
      if (lastAgentStepIdx >= 0) {
        const agentStep = steps[lastAgentStepIdx];
        if (!agentStep.observation) {
          agentStep.observation = { results: [] };
        }
        agentStep.observation.results.push({
          source_call_id: toolResult.tool_use_id,
          content: typeof toolResult.result === 'string'
            ? toolResult.result
            : JSON.stringify(toolResult.result),
          ...(toolResult.is_error ? { is_error: true } : {}),
        });
      }
    } else if (msg.type === 'result') {
      const resultMsg = msg as SDKResultMessage;
      finalMetrics = {
        prompt_tokens: resultMsg.usage.input_tokens,
        completion_tokens: resultMsg.usage.output_tokens,
        duration_ms: resultMsg.duration_ms,
      };
    }
    // Skip 'system' messages (init, compact_boundary, skill) — not part of trajectory
  }

  return {
    schema_version: 'ATIF-v1.6',
    session_id: sessionData.id,
    agent: {
      name: agentName,
      version: agentVersion,
      model_name: modelName,
    },
    steps,
    ...(finalMetrics ? { final_metrics: finalMetrics } : {}),
  };
}
