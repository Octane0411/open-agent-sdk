/**
 * CLI interaction logic for the Code Agent Demo
 */

import readline from 'readline';
import chalk from 'chalk';
import type { SDKMessage, SDKAssistantMessage, SDKToolResultMessage, SDKResultMessage, PermissionResult } from 'open-agent-sdk';
import { Session, createSession, FileStorage, SENSITIVE_TOOLS } from 'open-agent-sdk';
import type { FileCache, FileChangeTracker } from './utils/index.js';
import { ToolManager, TerminalRenderer, createFileCache, createFileChangeTracker } from './utils/index.js';

/** Permission choice type */
type PermissionChoice = 'allow' | 'deny' | 'always';

/** Permission mode type */
type PermissionMode = 'default' | 'plan' | 'acceptEdits';

/** Tool permissions tracking */
interface ToolPermissions {
  /** Tools that are always allowed */
  alwaysAllowed: Set<string>;
  /** Whether to allow all tools this session */
  allowAll: boolean;
}

/** Mode display names */
const MODE_DISPLAY_NAMES: Record<PermissionMode, string> = {
  default: 'default',
  plan: 'plan',
  acceptEdits: 'accept edits',
};
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
import { createBuiltInHooksConfig } from './hooks/index.js';

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
  private fileCache: FileCache;
  private changeTracker: FileChangeTracker;
  private hasDisplayedTools = false;
  private toolPermissions: ToolPermissions = {
    alwaysAllowed: new Set(),
    allowAll: false,
  };
  private currentMode: PermissionMode = 'default';
  private readonly modes: PermissionMode[] = ['default', 'plan', 'acceptEdits'];

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

    // Initialize file cache and change tracker
    this.fileCache = createFileCache();
    this.changeTracker = createFileChangeTracker();
    this.terminalRenderer.setFileCache(this.fileCache);

    // Handle Ctrl+C
    this.rl.on('SIGINT', () => {
      this.handleSigint();
    });

    // Handle Shift+Tab for mode switching
    this.setupModeSwitching();
  }

  /**
   * Setup keyboard listener for Shift+Tab mode switching
   */
  private setupModeSwitching(): void {
    // @ts-expect-error - readline input has on method for keypress events
    this.rl.input.on('keypress', (str: string, key: { name?: string; shift?: boolean }) => {
      if (key && key.name === 'tab' && key.shift) {
        this.cycleMode();
      }
    });
  }

  /**
   * Cycle through permission modes: default -> plan -> acceptEdits -> default
   */
  private cycleMode(): void {
    const currentIndex = this.modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % this.modes.length;
    this.currentMode = this.modes[nextIndex];

    // Show mode change notification
    console.log();
    console.log(chalk.cyan(`🔄 Mode switched to: ${chalk.bold(MODE_DISPLAY_NAMES[this.currentMode])}`));
    this.printModeDescription();
  }

  /**
   * Print description of current mode
   */
  private printModeDescription(): void {
    switch (this.currentMode) {
      case 'default':
        console.log(chalk.gray('   Write/Edit/Bash operations will ask for confirmation'));
        break;
      case 'plan':
        console.log(chalk.gray('   Agent will plan but not execute tools (dry run)'));
        break;
      case 'acceptEdits':
        console.log(chalk.gray('   Write/Edit allowed automatically, Bash still asks'));
        break;
    }
    console.log();
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
        canUseTool: this.createCanUseToolCallback(),
        hooks: createBuiltInHooksConfig(),
        systemPrompt: `You are a helpful code assistant with access to file, shell, and web tools.

Available tools:
- Read: Read file contents
- Write: Write content to files (creates new or overwrites existing)
- Edit: Edit existing files (line-based editing)
- Bash: Execute shell commands
- Glob: Find files matching patterns
- Grep: Search for text in files
- WebSearch: Search the web for information
- WebFetch: Fetch and analyze webpage content
- TaskList: List all tasks
- TaskCreate: Create a new task
- TaskGet: Get task details
- TaskUpdate: Update task status

IMPORTANT: When the user asks you to do something, you MUST use the appropriate tools to accomplish the task. Do not ask the user for permission to use tools - just use them directly.

When using tools:
1. **ALWAYS** use tools proactively to help the user - don't ask for permission
2. Use Glob with pattern "*" to list files in the current directory
3. Use Read to examine file contents when needed
4. Use Bash to execute commands when appropriate
5. Use WebSearch to find up-to-date information
6. Use TaskCreate/TaskUpdate to track multi-step tasks
7. Explain what you're doing before calling tools
8. Show the results clearly after tools complete
9. If an error occurs, explain what went wrong
10. For destructive operations (writes/edits), the system will ask the user for confirmation

When working with multiple files:
1. **Plan first**: Use Glob to find all relevant files
2. **Read all**: Read all files you need to modify before making changes
3. **Batch edits**: Make all necessary edits in one go, don't ask for confirmation between each file
4. **Verify**: Use Bash to run tests or verify the changes work correctly

Be concise but thorough in your responses.`,
        storage: this.storage,
      });

      printSuccess(`Session created (ID: ${this.session.id})`);
      console.log();
      printInfo('Type /help for available commands, or just start chatting!');
      printInfo('Press Shift+Tab to cycle through modes: default → plan → accept edits');
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

    printUserPrompt(MODE_DISPLAY_NAMES[this.currentMode]);

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
    this.fileCache.clear();
    this.changeTracker.clear();
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
        const tool = this.toolManager.getTool(toolMsg.tool_use_id);

        // Update tool status and result
        if (toolMsg.is_error) {
          this.toolManager.setToolError(toolMsg.tool_use_id, String(toolMsg.result));
        } else {
          this.toolManager.setToolResult(toolMsg.tool_use_id, toolMsg.result);
          this.toolManager.updateToolStatus(toolMsg.tool_use_id, 'completed');

          // Track file changes for Write/Edit tools
          if (tool && (tool.name === 'Write' || tool.name === 'Edit')) {
            const filePath = tool.args.file_path as string;
            const originalContent = this.fileCache.getOriginal(filePath);
            const newContent = typeof toolMsg.result === 'string'
              ? toolMsg.result
              : (toolMsg.result && typeof toolMsg.result === 'object' && 'content' in toolMsg.result)
                ? String(toolMsg.result.content)
                : JSON.stringify(toolMsg.result, null, 2);

            if (tool.name === 'Write') {
              this.changeTracker.trackWrite(filePath, originalContent, newContent);
            } else {
              if (originalContent) {
                this.changeTracker.trackEdit(filePath, originalContent, newContent);
              }
            }
          }
        }

        // Re-display all tools
        this.terminalRenderer.display(this.toolManager.getTools());
        this.hasDisplayedTools = true;
        break;
      }

      case 'result': {
        const resultMsg = message as SDKResultMessage;

        // Clear tool display before showing summary
        if (this.hasDisplayedTools) {
          this.terminalRenderer.clear();
          this.hasDisplayedTools = false;
        }

        // Display file changes summary if any
        if (this.changeTracker.hasChanges()) {
          console.log(this.changeTracker.formatSummary());
        }

        // Display usage statistics
        console.log();
        console.log(chalk.gray('─'.repeat(40)));
        const usage = resultMsg.usage;
        const duration = resultMsg.duration_ms;
        const turns = resultMsg.num_turns;
        console.log(chalk.cyan(`📊 ↑${usage.input_tokens} ↓${usage.output_tokens} tokens | ${(duration / 1000).toFixed(1)}s | ${turns} turns`));
        console.log(chalk.gray('─'.repeat(40)));
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

  /**
   * Ask user for permission to execute a sensitive tool
   * @returns Promise resolving to 'allow', 'deny', or 'always'
   */
  private async askForPermission(toolName: string, input: Record<string, unknown>): Promise<PermissionChoice> {
    console.log();
    console.log(chalk.yellow(`  Claude 想要执行 ${chalk.bold(toolName)}:`));

    // Show relevant input parameters
    if (toolName === 'Bash' && input.command) {
      console.log(chalk.gray(`  命令: ${input.command}`));
    } else if ((toolName === 'Write' || toolName === 'Edit') && input.file_path) {
      console.log(chalk.gray(`  文件: ${input.file_path}`));
    } else if (toolName === 'WebSearch' && input.query) {
      console.log(chalk.gray(`  搜索: ${input.query}`));
    } else if (toolName === 'WebFetch' && input.url) {
      console.log(chalk.gray(`  URL: ${input.url}`));
    }

    return new Promise((resolve) => {
      this.rl.question(chalk.cyan('  允许这次操作吗? (Y/n/a): '), (answer) => {
        const normalized = answer.trim().toLowerCase();
        if (normalized === 'a' || normalized === 'always') {
          resolve('always');
        } else if (normalized === 'n' || normalized === 'no' || normalized === 'deny') {
          resolve('deny');
        } else {
          // Default to allow (Y or empty)
          resolve('allow');
        }
      });
    });
  }

  /**
   * Check if a tool is an edit tool (Write or Edit)
   */
  private isEditTool(toolName: string): boolean {
    return toolName === 'Write' || toolName === 'Edit';
  }

  /**
   * Create the canUseTool callback for session options
   */
  private createCanUseToolCallback(): (toolName: string, input: Record<string, unknown>) => Promise<PermissionResult> {
    return async (toolName: string, input: Record<string, unknown>) => {
      // Cache file content before Edit/Write operations
      if (this.isEditTool(toolName) && input.file_path) {
        const filePath = String(input.file_path);
        await this.fileCache.cacheBeforeEdit(filePath);
      }

      // Handle different permission modes
      switch (this.currentMode) {
        case 'plan':
          // Plan mode: show what would be executed but don't actually execute
          console.log();
          console.log(chalk.yellow(`📋 [PLAN] Would execute ${chalk.bold(toolName)}:`));
          if (toolName === 'Bash' && input.command) {
            console.log(chalk.gray(`   Command: ${input.command}`));
          } else if (this.isEditTool(toolName) && input.file_path) {
            console.log(chalk.gray(`   File: ${input.file_path}`));
          }
          return {
            behavior: 'deny',
            message: `Tool ${toolName} blocked in plan mode`,
            interrupt: false,
          };

        case 'acceptEdits':
          // Accept edits mode: automatically allow Write/Edit, ask for others
          if (this.isEditTool(toolName)) {
            return { behavior: 'allow', updatedInput: input };
          }
          // Fall through to default behavior for non-edit tools
          break;

        case 'default':
        default:
          // Default mode: proceed with normal permission handling
          break;
      }

      // Check if all tools are allowed this session
      if (this.toolPermissions.allowAll) {
        return { behavior: 'allow', updatedInput: input };
      }

      // Check if this specific tool is always allowed
      if (this.toolPermissions.alwaysAllowed.has(toolName)) {
        return { behavior: 'allow', updatedInput: input };
      }

      // Only ask for sensitive tools
      if (!SENSITIVE_TOOLS.includes(toolName)) {
        return { behavior: 'allow', updatedInput: input };
      }

      // Ask user for permission
      const choice = await this.askForPermission(toolName, input);

      switch (choice) {
        case 'always':
          this.toolPermissions.alwaysAllowed.add(toolName);
          console.log(chalk.gray(`  ✓ 已记住对 ${toolName} 的允许设置`));
          return { behavior: 'allow', updatedInput: input };
        case 'deny':
          console.log(chalk.red(`  ✗ 已拒绝 ${toolName} 操作`));
          return {
            behavior: 'deny',
            message: `User denied permission to execute ${toolName}`,
            interrupt: false,
          };
        case 'allow':
        default:
          console.log(chalk.green(`  ✓ 已允许`));
          return { behavior: 'allow', updatedInput: input };
      }
    };
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
