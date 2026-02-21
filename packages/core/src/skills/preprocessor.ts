/**
 * Skill preprocessor module
 *
 * This module provides functionality to preprocess skill content,
 * performing argument and environment variable substitution.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { PreprocessorContext } from './types';

const execAsync = promisify(exec);

/**
 * Preprocess skill content by substituting variables
 *
 * Supports:
 * - $0, $1, $2, ... - Positional arguments
 * - $ARGUMENTS - All arguments joined as string
 * - $ENV_VAR - Environment variables
 * - !`command` - Dynamic command injection (async only)
 *
 * @param content - The skill content to preprocess
 * @param context - Preprocessor context with args and env
 * @returns Processed content with substitutions applied
 */
export function preprocessContent(
  content: string,
  context: PreprocessorContext
): string {
  let result = content;

  // Replace $ARGUMENTS first (before positional args to avoid conflicts)
  result = result.replace(/\$ARGUMENTS/g, context.arguments);

  // Replace positional arguments $0, $1, $2, etc.
  // Match $ followed by one or more digits
  result = result.replace(/\$(\d+)/g, (match, indexStr) => {
    const index = parseInt(indexStr, 10);
    if (index < context.args.length) {
      return context.args[index];
    }
    return match; // Keep original if index out of bounds
  });

  // Replace environment variables ${VAR_NAME} or $VAR_NAME
  // First handle ${VAR_NAME} format
  result = result.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
    if (varName in context.env) {
      return context.env[varName];
    }
    return match; // Keep original if variable not found
  });

  // Then handle $VAR_NAME format
  result = result.replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, varName) => {
    if (varName in context.env) {
      return context.env[varName];
    }
    return match; // Keep original if variable not found
  });

  return result;
}

/**
 * Preprocess skill content asynchronously with dynamic command injection
 *
 * Supports all features of preprocessContent plus:
 * - !`command` - Execute command and replace with output
 *
 * @param content - The skill content to preprocess
 * @param context - Preprocessor context with args and env
 * @param options - Optional configuration
 * @returns Processed content with substitutions applied
 */
export async function preprocessContentAsync(
  content: string,
  context: PreprocessorContext,
  options: {
    /** Command timeout in milliseconds (default: 30000) */
    commandTimeout?: number;
    /** Current working directory for command execution */
    cwd?: string;
  } = {}
): Promise<string> {
  // First apply synchronous substitutions
  let result = preprocessContent(content, context);

  // Replace dynamic commands !`command`
  const commandRegex = /!`([^`]+)`/g;
  const matches = Array.from(result.matchAll(commandRegex));

  // Process commands sequentially to maintain order
  for (const match of matches) {
    const fullMatch = match[0];
    const command = match[1].trim();

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: options.commandTimeout ?? 30000,
        cwd: options.cwd,
        env: { ...process.env, ...context.env },
      });

      // Use stdout if available, otherwise stderr
      const output = stdout.trim() || stderr.trim() || '';

      // Replace only the first occurrence to handle multiple commands
      result = result.replace(fullMatch, output);
    } catch (error) {
      // Command failed - replace with error message but don't interrupt
      const errorMessage = `[Command failed: ${(error as Error).message}]`;
      result = result.replace(fullMatch, errorMessage);
    }
  }

  return result;
}

/**
 * Create a preprocessor context from process arguments
 *
 * @param args - Array of arguments (defaults to process.argv.slice(2))
 * @param env - Environment variables (defaults to process.env)
 * @returns PreprocessorContext object
 */
export function createPreprocessorContext(
  args?: string[],
  env?: Record<string, string>
): PreprocessorContext {
  const actualArgs = args ?? process.argv.slice(2);
  const actualEnv = env ?? (process.env as Record<string, string>);

  return {
    args: actualArgs,
    env: actualEnv,
    arguments: actualArgs.join(' '),
  };
}
