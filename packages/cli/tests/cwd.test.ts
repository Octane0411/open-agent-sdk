import { describe, expect, test } from 'bun:test';

import { resolveWorkingDirectory } from '../src/cwd';

describe('resolveWorkingDirectory', () => {
  test('uses the provided cwd when it is non-empty', () => {
    expect(resolveWorkingDirectory('/tmp/task', '/fallback')).toBe('/tmp/task');
  });

  test('falls back when cwd is undefined', () => {
    expect(resolveWorkingDirectory(undefined, '/fallback')).toBe('/fallback');
  });

  test('falls back when cwd is blank', () => {
    expect(resolveWorkingDirectory('   ', '/fallback')).toBe('/fallback');
  });
});
