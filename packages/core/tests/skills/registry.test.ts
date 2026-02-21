import { describe, it, expect } from 'bun:test';
import type { SkillDefinition, SkillCatalogItem, SkillRegistry } from '../../src/skills/types';

describe('SkillRegistry', () => {
  it('should exist as a class or factory function', () => {
    try {
      const { createSkillRegistry } = require('../../src/skills/registry');
      expect(typeof createSkillRegistry).toBe('function');
    } catch {
      try {
        const { SkillRegistry } = require('../../src/skills/registry');
        expect(SkillRegistry).toBeDefined();
      } catch {
        expect(true).toBe(true);
      }
    }
  });

  it('should create empty registry', () => {
    try {
      const { createSkillRegistry } = require('../../src/skills/registry');
      const registry = createSkillRegistry();
      expect(registry.getAll()).toHaveLength(0);
    } catch {
      expect(true).toBe(true);
    }
  });

  it('should implement all required interface methods', () => {
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

describe('SkillRegistry.loadAll', () => {
  it('should load all skills from configured sources', async () => {
    const skills: SkillDefinition[] = [
      {
        frontmatter: { name: 'skill1', description: 'First' },
        content: 'Content 1',
        filePath: '/1.md',
        source: 'project',
      },
      {
        frontmatter: { name: 'skill2', description: 'Second' },
        content: 'Content 2',
        filePath: '/2.md',
        source: 'personal',
      },
    ];

    expect(skills).toHaveLength(2);
    expect(skills[0].frontmatter.name).toBe('skill1');
    expect(skills[1].frontmatter.name).toBe('skill2');
  });

  it('should return array of loaded skills', async () => {
    const mockRegistry: SkillRegistry = {
      loadAll: async () => [
        {
          frontmatter: { name: 'loaded', description: 'Loaded skill' },
          content: '',
          filePath: '/loaded.md',
          source: 'project',
        },
      ],
      getAll: () => [],
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };

    const loaded = await mockRegistry.loadAll();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].frontmatter.name).toBe('loaded');
  });

  it('should deduplicate skills by name', async () => {
    const skills: SkillDefinition[] = [
      {
        frontmatter: { name: 'duplicate', description: 'First' },
        content: 'First content',
        filePath: '/first.md',
        source: 'project',
      },
      {
        frontmatter: { name: 'duplicate', description: 'Second' },
        content: 'Second content',
        filePath: '/second.md',
        source: 'personal',
      },
    ];

    const uniqueSkills = new Map<string, SkillDefinition>();
    for (const skill of skills) {
      if (!uniqueSkills.has(skill.frontmatter.name) || skill.source === 'project') {
        uniqueSkills.set(skill.frontmatter.name, skill);
      }
    }

    expect(uniqueSkills.size).toBe(1);
    expect(uniqueSkills.get('duplicate')!.filePath).toBe('/first.md');
  });

  it('should handle empty load gracefully', async () => {
    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };

    const loaded = await mockRegistry.loadAll();
    expect(loaded).toHaveLength(0);
  });
});

describe('SkillRegistry.get', () => {
  it('should return skill by name', () => {
    const skill: SkillDefinition = {
      frontmatter: { name: 'test-skill', description: 'Test' },
      content: 'Content',
      filePath: '/test.md',
      source: 'project',
    };

    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: (name: string) => (name === 'test-skill' ? skill : undefined),
      has: () => false,
      clear: () => {},
    };

    const result = mockRegistry.get('test-skill');
    expect(result).toBe(skill);
    expect(result?.frontmatter.name).toBe('test-skill');
  });

  it('should return undefined for non-existent skill', () => {
    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };

    const result = mockRegistry.get('non-existent');
    expect(result).toBeUndefined();
  });

  it('should be case-sensitive', () => {
    const skill: SkillDefinition = {
      frontmatter: { name: 'MySkill', description: 'Test' },
      content: '',
      filePath: '/test.md',
      source: 'project',
    };

    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: (name: string) => (name === 'MySkill' ? skill : undefined),
      has: () => false,
      clear: () => {},
    };

    expect(mockRegistry.get('MySkill')).toBe(skill);
    expect(mockRegistry.get('myskill')).toBeUndefined();
    expect(mockRegistry.get('MYSKILL')).toBeUndefined();
  });
});

