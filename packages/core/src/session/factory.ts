/**
 * Session factory functions
 * Provides createSession() and resumeSession() for managing session lifecycle
 */

import { OpenAIProvider } from '../providers/openai';
import { GoogleProvider } from '../providers/google';
import { AnthropicProvider } from '../providers/anthropic';
import { createDefaultRegistry } from '../tools/registry';

/**
 * Check if a base URL requires Bearer token authentication instead of x-api-key
 * @param baseURL - The API base URL
 * @returns true if Bearer auth is required (e.g., MiniMax)
 */
function requiresBearerAuth(baseURL?: string): boolean {
  if (!baseURL) return false;

  // Known endpoints that require Authorization: Bearer instead of x-api-key
  const bearerAuthHosts = [
    'api.minimaxi.com',
    // Add other Anthropic-compatible endpoints here as needed
  ];

  return bearerAuthHosts.some(host => baseURL.includes(host));
}
import { ReActLoop } from '../agent/react-loop';
import { Session } from './session';
import { FileStorage, InMemoryStorage, type SessionStorage, type SessionData } from './storage';
import { logger, type LogLevel } from '../utils/logger';
import { generateUUID } from '../utils/uuid';
import { createSkillRegistry } from '../skills/registry';
import type { PermissionMode, CanUseTool } from '../permissions/types';
import type { OutputFormat } from '../types/output-format';
import { checkpointManager } from '../tools/file-checkpoint';
import { createCheckpointHooks } from '../hooks/file-checkpoint-hooks';
import { HookManager } from '../hooks/manager';
import type { HooksConfig, HookCallbackMatcher } from '../hooks/types';

/** Options for creating a new session */
export interface CreateSessionOptions {
  /** Model identifier (e.g., 'gpt-4o', 'gemini-2.0-flash') */
  model: string;
  /** Provider to use: 'openai', 'google', or 'anthropic' (auto-detected from model name if not specified) */
  provider?: 'openai' | 'google' | 'anthropic';
  /** API key (defaults to OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY env var based on provider) */
  apiKey?: string;
  /** Base URL override for API endpoint (used for proxies or compatible APIs like MiniMax) */
  baseURL?: string;
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
  /** Permission mode for the session (default: 'default') */
  permissionMode?: PermissionMode;
  /** Required to be true when using bypassPermissions mode */
  allowDangerouslySkipPermissions?: boolean;
  /** Custom callback for tool permission checks */
  canUseTool?: CanUseTool;
  /** MCP servers configuration */
  mcpServers?: Record<string, unknown>;
  /** Log level: 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'info') */
  logLevel?: LogLevel;
  /** Hooks configuration */
  hooks?: HooksConfig;
  /** Output format for structured responses */
  outputFormat?: OutputFormat;
  /** Enable file checkpointing for rollback support */
  enableFileCheckpointing?: boolean;
}

/** Options for resuming an existing session */
export interface ResumeSessionOptions {
  /** Storage implementation (default: InMemoryStorage) */
  storage?: SessionStorage;
  /** API key override (optional) */
  apiKey?: string;
  /** Log level: 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'info') */
  logLevel?: LogLevel;
  /** Permission mode override (optional) */
  permissionMode?: PermissionMode;
  /** Required to be true when using bypassPermissions mode (optional) */
  allowDangerouslySkipPermissions?: boolean;
  /** Custom callback for tool permission checks (optional) */
  canUseTool?: CanUseTool;
  /** Hooks configuration (optional) */
  hooks?: HooksConfig;
}

/** Options for forking an existing session */
export interface ForkSessionOptions {
  /** API key override (optional) */
  apiKey?: string;
  /** Storage implementation (defaults to InMemoryStorage) */
  storage?: SessionStorage;
  /** Log level: 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'info') */
  logLevel?: LogLevel;
  /** Model override (optional) */
  model?: string;
  /** Provider override (optional) */
  provider?: 'openai' | 'google' | 'anthropic';
  /** Permission mode override (optional) */
  permissionMode?: PermissionMode;
  /** Required to be true when using bypassPermissions mode (optional) */
  allowDangerouslySkipPermissions?: boolean;
  /** Custom callback for tool permission checks (optional) */
  canUseTool?: CanUseTool;
  /** Hooks configuration (optional) */
  hooks?: HooksConfig;
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
  // Set log level from options or environment variable
  const logLevel = options.logLevel ??
    (process.env.OPEN_AGENT_SDK_LOG_LEVEL as LogLevel) ??
    'info';
  logger.setLevel(logLevel);

