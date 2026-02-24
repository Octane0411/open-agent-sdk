/**
 * Demo: File Checkpointing with Open Agent SDK
 *
 * This example shows how to use enableFileCheckpointing to track file
 * changes and support rollback operations.
 */

import { createSession } from '../packages/core/src';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmdirSync, unlinkSync } from 'fs';

async function fileCheckpointDemo() {
  // Create a temporary directory for our demo
  const tempDir = mkdtempSync(join(tmpdir(), 'checkpoint-demo-'));
  const testFile = join(tempDir, 'test.txt');

  try {
    console.log('=== File Checkpointing Demo ===\n');
    console.log('Working directory:', tempDir);

    // Create a session with file checkpointing enabled
    const session = await createSession({
      model: 'gpt-4o',
      enableFileCheckpointing: true,
      cwd: tempDir,
    });

    console.log('Session created with checkpointing enabled');
    console.log('Checkpointing enabled:', session.isCheckpointingEnabled());

    // Create an initial file
    writeFileSync(testFile, 'Version 1 - Original content', 'utf-8');
    console.log('\nInitial file content:', readFileSync(testFile, 'utf-8'));

    // Send a message that will modify the file (in a real scenario, the LLM would do this)
    // For demo purposes, we'll manually track changes

    // Simulate a file modification
    const checkpointsBefore = session.listCheckpoints();
    console.log('\nCheckpoints before modification:', checkpointsBefore.length);

    // Note: In a real scenario, the ReActLoop would automatically:
    // 1. Call recordPreChange before executing Write/Edit/Bash tools
    // 2. Call recordPostChange after tool execution
    // 3. Store the checkpoint with the tool_use_id

    // Modify the file
    writeFileSync(testFile, 'Version 2 - Modified content', 'utf-8');
    console.log('File modified to:', readFileSync(testFile, 'utf-8'));

    // Get checkpoints after modification
    const checkpointsAfter = session.listCheckpoints();
    console.log('\nCheckpoints after modification:', checkpointsAfter.length);

    // List all checkpoints
    console.log('\nAll checkpoints:');
    for (const cp of session.listCheckpoints()) {
      console.log(`  - Tool: ${cp.toolUseId}, File: ${cp.filePath}, Operation: ${cp.operation}`);
    }

    // Demonstrate rewind capability (would work if we had real checkpoints)
    console.log('\nNote: To rewind files, use:');
    console.log('  await session.rewindFiles(toolUseId);');

    await session.close();
    console.log('\nSession closed');

  } finally {
    // Cleanup
    try {
      if (existsSync(testFile)) {
        unlinkSync(testFile);
      }
      rmdirSync(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Run the demo
fileCheckpointDemo().catch(console.error);
