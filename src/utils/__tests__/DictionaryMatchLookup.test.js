import { describe, test, expect } from 'vitest';
import { DictionaryMatchLookup } from '../dictionary/DictionaryMatchLookup.js';
import { DictionaryTrie } from '../dictionary/DictionaryTrie.js';

function buildTrie(entries) {
  const trie = new DictionaryTrie();
  for (const [word, translation] of entries) {
    trie.insert(word, translation);
  }
  return trie;
}

function makeLookup(overrides = {}) {
  const dictionaries = overrides.dictionaries || new Map();
  const metadata = overrides.metadata || new Map();
  return new DictionaryMatchLookup({
    dictionaries,
    metadata,
    getDefaultSearchOrder:
      overrides.getDefaultSearchOrder || (() => Array.from(dictionaries.keys())),
    isReady: overrides.isReady || (() => true),
  });
}

describe('DictionaryMatchLookup', () => {
  describe('findMatchesThreadSafe', () => {
    test('finds all matches at increasing lengths from startPos', () => {
      const trie = buildTrie([
        ['你', 'you-short'],
        ['你好', 'hello'],
      ]);
      const lookup = makeLookup();

      const matches = lookup.findMatchesThreadSafe(trie, '你好吗', 0);

      expect(matches).toEqual([
        expect.objectContaining({ word: '你', translation: 'you-short', endPos: 1 }),
        expect.objectContaining({ word: '你好', translation: 'hello', endPos: 2 }),
      ]);
    });

    test('returns empty array when no match at startPos', () => {
      const trie = buildTrie([['你好', 'hello']]);
      const lookup = makeLookup();

      expect(lookup.findMatchesThreadSafe(trie, '再见', 0)).toEqual([]);
    });
  });

  describe('findAllMatches', () => {
    test('returns an array, not a Promise', () => {
      const dictionaries = new Map([['d1', buildTrie([['你', 'you']])]]);
      const metadata = new Map([['d1', { priority: 1 }]]);
      const lookup = makeLookup({ dictionaries, metadata });

      const result = lookup.findAllMatches('你好', 0);

      expect(Array.isArray(result)).toBe(true);
      expect(result).not.toBeInstanceOf(Promise);
      expect(result[0]).toMatchObject({ word: '你', dictionary: 'd1' });
    });

    test('returns [] when not ready', () => {
      const lookup = makeLookup({ isReady: () => false });
      expect(lookup.findAllMatches('你好', 0)).toEqual([]);
    });

    test('sorts by specificity then priority across dictionaries', () => {
      const dictionaries = new Map([
        ['low_priority_long', buildTrie([['你好', 'hi-long']])],
        ['high_priority_short', buildTrie([['你', 'hi-short']])],
      ]);
      const metadata = new Map([
        ['low_priority_long', { priority: 10 }],
        ['high_priority_short', { priority: 1 }],
      ]);
      const lookup = makeLookup({ dictionaries, metadata });

      const result = lookup.findAllMatches('你好', 0);

      // Longer match wins regardless of priority (ADR-010).
      expect(result[0]).toMatchObject({ word: '你好', dictionary: 'low_priority_long' });
    });

    test('a dictionary that throws is skipped; the others still answer', () => {
      const broken = {
        get root() {
          throw new Error('corrupt trie');
        },
      };
      const dictionaries = new Map([
        ['bad', broken],
        ['d1', buildTrie([['你', 'you']])],
      ]);
      const metadata = new Map([
        ['bad', { priority: 1 }],
        ['d1', { priority: 2 }],
      ]);
      const lookup = makeLookup({ dictionaries, metadata });

      expect(lookup.findAllMatches('你好', 0)).toEqual([
        expect.objectContaining({ word: '你', dictionary: 'd1' }),
      ]);
    });
  });
});
