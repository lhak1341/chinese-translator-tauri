/**
 * Text Normalization Helpers Tests
 *
 * Validates Vietnamese text NFC normalization utilities
 * CODE REVIEW FIX (2026-02-07): Tests for extracted normalization helpers
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeVietnameseText,
  normalizeVietnameseTexts,
  isNFC,
  getNormalizationStats,
} from '../text/TextNormalizationHelpers';

describe('TextNormalizationHelpers', () => {
  describe('normalizeVietnameseText', () => {
    it('should normalize NFD text to NFC', () => {
      // "màu" in NFD form (decomposed: m + a + combining grave + u)
      const nfd = 'ma\u0300u'; // NFD: 4 characters
      const normalized = normalizeVietnameseText(nfd);

      expect(normalized).toBe('màu'); // NFC: 3 characters
      expect(normalized!.length).toBe(3);
    });

    it('should preserve already-normalized NFC text', () => {
      const nfc = 'màu trắng'; // Already NFC
      const normalized = normalizeVietnameseText(nfc);

      expect(normalized).toBe(nfc);
      expect(normalized).toBe('màu trắng');
    });

    it('should handle null input', () => {
      const result = normalizeVietnameseText(null);
      expect(result).toBeNull();
    });

    it('should handle undefined input', () => {
      const result = normalizeVietnameseText(undefined);
      expect(result).toBeUndefined();
    });

    it('should handle empty string', () => {
      const result = normalizeVietnameseText('');
      expect(result).toBe('');
    });

    it('should normalize multiple Vietnamese diacritics', () => {
      // "Đỗ Thị Hà" - normalize to NFD first to get correct decomposition
      const nfc = 'Đỗ Thị Hà';
      const nfd = nfc.normalize('NFD'); // Properly decompose
      const normalized = normalizeVietnameseText(nfd);

      expect(normalized).toBe(nfc);
      expect(normalized!.length).toBe(9); // NFC form
    });

    it('should handle mixed Chinese and Vietnamese', () => {
      const nfc = '中国 màu trắng';
      const nfd = nfc.normalize('NFD'); // Properly decompose
      const normalized = normalizeVietnameseText(nfd);

      expect(normalized).toBe(nfc);
    });
  });

  describe('normalizeVietnameseTexts', () => {
    it('should normalize array of texts', () => {
      const nfc = ['màu', 'trắng', 'đỏ'];
      const texts = nfc.map((t) => t.normalize('NFD')); // Properly decompose
      const normalized = normalizeVietnameseTexts(texts);

      expect(normalized).toEqual(nfc);
    });

    it('should handle array with null/undefined values', () => {
      const nfc = ['màu', null, undefined, 'trắng'];
      const texts = nfc.map((t) => (t ? t.normalize('NFD') : t)); // Properly decompose
      const normalized = normalizeVietnameseTexts(texts);

      expect(normalized).toEqual(nfc);
    });

    it('should handle empty array', () => {
      const normalized = normalizeVietnameseTexts([]);
      expect(normalized).toEqual([]);
    });

    it('should preserve already-normalized texts', () => {
      const texts = ['màu', 'trắng', 'đỏ'];
      const normalized = normalizeVietnameseTexts(texts);

      expect(normalized).toEqual(texts);
    });
  });

  describe('isNFC', () => {
    it('should return true for NFC text', () => {
      expect(isNFC('màu trắng')).toBe(true);
      expect(isNFC('Đỗ Thị Hà')).toBe(true);
      expect(isNFC('中国')).toBe(true);
    });

    it('should return false for NFD text', () => {
      const nfd = 'ma\u0300u'; // NFD form
      expect(isNFC(nfd)).toBe(false);
    });

    it('should handle empty string', () => {
      expect(isNFC('')).toBe(true); // Empty string is trivially NFC
    });

    it('should handle ASCII text', () => {
      expect(isNFC('hello world')).toBe(true);
    });

    it('should detect partially decomposed text', () => {
      const partial = 'màu tra\u0301\u0323ng'; // First word NFC, second NFD
      expect(isNFC(partial)).toBe(false);
    });
  });

  describe('getNormalizationStats', () => {
    it('should report correct stats for NFD text', () => {
      const nfc = 'màu trắng';
      const nfd = nfc.normalize('NFD'); // Properly decompose
      const stats = getNormalizationStats(nfd);

      expect(stats.originalLength).toBeGreaterThan(9); // NFD length (depends on combining marks)
      expect(stats.normalizedLength).toBe(9); // NFC length
      expect(stats.changed).toBe(true);
      expect(stats.form).toBe('NFD');
    });

    it('should report correct stats for NFC text', () => {
      const nfc = 'màu trắng';
      const stats = getNormalizationStats(nfc);

      expect(stats.originalLength).toBe(9);
      expect(stats.normalizedLength).toBe(9);
      expect(stats.changed).toBe(false);
      expect(stats.form).toBe('NFC');
    });

    it('should handle empty string', () => {
      const stats = getNormalizationStats('');

      expect(stats.originalLength).toBe(0);
      expect(stats.normalizedLength).toBe(0);
      expect(stats.changed).toBe(false);
      expect(stats.form).toBe('NFC');
    });

    it('should handle ASCII text', () => {
      const stats = getNormalizationStats('hello');

      expect(stats.originalLength).toBe(5);
      expect(stats.normalizedLength).toBe(5);
      expect(stats.changed).toBe(false);
      expect(stats.form).toBe('NFC');
    });

    it('should handle Chinese text', () => {
      const stats = getNormalizationStats('中国');

      expect(stats.originalLength).toBe(2);
      expect(stats.normalizedLength).toBe(2);
      expect(stats.changed).toBe(false);
      expect(stats.form).toBe('NFC');
    });

    it('should detect length changes from normalization', () => {
      // Create a string with combining diacritics
      const text = 'cafe\u0301'; // café with combining acute
      const stats = getNormalizationStats(text);

      expect(stats.originalLength).toBe(5); // c+a+f+e+acute
      expect(stats.normalizedLength).toBe(4); // c+a+f+é
      expect(stats.changed).toBe(true);
    });
  });

  describe('Real-world Vietnamese text examples', () => {
    it('should handle common Vietnamese phrases', () => {
      const phrases = ['Xin chào', 'Cảm ơn', 'Tạm biệt', 'Không biết', 'Tôi là người Việt Nam'];

      phrases.forEach((phrase) => {
        const normalized = normalizeVietnameseText(phrase);
        expect(isNFC(normalized!)).toBe(true);
      });
    });

    it('should handle Vietnamese names', () => {
      const names = [
        'Nguyễn Văn An',
        'Trần Thị Bình',
        'Lê Hoàng Cường',
        'Phạm Minh Đức',
        'Đỗ Thị Hà',
      ];

      names.forEach((name) => {
        const normalized = normalizeVietnameseText(name);
        expect(isNFC(normalized!)).toBe(true);
      });
    });

    it('should handle mixed Vietnamese and Chinese', () => {
      const mixed = '在中国旅游 du lịch ở Trung Quốc';
      const normalized = normalizeVietnameseText(mixed);

      expect(isNFC(normalized!)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle strings with only diacritics', () => {
      const diacritics = '\u0300\u0301\u0303\u0309\u0323'; // Combining marks only
      const normalized = normalizeVietnameseText(diacritics);

      // Combining marks alone may reorder in NFC, just verify it completes
      expect(normalized).toBeDefined();
      expect(typeof normalized).toBe('string');
    });

    it('should handle emoji', () => {
      const emoji = 'Hello 👋 màu trắng 🎨';
      const normalized = normalizeVietnameseText(emoji);

      expect(isNFC(normalized!)).toBe(true);
      expect(normalized).toContain('👋');
      expect(normalized).toContain('🎨');
    });

    it('should handle very long text', () => {
      const longText = 'màu trắng '.repeat(1000);
      const normalized = normalizeVietnameseText(longText);

      expect(isNFC(normalized!)).toBe(true);
      expect(normalized!.length).toBe(longText.length); // Already NFC
    });

    it('should handle special characters', () => {
      const special = 'màu\n\t\r\ntrắng';
      const normalized = normalizeVietnameseText(special);

      expect(normalized).toBe('màu\n\t\r\ntrắng');
      expect(isNFC(normalized!)).toBe(true);
    });
  });

  describe('Performance characteristics', () => {
    it('should normalize large arrays efficiently', () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => `ma\u0300u ${i}`);
      const startTime = performance.now();
      const normalized = normalizeVietnameseTexts(largeArray);
      const duration = performance.now() - startTime;

      expect(normalized.length).toBe(10000);
      expect(duration).toBeLessThan(100); // Should complete in <100ms
    });

    it('should handle repeated normalization without performance degradation', () => {
      const nfc = 'màu trắng';
      const text = nfc.normalize('NFD'); // Properly decompose

      for (let i = 0; i < 100; i++) {
        const normalized = normalizeVietnameseText(text);
        expect(normalized).toBe(nfc);
      }
    });
  });
});
