/**
 * Skill loader module
 *
 * This module provides functionality to load skills from file system,
 * including scanning directories and parsing skill files.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { homedir } from 'os';
import type {
  SkillLoaderOptions,
  SkillDefinition,
} from './types';
import { parseSkillFile } from './parser';

/**
 * Default skill directories
 */
const DEFAULT_PERSONAL_DIR = '~/.claude/skills';
const DEFAULT_PROJECT_DIR = './.claude/skills';
const LEGACY_COMMANDS_DIR = './.claude/commands';

/**
 * Expand tilde (~) in path to home directory
 * Uses process.env.HOME if set (for testing), otherwise falls back to os.homedir()
 * @param filePath - Path that may contain ~
 * @returns Expanded path
 */
function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    const home = process.env.HOME || homedir();
    return join(home, filePath.slice(1));
  }
  return filePath;
}

/**
 * Skill loader class
 * Responsible for loading skills from various sources
 */
export class SkillLoader {
  private options: Required<SkillLoaderOptions>;
  private errors: Array<{ type: string; message: string; filePath: string; cause?: Error }> = [];

  /**
   * Create a new SkillLoader instance
   *
   * @param options - Loader configuration options
   */
  constructor(options: SkillLoaderOptions = {}) {
    this.options = {
      additionalDirs: options.additionalDirs ?? [],
      includePersonal: options.includePersonal ?? true,
      includeProject: options.includeProject ?? true,
      includeLegacyCommands: options.includeLegacyCommands ?? false,
    };
  }

  /**
   * Load all skills from configured directories
   *
   * @returns Array of loaded skill definitions
   */
  async loadAll(): Promise<SkillDefinition[]> {
    this.errors = [];
    const skills: SkillDefinition[] = [];
    const loadedNames = new Set<string>();

    // Collect all directories to scan
    const dirsToScan: Array<{ path: string; source: 'personal' | 'project' }> = [];

    if (this.options.includePersonal) {
      dirsToScan.push({ path: DEFAULT_PERSONAL_DIR, source: 'personal' });
    }

    if (this.options.includeProject) {
      dirsToScan.push({ path: DEFAULT_PROJECT_DIR, source: 'project' });
    }

    // Add additional directories as project sources
    for (const dir of this.options.additionalDirs) {
      dirsToScan.push({ path: dir, source: 'project' });
    }

    // Scan each directory
    for (const { path, source } of dirsToScan) {
      const dirSkills = await this.loadFromDirectory(path, source, loadedNames);
      skills.push(...dirSkills);
    }

    // Load legacy commands if enabled
    if (this.options.includeLegacyCommands) {
      const legacySkills = await this.loadLegacyCommands(loadedNames);
      skills.push(...legacySkills);
    }

    return skills;
  }

  /**
   * Load skills from a specific directory
   *
   * @param dirPath - Directory path to scan
   * @param source - Source type ('personal' or 'project')
   * @param loadedNames - Set of already loaded skill names (for duplicate detection)
   * @returns Array of loaded skill definitions
   */
  private async loadFromDirectory(
    dirPath: string,
    source: 'personal' | 'project',
    loadedNames: Set<string>
  ): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];

    try {
      const files = await this.scanDirectory(dirPath);

      for (const filePath of files) {
        const result = await this.loadSkill(filePath, source);

        if (result.success && result.skill) {
          // Check for duplicates
          if (loadedNames.has(result.skill.frontmatter.name)) {
            this.errors.push({
              type: 'DUPLICATE_SKILL',
              message: `Skill "${result.skill.frontmatter.name}" already loaded`,
              filePath,
            });
            continue;
          }

          loadedNames.add(result.skill.frontmatter.name);
          skills.push(result.skill);
        } else if (result.error) {
          this.errors.push({
            type: 'PARSE_ERROR',
            message: result.error,
            filePath,
          });
        }
      }
    } catch (error) {
      // Directory might not exist, which is fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.errors.push({
          type: 'IO_ERROR',
          message: (error as Error).message,
          filePath: dirPath,
          cause: error as Error,
        });
      }
    }

    return skills;
  }

  /**
   * Scan a directory recursively for .md files
   *
   * @param dirPath - Directory path to scan
   * @returns Array of file paths
   */
  async scanDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const expandedPath = expandTilde(dirPath);

    try {
      const entries = await readdir(expandedPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(expandedPath, entry.name);

        // Skip hidden files and directories
        if (entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanDirectory(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && extname(entry.name) === '.md') {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return files;
  }

  /**
   * Load a single skill file
   *
   * @param filePath - Path to the skill file
   * @param source - Source type ('personal' or 'project')
   * @returns Object with success status and skill or error
   */
  async loadSkill(
    filePath: string,
    source: 'personal' | 'project'
  ): Promise<{ success: boolean; skill?: SkillDefinition; error?: string }> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const fileStat = await stat(filePath);

      const result = parseSkillFile(content, filePath, source);

      if (result.success && result.skill) {
        result.skill.lastModified = fileStat.mtime;
      }

      return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: false,
          error: 'File not found',
        };
      }
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Load legacy commands from .claude/commands directory
   *
   * @param loadedNames - Set of already loaded skill names
   * @returns Array of loaded skill definitions
   */
  private async loadLegacyCommands(
    loadedNames: Set<string>
  ): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];

    try {
      const files = await this.scanDirectory(LEGACY_COMMANDS_DIR);

      for (const filePath of files) {
        try {
          const content = await readFile(filePath, 'utf-8');
          const fileStat = await stat(filePath);

          // Legacy commands don't have frontmatter, so we create a basic one
          const name = basename(filePath, '.md');

          // Check for duplicates
          if (loadedNames.has(name)) {
            this.errors.push({
              type: 'DUPLICATE_SKILL',
              message: `Skill "${name}" already loaded`,
              filePath,
            });
            continue;
          }

          // Extract description from first line of content
          const firstLine = content.trim().split('\n')[0].trim();
          const description = firstLine.startsWith('#')
            ? firstLine.replace(/^#+\s*/, '').trim()
            : firstLine.substring(0, 100);

          const skill: SkillDefinition = {
            frontmatter: {
              name,
              description: description || `Legacy command: ${name}`,
            },
            content,
            filePath,
            source: 'project',
            lastModified: fileStat.mtime,
          };

          loadedNames.add(name);
          skills.push(skill);
        } catch (error) {
          this.errors.push({
            type: 'PARSE_ERROR',
            message: (error as Error).message,
            filePath,
          });
        }
      }
    } catch {
      // Legacy commands directory might not exist
    }

    return skills;
  }

  /**
   * Get all errors that occurred during loading
   *
   * @returns Array of load errors
   */
  getErrors(): Array<{ type: string; message: string; filePath: string; cause?: Error }> {
    return [...this.errors];
  }
}
