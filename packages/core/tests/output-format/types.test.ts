/**
 * Tests for output format types
 */

import { describe, test, expect } from 'bun:test';
import { Schema, type JsonSchema, type OutputFormat } from '../../src/types/output-format';

describe('OutputFormat Types', () => {
  test('Schema.object creates valid JSON schema', () => {
    const schema = Schema.object({
      name: Schema.string({ description: 'The name' }),
      age: Schema.number({ description: 'The age' }),
    }, {
      required: ['name'],
      description: 'A person schema',
    });

    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('name');
    expect(schema.properties).toHaveProperty('age');
    expect(schema.required).toContain('name');
    expect(schema.description).toBe('A person schema');
  });

  test('Schema.string creates string property', () => {
    const prop = Schema.string({ description: 'A string field' });
    expect(prop).toEqual({ type: 'string', description: 'A string field' });
  });

  test('Schema.string with enum creates enum property', () => {
    const prop = Schema.string({ enum: ['high', 'medium', 'low'] });
    expect(prop).toEqual({ type: 'string', enum: ['high', 'medium', 'low'] });
  });

  test('Schema.number creates number property', () => {
    const prop = Schema.number({ description: 'A number field' });
    expect(prop).toEqual({ type: 'number', description: 'A number field' });
  });

  test('Schema.integer creates integer property', () => {
    const prop = Schema.integer({ description: 'An integer field' });
    expect(prop).toEqual({ type: 'integer', description: 'An integer field' });
  });

  test('Schema.boolean creates boolean property', () => {
    const prop = Schema.boolean({ description: 'A boolean field' });
    expect(prop).toEqual({ type: 'boolean', description: 'A boolean field' });
  });

  test('Schema.array creates array property', () => {
    const prop = Schema.array(Schema.string(), { description: 'An array field' });
    expect(prop).toEqual({
      type: 'array',
      items: { type: 'string' },
      description: 'An array field',
    });
  });

  test('OutputFormat type is valid', () => {
    const outputFormat: OutputFormat = {
      type: 'json_schema',
      name: 'test_schema',
      schema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
        },
        required: ['answer'],
      },
      description: 'Test schema',
    };

    expect(outputFormat.type).toBe('json_schema');
    expect(outputFormat.name).toBe('test_schema');
    expect(outputFormat.schema.type).toBe('object');
  });
});