  // Auto-detect provider from model name if not specified
  const modelLower = options.model.toLowerCase();
  const providerType = options.provider ??
    (modelLower.includes('gemini') ? 'google' :
     modelLower.includes('claude') ? 'anthropic' : 'openai');

  // Get API key based on provider
  const apiKey = options.apiKey ??
    (providerType === 'google' ? process.env.GEMINI_API_KEY :
     providerType === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);

  if (!apiKey) {
    const keyName = providerType === 'google' ? 'GEMINI_API_KEY' :
                    providerType === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(
      `${providerType} API key is required. Provide it via options.apiKey or ${keyName} environment variable.`
    );
  }

  // Create storage (default to FileStorage with project-grouped path)
  const storage = options.storage ?? new FileStorage({ cwd: options.cwd ?? process.cwd() });

  // Create provider
  let provider;
  if (providerType === 'google') {
    provider = new GoogleProvider({ apiKey, model: options.model });
  } else if (providerType === 'anthropic') {
    // Auto-detect authentication method based on baseURL
    // For Anthropic-compatible APIs like MiniMax, use Bearer token authentication
    const useBearerAuth = requiresBearerAuth(options.baseURL);
    provider = new AnthropicProvider({
      apiKey: useBearerAuth ? undefined : apiKey,
      authToken: useBearerAuth ? apiKey : undefined,
      model: options.model,
      baseURL: options.baseURL,
    });
  } else {
    provider = new OpenAIProvider({ apiKey, model: options.model, baseURL: options.baseURL });
  }

  // Create tool registry with default tools
  const toolRegistry = createDefaultRegistry();

  // Create skill registry and load skills
  const skillRegistry = createSkillRegistry();
  await skillRegistry.loadAll();

  // Set up checkpoint hooks if file checkpointing is enabled
  let hooks = options.hooks;
  if (options.enableFileCheckpointing) {
    const checkpointHooks = createCheckpointHooks(checkpointManager);
    const existingHooks = options.hooks instanceof HookManager
      ? options.hooks
      : options.hooks
        ? new HookManager(options.hooks)
        : new HookManager();

    // Merge checkpoint hooks with existing hooks
    hooks = mergeHooks(existingHooks, checkpointHooks);
  }

  // Generate session ID upfront so loop and session share the same ID
  const sessionId = generateUUID();

  // Create ReAct loop with skill registry
  const loop = new ReActLoop(provider, toolRegistry, {
    maxTurns: options.maxTurns ?? 10,
    systemPrompt: options.systemPrompt,
    allowedTools: options.allowedTools,
    cwd: options.cwd,
    env: options.env,
    abortController: options.abortController,
    permissionMode: options.permissionMode,
    allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions,
    canUseTool: options.canUseTool,
    mcpServers: options.mcpServers,
    hooks,
    skillRegistry,
    outputFormat: options.outputFormat,
  }, sessionId);

  // Create session with the same ID
  const session = new Session(loop, {
    id: sessionId,
    model: options.model,
    provider: providerType,
  }, storage);

  // Initialize checkpoint manager if enabled
  if (options.enableFileCheckpointing) {
    session.initializeWithCheckpointManager(checkpointManager);
  }

  // Initialize the session with the pre-loaded skill registry
  session.initializeWithSkillRegistry(skillRegistry);

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
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions,
      mcpServers: options.mcpServers,
      hooks: options.hooks,
      outputFormat: options.outputFormat,
      enableFileCheckpointing: options.enableFileCheckpointing,
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
  // Note: The permissionMode, allowDangerouslySkipPermissions, canUseTool, hooks from options
  // will override the saved session options when passed
  // Set log level from options or environment variable
  const logLevel = options?.logLevel ??
    (process.env.OPEN_AGENT_SDK_LOG_LEVEL as LogLevel) ??
    'info';
  logger.setLevel(logLevel);

