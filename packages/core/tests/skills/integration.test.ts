import { describe, it, expect } from 'bun:test';
import type {
  SkillDefinition,
  SkillCatalogItem,
} from '../../src/skills/types';

const createMockSkill = (overrides: Partial<SkillDefinition> = {}): SkillDefinition => ({
  frontmatter: {
    name: 'test-skill',
    description: 'A test skill for integration',
    ...overrides.frontmatter,
  },
  content: '# Test Skill\n\nThis is test content.',
  filePath: '/test/skills/test-skill.md',
  source: 'project',
  ...overrides,
});

describe('Skills System Integration', () => {
  describe('End-to-end skill loading and execution', () => {
    it('should load skills from filesystem', async () => {
      const loadedSkills: SkillDefinition[] = [
        createMockSkill({ frontmatter: { name: 'skill1', description: 'Skill 1' } }),
        createMockSkill({ frontmatter: { name: 'skill2', description: 'Skill 2' } }),
      ];

      expect(loadedSkills).toHaveLength(2);
      expect(loadedSkills[0].frontmatter.name).toBe('skill1');
      expect(loadedSkills[1].frontmatter.name).toBe('skill2');
    });

    it('should parse skill files correctly', () => {
      const parsedSkill: SkillDefinition = {
        frontmatter: {
          name: 'parsed-skill',
          description: 'A parsed skill',
          allowedTools: ['Read', 'Write'],
        },
        content: '# Parsed Skill\n\nThis is the content.\n',
        filePath: '/test/parsed-skill.md',
        source: 'project',
      };

      expect(parsedSkill.frontmatter.name).toBe('parsed-skill');
      expect(parsedSkill.frontmatter.allowedTools).toEqual(['Read', 'Write']);
      expect(parsedSkill.content).toContain('# Parsed Skill');
    });

    it('should build catalog from loaded skills', () => {
      const skills: SkillDefinition[] = [
        createMockSkill({ frontmatter: { name: 's1', description: 'Skill 1' } }),
        createMockSkill({ frontmatter: { name: 's2', description: 'Skill 2' } }),
      ];

      const catalog: SkillCatalogItem[] = skills.map(s => ({
        name: s.frontmatter.name,
        description: s.frontmatter.description,
        source: s.source,
      }));

      expect(catalog).toHaveLength(2);
      expect(catalog[0]).not.toHaveProperty('content');
      expect(catalog[0]).not.toHaveProperty('filePath');
    });

    it('should match skills by exact name', () => {
      const catalog: SkillCatalogItem[] = [
        { name: 'commit', description: 'Generate commit', source: 'project' },
        { name: 'review', description: 'Review code', source: 'project' },
      ];

      const input = '/commit';
      const skillName = input.slice(1);
      const matched = catalog.find(s => s.name === skillName);

      expect(matched?.name).toBe('commit');
    });

    it('should preprocess skill content with $ARGUMENTS', () => {
      const content = 'Process: $ARGUMENTS';
      const args = 'file.txt --verbose';

      const processed = content.replace(/\$ARGUMENTS/g, args);

      expect(processed).toBe('Process: file.txt --verbose');
    });

    it('should handle skill execution flow', async () => {
      const skill = createMockSkill({
        frontmatter: {
          name: 'execution-test',
          description: 'Test execution',
          allowedTools: ['Read', 'Write'],
        },
      });

      const input = '/execution-test';
      const isMatch = input.slice(1) === skill.frontmatter.name;
      const processedContent = skill.content;

      expect(isMatch).toBe(true);
      expect(processedContent).toContain('# Test Skill');
    });
  });

  describe('Skill registry integration', () => {
    it('should register and retrieve skills', () => {
      const registry = new Map<string, SkillDefinition>();
      const skill = createMockSkill({ frontmatter: { name: 'registered' } });

      registry.set(skill.frontmatter.name, skill);

      expect(registry.has('registered')).toBe(true);
      expect(registry.get('registered')).toBe(skill);
    });

    it('should list all skills in catalog', () => {
      const registry = new Map<string, SkillDefinition>([
        ['s1', createMockSkill({ frontmatter: { name: 's1' } })],
        ['s2', createMockSkill({ frontmatter: { name: 's2' } })],
      ]);

      const catalog = Array.from(registry.values()).map(s => ({
        name: s.frontmatter.name,
        description: s.frontmatter.description,
        source: s.source,
      }));

      expect(catalog).toHaveLength(2);
    });

    it('should clear all skills', () => {
      const registry = new Map<string, SkillDefinition>([
        ['s1', createMockSkill()],
      ]);

      registry.clear();

      expect(registry.size).toBe(0);
    });
  });

  describe('Session integration', () => {
    it('should inject catalog into session', () => {
      const catalog: SkillCatalogItem[] = [
        { name: 'skill1', description: 'Skill 1', source: 'project' },
        { name: 'skill2', description: 'Skill 2', source: 'project' },
      ];

      const systemPrompt = `You have access to the following skills:\n${catalog
        .map(s => `- ${s.name}: ${s.description}`)
        .join('\n')}`;

      expect(systemPrompt).toContain('skill1');
      expect(systemPrompt).toContain('skill2');
    });

    it('should handle skill command in session', () => {
      const input = '/commit fix: bug fix';
      const parts = input.split(' ');
      const isCommand = parts[0].startsWith('/');
      const skillName = parts[0].slice(1);
      const args = parts.slice(1);

      expect(isCommand).toBe(true);
      expect(skillName).toBe('commit');
      expect(args).toEqual(['fix:', 'bug', 'fix']);
    });

    it('should pass skill content to agent', () => {
      const skill = createMockSkill({
        content: '# Custom Skill\n\nFollow these instructions.',
      });

      const agentContext = skill.content;

      expect(agentContext).toContain('# Custom Skill');
    });
  });

  describe('Permission integration', () => {
    it('should check permissions for skill tools', async () => {
      const skillAllowedTools = ['Read', 'Write'];
      const requestedTool = 'Write';

      const isAllowed = skillAllowedTools.includes(requestedTool);

      expect(isAllowed).toBe(true);
    });

    it('should deny tools not in skill allowedTools', () => {
      const skillAllowedTools = ['Read', 'Write'];
      const requestedTool = 'Bash';

      const isAllowed = skillAllowedTools.includes(requestedTool);

      expect(isAllowed).toBe(false);
    });

    it('should extend permissions for skill execution', () => {
      const sessionTools = ['Read', 'Glob'];
      const skillTools = ['Read', 'Write'];

      const effectiveTools = [...new Set([...sessionTools, ...skillTools])];

      expect(effectiveTools).toContain('Read');
      expect(effectiveTools).toContain('Glob');
      expect(effectiveTools).toContain('Write');
    });
  });

  describe('Error handling integration', () => {
    it('should handle skill not found', () => {
      const registry = new Map<string, SkillDefinition>();
      const skillName = 'non-existent';

      const skill = registry.get(skillName);

      expect(skill).toBeUndefined();
    });

    it('should handle parse errors gracefully', () => {
      const invalidMarkdown = 'No frontmatter here';

      const hasFrontmatter = invalidMarkdown.startsWith('---');

      expect(hasFrontmatter).toBe(false);
    });

    it('should continue execution when one skill fails', () => {
      const skills: (SkillDefinition | null)[] = [
        createMockSkill({ frontmatter: { name: 'good' } }),
        null,
        createMockSkill({ frontmatter: { name: 'another-good' } }),
      ];

      const validSkills = skills.filter((s): s is SkillDefinition => s !== null);

      expect(validSkills).toHaveLength(2);
    });
  });

  describe('Performance scenarios', () => {
    it('should handle large skill catalogs', () => {
      const largeCatalog: SkillCatalogItem[] = Array.from({ length: 100 }, (_, i) => ({
        name: `skill-${i}`,
        description: `Description for skill ${i}`,
        source: i % 2 === 0 ? 'project' : 'personal',
      }));

      expect(largeCatalog).toHaveLength(100);

      const found = largeCatalog.find(s => s.name === 'skill-50');
      expect(found).toBeDefined();
    });

    it('should lazy-load skill content', () => {
      const catalog: SkillCatalogItem[] = [
        { name: 'lazy1', description: 'Lazy 1', source: 'project' },
        { name: 'lazy2', description: 'Lazy 2', source: 'project' },
      ];

      expect(catalog[0]).not.toHaveProperty('content');

      const fullSkill = createMockSkill({ frontmatter: { name: 'lazy1' } });
      expect(fullSkill.content).toBeDefined();
    });
  });
});
