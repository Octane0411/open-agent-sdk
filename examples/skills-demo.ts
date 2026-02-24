/**
 * Skill System Demo
 *
 * This example demonstrates how the skill system works:
 * 1. Skills are automatically loaded from ~/.claude/skills/ and ./.claude/skills/
 * 2. When a user sends a message starting with /skill-name, the skill content is injected
 * 3. The LLM receives the skill instructions and acts accordingly
 *
 * Prerequisites:
 * - Set OPENAI_API_KEY or GEMINI_API_KEY environment variable
 * - Create skill files in ~/.claude/skills/ directory
 */

import { createSession } from '../packages/core/src/session';

// Example skill file (save as ~/.claude/skills/code-reviewer.md):
// ---
// name: code-reviewer
// description: A code review specialist that checks code quality
// tools: ['Read', 'Grep', 'Glob']
// ---
//
// # Code Reviewer Skill
//
// You are a thorough code reviewer. When activated:
// 1. Start with "[CODE REVIEWER ACTIVATED]"
// 2. Analyze the code for:
//    - Potential bugs
//    - Performance issues
//    - Security vulnerabilities
//    - Code style violations
// 3. Provide specific, actionable feedback
//
// Arguments: $ARGUMENTS

async function main() {
  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: Please set OPENAI_API_KEY or GEMINI_API_KEY environment variable');
    process.exit(1);
  }

  const provider = process.env.OPENAI_API_KEY ? 'openai' : 'google';
  const model = provider === 'openai' ? 'gpt-4o-mini' : 'gemini-3-flash-preview';

  console.log(`Creating session with ${provider} provider...\n`);

  // Create a session - skills will be loaded automatically
  const session = await createSession({
    model,
    provider,
    apiKey,
    maxTurns: 5,
  });

  // Wait a moment for skills to load (they load asynchronously)
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Display loaded skills
  const catalog = session.getSkillCatalog();
  console.log('Loaded Skills:');
  if (catalog.length === 0) {
    console.log('  No skills found. Create skill files in ~/.claude/skills/ or ./.claude/skills/');
  } else {
    for (const skill of catalog) {
      console.log(`  - /${skill.name}: ${skill.description}`);
    }
  }
  console.log();

  // Example 1: Use a skill
  if (catalog.length > 0) {
    const skillName = catalog[0].name;
    console.log(`Example: Activating skill "${skillName}"`);
    console.log('Sending: /' + skillName + '\n');

    await session.send(`/${skillName}`);

    console.log('Response:');
    for await (const message of session.stream()) {
      if (message.type === 'assistant') {
        console.log(message.message.content);
      } else if (message.type === 'tool_result') {
        console.log('[Tool Result]');
      }
    }
    console.log();
  }

  // Example 2: Regular message (no skill)
  console.log('Example: Regular message (no skill activation)');
  console.log('Sending: What is the weather like?\n');

  await session.send('What is the weather like?');

  console.log('Response:');
  for await (const message of session.stream()) {
    if (message.type === 'assistant') {
      console.log(message.message.content);
    }
  }

  // Clean up
  await session.close();
  console.log('\nSession closed.');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
