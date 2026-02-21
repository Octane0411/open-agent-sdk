/**
 * Session class for managing conversation state
 * Provides a stateful interface for multi-turn interactions
 */

import type { ReActLoop } from '../agent/react-loop';
import type { SDKMessage } from '../types/messages';
import type { SessionStorage, SessionData } from './storage';
import type { SkillCatalogItem } from '../skills/types';
import { logger } from '../utils/logger';
import { generateUUID } from '../utils/uuid';
import { createSkillRegistry } from '../skills/registry';

/** Session states following a state machine pattern */
export enum SessionState {
  IDLE = 'idle',
  READY = 'ready',
  RUNNING = 'running',
  ERROR = 'error',
  CLOSED = 'closed',
}

/** Base error class for session-related errors */
export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

/** Error thrown when send() is called but session is not in IDLE state */
export class SessionNotIdleError extends SessionError {
  constructor() {
    super('Cannot send message: session is not in idle state');
    this.name = 'SessionNotIdleError';
  }
}

/** Error thrown when stream() is called but session is not in READY state */
export class SessionNotReadyError extends SessionError {
  constructor() {
    super('Cannot start stream: session is not in ready state. Call send() first.');
    this.name = 'SessionNotReadyError';
  }
}

/** Error thrown when stream() is called while another stream is active */
export class SessionAlreadyStreamingError extends SessionError {
  constructor() {
    super('Cannot start stream: another stream is already active');
    this.name = 'SessionAlreadyStreamingError';
  }
}

/** Error thrown when any operation is called on a closed session */
export class SessionClosedError extends SessionError {
  constructor() {
    super('Session is closed');
    this.name = 'SessionClosedError';
  }
}

/** Options for creating a new Session */
export interface SessionOptions {
  /** Model identifier */
  model: string;
  /** Provider name */
  provider: string;
  /** Optional session ID (generated if not provided) */
  id?: string;
  /** Parent session ID if this session was forked */
  parentSessionId?: string;
  /** Timestamp when this session was forked */
  forkedAt?: number;
}

/**
 * Session class for managing conversation state
 *
 * State machine:
 *   [idle] --send()--> [ready]
 *     ▲                  │
 *     │                  ▼
 *   [closed]          [running] --stream结束--> [idle]
 *                        │
 *                        ▼
 *                     [error] --> [idle]
 *
 * Constraints:
 * - send() can only be called in IDLE state
 * - stream() can only be called in READY state
 * - Only one stream can be active at a time
 * - close() can be called in any state
 */
export class Session {
  readonly id: string;
  readonly model: string;
  readonly provider: string;
  readonly createdAt: number;
  readonly parentSessionId?: string;
  readonly forkedAt?: number;

  private _state: SessionState;
  private loop: ReActLoop;
  private messages: SDKMessage[];
  private isStreaming: boolean;
  private storage?: SessionStorage;
  private updatedAt: number;
  private skillCatalog: SkillCatalogItem[];
  private skillsLoaded: boolean;

  constructor(loop: ReActLoop, options: SessionOptions, storage?: SessionStorage) {
    this.id = options.id ?? generateUUID();
    this.model = options.model;
    this.provider = options.provider;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.parentSessionId = options.parentSessionId;
    this.forkedAt = options.forkedAt;
    this.loop = loop;
    this.messages = [];
    this._state = SessionState.IDLE;
    this.isStreaming = false;
    this.storage = storage;
    this.skillCatalog = [];
    this.skillsLoaded = false;

    // Load skills asynchronously
    this.loadSkills();
  }

  /**
   * Load skills from registry
   * @private
   */
  private async loadSkills(): Promise<void> {
    try {
      const registry = createSkillRegistry();
      await registry.loadAll();
      this.skillCatalog = registry.getAll();
      this.skillsLoaded = true;
      logger.debug('[Session] Loaded skills:', this.skillCatalog.length);
    } catch (error) {
      logger.warn('[Session] Failed to load skills:', error);
      this.skillsLoaded = false;
    }
  }

