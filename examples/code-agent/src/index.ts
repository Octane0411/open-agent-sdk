#!/usr/bin/env bun
/**
 * Gemini CLI Code Agent Demo
 *
 * An interactive CLI demo showcasing the Open Agent SDK's core features:
 * - Session management with persistence
 * - Streaming responses
 * - Tool calling (Read, Write, Edit, Bash, Glob, Grep)
 * - Multi-turn conversations
 * - Cancel operations with Ctrl+C
 *
 * Run with:
 *   GEMINI_API_KEY=your-api-key bun dev
 *
 * Or after building:
 *   GEMINI_API_KEY=your-api-key bun start
 */

import { CLI } from './cli.js';

async function main() {
  const cli = new CLI();
  await cli.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
