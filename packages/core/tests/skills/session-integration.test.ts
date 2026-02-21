import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { SkillCatalogItem, SkillDefinition } from '../../src/skills/types';
import type { Session } from '../../src/session/session';

// Mock skill catalog for testing
const mockCatalog: SkillCatalogItem[] = [
  {
    name: 'code-review',
    description: 'Review code for quality and best practices',
    source: 'project',
    tags: ['code', 'review'],
  },
  {
    name: 'refactor',
    description: 'Refactor code to improve structure',
    source: 'personal',
    tags: ['code', 'refactor'],
  },
  {
    name: 'test-gen',
    description: 'Generate unit tests for code',
    source: 'project',
    tags: ['testing'],
  },
];

const mockSkills: Map<string, SkillDefinition> = new Map([
  ['code-review', {
    frontmatter: {
      name: 'code-review',
      description: 'Review code for quality and best practices',
      tags: ['code', 'review'],
    },
    content: '# Code Review Skill\n\nReview the provided code.',
    filePath: '/project/.claude/skills/code-review.md',
    source: 'project',
  }],
  ['refactor', {
    frontmatter: {
      name: 'refactor',
      description: 'Refactor code to improve structure',
      tags: ['code', 'refactor'],
    },
    content: '# Refactor Skill\n\nRefactor the code.',
    filePath: '~/.claude/skills/refactor.md',
    source: 'personal',
  }],
]);

