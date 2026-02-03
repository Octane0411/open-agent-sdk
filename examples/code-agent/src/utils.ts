/**
 * Utility functions for the CLI Code Agent Demo
 */

import chalk from 'chalk';

/** Print a formatted header */
export function printHeader(): void {
  console.log(chalk.cyan.bold('🤖 Gemini Code Agent Demo 1'));
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

/** Print a tool call */
export function printToolCall(name: string, args: Record<string, unknown>): void {
  const argsStr = Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  console.log(chalk.gray(`  [Tool: ${name}(${argsStr})]`));
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
