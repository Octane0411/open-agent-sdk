/**
 * Utility functions for the CLI Code Agent Demo
 */

import chalk from 'chalk';
import readline from 'readline';

/** Tool icon mapping */
export const TOOL_ICONS: Record<string, string> = {
  read: '📖',
  write: '✏️',
  edit: '🔧',
  bash: '🐚',
  glob: '🔍',
  grep: '🎯',
};

/** Get icon for a tool name */
export function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName.toLowerCase()] || '🔧';
}

/** Spinner class for showing loading states */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: NodeJS.Timeout | null = null;
  private text: string;
  private frameIndex = 0;

  constructor(text: string = 'Loading...') {
    this.text = text;
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      process.stdout.write(`\r${chalk.cyan(frame)} ${this.text}`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  stop(clear: boolean = true): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (clear) {
      process.stdout.write('\r' + ' '.repeat(this.text.length + 2) + '\r');
    }
  }

  updateText(text: string): void {
    this.text = text;
  }
}

/** Print a formatted header */
export function printHeader(): void {
  console.log(chalk.cyan.bold('🤖 Gemini Code Agent Demo'));
  console.log(chalk.gray('━'.repeat(50)));
  console.log();
}

/** Print the help message */
export function printHelp(): void {
  console.log(chalk.yellow.bold('Available Commands:'));
  console.log();
  console.log('  ' + chalk.green('/help') + '              Show this help message');
  console.log('  ' + chalk.green('/exit') + ' or ' + chalk.green('/quit') + '     Exit the program');
  console.log('  ' + chalk.green('/save') + '              Manually save the current session');
  console.log('  ' + chalk.green('/load <id>') + '         Load a session by ID');
  console.log('  ' + chalk.green('/list') + '              List all saved sessions');
  console.log('  ' + chalk.green('/clear') + '             Clear current conversation history');
  console.log('  ' + chalk.green('/info') + '              Show current session info');
  console.log('  ' + chalk.green('/tasks') + '             Show current task list');
  console.log();
  console.log(chalk.yellow.bold('Tips:'));
  console.log('  • Type any message to chat with the AI');
  console.log('  • The AI can read, write, edit, search files, and run shell commands');
  console.log('  • Press Ctrl+C to cancel the current request');
  console.log('  • Sessions are auto-saved when using /save or at exit');
  console.log();
}

/** Print a formatted user prompt */
export function printUserPrompt(): void {
  process.stdout.write(chalk.blue.bold('You: '));
}

/** Print the assistant's response prefix */
export function printAssistantPrefix(): void {
  console.log(chalk.magenta.bold('Assistant:'));
}

/** Print a tool call with card-style formatting */
export function printToolCall(name: string, args: Record<string, unknown>): void {
  const icon = getToolIcon(name);
  const width = 50;

  // Build the card
  const lines: string[] = [];
  lines.push(`┌─ ${icon} Tool: ${name} ${'─'.repeat(Math.max(0, width - name.length - 11))}`);

  // Format arguments
  const argEntries = Object.entries(args);
  if (argEntries.length === 0) {
    lines.push('│  (no arguments)');
  } else {
    for (const [key, value] of argEntries) {
      const valueStr = JSON.stringify(value);
      const displayValue = valueStr.length > 40 ? valueStr.slice(0, 37) + '...' : valueStr;
      lines.push(`│  ${chalk.gray(key)}: ${displayValue}`);
    }
  }

  lines.push('└' + '─'.repeat(width));

  console.log();
  console.log(chalk.cyan(lines.join('\n')));
}

/** Print tool result with success/error status */
export function printToolResult(toolName: string, isError: boolean, duration?: number): void {
  const icon = isError ? chalk.red('✗') : chalk.green('✓');
  const durationStr = duration ? ` (${duration.toFixed(2)}s)` : '';
  console.log(`${icon} ${toolName} ${isError ? 'failed' : 'completed'}${durationStr}`);
}

/** Format tool result content for display */
export function formatToolResult(result: unknown): string {
  if (typeof result !== 'object' || result === null) {
    return String(result).slice(0, 200);
  }

  const resultObj = result as Record<string, unknown>;

  if (resultObj.files !== undefined && Array.isArray(resultObj.files)) {
    return `Found ${resultObj.files.length} file(s)`;
  }

  if (resultObj.matches !== undefined && Array.isArray(resultObj.matches)) {
    return `Found ${resultObj.matches.length} match(es)`;
  }

  if (resultObj.content !== undefined) {
    const content = String(resultObj.content);
    return content.slice(0, 200) + (content.length > 200 ? '...' : '');
  }

  if (resultObj.stdout !== undefined) {
    const stdout = String(resultObj.stdout);
    return stdout.slice(0, 200) + (stdout.length > 200 ? '...' : '');
  }

  return JSON.stringify(result).slice(0, 200);
}

/** Print a success message */
export function printSuccess(message: string): void {
  console.log(chalk.green('✓ ') + message);
}

/** Print an error message */
export function printError(message: string): void {
  console.log(chalk.red('✗ ') + message);
}

/** Print an info message */
export function printInfo(message: string): void {
  console.log(chalk.yellow('ℹ ') + message);
}

/** Print a session item for the list command */
export function printSessionItem(id: string, createdAt: number, messageCount: number): void {
  const date = new Date(createdAt).toLocaleString();
  const shortId = id.slice(0, 8) + '...' + id.slice(-4);
  console.log(`  ${chalk.cyan(shortId)}  ${chalk.gray(date)}  ${messageCount} messages`);
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** Print goodbye message */
export function printGoodbye(): void {
  console.log();
  console.log(chalk.cyan('👋 Goodbye!'));
}

/** Check if a string is a command */
export function isCommand(input: string): boolean {
  return input.startsWith('/');
}

/** Parse a command and its arguments */
export function parseCommand(input: string): { command: string; args: string[] } {
  const parts = input.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  return { command, args };
}
