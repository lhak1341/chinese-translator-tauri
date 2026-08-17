import { describe, it, expect } from 'vitest';
import { compareByTokenIndex, resolveTokenIndex } from '../highlighting/TextPositionMapper';

describe('resolveTokenIndex', () => {
  it('passes through a valid non-negative tokenIndex', () => {
    expect(resolveTokenIndex(5)).toBe(5);
    expect(resolveTokenIndex(0)).toBe(0);
  });

  it.each([null, undefined, -1])('treats %s as missing, sorting last', (value) => {
    expect(resolveTokenIndex(value as number | null | undefined)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('compareByTokenIndex', () => {
  it('sorts ascending by tokenIndex', () => {
    expect(compareByTokenIndex(1, 5)).toBeLessThan(0);
    expect(compareByTokenIndex(5, 1)).toBeGreaterThan(0);
    expect(compareByTokenIndex(3, 3)).toBe(0);
  });

  it('sorts missing tokenIndex (null/undefined/-1) after any valid one', () => {
    expect(compareByTokenIndex(undefined, 0)).toBeGreaterThan(0);
    expect(compareByTokenIndex(0, undefined)).toBeLessThan(0);
    expect(compareByTokenIndex(-1, 0)).toBeGreaterThan(0);
  });

  it('treats two missing tokenIndex values as equal', () => {
    expect(compareByTokenIndex(undefined, null)).toBe(0);
  });
});
