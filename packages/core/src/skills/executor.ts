/**
 * Skill executor module
 *
 * This module provides functionality to execute skills,
 * including loading skill content, parameter substitution,
 * and injecting skill instructions into the conversation.
 */

import type { SkillDefinition, PreprocessorContext } from './types';
import { preprocessContent, createPreprocessorContext } from './preprocessor';
import { parseSkillCommand, exactMatch } from './matcher';

/**
 * Skill execution result
 */
export interface SkillExecutionResult {
  /** Whether a skill was executed */
  executed: boolean;
  /** The skill that was executed (if any) */
  skill?: SkillDefinition;
  /** Processed skill content with parameters substituted */
  content?: string;
  /** Arguments passed to the skill */
  args?: string[];
  /** User message (without skill command prefix) */
  userMessage?: string;
  /** Error message (if execution failed) */
  error?: string;
}

/**
 * Execute a skill from user input
 *
 * @param input - User input string (potentially a /command)
 * @param skills - Array of available skills
 * @param env - Environment variables for parameter substitution
 * @returns SkillExecutionResult
 */
export function executeSkill(
  input: string,
  skills: SkillDefinition[]
): SkillExecutionResult {
  // Parse the command
  const command = parseSkillCommand(input);
  if (!command) {
    return { executed: false };
  }

  // Find the skill
  const match = exactMatch(command.name, skills);
  if (!match.matched || !match.skill) {
    return {
      executed: false,
      error: `Skill "${command.name}" not found`,
    };
  }

  const skill = match.skill;

  // Create preprocessor context
  const context: PreprocessorContext = {
    arguments: command.args.join(' '),
  };

  // Process skill content with parameter substitution
  const processedContent = preprocessContent(skill.content, context);

  return {
    executed: true,
    skill,
    content: processedContent,
    args: command.args,
    userMessage: command.userMessage,
  };
}

/**
 * Check if input is a skill command and get the skill content
 *
 * @param input - User input string
 * @param skills - Array of available skills
 * @returns The skill content if it's a skill command, null otherwise
 */
export function getSkillContent(
  input: string,
  skills: SkillDefinition[]
): { content: string; skill: SkillDefinition; args: string[]; userMessage: string } | null {
  const result = executeSkill(input, skills);

  if (result.executed && result.content && result.skill) {
    return {
      content: result.content,
      skill: result.skill,
      args: result.args || [],
      userMessage: result.userMessage || '',
    };
  }

  return null;
}

/**
 * Create preprocessor context with session info
 *
 * @param args - Command arguments
 * @returns PreprocessorContext
 */
export function createSkillPreprocessorContext(args: string[]): PreprocessorContext {
  return createPreprocessorContext(args);
}
