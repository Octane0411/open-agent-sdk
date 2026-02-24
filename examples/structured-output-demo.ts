/**
 * Demo: Structured Output with Open Agent SDK
 *
 * This example shows how to use the outputFormat option to get structured
 * JSON responses from the LLM.
 */

import { prompt, createSession, Schema } from '../packages/core/src';

async function structuredOutputDemo() {
  // Example 1: Using the prompt function with structured output
  console.log('=== Example 1: Basic structured output ===\n');

  const result = await prompt('Extract the key information from: "Apple Inc. was founded in 1976 by Steve Jobs."', {
    model: 'gpt-4o',
    outputFormat: {
      type: 'json_schema',
      name: 'company_info',
      schema: Schema.object({
        company_name: Schema.string({ description: 'The company name' }),
        founded_year: Schema.number({ description: 'Year the company was founded' }),
        founder: Schema.string({ description: 'Name of the founder' }),
      }, {
        required: ['company_name', 'founded_year', 'founder'],
        description: 'Information about a company',
      }),
    },
  });

  console.log('Result text:', result.result);
  console.log('Structured output:', JSON.stringify(result.structured_output, null, 2));

  // Example 2: Using sessions with structured output
  console.log('\n=== Example 2: Session with structured output ===\n');

  const session = await createSession({
    model: 'gpt-4o',
    outputFormat: {
      type: 'json_schema',
      name: 'task_list',
      schema: Schema.object({
        tasks: Schema.array(
          Schema.object({
            title: Schema.string(),
            priority: Schema.string({ enum: ['high', 'medium', 'low'] }),
          }),
          { description: 'List of tasks' }
        ),
      }, {
        required: ['tasks'],
      }),
    },
  });

  await session.send('What are 3 important tasks for a software project?');

  for await (const message of session.stream()) {
    if (message.type === 'assistant') {
      console.log('Assistant response:', message.message.content);
    }
  }

  await session.close();
}

// Run the demo
structuredOutputDemo().catch(console.error);
