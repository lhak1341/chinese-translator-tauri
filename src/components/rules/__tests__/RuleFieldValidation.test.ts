import { describe, expect, test } from 'vitest';
import { parseValidatedNumber } from '../RuleFieldValidation';

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
