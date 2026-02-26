import { describe, it, expect } from 'bun:test';
import { AskUserQuestionTool } from '../../src/tools/ask-user-question';
import type { ToolContext } from '../../src/types/tools';

const context: ToolContext = {
  cwd: process.cwd(),
  env: {},
};

describe('AskUserQuestionTool', () => {
  const tool = new AskUserQuestionTool();

  it('should have correct name and description', () => {
    expect(tool.name).toBe('AskUserQuestion');
    expect(tool.description).toBe('Ask the user one or more questions to gather information or preferences. Returns the questions and empty answers (answers filled by user interaction).');
  });

  it('should have correct parameters schema', () => {
    expect(tool.parameters.required).toContain('questions');
    const questionsSchema = tool.parameters.properties.questions;
    expect(questionsSchema.type).toBe('array');
    expect(questionsSchema.minItems).toBe(1);
    expect(questionsSchema.maxItems).toBe(4);
  });

  it('should return questions with empty answers (pass-through)', async () => {
    const input = {
      questions: [
        {
          question: 'Which framework do you prefer?',
          header: 'Framework',
          options: [
            { label: 'React', description: 'Popular UI library' },
            { label: 'Vue', description: 'Progressive framework' },
          ],
          multiSelect: false,
        },
      ],
    };

    const result = await tool.handler(input, context);

    expect(result.questions).toEqual(input.questions);
    expect(result.answers).toEqual({});
  });

  it('should handle multiple questions', async () => {
    const input = {
      questions: [
        {
          question: 'Choose a language',
          header: 'Language',
          options: [
            { label: 'TypeScript', description: 'Typed JS' },
            { label: 'Python', description: 'Versatile' },
          ],
          multiSelect: false,
        },
        {
          question: 'Select features',
          header: 'Features',
          options: [
            { label: 'Auth', description: 'Authentication' },
            { label: 'DB', description: 'Database' },
            { label: 'API', description: 'REST API' },
          ],
          multiSelect: true,
        },
      ],
    };

    const result = await tool.handler(input, context);
    expect(result.questions).toHaveLength(2);
    expect(result.answers).toEqual({});
  });

  // Test that the tool is NOT in default registry
  it('should not be in default registry', async () => {
    const { createDefaultRegistry } = await import('../../src/tools/registry');
    const registry = createDefaultRegistry();
    expect(registry.has('AskUserQuestion')).toBe(false);
  });

  // Test that the tool can be manually registered
  it('should be manually registerable', async () => {
    const { createDefaultRegistry } = await import('../../src/tools/registry');
    const registry = createDefaultRegistry();
    registry.register(tool);
    expect(registry.has('AskUserQuestion')).toBe(true);
    expect(registry.get('AskUserQuestion')).toBe(tool);
  });
});
