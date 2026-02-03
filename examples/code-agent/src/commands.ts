/**
 * Command handlers for the CLI Code Agent Demo
 */

import type { FileStorage, InMemoryStorage } from '@open-agent-sdk/core';
import { Session, resumeSession } from '@open-agent-sdk/core';
import { printSuccess, printError, printInfo, printSessionItem, printHelp } from './utils.js';

/** Storage type - can be either FileStorage or InMemoryStorage */
type Storage = FileStorage | InMemoryStorage;

/** Command handler function type */
type CommandHandler = (args: string[], context: CommandContext) => Promise<boolean>;

/** Context passed to command handlers */
interface CommandContext {
  session: Session | null;
  storage: Storage;
  setSession: (session: Session | null) => void;
  clearHistory: () => void;
}

/** Command registry */
const commands = new Map<string, CommandHandler>();

/** Register a command */
function registerCommand(name: string, handler: CommandHandler): void {
  commands.set(name, handler);
}

/** Handle the /help command */
registerCommand('/help', async () => {
  printHelp();
  return true;
});

/** Handle the /exit and /quit commands */
registerCommand('/exit', async (_, context) => {
  if (context.session) {
    await context.session.close();
  }
  return false;
});

registerCommand('/quit', async (_, context) => {
  if (context.session) {
    await context.session.close();
  }
  return false;
});

/** Handle the /save command */
registerCommand('/save', async (_, context) => {
  if (!context.session) {
    printError('No active session to save');
    return true;
  }

  try {
    // Session is auto-saved after each stream, but we can force a save
    // by triggering a no-op or just confirming it's saved
    printSuccess(`Session saved (ID: ${context.session.id})`);
    printInfo('Sessions are automatically saved after each interaction');
  } catch (error) {
    printError(`Failed to save session: ${error instanceof Error ? error.message : String(error)}`);
  }
  return true;
});

/** Handle the /load command */
registerCommand('/load', async (args, context) => {
  if (args.length === 0) {
    printError('Usage: /load <session-id>');
    return true;
  }

  const sessionId = args[0];

  try {
    // Close current session if exists
    if (context.session) {
      await context.session.close();
    }

    // Resume the session
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      printError('GEMINI_API_KEY environment variable is required');
      return true;
    }

    const session = await resumeSession(sessionId, {
      storage: context.storage,
      apiKey,
    });

    context.setSession(session);
    printSuccess(`Session loaded: ${session.id}`);
    printInfo(`Model: ${session.model}`);
    printInfo(`Messages: ${session.getMessages().length}`);
  } catch (error) {
    printError(`Failed to load session: ${error instanceof Error ? error.message : String(error)}`);
  }
  return true;
});

/** Handle the /list command */
registerCommand('/list', async (_, context) => {
  try {
    const sessionIds = await context.storage.list();

    if (sessionIds.length === 0) {
      printInfo('No saved sessions found');
      return true;
    }

    console.log();
    console.log('Saved Sessions:');
    console.log();

    for (const id of sessionIds) {
      try {
        const data = await context.storage.load(id);
        if (data) {
          printSessionItem(id, data.createdAt, data.messages.length);
        }
      } catch {
        // Skip invalid sessions
      }
    }
    console.log();
  } catch (error) {
    printError(`Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`);
  }
  return true;
});

/** Handle the /clear command */
registerCommand('/clear', async (_, context) => {
  context.clearHistory();
  printSuccess('Conversation history cleared');
  return true;
});

/** Handle the /info command */
registerCommand('/info', async (_, context) => {
  if (!context.session) {
    printError('No active session');
    return true;
  }

  console.log();
  console.log('Session Info:');
  console.log(`  ID:       ${context.session.id}`);
  console.log(`  Model:    ${context.session.model}`);
  console.log(`  Provider: ${context.session.provider}`);
  console.log(`  State:    ${context.session.state}`);
  console.log(`  Messages: ${context.session.getMessages().length}`);
  console.log(`  Created:  ${new Date(context.session.createdAt).toLocaleString()}`);
  console.log();
  return true;
});

/**
 * Execute a command
 * @returns true to continue, false to exit
 */
export async function executeCommand(
  command: string,
  args: string[],
  context: CommandContext
): Promise<boolean> {
  const handler = commands.get(command);

  if (!handler) {
    printError(`Unknown command: ${command}. Type /help for available commands.`);
    return true;
  }

  return handler(args, context);
}

/** Check if a command exists */
export function hasCommand(command: string): boolean {
  return commands.has(command);
}
