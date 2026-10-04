/**
 * Number Processor Tests
 * Tests all 15 number conversion patterns for the JavaScript fallback
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NumberProcessor } from '../NumberProcessor.js';

describe('NumberProcessor', () => {
  let processor;
  let mockOptions;

  beforeEach(() => {
    processor = new NumberProcessor();
    mockOptions = {
      semanticArrayBuilder: {
        addUnit: () => {},
      },
    };
  });

  /**
   * Helper to create token array from Chinese text
   */
  function createTokens(text) {
    return text.split('').map((char) => ({
      type: 'chinese_char',
      value: char,
      translated: null,
      translationSource: null,
    }));
  }

  /**
   * Helper to extract translation results
   */
  function getTranslations(tokens) {
    return tokens.filter((t) => t.translated !== null).map((t) => t.translated);
  }

  describe('Simple Numbers', () => {
    it('converts tens + units: 三十五 → 35', () => {
      const tokens = createTokens('三十五');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['35']);
    });

    it('converts implicit tens: 十七 → 17', () => {
      const tokens = createTokens('十七');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['17']);
    });

    it('converts standalone tens: 三十 → 30', () => {
      const tokens = createTokens('三十');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['30']);
    });

    it('converts units: 五 → 5 (should not convert, phrase processor handles)', () => {
      const tokens = createTokens('五');
      processor.processTokens(tokens, mockOptions);
      // Single digit conversion depends on phrase processor
      expect(tokens[0].translated).toBe(null);
    });

    it('skips standalone 十 to allow phrase processing', () => {
      const tokens = createTokens('十');
      processor.processTokens(tokens, mockOptions);
      expect(tokens[0].translated).toBe(null);
    });
  });

  describe('Hundreds', () => {
    it('converts hundreds: 三百 → 300', () => {
      const tokens = createTokens('三百');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['300']);
    });

    it('converts hundreds + tens: 三百五十 → 350', () => {
      const tokens = createTokens('三百五十');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['350']);
    });

    it('converts hundreds + tens + units: 三百五十六 → 356', () => {
      const tokens = createTokens('三百五十六');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['356']);
    });

    it('converts hundreds with zero: 两百零六 → 206', () => {
      const tokens = createTokens('两百零六');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['206']);
    });

    it('converts hundreds with implicit tens: 三百十七 → 317', () => {
      const tokens = createTokens('三百十七');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['317']);
    });

    it('converts truncated short-form hundreds: 三百三 → 330 (implied 十, not 303)', () => {
      const tokens = createTokens('三百三');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['330']);
    });
  });

  describe('Thousands', () => {
    it('converts thousands: 三千 → 3,000', () => {
      const tokens = createTokens('三千');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['3,000']);
    });

    it('converts thousands + hundreds: 三千七百 → 3,700', () => {
      const tokens = createTokens('三千七百');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['3,700']);
    });

    it('converts complex thousands: 三千十五 → 3,015', () => {
      const tokens = createTokens('三千十五');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['3,015']);
    });

    it('converts thousands with zero pattern: 三千零二十 → 3,020', () => {
      const tokens = createTokens('三千零二十');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['3,020']);
    });

    it('converts thousands with zero+unit: 一千零六 → 1,006', () => {
      const tokens = createTokens('一千零六');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['1,006']);
    });

    it('converts truncated short-form thousands: 三千三 → 3,300 (implied 百, not 3,003)', () => {
      const tokens = createTokens('三千三');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['3,300']);
    });

    it('converts truncated short-form thousands with hundreds remainder: 三千二百三 → 3,230 (implied 十)', () => {
      const tokens = createTokens('三千二百三');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['3,230']);
    });

    it('BUG FIX: three-magnitude compound 三千二百十五 → 3,215 (previously silently dropped 十五, giving 3,200)', () => {
      // The thousands remainder ("二百十五") itself contains 百, so parseChineseNumber
      // recurses into its OWN hundreds block on that remainder. Before the fix,
      // parseChineseNumber's internal hundreds regex was an enumerated alternation
      // narrower than the top-level CONVERSION_PATTERNS 'hundreds' regex — it had no
      // bare-十-with-no-leading-digit branch, so "十五" inside the remainder silently
      // vanished. Fixed by matching wasm-core/number_processor.rs's `(.*)` catch-all
      // remainder shape, which was never susceptible to this gap.
      const tokens = createTokens('三千二百十五');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['3,215']);
    });

    it('converts thousand ten-thousand: 五千万 → 50,000,000', () => {
      const tokens = createTokens('五千万');
      processor.processTokens(tokens, mockOptions);
      // 五千万 = 5 × 1000 × 10000 = 50,000,000 (correct conversion)
      // Note: This is NOT "5,000 vạn" because 千万 together = 10 million
      expect(getTranslations(tokens)).toEqual(['50,000,000']);
    });
  });

  describe('parseChineseNumber internal regex matches wasm-core parity', () => {
    // These call parseChineseNumber directly (not through processTokens) to prove the
    // INTERNAL hundreds/thousands regex itself — not just the top-level CONVERSION_PATTERNS
    // regex — now handles a bare 十-with-no-leading-digit remainder, matching
    // wasm-core/number_processor.rs's `(.*)` catch-all shape.
    it('parses 一百十五 (bare 十 remainder, no leading digit) → 115', () => {
      expect(processor.parseChineseNumber('一百十五')).toBe(115);
    });

    it('parses 一千十五 (bare 十 remainder, no leading digit) → 1015', () => {
      expect(processor.parseChineseNumber('一千十五')).toBe(1015);
    });

    it('parses 一千零十五 (零十 remainder branch) → 1015', () => {
      expect(processor.parseChineseNumber('一千零十五')).toBe(1015);
    });
  });

  describe('Number Ranges', () => {
    it('converts tens range: 五六十 → 50-60', () => {
      const tokens = createTokens('五六十');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['50-60']);
    });

    it('converts teen range: 十六七 → 16-17', () => {
      const tokens = createTokens('十六七');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['16-17']);
    });

    it('converts tens-based range: 二十八九 → 28-29', () => {
      const tokens = createTokens('二十八九');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['28-29']);
    });

    it('BUG FIX: tens-based range rejects a descending pair instead of "28-23"', () => {
      // 二十八三 (tens=2, units 8 then 3) has no ascending-order guard before this fix —
      // every sibling *Range converter validates ascending order except this one did.
      expect(processor.convertTensBasedRange('二十八三', '二', '八', '三')).toBeNull();
    });

    it('converts hundreds range: 四五百 → 400-500', () => {
      const tokens = createTokens('四五百');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['400-500']);
    });

    it('converts hundreds + tens range: 一百五六十 → 150-160', () => {
      const tokens = createTokens('一百五六十');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['150-160']);
    });

    it('converts thousand range: 七八千 → 7-8 ngàn', () => {
      const tokens = createTokens('七八千');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['7-8 ngàn']);
    });

    it('converts ten-thousand range: 七八万 → 7-8 vạn', () => {
      const tokens = createTokens('七八万');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['7-8 vạn']);
    });

    it('validates logical ranges (consecutive or ascending)', () => {
      // Valid: consecutive
      const tokens1 = createTokens('五六十');
      processor.processTokens(tokens1, mockOptions);
      expect(getTranslations(tokens1)).toEqual(['50-60']);

      // Valid: ascending (non-consecutive is allowed)
      const tokens2 = createTokens('五八十');
      processor.processTokens(tokens2, mockOptions);
      expect(getTranslations(tokens2)).toEqual(['50-80']);

      // Invalid: descending (should not convert)
      const tokens3 = createTokens('八五十');
      processor.processTokens(tokens3, mockOptions);
      // Should not produce a range - falls back to character translation
      expect(tokens3[0].translated).toBe(null); // Will be handled by phrase/character processor
    });
  });

  describe('Percentages', () => {
    it('converts simple percentage: 百分之三十 → 30%', () => {
      const tokens = createTokens('百分之三十');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['30%']);
    });

    it('converts percentage with units: 百分之十五 → 15%', () => {
      const tokens = createTokens('百分之十五');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['15%']);
    });

    it('converts percentage range: 百分之五六十 → 50-60%', () => {
      const tokens = createTokens('百分之五六十');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['50-60%']);
    });

    it('converts large percentage: 百分之两百 → 200%', () => {
      const tokens = createTokens('百分之两百');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['200%']);
    });

    it('converts bare 百 (no leading digit): 百分之百 → 100%', () => {
      const tokens = createTokens('百分之百');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['100%']);
    });

    it('converts bare 百 with decimal: 百分之百点五 → 100.5%', () => {
      const tokens = createTokens('百分之百点五');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['100.5%']);
    });

    it('converts percentage with one decimal digit: 百分之九十九点九 → 99.9%', () => {
      const tokens = createTokens('百分之九十九点九');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['99.9%']);
    });

    it('converts percentage with two decimal digits: 百分之九十九点九九 → 99.99%', () => {
      const tokens = createTokens('百分之九十九点九九');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['99.99%']);
    });

    it('converts a decimal digit of 零: 百分之一百点零五 → 100.05%', () => {
      const tokens = createTokens('百分之一百点零五');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['100.05%']);
    });

    it('decimal percentage does not consume trailing 的: 百分之九十九点九的 → 99.9%, 的 untouched', () => {
      const tokens = createTokens('百分之九十九点九的');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['99.9%']);
      expect(tokens[tokens.length - 1].translated).toBeNull();
      expect(tokens[tokens.length - 1].translationSource).toBeNull();
    });
  });

  describe('Years', () => {
    it('converts four-digit year: 一九四五年 → năm 1945', () => {
      const tokens = createTokens('一九四五年');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['năm 1945']);
    });

    it('converts four-digit year with zeros: 二零二四年 → năm 2024', () => {
      const tokens = createTokens('二零二四年');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['năm 2024']);
    });
  });

  describe('Token Consumption Pattern', () => {
    it('marks first token with translation, subsequent tokens as consumed', () => {
      const tokens = createTokens('三十五');
      processor.processTokens(tokens, mockOptions);

      expect(tokens[0].translated).toBe('35');
      expect(tokens[0].translationSource).toBe('number_conversion');

      expect(tokens[1].translated).toBe(null);
      expect(tokens[1].translationSource).toBe('number_conversion_consumed');

      expect(tokens[2].translated).toBe(null);
      expect(tokens[2].translationSource).toBe('number_conversion_consumed');
    });

    it('maintains array length invariance', () => {
      const tokens = createTokens('三千七百五十五');
      const originalLength = tokens.length;
      processor.processTokens(tokens, mockOptions);
      expect(tokens.length).toBe(originalLength);
    });

    it('does not modify already-translated tokens', () => {
      const tokens = createTokens('三十五');
      tokens[1].translated = 'already-translated';
      tokens[1].translationSource = 'test';

      processor.processTokens(tokens, mockOptions);

      expect(tokens[1].translated).toBe('already-translated');
      expect(tokens[1].translationSource).toBe('test');
    });
  });

  describe('Longest Match Priority', () => {
    it('prefers longer matches over shorter ones', () => {
      const tokens = createTokens('三百五十');
      processor.processTokens(tokens, mockOptions);

      // Should match entire sequence, not just "三百" or "五十"
      expect(tokens[0].translated).toBe('350');
      expect(tokens[1].translationSource).toBe('number_conversion_consumed');
    });

    it('processes multiple numbers in sequence', () => {
      // Use year pattern + tens: "一九四五年" (năm 1945) + "三十" (30)
      // Year pattern ends with "年" so it won't conflict with following number
      const tokens = createTokens('一九四五年三十');
      processor.processTokens(tokens, mockOptions);

      // Should produce two separate numbers:
      // - "一九四五年" (năm 1945) from position 0-4
      // - "三十" (30) from position 5-6
      const translations = getTranslations(tokens);

      expect(translations).toEqual(['năm 1945', '30']);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty token array', () => {
      const tokens = [];
      expect(() => processor.processTokens(tokens, mockOptions)).not.toThrow();
    });

    it('handles non-Chinese characters gracefully', () => {
      const tokens = [
        { type: 'punctuation', value: '。', translated: null, translationSource: null },
      ];
      expect(() => processor.processTokens(tokens, mockOptions)).not.toThrow();
    });

    it('handles mixed content', () => {
      const tokens = [...createTokens('他'), ...createTokens('三十五'), ...createTokens('岁')];
      processor.processTokens(tokens, mockOptions);

      // Only the number should be converted
      expect(tokens[1].translated).toBe('35');
      expect(tokens[0].translated).toBe(null);
      expect(tokens[4].translated).toBe(null);
    });

    it('handles maximum token span (8 tokens)', () => {
      const tokens = createTokens('三千七百五十五');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['3,755']);
    });
  });

  describe('Comma Formatting', () => {
    it('formats thousands with commas', () => {
      const tokens = createTokens('三千');
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual(['3,000']);
    });

    it('formats large numbers correctly', () => {
      const tokens = createTokens('五千万');
      processor.processTokens(tokens, mockOptions);
      // 五千万 = 50 million (千万 together = 10 million)
      expect(getTranslations(tokens)).toEqual(['50,000,000']);
    });
  });
  describe('两 as tael unit after a number', () => {
    it.each([
      ['五百二十两', '520', 4],
      ['一千五百两', '1,500', 4],
      ['三千五百两', '3,500', 4],
      ['两千五百两', '2,500', 4],
    ])('%s converts the number and leaves 两 unconsumed', (text, expected, consumedEnd) => {
      const tokens = createTokens(text);
      processor.processTokens(tokens, mockOptions);
      expect(getTranslations(tokens)).toEqual([expected]);
      expect(tokens[consumedEnd].translationSource).toBeNull();
    });
  });
});
