/**
 * Unit tests for DuplicateAnalyzer
 *
 * Tests the core functionality of finding duplicate dictionary entries
 * and handling composite keys for cross-dictionary operations.
 */

import { describe, it, expect } from 'vitest';
import {
  createDuplicateKey,
  parseDuplicateKey,
  findConflictingEntries,
  type DuplicateRow,
} from '../highlighting/DuplicateAnalyzer';
import { getDictionaryLabel } from '../dictionaryHelpers';

describe('DuplicateAnalyzer', () => {
  describe('createDuplicateKey', () => {
    it('should create valid composite keys', () => {
      expect(createDuplicateKey('哈利', 'properNouns')).toBe('哈利::properNouns');
      expect(createDuplicateKey('小明', 'properNouns-HarryPotter')).toBe(
        '小明::properNouns-HarryPotter'
      );
    });

    it('should allow empty source text (edge case)', () => {
      // While unusual, empty source is technically valid for createDuplicateKey
      // However, parseDuplicateKey will reject it as invalid
      expect(createDuplicateKey('', 'properNouns')).toBe('::properNouns');
    });

    it('should throw when source contains separator', () => {
      expect(() => createDuplicateKey('test::evil', 'properNouns')).toThrow(
        'Source text cannot contain "::" separator'
      );
    });

    it('should throw when dictionaryId contains separator', () => {
      expect(() => createDuplicateKey('test', 'proper::Nouns')).toThrow(
        'Dictionary ID cannot contain "::" separator'
      );
    });

    it('should handle source with single colon', () => {
      expect(createDuplicateKey('test:value', 'properNouns')).toBe('test:value::properNouns');
    });
  });

  describe('parseDuplicateKey', () => {
    it('should parse valid composite keys', () => {
      const result = parseDuplicateKey('哈利::properNouns');
      expect(result).toEqual({ source: '哈利', dictionaryId: 'properNouns' });
    });

    it('should throw on empty source (separator at start)', () => {
      // Empty source is not allowed - would create ambiguous keys
      expect(() => parseDuplicateKey('::properNouns')).toThrow('Invalid duplicate key format');
    });

    it('should handle source text with single colon', () => {
      const result = parseDuplicateKey('test:value::properNouns');
      expect(result).toEqual({ source: 'test:value', dictionaryId: 'properNouns' });
    });

    it('should handle source text with multiple double colons (use last one)', () => {
      // Uses lastIndexOf, so "a::b::c" splits as source="a::b", dictionaryId="c"
      const result = parseDuplicateKey('a::b::properNouns');
      expect(result).toEqual({ source: 'a::b', dictionaryId: 'properNouns' });
    });

    it('should throw on malformed keys - no separator', () => {
      expect(() => parseDuplicateKey('noSeparator')).toThrow('Invalid duplicate key format');
    });

    it('should throw on malformed keys - separator at start', () => {
      expect(() => parseDuplicateKey('::emptySource')).toThrow('Invalid duplicate key format');
    });

    it('should throw on malformed keys - separator at end', () => {
      expect(() => parseDuplicateKey('emptyDict::')).toThrow('Invalid duplicate key format');
    });

    it('should throw on malformed keys - only separator', () => {
      expect(() => parseDuplicateKey('::')).toThrow('Invalid duplicate key format');
    });
  });

  describe('createDuplicateKey and parseDuplicateKey round-trip', () => {
    it('should correctly round-trip normal entries', () => {
      const original = { source: '哈利', dictionaryId: 'properNouns' };
      const key = createDuplicateKey(original.source, original.dictionaryId);
      const parsed = parseDuplicateKey(key);
      expect(parsed).toEqual(original);
    });

    it('should correctly round-trip entries with single colons', () => {
      const original = { source: 'test:value:here', dictionaryId: 'phrases' };
      const key = createDuplicateKey(original.source, original.dictionaryId);
      const parsed = parseDuplicateKey(key);
      expect(parsed).toEqual(original);
    });
  });

  describe('getDictionaryLabel', () => {
    it('should format base properNouns', () => {
      expect(getDictionaryLabel('properNouns')).toBe('Proper Nouns');
    });

    it('should format custom proper nouns', () => {
      expect(getDictionaryLabel('properNouns-HarryPotter')).toBe('HarryPotter');
      expect(getDictionaryLabel('properNouns-Novel1')).toBe('Novel1');
    });

    it('should capitalize base dictionaries', () => {
      expect(getDictionaryLabel('characters')).toBe('Characters');
      expect(getDictionaryLabel('phrases')).toBe('Phrases');
      expect(getDictionaryLabel('patterns')).toBe('Patterns');
    });
  });

  describe('findConflictingEntries', () => {
    it('should find entries with different translations', () => {
      const dicts = {
        properNouns: { 哈利: 'Harry' },
        'properNouns-Novel1': { 哈利: 'Hali' },
      };
      const result = findConflictingEntries(dicts);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        source: '哈利',
        translation: 'Hali',
        dictionaryId: 'properNouns-Novel1',
      });
      expect(result[1]).toMatchObject({
        source: '哈利',
        translation: 'Harry',
        dictionaryId: 'properNouns',
      });
    });

    it('should include entries with same translation (duplicates across dictionaries)', () => {
      const dicts = {
        properNouns: { 哈利: 'Harry' },
        'properNouns-Novel1': { 哈利: 'Harry' },
      };
      const result = findConflictingEntries(dicts);
      // Now shows ALL duplicates, even with same translation
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        source: '哈利',
        translation: 'Harry',
        dictionaryId: 'properNouns-Novel1',
      });
      expect(result[1]).toMatchObject({
        source: '哈利',
        translation: 'Harry',
        dictionaryId: 'properNouns',
      });
    });

    it('should skip characters dictionary', () => {
      const dicts = {
        characters: { 中: 'middle' },
        phrases: { 中: 'trong' },
      };
      const result = findConflictingEntries(dicts);
      expect(result).toHaveLength(0);
    });

    it('should handle metadata keys correctly', () => {
      const dicts = {
        patterns: {
          在XY中: { translation: 'ở trong X Y', allowAsPatternVariable: true },
          checksum: 'abc123', // Should be skipped
          sourceFile: 'patterns.json', // Should be skipped
        },
      };
      const result = findConflictingEntries(dicts);
      expect(result).toHaveLength(0);
    });

    it('should handle keys ending with .trie', () => {
      const dicts = {
        properNouns: {
          哈利: 'Harry',
          'properNouns.trie': 'metadata', // Should be skipped
        },
      };
      const result = findConflictingEntries(dicts);
      expect(result).toHaveLength(0);
    });

    it('should handle keys starting with underscore or dollar sign', () => {
      const dicts = {
        phrases: {
          test: 'value1',
          _metadata: 'should skip',
          $internal: 'should skip',
        },
        properNouns: {
          test: 'value2',
        },
      };
      const result = findConflictingEntries(dicts);
      expect(result).toHaveLength(2); // Only 'test' has conflict
      expect(result.every((r) => r.source === 'test')).toBe(true);
    });

    it('should handle entries with metadata (pattern/phrase)', () => {
      const dicts = {
        patterns: {
          在XY中: { translation: 'ở trong X Y', allowAsPatternVariable: true },
        },
        phrases: {
          在XY中: { translation: 'in X Y', lowPriority: true },
        },
      };
      const result = findConflictingEntries(dicts);

      expect(result).toHaveLength(2);

      // Find entries by translation to avoid relying on sort order
      const phrasesEntry = result.find((r) => r.translation === 'in X Y');
      const patternsEntry = result.find((r) => r.translation === 'ở trong X Y');

      expect(phrasesEntry?.metadata?.lowPriority).toBe(true);
      expect(patternsEntry?.metadata?.allowAsPatternVariable).toBe(true);
    });

    it('should sort results by source, then dictionary name', () => {
      const dicts = {
        'properNouns-Novel2': { 小明: 'Xiao Ming 2', 哈利: 'Harry 2' },
        'properNouns-Novel1': { 小明: 'Xiao Ming 1', 哈利: 'Harry 1' },
        properNouns: { 小明: 'Xiao Ming', 哈利: 'Harry' },
      };
      const result = findConflictingEntries(dicts);

      // Should have 6 entries total (3 for each source)
      expect(result).toHaveLength(6);

      // Should be sorted by source first (哈利 < 小明 in Unicode)
      expect(result[0].source).toBe('哈利');
      expect(result[1].source).toBe('哈利');
      expect(result[2].source).toBe('哈利');
      expect(result[3].source).toBe('小明');

      // Within same source, sorted by dictionary label alphabetically
      const haliLabels = result.slice(0, 3).map((r) => r.dictionaryLabel);
      expect(haliLabels).toEqual(['Novel1', 'Novel2', 'Proper Nouns']);
    });

    it('should handle null/undefined dictionaries gracefully', () => {
      const dicts = {
        properNouns: { 哈利: 'Harry' },
        phrases: null as any,
        patterns: undefined as any,
      };
      const result = findConflictingEntries(dicts);
      expect(result).toHaveLength(0); // No duplicates
    });

    it('should handle empty dictionaries', () => {
      const dicts = {
        properNouns: {},
        phrases: {},
      };
      const result = findConflictingEntries(dicts);
      expect(result).toHaveLength(0);
    });

    it('should handle complex multi-dictionary scenario', () => {
      const dicts = {
        properNouns: { 哈利: 'Harry', 小明: 'Xiao Ming', 测试: 'test' },
        'properNouns-HP': { 哈利: 'Hali', 小明: 'Xiao Ming' }, // 哈利 different, 小明 same
        phrases: { 测试: 'ceshi', 其他: 'other' }, // 测试 different
        patterns: { 测试: 'test' }, // 测试 same as properNouns
      };
      const result = findConflictingEntries(dicts);

      // Should find: 哈利 (2 entries), 小明 (2 entries - same translation), 测试 (3 entries)
      // Should NOT find: 其他 (only one dictionary)
      const sources = new Set(result.map((r) => r.source));
      expect(sources).toEqual(new Set(['哈利', '小明', '测试']));

      // 哈利 should have 2 entries (different translations)
      const haliEntries = result.filter((r) => r.source === '哈利');
      expect(haliEntries).toHaveLength(2);
      expect(haliEntries.map((e) => e.translation).sort()).toEqual(['Hali', 'Harry']);

      // 小明 should have 2 entries (same translation - still a duplicate)
      const xiaomingEntries = result.filter((r) => r.source === '小明');
      expect(xiaomingEntries).toHaveLength(2);
      expect(xiaomingEntries.every((e) => e.translation === 'Xiao Ming')).toBe(true);

      // 测试 should have 3 entries (2 unique translations: test, ceshi)
      const testEntries = result.filter((r) => r.source === '测试');
      expect(testEntries).toHaveLength(3);
      const testTranslations = testEntries.map((e) => e.translation).sort();
      expect(testTranslations).toEqual(['ceshi', 'test', 'test']);
    });
  });
});
