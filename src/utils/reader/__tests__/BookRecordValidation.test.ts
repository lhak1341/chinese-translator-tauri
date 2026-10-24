import { describe, expect, test } from 'vitest';
import { validateBookRecord } from '../BookRecordValidation';

function rawRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    position: { line: 42, fraction: 0.25 },
    title: 'Novel',
    lastKnownPath: 'novel.txt',
    lineCount: 1000,
    encodingLabel: 'GBK',
    sizeBytes: 12345,
    modifiedMs: 1700000000000,
    available: true,
    ...overrides,
  };
}

// The field validators are not exported: each repair rule is exercised through the record,
// as the backend reaches it.
const field = (
  key: 'position' | 'binding' | 'manualChapterPattern' | 'chapterOutline' | 'dismissedCandidates',
  value: unknown
) => validateBookRecord('fp1', rawRecord({ [key]: value }))?.[key];
const validateReadingPosition = (v: unknown) => field('position', v);
const validateBookBinding = (v: unknown) => field('binding', v);
const validateManualChapterPattern = (v: unknown) => field('manualChapterPattern', v);
const validateChapterOutline = (v: unknown) => field('chapterOutline', v);
const validateDismissedCandidates = (v: unknown) => field('dismissedCandidates', v);

describe('validateReadingPosition', () => {
  test('accepts a well-formed position', () => {
    expect(validateReadingPosition({ line: 10, fraction: 0.5 })).toEqual({
      line: 10,
      fraction: 0.5,
    });
  });

  test('rejects a negative or non-integer line', () => {
    expect(validateReadingPosition({ line: -1, fraction: 0 })).toBeNull();
    expect(validateReadingPosition({ line: 1.5, fraction: 0 })).toBeNull();
  });

  test('rejects a negative or non-finite fraction', () => {
    expect(validateReadingPosition({ line: 0, fraction: -0.1 })).toBeNull();
    expect(validateReadingPosition({ line: 0, fraction: Infinity })).toBeNull();
  });

  test('rejects a fraction above 1', () => {
    expect(validateReadingPosition({ line: 0, fraction: 1.5 })).toBeNull();
    expect(validateReadingPosition({ line: 0, fraction: 1 })).toEqual({ line: 0, fraction: 1 });
  });

  test('rejects null and non-object input', () => {
    expect(validateReadingPosition(null)).toBeNull();
    expect(validateReadingPosition('nope')).toBeNull();
  });
});

describe('validateBookBinding', () => {
  test('accepts a bound fiction dictionary', () => {
    expect(validateBookBinding({ fictionDictionary: 'properNouns-f_TapDo' })).toEqual({
      fictionDictionary: 'properNouns-f_TapDo',
    });
  });

  test('accepts "no fiction dictionary" as the answer it is', () => {
    expect(validateBookBinding({ fictionDictionary: null })).toEqual({ fictionDictionary: null });
  });

  test('falls an absent binding back to "never answered", which re-offers the dialog', () => {
    expect(validateBookBinding(undefined)).toBeNull();
    expect(validateBookBinding(null)).toBeNull();
  });

  test('rejects a malformed binding rather than repairing it to "answered: none"', () => {
    // Repairing to { fictionDictionary: null } would silently assert an answer the
    // reader never gave, and would never ask again.
    expect(validateBookBinding({})).toBeNull();
    expect(validateBookBinding({ fictionDictionary: 42 })).toBeNull();
    expect(validateBookBinding('properNouns-f_TapDo')).toBeNull();
  });

  test('rejects a dictionary id outside the fiction namespace', () => {
    expect(validateBookBinding({ fictionDictionary: 'phrases' })).toBeNull();
    expect(validateBookBinding({ fictionDictionary: 'properNouns' })).toBeNull();
    expect(validateBookBinding({ fictionDictionary: '../escape' })).toBeNull();
  });
});

describe('validateDismissedCandidates', () => {
  test('keeps a well-formed list as it is', () => {
    expect(validateDismissedCandidates(['云梦泽', '滕青山'])).toEqual(['云梦泽', '滕青山']);
  });

  test('absent or not an array falls back to none dismissed', () => {
    expect(validateDismissedCandidates(undefined)).toEqual([]);
    expect(validateDismissedCandidates('滕青山')).toEqual([]);
    expect(validateDismissedCandidates(null)).toEqual([]);
  });

  test('drops non-strings and names outside 2-8 code points, one by one', () => {
    expect(
      validateDismissedCandidates([
        '滕青山',
        7,
        null,
        '滕', // 1 code point
        '一二三四五六七八九', // 9
        '一二三四五六七八', // 8: kept
        '𠀀𠀁', // 2 code points, 4 UTF-16 units: kept
      ])
    ).toEqual(['一二三四五六七八', '滕青山', '𠀀𠀁'].sort());
  });

  test('removes duplicates and sorts', () => {
    expect(validateDismissedCandidates(['云梦泽', '滕青山', '云梦泽'])).toEqual(
      ['云梦泽', '滕青山'].sort()
    );
  });
});

