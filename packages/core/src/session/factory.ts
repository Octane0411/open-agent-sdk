/**
 * Session factory functions
 * Provides createSession() and resumeSession() for managing session lifecycle
 */

import { OpenAIProvider } from '../providers/openai';
import { GoogleProvider } from '../providers/google';
import { createDefaultRegistry } from '../tools/registry';
import { ReActLoop } from '../agent/react-loop';
import { Session } from './session';
import { InMemoryStorage, type SessionStorage, type SessionData } from './storage';

/** Options for creating a new session */
export interface CreateSessionOptions {
  /** Model identifier (e.g., 'gpt-4o', 'gemini-2.0-flash') */
  model: string;
  /** Provider to use: 'openai' or 'google' (auto-detected from model name if not specified) */
  provider?: 'openai' | 'google';
  /** API key (defaults to OPENAI_API_KEY or GEMINI_API_KEY env var based on provider) */
  apiKey?: string;
  /** Maximum conversation turns (default: 10) */
  maxTurns?: number;
  /** Allowed tools whitelist (default: all) */
  allowedTools?: string[];
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** AbortController for cancellation */
  abortController?: AbortController;
  /** Storage implementation (default: InMemoryStorage) */
  storage?: SessionStorage;
  /** Permission mode for the session */
  permissionMode?: 'accept' | 'reject' | 'prompt';
  /** MCP servers configuration */
  mcpServers?: Record<string, unknown>;
}

/** Options for resuming an existing session */
export interface ResumeSessionOptions {
  /** Storage implementation (default: InMemoryStorage) */
  storage?: SessionStorage;
  /** API key override (optional) */
  apiKey?: string;
}

/**
 * Create a new session with the specified options
 * Automatically creates ReActLoop and persists initial session data
 *
 * @param options - Session configuration options
 * @returns Promise resolving to a new Session instance
 * @throws Error if API key is not provided and not found in environment
 *
 * @example
 * ```typescript
 * const session = await createSession({
 *   model: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY,
 *   systemPrompt: 'You are a helpful assistant',
 * });
 *
 * await session.send('Hello!');
 * for await (const message of session.stream()) {
 *   console.log(message);
 * }
 * await session.close();
 * ```
 */
export async function createSession(options: CreateSessionOptions): Promise<Session> {
  // Auto-detect provider from model name if not specified
  const providerType = options.provider ??
    (options.model.toLowerCase().includes('gemini') ? 'google' : 'openai');

  // Get API key based on provider
  const apiKey = options.apiKey ??
    (providerType === 'google' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY);

  if (!apiKey) {
    const keyName = providerType === 'google' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(
      `${providerType} API key is required. Provide it via options.apiKey or ${keyName} environment variable.`
    );
  }

  // Create storage (default to InMemoryStorage)
  const storage = options.storage ?? new InMemoryStorage();

  // Create provider
  const provider = providerType === 'google'
    ? new GoogleProvider({ apiKey, model: options.model })
    : new OpenAIProvider({ apiKey, model: options.model });

  // Create tool registry with default tools
  const toolRegistry = createDefaultRegistry();

  // Create ReAct loop
  const loop = new ReActLoop(provider, toolRegistry, {
    maxTurns: options.maxTurns ?? 10,
    systemPrompt: options.systemPrompt,
    allowedTools: options.allowedTools,
    cwd: options.cwd,
    env: options.env,
    abortController: options.abortController,
    permissionMode: options.permissionMode,
    mcpServers: options.mcpServers,
  });

  // Create session
  const session = new Session(loop, {
    model: options.model,
    provider: providerType,
  }, storage);

  // Save initial session data to storage
  const sessionData: SessionData = {
    id: session.id,
    model: session.model,
    provider: session.provider,
    createdAt: session.createdAt,
    updatedAt: Date.now(),
    messages: [],
    options: {
      model: options.model,
      provider: providerType,
      apiKey: options.apiKey,
      maxTurns: options.maxTurns,
      allowedTools: options.allowedTools,
      systemPrompt: options.systemPrompt,
      cwd: options.cwd,
      env: options.env,
      permissionMode: options.permissionMode,
      mcpServers: options.mcpServers,
    },
  };

  await storage.save(sessionData);

  return session;
}

/**
 * Resume an existing session from storage
 * Restores message history and session state
 *
 * @param sessionId - ID of the session to resume
 * @param options - Optional configuration for resuming
 * @returns Promise resolving to the resumed Session instance
 * @throws Error if session is not found in storage
 *
 * @example
 * ```typescript
 * // Resume a previous session
 * const session = await resumeSession('session-id-123', {
 *   storage: fileStorage,
 * });
 *
 * // Continue the conversation
 * await session.send('Continuing from where we left off...');
 * for await (const message of session.stream()) {
 *   console.log(message);
 * }
 * await session.close();
 * ```
 */
export async function resumeSession(
  sessionId: string,
  options?: ResumeSessionOptions
): Promise<Session> {
  // Get storage (default to InMemoryStorage)
  const storage = options?.storage ?? new InMemoryStorage();

  // Load session data from storage
  const sessionData = await storage.load(sessionId);

  if (!sessionData) {
    throw new Error(`Session with ID "${sessionId}" not found in storage.`);
  }

  // Get API key (use override or from options, or env var)
  const providerType = sessionData.provider as 'openai' | 'google';
  const apiKey = options?.apiKey ??
    sessionData.options.apiKey ??
    (providerType === 'google' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY);

  if (!apiKey) {
    const keyName = providerType === 'google' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(
      `${providerType} API key is required. Provide it via options.apiKey, saved session options, or ${keyName} environment variable.`
    );
  }

  // Create provider
  const provider = providerType === 'google'
    ? new GoogleProvider({ apiKey, model: sessionData.model })
    : new OpenAIProvider({ apiKey, model: sessionData.model });

  // Create tool registry with default tools
  const toolRegistry = createDefaultRegistry();

  // Create ReAct loop with saved options
  const loop = new ReActLoop(provider, toolRegistry, {
    maxTurns: sessionData.options.maxTurns ?? 10,
    systemPrompt: sessionData.options.systemPrompt,
    allowedTools: sessionData.options.allowedTools,
    cwd: sessionData.options.cwd,
    env: sessionData.options.env,
    permissionMode: sessionData.options.permissionMode,
    mcpServers: sessionData.options.mcpServers,
  });

  // Restore session from storage
  const session = await Session.loadFromStorage(sessionId, storage, loop);

  if (!session) {
    throw new Error(`Failed to load session with ID "${sessionId}".`);
  }

  return session;
}
