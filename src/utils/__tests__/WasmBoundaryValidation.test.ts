import { describe, test, expect } from 'vitest';
import { isPatternMatchInBounds, areChunksInBounds } from '../wasm/WasmBoundaryValidation';

describe('isPatternMatchInBounds', () => {
  test('accepts a result within bounds', () => {
    expect(isPatternMatchInBounds({ startIndex: 0, endIndex: 2 }, 5)).toBe(true);
    expect(isPatternMatchInBounds({ startIndex: 4, endIndex: 4 }, 5)).toBe(true);
  });

  test('rejects startIndex out of range', () => {
    expect(isPatternMatchInBounds({ startIndex: 5, endIndex: 5 }, 5)).toBe(false);
    expect(isPatternMatchInBounds({ startIndex: -1, endIndex: 0 }, 5)).toBe(false);
  });

  test('rejects endIndex before startIndex', () => {
    expect(isPatternMatchInBounds({ startIndex: 2, endIndex: 1 }, 5)).toBe(false);
  });

  test('rejects non-numeric or missing indices', () => {
    expect(isPatternMatchInBounds({ startIndex: '0', endIndex: 2 }, 5)).toBe(false);
    expect(isPatternMatchInBounds({ endIndex: 2 }, 5)).toBe(false);
  });

  test('rejects non-object input', () => {
    expect(isPatternMatchInBounds(null, 5)).toBe(false);
    expect(isPatternMatchInBounds('x', 5)).toBe(false);
  });
});

describe('areChunksInBounds', () => {
  test('accepts a well-formed chunk array', () => {
    expect(areChunksInBounds([{ startIndex: 0 }, { startIndex: 3 }, { startIndex: 3 }])).toBe(true);
  });

  test('accepts an empty array', () => {
    expect(areChunksInBounds([])).toBe(true);
  });

  test('rejects a negative startIndex', () => {
    expect(areChunksInBounds([{ startIndex: 0 }, { startIndex: -1 }])).toBe(false);
  });

  test('rejects out-of-order startIndex', () => {
    expect(areChunksInBounds([{ startIndex: 5 }, { startIndex: 2 }])).toBe(false);
  });

  test('rejects a non-numeric startIndex', () => {
    expect(areChunksInBounds([{ startIndex: '0' }])).toBe(false);
  });

  test('rejects non-array input', () => {
    expect(areChunksInBounds(null)).toBe(false);
    expect(areChunksInBounds({})).toBe(false);
  });
});
