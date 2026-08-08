import { describe, test, expect } from 'vitest';
import { validateWasmDictionaryMatch } from '../wasm/WasmBoundaryValidation';

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
