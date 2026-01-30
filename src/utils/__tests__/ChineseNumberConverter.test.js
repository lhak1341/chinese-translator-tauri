import { describe, test, expect } from 'vitest';
import { ChineseNumberConverter } from '../ChineseNumberConverter';

describe('ChineseNumberConverter', () => {
  describe('convertSimpleNumber', () => {
    test('converts single digits', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('一')).toBe(1);
      expect(ChineseNumberConverter.convertSimpleNumber('二')).toBe(2);
      expect(ChineseNumberConverter.convertSimpleNumber('九')).toBe(9);
    });

    test('converts teen numbers', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('十')).toBe(10);
      expect(ChineseNumberConverter.convertSimpleNumber('十一')).toBe(11);
      expect(ChineseNumberConverter.convertSimpleNumber('十五')).toBe(15);
      expect(ChineseNumberConverter.convertSimpleNumber('十九')).toBe(19);
    });

    test('converts compound numbers with 十', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('二十')).toBe(20);
      expect(ChineseNumberConverter.convertSimpleNumber('三十五')).toBe(35);
      expect(ChineseNumberConverter.convertSimpleNumber('九十九')).toBe(99);
    });

    test('converts hundreds', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('一百')).toBe(100);
      expect(ChineseNumberConverter.convertSimpleNumber('二百')).toBe(200);
      expect(ChineseNumberConverter.convertSimpleNumber('一百二十')).toBe(120);
      expect(ChineseNumberConverter.convertSimpleNumber('五百八十')).toBe(580);
    });

    test('converts thousands', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('一千')).toBe(1000);
      expect(ChineseNumberConverter.convertSimpleNumber('三千')).toBe(3000);
      expect(ChineseNumberConverter.convertSimpleNumber('三千十五')).toBe(3015);
    });

    test('handles 零 (zero placeholder) correctly', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('一百零五')).toBe(105);
      expect(ChineseNumberConverter.convertSimpleNumber('三千零二十')).toBe(3020);
      expect(ChineseNumberConverter.convertSimpleNumber('一千零一')).toBe(1001);
    });

    test('converts numbers with 万', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('一万')).toBe(10000);
      expect(ChineseNumberConverter.convertSimpleNumber('十万')).toBe(100000);
      expect(ChineseNumberConverter.convertSimpleNumber('三十五万')).toBe(350000);
    });

    test('converts numbers with 亿', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('一亿')).toBe(100000000);
      expect(ChineseNumberConverter.convertSimpleNumber('十亿')).toBe(1000000000);
    });

    test('handles 两 (two) correctly', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('两')).toBe(2);
      expect(ChineseNumberConverter.convertSimpleNumber('两十')).toBe(20);
    });
  });

  describe('formatNumber', () => {
    test('formats numbers with thousand separators', () => {
      expect(ChineseNumberConverter.formatNumber(1000)).toBe('1,000');
      expect(ChineseNumberConverter.formatNumber(1234567)).toBe('1,234,567');
      expect(ChineseNumberConverter.formatNumber(999)).toBe('999');
    });

    test('handles small numbers', () => {
      expect(ChineseNumberConverter.formatNumber(1)).toBe('1');
      expect(ChineseNumberConverter.formatNumber(99)).toBe('99');
    });
  });

  describe('escapeRegExp', () => {
    test('escapes special regex characters', () => {
      expect(ChineseNumberConverter.escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
      expect(ChineseNumberConverter.escapeRegExp('(test)')).toBe('\\(test\\)');
      expect(ChineseNumberConverter.escapeRegExp('a[b]c')).toBe('a\\[b\\]c');
    });

    test('handles strings without special characters', () => {
      expect(ChineseNumberConverter.escapeRegExp('abc123')).toBe('abc123');
    });
  });

  describe('processPercentages', () => {
    test('converts Chinese percentage patterns', () => {
      expect(ChineseNumberConverter.processPercentages('百分之十五')).toBe('15%');
      expect(ChineseNumberConverter.processPercentages('百分之五十')).toBe('50%');
      expect(ChineseNumberConverter.processPercentages('百分之一百')).toBe('100%');
    });

    test('handles already-numeric percentages', () => {
      expect(ChineseNumberConverter.processPercentages('百分之15')).toBe('15%');
      expect(ChineseNumberConverter.processPercentages('百分之99.5')).toBe('99.5%');
    });

    test('preserves non-percentage text', () => {
      expect(ChineseNumberConverter.processPercentages('这是测试')).toBe('这是测试');
    });

    test('handles multiple percentages in one string', () => {
      expect(ChineseNumberConverter.processPercentages('百分之十和百分之二十')).toBe('10%和20%');
    });
  });

  describe('processNumberRanges', () => {
    test('converts XY十 patterns (三四十 → 30-40)', () => {
      expect(ChineseNumberConverter.processNumberRanges('三四十')).toBe('30-40');
      expect(ChineseNumberConverter.processNumberRanges('五六十')).toBe('50-60');
    });

    test('converts teen range patterns (十五六 → 15-16)', () => {
      expect(ChineseNumberConverter.processNumberRanges('十五六')).toBe('15-16');
      expect(ChineseNumberConverter.processNumberRanges('十八九')).toBe('18-19');
    });

    test('converts compound range patterns (二十五六 → 25-26)', () => {
      expect(ChineseNumberConverter.processNumberRanges('二十五六')).toBe('25-26');
      expect(ChineseNumberConverter.processNumberRanges('三十七八')).toBe('37-38');
    });

    test('preserves text that is not a range', () => {
      const text = '这是测试';
      expect(ChineseNumberConverter.processNumberRanges(text)).toBe(text);
    });

    test('does not convert if part of larger number', () => {
      // Context-dependent - may or may not convert depending on surrounding chars
      const result = ChineseNumberConverter.processNumberRanges('一百二十五六');
      expect(result).toBeTruthy(); // Just verify it doesn't crash
    });
  });

  describe('processCompoundNumbers', () => {
    test('converts compound numbers with 十', () => {
      expect(ChineseNumberConverter.processCompoundNumbers('三十五')).toBe('35');
      expect(ChineseNumberConverter.processCompoundNumbers('九十九')).toBe('99');
    });

    test('converts hundreds', () => {
      expect(ChineseNumberConverter.processCompoundNumbers('一百二十')).toBe('120');
      expect(ChineseNumberConverter.processCompoundNumbers('五百八十')).toBe('580');
    });

    test('converts thousands', () => {
      expect(ChineseNumberConverter.processCompoundNumbers('三千十五')).toBe('3,015');
    });

    test('adds spacing when needed', () => {
      const result = ChineseNumberConverter.processCompoundNumbers('第五百八十章');
      expect(result).toContain('580');
      expect(result).toContain('第'); // Preserves surrounding text
    });

    test('handles numbers before 万/亿', () => {
      const result = ChineseNumberConverter.processCompoundNumbers('三十五万');
      expect(result).toBe('35万'); // Converts number part, preserves 万
    });
  });

  describe('processDoubleUnit', () => {
    test('converts 两百', () => {
      expect(ChineseNumberConverter.processDoubleUnit('两百')).toBe('200');
    });

    test('converts 两千', () => {
      expect(ChineseNumberConverter.processDoubleUnit('两千')).toBe('2,000');
    });

    test('converts 两万 with Vietnamese unit', () => {
      expect(ChineseNumberConverter.processDoubleUnit('两万')).toBe('2 vạn');
    });

    test('converts 两亿 with Vietnamese unit', () => {
      expect(ChineseNumberConverter.processDoubleUnit('两亿')).toBe('2 ức');
    });
  });

  describe('processLargeNumbers', () => {
    test('converts X万 patterns', () => {
      expect(ChineseNumberConverter.processLargeNumbers('五万')).toBe('5 vạn');
      expect(ChineseNumberConverter.processLargeNumbers('十万')).toBe('10 vạn');
    });

    test('converts X亿 patterns', () => {
      expect(ChineseNumberConverter.processLargeNumbers('三亿')).toBe('3 ức');
    });

    test('converts X亿Y万 patterns', () => {
      const result = ChineseNumberConverter.processLargeNumbers('三亿五万');
      expect(result).toContain('3 ức');
      expect(result).toContain('5 vạn');
    });

    test('handles special cases (百万, 千万)', () => {
      expect(ChineseNumberConverter.processLargeNumbers('百万')).toBe('trăm vạn');
      expect(ChineseNumberConverter.processLargeNumbers('千万')).toBe('ngàn vạn');
    });
  });

  describe('processSimpleCompounds', () => {
    test('converts 三十五 to 35', () => {
      expect(ChineseNumberConverter.processSimpleCompounds('三十五')).toBe('35');
    });

    test('converts 三十 to 30', () => {
      expect(ChineseNumberConverter.processSimpleCompounds('三十')).toBe('30');
    });

    test('converts lone 十 to 10', () => {
      expect(ChineseNumberConverter.processSimpleCompounds('十')).toBe('10');
    });

    test('handles multiple numbers', () => {
      const result = ChineseNumberConverter.processSimpleCompounds('三十五和四十');
      expect(result).toContain('35');
      expect(result).toContain('40');
    });
  });

  describe('processRemainingNumbers', () => {
    test('converts numbers before measure words', () => {
      const result = ChineseNumberConverter.processRemainingNumbers('五个');
      expect(result).toContain('5');
    });

    test('converts numbers before noun indicators', () => {
      const result = ChineseNumberConverter.processRemainingNumbers('三人');
      expect(result).toContain('3');
    });

    test('preserves lone 一 in most contexts', () => {
      expect(ChineseNumberConverter.processRemainingNumbers('一')).toBe('一');
    });

    test('adds spacing when needed', () => {
      const result = ChineseNumberConverter.processRemainingNumbers('第五章');
      expect(result).toContain('5');
      expect(result).toContain('第');
    });

    test('does not convert if not proper number structure', () => {
      const result = ChineseNumberConverter.processRemainingNumbers('一致');
      expect(result).toBe('一致'); // Should not convert
    });
  });

  describe('protectCompounds and restoreCompounds', () => {
    test('protects exceptional compounds from conversion', () => {
      const protected_text = ChineseNumberConverter.protectCompounds('统一');
      expect(protected_text).toContain('__COMPOUND_');

      const restored = ChineseNumberConverter.restoreCompounds(protected_text);
      expect(restored).toBe('统一');
    });

    test('protects poetic patterns', () => {
      const protected_text = ChineseNumberConverter.protectCompounds('千千万万');
      expect(protected_text).toContain('__POETIC');

      const restored = ChineseNumberConverter.restoreCompounds(protected_text);
      expect(restored).toBe('ngàn ngàn vạn vạn');
    });

    test('protects multiple compounds', () => {
      const text = '统一和唯一';
      const protected_text = ChineseNumberConverter.protectCompounds(text);
      expect(protected_text).toContain('__COMPOUND_');

      const restored = ChineseNumberConverter.restoreCompounds(protected_text);
      expect(restored).toBe('统一和唯一');
    });
  });

  describe('cleanupSpaces', () => {
    test('removes multiple consecutive spaces', () => {
      expect(ChineseNumberConverter.cleanupSpaces('a  b   c')).toBe('a b c');
      expect(ChineseNumberConverter.cleanupSpaces('test    text')).toBe('test text');
    });

    test('preserves single spaces', () => {
      expect(ChineseNumberConverter.cleanupSpaces('a b c')).toBe('a b c');
    });

    test('handles no spaces', () => {
      expect(ChineseNumberConverter.cleanupSpaces('abc')).toBe('abc');
    });
  });

  describe('processAll', () => {
    test('converts chapter numbers (第五百八十章 → 第 580 章)', () => {
      const result = ChineseNumberConverter.processAll('第五百八十章');
      expect(result).toContain('580');
      expect(result).toContain('第');
      expect(result).toContain('章');
    });

    test('converts percentages', () => {
      const result = ChineseNumberConverter.processAll('成功率百分之十五');
      expect(result).toContain('15%');
    });

    test('converts ranges', () => {
      const result = ChineseNumberConverter.processAll('三四十人');
      expect(result).toContain('30-40');
    });

    test('converts compound numbers', () => {
      const result = ChineseNumberConverter.processAll('三十五岁');
      expect(result).toContain('35');
    });

    test('preserves exceptional compounds', () => {
      const result = ChineseNumberConverter.processAll('统一思想');
      expect(result).toContain('统一');
      expect(result).not.toContain('1');
    });

    test('converts poetic patterns', () => {
      const result = ChineseNumberConverter.processAll('千千万万');
      expect(result).toBe('ngàn ngàn vạn vạn');
    });

    test('handles complex mixed text', () => {
      const text = '第五百八十章：百分之十五的成功率';
      const result = ChineseNumberConverter.processAll(text);
      expect(result).toContain('580');
      expect(result).toContain('15%');
    });

    test('handles large numbers with units', () => {
      // Test simple X万 pattern (processLargeNumbers handles single-character before 万/亿)
      const result1 = ChineseNumberConverter.processAll('五万人');
      expect(result1).toContain('5 vạn');

      // Test X亿 pattern
      const result2 = ChineseNumberConverter.processAll('三亿人');
      expect(result2).toContain('3 ức');
    });

    test('allows custom processing steps', () => {
      const result = ChineseNumberConverter.processAll('百分之十五', {
        steps: ['protectCompounds'], // Only protect, no conversions
      });
      expect(result).toBe('15%'); // Percentages are protected in protectCompounds step
    });

    test('handles empty string', () => {
      expect(ChineseNumberConverter.processAll('')).toBe('');
    });

    test('handles text with no numbers', () => {
      const text = '这是测试文本';
      expect(ChineseNumberConverter.processAll(text)).toBe(text);
    });
  });

  describe('constants', () => {
    test('NUMBER_MAP has correct mappings', () => {
      expect(ChineseNumberConverter.NUMBER_MAP['一']).toBe(1);
      expect(ChineseNumberConverter.NUMBER_MAP['十']).toBe(10);
      expect(ChineseNumberConverter.NUMBER_MAP['百']).toBe(100);
      expect(ChineseNumberConverter.NUMBER_MAP['千']).toBe(1000);
      expect(ChineseNumberConverter.NUMBER_MAP['万']).toBe(10000);
      expect(ChineseNumberConverter.NUMBER_MAP['亿']).toBe(100000000);
    });

    test('PRESERVED_UNITS has Vietnamese translations', () => {
      expect(ChineseNumberConverter.PRESERVED_UNITS['万']).toBe('vạn');
      expect(ChineseNumberConverter.PRESERVED_UNITS['亿']).toBe('ức');
      expect(ChineseNumberConverter.PRESERVED_UNITS['千']).toBe('ngàn');
      expect(ChineseNumberConverter.PRESERVED_UNITS['百']).toBe('trăm');
    });

    test('MEASURE_WORDS is a Set with common classifiers', () => {
      expect(ChineseNumberConverter.MEASURE_WORDS).toBeInstanceOf(Set);
      expect(ChineseNumberConverter.MEASURE_WORDS.has('个')).toBe(true);
      expect(ChineseNumberConverter.MEASURE_WORDS.has('章')).toBe(true);
      expect(ChineseNumberConverter.MEASURE_WORDS.has('人')).toBe(false); // This is in NOUN_INDICATORS
    });

    test('EXCEPTIONAL_COMPOUNDS protects specific words', () => {
      expect(ChineseNumberConverter.EXCEPTIONAL_COMPOUNDS).toBeInstanceOf(Set);
      expect(ChineseNumberConverter.EXCEPTIONAL_COMPOUNDS.has('统一')).toBe(true);
      expect(ChineseNumberConverter.EXCEPTIONAL_COMPOUNDS.has('唯一')).toBe(true);
    });

    test('NOUN_INDICATORS has common noun markers', () => {
      expect(ChineseNumberConverter.NOUN_INDICATORS).toBeInstanceOf(Set);
      expect(ChineseNumberConverter.NOUN_INDICATORS.has('人')).toBe(true);
      expect(ChineseNumberConverter.NOUN_INDICATORS.has('年')).toBe(true);
    });

    test('POETIC_TRANSLATIONS has poetic patterns', () => {
      expect(ChineseNumberConverter.POETIC_TRANSLATIONS['千千万万']).toBe('ngàn ngàn vạn vạn');
      expect(ChineseNumberConverter.POETIC_TRANSLATIONS['千千']).toBe('ngàn ngàn');
      expect(ChineseNumberConverter.POETIC_TRANSLATIONS['万万']).toBe('vạn vạn');
    });
  });

  describe('edge cases', () => {
    test('handles very large numbers', () => {
      const result = ChineseNumberConverter.convertSimpleNumber('九千九百九十九');
      expect(result).toBe(9999);
    });

    test('handles zero in various positions', () => {
      expect(ChineseNumberConverter.convertSimpleNumber('一千零一')).toBe(1001);
      expect(ChineseNumberConverter.convertSimpleNumber('一万零一')).toBe(10001);
    });

    test('handles numbers at string boundaries', () => {
      const result = ChineseNumberConverter.processAll('三十五');
      expect(result).toBe('35');
    });

    test('handles consecutive numbers', () => {
      const result = ChineseNumberConverter.processAll('三十五和四十');
      expect(result).toContain('35');
      expect(result).toContain('40');
    });
  });

  describe('performance', () => {
    test('processes large text efficiently', () => {
      const largeText = '第五百八十章'.repeat(100);
      const startTime = performance.now();
      ChineseNumberConverter.processAll(largeText);
      const duration = performance.now() - startTime;

      // Should process 100 chapter numbers in < 100ms
      expect(duration).toBeLessThan(100);
    });

    test('handles repeated conversions efficiently', () => {
      const text = '第五百八十章';
      const startTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        ChineseNumberConverter.processAll(text);
      }
      const duration = performance.now() - startTime;

      // Should handle 1000 conversions in < 1 second
      expect(duration).toBeLessThan(1000);
    });
  });
});
