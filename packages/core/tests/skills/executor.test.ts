import { describe, it, expect } from 'bun:test';
import {
  executeSkill,
  getSkillContent,
  createSkillPreprocessorContext,
} from '../../src/skills/executor';
import type { SkillDefinition } from '../../src/skills/types';

const mockSkills: SkillDefinition[] = [
  {
    frontmatter: {
      name: 'commit',
      description: 'Generate a git commit message',
    },
    content: 'Please generate a commit message for: $ARGUMENTS',
    filePath: '/skills/commit.md',
    source: 'project',
  },
  {
    frontmatter: {
      name: 'refactor',
      description: 'Refactor code',
    },
    content: 'Please refactor the following code:\n\n$ARGUMENTS',
    filePath: '/skills/refactor.md',
    source: 'project',
  },
];

describe('executeSkill', () => {
  it('should execute skill with arguments', () => {
    const result = executeSkill('/commit fix bug', mockSkills);
    expect(result.executed).toBe(true);
    expect(result.skill?.frontmatter.name).toBe('commit');
    expect(result.content).toBe('Please generate a commit message for: fix bug');
    expect(result.args).toEqual(['fix', 'bug']);
    expect(result.userMessage).toBe('fix bug');
  });

  it('should return not executed for non-skill input', () => {
    const result = executeSkill('hello world', mockSkills);
    expect(result.executed).toBe(false);
  });

  it('should return error for unknown skill', () => {
    const result = executeSkill('/unknown arg1', mockSkills);
    expect(result.executed).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should substitute $ARGUMENTS', () => {
    const result = executeSkill('/refactor myFunction', mockSkills);
    expect(result.executed).toBe(true);
    expect(result.content).toBe('Please refactor the following code:\n\nmyFunction');
    expect(result.userMessage).toBe('myFunction');
  });

  it('should return userMessage for skill without arguments', () => {
    const result = executeSkill('/commit', mockSkills);
    expect(result.executed).toBe(true);
    expect(result.userMessage).toBe('');
  });
});

describe('getSkillContent', () => {
  it('should return skill content for valid command', () => {
    const result = getSkillContent('/commit test', mockSkills);
    expect(result).not.toBeNull();
    expect(result?.skill.frontmatter.name).toBe('commit');
    expect(result?.content).toContain('commit message');
    expect(result?.args).toEqual(['test']);
    expect(result?.userMessage).toBe('test');
  });

  it('should return null for non-skill input', () => {
    const result = getSkillContent('regular message', mockSkills);
    expect(result).toBeNull();
  });

  it('should return null for unknown skill', () => {
    const result = getSkillContent('/unknown', mockSkills);
    expect(result).toBeNull();
  });
});

describe('createSkillPreprocessorContext', () => {
  it('should create context with arguments', () => {
    const context = createSkillPreprocessorContext(['arg1', 'arg2']);
    expect(context.arguments).toBe('arg1 arg2');
  });

  it('should handle empty arguments', () => {
    const context = createSkillPreprocessorContext([]);
    expect(context.arguments).toBe('');
  });
});
