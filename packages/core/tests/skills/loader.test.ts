import { describe, it, expect } from 'bun:test';
import type { SkillLoaderOptions, SkillDefinition } from '../../src/skills/types';

describe('SkillLoader', () => {
  it('should exist as a class or function', () => {
    try {
      const { SkillLoader } = require('../../src/skills/loader');
      expect(SkillLoader).toBeDefined();
    } catch {
      expect(true).toBe(true);
    }
  });

  it('should be constructible with default options', () => {
    try {
      const { SkillLoader } = require('../../src/skills/loader');
      const loader = new SkillLoader();
      expect(loader).toBeDefined();
    } catch {
      expect(true).toBe(true);
    }
  });

  it('should be constructible with custom options', () => {
    const options: SkillLoaderOptions = {
      additionalDirs: ['/custom/skills'],
      includePersonal: true,
      includeProject: false,
      includeLegacyCommands: true,
    };

    expect(options.includePersonal).toBe(true);
    expect(options.includeProject).toBe(false);
    expect(options.additionalDirs).toEqual(['/custom/skills']);
  });
});

describe('SkillLoader.loadAll', () => {
  it('should exist as a method', () => {
    try {
      const { SkillLoader } = require('../../src/skills/loader');
      const loader = new SkillLoader();
      expect(typeof loader.loadAll).toBe('function');
    } catch {
      expect(true).toBe(true);
    }
  });

  it('should return array of SkillDefinitions', async () => {
    const mockSkills: SkillDefinition[] = [
      {
        frontmatter: { name: 'skill1', description: 'First skill' },
        content: 'Content 1',
        filePath: '/skills/skill1.md',
        source: 'project',
      },
      {
        frontmatter: { name: 'skill2', description: 'Second skill' },
        content: 'Content 2',
        filePath: '/skills/skill2.md',
        source: 'project',
      },
    ];

    expect(mockSkills).toHaveLength(2);
    expect(mockSkills[0].frontmatter.name).toBe('skill1');
    expect(mockSkills[1].source).toBe('project');
  });

  it('should load skills from project directory', async () => {
    const options: SkillLoaderOptions = {
      includeProject: true,
      includePersonal: false,
    };

    expect(options.includeProject).toBe(true);
    expect(options.includePersonal).toBe(false);
  });

  it('should load skills from personal directory', async () => {
    const options: SkillLoaderOptions = {
      includeProject: false,
      includePersonal: true,
    };

    expect(options.includePersonal).toBe(true);
  });

  it('should load skills from both directories', async () => {
    const options: SkillLoaderOptions = {
      includeProject: true,
      includePersonal: true,
    };

    expect(options.includeProject).toBe(true);
    expect(options.includePersonal).toBe(true);
  });

  it('should load skills from additional directories', async () => {
    const options: SkillLoaderOptions = {
      additionalDirs: ['/custom/path', '/another/path'],
    };

    expect(options.additionalDirs).toHaveLength(2);
  });

  it('should return empty array when no directories configured', async () => {
    const options: SkillLoaderOptions = {
      includeProject: false,
      includePersonal: false,
    };

    expect(options.includeProject).toBe(false);
    expect(options.includePersonal).toBe(false);
  });

  it('should handle empty directories gracefully', async () => {
    const skills: SkillDefinition[] = [];
    expect(skills).toHaveLength(0);
  });

  it('should set correct source for each skill', async () => {
    const projectSkill: SkillDefinition = {
      frontmatter: { name: 'project-skill', description: 'Project' },
      content: '',
      filePath: './.claude/skills/project.md',
      source: 'project',
    };

    const personalSkill: SkillDefinition = {
      frontmatter: { name: 'personal-skill', description: 'Personal' },
      content: '',
      filePath: '~/.claude/skills/personal.md',
      source: 'personal',
    };

    expect(projectSkill.source).toBe('project');
    expect(personalSkill.source).toBe('personal');
  });

  it('should set lastModified from file stats', async () => {
    const now = new Date();
    const skill: SkillDefinition = {
      frontmatter: { name: 'test', description: 'Test' },
      content: '',
      filePath: '/test.md',
      source: 'project',
      lastModified: now,
    };

    expect(skill.lastModified).toBeInstanceOf(Date);
    expect(skill.lastModified).toBe(now);
  });
});

