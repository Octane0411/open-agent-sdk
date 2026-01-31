/**
 * Edit tool - Precise string replacement in files
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Tool, ToolContext, JSONSchema } from '../types/tools';

export interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface EditOutput {
  message: string;
  replacements: number;
  file_path: string;
  error?: string;
}

const parameters: JSONSchema = {
  type: 'object',
  properties: {
    file_path: {
      type: 'string',
      description: 'Absolute or relative file path to edit',
    },
    old_string: {
      type: 'string',
      description: 'Exact string to replace (must be unique unless replace_all is true)',
    },
    new_string: {
      type: 'string',
      description: 'Replacement string',
    },
    replace_all: {
      type: 'boolean',
      description: 'Replace all occurrences instead of just the first',
    },
  },
  required: ['file_path', 'old_string', 'new_string'],
};

export class EditTool implements Tool<EditInput, EditOutput> {
  name = 'Edit';
  description =
    'Replace text in a file. The old_string must match exactly. Use replace_all to replace multiple occurrences.';
  parameters = parameters;

  handler = async (
    input: EditInput,
    context: ToolContext
  ): Promise<EditOutput> => {
    const filePath = resolve(context.cwd, input.file_path);

    if (!existsSync(filePath)) {
      return {
        error: `File "${input.file_path}" does not exist`,
        replacements: 0,
        message: '',
        file_path: input.file_path,
      };
    }

    const content = readFileSync(filePath, 'utf-8');
    const oldString = input.old_string;
    const newString = input.new_string;

    // Count occurrences
    let count = 0;
    let pos = content.indexOf(oldString);
    while (pos !== -1) {
      count++;
      pos = content.indexOf(oldString, pos + oldString.length);
    }

    if (count === 0) {
      return {
        error: `String not found in file: "${oldString.substring(0, 50)}${
          oldString.length > 50 ? '...' : ''
        }"`,
        replacements: 0,
        message: '',
        file_path: input.file_path,
      };
    }

    if (count > 1 && !input.replace_all) {
      return {
        error: `String appears multiple times in file (${count} occurrences). Use replace_all to replace all occurrences.`,
        replacements: 0,
        message: '',
        file_path: input.file_path,
      };
    }

    // Perform replacement
    const newContent = input.replace_all
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    writeFileSync(filePath, newContent, 'utf-8');

    const replacements = input.replace_all ? count : 1;

    return {
      message: `Successfully made ${replacements} replacement${
        replacements > 1 ? 's' : ''
      } in "${input.file_path}"`,
      replacements,
      file_path: input.file_path,
    };
  };
}

// Export singleton instance
export const editTool = new EditTool();
