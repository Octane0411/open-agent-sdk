import { describe, it, expect } from 'bun:test';
import {
  executeSkill,
  getSkillContent,
  buildSkillSystemPrompt,
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
    content: 'Please refactor the following code:\n\n$0',
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

  it('should substitute positional arguments', () => {
    const result = executeSkill('/refactor myFunction', mockSkills);
    expect(result.executed).toBe(true);
    expect(result.content).toBe('Please refactor the following code:\n\nmyFunction');
  });
});

describe('getSkillContent', () => {
  it('should return skill content for valid command', () => {
    const result = getSkillContent('/commit test', mockSkills);
    expect(result).not.toBeNull();
    expect(result?.skill.frontmatter.name).toBe('commit');
    expect(result?.content).toContain('commit message');
    expect(result?.args).toEqual(['test']);
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

describe('buildSkillSystemPrompt', () => {
  it('should combine base prompt with skill content', () => {
    const base = 'You are a helpful assistant.';
    const skill = 'Generate commit messages following conventional commits.';
    const result = buildSkillSystemPrompt(base, skill);
    expect(result).toContain('You are a helpful assistant.');
    expect(result).toContain('Skill Instructions');
    expect(result).toContain('Generate commit messages');
  });

  it('should work without base prompt', () => {
    const skill = 'Refactor code to improve quality.';
    const result = buildSkillSystemPrompt(undefined, skill);
    expect(result).toContain('Skill Instructions');
    expect(result).toContain('Refactor code');
  });
});

describe('createSkillPreprocessorContext', () => {
  it('should create context with session info', () => {
    const context = createSkillPreprocessorContext(['arg1', 'arg2'], 'session-123', '/test');
    expect(context.args).toEqual(['arg1', 'arg2']);
    expect(context.arguments).toBe('arg1 arg2');
    expect(context.env.CLAUDE_SESSION_ID).toBe('session-123');
    expect(context.env.CLAUDE_CWD).toBe('/test');
  });

  it('should include process env variables', () => {
    const context = createSkillPreprocessorContext([], 'session', '/cwd');
    expect(context.env.PATH).toBeDefined();
    expect(context.env.HOME).toBeDefined();
  });
});
