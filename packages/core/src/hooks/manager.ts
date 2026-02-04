/**
 * HookManager - Manages hook registration and emission
 * Aligned with Claude Agent SDK
 */

import type {
  HookEvent,
  HookInput,
  HookCallbackMatcher,
  HooksConfig,
  HookJSONOutput,
} from './types';

/**
 * Manages hook callbacks and their execution
 */
export class HookManager {
  private hooks: Map<HookEvent, HookCallbackMatcher[]>;
  private abortController: AbortController;

  /**
   * Create a new HookManager
   * @param config - Optional initial hooks configuration
   */
  constructor(config?: HooksConfig) {
    this.hooks = new Map();
    this.abortController = new AbortController();

    if (config) {
      for (const [event, matchers] of Object.entries(config)) {
        this.register(event as HookEvent, matchers);
      }
    }
  }

  /**
   * Register hook callbacks for an event
   * @param event - The hook event type
   * @param matchers - Array of matcher configurations
   */
  register(event: HookEvent, matchers: HookCallbackMatcher[]): void {
    const existing = this.hooks.get(event) ?? [];
    this.hooks.set(event, [...existing, ...matchers]);
  }

  /**
   * Emit a hook event to all registered callbacks
   * @param event - The hook event type
   * @param input - The hook input data
   * @param toolUseID - Optional tool use ID
   * @returns Array of results from all callbacks
   */
  async emit(
    event: HookEvent,
    input: HookInput,
    toolUseID?: string
  ): Promise<HookJSONOutput[]> {
    const matchers = this.hooks.get(event);
    if (!matchers || matchers.length === 0) {
      return [];
    }

    const results: HookJSONOutput[] = [];
    const signal = this.abortController.signal;

    for (const matcher of matchers) {
      for (const hook of matcher.hooks) {
        try {
          const result = await hook(input, toolUseID, { signal });
          results.push(result);
        } catch (error) {
          // Convert error to a sync output with error info
          results.push({
            continue: false,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return results;
  }

  /**
   * Emit a hook event with tool name filtering
   * Only callbacks with matching matcher or no matcher will be called
   * @param event - The hook event type
   * @param input - The hook input data
   * @param toolName - The tool name for matcher filtering
   * @param toolUseID - Optional tool use ID
   * @returns Array of results from matching callbacks
   */
  async emitForTool(
    event: HookEvent,
    input: HookInput,
    toolName: string,
    toolUseID?: string
  ): Promise<HookJSONOutput[]> {
    const matchers = this.hooks.get(event);
    if (!matchers || matchers.length === 0) {
      return [];
    }

    const results: HookJSONOutput[] = [];
    const signal = this.abortController.signal;

    for (const matcher of matchers) {
      // Skip if matcher is specified and doesn't match tool name
      if (matcher.matcher && matcher.matcher !== toolName) {
        continue;
      }

      for (const hook of matcher.hooks) {
        try {
          const result = await hook(input, toolUseID, { signal });
          results.push(result);
        } catch (error) {
          // Convert error to a sync output with error info
          results.push({
            continue: false,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return results;
  }

  /**
   * Check if there are any hooks registered for an event
   * @param event - The hook event type
   * @returns True if hooks are registered
   */
  hasHooks(event: HookEvent): boolean {
    const matchers = this.hooks.get(event);
    return !!matchers && matchers.length > 0;
  }

  /**
   * Get the number of hooks registered for an event
   * @param event - The hook event type
   * @returns Number of registered hook callbacks
   */
  hookCount(event: HookEvent): number {
    const matchers = this.hooks.get(event);
    if (!matchers) return 0;
    return matchers.reduce((count, matcher) => count + matcher.hooks.length, 0);
  }

  /**
   * Clear all registered hooks
   */
  clear(): void {
    this.hooks.clear();
  }

  /**
   * Destroy the hook manager
   * Aborts the internal abort controller
   */
  destroy(): void {
    this.abortController.abort();
    // Create a new controller for potential future use
    this.abortController = new AbortController();
  }
}
