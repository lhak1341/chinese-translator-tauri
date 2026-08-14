import { describe, expect, test } from 'vitest';
import { parseValidatedNumber, parseValidatedKey, extractHanChars } from '../RuleFieldValidation';

describe('parseValidatedNumber', () => {
  test('accepts a value equal to the minimum', () => {
    expect(parseValidatedNumber('0', 0)).toBe(0);
    expect(parseValidatedNumber('1', 1)).toBe(1);
  });

  test('accepts a value above the minimum', () => {
    expect(parseValidatedNumber('5', 0)).toBe(5);
  });

  test('rejects a value below the minimum', () => {
    expect(parseValidatedNumber('-1', 0)).toBeNull();
    expect(parseValidatedNumber('0', 1)).toBeNull();
  });

  test('rejects non-numeric input', () => {
    expect(parseValidatedNumber('abc', 0)).toBeNull();
  });

  test('empty string parses to 0 (Number(""))', () => {
    expect(parseValidatedNumber('', 0)).toBe(0);
    expect(parseValidatedNumber('', 1)).toBeNull();
  });

  test('accepts fractional values — integer-ness is not enforced', () => {
    expect(parseValidatedNumber('2.5', 0)).toBe(2.5);
  });

  test('rejects Infinity', () => {
    expect(parseValidatedNumber('Infinity', 0)).toBeNull();
  });
});

describe('parseValidatedKey', () => {
  test('accepts 1 to 4 Han characters', () => {
    expect(parseValidatedKey('城')).toBe('城');
    expect(parseValidatedKey('南京城')).toBe('南京城');
    expect(parseValidatedKey('紫禁城市')).toBe('紫禁城市');
  });

  test('trims surrounding whitespace before validating', () => {
    expect(parseValidatedKey('  城  ')).toBe('城');
  });

  test('rejects empty (or whitespace-only) input', () => {
    expect(parseValidatedKey('')).toBeNull();
    expect(parseValidatedKey('   ')).toBeNull();
  });

  test('rejects more than 4 characters', () => {
    expect(parseValidatedKey('紫禁城市区')).toBeNull();
  });

  test('rejects non-Han characters, including mixed-script input', () => {
    expect(parseValidatedKey('abc')).toBeNull();
    expect(parseValidatedKey('城a')).toBeNull();
  });

  test('accepts an astral-plane (surrogate-pair) CJK extension character', () => {
    // U+20000 (CJK Extension B) — a real Han codepoint outside the BMP.
    expect(parseValidatedKey('\u{20000}')).toBe('\u{20000}');
  });
});

describe('extractHanChars', () => {
  test('extracts Han characters found anywhere in the text, skipping others', () => {
    expect(extractHanChars('the city of 城市', 4)).toBe('城市');
  });

  test('stops once max characters are collected', () => {
    expect(extractHanChars('紫禁城市区', 4)).toBe('紫禁城市');
  });

  test('returns an empty string when no Han characters are present', () => {
    expect(extractHanChars('hello world', 4)).toBe('');
  });

  test('preserves surrogate pairs (astral-plane CJK) intact', () => {
    expect(extractHanChars('a\u{20000}b', 4)).toBe('\u{20000}');
  });
});
