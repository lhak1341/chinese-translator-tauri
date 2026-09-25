import { describe, test, expect } from 'vitest';
import { PatternTemplateEngine } from '../pattern/PatternTemplateEngine';

describe('PatternTemplateEngine', () => {
  describe('parsePatternToTokens', () => {
    test('parses pattern with single variable', () => {
      const tokens = PatternTemplateEngine.parsePatternToTokens('这些X');
      expect(tokens).toEqual([
        { type: 'literal', value: '这' },
        { type: 'literal', value: '些' },
        { type: 'variable', name: 'X', value: 'X' },
      ]);
    });

    test('parses pattern with multiple variables', () => {
      const tokens = PatternTemplateEngine.parsePatternToTokens('XYZ');
      expect(tokens).toEqual([
        { type: 'variable', name: 'X', value: 'X' },
        { type: 'variable', name: 'Y', value: 'Y' },
        { type: 'variable', name: 'Z', value: 'Z' },
      ]);
    });

    test('parses pattern with mixed variables and literals', () => {
      const tokens = PatternTemplateEngine.parsePatternToTokens('在XY中');
      expect(tokens).toEqual([
        { type: 'literal', value: '在' },
        { type: 'variable', name: 'X', value: 'X' },
        { type: 'variable', name: 'Y', value: 'Y' },
        { type: 'literal', value: '中' },
      ]);
    });

    test('parses pattern with only literals', () => {
      const tokens = PatternTemplateEngine.parsePatternToTokens('没有变量');
      expect(tokens).toEqual([
        { type: 'literal', value: '没' },
        { type: 'literal', value: '有' },
        { type: 'literal', value: '变' },
        { type: 'literal', value: '量' },
      ]);
    });

    test('parses empty pattern', () => {
      const tokens = PatternTemplateEngine.parsePatternToTokens('');
      expect(tokens).toEqual([]);
    });

    test('parses pattern with variable at start', () => {
      const tokens = PatternTemplateEngine.parsePatternToTokens('X是');
      expect(tokens).toEqual([
        { type: 'variable', name: 'X', value: 'X' },
        { type: 'literal', value: '是' },
      ]);
    });

    test('parses pattern with variable at end', () => {
      const tokens = PatternTemplateEngine.parsePatternToTokens('是X');
      expect(tokens).toEqual([
        { type: 'literal', value: '是' },
        { type: 'variable', name: 'X', value: 'X' },
      ]);
    });
  });

  describe('applyPatternTemplate', () => {
    test('applies single variable', () => {
      const result = PatternTemplateEngine.applyPatternTemplate('những X này', {
        X: 'con mèo',
      });
      expect(result).toBe('những con mèo này');
    });

    test('applies multiple variables', () => {
      const result = PatternTemplateEngine.applyPatternTemplate('X Y Z', {
        X: 'một',
        Y: 'hai',
        Z: 'ba',
      });
      expect(result).toBe('một hai ba');
    });

    test('applies variable multiple times in template', () => {
      const result = PatternTemplateEngine.applyPatternTemplate('X và X', {
        X: 'test',
      });
      expect(result).toBe('test và test');
    });

    test('handles template with no variables', () => {
      const result = PatternTemplateEngine.applyPatternTemplate('no variables', {});
      expect(result).toBe('no variables');
    });

    test('handles empty variables object', () => {
      const result = PatternTemplateEngine.applyPatternTemplate('X Y', {});
      expect(result).toBe('X Y');
    });

    test('applies variables in Vietnamese template', () => {
      const result = PatternTemplateEngine.applyPatternTemplate('ở trong X Y', {
        X: 'thành phố',
        Y: 'Hà Nội',
      });
      expect(result).toBe('ở trong thành phố Hà Nội');
    });
  });

  describe('extractVariables', () => {
    test('extracts single variable', () => {
      const vars = PatternTemplateEngine.extractVariables('这些X');
      expect(vars).toEqual(['X']);
    });

    test('extracts multiple variables', () => {
      const vars = PatternTemplateEngine.extractVariables('XYZ');
      expect(vars).toEqual(['X', 'Y', 'Z']);
    });

    test('extracts variables from mixed pattern', () => {
      const vars = PatternTemplateEngine.extractVariables('在XY中');
      expect(vars).toEqual(['X', 'Y']);
    });

    test('extracts the # number variable', () => {
      expect(PatternTemplateEngine.extractVariables('#大X之一')).toEqual(['#', 'X']);
      expect(PatternTemplateEngine.extractVariables('X tầng thứ #')).toEqual(['X', '#']);
    });

    test('returns empty array for pattern with no variables', () => {
      const vars = PatternTemplateEngine.extractVariables('没有变量');
      expect(vars).toEqual([]);
    });

    test('extracts duplicate variables', () => {
      const vars = PatternTemplateEngine.extractVariables('X和X');
      expect(vars).toEqual(['X', 'X']);
    });

    test('handles empty pattern', () => {
      const vars = PatternTemplateEngine.extractVariables('');
      expect(vars).toEqual([]);
    });

    test('ignores lowercase letters', () => {
      const vars = PatternTemplateEngine.extractVariables('abc');
      expect(vars).toEqual([]);
    });

    test('does not treat a capital fused to a word as a variable', () => {
      // "X" glued directly to lowercase letters reads as a real word
      // (e.g. a capitalized proper noun), not a standalone placeholder.
      const vars = PatternTemplateEngine.extractVariables('Xabc');
      expect(vars).toEqual([]);
    });

    test('ignores capitals inside Vietnamese proper nouns in a template', () => {
      // Regression: "Yến" must not be read as variable Y.
      const vars = PatternTemplateEngine.extractVariables('X họ Yến');
      expect(vars).toEqual(['X']);
    });
  });

  describe('validatePattern', () => {
    test('validates simple pattern', () => {
      const result = PatternTemplateEngine.validatePattern('这些X');
      expect(result.valid).toBe(true);
      expect(result.variables).toEqual(['X']);
    });

    test('validates pattern with multiple variables', () => {
      const result = PatternTemplateEngine.validatePattern('XYZ');
      expect(result.valid).toBe(true);
      expect(result.variables).toEqual(['X', 'Y', 'Z']);
    });

    test('validates pattern with no variables', () => {
      const result = PatternTemplateEngine.validatePattern('没有变量');
      expect(result.valid).toBe(true);
      expect(result.variables).toEqual([]);
    });

    test('rejects empty pattern', () => {
      const result = PatternTemplateEngine.validatePattern('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Pattern cannot be empty');
    });

    test('rejects whitespace-only pattern', () => {
      const result = PatternTemplateEngine.validatePattern('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Pattern cannot be empty');
    });

    test('validates pattern with duplicate variables', () => {
      const result = PatternTemplateEngine.validatePattern('X和X');
      expect(result.valid).toBe(true);
      expect(result.variables).toEqual(['X']); // Duplicates removed
    });
  });

  describe('validateTemplate', () => {
    test('validates template using all pattern variables', () => {
      const result = PatternTemplateEngine.validateTemplate('những X này', ['X']);
      expect(result.valid).toBe(true);
    });

    test('validates template with multiple variables', () => {
      const result = PatternTemplateEngine.validateTemplate('X Y Z', ['X', 'Y', 'Z']);
      expect(result.valid).toBe(true);
    });

    test('rejects template missing pattern variables', () => {
      const result = PatternTemplateEngine.validateTemplate('no variables', ['X']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Template does not use pattern variables');
      expect(result.unusedVariables).toEqual(['X']);
    });

    test('rejects template with undefined variables', () => {
      const result = PatternTemplateEngine.validateTemplate('X Y', ['X']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Template uses undefined variables');
      expect(result.undefinedVariables).toEqual(['Y']);
    });

    test('validates template with variable used multiple times', () => {
      const result = PatternTemplateEngine.validateTemplate('X và X', ['X']);
      expect(result.valid).toBe(true);
    });

    test('validates template with no variables', () => {
      const result = PatternTemplateEngine.validateTemplate('no variables', []);
      expect(result.valid).toBe(true);
    });
  });

  describe('validatePatternTemplate', () => {
    test('validates valid pattern-template pair', () => {
      const result = PatternTemplateEngine.validatePatternTemplate('这些X', 'những X này');
      expect(result.valid).toBe(true);
      expect(result.variables).toEqual(['X']);
    });

    test('validates pattern-template with multiple variables', () => {
      const result = PatternTemplateEngine.validatePatternTemplate('在XY中', 'ở trong X Y');
      expect(result.valid).toBe(true);
      expect(result.variables).toEqual(['X', 'Y']);
    });

    test('rejects empty pattern', () => {
      const result = PatternTemplateEngine.validatePatternTemplate('', 'template');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Pattern cannot be empty');
    });

    test('rejects template missing pattern variables', () => {
      const result = PatternTemplateEngine.validatePatternTemplate('这些X', 'no variable');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Template does not use pattern variables');
    });

    test('rejects template with undefined variables', () => {
      const result = PatternTemplateEngine.validatePatternTemplate('这些X', 'X Y Z');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Template uses undefined variables');
    });

    test('validates pattern-template with no variables', () => {
      const result = PatternTemplateEngine.validatePatternTemplate('literal', 'literal');
      expect(result.valid).toBe(true);
      expect(result.variables).toEqual([]);
    });
  });

  describe('getPatternStats', () => {
    test('calculates stats for simple pattern', () => {
      const stats = PatternTemplateEngine.getPatternStats('这些X');
      expect(stats).toEqual({
        length: 3,
        literalCount: 2,
        variableCount: 1,
        variables: ['X'],
        uniqueVariableCount: 1,
      });
    });

    test('calculates stats for pattern with multiple variables', () => {
      const stats = PatternTemplateEngine.getPatternStats('在XY中');
      expect(stats).toEqual({
        length: 4,
        literalCount: 2,
        variableCount: 2,
        variables: ['X', 'Y'],
        uniqueVariableCount: 2,
      });
    });

    test('calculates stats for pattern with only literals', () => {
      const stats = PatternTemplateEngine.getPatternStats('没有变量');
      expect(stats).toEqual({
        length: 4,
        literalCount: 4,
        variableCount: 0,
        variables: [],
        uniqueVariableCount: 0,
      });
    });

    test('calculates stats for pattern with only variables', () => {
      const stats = PatternTemplateEngine.getPatternStats('XYZ');
      expect(stats).toEqual({
        length: 3,
        literalCount: 0,
        variableCount: 3,
        variables: ['X', 'Y', 'Z'],
        uniqueVariableCount: 3,
      });
    });

    test('calculates stats for pattern with duplicate variables', () => {
      const stats = PatternTemplateEngine.getPatternStats('X和X');
      expect(stats).toEqual({
        length: 3,
        literalCount: 1,
        variableCount: 2,
        variables: ['X', 'X'],
        uniqueVariableCount: 1,
      });
    });

    test('calculates stats for empty pattern', () => {
      const stats = PatternTemplateEngine.getPatternStats('');
      expect(stats).toEqual({
        length: 0,
        literalCount: 0,
        variableCount: 0,
        variables: [],
        uniqueVariableCount: 0,
      });
    });
  });

  describe('edge cases', () => {
    test('handles Unicode characters in pattern', () => {
      // Note: Emojis are multi-byte in UTF-16, so '😀X😀' is 5 chars (2+1+2)
      const tokens = PatternTemplateEngine.parsePatternToTokens('中X文');
      expect(tokens.length).toBe(3);
      expect(tokens[0]).toEqual({ type: 'literal', value: '中' });
      expect(tokens[1]).toEqual({ type: 'variable', name: 'X', value: 'X' });
      expect(tokens[2]).toEqual({ type: 'literal', value: '文' });
    });

    test('handles all 26 uppercase letters as variables', () => {
      const pattern = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const vars = PatternTemplateEngine.extractVariables(pattern);
      expect(vars.length).toBe(26);
    });

    test('handles Vietnamese diacritics in template', () => {
      const result = PatternTemplateEngine.applyPatternTemplate('những X này', {
        X: 'người',
      });
      expect(result).toBe('những người này');
    });

    test('handles special characters in variables', () => {
      const result = PatternTemplateEngine.applyPatternTemplate('X + Y = Z', {
        X: '1',
        Y: '2',
        Z: '3',
      });
      expect(result).toBe('1 + 2 = 3');
    });
  });

  describe('integration scenarios', () => {
    test('full workflow: parse, validate, apply', () => {
      const pattern = '这些X';
      const template = 'những X này';

      // Validate
      const validation = PatternTemplateEngine.validatePatternTemplate(pattern, template);
      expect(validation.valid).toBe(true);

      // Parse
      const tokens = PatternTemplateEngine.parsePatternToTokens(pattern);
      expect(tokens.length).toBe(3);

      // Apply
      const result = PatternTemplateEngine.applyPatternTemplate(template, { X: 'con mèo' });
      expect(result).toBe('những con mèo này');
    });

    test('detects mismatched pattern and template', () => {
      const pattern = '这些X';
      const template = 'những Y này'; // Wrong variable

      const validation = PatternTemplateEngine.validatePatternTemplate(pattern, template);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Template does not use pattern variables');
    });

    test('handles complex multi-variable pattern', () => {
      const pattern = 'X的Y和Z';
      const template = 'Y của X và Z';

      const validation = PatternTemplateEngine.validatePatternTemplate(pattern, template);
      expect(validation.valid).toBe(true);
      expect(validation.variables).toEqual(['X', 'Y', 'Z']);

      const result = PatternTemplateEngine.applyPatternTemplate(template, {
        X: 'tôi',
        Y: 'sách',
        Z: 'bút',
      });
      expect(result).toBe('sách của tôi và bút');
    });
  });
});