  // Get storage (default to InMemoryStorage)
  const storage = options?.storage ?? new InMemoryStorage();

  // Load session data from storage
  const sessionData = await storage.load(sessionId);

  if (!sessionData) {
    throw new Error(`Session with ID "${sessionId}" not found in storage.`);
  }

  // Get API key (use override or from options, or env var)
  const providerType = sessionData.provider as 'openai' | 'google' | 'anthropic';
  const apiKey = options?.apiKey ??
    sessionData.options.apiKey ??
    (providerType === 'google' ? process.env.GEMINI_API_KEY :
     providerType === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);

  if (!apiKey) {
    const keyName = providerType === 'google' ? 'GEMINI_API_KEY' :
                    providerType === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(
      `${providerType} API key is required. Provide it via options.apiKey, saved session options, or ${keyName} environment variable.`
    );
  }

  // Create provider
  let provider;
  if (providerType === 'google') {
    provider = new GoogleProvider({ apiKey, model: sessionData.model });
  } else if (providerType === 'anthropic') {
    provider = new AnthropicProvider({ apiKey, model: sessionData.model });
  } else {
    provider = new OpenAIProvider({ apiKey, model: sessionData.model });
  }

  // Create tool registry with default tools
  const toolRegistry = createDefaultRegistry();

  // Create skill registry and load skills
  const skillRegistry = createSkillRegistry();
  await skillRegistry.loadAll();

  // Create ReAct loop with saved options, overridden by new options
  // Pass the existing session ID so all messages share the same session_id
  const loop = new ReActLoop(provider, toolRegistry, {
    maxTurns: sessionData.options.maxTurns ?? 10,
    systemPrompt: sessionData.options.systemPrompt,
    allowedTools: sessionData.options.allowedTools,
    cwd: sessionData.options.cwd,
    env: sessionData.options.env,
    permissionMode: options?.permissionMode ?? sessionData.options.permissionMode,
    allowDangerouslySkipPermissions: options?.allowDangerouslySkipPermissions ?? sessionData.options.allowDangerouslySkipPermissions,
    canUseTool: options?.canUseTool,
    mcpServers: sessionData.options.mcpServers,
    hooks: options?.hooks,
    skillRegistry,
    outputFormat: sessionData.options.outputFormat,
  }, sessionId);

  // Restore session from storage
  const session = await Session.loadFromStorage(sessionId, storage, loop);

  // Initialize the session with the skill registry
  if (session) {
    session.initializeWithSkillRegistry(skillRegistry);
  }

  if (!session) {
    throw new Error(`Failed to load session with ID "${sessionId}".`);
  }

  return session;
}

/**
 * Fork an existing session, creating a new session with copied message history
 * The new session can optionally override model, provider, and other options
 *
 * @param sourceSessionId - ID of the session to fork
 * @param options - Optional configuration for the forked session
 * @returns Promise resolving to the forked Session instance
 * @throws Error if source session is not found in storage
 *
 * @example
 * ```typescript
 * // Fork a session to try a different approach
 * const forked = await forkSession('original-session-id', {
 *   storage: fileStorage,
 *   model: 'claude-sonnet-4',  // Try with different model
 * });
 *
 * // The forked session has the same message history as the original
 * for await (const message of forked.stream()) {
 *   console.log(message);
 * }
 * ```
 */
