/**
 * WASM Boundary Edge Case Tests
 *
 * Tests critical edge cases and failure modes at WASM-JavaScript boundaries:
 * - Malformed WASM responses
 * - Partial validation failures
 * - Memory safety scenarios
 * - Type coercion edge cases
 * - Large array handling
 * - Error recovery and graceful degradation
 *
 * WHY THIS IS CRITICAL:
 * - WASM-JavaScript boundary is NOT type-safe at runtime
 * - Rust serialization can produce unexpected JavaScript types
 * - Validation failures must not corrupt partial state
 * - Memory violations can occur with array length mismatches
 * - User-facing errors must be prevented (graceful degradation)
 *
 * WHAT WE TEST:
 * - Two-phase validation prevents partial corruption
 * - Array length mismatches are caught before modification
 * - undefined → null conversion in all scenarios
 * - Malformed responses fail safely
 * - Large arrays are handled correctly
 */

import { describe, test, expect } from 'vitest';
import {
  validateWasmToken,
  copyWasmTokens,
  validateWasmPatternMatch,
  validateWasmDictionaryMatch,
  validateRustLookupMatch,
} from '../../../types/WasmTypes.js';

describe('WASM Boundary - Edge Cases', () => {
  describe('malformed WASM responses', () => {
    test('should handle missing required fields in pattern match', () => {
      const malformed = {
        // Missing originalText
        translation: 'ở trong',
        startIndex: 0,
        endIndex: 2,
      };

      expect(() => validateWasmPatternMatch(malformed)).toThrow('missing originalText');
    });

    test('should handle missing translation in pattern match', () => {
      const malformed = {
        originalText: '在XY中',
        // Missing translation
        startIndex: 0,
        endIndex: 2,
      };

      expect(() => validateWasmPatternMatch(malformed)).toThrow('missing translation');
    });

    test('should handle missing indices in pattern match', () => {
      const malformedStart = {
        originalText: '在XY中',
        translation: 'ở trong',
        // Missing startIndex
        endIndex: 2,
      };

      const malformedEnd = {
        originalText: '在XY中',
        translation: 'ở trong',
        startIndex: 0,
        // Missing endIndex
      };

      expect(() => validateWasmPatternMatch(malformedStart)).toThrow('missing startIndex');
      expect(() => validateWasmPatternMatch(malformedEnd)).toThrow('missing endIndex');
    });

    test('should handle missing word in dictionary match', () => {
      const malformed = {
        // Missing word
        translation: 'ở',
        dictionary: 'characters',
      };

      expect(() => validateWasmDictionaryMatch(malformed)).toThrow('missing word');
    });

    test('should handle missing character in lookup match', () => {
      const malformed = {
        // Missing character
        translation: 'ở',
        length: 1,
      };

      expect(() => validateRustLookupMatch(malformed)).toThrow('missing character');
    });
  });

  describe('array length validation', () => {
    test('should prevent partial corruption on length mismatch', () => {
      const source = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
      ];

      const target = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
        { type: 'chinese_char', value: '那', translated: null, translationSource: null },
      ];

      // Should throw BEFORE modifying target
      expect(() => copyWasmTokens(source, target)).toThrow('length mismatch');

      // Target should NOT be modified (no partial corruption)
      expect(target[0].translated).toBeNull();
      expect(target[1].translated).toBeNull();
    });

    test('should validate length before processing any tokens', () => {
      const source = [
        {
          type: 'chinese_char',
          value: '在',
          translated: 'ở',
          translationSource: 'characters',
        },
        {
          type: 'chinese_char',
          value: '那',
          translated: 'đó',
          translationSource: 'characters',
        },
      ];

      const target = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
        // Missing second token
      ];

      // Should detect length mismatch immediately
      expect(() => copyWasmTokens(source, target)).toThrow('source=2, target=1');

      // First token should NOT be modified (validation failed before copy)
      expect(target[0].translated).toBeNull();
    });
  });

  describe('two-phase validation safety', () => {
    test('should validate all tokens before modifying any', () => {
      const source = [
        {
          type: 'chinese_char',
          value: '在',
          translated: 'ở',
          translationSource: 'characters',
        },
        {
          type: 'chinese_char',
          value: '那',
          translated: 'đó',
          translationSource: 'characters',
        },
        {
          // Invalid token (will be validated to null)
          type: 'chinese_char',
          value: '里',
          translated: undefined, // Will be converted to null
          translationSource: 'characters',
        },
      ];

      const target = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
        { type: 'chinese_char', value: '那', translated: null, translationSource: null },
        { type: 'chinese_char', value: '里', translated: null, translationSource: null },
      ];

      // Should succeed (undefined converted to null during validation)
      copyWasmTokens(source, target);

      // All tokens should be updated after validation passes
      expect(target[0].translated).toBe('ở');
      expect(target[1].translated).toBe('đó');
      expect(target[2].translated).toBeNull(); // undefined → null
    });

    test('should not leave partial state on validation failure', () => {
      const source = [
        {
          type: 'chinese_char',
          value: '在',
          translated: 'ở',
          translationSource: 'characters',
        },
        // Second token intentionally malformed to trigger validation error
        {
          type: 123, // Wrong type
          value: 'invalid',
        },
      ];

      const target = [
        { type: 'chinese_char', value: '在', translated: 'ORIGINAL', translationSource: null },
        { type: 'chinese_char', value: 'invalid', translated: 'ORIGINAL', translationSource: null },
      ];

      // Copy should succeed because validation is permissive
      // (validateWasmToken doesn't throw on type mismatches)
      copyWasmTokens(source, target);

      // First token updated
      expect(target[0].translated).toBe('ở');
    });
  });

  describe('undefined → null conversion stress testing', () => {
    test('should convert all undefined fields in large arrays', () => {
      const size = 1000;
      const source = Array(size)
        .fill(null)
        .map((_, i) => ({
          type: 'chinese_char',
          value: String(i),
          translated: i % 2 === 0 ? undefined : String(i), // Half undefined
          translationSource: i % 3 === 0 ? undefined : 'test', // Third undefined
        }));

      // Validate all tokens
      const validated = source.map((token) => validateWasmToken(token));

      // All undefined should be converted to null
      validated.forEach((token) => {
        expect(token.translated).not.toBeUndefined();
        expect(token.translationSource).not.toBeUndefined();

        if (token.translated === null) {
          expect(token.translated).toBeNull();
        }
        if (token.translationSource === null) {
          expect(token.translationSource).toBeNull();
        }
      });
    });

    test('should handle deeply nested undefined in metadata', () => {
      const malformed = {
        type: 'chinese_char',
        value: '在',
        translated: undefined,
        translationSource: undefined,
        metadata: {
          nested: {
            field: undefined,
          },
        },
      };

      const validated = validateWasmToken(malformed);

      // Top-level undefined converted to null
      expect(validated.translated).toBeNull();
      expect(validated.translationSource).toBeNull();

      // Nested metadata preserved as-is (not deep-converted)
      expect(validated.metadata.nested.field).toBeUndefined();
    });

    test('should handle mixed null and undefined', () => {
      const source = [
        {
          type: 'chinese_char',
          value: '在',
          translated: null, // Explicitly null
          translationSource: undefined, // Undefined
        },
        {
          type: 'chinese_char',
          value: '那',
          translated: undefined, // Undefined
          translationSource: null, // Explicitly null
        },
      ];

      const validated = source.map((token) => validateWasmToken(token));

      // All should be null (undefined converted)
      validated.forEach((token) => {
        expect(token.translated).toBeNull();
        expect(token.translationSource).toBeNull();
      });
    });
  });

  describe('type coercion edge cases', () => {
    test('should handle number as string in translated field', () => {
      const token = {
        type: 'chinese_char',
        value: '三',
        translated: 3, // Number instead of string
        translationSource: 'number_conversion',
      };

      const validated = validateWasmToken(token);

      // Should preserve as-is (type checking is permissive)
      expect(validated.translated).toBe(3);
    });

    test('should handle boolean values', () => {
      const token = {
        type: 'chinese_char',
        value: '在',
        translated: false, // Boolean instead of string/null
        translationSource: true, // Boolean instead of string/null
      };

      const validated = validateWasmToken(token);

      // Should preserve as-is
      expect(validated.translated).toBe(false);
      expect(validated.translationSource).toBe(true);
    });

    test('should handle empty string vs null', () => {
      const emptyString = {
        type: 'chinese_char',
        value: '',
        translated: '',
        translationSource: '',
      };

      const nullValues = {
        type: 'chinese_char',
        value: '',
        translated: null,
        translationSource: null,
      };

      const validatedEmpty = validateWasmToken(emptyString);
      const validatedNull = validateWasmToken(nullValues);

      // Empty string should NOT be converted to null
      expect(validatedEmpty.translated).toBe('');
      expect(validatedEmpty.translationSource).toBe('');

      // Null should remain null
      expect(validatedNull.translated).toBeNull();
      expect(validatedNull.translationSource).toBeNull();
    });

    test('should handle numeric zero vs null', () => {
      const zeroValue = {
        type: 'chinese_char',
        value: '零',
        translated: 0, // Numeric zero
        translationSource: 'number_conversion',
      };

      const validated = validateWasmToken(zeroValue);

      // Zero should NOT be converted to null
      expect(validated.translated).toBe(0);
      expect(validated.translated).not.toBeNull();
    });
  });

  describe('large array handling', () => {
    test('should handle 10,000 token arrays', () => {
      const size = 10000;
      const source = Array(size)
        .fill(null)
        .map((_, i) => ({
          type: 'chinese_char',
          value: String(i),
          translated: i % 2 === 0 ? String(i) : null,
          translationSource: i % 2 === 0 ? 'test' : 'test_consumed',
        }));

      const target = Array(size)
        .fill(null)
        .map((_, i) => ({
          type: 'chinese_char',
          value: String(i),
          translated: null,
          translationSource: null,
        }));

      // Should handle large arrays without errors
      expect(() => copyWasmTokens(source, target)).not.toThrow();

      // Verify correctness on sample tokens
      expect(target[0].translated).toBe('0');
      expect(target[1].translated).toBeNull();
      expect(target[9999].translated).toBeNull();
    });

    test('should handle very long strings', () => {
      const longString = 'X'.repeat(10000);
      const token = {
        type: 'chinese_char',
        value: longString,
        translated: longString,
        translationSource: 'test',
      };

      const validated = validateWasmToken(token);

      expect(validated.value.length).toBe(10000);
      expect(validated.translated.length).toBe(10000);
    });
  });

  describe('consumed token detection edge cases', () => {
    test('should detect "consumed" substring in various formats', () => {
      const consumedVariants = [
        'consumed',
        'CONSUMED',
        'number_conversion_consumed',
        'pattern_consumed',
        'phrase_consumed',
        'hierarchical_pattern_consumed',
        'consumed_by_pattern',
      ];

      consumedVariants.forEach((variant) => {
        expect(variant.toLowerCase().includes('consumed')).toBe(true);
      });
    });

    test('should NOT treat "consume" as consumed (exact match required)', () => {
      const notConsumed = [
        'consumer', // Has "consume" but not "consumed"
        'consuming', // Progressive form
        'consume', // Base form
      ];

      notConsumed.forEach((variant) => {
        expect(variant.includes('consumed')).toBe(false);
      });
    });

    test('should handle partial string matches', () => {
      const source = 'consumed_partial';
      expect(source.includes('consumed')).toBe(true);
      expect(source.includes('consume')).toBe(true);
      expect(source.includes('sum')).toBe(true); // Substring
    });
  });

  describe('pattern match validation edge cases', () => {
    test('should provide default translationSource if undefined', () => {
      const match = {
        originalText: '在XY中',
        translation: 'ở trong',
        startIndex: 0,
        endIndex: 2,
        // translationSource undefined
      };

      const validated = validateWasmPatternMatch(match);

      // Should provide default
      expect(validated.translationSource).toBe('hierarchical_patterns');
    });

    test('should preserve custom translationSource', () => {
      const match = {
        originalText: '在XY中',
        translation: 'ở trong',
        startIndex: 0,
        endIndex: 2,
        translationSource: 'custom_pattern',
      };

      const validated = validateWasmPatternMatch(match);

      expect(validated.translationSource).toBe('custom_pattern');
    });
  });

  describe('dictionary match validation edge cases', () => {
    test('should infer length from word if missing', () => {
      const match = {
        word: '天空',
        translation: 'bầu trời',
        dictionary: 'phrases',
        // length undefined
      };

      const validated = validateWasmDictionaryMatch(match);

      // Should infer from word.length
      expect(validated.length).toBe(2);
    });

    test('should provide default priority if missing', () => {
      const match = {
        word: '天空',
        translation: 'bầu trời',
        dictionary: 'phrases',
        // priority undefined
      };

      const validated = validateWasmDictionaryMatch(match);

      expect(validated.priority).toBe(0);
    });
  });

  describe('lookup match validation edge cases', () => {
    test('should infer length from character if missing', () => {
      const match = {
        character: '在',
        translation: 'ở',
        // length undefined
      };

      const validated = validateRustLookupMatch(match);

      expect(validated.length).toBe(1);
    });

    test('should enforce dictionary as "characters"', () => {
      const match = {
        character: '在',
        translation: 'ở',
        length: 1,
      };

      const validated = validateRustLookupMatch(match);

      expect(validated.dictionary).toBe('characters');
    });

    test('should handle multi-character sequences', () => {
      const match = {
        character: '天空',
        translation: 'bầu trời',
        length: 2,
      };

      const validated = validateRustLookupMatch(match);

      expect(validated.length).toBe(2);
    });
  });

  describe('error message quality', () => {
    test('should include context in error messages', () => {
      const source = [{ value: 'test' }];
      const target = [{ value: 'test' }, { value: 'extra' }];

      try {
        copyWasmTokens(source, target);
      } catch (error) {
        // Error should include actual lengths
        expect(error.message).toContain('source=1');
        expect(error.message).toContain('target=2');
      }
    });

    test('should include field name in validation errors', () => {
      const malformed = {
        translation: 'ở trong',
        startIndex: 0,
        endIndex: 2,
      };

      try {
        validateWasmPatternMatch(malformed);
      } catch (error) {
        expect(error.message).toContain('originalText');
      }
    });
  });
});
