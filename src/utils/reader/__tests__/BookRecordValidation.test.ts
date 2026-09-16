import { describe, expect, test } from 'vitest';
import { validateBookRecord, validateReadingPosition } from '../BookRecordValidation';

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

describe('validateBookRecord', () => {
  test('round-trips a well-formed record, taking fingerprint from the key not the body', () => {
    const raw = rawRecord({ fingerprint: 'wrong-should-be-ignored' });
    expect(validateBookRecord('fp1', raw)).toEqual({
      fingerprint: 'fp1',
      position: { line: 42, fraction: 0.25 },
      title: 'Novel',
      lastKnownPath: 'novel.txt',
      lineCount: 1000,
      encodingLabel: 'GBK',
      sizeBytes: 12345,
      modifiedMs: 1700000000000,
      available: true,
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
      title: '',
      lastKnownPath: 'novel.txt',
      lineCount: 0,
      encodingLabel: '',
      sizeBytes: 12345,
      modifiedMs: 1700000000000,
      available: true,
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