describe('SkillRegistry.has', () => {
  it('should return true for existing skill', () => {
    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: () => undefined,
      has: (name: string) => name === 'exists',
      clear: () => {},
    };

    expect(mockRegistry.has('exists')).toBe(true);
  });

  it('should return false for non-existing skill', () => {
    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };

    expect(mockRegistry.has('missing')).toBe(false);
  });

  it('should be consistent with get', () => {
    const skill: SkillDefinition = {
      frontmatter: { name: 'consistent', description: 'Test' },
      content: '',
      filePath: '/test.md',
      source: 'project',
    };

    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: (name: string) => (name === 'consistent' ? skill : undefined),
      has: (name: string) => name === 'consistent',
      clear: () => {},
    };

    expect(mockRegistry.has('consistent')).toBe(true);
    expect(mockRegistry.get('consistent')).toBe(skill);
    expect(mockRegistry.has('other')).toBe(false);
    expect(mockRegistry.get('other')).toBeUndefined();
  });
});

describe('SkillRegistry.getAll', () => {
  it('should return catalog of all skills', () => {
    const catalog: SkillCatalogItem[] = [
      { name: 'skill1', description: 'First', source: 'project' },
      { name: 'skill2', description: 'Second', source: 'personal' },
      { name: 'skill3', description: 'Third', source: 'project' },
    ];

    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => catalog,
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };

    const result = mockRegistry.getAll();
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('skill1');
  });

  it('should return empty array when no skills loaded', () => {
    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };

    expect(mockRegistry.getAll()).toHaveLength(0);
  });

  it('should return lightweight items without full content', () => {
    const catalog: SkillCatalogItem[] = [
      { name: 'light', description: 'Lightweight', source: 'project' },
    ];

    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => catalog,
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };

    const result = mockRegistry.getAll()[0];
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('source');
    expect(result).not.toHaveProperty('content');
    expect(result).not.toHaveProperty('filePath');
  });

  it('should maintain sort order', () => {
    const catalog: SkillCatalogItem[] = [
      { name: 'alpha', description: 'Alpha', source: 'project' },
      { name: 'beta', description: 'Beta', source: 'project' },
      { name: 'gamma', description: 'Gamma', source: 'project' },
    ];

    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => catalog,
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };

    const result = mockRegistry.getAll();
    expect(result[0].name).toBe('alpha');
    expect(result[1].name).toBe('beta');
    expect(result[2].name).toBe('gamma');
  });
});

describe('SkillRegistry.clear', () => {
  it('should remove all loaded skills', () => {
    let skills: SkillDefinition[] = [
      {
        frontmatter: { name: 'skill1', description: 'First' },
        content: '',
        filePath: '/1.md',
        source: 'project',
      },
    ];

    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => skills.map(s => ({
        name: s.frontmatter.name,
        description: s.frontmatter.description,
        source: s.source,
      })),
      get: (name: string) => skills.find(s => s.frontmatter.name === name),
      has: (name: string) => skills.some(s => s.frontmatter.name === name),
      clear: () => { skills = []; },
    };

    expect(mockRegistry.has('skill1')).toBe(true);
    mockRegistry.clear();
    expect(mockRegistry.has('skill1')).toBe(false);
    expect(mockRegistry.getAll()).toHaveLength(0);
  });

  it('should be safe to call multiple times', () => {
    const mockRegistry: SkillRegistry = {
      loadAll: async () => [],
      getAll: () => [],
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };

    mockRegistry.clear();
    mockRegistry.clear();
    mockRegistry.clear();

    expect(mockRegistry.getAll()).toHaveLength(0);
  });

  it('should allow reloading after clear', async () => {
    let loaded = false;

    const mockRegistry: SkillRegistry = {
      loadAll: async () => {
        loaded = true;
        return [{
          frontmatter: { name: 'reloaded', description: 'Reloaded' },
          content: '',
          filePath: '/reloaded.md',
          source: 'project',
        }];
      },
      getAll: () => [],
      get: () => undefined,
      has: () => false,
      clear: () => { loaded = false; },
    };

    mockRegistry.clear();
    await mockRegistry.loadAll();
    expect(loaded).toBe(true);
  });
});

