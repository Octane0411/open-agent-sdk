import {
  PermissionMode,
  PermissionOptions,
  PermissionCheckResult,
  PermissionResult,
  CanUseTool,
  PlanLogEntry,
  isSensitiveTool,
  isEditTool,
} from './types';

/**
 * Manages permission checks for tool execution
 * Aligned with Claude Agent SDK behavior
 */
export class PermissionManager {
  private mode: PermissionMode;
  private allowDangerouslySkipPermissions: boolean;
  private canUseTool?: CanUseTool;
  private planLog: PlanLogEntry[] = [];
  private skillAllowedTools: string[] | undefined;

  constructor(options: PermissionOptions) {
    this.mode = options.mode;
    this.allowDangerouslySkipPermissions = options.allowDangerouslySkipPermissions ?? false;
    this.canUseTool = options.canUseTool;

    // Validate bypassPermissions mode
    if (this.mode === 'bypassPermissions' && !this.allowDangerouslySkipPermissions) {
      throw new Error(
        'allowDangerouslySkipPermissions must be true to use bypassPermissions mode'
      );
    }
  }

  /**
   * Set skill-specific allowed tools
   * This temporarily extends the allowed tools list for skill execution
   */
  setSkillAllowedTools(toolNames: string[] | undefined): void {
    this.skillAllowedTools = toolNames;
  }

  /**
   * Get skill-specific allowed tools
   */
  getSkillAllowedTools(): string[] | undefined {
    return this.skillAllowedTools;
  }

  /**
   * Check if a tool is allowed by skill configuration
   */
  isToolAllowedBySkill(toolName: string): boolean {
    if (!this.skillAllowedTools || this.skillAllowedTools.length === 0) {
      return true; // No restrictions
    }
    return this.skillAllowedTools.includes(toolName);
  }

  /**
   * Check if a tool is permitted to execute
   * Aligned with Claude Agent SDK
   */
  async checkPermission(
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal }
  ): Promise<PermissionCheckResult> {
    switch (this.mode) {
      case 'bypassPermissions':
        return { approved: true };

      case 'plan':
        // Record tool call to plan log
        this.planLog.push({
          toolName,
          input,
          timestamp: Date.now(),
        });
        return {
          approved: false,
          error: 'Tool execution blocked in plan mode',
        };

      case 'acceptEdits':
        // Auto-approve edit tools
        if (isEditTool(toolName)) {
          return { approved: true };
        }
        // Fall through to default behavior for non-edit tools
        break;

      case 'default':
        // Continue to default behavior
        break;
    }

    // Check if tool is allowed by skill configuration
    if (!this.isToolAllowedBySkill(toolName)) {
      return {
        approved: false,
        error: `Tool "${toolName}" is not allowed by the current skill configuration`,
      };
    }

    // Default behavior: check if tool is sensitive
    if (isSensitiveTool(toolName)) {
      // If canUseTool callback is provided, use it
      if (this.canUseTool) {
        const result = await this.canUseTool(toolName, input, {
          signal: options.signal,
          suggestions: [], // Could be populated based on context
        });
        return this.resolvePermissionResult(result);
      }

      // No callback provided, deny sensitive tools
      return {
        approved: false,
        error: `Permission denied: ${toolName}`,
      };
    }

    // Non-sensitive tools are auto-approved
    return { approved: true };
  }

  /**
   * Get current permission mode
   */
  getMode(): PermissionMode {
    return this.mode;
  }

  /**
   * Set permission mode
   */
  setMode(mode: PermissionMode): void {
    // Validate bypassPermissions mode
    if (mode === 'bypassPermissions' && !this.allowDangerouslySkipPermissions) {
      throw new Error(
        'allowDangerouslySkipPermissions must be true to use bypassPermissions mode'
      );
    }
    this.mode = mode;
  }

  /**
   * Get plan log (only used in plan mode)
   */
  getPlanLog(): PlanLogEntry[] {
    return [...this.planLog];
  }

  /**
   * Clear plan log
   */
  clearPlanLog(): void {
    this.planLog = [];
  }

  /**
   * Resolve a PermissionResult to PermissionCheckResult
   */
  private resolvePermissionResult(result: PermissionResult): PermissionCheckResult {
    if (result.behavior === 'allow') {
      return {
        approved: true,
        updatedInput: result.updatedInput,
      };
    } else {
      return {
        approved: false,
        error: result.message,
      };
    }
  }
}
