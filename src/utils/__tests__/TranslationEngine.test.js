/**
 * Comprehensive test suite for translation engine
 */

import { describe, test, expect, beforeEach } from 'vitest';

// Test data similar to actual dictionaries
const mockDictionaries = {
  characters: {
    你: 'bạn',
    好: 'tốt',
    谢: 'cảm',
    一: 'một',
    二: 'hai',
    三: 'ba',
  },
  phrases: {
    你好: 'xin chào',
    谢谢: 'cảm ơn',
    早上好: 'chào buổi sáng',
    我: { translation: 'tôi', allowAsPatternVariable: true },
    你: { translation: 'bạn', allowAsPatternVariable: true },
    他: { translation: 'anh ấy', allowAsPatternVariable: true },
  },
  patterns: {
    X的右手: 'tay phải của X',
    X的左手: 'tay trái của X',
    X的眼睛: 'mắt của X',
    在X上: 'trên X',
  },
  properNouns: {
    小明: 'Xiao Ming',
    张三: 'Zhang San',
    北京: 'Beijing',
  },
  conversion: {
    傳統: '传统',
    語言: '语言',
  },
  punctuation: {
    '。': '.',
    '，': ',',
    '？': '?',
  },
};

// Test cases covering various scenarios
export const testCases = {
  // Basic character translation
  characters: [
    { input: '你', expected: 'bạn' },
    { input: '好', expected: 'tốt' },
    { input: '一二三', expected: 'một hai ba' },
  ],

  // Phrase translation (should override character translation)
  phrases: [
    { input: '你好', expected: 'xin chào' },
    { input: '谢谢', expected: 'cảm ơn' },
    { input: '早上好朋友', expected: 'chào buổi sáng bạn' }, // Mixed phrase + character
  ],

  // Pattern matching with proper nouns
  patterns: [
    { input: '小明的右手', expected: 'tay phải của Xiao Ming' },
    { input: '张三的眼睛', expected: 'mắt của Zhang San' },
    { input: '在北京上', expected: 'trên Beijing' },
  ],

  // Mixed content with Latin characters
  mixed: [
    { input: 'Hello 你好', expected: 'Hello xin chào' },
    { input: '123 一二三', expected: '123 một hai ba' },
    { input: '小明 said 你好', expected: 'Xiao Ming said xin chào' },
  ],

  // Traditional to simplified conversion
  conversion: [
    { input: '傳統語言', expected: '传统语言' }, // Should convert before translation
  ],

  // Punctuation handling
  punctuation: [
    { input: '你好。', expected: 'xin chào.' },
    { input: '你好，朋友？', expected: 'xin chào, bạn?' },
  ],

  // Edge cases
  edge: [
    { input: '', expected: '' },
    { input: '   ', expected: '   ' }, // Preserve whitespace
    { input: 'English only', expected: 'English only' },
    { input: '你好你好', expected: 'xin chào xin chào' }, // Repeated phrases
    { input: '小明的右手和左手', expected: 'tay phải của Xiao Ming và tay trái' }, // Multiple patterns
  ],

  // Performance test cases (longer texts)
  performance: [
    {
      input: '小明的朋友张三在北京的大学里学习，他每天都很努力。',
      description: 'Long sentence with multiple proper nouns and patterns',
    },
    {
      input: '你好'.repeat(100),
      description: 'Repeated phrases (stress test)',
    },
    {
      input:
        '这是一个包含很多字符的长句子，用来测试翻译系统的性能。' +
        '一二三四五六七八九十'.repeat(10),
      description: 'Mixed long content',
    },
  ],
};

// Mock translation functions for testing
class MockTranslationEngine {
  constructor(dictionaries) {
    this.dictionaries = dictionaries;
  }