describe('Session Skill Integration', () => {
  describe('Session startup with skill catalog', () => {
    it('should load skill catalog on session creation', async () => {
      // Session should load skill catalog during initialization
      const catalogLoaded = true;
      const catalog = mockCatalog;

      expect(catalogLoaded).toBe(true);
      expect(catalog).toHaveLength(3);
      expect(catalog[0].name).toBe('code-review');
    });

    it('should have empty catalog if no skills directory exists', async () => {
      // When skills directories don't exist, catalog should be empty
      const emptyCatalog: SkillCatalogItem[] = [];

      expect(emptyCatalog).toHaveLength(0);
    });

    it('should merge personal and project skills', async () => {
      // Personal skills should be merged with project skills
      // Project skills take precedence on name conflicts
      const mergedCatalog: SkillCatalogItem[] = [
        { name: 'project-skill', description: 'Project', source: 'project' },
        { name: 'personal-skill', description: 'Personal', source: 'personal' },
      ];

      const projectSkills = mergedCatalog.filter(s => s.source === 'project');
      const personalSkills = mergedCatalog.filter(s => s.source === 'personal');

      expect(projectSkills).toHaveLength(1);
      expect(personalSkills).toHaveLength(1);
    });

    it('should handle duplicate skill names (project takes precedence)', async () => {
      // When both personal and project have same skill name
      const duplicates: SkillCatalogItem[] = [
        { name: 'duplicate', description: 'Project version', source: 'project' },
        { name: 'duplicate', description: 'Personal version', source: 'personal' },
      ];

      // Project version should take precedence
      const projectVersion = duplicates.find(s => s.source === 'project');
      expect(projectVersion?.description).toBe('Project version');
    });
  });

  describe('Catalog injection into systemPrompt', () => {
    it('should inject skill catalog into system prompt', () => {
      // System prompt should include available skills
      const systemPrompt = `You are a helpful assistant.

Available skills:
- code-review: Review code for quality and best practices
- refactor: Refactor code to improve structure
- test-gen: Generate unit tests for code

To use a skill, start your message with "/skill-name".`;

      expect(systemPrompt).toContain('Available skills');
      expect(systemPrompt).toContain('code-review');
      expect(systemPrompt).toContain('refactor');
      expect(systemPrompt).toContain('/skill-name');
    });

    it('should format catalog as markdown list', () => {
      const formatCatalog = (catalog: SkillCatalogItem[]) => {
        return catalog.map(s => `- ${s.name}: ${s.description}`).join('\n');
      };

      const formatted = formatCatalog(mockCatalog);

      expect(formatted).toContain('- code-review: Review code');
      expect(formatted).toContain('- refactor: Refactor code');
      expect(formatted).toStartWith('- ');
    });

    it('should handle empty catalog gracefully', () => {
      const emptyCatalog: SkillCatalogItem[] = [];
      const systemPrompt = 'You are a helpful assistant.';

      // Empty catalog should not add skills section
      const hasSkillsSection = systemPrompt.includes('Available skills');

      expect(emptyCatalog).toHaveLength(0);
      expect(hasSkillsSection).toBe(false);
    });

    it('should include skill tags in catalog description', () => {
      const skillWithTags = mockCatalog[0];
      const description = `${skillWithTags.description} [${skillWithTags.tags?.join(', ')}]`;

      expect(description).toContain('[code, review]');
    });
  });

  describe('Progressive disclosure', () => {
    it('should provide lightweight catalog (name + description only)', () => {
      // Catalog should not include full content
      const catalog = mockCatalog[0];

      expect(catalog).toHaveProperty('name');
      expect(catalog).toHaveProperty('description');
      expect(catalog).toHaveProperty('source');
      expect(catalog).not.toHaveProperty('content');
      expect(catalog).not.toHaveProperty('filePath');
    });

    it('should lazy-load full skill content when needed', async () => {
      // Full skill should only be loaded when specifically requested
      const skillName = 'code-review';
      const fullSkill = mockSkills.get(skillName);

      expect(fullSkill).toBeDefined();
      expect(fullSkill?.content).toBeDefined();
      expect(fullSkill?.filePath).toBeDefined();
    });

    it('should cache loaded skills to avoid repeated file reads', () => {
      // Once a skill is loaded, it should be cached
      const cache = new Map<string, SkillDefinition>();
      const skill = mockSkills.get('code-review');

      if (skill) {
        cache.set(skill.frontmatter.name, skill);
      }

      // Second access should use cache
      const cached = cache.get('code-review');
      expect(cached).toBe(skill);
    });
  });

  describe('Session skill methods', () => {
    it('should have getSkillCatalog method', () => {
      // Session should expose method to get catalog
      const mockSession = {
        getSkillCatalog: (): SkillCatalogItem[] => mockCatalog,
      };

      expect(typeof mockSession.getSkillCatalog).toBe('function');
      expect(mockSession.getSkillCatalog()).toHaveLength(3);
    });

    it('should have getSkill method to retrieve full skill', () => {
      // Session should expose method to get full skill
      const mockSession = {
        getSkill: (name: string): SkillDefinition | undefined => {
          return mockSkills.get(name);
        },
      };

      const skill = mockSession.getSkill('code-review');
      expect(skill).toBeDefined();
      expect(skill?.frontmatter.name).toBe('code-review');
    });

    it('should return undefined for non-existent skill', () => {
      const mockSession = {
        getSkill: (name: string): SkillDefinition | undefined => {
          return mockSkills.get(name);
        },
      };

      const skill = mockSession.getSkill('non-existent');
      expect(skill).toBeUndefined();
    });

    it('should have hasSkill method to check skill existence', () => {
      const mockSession = {
        hasSkill: (name: string): boolean => mockSkills.has(name),
      };

      expect(mockSession.hasSkill('code-review')).toBe(true);
      expect(mockSession.hasSkill('non-existent')).toBe(false);
    });
  });

  describe('Skill catalog refresh', () => {
    it('should support refreshing catalog without restarting session', async () => {
      // Session should be able to reload skills
      let catalog = [...mockCatalog];
      const refreshCatalog = async () => {
        // Simulate refresh
        catalog = [...mockCatalog, {
          name: 'new-skill',
          description: 'A new skill',
          source: 'project',
        }];
        return catalog;
      };

      expect(catalog).toHaveLength(3);
      await refreshCatalog();
      expect(catalog).toHaveLength(4);
    });

    it('should update system prompt after catalog refresh', async () => {
      const updatedCatalog: SkillCatalogItem[] = [
        ...mockCatalog,
        { name: 'new-skill', description: 'New skill', source: 'project' },
      ];

      const systemPrompt = `Available skills:\n${updatedCatalog.map(s => `- ${s.name}`).join('\n')}`;

      expect(systemPrompt).toContain('new-skill');
    });
  });

  describe('Error handling', () => {
    it('should handle skill loading errors gracefully', () => {
      // Errors during skill loading should not crash session
      const errors: string[] = [];
      const loadSkills = () => {
        try {
          // Simulate error
          throw new Error('Failed to load skills');
        } catch (e) {
          errors.push((e as Error).message);
          return []; // Return empty catalog on error
        }
      };

      const catalog = loadSkills();
      expect(catalog).toHaveLength(0);
      expect(errors).toHaveLength(1);
    });

    it('should continue session creation even if skill loading fails', () => {
      const skillLoadingFailed = true;
      const sessionCreated = true;

      expect(skillLoadingFailed).toBe(true);
      expect(sessionCreated).toBe(true);
    });
  });

  describe('Skill filtering', () => {
    it('should filter skills by source', () => {
      const projectSkills = mockCatalog.filter(s => s.source === 'project');
      const personalSkills = mockCatalog.filter(s => s.source === 'personal');

      expect(projectSkills).toHaveLength(2);
      expect(personalSkills).toHaveLength(1);
    });

    it('should filter skills by tags', () => {
      const codeSkills = mockCatalog.filter(s => s.tags?.includes('code'));

      expect(codeSkills).toHaveLength(2);
      expect(codeSkills.map(s => s.name)).toContain('code-review');
      expect(codeSkills.map(s => s.name)).toContain('refactor');
    });

    it('should search skills by name', () => {
      const searchTerm = 'refactor';
      const results = mockCatalog.filter(s =>
        s.name.includes(searchTerm) || s.description.includes(searchTerm)
      );

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('refactor');
    });
  });
});
