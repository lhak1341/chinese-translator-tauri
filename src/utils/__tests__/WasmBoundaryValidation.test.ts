import { describe, test, expect, vi } from 'vitest';
import {
  validateWasmToken,
  copyWasmTokens,
  validateWasmPatternMatch,
  validateWasmDictionaryMatch,
  validateRustLookupMatch,
  isMetadataSizeValid,
  MAX_WASM_METADATA_SIZE,
} from '../wasm/WasmBoundaryValidation';

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

// ─── validateWasmToken ───────────────────────────────────────────────────────

describe('validateWasmToken', () => {
  test('accepts valid token with translation', () => {
    const result = validateWasmToken({
      value: '我',
      translated: 'tôi',
      translationSource: 'characters',
    });
    expect(result.value).toBe('我');
    expect(result.translated).toBe('tôi');
    expect(result.translationSource).toBe('characters');
  });

  test('converts undefined translated to null (Rust Option::None)', () => {
    const result = validateWasmToken({ value: '好', translated: undefined });
    expect(result.translated).toBeNull();
  });

  test('converts undefined translationSource to null', () => {
    const result = validateWasmToken({
      value: '好',
      translated: null,
      translationSource: undefined,
    });
    expect(result.translationSource).toBeNull();
  });

  test('preserves null translated for consumed tokens', () => {
    const result = validateWasmToken({
      value: '好',
      translated: null,
      translationSource: 'characters_consumed',
    });
    expect(result.translated).toBeNull();
    expect(result.translationSource).toBe('characters_consumed');
  });

  test('throws on null token', () => {
    expect(() => validateWasmToken(null)).toThrow('Invalid token');
  });

  test('throws on string token', () => {
    expect(() => validateWasmToken('bad')).toThrow('Invalid token');
  });

  test('throws on number token', () => {
    expect(() => validateWasmToken(42)).toThrow('Invalid token');
  });

  test('throws when value is missing', () => {
    expect(() => validateWasmToken({ translated: null })).toThrow('Invalid token.value');
  });

  test('throws when value is a number', () => {
    expect(() => validateWasmToken({ value: 42, translated: null })).toThrow('Invalid token.value');
  });

  test('throws when value is null', () => {
    expect(() => validateWasmToken({ value: null, translated: null })).toThrow(
      'Invalid token.value'
    );
  });

  test('converts invalid translated type (number) to null', () => {
    const result = validateWasmToken({ value: '好', translated: 42, translationSource: null });
    expect(result.translated).toBeNull();
  });

  test('converts invalid translationSource type (number) to null', () => {
    const result = validateWasmToken({ value: '好', translated: null, translationSource: 99 });
    expect(result.translationSource).toBeNull();
  });

  test('preserves extra fields on the token', () => {
    const result = validateWasmToken({ value: '好', translated: 'tốt', type: 'chinese_char' });
    expect((result as Record<string, unknown>).type).toBe('chinese_char');
  });
});

// ─── copyWasmTokens ──────────────────────────────────────────────────────────

describe('copyWasmTokens', () => {
  // CRITICAL: param1 = JS destination (written in-place), param2 = WASM source (read-only)
  // Swapping causes silent data loss — see CLAUDE.md and the comment in WasmBoundaryValidation.ts

  test('writes WASM translations into JS tokens in-place', () => {
    const jsTokens = [
      { value: '我', translated: null as unknown, translationSource: null as unknown },
      { value: '好', translated: null as unknown, translationSource: null as unknown },
    ];
    const wasmTokens = [
      { value: '我', translated: 'tôi', translationSource: 'characters' },
      { value: '好', translated: 'tốt', translationSource: 'characters' },
    ];

    const result = copyWasmTokens(jsTokens, wasmTokens);

    expect(result).toBe(jsTokens); // same array reference — in-place
    expect(jsTokens[0].translated).toBe('tôi');
    expect(jsTokens[1].translated).toBe('tốt');
  });

  test('param1 is destination: jsTokens is modified, wasmTokens is not', () => {
    const jsTokens = [
      { value: '好', translated: null as unknown, translationSource: null as unknown },
    ];
    const wasmTokens = [{ value: '好', translated: 'output', translationSource: 'characters' }];

    copyWasmTokens(jsTokens, wasmTokens);

    expect(jsTokens[0].translated).toBe('output'); // dest written
    expect(wasmTokens[0].translated).toBe('output'); // src unchanged
  });

  test('undefined in WASM source converts to null in destination', () => {
    const jsTokens = [
      { value: '好', translated: 'old' as unknown, translationSource: 'old' as unknown },
    ];
    const wasmTokens = [{ value: '好', translated: undefined, translationSource: undefined }];

    copyWasmTokens(jsTokens, wasmTokens as unknown as { value: string }[]);

    expect(jsTokens[0].translated).toBeNull();
    expect(jsTokens[0].translationSource).toBeNull();
  });

  test('preserves JS-only fields not present in WASM tokens', () => {
    const jsTokens = [
      {
        value: '好',
        translated: null as unknown,
        translationSource: null as unknown,
        customField: 'keep',
      },
    ];
    const wasmTokens = [{ value: '好', translated: 'tốt', translationSource: 'characters' }];

    copyWasmTokens(jsTokens, wasmTokens);

    expect((jsTokens[0] as Record<string, unknown>).customField).toBe('keep');
  });

  test('throws on length mismatch', () => {
    const jsTokens = [{ value: 'A', translated: null }];
    const wasmTokens = [
      { value: 'A', translated: 'x' },
      { value: 'B', translated: 'y' },
    ];
    expect(() => copyWasmTokens(jsTokens, wasmTokens)).toThrow('length mismatch');
  });

  test('throws when jsTokens is not an array', () => {
    expect(() => copyWasmTokens(null as unknown as [], [])).toThrow(
      'JS destination tokens must be an array'
    );
  });

  test('throws when wasmTokens is not an array', () => {
    expect(() => copyWasmTokens([], null as unknown as [])).toThrow('WASM tokens must be an array');
  });

  // Two-phase validation: validate ALL before modifying ANY
  test('two-phase: does not partially modify jsTokens when a later wasmToken is invalid', () => {
    const jsTokens = [
      { value: 'A', translated: null as unknown, translationSource: null as unknown },
      { value: 'B', translated: null as unknown, translationSource: null as unknown },
    ];
    const wasmTokens: unknown[] = [
      { value: 'A', translated: 'ok' },
      null, // invalid — triggers Phase 1 failure
    ];

    expect(() => copyWasmTokens(jsTokens, wasmTokens as [])).toThrow(
      'Token validation failed at index 1'
    );
    // Phase 1 must fail before Phase 2 writes anything
    expect(jsTokens[0].translated).toBeNull();
    expect(jsTokens[1].translated).toBeNull();
  });

  test('handles empty arrays', () => {
    const result = copyWasmTokens([], []);
    expect(result).toEqual([]);
  });
});