  /**
   * Get skill catalog
   * @returns Array of skill catalog items
   */
  getSkillCatalog(): SkillCatalogItem[] {
    return [...this.skillCatalog];
  }

  /**
   * Check if skills are loaded
   * @returns True if skills have been loaded
   */
  areSkillsLoaded(): boolean {
    return this.skillsLoaded;
  }

  /**
   * Build system prompt with skill catalog
   * @param basePrompt - Base system prompt
   * @returns System prompt with skill information
   */
  getSystemPromptWithSkills(basePrompt?: string): string {
    const parts: string[] = [];

    if (basePrompt) {
      parts.push(basePrompt);
    }

    if (this.skillCatalog.length > 0) {
      parts.push('\n\n## Available Skills');
      parts.push('You can invoke the following skills by typing /skill-name:');
      parts.push('');

      for (const skill of this.skillCatalog) {
        parts.push(`- /${skill.name}: ${skill.description}`);
      }

      parts.push('');
      parts.push('To use a skill, start your message with /skill-name followed by any arguments.');
    }

    return parts.join('\n');
  }

  /**
   * Load a session from storage by ID
   * @param id - Session ID to load
   * @param storage - Storage implementation to use
   * @param loop - ReActLoop instance for the session
   * @returns Session instance or null if not found
   */
  static async loadFromStorage(
    id: string,
    storage: SessionStorage,
    loop: ReActLoop
  ): Promise<Session | null> {
    const data = await storage.load(id);
    if (!data) {
      return null;
    }

    // Create session with loaded data including fork metadata
    const session = new Session(loop, {
      id: data.id,
      model: data.model,
      provider: data.provider,
      parentSessionId: data.parentSessionId,
      forkedAt: data.forkedAt,
    }, storage);

    // Restore message history and timestamps
    (session as unknown as { messages: SDKMessage[] }).messages = [...data.messages];
    (session as unknown as { createdAt: number }).createdAt = data.createdAt;
    (session as unknown as { updatedAt: number }).updatedAt = data.updatedAt;

    return session;
  }

  /**
   * Save session data to storage
   * @private
   */
  private async saveToStorage(): Promise<void> {
    if (!this.storage) {
      return;
    }

    this.updatedAt = Date.now();

    const sessionData: SessionData = {
      id: this.id,
      model: this.model,
      provider: this.provider,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      messages: [...this.messages],
      options: {
        model: this.model,
        provider: this.provider,
      },
      parentSessionId: this.parentSessionId,
      forkedAt: this.forkedAt,
    };

    await this.storage.save(sessionData);
  }

  /** Current state of the session */
  get state(): SessionState {
    return this._state;
  }

  /**
   * Send a user message to the session
   * Transitions state from IDLE to READY
   *
   * @param message - User's message
   * @throws {SessionNotIdleError} If session is not in IDLE state
   * @throws {SessionClosedError} If session is closed
   */
  async send(message: string): Promise<void> {
    if (this._state === SessionState.CLOSED) {
      throw new SessionClosedError();
    }

    if (this._state !== SessionState.IDLE) {
      throw new SessionNotIdleError();
    }

    // Create user message and add to history
    const userMessage: SDKMessage = {
      type: 'user',
      uuid: generateUUID(),
      session_id: this.id,
      message: { role: 'user', content: message },
      parent_tool_use_id: null,
    };

    this.messages.push(userMessage);
    this._state = SessionState.READY;
  }

