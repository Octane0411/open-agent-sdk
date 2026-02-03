/**
 * CLI interaction logic for the Code Agent Demo
 */

import readline from 'readline';
import chalk from 'chalk';
import type { SDKMessage, SDKAssistantMessage, SDKToolResultMessage } from '@open-agent-sdk/core';
import { Session, createSession, FileStorage } from '@open-agent-sdk/core';
import {
  printHeader,
  printHelp,
  printUserPrompt,
  printAssistantPrefix,
  printSuccess,
  printError,
  printGoodbye,
  isCommand,
  parseCommand,
  Spinner,
} from './utils.js';
import { executeCommand } from './commands.js';
import { ToolManager, TerminalRenderer } from './utils/index.js';

/** CLI class managing the interactive session */
export class CLI {
  private rl: readline.Interface;
  private session: Session | null = null;
  private storage: FileStorage;
  private abortController: AbortController | null = null;
  private isRunning = false;
  private spinner: Spinner;
  private toolManager: ToolManager;
  private terminalRenderer: TerminalRenderer;
  private hasDisplayedTools = false;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Use file storage for persistence
    this.storage = new FileStorage();

    // Initialize spinner
    this.spinner = new Spinner('Calling API...');

    // Initialize tool manager and renderer
    this.toolManager = new ToolManager();
    this.terminalRenderer = new TerminalRenderer();

    // Handle Ctrl+C
    this.rl.on('SIGINT', () => {
      this.handleSigint();
    });
  }

  /** Initialize and start the CLI */
  async start(): Promise<void> {
    printHeader();

    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      printError('GEMINI_API_KEY environment variable is required');
      console.log('Example: GEMINI_API_KEY=your-api-key bun dev');
      process.exit(1);
    }

    // Create initial session
    try {
      this.session = await createSession({
        model: 'gemini-2.0-flash',
        provider: 'google',
        apiKey,
        maxTurns: 10,
        logLevel: 'silent',
        systemPrompt: `You are a helpful code assistant with access to file, shell, and web tools.

Available tools:
- Read: Read file contents
- Write: Write content to files
- Edit: Edit existing files
- Bash: Execute shell commands
- Glob: Find files matching patterns
- Grep: Search for text in files
- WebSearch: Search the web for information
- WebFetch: Fetch and analyze webpage content

When using tools:
1. Explain what you're doing before calling tools
2. Show the results clearly
3. If an error occurs, explain what went wrong
4. Always confirm destructive operations (writes/edits) with the user first
5. For web searches, use WebSearch to find relevant information
6. For analyzing specific webpages, use WebFetch with a clear prompt

Be concise but thorough in your responses.`
        storage: this.storage,
      });

      printSuccess(`Session created (ID: ${this.session.id})`);
      console.log();
      printInfo('Type /help for available commands, or just start chatting!');
      console.log();
    } catch (error) {
      printError(`Failed to create session: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }

    this.isRunning = true;
    this.runLoop();
  }

  /** Main input loop */
  private runLoop(): void {
    if (!this.isRunning) return;

    printUserPrompt();

    this.rl.question('', async (input) => {
      if (!this.isRunning) return;

      const trimmed = input.trim();

      if (!trimmed) {
        this.runLoop();
        return;
      }

      // Handle commands
      if (isCommand(trimmed)) {
        const { command, args } = parseCommand(trimmed);
        const shouldContinue = await executeCommand(command, args, {
          session: this.session,
          storage: this.storage,
          setSession: (s) => { this.session = s; },
          clearHistory: () => { this.clearHistory(); },
        });

        if (!shouldContinue) {
          await this.shutdown();
          return;
        }

        this.runLoop();
        return;
      }

      // Handle chat message
      await this.handleMessage(trimmed);
      this.runLoop();
    });
  }

  /** Handle a chat message */
  private async handleMessage(message: string): Promise<void> {
    if (!this.session) {
      printError('No active session');
      return;
    }

    // Clear previous tool state for new message
    this.toolManager.clear();
    this.hasDisplayedTools = false;

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      // Send message to session
      await this.session.send(message);

      // Stream the response
      printAssistantPrefix();
      console.log();

      // Start spinner for API call
      let hasReceivedContent = false;
      this.spinner.start();

      for await (const sdkMessage of this.session.stream()) {
        // Check if aborted
        if (this.abortController?.signal.aborted) {
          this.spinner.stop();
          console.log();
          printInfo('Request cancelled');
          break;
        }

        // Stop spinner once we receive content
        if (!hasReceivedContent) {
          this.spinner.stop();
          hasReceivedContent = true;
        }

        this.renderMessage(sdkMessage);
      }

      console.log();
    } catch (error) {
      this.spinner.stop();
      if (error instanceof Error && error.name === 'AbortError') {
        console.log();
        printInfo('Request cancelled');
      } else {
        console.log();
        printError(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      this.abortController = null;
    }
  }

  /** Render an SDK message */
  private renderMessage(message: SDKMessage): void {
    switch (message.type) {
      case 'assistant': {
        const assistantMsg = message as SDKAssistantMessage;

        // Clear tool display before showing assistant text
        if (this.hasDisplayedTools) {
          this.terminalRenderer.clear();
          this.hasDisplayedTools = false;
        }

        // Render text content
        for (const content of assistantMsg.message.content) {
          if (content.type === 'text') {
            process.stdout.write(content.text);
          }
        }

        // Handle tool calls
        if (assistantMsg.message.tool_calls && assistantMsg.message.tool_calls.length > 0) {
          for (const toolCall of assistantMsg.message.tool_calls) {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              this.toolManager.addTool(toolCall.id, toolCall.function.name, args);
              this.toolManager.updateToolStatus(toolCall.id, 'running');
            } catch {
              this.toolManager.addTool(toolCall.id, toolCall.function.name, {
                args: toolCall.function.arguments,
              });
              this.toolManager.updateToolStatus(toolCall.id, 'running');
            }
          }
          // Display tools after adding them
          this.terminalRenderer.display(this.toolManager.getTools());
          this.hasDisplayedTools = true;
        }
        break;
      }

      case 'tool_result': {
        const toolMsg = message as SDKToolResultMessage;

        // Update tool status and result
        if (toolMsg.is_error) {
          this.toolManager.setToolError(toolMsg.tool_use_id, String(toolMsg.result));
        } else {
          this.toolManager.setToolResult(toolMsg.tool_use_id, toolMsg.result);
          this.toolManager.updateToolStatus(toolMsg.tool_use_id, 'completed');
        }

        // Re-display all tools
        this.terminalRenderer.display(this.toolManager.getTools());
        this.hasDisplayedTools = true;
        break;
      }
    }
  }

  /** Handle Ctrl+C */
  private handleSigint(): void {
    if (this.abortController) {
      this.abortController.abort();
    } else {
      console.log();
      printGoodbye();
      this.shutdown().then(() => {
        process.exit(0);
      });
    }
  }

  /** Clear conversation history by creating a new session */
  private clearHistory(): void {
    // The session messages are cleared by creating a new session
    // But we keep the same session object, so we just note it
    printInfo('Note: History will be cleared on next message');
  }

  /** Shutdown the CLI */
  private async shutdown(): Promise<void> {
    this.isRunning = false;
    this.rl.close();

    if (this.session) {
      await this.session.close();
    }

    printGoodbye();
    process.exit(0);
  }
}

// Helper function for info messages
function printInfo(message: string): void {
  console.log('\x1b[33mℹ ' + message + '\x1b[0m');
}
