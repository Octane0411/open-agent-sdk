import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import type { OAuthCredentials, OAuthPrompt } from '@mariozechner/pi-ai/oauth';

export const OPENAI_CODEX_PROVIDER_ID = 'openai-codex';

const OPENAI_AUTH_CLAIM = 'https://api.openai.com/auth';

type OAuthModule = typeof import('@mariozechner/pi-ai/oauth');
type ProviderCredentialsMap = Record<string, OAuthCredentials>;

interface CodexCliTokens {
  access_token?: string;
  refresh_token?: string;
  account_id?: string;
}

interface CodexCliAuthFile {
  auth_mode?: string;
  tokens?: CodexCliTokens;
}

let oauthModulePromise: Promise<OAuthModule> | null = null;

export interface CodexOAuthOptions {
  /** Path to the SDK-managed credentials file */
  credentialsPath?: string;
  /** Path to import existing Codex CLI credentials from */
  codexAuthPath?: string;
  /** Explicit OAuth credentials to use instead of importing from a file */
  credentials?: OAuthCredentials | Record<string, OAuthCredentials>;
  /** Allow starting an interactive browser login flow if no cached credentials are available */
  allowInteractiveLogin?: boolean;
  /** Called when interactive login requires the user to open a URL */
  onAuth?: (info: { url: string; instructions?: string }) => void | Promise<void>;
  /** Optional progress logger for the interactive login flow */
  onProgress?: (message: string) => void;
  /** Optional prompt handler for manual authorization-code entry */
  onPrompt?: (prompt: { message: string; placeholder?: string; allowEmpty?: boolean }) => Promise<string>;
}

export interface CodexOAuthResolution {
  apiKey: string;
  credentialsPath: string;
  importedFromCodexCli: boolean;
  accountId?: string;
}

function loadOAuthModule(): Promise<OAuthModule> {
  oauthModulePromise ??= import('@mariozechner/pi-ai/oauth');
  return oauthModulePromise;
}

function resolveDefaultCredentialsPath(): string {
  return path.join(homedir(), '.open-agent', 'auth', 'providers.json');
}

function resolveDefaultCodexAuthPath(): string {
  const codexHome = process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(homedir(), '.codex');
  return path.join(codexHome, 'auth.json');
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAccountIdFromJwt(token: string): string | undefined {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return undefined;
  }

  const auth = payload[OPENAI_AUTH_CLAIM];
  if (!auth || typeof auth !== 'object') {
    return undefined;
  }

  const accountId = (auth as Record<string, unknown>).chatgpt_account_id;
  return typeof accountId === 'string' && accountId.length > 0 ? accountId : undefined;
}

function getExpiryFromJwt(token: string): number | undefined {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  return typeof exp === 'number' ? exp * 1000 : undefined;
}

function normalizeOAuthCredentials(value: unknown): OAuthCredentials | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const access = record.access;
  const refresh = record.refresh;
  const expires = record.expires;

  if (typeof access !== 'string' || typeof refresh !== 'string' || typeof expires !== 'number') {
    return null;
  }

  return {
    access,
    refresh,
    expires,
    ...(typeof record.accountId === 'string' ? { accountId: record.accountId } : {}),
  };
}

function normalizeCodexCliCredentials(value: unknown): OAuthCredentials | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as CodexCliAuthFile;
  const tokens = record.tokens;
  if (!tokens || typeof tokens !== 'object') {
    return null;
  }

  const access = tokens.access_token;
  const refresh = tokens.refresh_token;
  if (typeof access !== 'string' || typeof refresh !== 'string') {
    return null;
  }

  const expires = getExpiryFromJwt(access);
  if (typeof expires !== 'number') {
    return null;
  }

  return {
    access,
    refresh,
    expires,
    ...(typeof tokens.account_id === 'string'
      ? { accountId: tokens.account_id }
      : getAccountIdFromJwt(access)
        ? { accountId: getAccountIdFromJwt(access) }
        : {}),
  };
}

