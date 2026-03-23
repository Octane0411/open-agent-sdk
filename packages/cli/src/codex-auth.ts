import type { CodexOAuthOptions } from 'open-agent-sdk';

type EnvMap = Record<string, string | undefined>;
type CodexOAuthCredentials = {
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
};

export interface CodexCliAuthResolution {
  apiKey?: string;
  codexOAuth?: CodexOAuthOptions & {
    credentials?: CodexOAuthCredentials;
  };
}

function getFlagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }

  return undefined;
}

function normalizeOAuthCredentials(value: unknown): CodexOAuthCredentials | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const direct = value as Record<string, unknown>;
  if (
    typeof direct.access === 'string' &&
    typeof direct.refresh === 'string' &&
    typeof direct.expires === 'number'
  ) {
    return {
      access: direct.access,
      refresh: direct.refresh,
      expires: direct.expires,
      ...(typeof direct.accountId === 'string' ? { accountId: direct.accountId } : {}),
    };
  }

  const mapped = direct['openai-codex'];
  if (!mapped || typeof mapped !== 'object') {
    return undefined;
  }

  const entry = mapped as Record<string, unknown>;
  if (
    typeof entry.access === 'string' &&
    typeof entry.refresh === 'string' &&
    typeof entry.expires === 'number'
  ) {
    return {
      access: entry.access,
      refresh: entry.refresh,
      expires: entry.expires,
      ...(typeof entry.accountId === 'string' ? { accountId: entry.accountId } : {}),
    };
  }

  return undefined;
}

function parseOAuthJson(value: string): CodexOAuthCredentials {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid Codex OAuth JSON: ${(error as Error).message}`);
  }

  const credentials = normalizeOAuthCredentials(parsed);
  if (!credentials) {
    throw new Error(
      'Invalid Codex OAuth JSON: expected either an OAuth credentials object or a provider map containing "openai-codex".'
    );
  }

  return credentials;
}

export function resolveCodexCliAuth(args: string[], env: EnvMap = process.env): CodexCliAuthResolution {
  const apiKey = getFlagValue(args, '--codex-api-key') ?? env.OAS_CODEX_API_KEY;
  const oauthJson = getFlagValue(args, '--codex-oauth-json') ?? env.OAS_CODEX_OAUTH_JSON;
  const authPath = getFlagValue(args, '--codex-auth-path') ?? env.OAS_CODEX_AUTH_PATH;
  const credentialsPath = getFlagValue(args, '--codex-credentials-path') ?? env.OAS_CODEX_CREDENTIALS_PATH;
  const allowInteractiveLogin = args.includes('--codex-interactive-login') ||
    env.OAS_CODEX_INTERACTIVE_LOGIN === 'true';

  const credentials = oauthJson ? parseOAuthJson(oauthJson) : undefined;
  const hasCodexOAuth =
    allowInteractiveLogin ||
    Boolean(authPath) ||
    Boolean(credentialsPath) ||
    Boolean(credentials);

  return {
    ...(apiKey ? { apiKey } : {}),
    ...(hasCodexOAuth
      ? {
          codexOAuth: {
            ...(allowInteractiveLogin ? { allowInteractiveLogin: true } : {}),
            ...(authPath ? { codexAuthPath: authPath } : {}),
            ...(credentialsPath ? { credentialsPath } : {}),
            ...(credentials ? { credentials } : {}),
          },
        }
      : {}),
  };
}
