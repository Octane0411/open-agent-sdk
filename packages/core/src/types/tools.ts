/**
 * Tool type definitions for Open Agent SDK
 */

import { z } from 'zod';
import type { LLMProvider } from '../providers/base.js';

/** JSON Schema type for tool parameters */
export type JSONSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

/** Tool definition - describes a tool to the LLM */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/** Tool execution context */
export interface ToolContext {
  cwd: string;
  env: Record<string, string>;
  abortController?: AbortController;
  /** Provider for LLM operations (used by WebFetch and similar tools) */
  provider?: LLMProvider;
  /** Model identifier for LLM operations */
  model?: string;
}

/** Base tool input - any object (validation happens at runtime) */
export type ToolInput = unknown;

/** Base tool output - any object */
export type ToolOutput = unknown;

/** Tool handler function type */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ToolContext
) => Promise<TOutput> | TOutput;

/** Complete tool implementation */
export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: JSONSchema;
  handler: ToolHandler<TInput, TOutput>;
}

/** Helper to create a tool definition */
export function createToolDefinition(
  name: string,
  description: string,
  parameters: JSONSchema
): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters,
    },
  };
}

/** Zod schema helpers for common types */
export const ToolSchemas = {
  filePath: z.string().describe('Absolute or relative file path'),
  offset: z.number().int().min(1).optional().describe('Starting line number (1-indexed)'),
  limit: z.number().int().min(1).optional().describe('Maximum number of lines to read'),
  timeout: z.number().int().min(0).max(600000).optional().describe('Timeout in milliseconds (max 600000)'),
  command: z.string().describe('Shell command to execute'),
  description: z.string().max(100).optional().describe('Brief description (5-10 words)'),
};
