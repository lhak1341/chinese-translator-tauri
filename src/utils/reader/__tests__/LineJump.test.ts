import { describe, expect, test } from 'vitest';
import { parseLineJump } from '../LineJump';

describe('parseLineJump', () => {
  test('a 1-based line becomes its 0-based index', () => {
    expect(parseLineJump('1', 43_359)).toBe(0);
    expect(parseLineJump(' 3202 ', 43_359)).toBe(3201);
  });

  test('is clamped into the book', () => {
    expect(parseLineJump('0', 100)).toBe(0);
    expect(parseLineJump('999999', 100)).toBe(99);
  });

  test('accepts thousands separators and full-width digits', () => {
    expect(parseLineJump('12,345', 43_359)).toBe(12_344);
    const fullWidth = [0xff11, 0xff12, 0xff13].map((c) => String.fromCodePoint(c)).join('');
    expect(parseLineJump(fullWidth, 43_359)).toBe(122);
  });

  test('anything that is not a whole number jumps nowhere', () => {
    expect(parseLineJump('', 100)).toBeNull();
    expect(parseLineJump('abc', 100)).toBeNull();
    expect(parseLineJump('-5', 100)).toBeNull();
    expect(parseLineJump('5', 0)).toBeNull();
  });
});