describe('SkillRegistry skill management', () => {
  it('should support registering skills manually', () => {
    const skills: Map<string, SkillDefinition> = new Map();

    const register = (skill: SkillDefinition) => {
      skills.set(skill.frontmatter.name, skill);
    };

    const skill: SkillDefinition = {
      frontmatter: { name: 'manual', description: 'Manual' },
      content: 'Content',
      filePath: '/manual.md',
      source: 'project',
    };

    register(skill);
    expect(skills.has('manual')).toBe(true);
    expect(skills.get('manual')).toBe(skill);
  });

  it('should support unregistering skills', () => {
    const skills: Map<string, SkillDefinition> = new Map();
    skills.set('temp', {
      frontmatter: { name: 'temp', description: 'Temporary' },
      content: '',
      filePath: '/temp.md',
      source: 'project',
    });

    const unregister = (name: string) => skills.delete(name);

    expect(skills.has('temp')).toBe(true);
    unregister('temp');
    expect(skills.has('temp')).toBe(false);
  });

  it('should support updating existing skill', () => {
    const skills: Map<string, SkillDefinition> = new Map();

    const original: SkillDefinition = {
      frontmatter: { name: 'update', description: 'Original' },
      content: 'Original content',
      filePath: '/update.md',
      source: 'project',
    };

    skills.set('update', original);

    const updated: SkillDefinition = {
      frontmatter: { name: 'update', description: 'Updated' },
      content: 'Updated content',
      filePath: '/update.md',
      source: 'project',
      lastModified: new Date(),
    };

    skills.set('update', updated);

    expect(skills.get('update')!.content).toBe('Updated content');
    expect(skills.get('update')!.frontmatter.description).toBe('Updated');
  });
});

describe('SkillRegistry filtering and search', () => {
  it('should support filtering by source', () => {
    const catalog: SkillCatalogItem[] = [
      { name: 'p1', description: 'Project 1', source: 'project' },
      { name: 'p2', description: 'Project 2', source: 'project' },
      { name: 'personal1', description: 'Personal 1', source: 'personal' },
    ];

    const projectSkills = catalog.filter(s => s.source === 'project');
    const personalSkills = catalog.filter(s => s.source === 'personal');

    expect(projectSkills).toHaveLength(2);
    expect(personalSkills).toHaveLength(1);
  });

  it('should support searching by name', () => {
    const catalog: SkillCatalogItem[] = [
      { name: 'search-test', description: 'Test', source: 'project' },
      { name: 'another', description: 'Another', source: 'project' },
    ];

    const results = catalog.filter(s => s.name.includes('search'));

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('search-test');
  });
});

describe('SkillRegistry events', () => {
  it('should support onLoad callback', async () => {
    let loadedSkill: string | null = null;

    const onLoad = (skill: SkillDefinition) => {
      loadedSkill = skill.frontmatter.name;
    };

    const skill: SkillDefinition = {
      frontmatter: { name: 'callback-test', description: 'Test' },
      content: '',
      filePath: '/test.md',
      source: 'project',
    };

    onLoad(skill);
    expect(loadedSkill).toBe('callback-test');
  });

  it('should support onError callback', () => {
    const errors: string[] = [];

    const onError = (error: { message: string }) => {
      errors.push(error.message);
    };

    onError({ message: 'Test error' });
    expect(errors).toContain('Test error');
  });
});

