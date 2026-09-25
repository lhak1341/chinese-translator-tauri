import { describe, test, expect } from 'vitest';
import {
  extractPatternVariables,
  checkVariableStructure,
  checkVariableSymmetry,
  validatePatternVariables,
} from '../dictionary/PatternEntryRules';

describe('extractPatternVariables', () => {
  test('extracts standalone X/Y/Z', () => {
    expect(extractPatternVariables('X给Y的Z')).toEqual(new Set(['X', 'Y', 'Z']));
  });

  test('ignores letters fused to a real word', () => {
    // "Yến" must not be read as variable Y.
    expect(extractPatternVariables('X họ Yến')).toEqual(new Set(['X']));
  });

  test('ignores non-X/Y/Z uppercase letters', () => {
    expect(extractPatternVariables('ABC')).toEqual(new Set());
  });

  test('returns empty set for a literal string', () => {
    expect(extractPatternVariables('没有变量')).toEqual(new Set());
  });
});

describe('checkVariableStructure', () => {
  test('accepts a 0-variable literal pattern', () => {
    expect(checkVariableStructure('没有变量')).toBeNull();
  });

  test('accepts X alone', () => {
    expect(checkVariableStructure('X的')).toBeNull();
  });

  test('accepts X, Y, Z introduced in order', () => {
    expect(checkVariableStructure('X给Y的Z')).toBeNull();
  });

  test('rejects Y without X', () => {
    expect(checkVariableStructure('是Y的')).toBe('Pattern cannot use variable Y without X');
  });

  test('rejects Z without Y', () => {
    expect(checkVariableStructure('X和Z')).toBe('Pattern cannot use variable Z without Y');
  });

  test('rejects a repeated X', () => {
    expect(checkVariableStructure('X给X')).toBe('Pattern cannot use variable X more than once');
  });

  test('rejects a repeated Y even when X is present', () => {
    expect(checkVariableStructure('X给Y和Y')).toBe('Pattern cannot use variable Y more than once');
  });

  test('accepts # alone and # with X', () => {
    expect(checkVariableStructure('第#层')).toBeNull();
    expect(checkVariableStructure('#大X之一')).toBeNull();
  });

  test('rejects a repeated #', () => {
    expect(checkVariableStructure('#到#倍')).toBe('Pattern cannot use variable # more than once');
  });
});

describe('checkVariableSymmetry', () => {
  test('accepts matching single variable', () => {
    expect(checkVariableSymmetry('X的书', 'sách của X')).toBeNull();
  });

  test('accepts matching multi-variable pattern', () => {
    expect(checkVariableSymmetry('X给Y的Z', 'Z của Y cho X')).toBeNull();
  });

  test('accepts a 0-variable pair', () => {
    expect(checkVariableSymmetry('的书', 'sách của')).toBeNull();
  });

  test('requires # in the translation when the source uses it', () => {
    expect(checkVariableSymmetry('#大X之一', 'một trong # đại X')).toBeNull();
    expect(checkVariableSymmetry('#大X之一', 'một trong đại X')).toBe(
      'Translation must use variable # from the pattern'
    );
  });

  test('rejects translation missing a source variable', () => {
    expect(checkVariableSymmetry('X给Y的书', 'sách của X')).toBe(
      'Translation must use variable Y from the pattern'
    );
  });

  test('rejects translation with an extra variable not in source', () => {
    expect(checkVariableSymmetry('X的书', 'sách của X và Y')).toBe(
      'Translation cannot use variable Y not present in source pattern'
    );
  });

  test('does not misread a Vietnamese proper noun as an extra variable', () => {
    expect(checkVariableSymmetry('燕姓X', 'X họ Yến')).toBeNull();
  });
});

describe('validatePatternVariables', () => {
  test('runs structure check only when translation is undefined', () => {
    expect(validatePatternVariables('是Y的')).toBe('Pattern cannot use variable Y without X');
    expect(validatePatternVariables('X的')).toBeNull();
  });

  test('runs structure check only when translation is blank', () => {
    expect(validatePatternVariables('X的', '')).toBeNull();
    expect(validatePatternVariables('X的', '   ')).toBeNull();
  });

  test('runs symmetry check once translation is non-blank', () => {
    expect(validatePatternVariables('X的', 'của người')).toBe(
      'Translation must use variable X from the pattern'
    );
  });

  test('structure error takes priority over symmetry error', () => {
    // Repeated X is a structure error; also happens to be symmetric with translation.
    expect(validatePatternVariables('X给X', 'X cho X')).toBe(
      'Pattern cannot use variable X more than once'
    );
  });

  test('accepts a fully valid multi-variable pattern', () => {
    expect(validatePatternVariables('X给Y的Z', 'Z của Y cho X')).toBeNull();
  });
});
