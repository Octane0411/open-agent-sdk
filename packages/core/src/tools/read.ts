/**
 * Read tool - Read file contents with support for text and images
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import type { Tool, ToolContext, JSONSchema } from '../types/tools';

export interface ReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

export interface ReadOutput {
  content?: string;
  image?: string;
  mime_type?: string;
  file_size?: number;
  total_lines?: number;
  lines_returned?: number;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description: 'Absolute or relative file path to read',
    },
    offset: {
      type: 'number',
      description: 'Starting line number (1-indexed)',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of lines to read',
    },
  },
  required: ['file_path'],
};

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

function isImageFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function getMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'application/octet-stream';
}

export class ReadTool implements Tool<ReadInput, ReadOutput> {
  name = 'Read';
  description =
    'Read the contents of a file. For text files, returns content with line numbers. For images, returns base64-encoded data.';
  parameters = parameters;

  handler = async (
    input: ReadInput,
    context: ToolContext
  ): Promise<ReadOutput> => {
    const filePath = resolve(context.cwd, input.file_path);

    if (!existsSync(filePath)) {
      return { error: `File "${input.file_path}" does not exist` };
    }

    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      return { error: `"${input.file_path}" is a directory, not a file` };
    }

    // Handle image files
    if (isImageFile(filePath)) {
      const data = readFileSync(filePath);
      return {
        image: data.toString('base64'),
        mime_type: getMimeType(filePath),
        file_size: stats.size,
      };
    }

    // Handle text files
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Apply offset and limit
    const offset = input.offset ?? 1;
    const limit = input.limit ?? totalLines;

    const startIndex = Math.max(0, offset - 1);
    const endIndex = Math.min(startIndex + limit, totalLines);

    const selectedLines = lines.slice(startIndex, endIndex);
    const numberedContent = selectedLines
      .map((line, idx) => `${startIndex + idx + 1}\t${line}`)
      .join('\n');

    return {
      content: numberedContent,
      total_lines: totalLines,
      lines_returned: selectedLines.length,
    };
  };
}

// Export singleton instance
export const readTool = new ReadTool();