function normalizeProvidedCredentials(value: unknown): OAuthCredentials | null {
  const direct = normalizeOAuthCredentials(value);
  if (direct) {
    return direct;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const providerEntry = (value as Record<string, unknown>)[OPENAI_CODEX_PROVIDER_ID];
  return normalizeOAuthCredentials(providerEntry);
}

async function loadProviderCredentialsMap(credentialsPath: string): Promise<ProviderCredentialsMap> {
  try {
    const content = await readFile(credentialsPath, 'utf8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const existing = normalizeOAuthCredentials(parsed[OPENAI_CODEX_PROVIDER_ID]);
    return existing ? { [OPENAI_CODEX_PROVIDER_ID]: existing } : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function saveProviderCredentialsMap(
  credentialsPath: string,
  credentialsMap: ProviderCredentialsMap
): Promise<void> {
  await mkdir(path.dirname(credentialsPath), { recursive: true });
  await writeFile(credentialsPath, JSON.stringify(credentialsMap, null, 2) + '\n', 'utf8');
}

async function importFromCodexCliAuthPath(codexAuthPath: string): Promise<OAuthCredentials | null> {
  try {
    const content = await readFile(codexAuthPath, 'utf8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    const oauthEntry = normalizeOAuthCredentials(parsed[OPENAI_CODEX_PROVIDER_ID]);
    if (oauthEntry) {
      return oauthEntry;
    }

    return normalizeCodexCliCredentials(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function defaultPrompt(prompt: OAuthPrompt): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const value = await rl.question(`${prompt.message} `);
    return value.trim();
  } finally {
    rl.close();
  }
}

async function startInteractiveLogin(
  credentialsMap: ProviderCredentialsMap,
  options: CodexOAuthOptions
): Promise<ProviderCredentialsMap> {
  const oauth = await loadOAuthModule();
  const onAuth = options.onAuth ?? ((info: { url: string; instructions?: string }) => {
    console.error('\nOpen this URL to complete Codex OAuth:\n');
    console.error(info.url);
    if (info.instructions) {
      console.error(`\n${info.instructions}`);
    }
    console.error('');
  });
  const onProgress = options.onProgress ?? ((message: string) => {
    console.error(message);
  });
  const onPrompt = options.onPrompt ?? defaultPrompt;

  const credentials = await oauth.loginOpenAICodex({
    onAuth: async (info) => {
      await onAuth(info);
    },
    onProgress,
    onPrompt,
  });

  return {
    ...credentialsMap,
    [OPENAI_CODEX_PROVIDER_ID]: credentials,
  };
}

/**
 * Resolve a short-lived Codex access token, importing cached Codex CLI credentials when available.
 * Credentials are persisted into the SDK's own auth store so refreshes do not mutate Codex CLI state.
 */
export async function resolveCodexOAuthApiKey(
  options: CodexOAuthOptions = {}
): Promise<CodexOAuthResolution> {
  const credentialsPath = options.credentialsPath ?? resolveDefaultCredentialsPath();
  const codexAuthPath = options.codexAuthPath ?? resolveDefaultCodexAuthPath();

  let credentialsMap = await loadProviderCredentialsMap(credentialsPath);
  let importedFromCodexCli = false;
  const providedCredentials = normalizeProvidedCredentials(options.credentials);

  if (providedCredentials) {
    credentialsMap = {
      ...credentialsMap,
      [OPENAI_CODEX_PROVIDER_ID]: providedCredentials,
    };
    await saveProviderCredentialsMap(credentialsPath, credentialsMap);
  }

  if (!providedCredentials && !credentialsMap[OPENAI_CODEX_PROVIDER_ID]) {
    const imported = await importFromCodexCliAuthPath(codexAuthPath);
    if (imported) {
      credentialsMap = {
        ...credentialsMap,
        [OPENAI_CODEX_PROVIDER_ID]: imported,
      };
      importedFromCodexCli = true;
      await saveProviderCredentialsMap(credentialsPath, credentialsMap);
    }
  }

  const oauth = await loadOAuthModule();
  let resolved = await oauth.getOAuthApiKey(OPENAI_CODEX_PROVIDER_ID, credentialsMap);

  if (!resolved && options.allowInteractiveLogin) {
    credentialsMap = await startInteractiveLogin(credentialsMap, options);
    await saveProviderCredentialsMap(credentialsPath, credentialsMap);
    resolved = await oauth.getOAuthApiKey(OPENAI_CODEX_PROVIDER_ID, credentialsMap);
  }

  if (!resolved) {
    throw new Error(
      'No valid Codex OAuth credentials are available. Run `codex login`, call `loginWithCodexOAuth()`, or enable `codexOAuth.allowInteractiveLogin`.'
    );
  }

  const next = {
    ...credentialsMap,
    [OPENAI_CODEX_PROVIDER_ID]: resolved.newCredentials,
  };
  await saveProviderCredentialsMap(credentialsPath, next);

  return {
    apiKey: resolved.apiKey,
    credentialsPath,
    importedFromCodexCli,
    ...(typeof resolved.newCredentials.accountId === 'string'
      ? { accountId: resolved.newCredentials.accountId }
      : {}),
  };
}

/**
 * Run the interactive Codex OAuth login flow and persist the resulting credentials.
 */
export async function loginWithCodexOAuth(
  options: Omit<CodexOAuthOptions, 'allowInteractiveLogin'> = {}
): Promise<CodexOAuthResolution> {
  return resolveCodexOAuthApiKey({
    ...options,
    allowInteractiveLogin: true,
  });
}
