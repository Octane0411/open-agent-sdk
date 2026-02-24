/**
 * Skill matcher module
 *
 * Simplified version aligned with Claude Code:
 * Only supports exact name matching.
 */

import type { SkillDefinition } from './types';

/**
 * Match result interface - simplified
 */
export interface MatchResult {
  /** Whether a match was found */
  matched: boolean;
  /** The matched skill definition (if found) */
  skill?: SkillDefinition;
}

/**
 * Exact match skill by name
 * Aligned with Claude Code behavior: only exact matches
 */
export function exactMatch(
  name: string,
  skills: SkillDefinition[]
): MatchResult {
  const normalizedName = name.toLowerCase().trim();

  for (const skill of skills) {
    if (skill.frontmatter.name.toLowerCase() === normalizedName) {
      return { matched: true, skill };
    }
  }

  return { matched: false };
}

/**
 * Parse skill command from user input
 * Supports format: /skill-name arg1 arg2
 */
export function parseSkillCommand(input: string): {
  name: string;
  args: string[];
  userMessage: string;
} | null {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/')) {
    return null;
  }

  const withoutSlash = trimmed.slice(1);
  const parts = withoutSlash.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  // Extract user message (everything after the skill name)
  // Find where the skill name ends in the original input
  const skillNameMatch = trimmed.match(/^\/(\S+)/);
  const userMessage = skillNameMatch
    ? trimmed.slice(skillNameMatch[0].length).trim()
    : '';

  return { name: parts[0], args: parts.slice(1), userMessage };
}

/**
 * Check if input is a skill command
 */
export function isSkillCommand(input: string): boolean {
  return input.trim().startsWith('/');
}
