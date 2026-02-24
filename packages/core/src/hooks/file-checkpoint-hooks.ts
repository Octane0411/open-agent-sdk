/**
 * File checkpoint hooks for PreToolUse and PostToolUse
 * Automatically captures file state before and after tool execution
 */

import type { FileCheckpointManager } from '../tools/file-checkpoint';
import type { PreToolUseHookInput, PostToolUseHookInput, HookJSONOutput } from './types';

/**
 * Tools that modify files and should trigger checkpointing
 */
const FILE_MODIFYING_TOOLS = ['Write', 'Edit', 'Bash'];

/**
 * Check if a tool name is a file-modifying tool
 */
function isFileModifyingTool(toolName: string): boolean {
  return FILE_MODIFYING_TOOLS.includes(toolName);
}

/**
 * Extract file path from tool input
 * Handles Write, Edit, and Bash tools
 */
function extractFilePath(toolName: string, toolInput: unknown): string | null {
  if (typeof toolInput !== 'object' || toolInput === null) {
    return null;
  }

  const input = toolInput as Record<string, unknown>;

  switch (toolName) {
    case 'Write':
      // Write tool has file_path parameter
      return typeof input.file_path === 'string' ? input.file_path : null;

    case 'Edit':
      // Edit tool has file_path parameter
      return typeof input.file_path === 'string' ? input.file_path : null;

    case 'Bash':
      // Bash tool may have file redirection - extract from command
      return extractFilePathFromBashCommand(typeof input.command === 'string' ? input.command : '');

    default:
      return null;
  }
}

/**
 * Extract file path from a bash command
 * Handles common patterns like:
 * - echo "content" > file.txt
 * - cat > file.txt
 * - tee file.txt
 * - rm file.txt
 * - mv old.txt new.txt
 */
function extractFilePathFromBashCommand(command: string): string | null {
  // Match file paths in common patterns
  const patterns = [
    // echo "..." > file.txt or echo '...' > file.txt
    /echo\s+['"][^'"]*['"]\s*>\s*(\S+)/,
    // cat > file.txt
    /cat\s*>\s*(\S+)/,
    // tee file.txt
    /tee\s+(?:-a\s+)?(\S+)/,
    // rm file.txt
    /rm\s+(?:-[a-zA-Z]+\s+)?(\S+)/,
    // mv old.txt new.txt - capture the destination
    /mv\s+(?:-[a-zA-Z]+\s+)?\S+\s+(\S+)/,
    // cp old.txt new.txt - capture the destination
    /cp\s+(?:-[a-zA-Z]+\s+)?\S+\s+(\S+)/,
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Create checkpoint hooks for a session
 *
 * @param manager - FileCheckpointManager instance
 * @returns Object with PreToolUse and PostToolUse hook configurations
 */
export function createCheckpointHooks(manager: FileCheckpointManager) {
  return {
    /**
     * PreToolUse hook - captures file state before modification
     */
    PreToolUse: {
      hooks: [
        async (
          input: PreToolUseHookInput,
          _toolUseId: string | undefined
        ): Promise<HookJSONOutput> => {
          // Only process file-modifying tools
          if (!isFileModifyingTool(input.tool_name)) {
            return;
          }

          // Extract file path from tool input
          const filePath = extractFilePath(input.tool_name, input.tool_input);
          if (!filePath) {
            return;
          }

          // Record pre-change state
          // Note: We use a placeholder toolUseId since we don't have the real one yet
          // The real toolUseId will be set by the ReActLoop when executing
          const toolUseId = _toolUseId ?? 'unknown';
          manager.recordPreChange(input.session_id, toolUseId, filePath);

          return;
        },
      ],
    },

    /**
     * PostToolUse hook - captures file state after modification
     */
    PostToolUse: {
      hooks: [
        async (
          input: PostToolUseHookInput,
          _toolUseId: string | undefined
        ): Promise<HookJSONOutput> => {
          // Only process file-modifying tools
          if (!isFileModifyingTool(input.tool_name)) {
            return;
          }

          // Extract file path from tool input
          const filePath = extractFilePath(input.tool_name, input.tool_input);
          if (!filePath) {
            return;
          }

          // Determine operation type
          let operation: 'write' | 'edit' | 'bash' | 'delete' = 'write';
          if (input.tool_name === 'Edit') {
            operation = 'edit';
          } else if (input.tool_name === 'Bash') {
            const command = (input.tool_input as Record<string, unknown>)?.command ?? '';
            if (typeof command === 'string' && command.includes('rm ')) {
              operation = 'delete';
            } else {
              operation = 'bash';
            }
          }

          // Record post-change state
          const toolUseId = _toolUseId ?? 'unknown';
          manager.recordPostChange(input.session_id, toolUseId, filePath, operation);

          return;
        },
      ],
    },
  };
}
