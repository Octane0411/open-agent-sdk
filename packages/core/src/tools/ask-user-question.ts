/**
 * AskUserQuestion tool - Ask the user clarifying questions during task execution
 * This is a pass-through tool: the handler returns the questions as-is,
 * and actual answers are filled by the canUseTool callback.
 */
import type { Tool, ToolContext, JSONSchema } from '../types/tools';

export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestionItem {
  question: string;
  header: string;
  options: AskUserQuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionInput {
  questions: AskUserQuestionItem[];
}

export interface AskUserQuestionOutput {
  questions: AskUserQuestionItem[];
  answers: Record<string, string>;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      description: 'Questions to ask the user (1-4 questions)',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The complete question to ask the user',
          },
          header: {
            type: 'string',
            description: 'Short label for the question (max 12 characters)',
            maxLength: 12,
          },
          options: {
            type: 'array',
            description: 'Available choices for this question',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                label: {
                  type: 'string',
                  description: 'Option label (1-5 words)',
                },
                description: {
                  type: 'string',
                  description: 'Explanation of this option',
                },
              },
              required: ['label', 'description'],
            },
          },
          multiSelect: {
            type: 'boolean',
            description: 'Whether multiple selections are allowed',
          },
        },
        required: ['question', 'header', 'options', 'multiSelect'],
      },
    },
  },
  required: ['questions'],
};

export class AskUserQuestionTool implements Tool<AskUserQuestionInput, AskUserQuestionOutput> {
  name = 'AskUserQuestion';
  description =
    'Ask the user clarifying questions to proceed with the task. Requires canUseTool callback to be configured.';
  parameters = parameters;

  handler = async (
    input: AskUserQuestionInput,
    _context: ToolContext
  ): Promise<AskUserQuestionOutput> => {
    // Pass-through: return questions with empty answers
    // Actual answers will be filled by canUseTool callback via updatedInput
    return {
      questions: input.questions,
      answers: {},
    };
  };
}

export const askUserQuestionTool = new AskUserQuestionTool();
