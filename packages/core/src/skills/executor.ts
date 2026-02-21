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
import type { AgentDefinition } from '../agent/agent-definition';
import type { SubagentContext, SubagentResult } from '../agent/subagent-runner';
import { runSubagent } from '../agent/subagent-runner';

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

/**
 * Check if skill should be executed in a subagent (fork context)
 *
 * @param skill - Skill definition
 * @returns True if skill has context: 'fork'
 */
export function shouldUseSubagent(skill: SkillDefinition): boolean {
  return skill.frontmatter.context === 'fork';
}

/**
 * Build AgentDefinition from skill definition
 *
 * @param skill - Skill definition
 * @returns AgentDefinition for subagent execution
 */
export function buildAgentDefinitionFromSkill(skill: SkillDefinition): AgentDefinition {
  const agent: AgentDefinition = {
    description: skill.frontmatter.description,
    prompt: skill.content,
  };

  // Use skill's model if specified
  if (skill.frontmatter.model) {
    const model = skill.frontmatter.model;
    if (['sonnet', 'opus', 'haiku', 'inherit'].includes(model)) {
      agent.model = model as 'sonnet' | 'opus' | 'haiku' | 'inherit';
    }
  }

  // Use skill's allowedTools if specified
  if (skill.frontmatter.allowedTools && skill.frontmatter.allowedTools.length > 0) {
    agent.tools = skill.frontmatter.allowedTools;
  }

  return agent;
}

/**
 * Execute skill in a subagent (fork context)
 *
 * @param skill - Skill definition
 * @param args - Command arguments
 * @param subagentContext - Subagent execution context
 * @returns Subagent execution result
 */
export async function executeSkillInSubagent(
  skill: SkillDefinition,
  args: string[],
  subagentContext: SubagentContext
): Promise<SubagentResult> {
  // Process skill content with parameter substitution
  const context = createSkillPreprocessorContext(
    args,
    subagentContext.parentSessionId,
    subagentContext.parentContext.cwd
  );

  const processedContent = preprocessContent(skill.content, context);

  // Build agent definition from skill
  const agentDef = buildAgentDefinitionFromSkill({
    ...skill,
    content: processedContent,
  });

  // Use skill name as agent type
  const agentType = skill.frontmatter.name;

  // Run subagent
  return runSubagent(agentDef, processedContent, agentType, subagentContext);
}