// ─── validateWasmPatternMatch ─────────────────────────────────────────────────

describe('validateWasmPatternMatch', () => {
  const base = { originalText: '我的书', translation: 'sách của tôi', startIndex: 0, endIndex: 2 };

  test('accepts valid match', () => {
    const result = validateWasmPatternMatch(base);
    expect(result.originalText).toBe('我的书');
    expect(result.source).toBe('pattern');
  });

  test('converts undefined pattern and variables to null', () => {
    const result = validateWasmPatternMatch(base);
    expect(result.pattern).toBeNull();
    expect(result.variables).toBeNull();
  });

  test('preserves explicit translationSource', () => {
    const result = validateWasmPatternMatch({ ...base, translationSource: 'hierarchical_pattern' });
    expect(result.translationSource).toBe('hierarchical_pattern');
  });

  test('throws when originalText is missing', () => {
    const { originalText: _, ...rest } = base;
    expect(() => validateWasmPatternMatch(rest)).toThrow('originalText');
  });

  test('throws when translation is missing', () => {
    const { translation: _, ...rest } = base;
    expect(() => validateWasmPatternMatch(rest)).toThrow('translation');
  });

  test('throws when startIndex is missing', () => {
    const { startIndex: _, ...rest } = base;
    expect(() => validateWasmPatternMatch(rest)).toThrow('startIndex');
  });

  test('throws when endIndex is missing', () => {
    const { endIndex: _, ...rest } = base;
    expect(() => validateWasmPatternMatch(rest)).toThrow('endIndex');
  });

  test('throws on non-object input', () => {
    expect(() => validateWasmPatternMatch(null)).toThrow('Invalid pattern match');
    expect(() => validateWasmPatternMatch('bad')).toThrow('Invalid pattern match');
  });
});

// ─── validateWasmDictionaryMatch ──────────────────────────────────────────────

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

// ─── validateRustLookupMatch ──────────────────────────────────────────────────

describe('validateRustLookupMatch', () => {
  test('accepts valid match', () => {
    const result = validateRustLookupMatch({ character: '我', translation: 'tôi' });
    expect(result.character).toBe('我');
    expect(result.translation).toBe('tôi');
    expect(result.dictionary).toBe('characters');
  });

  test('infers length from character', () => {
    const result = validateRustLookupMatch({ character: '手套', translation: 'x' });
    expect(result.length).toBe(2);
  });

  test('converts undefined metadata to null', () => {
    const result = validateRustLookupMatch({ character: '我', translation: 'x' });
    expect(result.metadata).toBeNull();
  });

  test('throws when character is missing', () => {
    expect(() => validateRustLookupMatch({ translation: 'x' })).toThrow('character');
  });

  test('throws when translation is missing', () => {
    expect(() => validateRustLookupMatch({ character: '我' })).toThrow('translation');
  });

  test('throws on non-object input', () => {
    expect(() => validateRustLookupMatch(null)).toThrow('Invalid lookup match');
  });
});

// ─── isMetadataSizeValid ──────────────────────────────────────────────────────

describe('isMetadataSizeValid', () => {
  test('null returns true', () => {
    expect(isMetadataSizeValid(null)).toBe(true);
  });

  test('undefined returns true', () => {
    expect(isMetadataSizeValid(undefined)).toBe(true);
  });

  test('empty string returns true', () => {
    expect(isMetadataSizeValid('')).toBe(true);
  });

  test('string at exactly MAX_WASM_METADATA_SIZE returns true', () => {
    expect(isMetadataSizeValid('x'.repeat(MAX_WASM_METADATA_SIZE))).toBe(true);
  });

  test('string one over limit returns false', () => {
    expect(isMetadataSizeValid('x'.repeat(MAX_WASM_METADATA_SIZE + 1))).toBe(false);
  });

  test('MAX_WASM_METADATA_SIZE is 10240', () => {
    expect(MAX_WASM_METADATA_SIZE).toBe(10240);
  });
});
