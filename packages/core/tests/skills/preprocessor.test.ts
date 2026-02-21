import { describe, it, expect } from 'bun:test';
import {
  preprocessContent,
  createPreprocessorContext,
} from '../../src/skills/preprocessor';
import type { PreprocessorContext } from '../../src/skills/types';

describe('preprocessContent', () => {
  it('should return content unchanged when no substitutions needed', () => {
    const content = '# Hello World\n\nThis is plain content.';
    const context: PreprocessorContext = {
      arguments: '',
    };

    const result = preprocessContent(content, context);
    expect(result).toBe(content);
  });

  it('should substitute $ARGUMENTS with all arguments', () => {
    const content = 'All arguments: $ARGUMENTS';
    const context: PreprocessorContext = {
      arguments: 'one two three',
    };

    const result = preprocessContent(content, context);
    expect(result).toBe('All arguments: one two three');
  });

  it('should handle empty $ARGUMENTS', () => {
    const content = 'Args: $ARGUMENTS';
    const context: PreprocessorContext = {
      arguments: '',
    };

    const result = preprocessContent(content, context);
    expect(result).toBe('Args: ');
  });

  it('should substitute multiple $ARGUMENTS occurrences', () => {
    const content = 'First: $ARGUMENTS, Second: $ARGUMENTS';
    const context: PreprocessorContext = {
      arguments: 'test args',
    };

    const result = preprocessContent(content, context);
    expect(result).toBe('First: test args, Second: test args');
  });

  it('should handle special characters in arguments', () => {
    const content = 'Arg: $ARGUMENTS';
    const context: PreprocessorContext = {
      arguments: 'hello world "quoted"',
    };

    const result = preprocessContent(content, context);
    expect(result).toBe('Arg: hello world "quoted"');
  });

  it('should handle $ARGUMENTS at content boundaries', () => {
    const contentStart = '$ARGUMENTS start';
    const contentEnd = 'end $ARGUMENTS';
    const context: PreprocessorContext = { arguments: 'test' };

    expect(preprocessContent(contentStart, context)).toBe('test start');
    expect(preprocessContent(contentEnd, context)).toBe('end test');
  });

  it('should handle consecutive $ARGUMENTS', () => {
    const content = '$ARGUMENTS$ARGUMENTS';
    const context: PreprocessorContext = { arguments: 'X' };

    const result = preprocessContent(content, context);
    expect(result).toBe('XX');
  });
});

describe('createPreprocessorContext', () => {
  it('should create context from args array', () => {
    const context = createPreprocessorContext(['arg1', 'arg2', 'arg3']);

    expect(context.arguments).toBe('arg1 arg2 arg3');
  });

  it('should handle empty args array', () => {
    const context = createPreprocessorContext([]);

    expect(context.arguments).toBe('');
  });

  it('should handle single argument', () => {
    const context = createPreprocessorContext(['single']);

    expect(context.arguments).toBe('single');
  });

  it('should handle arguments with spaces', () => {
    const context = createPreprocessorContext(['hello world', 'with quotes']);

    expect(context.arguments).toBe('hello world with quotes');
  });
});
