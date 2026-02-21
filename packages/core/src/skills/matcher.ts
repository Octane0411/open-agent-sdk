/**
 * Skill matcher module
 *
 * This module provides functionality to match user input to skills,
 * supporting exact name matching and description-based fuzzy matching.
 */

import type { SkillDefinition } from './types';

/**
 * Match result interface
 */
export interface MatchResult {
  /** Whether a match was found */
  matched: boolean;
  /** The matched skill definition (if found) */
  skill?: SkillDefinition;
  /** Match confidence score (0-1) */
  confidence?: number;
  /** Match type: 'exact' | 'fuzzy' | 'description' */
  matchType?: 'exact' | 'fuzzy' | 'description';
}

/**
 * Exact match skill by name
 *
 * @param name - Skill name to match
 * @param skills - Array of available skills
 * @returns MatchResult with matched skill or null
 */
export function exactMatch(
  name: string,
  skills: SkillDefinition[]
): MatchResult {
  const normalizedName = name.toLowerCase().trim();

  for (const skill of skills) {
    if (skill.frontmatter.name.toLowerCase() === normalizedName) {
      return {
        matched: true,
        skill,
        confidence: 1.0,
        matchType: 'exact',
      };
    }
  }

  return { matched: false };
}

/**
 * Find skill by description fuzzy matching
 * Uses simple keyword matching algorithm
 *
 * @param description - User description/query
 * @param skills - Array of available skills
 * @returns MatchResult with best matching skill or null
 */
export function findByDescription(
  description: string,
  skills: SkillDefinition[]
): MatchResult {
  if (!description.trim() || skills.length === 0) {
    return { matched: false };
  }

  const normalizedQuery = description.toLowerCase().trim();
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);

  let bestMatch: SkillDefinition | undefined;
  let bestScore = 0;

  for (const skill of skills) {
    const skillDesc = skill.frontmatter.description.toLowerCase();
    const skillName = skill.frontmatter.name.toLowerCase();
    const skillTags = (skill.frontmatter.tags || []).join(' ').toLowerCase();

    let score = 0;

    // Exact description match (highest priority)
    if (skillDesc === normalizedQuery) {
      score = 1.0;
    } else {
      // Name contains query
      if (skillName.includes(normalizedQuery)) {
        score += 0.8;
      }

      // Description contains query
      if (skillDesc.includes(normalizedQuery)) {
        score += 0.6;
      }

      // Keyword matching
      for (const word of queryWords) {
        if (skillName.includes(word)) {
          score += 0.3;
        }
        if (skillDesc.includes(word)) {
          score += 0.2;
        }
        if (skillTags.includes(word)) {
          score += 0.25;
        }
      }
    }

    // Normalize score by word count to avoid bias toward long descriptions
    score = score / (1 + queryWords.length * 0.05);

    if (score > bestScore && score >= 0.25) {
      bestScore = score;
      bestMatch = skill;
    }
  }

  if (bestMatch) {
    return {
      matched: true,
      skill: bestMatch,
      confidence: Math.min(bestScore, 1.0),
      matchType: bestScore >= 0.8 ? 'fuzzy' : 'description',
    };
  }

  return { matched: false };
}

/**
 * Parse skill command from user input
 * Supports format: /skill-name arg1 arg2
 *
 * @param input - User input string
 * @returns Parsed command info or null if not a skill command
 */
export function parseSkillCommand(input: string): {
  name: string;
  args: string[];
} | null {
  const trimmed = input.trim();

  // Check if input starts with /
  if (!trimmed.startsWith('/')) {
    return null;
  }

  // Remove leading / and split by whitespace
  const withoutSlash = trimmed.slice(1);
  const parts = withoutSlash.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const name = parts[0];
  const args = parts.slice(1);

  return { name, args };
}

/**
 * Check if input is a skill command
 *
 * @param input - User input string
 * @returns True if input starts with /
 */
export function isSkillCommand(input: string): boolean {
  return input.trim().startsWith('/');
}
