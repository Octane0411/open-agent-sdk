import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loginWithCodexOAuth, resolveCodexOAuthApiKey } from '../../src/auth/codex';

const mockGetOAuthApiKey = mock();
const mockLoginOpenAICodex = mock();

mock.module('@mariozechner/pi-ai/oauth', () => ({
  getOAuthApiKey: mockGetOAuthApiKey,
  loginOpenAICodex: mockLoginOpenAICodex,
}));

function createJwt(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('Codex OAuth helpers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'oas-codex-auth-'));
    mockGetOAuthApiKey.mockReset();
    mockLoginOpenAICodex.mockReset();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('imports Codex CLI credentials and persists refreshed credentials', async () => {
    const credentialsPath = path.join(tempDir, 'providers.json');
    const codexAuthPath = path.join(tempDir, 'codex-auth.json');
    const accessToken = createJwt({
      exp: Math.floor(Date.now() / 1000) + 3600,
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'acct_cli',
      },
    });

    await writeFile(codexAuthPath, JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: {
        access_token: accessToken,
        refresh_token: 'refresh_cli',
        account_id: 'acct_cli',
      },
    }), 'utf8');

    mockGetOAuthApiKey.mockImplementation(async (_providerId, credentialsMap) => {
      const credentials = credentialsMap['openai-codex'];
      expect(credentials?.refresh).toBe('refresh_cli');
      expect(credentials?.accountId).toBe('acct_cli');

      return {
        apiKey: 'resolved_access_token',
        newCredentials: {
          access: 'access_refreshed',
          refresh: 'refresh_refreshed',
          expires: Date.now() + 7200_000,
          accountId: 'acct_cli',
        },
      };
    });

    const result = await resolveCodexOAuthApiKey({
      credentialsPath,
      codexAuthPath,
    });

    expect(result.apiKey).toBe('resolved_access_token');
    expect(result.importedFromCodexCli).toBe(true);
    expect(result.accountId).toBe('acct_cli');

    const saved = JSON.parse(await readFile(credentialsPath, 'utf8')) as Record<string, Record<string, unknown>>;
    expect(saved['openai-codex']?.access).toBe('access_refreshed');
    expect(saved['openai-codex']?.refresh).toBe('refresh_refreshed');
  });

  test('runs interactive login when allowed and no cached credentials exist', async () => {
    const credentialsPath = path.join(tempDir, 'providers.json');
    const codexAuthPath = path.join(tempDir, 'missing-codex-auth.json');

    mockGetOAuthApiKey.mockImplementation(async (_providerId, credentialsMap) => {
      const credentials = credentialsMap['openai-codex'];
      if (!credentials) {
        return null;
      }

      return {
        apiKey: credentials.access,
        newCredentials: credentials,
      };
    });

    mockLoginOpenAICodex.mockResolvedValue({
      access: 'interactive_access',
      refresh: 'interactive_refresh',
      expires: Date.now() + 3600_000,
      accountId: 'acct_interactive',
    });

    const result = await loginWithCodexOAuth({
      credentialsPath,
      codexAuthPath,
      onAuth: () => {},
      onPrompt: async () => 'ignored',
    });

    expect(result.apiKey).toBe('interactive_access');
    expect(mockLoginOpenAICodex).toHaveBeenCalledTimes(1);

    const saved = JSON.parse(await readFile(credentialsPath, 'utf8')) as Record<string, Record<string, unknown>>;
    expect(saved['openai-codex']?.accountId).toBe('acct_interactive');
  });

  test('uses explicitly provided OAuth credentials without importing Codex CLI state', async () => {
    const credentialsPath = path.join(tempDir, 'providers.json');
    const codexAuthPath = path.join(tempDir, 'missing-codex-auth.json');

    mockGetOAuthApiKey.mockImplementation(async (_providerId, credentialsMap) => {
      const credentials = credentialsMap['openai-codex'];
      expect(credentials?.access).toBe('provided_access');
      expect(credentials?.refresh).toBe('provided_refresh');
      expect(credentials?.accountId).toBe('acct_provided');

      return {
        apiKey: 'resolved_from_provided_credentials',
        newCredentials: {
          access: 'provided_access_next',
          refresh: 'provided_refresh_next',
          expires: Date.now() + 7200_000,
          accountId: 'acct_provided',
        },
      };
    });

    const result = await resolveCodexOAuthApiKey({
      credentialsPath,
      codexAuthPath,
      credentials: {
        access: 'provided_access',
        refresh: 'provided_refresh',
        expires: Date.now() + 3600_000,
        accountId: 'acct_provided',
      },
    });

    expect(result.apiKey).toBe('resolved_from_provided_credentials');
    expect(result.importedFromCodexCli).toBe(false);
    expect(result.accountId).toBe('acct_provided');

    const saved = JSON.parse(await readFile(credentialsPath, 'utf8')) as Record<string, Record<string, unknown>>;
    expect(saved['openai-codex']?.access).toBe('provided_access_next');
    expect(saved['openai-codex']?.refresh).toBe('provided_refresh_next');
  });
});