describe('validateBookRecord', () => {
  test('round-trips a well-formed record, taking fingerprint from the key not the body', () => {
    const raw = rawRecord({ fingerprint: 'wrong-should-be-ignored' });
    expect(validateBookRecord('fp1', raw)).toEqual({
      fingerprint: 'fp1',
      position: { line: 42, fraction: 0.25 },
      manualChapterPattern: null,
      binding: null,
      title: 'Novel',
      lastKnownPath: 'novel.txt',
      lineCount: 1000,
      encodingLabel: 'GBK',
      sizeBytes: 12345,
      modifiedMs: 1700000000000,
      available: true,
      chapterOutline: null,
      dismissedCandidates: [],
    });
  });

  test('drops the record entirely when the key (fingerprint) is empty', () => {
    expect(validateBookRecord('', rawRecord())).toBeNull();
  });

  test('repairs malformed cached fields to safe defaults rather than dropping the record', () => {
    const record = validateBookRecord(
      'fp1',
      rawRecord({ title: 42, lineCount: -1, encodingLabel: null, available: 'yes' })
    );
    expect(record).toEqual({
      fingerprint: 'fp1',
      position: { line: 42, fraction: 0.25 },
      manualChapterPattern: null,
      binding: null,
      title: '',
      lastKnownPath: 'novel.txt',
      lineCount: 0,
      encodingLabel: '',
      sizeBytes: 12345,
      modifiedMs: 1700000000000,
      available: true,
      chapterOutline: null,
      dismissedCandidates: [],
    });
  });

  test('falls back a malformed authoritative position to "not started" rather than dropping the record', () => {
    const record = validateBookRecord('fp1', rawRecord({ position: { line: -5 } }));
    expect(record).not.toBeNull();
    expect(record?.position).toBeNull();
    expect(record?.fingerprint).toBe('fp1');
  });

  test('a never-opened record (position: null) round-trips as not-started', () => {
    const record = validateBookRecord('fp1', rawRecord({ position: null }));
    expect(record?.position).toBeNull();
  });
});

describe('validateManualChapterPattern', () => {
  test('accepts every known pattern id', () => {
    for (const pattern of ['chapter', 'section', 'volume', 'hui', 'bareNumber']) {
      expect(validateManualChapterPattern(pattern)).toBe(pattern);
    }
  });

  test('falls back an unknown or malformed value to null', () => {
    expect(validateManualChapterPattern('not-a-pattern')).toBeNull();
    expect(validateManualChapterPattern(42)).toBeNull();
    expect(validateManualChapterPattern(undefined)).toBeNull();
  });

  test('null (no override) round-trips as null', () => {
    expect(validateManualChapterPattern(null)).toBeNull();
  });
});

describe('validateChapterOutline', () => {
  const wellFormed = {
    pattern: 'chapter',
    candidates: [
      { pattern: 'chapter', hitCount: 800, medianGap: 60, regularity: 1 },
      { pattern: 'volume', hitCount: 0, medianGap: null, regularity: null },
    ],
  };

  test('accepts a well-formed outline', () => {
    expect(validateChapterOutline(wellFormed)).toEqual(wellFormed);
  });

  test('accepts a null-pattern outline (nothing elected, candidates still recorded)', () => {
    const nothingElected = { pattern: null, candidates: wellFormed.candidates };
    expect(validateChapterOutline(nothingElected)).toEqual(nothingElected);
  });

  test('falls back malformed input to null', () => {
    expect(validateChapterOutline(null)).toBeNull();
    expect(validateChapterOutline('not-an-object')).toBeNull();
    expect(validateChapterOutline({ pattern: 'not-a-pattern', candidates: [] })).toBeNull();
    expect(validateChapterOutline({ pattern: 'chapter', candidates: 'not-an-array' })).toBeNull();
  });

  test('drops the whole outline when any one candidate is malformed', () => {
    const malformed = {
      pattern: 'chapter',
      candidates: [
        { pattern: 'chapter', hitCount: 800, medianGap: 60, regularity: 1 },
        { pattern: 'not-a-pattern', hitCount: 0, medianGap: null, regularity: null },
      ],
    };
    expect(validateChapterOutline(malformed)).toBeNull();
  });
});
