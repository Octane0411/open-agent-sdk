/**
 * File checkpoint system for tracking file changes and supporting rollback
 * Integrates with hooks to capture file state before and after tool execution
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { logger } from '../utils/logger';

/**
 * Single file checkpoint entry
 * Records the state of a file before and after a modification
 */
export interface FileCheckpoint {
  /** Absolute path to the file */
  filePath: string;
  /** Content before the change (null if file didn't exist) */
  beforeState: string | null;
  /** Content after the change (null if file was deleted) */
  afterState: string | null;
  /** Timestamp when checkpoint was created */
  timestamp: number;
  /** Tool use ID that triggered this checkpoint */
  toolUseId: string;
  /** Type of operation that caused the change */
  operation: 'write' | 'edit' | 'bash' | 'delete';
}

/**
 * Serialized checkpoint data for storage
 */
export interface CheckpointData {
  version: 1;
  checkpoints: FileCheckpoint[];
}

/**
 * Manager for file checkpoints within a session
 * Handles recording changes and rewinding to previous states
 */
export class FileCheckpointManager {
  private checkpoints: Map<string, FileCheckpoint[]> = new Map();
  private pendingCheckpoints: Map<string, FileCheckpoint> = new Map();

  /**
   * Record the pre-change state of a file
   * Should be called before a file-modifying tool executes
   *
   * @param sessionId - Session identifier
   * @param toolUseId - Tool use ID that will make the change
   * @param filePath - Absolute path to the file
   */
  recordPreChange(sessionId: string, toolUseId: string, filePath: string): void {
    try {
      // Normalize the path
      const normalizedPath = this.normalizePath(filePath);

      // Check if we already have a pending checkpoint for this tool+file combo
      const key = `${toolUseId}:${normalizedPath}`;
      if (this.pendingCheckpoints.has(key)) {
        return; // Already recorded
      }

      // Read current file state (null if file doesn't exist)
      const beforeState = existsSync(normalizedPath)
        ? readFileSync(normalizedPath, 'utf-8')
        : null;

      // Create pending checkpoint
      const checkpoint: FileCheckpoint = {
        filePath: normalizedPath,
        beforeState,
        afterState: null, // Will be filled in post-change
        timestamp: Date.now(),
        toolUseId,
        operation: 'write', // Will be updated in post-change
      };

      this.pendingCheckpoints.set(key, checkpoint);

      logger.debug('[FileCheckpointManager] Recorded pre-change state:', {
        sessionId,
        toolUseId,
        filePath: normalizedPath,
        existed: beforeState !== null,
      });
    } catch (error) {
      logger.warn('[FileCheckpointManager] Failed to record pre-change state:', error);
    }
  }

  /**
   * Record the post-change state of a file
   * Should be called after a file-modifying tool executes
   *
   * @param sessionId - Session identifier
   * @param toolUseId - Tool use ID that made the change
   * @param filePath - Absolute path to the file
   * @param operation - Type of operation performed
   */
  recordPostChange(
    sessionId: string,
    toolUseId: string,
    filePath: string,
    operation: 'write' | 'edit' | 'bash' | 'delete'
  ): void {
    try {
      // Normalize the path
      const normalizedPath = this.normalizePath(filePath);
      const key = `${toolUseId}:${normalizedPath}`;

      // Get the pending checkpoint
      let checkpoint = this.pendingCheckpoints.get(key);

      // If no pending checkpoint exists, create one (shouldn't normally happen)
      if (!checkpoint) {
        checkpoint = {
          filePath: normalizedPath,
          beforeState: null,
          afterState: null,
          timestamp: Date.now(),
          toolUseId,
          operation,
        };
      }

      // Read the new file state (null if file was deleted)
      checkpoint.afterState = existsSync(normalizedPath)
        ? readFileSync(normalizedPath, 'utf-8')
        : null;
      checkpoint.operation = operation;

      // Move from pending to committed checkpoints
      this.pendingCheckpoints.delete(key);

      // Add to session's checkpoint list
      const sessionCheckpoints = this.checkpoints.get(sessionId) ?? [];
      sessionCheckpoints.push(checkpoint);
      this.checkpoints.set(sessionId, sessionCheckpoints);

      logger.debug('[FileCheckpointManager] Recorded post-change state:', {
        sessionId,
        toolUseId,
        filePath: normalizedPath,
        operation,
        exists: checkpoint.afterState !== null,
      });
    } catch (error) {
      logger.warn('[FileCheckpointManager] Failed to record post-change state:', error);
    }
  }

