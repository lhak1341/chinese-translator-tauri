import { describe, test, expect } from 'vitest';
import { isUnitHighlighted } from '../highlighting/UnitHighlightPredicate';

describe('isUnitHighlighted', () => {
  test('true when a single scalar value matches', () => {
    expect(isUnitHighlighted(5, 5)).toBe(true);
  });

  test('false when a single scalar value does not match', () => {
    expect(isUnitHighlighted(5, 4)).toBe(false);
  });

  test('null and undefined values are ignored', () => {
    expect(isUnitHighlighted(5, null)).toBe(false);
    expect(isUnitHighlighted(5, undefined)).toBe(false);
  });

  test('true when an array value contains unitIndex', () => {
    expect(isUnitHighlighted(5, [3, 5, 7])).toBe(true);
  });

  test('false when an array value does not contain unitIndex', () => {
    expect(isUnitHighlighted(5, [3, 4, 7])).toBe(false);
  });

  test('-1 is the cleared sentinel — never matches, even if unitIndex is -1', () => {
    expect(isUnitHighlighted(-1, -1)).toBe(false);
    expect(isUnitHighlighted(-1, [-1])).toBe(false);
  });

  test('two scalar args OR together (ClickableOriginalSemantic shape)', () => {
    expect(isUnitHighlighted(5, 5, null)).toBe(true);
    expect(isUnitHighlighted(5, null, 5)).toBe(true);
    expect(isUnitHighlighted(5, 4, 6)).toBe(false);
  });

  test('mixed scalar and array args', () => {
    expect(isUnitHighlighted(5, null, [1, 2, 5])).toBe(true);
    expect(isUnitHighlighted(5, 5, [1, 2])).toBe(true);
    expect(isUnitHighlighted(5, 4, [1, 2])).toBe(false);
  });

  test('no highlight values at all is false', () => {
    expect(isUnitHighlighted(5)).toBe(false);
  });

  test('empty array value never matches', () => {
    expect(isUnitHighlighted(5, [])).toBe(false);
  });
});
