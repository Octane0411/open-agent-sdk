export function resolveWorkingDirectory(rawCwd: string | undefined, fallback = process.cwd()): string {
  return rawCwd && rawCwd.trim() ? rawCwd : fallback;
}