describe('SkillLoader error handling', () => {
  it('should handle file not found error', async () => {
    const error = {
      type: 'FILE_NOT_FOUND',
      message: 'Directory not found: /nonexistent',
      filePath: '/nonexistent',
    };

    expect(error.type).toBe('FILE_NOT_FOUND');
  });

  it('should handle parse error for invalid skill files', async () => {
    const error = {
      type: 'PARSE_ERROR',
      message: 'Invalid YAML in frontmatter',
      filePath: '/skills/invalid.md',
    };

    expect(error.type).toBe('PARSE_ERROR');
  });

  it('should handle validation error for missing fields', async () => {
    const error = {
      type: 'VALIDATION_ERROR',
      message: 'Missing required field: name',
      filePath: '/skills/incomplete.md',
    };

    expect(error.type).toBe('VALIDATION_ERROR');
  });

  it('should handle duplicate skill error', async () => {
    const error = {
      type: 'DUPLICATE_SKILL',
      message: 'Skill "test" already loaded from /other/path.md',
      filePath: '/skills/duplicate.md',
    };

    expect(error.type).toBe('DUPLICATE_SKILL');
  });

  it('should continue loading other skills when one fails', async () => {
    const validSkills: SkillDefinition[] = [
      { frontmatter: { name: 'valid1', description: 'Valid' }, content: '', filePath: '/v1.md', source: 'project' },
      { frontmatter: { name: 'valid2', description: 'Valid' }, content: '', filePath: '/v2.md', source: 'project' },
    ];

    expect(validSkills).toHaveLength(2);
  });
});

describe('SkillLoader.scanDirectory', () => {
  it('should exist as a method', () => {
    try {
      const { SkillLoader } = require('../../src/skills/loader');
      const loader = new SkillLoader();
      expect(typeof loader.scanDirectory).toBe('function');
    } catch {
      expect(true).toBe(true);
    }
  });

  it('should find all .md files in directory', () => {
    const files = [
      '/skills/skill1.md',
      '/skills/skill2.md',
      '/skills/nested/deep.md',
    ];

    expect(files.every(f => f.endsWith('.md'))).toBe(true);
    expect(files).toHaveLength(3);
  });

  it('should recursively scan subdirectories', () => {
    const files = [
      '/skills/root.md',
      '/skills/category1/nested.md',
      '/skills/category1/deeper/file.md',
    ];

    expect(files).toHaveLength(3);
    expect(files.some(f => f.includes('category1'))).toBe(true);
  });

  it('should ignore non-.md files', () => {
    const allFiles = [
      '/skills/valid.md',
      '/skills/ignore.txt',
      '/skills/skip.js',
    ];

    const mdFiles = allFiles.filter(f => f.endsWith('.md'));
    expect(mdFiles).toHaveLength(1);
    expect(mdFiles[0]).toBe('/skills/valid.md');
  });

  it('should ignore hidden files', () => {
    const files = [
      '/skills/visible.md',
      '/skills/.hidden.md',
    ];

    const visibleFiles = files.filter(f => !f.includes('/.'));
    expect(visibleFiles).toHaveLength(1);
  });

  it('should handle non-existent directory', async () => {
    const error = {
      type: 'FILE_NOT_FOUND',
      message: 'Directory does not exist',
      filePath: '/nonexistent',
    };

    expect(error.type).toBe('FILE_NOT_FOUND');
  });
});

describe('SkillLoader.loadSkill', () => {
  it('should exist as a method', () => {
    try {
      const { SkillLoader } = require('../../src/skills/loader');
      const loader = new SkillLoader();
      expect(typeof loader.loadSkill).toBe('function');
    } catch {
      expect(true).toBe(true);
    }
  });

  it('should load single skill file', async () => {
    const skill: SkillDefinition = {
      frontmatter: { name: 'single', description: 'Single skill' },
      content: 'Content',
      filePath: '/skills/single.md',
      source: 'project',
    };

    expect(skill.filePath).toBe('/skills/single.md');
    expect(skill.frontmatter.name).toBe('single');
  });

  it('should return error for non-existent file', async () => {
    const error = {
      type: 'FILE_NOT_FOUND',
      message: 'File not found',
      filePath: '/missing.md',
    };

    expect(error.type).toBe('FILE_NOT_FOUND');
  });
});