  // Simple mock implementation for testing
  async translate(text) {
    let result = text;

    // Convert traditional to simplified
    if (this.dictionaries.conversion) {
      Object.entries(this.dictionaries.conversion).forEach(([trad, simp]) => {
        result = result.replace(new RegExp(trad, 'g'), simp);
      });
    }

    // Apply patterns (simple implementation)
    if (this.dictionaries.patterns && this.dictionaries.properNouns) {
      Object.entries(this.dictionaries.patterns).forEach(([pattern, template]) => {
        if (pattern.includes('X的')) {
          const [_, suffix] = pattern.split('的');
          Object.entries(this.dictionaries.properNouns).forEach(([noun, translation]) => {
            const regex = new RegExp(`${noun}的${suffix}`, 'g');
            const replacement = template.replace('X', translation);
            result = result.replace(regex, replacement);
          });
        }
      });
    }

    // Apply phrases before characters
    if (this.dictionaries.phrases) {
      Object.entries(this.dictionaries.phrases)
        .sort(([a], [b]) => b.length - a.length) // Longest first
        .forEach(([chinese, vietnamese]) => {
          result = result.replace(new RegExp(chinese, 'g'), vietnamese);
        });
    }

    // Apply character translations
    if (this.dictionaries.characters) {
      Object.entries(this.dictionaries.characters).forEach(([chinese, vietnamese]) => {
        result = result.replace(new RegExp(chinese, 'g'), vietnamese);
      });
    }

    // Apply punctuation
    if (this.dictionaries.punctuation) {
      Object.entries(this.dictionaries.punctuation).forEach(([chinese, vietnamese]) => {
        result = result.replace(
          new RegExp(chinese.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          vietnamese
        );
      });
    }

    return result;
  }
}

describe('Translation Engine Test Suite', () => {
  let engine;

  beforeEach(() => {
    engine = new MockTranslationEngine(mockDictionaries);
  });

  describe('Character Translation', () => {
    test.each(testCases.characters)(
      'should translate "$input" to "$expected"',
      async ({ input, expected }) => {
        const result = await engine.translate(input);
        expect(result).toBe(expected);
      }
    );
  });

  describe('Phrase Translation', () => {
    test.each(testCases.phrases)(
      'should translate "$input" to "$expected"',
      async ({ input, expected }) => {
        const result = await engine.translate(input);
        expect(result).toBe(expected);
      }
    );
  });

  describe('Pattern Matching', () => {
    test.each(testCases.patterns)(
      'should translate "$input" to "$expected"',
      async ({ input, expected }) => {
        const result = await engine.translate(input);
        expect(result).toBe(expected);
      }
    );
  });

  describe('Mixed Content', () => {
    test.each(testCases.mixed)(
      'should handle mixed content "$input" correctly',
      async ({ input, expected }) => {
        const result = await engine.translate(input);
        expect(result).toBe(expected);
      }
    );
  });

  describe('Edge Cases', () => {
    test.each(testCases.edge)('should handle edge case "$input"', async ({ input, expected }) => {
      const result = await engine.translate(input);
      expect(result).toBe(expected);
    });
  });

  describe('Performance Tests', () => {
    test.each(testCases.performance)(
      'should handle performance case: $description',
      async ({ input }) => {
        const startTime = performance.now();
        const result = await engine.translate(input);
        const endTime = performance.now();

        expect(result).toBeDefined();
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      }
    );
  });

  describe('Translation Pipeline Order', () => {
    test('should apply phrases before characters', async () => {
      // "你好" should translate as phrase "xin chào", not as characters "bạn tốt"
      const result = await engine.translate('你好');
      expect(result).toBe('xin chào');
      expect(result).not.toBe('bạn tốt');
    });

    test('should apply patterns before other translations', async () => {
      const result = await engine.translate('小明的右手');
      expect(result).toBe('tay phải của Xiao Ming');
    });

    test('should preserve Latin characters', async () => {
      const result = await engine.translate('Hello 你好 World');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
      expect(result).toContain('xin chào');
    });
  });
});

export { mockDictionaries, MockTranslationEngine };
