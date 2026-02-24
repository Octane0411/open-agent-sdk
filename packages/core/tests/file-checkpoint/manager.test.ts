/**
 * Tests for file checkpoint manager
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FileCheckpointManager } from '../../src/tools/file-checkpoint';
import { existsSync, writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('FileCheckpointManager', () => {
  let manager: FileCheckpointManager;
  let tempDir: string;
  let testFile: string;
  const sessionId = 'test-session-123';
  const toolUseId = 'tool-use-456';

  beforeEach(() => {
    manager = new FileCheckpointManager();
    tempDir = mkdtempSync(join(tmpdir(), 'checkpoint-test-'));
    testFile = join(tempDir, 'test.txt');
  });

  afterEach(() => {
    // Clean up temp files
    try {
      if (existsSync(testFile)) {
        unlinkSync(testFile);
      }
      rmdirSync(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  test('recordPreChange captures file content', () => {
    // Create a test file
    writeFileSync(testFile, 'original content', 'utf-8');

    manager.recordPreChange(sessionId, toolUseId, testFile);

    // No direct way to verify, but we can check that the rewind works
    expect(existsSync(testFile)).toBe(true);
  });

  test('recordPreChange handles non-existent file', () => {
    const nonExistentFile = join(tempDir, 'non-existent.txt');

    // Should not throw
    expect(() => {
      manager.recordPreChange(sessionId, toolUseId, nonExistentFile);
    }).not.toThrow();
  });

  test('recordPostChange captures new file state', () => {
    // Create initial file
    writeFileSync(testFile, 'original', 'utf-8');

    manager.recordPreChange(sessionId, toolUseId, testFile);

    // Modify the file
    writeFileSync(testFile, 'modified', 'utf-8');

    manager.recordPostChange(sessionId, toolUseId, testFile, 'write');

    // Verify checkpoint was created
    const checkpoints = manager.getCheckpoints(sessionId);
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0].beforeState).toBe('original');
    expect(checkpoints[0].afterState).toBe('modified');
    expect(checkpoints[0].operation).toBe('write');
    expect(checkpoints[0].toolUseId).toBe(toolUseId);
  });

  test('getCheckpoints returns empty array for unknown session', () => {
    const checkpoints = manager.getCheckpoints('unknown-session');
    expect(checkpoints).toEqual([]);
  });

  test('rewindToCheckpoint restores file to previous state', async () => {
    // Create initial file
    writeFileSync(testFile, 'version 1', 'utf-8');

    manager.recordPreChange(sessionId, toolUseId, testFile);
    writeFileSync(testFile, 'version 2', 'utf-8');
    manager.recordPostChange(sessionId, toolUseId, testFile, 'write');

    // Verify current state
    expect(existsSync(testFile)).toBe(true);

    // Rewind to checkpoint
    await manager.rewindToCheckpoint(sessionId, toolUseId);

    // File should be restored to 'version 1' (the beforeState)
    const content = await Bun.file(testFile).text();
    expect(content).toBe('version 1');
  });

  test('rewindToCheckpoint throws for unknown checkpoint', async () => {
    await expect(manager.rewindToCheckpoint(sessionId, 'unknown-tool')).rejects.toThrow(
      'Checkpoint not found for tool use ID: unknown-tool'
    );
  });

  test('clearCheckpoints removes all checkpoints for session', () => {
    writeFileSync(testFile, 'content', 'utf-8');
    manager.recordPreChange(sessionId, toolUseId, testFile);
    manager.recordPostChange(sessionId, toolUseId, testFile, 'write');

    expect(manager.getCheckpoints(sessionId).length).toBe(1);

    manager.clearCheckpoints(sessionId);

    expect(manager.getCheckpoints(sessionId).length).toBe(0);
  });

  test('serialize returns checkpoint data', () => {
    writeFileSync(testFile, 'content', 'utf-8');
    manager.recordPreChange(sessionId, toolUseId, testFile);
    manager.recordPostChange(sessionId, toolUseId, testFile, 'write');

    const data = manager.serialize(sessionId);

    expect(data).not.toBeNull();
    expect(data!.version).toBe(1);
    expect(data!.checkpoints.length).toBe(1);
  });

  test('serialize returns null for empty session', () => {
    const data = manager.serialize(sessionId);
    expect(data).toBeNull();
  });

  test('deserialize loads checkpoint data', () => {
    const testData = {
      version: 1 as const,
      checkpoints: [
        {
          filePath: testFile,
          beforeState: 'before',
          afterState: 'after',
          timestamp: Date.now(),
          toolUseId: 'test-tool',
          operation: 'write' as const,
        },
      ],
    };

    manager.deserialize(sessionId, testData);

    const checkpoints = manager.getCheckpoints(sessionId);
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0].filePath).toBe(testFile);
    expect(checkpoints[0].beforeState).toBe('before');
    expect(checkpoints[0].afterState).toBe('after');
  });

  test('deserialize throws for unsupported version', () => {
    const testData = {
      version: 999 as unknown as 1,
      checkpoints: [],
    };

    expect(() => manager.deserialize(sessionId, testData)).toThrow(
      'Unsupported checkpoint data version: 999'
    );
  });
});
