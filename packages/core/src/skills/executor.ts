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
  skills: SkillDefinition[],
  env: Record<string, string> = {}
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
    args: command.args,
    env,
    arguments: command.args.join(' '),
  };

  // Process skill content with parameter substitution
  const processedContent = preprocessContent(skill.content, context);

  return {
    executed: true,
    skill,
    content: processedContent,
    args: command.args,
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
): { content: string; skill: SkillDefinition; args: string[] } | null {
  const result = executeSkill(input, skills);

  if (result.executed && result.content && result.skill) {
    return {
      content: result.content,
      skill: result.skill,
      args: result.args || [],
    };
  }

  return null;
}

/**
 * Build system prompt with skill instructions
 *
 * @param basePrompt - Base system prompt
 * @param skillContent - Skill content to inject
 * @returns Combined system prompt
 */
export function buildSkillSystemPrompt(
  basePrompt: string | undefined,
  skillContent: string
): string {
  const parts: string[] = [];

  if (basePrompt) {
    parts.push(basePrompt);
  }

  parts.push('## Skill Instructions');
  parts.push(skillContent);

  return parts.join('\n\n');
}

/**
 * Create preprocessor context with session info
 *
 * @param args - Command arguments
 * @param sessionId - Session ID
 * @param cwd - Current working directory
 * @returns PreprocessorContext
 */
export function createSkillPreprocessorContext(
  args: string[],
  sessionId: string,
  cwd: string
): PreprocessorContext {
  return createPreprocessorContext(args, {
    ...process.env,
    CLAUDE_SESSION_ID: sessionId,
    CLAUDE_CWD: cwd,
  } as Record<string, string>);
}
