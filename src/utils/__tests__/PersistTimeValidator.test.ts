import { describe, test, expect } from 'vitest';
import {
  MAX_ENTRY_LENGTH,
  baseValidation,
  checkEntry,
  firstEntryError,
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

describe('checkEntry — pattern rule', () => {
  test('accepts a symmetric single-variable pattern', () => {
    expect(checkEntry('patterns', 'X的书', 'sách của X').pattern).toBeNull();
  });

  test('accepts a symmetric multi-variable pattern', () => {
    expect(checkEntry('patterns', 'X给Y的Z', 'Z của Y cho X').pattern).toBeNull();
  });

  test('accepts a pattern with no variables at all (0-variable literal pattern)', () => {
    expect(checkEntry('patterns', '的书', 'sách của').pattern).toBeNull();
  });

  test('accepts a Vietnamese proper noun containing a capital X/Y/Z letter in the translation', () => {
    // Regression: "Yến" must not be read as variable Y just because it
    // contains a capital letter.
    expect(checkEntry('patterns', '燕姓X', 'X họ Yến').pattern).toBeNull();
  });

  test('rejects when translation omits a variable present in source', () => {
    expect(checkEntry('patterns', 'X给Y的书', 'sách của X').pattern).toBe(
      'Translation must use variable Y from the pattern'
    );
  });

  test('rejects when translation uses a variable not present in source', () => {
    expect(checkEntry('patterns', 'X的书', 'sách của X và Y').pattern).toBe(
      'Translation cannot use variable Y not present in source pattern'
    );
  });

  test('a pattern with an empty or blank translation checks the source alone', () => {
    expect(checkEntry('patterns', 'X的', '').pattern).toBeNull();
    expect(checkEntry('patterns', 'X的', '   ').pattern).toBeNull();
    expect(checkEntry('patterns', 'X给X', '').pattern).toBe(
      'Pattern cannot use variable X more than once'
    );
  });

  test('rejects source with Y but no X (structural ordering, now shared with form-time)', () => {
    expect(checkEntry('patterns', '是Y的书', 'là Y').pattern).toBe(
      'Pattern cannot use variable Y without X'
    );
  });

  test('rejects source with Z but no Y (ordering: Z requires Y)', () => {
    expect(checkEntry('patterns', 'X和Z', 'X và Z').pattern).toBe(
      'Pattern cannot use variable Z without Y'
    );
  });

  test('rejects a source with a repeated variable ', () => {
    expect(checkEntry('patterns', 'X给X', 'X cho X').pattern).toBe(
      'Pattern cannot use variable X more than once'
    );
  });
});

describe('checkEntry — character rule', () => {
  test('a characters entry may be empty or one character, trimmed', () => {
    expect(checkEntry('characters', '', 'x').character).toBeNull();
    expect(checkEntry('characters', '我', 'tôi').character).toBeNull();
    expect(checkEntry('characters', '  我  ', 'tôi').character).toBeNull();
  });

  test('a characters entry of two characters fails, trimmed or not', () => {
    const message = 'Character dictionary entries must be exactly 1 character long';
    expect(checkEntry('characters', '我你', 'tôi').character).toBe(message);
    expect(checkEntry('characters', '  我你  ', 'tôi').character).toBe(message);
  });

  test('a supplementary-plane character counts as one', () => {
    expect(checkEntry('characters', '𠮷', 'ăn').character).toBeNull();
    expect(checkEntry('characters', '𠮷𠮷', 'ăn').character).not.toBeNull();
  });

  test('other dictionaries take multi-character sources', () => {
    expect(checkEntry('phrases', '我你', 'tôi bạn').character).toBeNull();
  });
});

describe('checkEntry — rules are independent', () => {
  test('the character rule reports even while the translation is still empty', () => {
    const check = checkEntry('characters', '我你', '');
    expect(check.character).not.toBeNull();
    expect(check.base).toBe('Both source and translation are required');
  });

  test('an unknown dictionary id fails the base rule', () => {
    expect(checkEntry('nope', '你好', 'xin chào').base).toBe('Invalid dictionary type');
  });
});

describe('firstEntryError', () => {
  test('base wins over character, character over pattern', () => {
    expect(firstEntryError({ base: 'b', character: 'c', pattern: 'p' })).toBe('b');
    expect(firstEntryError({ base: null, character: 'c', pattern: 'p' })).toBe('c');
    expect(firstEntryError({ base: null, character: null, pattern: 'p' })).toBe('p');
    expect(firstEntryError({ base: null, character: null, pattern: null })).toBeNull();
  });
});

describe('validatePersistEntry — the character rule holds on every write', () => {
  test('rejects a multi-character source for characters', () => {
    expect(validatePersistEntry('characters', '我你', 'tôi')).toBe(
      'Character dictionary entries must be exactly 1 character long'
    );
  });

  test('accepts a single character', () => {
    expect(validatePersistEntry('characters', '我', 'tôi')).toBeNull();
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

  test('patterns-prefixed fiction dictionary applies the pattern rule', () => {
    expect(validatePersistEntry('patterns-f_Novel', 'X给Y的书', 'sách của X')).toBe(
      'Translation must use variable Y from the pattern'
    );
  });

  test('bare "patterns" dictionaryId also applies the pattern rule', () => {
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
    '%s dictionary applies the base rule',
    (dictionaryId) => {
      expect(validatePersistEntry(dictionaryId, '', 'ok')).toBe(
        'Both source and translation are required'
      );
      // One character, so the characters dictionary's own rule passes too.
      expect(validatePersistEntry(dictionaryId, '你', 'bạn')).toBeNull();
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
