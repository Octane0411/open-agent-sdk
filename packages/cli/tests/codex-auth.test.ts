import { describe, expect, test } from 'bun:test';

import { resolveCodexCliAuth } from '../src/codex-auth';

describe('resolveCodexCliAuth', () => {
  test('returns a direct Codex API key from env', () => {
    const result = resolveCodexCliAuth([], {
      OAS_CODEX_API_KEY: 'direct-token',
    });

    expect(result).toEqual({
      apiKey: 'direct-token',
    });
  });

  test('parses OAuth credentials JSON from env', () => {
    const result = resolveCodexCliAuth([], {
      OAS_CODEX_OAUTH_JSON: JSON.stringify({
        access: 'oauth-access',
        refresh: 'oauth-refresh',
        expires: 1_700_000_000_000,
        accountId: 'acct_env',
      }),
    });

    expect(result).toEqual({
      codexOAuth: {
        credentials: {
          access: 'oauth-access',
          refresh: 'oauth-refresh',
          expires: 1_700_000_000_000,
          accountId: 'acct_env',
        },
      },
    });
  });

  test('parses provider-map style OAuth credentials JSON from flag', () => {
    const result = resolveCodexCliAuth([
      '--codex-oauth-json',
      JSON.stringify({
        'openai-codex': {
          access: 'mapped-access',
          refresh: 'mapped-refresh',
          expires: 1_700_000_000_000,
          accountId: 'acct_map',
        },
      }),
    ], {});

    expect(result).toEqual({
      codexOAuth: {
        credentials: {
          access: 'mapped-access',
          refresh: 'mapped-refresh',
          expires: 1_700_000_000_000,
          accountId: 'acct_map',
        },
      },
    });
  });

  test('throws on invalid OAuth JSON', () => {
    expect(() => resolveCodexCliAuth([], {
      OAS_CODEX_OAUTH_JSON: '{"access":"missing-refresh"}',
    })).toThrow(/Invalid Codex OAuth JSON/i);
  });
});
