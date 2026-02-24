/**
 * Skill tool - Load and activate a skill for this session
 *
 * Skills provide specialized instructions that remain active throughout the conversation.
 * When this tool is called, the ReActLoop will:
 * 1. Look up the skill from the skill registry
 * 2. Insert a skill system message into the conversation history
 * 3. Return the loaded skill information to the LLM
 */

import type { Tool, ToolContext, JSONSchema } from '../types/tools';

export interface SkillInput {
  /** Name of the skill to load (e.g., "brainstorming", "debugging") */
  name: string;
}

export interface SkillOutput {
  /** Name of the loaded skill */
  skill_name: string;
  /** Whether the skill was successfully loaded */
  loaded: boolean;
  /** Error message if skill was not found */
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Name of the skill to load (e.g., "brainstorming", "debugging")',
    },
  },
  required: ['name'],
};

/**
 * SkillTool - A tool for loading skills
 *
 * Note: The actual skill loading and system message insertion is handled
 * by the ReActLoop's executeTool method, which has special handling for
 * this tool. The tool handler itself only validates the input and returns
 * a simple acknowledgment.
 */
export class SkillTool implements Tool<SkillInput, SkillOutput> {
  name = 'Skill';
  description =
    'Load and activate a skill for this session. Skills provide specialized instructions that remain active throughout the conversation. ' +
    'Available skills can be found in the system prompt. Use this tool when the user wants to use a specific skill ' +
    'or when you determine a skill would be helpful for the current task.';
  parameters = parameters;

  handler = async (input: SkillInput, _context: ToolContext): Promise<SkillOutput> => {
    // The actual skill lookup and system message insertion is handled by ReActLoop
    // This handler just validates the input and returns acknowledgment
    return {
      skill_name: input.name,
      loaded: true,
    };
  };
}

// Export singleton instance
export const skillTool = new SkillTool();
