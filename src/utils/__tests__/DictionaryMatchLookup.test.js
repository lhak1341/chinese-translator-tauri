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

  describe('findAllMatchesAsync', () => {
    const twoDictionaries = () => ({
      dictionaries: new Map([
        ['d1', buildTrie([['你', 'you']])],
        ['d2', buildTrie([['好', 'good']])],
      ]),
      metadata: new Map([
        ['d1', { priority: 1 }],
        ['d2', { priority: 2 }],
      ]),
    });

    test('always returns a Promise', () => {
      const lookup = makeLookup();
      const result = lookup.findAllMatchesAsync('你好', 0);
      expect(result).toBeInstanceOf(Promise);
    });

    test('with no WASM tier, scans the JS tries and tags each match with its dictionary', async () => {
      const lookup = makeLookup(twoDictionaries());

      const result = await lookup.findAllMatchesAsync('你好', 0);

      expect(result).toEqual([
        expect.objectContaining({ word: '你', dictionary: 'd1', priority: 1 }),
      ]);
    });

    test('returns [] when not ready', async () => {
      const lookup = makeLookup({ isReady: () => false });
      expect(await lookup.findAllMatchesAsync('你好', 0)).toEqual([]);
    });

    describe('WASM tier', () => {
      test('is used for a lookup across two or more dictionaries when ready', async () => {
        const wasmMatches = [
          { word: '你', translation: 'wasm-you', dictionary: 'd1', priority: 1 },
        ];
        const wasmLookup = {
          isReady: () => true,
          findAllMatches: vi.fn().mockResolvedValue(wasmMatches),
        };
        const lookup = makeLookup({ ...twoDictionaries(), wasmLookup });

        const result = await lookup.findAllMatchesAsync('你好', 0, ['d1', 'd2']);

        expect(wasmLookup.findAllMatches).toHaveBeenCalledWith('你好', 0, ['d1', 'd2']);
        expect(result).toBe(wasmMatches);
      });

      test('is skipped for a single-dictionary lookup', async () => {
        const wasmLookup = { isReady: () => true, findAllMatches: vi.fn() };
        const lookup = makeLookup({ ...twoDictionaries(), wasmLookup });

        const result = await lookup.findAllMatchesAsync('你好', 0, ['d1']);

        expect(wasmLookup.findAllMatches).not.toHaveBeenCalled();
        expect(result[0]).toMatchObject({ word: '你', dictionary: 'd1' });
      });

      test('is skipped when not ready', async () => {
        const wasmLookup = { isReady: () => false, findAllMatches: vi.fn() };
        const lookup = makeLookup({ ...twoDictionaries(), wasmLookup });

        await lookup.findAllMatchesAsync('你好', 0);

        expect(wasmLookup.findAllMatches).not.toHaveBeenCalled();
      });

      test('a failure falls back to the JS tries', async () => {
        const wasmLookup = {
          isReady: () => true,
          findAllMatches: vi.fn().mockRejectedValue(new Error('wasm boom')),
        };
        const lookup = makeLookup({ ...twoDictionaries(), wasmLookup });

        const result = await lookup.findAllMatchesAsync('你好', 0);

        expect(result[0]).toMatchObject({ word: '你', dictionary: 'd1' });
      });
    });
  });
});
