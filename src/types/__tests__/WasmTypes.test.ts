/**
 * Tests for WASM-JavaScript Type Boundary Contracts
 *
 * Tests critical type serialization handling at WASM boundaries:
 * - Rust Option::None → JavaScript undefined → null conversion
 * - Token modification patterns
 * - Consumed vs converted token handling
 *
 * WHY THIS IS CRITICAL:
 * - Rust `Option<String>` serializes to `undefined` (not `null`)
 * - If not converted, "undefined" appears as literal text in translations
 * - Post-processing relies on `translated: null` to skip consumed tokens
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { validateWasmToken, copyWasmTokens, type WasmToken } from '../../../types/WasmTypes.js';

describe('validateWasmToken', () => {
  describe('undefined → null conversion', () => {
    test('should convert undefined translated to null', () => {
      const token: any = {
        type: 'chinese_char',
        value: '在',
        translated: undefined, // Rust Option::None
        translationSource: 'number_conversion_consumed',
      };

      const validated = validateWasmToken(token);

      expect(validated.translated).toBeNull();
      expect(validated.translated).not.toBeUndefined();
    });

    test('should convert undefined translationSource to null', () => {
      const token: any = {
        type: 'chinese_char',
        value: '在',
        translated: '在',
        translationSource: undefined,
      };

      const validated = validateWasmToken(token);

      expect(validated.translationSource).toBeNull();
      expect(validated.translationSource).not.toBeUndefined();
    });

    test('should handle both fields undefined', () => {
      const token: any = {
        type: 'chinese_char',
        value: '在',
        translated: undefined,
        translationSource: undefined,
      };

      const validated = validateWasmToken(token);

      expect(validated.translated).toBeNull();
      expect(validated.translationSource).toBeNull();
    });

    test('should log warning when converting undefined translated', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const token: any = {
        type: 'chinese_char',
        value: '在',
        translated: undefined,
        translationSource: null,
      };

      validateWasmToken(token);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WASM token has undefined translated value')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('valid tokens', () => {
    test('should pass through valid consumed token', () => {
      const token: WasmToken = {
        type: 'chinese_char',
        value: '十',
        translated: null, // Explicitly null (consumed)
        translationSource: 'number_conversion_consumed',
      };

      const validated = validateWasmToken(token);

      expect(validated.translated).toBeNull();
      expect(validated.translationSource).toBe('number_conversion_consumed');
    });

    test('should pass through valid converted token', () => {
      const token: WasmToken = {
        type: 'chinese_char',
        value: '三十五',
        translated: '35',
        translationSource: 'number_conversion',
      };

      const validated = validateWasmToken(token);

      expect(validated.translated).toBe('35');
      expect(validated.translationSource).toBe('number_conversion');
    });

    test('should pass through untranslated token', () => {
      const token: WasmToken = {
        type: 'chinese_char',
        value: '在',
        translated: null,
        translationSource: null,
      };

      const validated = validateWasmToken(token);

      expect(validated.translated).toBeNull();
      expect(validated.translationSource).toBeNull();
    });
  });

  describe('edge cases', () => {
    test('should handle empty string as valid translation', () => {
      const token: WasmToken = {
        type: 'punctuation',
        value: '',
        translated: '',
        translationSource: 'punctuation',
      };

      const validated = validateWasmToken(token);

      expect(validated.translated).toBe('');
    });

    test('should preserve null values', () => {
      const token: WasmToken = {
        type: 'chinese_char',
        value: '在',
        translated: null,
        translationSource: null,
      };

      const validated = validateWasmToken(token);

      expect(validated.translated).toBeNull();
      expect(validated.translationSource).toBeNull();
    });

    test('should NOT mutate original token (returns new object)', () => {
      const token: any = {
        type: 'chinese_char',
        value: '在',
        translated: undefined,
        translationSource: undefined,
      };

      const validated = validateWasmToken(token);

      // Should be a different reference (new object)
      expect(validated).not.toBe(token);
      // Original should NOT be mutated
      expect(token.translated).toBeUndefined();
      expect(token.translationSource).toBeUndefined();
      // Validated should have null values
      expect(validated.translated).toBeNull();
      expect(validated.translationSource).toBeNull();
    });
  });
});

describe('copyWasmTokens', () => {
  describe('consumed tokens', () => {
    test('should set translated to null for consumed tokens', () => {
      const source: WasmToken[] = [
        {
          type: 'chinese_char',
          value: '三',
          translated: null,
          translationSource: 'number_conversion_consumed',
        },
      ];

      const target: any[] = [
        {
          type: 'chinese_char',
          value: '三',
          translated: undefined,
          translationSource: null,
        },
      ];

      copyWasmTokens(source, target);

      expect(target[0].translated).toBeNull();
      expect(target[0].translationSource).toBe('number_conversion_consumed');
    });

    test('should handle multiple consumed tokens', () => {
      const source: WasmToken[] = [
        {
          type: 'chinese_char',
          value: '三',
          translated: null,
          translationSource: 'number_conversion_consumed',
        },
        {
          type: 'chinese_char',
          value: '十',
          translated: null,
          translationSource: 'number_conversion_consumed',
        },
        {
          type: 'chinese_char',
          value: '五',
          translated: null,
          translationSource: 'number_conversion_consumed',
        },
      ];

      const target: any[] = [
        { type: 'chinese_char', value: '三', translated: undefined, translationSource: null },
        { type: 'chinese_char', value: '十', translated: undefined, translationSource: null },
        { type: 'chinese_char', value: '五', translated: undefined, translationSource: null },
      ];

      copyWasmTokens(source, target);

      target.forEach((token) => {
        expect(token.translated).toBeNull();
        expect(token.translationSource).toBe('number_conversion_consumed');
      });
    });
  });

  describe('converted tokens', () => {
    test('should copy translation for converted tokens', () => {
      const source: WasmToken[] = [
        {
          type: 'chinese_char',
          value: '三十五',
          translated: '35',
          translationSource: 'number_conversion',
        },
      ];

      const target: any[] = [
        {
          type: 'chinese_char',
          value: '三十五',
          translated: null,
          translationSource: null,
        },
      ];

      copyWasmTokens(source, target);

      expect(target[0].translated).toBe('35');
      expect(target[0].translationSource).toBe('number_conversion');
    });

    test('should handle complex number conversions', () => {
      const source: WasmToken[] = [
        {
          type: 'chinese_char',
          value: '一千',
          translated: '1,000',
          translationSource: 'number_conversion',
        },
        {
          type: 'chinese_char',
          value: '百分之五十',
          translated: '50%',
          translationSource: 'number_conversion',
        },
        {
          type: 'chinese_char',
          value: '第三',
          translated: 'thứ 3',
          translationSource: 'number_conversion',
        },
      ];

      const target: any[] = [
        { type: 'chinese_char', value: '一千', translated: null, translationSource: null },
        { type: 'chinese_char', value: '百分之五十', translated: null, translationSource: null },
        { type: 'chinese_char', value: '第三', translated: null, translationSource: null },
      ];

      copyWasmTokens(source, target);

      expect(target[0].translated).toBe('1,000');
      expect(target[1].translated).toBe('50%');
      expect(target[2].translated).toBe('thứ 3');
    });
  });

  describe('mixed tokens', () => {
    test('should handle mix of converted, consumed, and unmodified tokens', () => {
      const source: WasmToken[] = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null }, // Unmodified
        {
          type: 'chinese_char',
          value: '三',
          translated: null,
          translationSource: 'number_conversion_consumed',
        }, // Consumed
        {
          type: 'chinese_char',
          value: '十',
          translated: null,
          translationSource: 'number_conversion_consumed',
        }, // Consumed
        {
          type: 'chinese_char',
          value: '五',
          translated: '35',
          translationSource: 'number_conversion',
        }, // Converted
        { type: 'chinese_char', value: '人', translated: null, translationSource: null }, // Unmodified
      ];

      const target: any[] = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
        { type: 'chinese_char', value: '三', translated: null, translationSource: null },
        { type: 'chinese_char', value: '十', translated: null, translationSource: null },
        { type: 'chinese_char', value: '五', translated: null, translationSource: null },
        { type: 'chinese_char', value: '人', translated: null, translationSource: null },
      ];

      copyWasmTokens(source, target);

      // Unmodified
      expect(target[0].translationSource).toBeNull();

      // Consumed
      expect(target[1].translated).toBeNull();
      expect(target[1].translationSource).toBe('number_conversion_consumed');
      expect(target[2].translated).toBeNull();
      expect(target[2].translationSource).toBe('number_conversion_consumed');

      // Converted
      expect(target[3].translated).toBe('35');
      expect(target[3].translationSource).toBe('number_conversion');

      // Unmodified
      expect(target[4].translationSource).toBeNull();
    });
  });

  describe('undefined handling', () => {
    test('should convert WASM undefined to null via validateWasmToken', () => {
      const source: any[] = [
        {
          type: 'chinese_char',
          value: '在',
          translated: undefined, // Rust Option::None
          translationSource: 'consumed',
        },
      ];

      const target: any[] = [
        {
          type: 'chinese_char',
          value: '在',
          translated: '在',
          translationSource: null,
        },
      ];

      copyWasmTokens(source, target);

      // validateWasmToken should convert undefined → null
      expect(target[0].translated).toBeNull();
    });

    test('should not copy if translationSource is undefined or null after validation', () => {
      const source: any[] = [
        {
          type: 'chinese_char',
          value: '在',
          translated: '在',
          translationSource: undefined, // Converted to null by validateWasmToken
        },
      ];

      const target: any[] = [
        {
          type: 'chinese_char',
          value: '在',
          translated: null,
          translationSource: null,
        },
      ];

      copyWasmTokens(source, target);

      // Should not copy because translationSource is null after validation
      expect(target[0].translated).toBeNull(); // Unchanged
      expect(target[0].translationSource).toBeNull();
    });
  });

  describe('array length validation', () => {
    test('should throw error if array lengths mismatch', () => {
      const source: WasmToken[] = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
      ];

      const target: any[] = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
        { type: 'chinese_char', value: '那', translated: null, translationSource: null },
      ];

      expect(() => copyWasmTokens(source, target)).toThrow('Token array length mismatch');
    });

    test('should include actual lengths in error message', () => {
      const source: WasmToken[] = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
      ];

      const target: any[] = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
        { type: 'chinese_char', value: '那', translated: null, translationSource: null },
        { type: 'chinese_char', value: '些', translated: null, translationSource: null },
      ];

      expect(() => copyWasmTokens(source, target)).toThrow('source=1, target=3');
    });

    test('should accept equal length arrays', () => {
      const source: WasmToken[] = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
        { type: 'chinese_char', value: '那', translated: null, translationSource: null },
      ];

      const target: any[] = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null },
        { type: 'chinese_char', value: '那', translated: null, translationSource: null },
      ];

      expect(() => copyWasmTokens(source, target)).not.toThrow();
    });
  });

  describe('token modification patterns', () => {
    test('should only copy modified tokens (not all)', () => {
      const source: WasmToken[] = [
        { type: 'chinese_char', value: '在', translated: null, translationSource: null }, // Not modified
        {
          type: 'chinese_char',
          value: '三',
          translated: '3',
          translationSource: 'number_conversion',
        }, // Modified
      ];

      const target: any[] = [
        { type: 'chinese_char', value: '在', translated: '原文', translationSource: 'original' },
        { type: 'chinese_char', value: '三', translated: null, translationSource: null },
      ];

      copyWasmTokens(source, target);

      // First token should remain unchanged
      expect(target[0].translated).toBe('原文');
      expect(target[0].translationSource).toBe('original');

      // Second token should be updated
      expect(target[1].translated).toBe('3');
      expect(target[1].translationSource).toBe('number_conversion');
    });

    test('should preserve original token properties not touched by WASM', () => {
      const source: WasmToken[] = [
        {
          type: 'chinese_char',
          value: '三',
          translated: '3',
          translationSource: 'number_conversion',
        },
      ];

      const target: any[] = [
        {
          type: 'chinese_char',
          value: '三',
          translated: null,
          translationSource: null,
          start: 5, // Extra properties
          end: 6,
          isGrouped: false,
        },
      ];

      copyWasmTokens(source, target);

      // WASM properties updated
      expect(target[0].translated).toBe('3');
      expect(target[0].translationSource).toBe('number_conversion');

      // Original properties preserved
      expect(target[0].start).toBe(5);
      expect(target[0].end).toBe(6);
      expect(target[0].isGrouped).toBe(false);
    });
  });

  describe('consumed token detection', () => {
    test('should detect "consumed" in translationSource', () => {
      const consumedSources = [
        'number_conversion_consumed',
        'pattern_consumed',
        'phrase_consumed',
        'consumed',
      ];

      for (const sourceType of consumedSources) {
        const source: WasmToken[] = [
          { type: 'chinese_char', value: '在', translated: null, translationSource: sourceType },
        ];

        const target: any[] = [
          { type: 'chinese_char', value: '在', translated: 'original', translationSource: null },
        ];

        copyWasmTokens(source, target);

        expect(target[0].translated).toBeNull();
        expect(target[0].translationSource).toBe(sourceType);
      }
    });

    test('should not treat non-consumed tokens as consumed', () => {
      const nonConsumedSources = ['number_conversion', 'pattern', 'phrase', 'character'];

      for (const sourceType of nonConsumedSources) {
        const source: WasmToken[] = [
          { type: 'chinese_char', value: '在', translated: '翻译', translationSource: sourceType },
        ];

        const target: any[] = [
          { type: 'chinese_char', value: '在', translated: null, translationSource: null },
        ];

        copyWasmTokens(source, target);

        expect(target[0].translated).toBe('翻译');
        expect(target[0].translationSource).toBe(sourceType);
      }
    });
  });

  describe('edge cases', () => {
    test('should handle empty arrays', () => {
      const source: WasmToken[] = [];
      const target: any[] = [];

      expect(() => copyWasmTokens(source, target)).not.toThrow();
    });

    test('should handle large token arrays', () => {
      const size = 1000;
      const source: WasmToken[] = Array(size)
        .fill(null)
        .map((_, i) => ({
          type: 'chinese_char',
          value: String(i),
          translated: i % 2 === 0 ? String(i) : null,
          translationSource: i % 2 === 0 ? 'number_conversion' : 'number_conversion_consumed',
        }));

      const target: any[] = Array(size)
        .fill(null)
        .map((_, i) => ({
          type: 'chinese_char',
          value: String(i),
          translated: null,
          translationSource: null,
        }));

      copyWasmTokens(source, target);

      // Verify all tokens copied correctly
      for (let i = 0; i < size; i++) {
        if (i % 2 === 0) {
          expect(target[i].translated).toBe(String(i));
        } else {
          expect(target[i].translated).toBeNull();
        }
      }
    });

    test('should handle tokens with special characters', () => {
      const source: WasmToken[] = [
        {
          type: 'chinese_char',
          value: '😀',
          translated: '😁',
          translationSource: 'emoji_conversion',
        },
      ];

      const target: any[] = [
        { type: 'chinese_char', value: '😀', translated: null, translationSource: null },
      ];

      copyWasmTokens(source, target);

      expect(target[0].translated).toBe('😁');
    });
  });
});
