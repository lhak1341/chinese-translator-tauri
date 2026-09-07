import { describe, it, expect } from 'vitest';
import {
  isCharacterSourceValid,
  isPatternValid,
  validateDictionaryEntry,
} from '../dictionary/DictionaryEntryValidator';

describe('isCharacterSourceValid', () => {
  it('accepts empty string', () => {
    expect(isCharacterSourceValid('')).toBe(true);
  });

  it('accepts single character', () => {
    expect(isCharacterSourceValid('我')).toBe(true);
  });

  it('accepts single character with surrounding whitespace', () => {
    expect(isCharacterSourceValid('  我  ')).toBe(true);
  });

  it('rejects two or more characters', () => {
    expect(isCharacterSourceValid('我你')).toBe(false);
  });

  it('rejects multi-char with whitespace', () => {
    expect(isCharacterSourceValid('  我你  ')).toBe(false);
  });
});

describe('isPatternValid', () => {
  it('accepts source with no X or Y (literal, no-variable pattern)', () => {
    expect(isPatternValid('là người')).toBe(true);
  });

  it('rejects source with Y but no X (Y-only is invalid)', () => {
    expect(isPatternValid('là Y người')).toBe(false);
  });

  it('rejects source with two X', () => {
    expect(isPatternValid('X và X')).toBe(false);
  });

  it('ignores translation for a 0-variable source, even if translation lacks X', () => {
    expect(isPatternValid('là người', 'this is a person')).toBe(true);
  });

  it('accepts source with exactly one X, no translation check', () => {
    expect(isPatternValid('X的')).toBe(true);
  });

  it('accepts a Vietnamese proper noun containing a capital X/Y letter in the translation', () => {
    // Regression: "Yến" must not be read as variable Y just because it
    // contains a capital letter.
    expect(isPatternValid('燕姓X', 'X họ Yến')).toBe(true);
  });

  it('rejects when the real Y variable is missing even though translation contains a proper noun with a stray capital Y', () => {
    // Without adjacency-aware detection, "Yến" would be misread as
    // satisfying the Y requirement, silently accepting a template missing
    // its actual Y placeholder.
    expect(isPatternValid('X给Y的', 'cho X và Yến')).toBe(false);
  });

  it('accepts source with one X and valid translation containing X', () => {
    expect(isPatternValid('X的', 'của X')).toBe(true);
  });

  it('rejects translation that lacks X', () => {
    expect(isPatternValid('X的', 'của người')).toBe(false);
  });

  it('accepts source with X and Y when translation has both', () => {
    expect(isPatternValid('X和Y', 'X và Y')).toBe(true);
  });

  it('rejects when source has Y but translation lacks Y', () => {
    expect(isPatternValid('X和Y', 'X và người')).toBe(false);
  });

  it('rejects translation with an extra variable not present in source', () => {
    // Full bidirectional symmetry: this used to pass under the old X/Y-only,
    // one-directional check.
    expect(isPatternValid('X的', 'của X và Y')).toBe(false);
  });

  it('accepts source with X, Y, and Z introduced in order', () => {
    expect(isPatternValid('X给Y的Z', 'Z của Y cho X')).toBe(true);
  });

  it('rejects source with Z but no Y (ordering: Z requires Y)', () => {
    expect(isPatternValid('X和Z', 'X và Z')).toBe(false);
  });

  it('rejects source with a repeated variable', () => {
    expect(isPatternValid('X给X')).toBe(false);
  });

  it('ignores translation when it is empty string', () => {
    expect(isPatternValid('X的', '')).toBe(true);
  });

  it('ignores translation when it is undefined', () => {
    expect(isPatternValid('X的', undefined)).toBe(true);
  });

  it('ignores translation when it is whitespace only', () => {
    expect(isPatternValid('X的', '   ')).toBe(true);
  });
});

describe('validateDictionaryEntry', () => {
  describe('empty fields', () => {
    it('rejects empty source', () => {
      const result = validateDictionaryEntry('', 'foo', 'phrases');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Both source and translation are required');
    });

    it('rejects empty translation', () => {
      const result = validateDictionaryEntry('foo', '', 'phrases');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Both source and translation are required');
    });

    it('rejects whitespace-only source', () => {
      const result = validateDictionaryEntry('   ', 'foo', 'characters');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Both source and translation are required');
    });
  });

  describe('characters mode', () => {
    it('accepts single character', () => {
      const result = validateDictionaryEntry('我', 'tôi', 'characters');
      expect(result).toEqual({ valid: true, error: null });
    });

    it('rejects multi-character source', () => {
      const result = validateDictionaryEntry('我你', 'chúng tôi', 'characters');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Character dictionary entries must be exactly 1 character long');
    });
  });

  describe('patterns mode', () => {
    it('accepts valid X pattern', () => {
      const result = validateDictionaryEntry('X的', 'của X', 'patterns');
      expect(result).toEqual({ valid: true, error: null });
    });

    it('accepts pattern with no X in source (0-variable literal pattern)', () => {
      const result = validateDictionaryEntry('là người', 'là người', 'patterns');
      expect(result).toEqual({ valid: true, error: null });
    });

    it('rejects pattern with Y but no X in source', () => {
      const result = validateDictionaryEntry('là Y người', 'là Y người', 'patterns');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Pattern entry invalid');
    });

    it('rejects pattern where translation lacks X', () => {
      const result = validateDictionaryEntry('X的', 'của người', 'patterns');
      expect(result.valid).toBe(false);
    });
  });

  describe('other modes (phrases, properNouns, generic)', () => {
    it('accepts any non-empty source/translation for phrases', () => {
      expect(validateDictionaryEntry('hello', 'xin chào', 'phrases')).toEqual({
        valid: true,
        error: null,
      });
    });

    it('accepts multi-char source for properNouns', () => {
      expect(validateDictionaryEntry('张三', 'Trương Tam', 'properNouns')).toEqual({
        valid: true,
        error: null,
      });
    });

    it('accepts multi-char source for custom properNoun dict', () => {
      expect(validateDictionaryEntry('张三', 'Trương Tam', 'properNouns-MyNovel')).toEqual({
        valid: true,
        error: null,
      });
    });
  });

  describe('error message format', () => {
    it('returns null error when valid', () => {
      expect(validateDictionaryEntry('我', 'tôi', 'characters').error).toBeNull();
    });

    it('pattern error message matches exact string expected by DictionaryEntry', () => {
      const result = validateDictionaryEntry('XX', 'XX', 'patterns');
      expect(result.error).toBe(
        'Pattern entry invalid — variables must be introduced in order (X, then Y, then Z), no repeats, and translation must use exactly the variables in the source'
      );
    });
  });
});