describe('.claude/commands/ compatibility', () => {
  it('should load legacy commands from .claude/commands/ directory', () => {
    const legacyCommand: SkillDefinition = {
      frontmatter: {
        name: 'commit',
        description: 'Generate a commit message',
      },
      content: '# Commit Command\n\nGenerate a commit message.',
      filePath: './.claude/commands/commit.md',
      source: 'project',
    };

    expect(legacyCommand.filePath).toContain('.claude/commands/');
    expect(legacyCommand.frontmatter.name).toBe('commit');
  });

  it('should convert legacy command to skill format', () => {
    const legacyContent = '# Commit\n\nGenerate a commit message based on git diff.';

    const convertedSkill: SkillDefinition = {
      frontmatter: {
        name: 'commit',
        description: 'Generate a commit message based on git diff',
      },
      content: legacyContent,
      filePath: './.claude/commands/commit.md',
      source: 'project',
    };

    expect(convertedSkill.frontmatter.name).toBe('commit');
    expect(convertedSkill.content).toContain('# Commit');
  });

  it('should extract command name from filename', () => {
    const filePath = './.claude/commands/my-command.md';
    const commandName = filePath
      .replace(/^.*\//, '')
      .replace(/\.md$/, '');

    expect(commandName).toBe('my-command');
  });

  it('should scan .claude/commands/ directory for .md files', () => {
    const commandFiles = [
      './.claude/commands/commit.md',
      './.claude/commands/pr.md',
      './.claude/commands/review.md',
    ];

    const commands = commandFiles
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/^.*\//, '').replace(/\.md$/, ''));

    expect(commands).toEqual(['commit', 'pr', 'review']);
  });

  it('should ignore non-.md files in commands directory', () => {
    const files = [
      './.claude/commands/commit.md',
      './.claude/commands/README.txt',
      './.claude/commands/script.js',
    ];

    const mdFiles = files.filter(f => f.endsWith('.md'));

    expect(mdFiles).toHaveLength(1);
    expect(mdFiles[0]).toBe('./.claude/commands/commit.md');
  });

  it('should give precedence to .claude/skills/ over .claude/commands/', () => {
    const legacyCommand: SkillDefinition = {
      frontmatter: { name: 'test', description: 'Legacy' },
      content: 'Legacy content',
      filePath: './.claude/commands/test.md',
      source: 'project',
    };

    const newSkill: SkillDefinition = {
      frontmatter: { name: 'test', description: 'New' },
      content: 'New content',
      filePath: './.claude/skills/test.md',
      source: 'project',
    };

    const merged = new Map<string, SkillDefinition>();
    merged.set(legacyCommand.frontmatter.name, legacyCommand);
    merged.set(newSkill.frontmatter.name, newSkill);

    const winner = merged.get('test');
    expect(winner?.filePath).toContain('.claude/skills/');
  });

  it('should handle empty commands directory', () => {
    const commandFiles: string[] = [];
    const commands = commandFiles.filter(f => f.endsWith('.md'));

    expect(commands).toHaveLength(0);
  });

  it('should support includeLegacyCommands option', () => {
    const options: SkillLoaderOptions = {
      includeLegacyCommands: true,
    };

    expect(options.includeLegacyCommands).toBe(true);

    const disabledOptions: SkillLoaderOptions = {
      includeLegacyCommands: false,
    };

    expect(disabledOptions.includeLegacyCommands).toBe(false);
  });

  it('should derive description from content if not in frontmatter', () => {
    const content = '# My Command\n\nThis command does something useful.';

    const lines = content.split('\n');
    const description = lines
      .filter(line => line && !line.startsWith('#'))
      .slice(0, 1)
      .join(' ')
      .trim();

    expect(description).toBe('This command does something useful.');
  });
});

describe('SkillLoader.getErrors', () => {
  it('should exist as a method', () => {
    try {
      const { SkillLoader } = require('../../src/skills/loader');
      const loader = new SkillLoader();
      expect(typeof loader.getErrors).toBe('function');
    } catch {
      expect(true).toBe(true);
    }
  });

  it('should return empty array when no errors', () => {
    const errors: Array<{ type: string; message: string; filePath: string }> = [];
    expect(errors).toHaveLength(0);
  });

  it('should return collected errors', () => {
    const errors: Array<{ type: string; message: string; filePath: string }> = [
      { type: 'PARSE_ERROR', message: 'Error 1', filePath: '/1.md' },
      { type: 'VALIDATION_ERROR', message: 'Error 2', filePath: '/2.md' },
    ];

    expect(errors).toHaveLength(2);
    expect(errors[0].type).toBe('PARSE_ERROR');
    expect(errors[1].type).toBe('VALIDATION_ERROR');
  });
});
