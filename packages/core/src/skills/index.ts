/**
 * Skills module public API
 *
 * This module provides the Skills system for Open Agent SDK,
 * allowing users to define reusable skill templates.
 */

// Export all types
export type {
  SkillFrontmatter,
  SkillDefinition,
  SkillCatalogItem,
  SkillLoaderOptions,
  SkillRegistry,
  SkillParserOptions,
  SkillParseResult,
  PreprocessorContext,
  SkillLoadError,
  SkillLoadErrorType,
} from './types';

// Export parser functions
export {
  parseSkillFile,
  parseFrontmatter,
  extractContent,
  validateFrontmatter,
} from './parser';

// Export loader
export { SkillLoader } from './loader';

// Export registry
export { createSkillRegistry } from './registry';

// Export preprocessor
export {
  preprocessContent,
  preprocessContentAsync,
  createPreprocessorContext,
} from './preprocessor';

// Export matcher
export {
  exactMatch,
  findByDescription,
  parseSkillCommand,
  isSkillCommand,
  type MatchResult,
} from './matcher';

// Export executor
export {
  executeSkill,
  getSkillContent,
  buildSkillSystemPrompt,
  createSkillPreprocessorContext,
  shouldUseSubagent,
  buildAgentDefinitionFromSkill,
  executeSkillInSubagent,
  type SkillExecutionResult,
} from './executor';
