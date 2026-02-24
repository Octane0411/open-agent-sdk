/**
 * Output format types for structured LLM responses
 * Allows enforcing JSON Schema output from the model
 */

/**
 * JSON Schema definition for structured output
 * Supports object schemas with properties, required fields, etc.
 */
export interface JsonSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

/**
 * Output format configuration
 * Currently supports json_schema type for structured output
 */
export interface OutputFormat {
  type: 'json_schema';
  /** Name identifier for the schema */
  name?: string;
  /** The JSON schema definition */
  schema: JsonSchema;
  /** Optional description of what the schema represents */
  description?: string;
}

/**
 * Zod-like schema builder for common use cases
 * Provides a simple way to create JSON schemas
 */
export const Schema = {
  /**
   * Create an object schema
   */
  object(
    properties: Record<string, unknown>,
    options?: { required?: string[]; additionalProperties?: boolean; description?: string }
  ): JsonSchema {
    return {
      type: 'object',
      properties,
      required: options?.required,
      additionalProperties: options?.additionalProperties ?? false,
      description: options?.description,
    };
  },

  /**
   * Create a string property
   */
  string(options?: { description?: string; enum?: string[] }): unknown {
    const schema: Record<string, unknown> = { type: 'string' };
    if (options?.description) schema.description = options.description;
    if (options?.enum) schema.enum = options.enum;
    return schema;
  },

  /**
   * Create a number property
   */
  number(options?: { description?: string }): unknown {
    const schema: Record<string, unknown> = { type: 'number' };
    if (options?.description) schema.description = options.description;
    return schema;
  },

  /**
   * Create an integer property
   */
  integer(options?: { description?: string }): unknown {
    const schema: Record<string, unknown> = { type: 'integer' };
    if (options?.description) schema.description = options.description;
    return schema;
  },

  /**
   * Create a boolean property
   */
  boolean(options?: { description?: string }): unknown {
    const schema: Record<string, unknown> = { type: 'boolean' };
    if (options?.description) schema.description = options.description;
    return schema;
  },

  /**
   * Create an array property
   */
  array(items: unknown, options?: { description?: string }): unknown {
    const schema: Record<string, unknown> = { type: 'array', items };
    if (options?.description) schema.description = options.description;
    return schema;
  },
};