  /**
   * Stream the agent's response
   * Transitions state from READY to RUNNING, then back to IDLE
   *
   * @returns AsyncGenerator yielding SDK messages
   * @throws {SessionNotReadyError} If session is not in READY state
   * @throws {SessionAlreadyStreamingError} If another stream is active
   * @throws {SessionClosedError} If session is closed
   */
  async *stream(): AsyncGenerator<SDKMessage> {
    if (this._state === SessionState.CLOSED) {
      throw new SessionClosedError();
    }

    if (this.isStreaming) {
      throw new SessionAlreadyStreamingError();
    }

    if (this._state !== SessionState.READY) {
      throw new SessionNotReadyError();
    }

    this._state = SessionState.RUNNING;
    this.isStreaming = true;

    try {
      // Get the last user message
      const lastUserMessage = this.messages[this.messages.length - 1];
      if (lastUserMessage.type !== 'user') {
        throw new SessionError('Expected last message to be from user');
      }

      const userPrompt = lastUserMessage.message.content;

      // Pass history messages (excluding the current user message which will be added by runStream)
      const historyMessages = this.messages.slice(0, -1);
      logger.debug('[Session] historyMessages count:', historyMessages.length);
      logger.debug('[Session] historyMessages:', JSON.stringify(historyMessages, null, 2));

      // Run the ReAct loop and yield messages
      for await (const event of this.loop.runStream(userPrompt, historyMessages)) {
        switch (event.type) {
          case 'assistant':
            this.messages.push(event.message);
            yield event.message;
            break;

          case 'tool_result':
            this.messages.push(event.message);
            yield event.message;
            break;

          case 'usage':
            // Usage stats are tracked but not yielded as SDK messages
            break;

          case 'done':
            // Stream completed
            break;
        }
      }

      this._state = SessionState.IDLE;
    } catch (error) {
      this._state = SessionState.ERROR;
      throw error;
    } finally {
      this.isStreaming = false;

      // If we were in ERROR state, transition back to IDLE for recovery
      if (this._state === SessionState.ERROR) {
        this._state = SessionState.IDLE;
      }

      // Save to storage after stream completes
      if (this.storage) {
        await this.saveToStorage();
      }
    }
  }

  /**
   * Get a readonly copy of the message history
   *
   * @returns Readonly array of SDK messages
   */
  getMessages(): readonly SDKMessage[] {
    return Object.freeze([...this.messages]);
  }

  /**
   * Close the session
   * Can be called from any state
   */
  async close(): Promise<void> {
    this._state = SessionState.CLOSED;
    this.isStreaming = false;
  }

  /**
   * Support for async dispose pattern (await using)
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /**
   * Compact the conversation history to reduce token usage.
   * Generates a summary of older messages and preserves recent rounds.
   *
   * @returns Result of the compaction operation
   * @throws {SessionClosedError} If session is closed
   */
  async compact(): Promise<{
    success: boolean;
    preTokens?: number;
    preservedRounds?: number;
    reason?: string;
  }> {
    if (this._state === SessionState.CLOSED) {
      throw new SessionClosedError();
    }

    // Estimate token count (rough approximation)
    const estimatedTokens = this.messages.reduce((total, msg) => {
      if ('message' in msg && msg.message) {
        if ('content' in msg.message) {
          if (typeof msg.message.content === 'string') {
            return total + msg.message.content.length / 4; // Rough estimate: 4 chars per token
          } else if (Array.isArray(msg.message.content)) {
            return total + msg.message.content.reduce((sum, c) => {
              if (c.type === 'text') return sum + c.text.length / 4;
              return sum + 50; // Tool calls estimate
            }, 0);
          }
        }
      }
      return total + 50; // Default estimate for system/tool messages
    }, 0);

    const preTokens = Math.floor(estimatedTokens);

    // Call the loop's compact method
    const result = await this.loop.compact(this.messages, 'manual', preTokens);

    if (!result.summaryGenerated) {
      return {
        success: false,
        reason: 'nothing_to_compact',
      };
    }

    // Update session messages with compacted version
    this.messages = result.messages;

    // Save to storage
    if (this.storage) {
      await this.saveToStorage();
    }

    return {
      success: true,
      preTokens: result.preTokens,
      preservedRounds: result.preservedRounds,
    };
  }
}
