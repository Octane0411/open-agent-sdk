import { describe, it, expect } from 'bun:test';
import {
  exactMatch,
  parseSkillCommand,
  isSkillCommand,
} from '../../src/skills/matcher';
import type { SkillDefinition } from '../../src/skills/types';

const mockSkills: SkillDefinition[] = [
  {
    frontmatter: {
      name: 'commit',
      description: 'Generate a git commit message',
    },
    content: 'Commit skill content',
    filePath: '/skills/commit.md',
    source: 'project',
  },
  {
    frontmatter: {
      name: 'pr-description',
      description: 'Generate PR description from git diff',
    },
    content: 'PR skill content',
    filePath: '/skills/pr.md',
    source: 'personal',
  },
  {
    frontmatter: {
      name: 'refactor',
      description: 'Refactor code to improve quality',
    },
    content: 'Refactor skill content',
    filePath: '/skills/refactor.md',
    source: 'project',
  },
];

describe('exactMatch', () => {
  it('should match skill by exact name', () => {
    const result = exactMatch('commit', mockSkills);
    expect(result.matched).toBe(true);
    expect(result.skill?.frontmatter.name).toBe('commit');
  });

  it('should be case-insensitive', () => {
    const result = exactMatch('COMMIT', mockSkills);
    expect(result.matched).toBe(true);
    expect(result.skill?.frontmatter.name).toBe('commit');
  });

  it('should trim whitespace', () => {
    const result = exactMatch('  commit  ', mockSkills);
    expect(result.matched).toBe(true);
    expect(result.skill?.frontmatter.name).toBe('commit');
  });

  it('should return no match for unknown skill', () => {
    const result = exactMatch('unknown', mockSkills);
    expect(result.matched).toBe(false);
    expect(result.skill).toBeUndefined();
  });
});

describe('parseSkillCommand', () => {
  it('should parse /skill-name format', () => {
    const result = parseSkillCommand('/commit');
    expect(result).toEqual({ name: 'commit', args: [], userMessage: '' });
  });

  it('should parse with arguments', () => {
    const result = parseSkillCommand('/commit fix: bug fix');
    expect(result).toEqual({ name: 'commit', args: ['fix:', 'bug', 'fix'], userMessage: 'fix: bug fix' });
  });

  it('should handle multiple spaces', () => {
    const result = parseSkillCommand('/commit   arg1   arg2');
    expect(result).toEqual({ name: 'commit', args: ['arg1', 'arg2'], userMessage: 'arg1   arg2' });
  });

  it('should return null for non-skill input', () => {
    const result = parseSkillCommand('hello world');
    expect(result).toBeNull();
  });

  it('should return null for empty /', () => {
    const result = parseSkillCommand('/');
    expect(result).toBeNull();
  });

  it('should trim leading/trailing whitespace', () => {
    const result = parseSkillCommand('  /commit arg1  ');
    expect(result).toEqual({ name: 'commit', args: ['arg1'], userMessage: 'arg1' });
  });

  it('should preserve original spacing in userMessage', () => {
    const result = parseSkillCommand('/refactor  some   complex   args');
    expect(result?.userMessage).toBe('some   complex   args');
  });
});

describe('isSkillCommand', () => {
  it('should return true for /command', () => {
    expect(isSkillCommand('/commit')).toBe(true);
  });

  it('should return true with arguments', () => {
    expect(isSkillCommand('/commit fix')).toBe(true);
  });

  it('should return false for regular text', () => {
    expect(isSkillCommand('hello world')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isSkillCommand('')).toBe(false);
  });

  it('should handle whitespace before /', () => {
    expect(isSkillCommand('  /commit')).toBe(true);
  });
});
