import { describe, test, expect, vi } from 'vitest';
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
    wasmLookup: overrides.wasmLookup ?? null,
    enableParallelLookups: overrides.enableParallelLookups ?? true,
    dictionaryParallelThreshold: overrides.dictionaryParallelThreshold ?? 2,
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

  describe('findAllMatches (sync, always sequential)', () => {
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

    test('records sequential stats', () => {
      const dictionaries = new Map([['d1', buildTrie([['你', 'you']])]]);
      const metadata = new Map([['d1', { priority: 1 }]]);
      const lookup = makeLookup({ dictionaries, metadata });

      lookup.findAllMatches('你好', 0);

      expect(lookup.stats.sequentialCalls).toBe(1);
    });
  });

  describe('findAllMatchesAsync', () => {
    test('always returns a Promise', () => {
      const lookup = makeLookup();
      const result = lookup.findAllMatchesAsync('你好', 0);
      expect(result).toBeInstanceOf(Promise);
    });

    test('below threshold: resolves via sequential path, bumps sequentialCalls', async () => {
      const dictionaries = new Map([['d1', buildTrie([['你', 'you']])]]);
      const metadata = new Map([['d1', { priority: 1 }]]);
      const lookup = makeLookup({
        dictionaries,
        metadata,
        dictionaryParallelThreshold: 5,
      });

      const result = await lookup.findAllMatchesAsync('你好', 0);

      expect(result[0]).toMatchObject({ word: '你' });
      expect(lookup.stats.sequentialCalls).toBe(1);
      expect(lookup.stats.parallelCalls).toBe(0);
    });

    test('at/above threshold with no WASM: resolves via JS parallel path, bumps parallelCalls', async () => {
      const dictionaries = new Map([
        ['d1', buildTrie([['你', 'you']])],
        ['d2', buildTrie([['好', 'good']])],
      ]);
      const metadata = new Map([
        ['d1', { priority: 1 }],
        ['d2', { priority: 2 }],
      ]);
      const lookup = makeLookup({
        dictionaries,
        metadata,
        dictionaryParallelThreshold: 2,
      });

      const result = await lookup.findAllMatchesAsync('你好', 0);

      expect(result.map((m) => m.word).sort()).toEqual(['你']);
      expect(lookup.stats.parallelCalls).toBe(1);
      expect(lookup.stats.sequentialCalls).toBe(0);
    });

    test('returns [] when not ready', async () => {
      const lookup = makeLookup({ isReady: () => false });
      expect(await lookup.findAllMatchesAsync('你好', 0)).toEqual([]);
    });
  });

  describe('WASM-first / JS-fallback in findAllMatchesParallel', () => {
    test('uses wasmLookup result when ready', async () => {
      const wasmMatches = [{ word: '你', translation: 'wasm-you', dictionary: 'd1', priority: 1 }];
      const wasmLookup = {
        isReady: () => true,
        findAllMatches: vi.fn().mockResolvedValue(wasmMatches),
      };
      const lookup = makeLookup({ wasmLookup, dictionaryParallelThreshold: 1 });

      const result = await lookup.findAllMatchesAsync('你好', 0, ['d1']);

      expect(wasmLookup.findAllMatches).toHaveBeenCalledWith('你好', 0, ['d1']);
      expect(result).toBe(wasmMatches);
    });

    test('falls back to JS parallel when wasmLookup throws', async () => {
      const dictionaries = new Map([['d1', buildTrie([['你', 'you']])]]);
      const metadata = new Map([['d1', { priority: 1 }]]);
      const wasmLookup = {
        isReady: () => true,
        findAllMatches: vi.fn().mockRejectedValue(new Error('wasm boom')),
      };
      const lookup = makeLookup({
        dictionaries,
        metadata,
        wasmLookup,
        dictionaryParallelThreshold: 1,
      });

      const result = await lookup.findAllMatchesAsync('你好', 0);

      expect(result[0]).toMatchObject({ word: '你', dictionary: 'd1' });
      expect(lookup.stats.parallelCalls).toBe(1);
    });
  });

  describe('findAllMatchesSequential fallback on unexpected parallel failure', () => {
    test('falls back to sequential and records fallbackCount', async () => {
      const dictionaries = new Map([['d1', buildTrie([['你', 'you']])]]);
      const metadata = new Map([['d1', { priority: 1 }]]);
      const lookup = makeLookup({ dictionaries, metadata, dictionaryParallelThreshold: 1 });

      // Force the parallel try-block to throw by making searchOrder.map blow up:
      // simulate via a dictionaryOrder whose .map is monkey-patched to throw once.
      const badOrder = ['d1'];
      badOrder.map = () => {
        throw new Error('boom');
      };

      const result = await lookup.findAllMatchesParallel('你好', 0, badOrder);

      expect(result[0]).toMatchObject({ word: '你', dictionary: 'd1' });
      expect(lookup.stats.fallbackCount).toBe(1);
    });
  });
});