  /**
   * Rewind files to the state at a specific checkpoint
   * Restores all files modified by the tool use and subsequent operations
   *
   * @param sessionId - Session identifier
   * @param toolUseId - Tool use ID to rewind to (restores state before this tool executed)
   * @returns Promise resolving when rewind is complete
   */
  async rewindToCheckpoint(sessionId: string, toolUseId: string): Promise<void> {
    const sessionCheckpoints = this.checkpoints.get(sessionId) ?? [];

    // Find the index of the target checkpoint
    const targetIndex = sessionCheckpoints.findIndex((cp) => cp.toolUseId === toolUseId);

    if (targetIndex === -1) {
      throw new Error(`Checkpoint not found for tool use ID: ${toolUseId}`);
    }

    logger.debug('[FileCheckpointManager] Rewinding to checkpoint:', {
      sessionId,
      toolUseId,
      targetIndex,
      totalCheckpoints: sessionCheckpoints.length,
    });

    // Collect all files that need to be restored
    // We need to restore files to their state BEFORE the target checkpoint's tool executed
    const filesToRestore = new Map<string, string | null>();

    // Iterate from the target checkpoint backwards to find the earliest state
    for (let i = targetIndex; i < sessionCheckpoints.length; i++) {
      const checkpoint = sessionCheckpoints[i];

      // Only capture if we haven't seen this file yet
      if (!filesToRestore.has(checkpoint.filePath)) {
        // We want to restore to the BEFORE state of the target checkpoint
        // But if we're rewinding to checkpoint N, we want state before N executed
        // which is the beforeState of checkpoint N
        filesToRestore.set(checkpoint.filePath, checkpoint.beforeState);
      }
    }

    // Restore each file
    for (const [filePath, content] of filesToRestore) {
      try {
        if (content === null) {
          // File didn't exist before, delete it
          if (existsSync(filePath)) {
            unlinkSync(filePath);
            logger.debug('[FileCheckpointManager] Deleted file during rewind:', filePath);
          }
        } else {
          // Restore file content
          writeFileSync(filePath, content, 'utf-8');
          logger.debug('[FileCheckpointManager] Restored file during rewind:', filePath);
        }
      } catch (error) {
        logger.warn('[FileCheckpointManager] Failed to restore file during rewind:', {
          filePath,
          error,
        });
        throw new Error(
          `Failed to restore file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Remove all checkpoints from target onwards (they're now invalid)
    const preservedCheckpoints = sessionCheckpoints.slice(0, targetIndex);
    this.checkpoints.set(sessionId, preservedCheckpoints);

    logger.debug('[FileCheckpointManager] Rewind complete:', {
      sessionId,
      preservedCheckpoints: preservedCheckpoints.length,
      restoredFiles: filesToRestore.size,
    });
  }

  /**
   * Get all checkpoints for a session
   *
   * @param sessionId - Session identifier
   * @returns Array of checkpoints for the session
   */
  getCheckpoints(sessionId: string): FileCheckpoint[] {
    return [...(this.checkpoints.get(sessionId) ?? [])];
  }

  /**
   * Clear all checkpoints for a session
   *
   * @param sessionId - Session identifier
   */
  clearCheckpoints(sessionId: string): void {
    this.checkpoints.delete(sessionId);

    // Also clear any pending checkpoints for this session
    for (const _key of this.pendingCheckpoints.keys()) {
      // Keys are in format "toolUseId:filePath", we need to check if toolUseId belongs to session
      // For now, we'll leave pending checkpoints as they should be rare and short-lived
      void _key;
    }

    logger.debug('[FileCheckpointManager] Cleared checkpoints for session:', sessionId);
  }

  /**
   * Serialize checkpoints for storage
   *
   * @param sessionId - Session identifier
   * @returns Serialized checkpoint data or null if no checkpoints
   */
  serialize(sessionId: string): CheckpointData | null {
    const sessionCheckpoints = this.checkpoints.get(sessionId);
    if (!sessionCheckpoints || sessionCheckpoints.length === 0) {
      return null;
    }

    return {
      version: 1,
      checkpoints: [...sessionCheckpoints],
    };
  }

  /**
   * Deserialize and load checkpoints from storage
   *
   * @param sessionId - Session identifier
   * @param data - Serialized checkpoint data
   */
  deserialize(sessionId: string, data: CheckpointData): void {
    if (data.version !== 1) {
      throw new Error(`Unsupported checkpoint data version: ${data.version}`);
    }

    this.checkpoints.set(sessionId, [...data.checkpoints]);

    logger.debug('[FileCheckpointManager] Deserialized checkpoints for session:', {
      sessionId,
      count: data.checkpoints.length,
    });
  }

  /**
   * Normalize a file path to absolute form
   */
  private normalizePath(filePath: string): string {
    if (filePath.startsWith('/')) {
      return filePath;
    }
    return `${process.cwd()}/${filePath}`;
  }
}

/**
 * Global checkpoint manager instance
 */
export const checkpointManager = new FileCheckpointManager();