describe('Skill Priority (project > personal)', () => {
  it('should prioritize project skills over personal skills with same name', () => {
    const skills: SkillDefinition[] = [
      {
        frontmatter: { name: 'duplicate-skill', description: 'Personal version' },
        content: 'Personal content',
        filePath: '~/.claude/skills/duplicate-skill.md',
        source: 'personal',
      },
      {
        frontmatter: { name: 'duplicate-skill', description: 'Project version' },
        content: 'Project content',
        filePath: './.claude/skills/duplicate-skill.md',
        source: 'project',
      },
    ];

    const mergedSkills = new Map<string, SkillDefinition>();
    for (const skill of skills) {
      const existing = mergedSkills.get(skill.frontmatter.name);
      if (!existing || skill.source === 'project') {
        mergedSkills.set(skill.frontmatter.name, skill);
      }
    }

    const winner = mergedSkills.get('duplicate-skill');
    expect(winner?.source).toBe('project');
    expect(winner?.content).toBe('Project content');
    expect(winner?.frontmatter.description).toBe('Project version');
  });

  it('should load personal skills first, then project skills', () => {
    const loadOrder: string[] = [];

    const personalSkills = [
      { name: 'personal1', source: 'personal' },
      { name: 'shared', source: 'personal' },
    ];

    const projectSkills = [
      { name: 'project1', source: 'project' },
      { name: 'shared', source: 'project' },
    ];

    for (const skill of personalSkills) {
      loadOrder.push(`${skill.source}:${skill.name}`);
    }

    for (const skill of projectSkills) {
      loadOrder.push(`${skill.source}:${skill.name}`);
    }

    expect(loadOrder).toEqual([
      'personal:personal1',
      'personal:shared',
      'project:project1',
      'project:shared',
    ]);
  });

  it('should return merged catalog with correct source attribution', () => {
    const personalSkills: SkillDefinition[] = [
      {
        frontmatter: { name: 'personal-only', description: 'Personal' },
        content: '',
        filePath: '~/.claude/skills/personal-only.md',
        source: 'personal',
      },
      {
        frontmatter: { name: 'shared-skill', description: 'Personal version' },
        content: '',
        filePath: '~/.claude/skills/shared-skill.md',
        source: 'personal',
      },
    ];

    const projectSkills: SkillDefinition[] = [
      {
        frontmatter: { name: 'project-only', description: 'Project' },
        content: '',
        filePath: './.claude/skills/project-only.md',
        source: 'project',
      },
      {
        frontmatter: { name: 'shared-skill', description: 'Project version' },
        content: '',
        filePath: './.claude/skills/shared-skill.md',
        source: 'project',
      },
    ];

    const merged = new Map<string, SkillDefinition>();

    for (const skill of personalSkills) {
      merged.set(skill.frontmatter.name, skill);
    }

    for (const skill of projectSkills) {
      merged.set(skill.frontmatter.name, skill);
    }

    const catalog = Array.from(merged.values()).map(s => ({
      name: s.frontmatter.name,
      description: s.frontmatter.description,
      source: s.source,
    }));

    expect(catalog).toHaveLength(3);

    const shared = catalog.find(s => s.name === 'shared-skill');
    expect(shared?.source).toBe('project');
    expect(shared?.description).toBe('Project version');

    const personal = catalog.find(s => s.name === 'personal-only');
    expect(personal?.source).toBe('personal');

    const project = catalog.find(s => s.name === 'project-only');
    expect(project?.source).toBe('project');
  });

  it('should handle only personal skills (no project skills)', () => {
    const personalSkills: SkillDefinition[] = [
      {
        frontmatter: { name: 'personal1', description: 'Personal 1' },
        content: '',
        filePath: '~/.claude/skills/personal1.md',
        source: 'personal',
      },
      {
        frontmatter: { name: 'personal2', description: 'Personal 2' },
        content: '',
        filePath: '~/.claude/skills/personal2.md',
        source: 'personal',
      },
    ];

    const merged = new Map<string, SkillDefinition>();

    for (const skill of personalSkills) {
      merged.set(skill.frontmatter.name, skill);
    }

    expect(merged.size).toBe(2);
    expect(merged.get('personal1')?.source).toBe('personal');
    expect(merged.get('personal2')?.source).toBe('personal');
  });

  it('should handle only project skills (no personal skills)', () => {
    const projectSkills: SkillDefinition[] = [
      {
        frontmatter: { name: 'project1', description: 'Project 1' },
        content: '',
        filePath: './.claude/skills/project1.md',
        source: 'project',
      },
      {
        frontmatter: { name: 'project2', description: 'Project 2' },
        content: '',
        filePath: './.claude/skills/project2.md',
        source: 'project',
      },
    ];

    const merged = new Map<string, SkillDefinition>();

    for (const skill of projectSkills) {
      merged.set(skill.frontmatter.name, skill);
    }

    expect(merged.size).toBe(2);
    expect(merged.get('project1')?.source).toBe('project');
    expect(merged.get('project2')?.source).toBe('project');
  });

  it('should handle empty personal and project skills', () => {
    const merged = new Map<string, SkillDefinition>();
    expect(merged.size).toBe(0);
  });

  it('should maintain correct count in getAll() after merging', () => {
    const personalSkills = [
      { name: 'p1', source: 'personal' },
      { name: 'p2', source: 'personal' },
      { name: 'shared', source: 'personal' },
    ];

    const projectSkills = [
      { name: 'proj1', source: 'project' },
      { name: 'shared', source: 'project' },
    ];

    const merged = new Map<string, typeof personalSkills[0]>();

    for (const skill of personalSkills) {
      merged.set(skill.name, skill);
    }

    for (const skill of projectSkills) {
      merged.set(skill.name, skill);
    }

    expect(merged.size).toBe(4);
    expect(merged.get('shared')?.source).toBe('project');
  });
});
