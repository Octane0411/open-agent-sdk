import { describe, it, expect } from 'bun:test';
import type {
  SkillFrontmatter,
  SkillDefinition,
  SkillCatalogItem,
  SkillLoaderOptions,
  SkillRegistry,
  SkillParseResult,
  PreprocessorContext,
} from '../../src/skills/types';

describe('SkillFrontmatter', () => {
  it('should accept valid frontmatter with required fields', () => {
    const frontmatter: SkillFrontmatter = {
      name: 'test-skill',
      description: 'A test skill',
    };

    expect(frontmatter.name).toBe('test-skill');
    expect(frontmatter.description).toBe('A test skill');
  });

  it('should accept frontmatter with optional allowedTools', () => {
    const frontmatter: SkillFrontmatter = {
      name: 'test-skill',
      description: 'A test skill',
      allowedTools: ['Read', 'Write'],
    };

    expect(frontmatter.allowedTools).toEqual(['Read', 'Write']);
  });

  it('should accept frontmatter with optional model', () => {
    const frontmatter: SkillFrontmatter = {
      name: 'test-skill',
      description: 'A test skill',
      model: 'sonnet',
    };

    expect(frontmatter.model).toBe('sonnet');
  });
});

describe('SkillDefinition', () => {
  it('should accept valid skill definition', () => {
    const skill: SkillDefinition = {
      frontmatter: {
        name: 'test-skill',
        description: 'A test skill',
      },
      content: '# Test Skill\n\nThis is the content.',
      filePath: '/path/to/skill.md',
      source: 'project',
    };

    expect(skill.frontmatter.name).toBe('test-skill');
    expect(skill.content).toBe('# Test Skill\n\nThis is the content.');
    expect(skill.filePath).toBe('/path/to/skill.md');
    expect(skill.source).toBe('project');
  });

  it('should support both personal and project sources', () => {
    const personalSkill: SkillDefinition = {
      frontmatter: { name: 'personal-skill', description: 'Personal' },
      content: '',
      filePath: '~/.claude/skills/personal.md',
      source: 'personal',
    };

    const projectSkill: SkillDefinition = {
      frontmatter: { name: 'project-skill', description: 'Project' },
      content: '',
      filePath: './.claude/skills/project.md',
      source: 'project',
    };

    expect(personalSkill.source).toBe('personal');
    expect(projectSkill.source).toBe('project');
  });
});

describe('SkillCatalogItem', () => {
  it('should accept valid catalog item', () => {
    const item: SkillCatalogItem = {
      name: 'test-skill',
      description: 'A test skill',
      source: 'project',
    };

    expect(item.name).toBe('test-skill');
    expect(item.description).toBe('A test skill');
    expect(item.source).toBe('project');
  });

  it('should not contain full content', () => {
    const item: SkillCatalogItem = {
      name: 'lightweight-skill',
      description: 'Just the essentials',
      source: 'project',
    };

    const keys = Object.keys(item);
    expect(keys).not.toContain('content');
    expect(keys).not.toContain('filePath');
  });
});

describe('SkillLoaderOptions', () => {
  it('should accept empty options object', () => {
    const options: SkillLoaderOptions = {};
    expect(options).toBeDefined();
  });

  it('should accept all loader options', () => {
    const options: SkillLoaderOptions = {
      additionalDirs: ['/custom/dir1', '/custom/dir2'],
      includePersonal: true,
      includeProject: true,
      includeLegacyCommands: false,
    };

    expect(options.additionalDirs).toEqual(['/custom/dir1', '/custom/dir2']);
    expect(options.includePersonal).toBe(true);
    expect(options.includeProject).toBe(true);
  });
});

describe('SkillRegistry', () => {
  it('should define registry interface with required methods', () => {
    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: (_name: string) => undefined,
      has: (_name: string) => false,
      clear: () => {},
    };

    expect(typeof mockRegistry.loadAll).toBe('function');
    expect(typeof mockRegistry.getAll).toBe('function');
    expect(typeof mockRegistry.get).toBe('function');
    expect(typeof mockRegistry.has).toBe('function');
    expect(typeof mockRegistry.clear).toBe('function');
  });
});

describe('SkillParseResult', () => {
  it('should represent successful parse result', () => {
    const skill: SkillDefinition = {
      frontmatter: { name: 'test', description: 'Test' },
      content: '',
      filePath: '/test.md',
      source: 'project',
    };

    const result: SkillParseResult = {
      success: true,
      skill,
    };

    expect(result.success).toBe(true);
    expect(result.skill).toBe(skill);
    expect(result.error).toBeUndefined();
  });

  it('should represent failed parse result', () => {
    const result: SkillParseResult = {
      success: false,
      error: 'Invalid frontmatter: missing name',
    };

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid frontmatter: missing name');
    expect(result.skill).toBeUndefined();
  });
});

describe('PreprocessorContext', () => {
  it('should accept valid preprocessor context', () => {
    const context: PreprocessorContext = {
      arguments: 'arg1 arg2 arg3',
    };

    expect(context.arguments).toBe('arg1 arg2 arg3');
  });

  it('should accept empty arguments', () => {
    const context: PreprocessorContext = {
      arguments: '',
    };

    expect(context.arguments).toBe('');
  });
});
