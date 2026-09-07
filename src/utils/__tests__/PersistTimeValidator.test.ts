import { describe, test, expect } from 'vitest';
import {
  MAX_ENTRY_LENGTH,
  baseValidation,
  validatePatternEntry,
  validatePersistEntry,
} from '../dictionary/PersistTimeValidator';

describe('baseValidation', () => {
  test('accepts a normal source/translation pair', () => {
    expect(baseValidation('你好', 'xin chào')).toBeNull();
  });

  test('rejects empty source', () => {
    expect(baseValidation('', 'xin chào')).toBe('Both source and translation are required');
  });

  test('rejects empty translation', () => {
    expect(baseValidation('你好', '')).toBe('Both source and translation are required');
  });

  test('rejects whitespace-only source', () => {
    expect(baseValidation('   ', 'xin chào')).toBe('Both source and translation are required');
  });

  test('rejects whitespace-only translation', () => {
    expect(baseValidation('你好', '   ')).toBe('Both source and translation are required');
  });

  test('accepts source at exactly MAX_ENTRY_LENGTH', () => {
    const source = 'a'.repeat(MAX_ENTRY_LENGTH);
    expect(baseValidation(source, 'ok')).toBeNull();
  });

  test('rejects source one character over MAX_ENTRY_LENGTH', () => {
    const source = 'a'.repeat(MAX_ENTRY_LENGTH + 1);
    expect(baseValidation(source, 'ok')).toBe(
      `Source too long (max ${MAX_ENTRY_LENGTH} characters)`
    );
  });

  test('accepts translation at exactly MAX_ENTRY_LENGTH', () => {
    const translation = 'a'.repeat(MAX_ENTRY_LENGTH);
    expect(baseValidation('ok', translation)).toBeNull();
  });

  test('rejects translation one character over MAX_ENTRY_LENGTH', () => {
    const translation = 'a'.repeat(MAX_ENTRY_LENGTH + 1);
    expect(baseValidation('ok', translation)).toBe(
      `Translation too long (max ${MAX_ENTRY_LENGTH} characters)`
    );
  });

  test('over-limit source is caught before an over-limit translation is even checked', () => {
    const tooLong = 'a'.repeat(MAX_ENTRY_LENGTH + 1);
    expect(baseValidation(tooLong, tooLong)).toBe(
      `Source too long (max ${MAX_ENTRY_LENGTH} characters)`
    );
  });
});

describe('validatePatternEntry', () => {
  test('accepts a symmetric single-variable pattern', () => {
    expect(validatePatternEntry('X的书', 'sách của X')).toBeNull();
  });

  test('accepts a symmetric multi-variable pattern', () => {
    expect(validatePatternEntry('X给Y的Z', 'Z của Y cho X')).toBeNull();
  });

  test('accepts a pattern with no variables at all (0-variable literal pattern)', () => {
    expect(validatePatternEntry('的书', 'sách của')).toBeNull();
  });

  test('accepts a Vietnamese proper noun containing a capital X/Y/Z letter in the translation', () => {
    // Regression: "Yến" must not be read as variable Y just because it
    // contains a capital letter.
    expect(validatePatternEntry('燕姓X', 'X họ Yến')).toBeNull();
  });

  test('rejects when translation omits a variable present in source', () => {
    expect(validatePatternEntry('X给Y的书', 'sách của X')).toBe(
      'Translation must use variable Y from the pattern'
    );
  });

  test('rejects when translation uses a variable not present in source', () => {
    expect(validatePatternEntry('X的书', 'sách của X và Y')).toBe(
      'Translation cannot use variable Y not present in source pattern'
    );
  });

  test('delegates to baseValidation for the length/empty check after symmetry passes', () => {
    // Filler must be Chinese (not lowercase Latin) so X stays a standalone
    // variable instead of reading as fused to a word — this fixture is
    // testing length overflow, not variable detection.
    const tooLong = 'X' + '测'.repeat(MAX_ENTRY_LENGTH + 1);
    expect(validatePatternEntry(tooLong, 'X')).toBe(
      `Source too long (max ${MAX_ENTRY_LENGTH} characters)`
    );
  });

  test('symmetry check runs before the baseValidation length check', () => {
    // Missing-variable error should fire even though translation is otherwise empty-ish —
    // proves ordering: symmetry check happens first, baseValidation second.
    // Set iterates in insertion order, so X (first match in source) is reported first.
    const result = validatePatternEntry('X给Y的书', '');
    expect(result).toBe('Translation must use variable X from the pattern');
  });
});

describe('validatePersistEntry', () => {
  test('properNouns dictionary dispatches to baseValidation', () => {
    expect(validatePersistEntry('properNouns', '', 'ok')).toBe(
      'Both source and translation are required'
    );
  });

  test('properNouns-prefixed fiction dictionary also dispatches to baseValidation', () => {
    expect(validatePersistEntry('properNouns-f_Novel', '', 'ok')).toBe(
      'Both source and translation are required'
    );
  });

  test('properNouns dictionary does NOT apply pattern symmetry rules', () => {
    // A proper noun entry has no X/Y/Z requirement — must pass through baseValidation only.
    expect(validatePersistEntry('properNouns', '孔子', 'Khổng Tử')).toBeNull();
  });

  test('patterns-prefixed fiction dictionary dispatches to validatePatternEntry', () => {
    expect(validatePersistEntry('patterns-f_Novel', 'X给Y的书', 'sách của X')).toBe(
      'Translation must use variable Y from the pattern'
    );
  });

  test('bare "patterns" dictionaryId also dispatches to validatePatternEntry (via typeValidators, not the prefix branch)', () => {
    expect(validatePersistEntry('patterns', 'X给Y的书', 'sách của X')).toBe(
      'Translation must use variable Y from the pattern'
    );
  });

  test('bare "patterns" and "patterns-f_X" reach the same validator for the same input', () => {
    const bare = validatePersistEntry('patterns', 'X的书', 'sách của X');
    const fiction = validatePersistEntry('patterns-f_Novel', 'X的书', 'sách của X');
    expect(bare).toBe(fiction);
    expect(bare).toBeNull();
  });

  test.each(['phrases', 'characters', 'punctuation', 'conversion'])(
    '%s dictionary dispatches to baseValidation',
    (dictionaryId) => {
      expect(validatePersistEntry(dictionaryId, '', 'ok')).toBe(
        'Both source and translation are required'
      );
      expect(validatePersistEntry(dictionaryId, '你好', 'xin chào')).toBeNull();
    }
  );

  test('unknown dictionaryId returns an error without validating content', () => {
    expect(validatePersistEntry('not-a-real-dictionary', '你好', 'xin chào')).toBe(
      'Invalid dictionary type'
    );
  });

  test('empty-string dictionaryId returns an error', () => {
    expect(validatePersistEntry('', '你好', 'xin chào')).toBe('Invalid dictionary type');
  });
});
