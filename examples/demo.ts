#!/usr/bin/env bun
/**
 * Open Agent SDK v0.1.0 Demo (Gemini)
 *
 * Run with:
 *   GEMINI_API_KEY=AIza... bun demo.ts
 */

import { prompt, GoogleProvider, createUserMessage, createSystemMessage } from '../packages/core/src/index';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('Please set GEMINI_API_KEY environment variable');
    console.log('Example: GEMINI_API_KEY=AIza... bun demo.ts\n');
    process.exit(1);
  }

  console.log('Open Agent SDK v0.1.0 Demo (Gemini)\n');
  console.log('=' .repeat(50));

  // Demo 1: Simple query using prompt()
  console.log('\n1. Simple Query (using prompt()):');
  console.log('   Prompt: What is 2 + 2?\n');

  const result = await prompt('What is 2 + 2?', {
    model: 'gemini-2.0-flash',
    apiKey,
    maxTurns: 1,
  });

  console.log(`   Answer: ${result.result.trim()}`);
  console.log(`   Duration: ${result.duration_ms}ms`);
  console.log(`   Tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`);

  // Demo 2: Direct provider usage with streaming
  console.log('\n' + '='.repeat(50));
  console.log('\n2. Streaming (using GoogleProvider directly):');
  console.log('   Prompt: Explain quantum computing in 10 words\n');

  const provider = new GoogleProvider({ apiKey, model: 'gemini-2.0-flash' });
  const messages = [
    createSystemMessage('Be concise.'),
    createUserMessage('Explain quantum computing in 10 words'),
  ];

  process.stdout.write('   Answer: ');
  for await (const chunk of provider.chat(messages)) {
    if (chunk.type === 'content' && chunk.delta) {
      process.stdout.write(chunk.delta);
    }
  }
  console.log('\n');

  // Demo 3: Tool calling
  console.log('='.repeat(50));
  console.log('\n3. Tool Calling:');
  console.log('   Prompt: What is the weather in Tokyo?\n');

  const toolMessages = [createUserMessage('What is the weather in Tokyo?')];
  const tools = [{
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object' as const,
        properties: {
          location: { type: 'string', description: 'City name' },
        },
        required: ['location'],
      },
    },
  }];

  console.log('   Gemini wants to call:');
  for await (const chunk of provider.chat(toolMessages, tools)) {
    if (chunk.type === 'tool_call' && chunk.tool_call) {
      console.log(`   - Tool: ${chunk.tool_call.name}`);
      console.log(`   - Args: ${chunk.tool_call.arguments}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('\nDemo complete!');
  console.log('\nFeatures shown:');
  console.log('  ✓ prompt() function');
  console.log('  ✓ GoogleProvider direct usage');
  console.log('  ✓ Streaming responses');
  console.log('  ✓ Tool calling');
}

main().catch(console.error);