export async function forkSession(
  sourceSessionId: string,
  options: ForkSessionOptions = {}
): Promise<Session> {
  // Set log level from options or environment variable
  const logLevel = options.logLevel ??
    (process.env.OPEN_AGENT_SDK_LOG_LEVEL as LogLevel) ??
    'info';
  logger.setLevel(logLevel);

  // Get storage (default to InMemoryStorage)
  const storage = options.storage ?? new InMemoryStorage();

  // Load source session data from storage
  const sourceData = await storage.load(sourceSessionId);

  if (!sourceData) {
    throw new Error(`Source session "${sourceSessionId}" not found`);
  }

  // Determine provider and model (allow overrides)
  const providerType = options.provider ?? sourceData.provider as 'openai' | 'google' | 'anthropic';
  const model = options.model ?? sourceData.model;

  // Get API key (use override, saved options, or env var)
  const apiKey = options.apiKey ??
    sourceData.options.apiKey ??
    (providerType === 'google' ? process.env.GEMINI_API_KEY :
     providerType === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);

  if (!apiKey) {
    const keyName = providerType === 'google' ? 'GEMINI_API_KEY' :
                    providerType === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(
      `${providerType} API key is required. Provide it via options.apiKey, saved session options, or ${keyName} environment variable.`
    );
  }

  // Create provider
  let provider;
  if (providerType === 'google') {
    provider = new GoogleProvider({ apiKey, model });
  } else if (providerType === 'anthropic') {
    provider = new AnthropicProvider({ apiKey, model });
  } else {
    provider = new OpenAIProvider({ apiKey, model });
  }

  // Create tool registry with default tools
  const toolRegistry = createDefaultRegistry();

  // Create skill registry and load skills
  const skillRegistry = createSkillRegistry();
  await skillRegistry.loadAll();

  // Generate new session ID upfront so loop and session share the same ID
  const newId = generateUUID();
  const forkTimestamp = Date.now();

  // Create ReAct loop with inherited options, overridden by new options
  const loop = new ReActLoop(provider, toolRegistry, {
    maxTurns: sourceData.options.maxTurns ?? 10,
    systemPrompt: sourceData.options.systemPrompt,
    allowedTools: sourceData.options.allowedTools,
    cwd: sourceData.options.cwd,
    env: sourceData.options.env,
    permissionMode: options.permissionMode ?? sourceData.options.permissionMode,
    allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions ?? sourceData.options.allowDangerouslySkipPermissions,
    canUseTool: options.canUseTool,
    mcpServers: sourceData.options.mcpServers,
    hooks: options.hooks ?? sourceData.options.hooks,
    skillRegistry,
  }, newId);

  // Create new Session instance with fork metadata
  const session = new Session(loop, {
    id: newId,
    model,
    provider: providerType,
    parentSessionId: sourceSessionId,
    forkedAt: forkTimestamp,
  }, storage);

  // Initialize the session with the skill registry
  session.initializeWithSkillRegistry(skillRegistry);

  // Copy message history from source session
  (session as unknown as { messages: unknown[] }).messages = [...sourceData.messages];
  (session as unknown as { createdAt: number }).createdAt = forkTimestamp;

  // Save forked session data with parent tracking
  const forkedData: SessionData = {
    id: newId,
    model,
    provider: providerType,
    createdAt: forkTimestamp,
    updatedAt: forkTimestamp,
    messages: [...sourceData.messages],
    options: {
      ...sourceData.options,
      model,
      provider: providerType,
      permissionMode: options.permissionMode ?? sourceData.options.permissionMode,
      allowDangerouslySkipPermissions: options.allowDangerouslySkipPermissions ?? sourceData.options.allowDangerouslySkipPermissions,
      hooks: options.hooks ?? sourceData.options.hooks,
    },
    parentSessionId: sourceSessionId,
    forkedAt: forkTimestamp,
  };

  await storage.save(forkedData);

  return session;
}

/**
 * Merge checkpoint hooks with existing hooks
 * Preserves all existing hooks and adds checkpoint hooks
 */
function mergeHooks(
  existing: HookManager | HooksConfig,
  checkpointHooks: ReturnType<typeof createCheckpointHooks>
): HooksConfig {
  // Extract existing hooks config
  const existingConfig: HooksConfig = existing instanceof HookManager
    ? {} // HookManager doesn't expose its internal config, so we can't merge
    : existing ?? {};

  // Merge checkpoint hooks with existing hooks
  const merged: HooksConfig = { ...existingConfig };

  // Add PreToolUse checkpoint hooks
  if (checkpointHooks.PreToolUse) {
    merged.PreToolUse = [
      checkpointHooks.PreToolUse as HookCallbackMatcher,
      ...(existingConfig.PreToolUse ?? []),
    ];
  }

  // Add PostToolUse checkpoint hooks
  if (checkpointHooks.PostToolUse) {
    merged.PostToolUse = [
      checkpointHooks.PostToolUse as HookCallbackMatcher,
      ...(existingConfig.PostToolUse ?? []),
    ];
  }

  return merged;
}
