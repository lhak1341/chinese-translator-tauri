import { describe, test, expect } from 'vitest';
import {
  validateWasmDictionaryMatch,
  isPatternMatchInBounds,
  areChunksInBounds,
} from '../wasm/WasmBoundaryValidation';

describe('validateWasmDictionaryMatch', () => {
  test('accepts valid match', () => {
    const result = validateWasmDictionaryMatch({ word: '手套', translation: 'găng tay' });
    expect(result.word).toBe('手套');
    expect(result.translation).toBe('găng tay');
  });

  test('infers length from word when not provided', () => {
    const result = validateWasmDictionaryMatch({ word: '手套', translation: 'x' });
    expect(result.length).toBe(2);
  });

  test('uses provided length over inferred', () => {
    const result = validateWasmDictionaryMatch({ word: '手套', translation: 'x', length: 5 });
    expect(result.length).toBe(5);
  });

  test('defaults dictionary to "unknown"', () => {
    const result = validateWasmDictionaryMatch({ word: '手套', translation: 'x' });
    expect(result.dictionary).toBe('unknown');
  });

  test('defaults priority to 0', () => {
    const result = validateWasmDictionaryMatch({ word: '手套', translation: 'x' });
    expect(result.priority).toBe(0);
  });

  test('converts undefined metadata to null', () => {
    const result = validateWasmDictionaryMatch({ word: '手套', translation: 'x' });
    expect(result.metadata).toBeNull();
  });

  test('throws when word is missing', () => {
    expect(() => validateWasmDictionaryMatch({ translation: 'x' })).toThrow('word');
  });

  test('throws when translation is missing', () => {
    expect(() => validateWasmDictionaryMatch({ word: '手套' })).toThrow('translation');
  });

  test('throws on non-object input', () => {
    expect(() => validateWasmDictionaryMatch(null)).toThrow('Invalid dictionary match');
  });
});

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
