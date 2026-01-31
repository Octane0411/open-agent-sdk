/**
 * Write tool - Write content to files, creating parent directories as needed
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import type { Tool, ToolContext, JSONSchema } from '../types/tools';

export interface WriteInput {
  file_path: string;
  content: string;
}

export interface WriteOutput {
  message: string;
  file_path: string;
  bytes_written: number;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description: 'Absolute or relative file path to write',
    },
    content: {
      type: 'string',
      description: 'Content to write to the file',
    },
  },
  required: ['file_path', 'content'],
};

export class WriteTool implements Tool<WriteInput, WriteOutput> {
  name = 'Write';
  description =
    'Write content to a file. Creates parent directories automatically. Overwrites existing files.';
  parameters = parameters;

  handler = async (
    input: WriteInput,
    context: ToolContext
  ): Promise<WriteOutput> => {
    const filePath = resolve(context.cwd, input.file_path);
    const existed = existsSync(filePath);

    // Create parent directories
    const parentDir = dirname(filePath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Write file
    const content = input.content;
    writeFileSync(filePath, content, 'utf-8');

    return {
      message: existed
        ? `File "${input.file_path}" overwritten successfully`
        : `File "${input.file_path}" created successfully`,
      file_path: input.file_path,
      bytes_written: Buffer.byteLength(content, 'utf-8'),
    };
  };
}

// Export singleton instance
export const writeTool = new WriteTool();
