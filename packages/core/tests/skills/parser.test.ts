import { describe, it, expect } from 'bun:test';
import {
  parseSkillFile,
  parseFrontmatter,
  extractContent,
  validateFrontmatter,
} from '../../src/skills/parser';

describe('parseSkillFile', () => {
  it('should parse valid SKILL.md with frontmatter and content', () => {
    const markdown = `---
name: test-skill
description: A test skill
---

# Test Skill

This is the skill content.
`;
    const result = parseSkillFile(markdown, '/test/skill.md', 'project');

    expect(result.success).toBe(true);
    expect(result.skill?.frontmatter.name).toBe('test-skill');
    expect(result.skill?.frontmatter.description).toBe('A test skill');
    expect(result.skill?.content).toContain('# Test Skill');
    expect(result.skill?.filePath).toBe('/test/skill.md');
    expect(result.skill?.source).toBe('project');
  });

  it('should parse frontmatter with optional fields', () => {
    const markdown = `---
name: full-skill
description: A skill with all fields
allowedTools: ['Read', 'Write']
model: sonnet
---

Content here.
`;
    const result = parseSkillFile(markdown, '/test/skill.md', 'project');

    expect(result.success).toBe(true);
    expect(result.skill?.frontmatter.name).toBe('full-skill');
    expect(result.skill?.frontmatter.allowedTools).toEqual(['Read', 'Write']);
    expect(result.skill?.frontmatter.model).toBe('sonnet');
  });

  it('should return error for missing frontmatter', () => {
    const markdown = '# Just markdown\n\nNo frontmatter here.';
    const result = parseSkillFile(markdown, '/test.md', 'project');

    expect(result.success).toBe(false);
    expect(result.error).toContain('frontmatter');
  });

  it('should return error for missing required name field', () => {
    const markdown = `---
description: Missing name field
---

Content.
`;
    const result = parseSkillFile(markdown, '/test.md', 'project');

    expect(result.success).toBe(false);
    expect(result.error).toContain('name');
  });

  it('should return error for missing required description field', () => {
    const markdown = `---
name: no-description
---

Content.
`;
    const result = parseSkillFile(markdown, '/test.md', 'project');

    expect(result.success).toBe(false);
    expect(result.error).toContain('description');
  });

  it('should handle empty content after frontmatter', () => {
    const markdown = `---
name: empty-content
description: Skill with no content
---
`;
    const result = parseSkillFile(markdown, '/test.md', 'project');

    expect(result.success).toBe(true);
    expect(result.skill?.content).toBe('');
  });

  it('should handle Windows-style line endings', () => {
    const markdown = `---\r\nname: windows\r\ndescription: Windows line endings\r\n---\r\n\r\nContent.\r\n`;
    const result = parseSkillFile(markdown, '/test.md', 'project');

    expect(result.success).toBe(true);
    expect(result.skill?.frontmatter.name).toBe('windows');
    expect(result.skill?.content).toContain('Content.');
  });
});

describe('parseFrontmatter', () => {
  it('should parse YAML frontmatter from markdown', () => {
    const markdown = `---
name: test-skill
description: Test description
---

Content.
`;
    const result = parseFrontmatter(markdown);

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('test-skill');
    expect(result.data?.description).toBe('Test description');
  });

  it('should return error for missing frontmatter', () => {
    const markdown = '# Just content';
    const result = parseFrontmatter(markdown);

    expect(result.success).toBe(false);
    expect(result.error).toContain('frontmatter');
  });

  it('should return error for malformed YAML', () => {
    const markdown = `---
name: test
  unclosed: [bracket
---

Content.
`;
    const result = parseFrontmatter(markdown);

    expect(result.success).toBe(false);
    expect(result.error).toContain('YAML');
  });
});

describe('extractContent', () => {
  it('should extract content after frontmatter', () => {
    const markdown = `---
name: test
description: Test
---

# Content starts here

More content.
`;
    const content = extractContent(markdown);

    expect(content).toContain('# Content starts here');
    expect(content).toContain('More content.');
  });

  it('should return empty string when only frontmatter with newline exists', () => {
    const markdown = `---
name: test
description: Test
---
`;
    const content = extractContent(markdown);

    expect(content).toBe('');
  });

  it('should return full markdown when no frontmatter', () => {
    const markdown = '# Just content\n\nNo frontmatter.';
    const content = extractContent(markdown);

    expect(content).toBe('# Just content\n\nNo frontmatter.');
  });
});

describe('validateFrontmatter', () => {
  it('should return no errors for valid frontmatter', () => {
    const frontmatter = {
      name: 'valid-skill',
      description: 'A valid skill',
    };
    const errors = validateFrontmatter(frontmatter);

    expect(errors).toHaveLength(0);
  });

  it('should return error for missing name', () => {
    const frontmatter = {
      description: 'Missing name',
    };
    const errors = validateFrontmatter(frontmatter);

    expect(errors).toContain('Missing required field: name');
  });

  it('should return error for missing description', () => {
    const frontmatter = {
      name: 'missing-description',
    };
    const errors = validateFrontmatter(frontmatter);

    expect(errors).toContain('Missing required field: description');
  });

  it('should validate allowedTools is an array', () => {
    const frontmatter = {
      name: 'test',
      description: 'Test',
      allowedTools: 'not-an-array',
    };
    const errors = validateFrontmatter(frontmatter);

    expect(errors).toContain('Field "allowedTools" must be an array');
  });

  it('should validate model is a string', () => {
    const frontmatter = {
      name: 'test',
      description: 'Test',
      model: 123,
    };
    const errors = validateFrontmatter(frontmatter);

    expect(errors).toContain('Field "model" must be a string');
  });
});
