import { describe, it, expect, vi } from 'vitest';
import { DictionaryWasmLookup } from '../dictionary/DictionaryWasmLookup.js';

function makeAdapter(overrides = {}) {
  return {
    initialize: vi.fn(async () => true),
    isReady: vi.fn(() => true),
    loadDictionary: vi.fn(async () => {}),
    findMatches: vi.fn(() => []),
    hasDictionary: vi.fn(() => true),
    getTimingStats: vi.fn(() => ({ totalTime: 0 })),
    cleanup: vi.fn(),
    ...overrides,
  };
}

function makeEntries(words) {
  return words.map((w) => ({ chinese: w, vietnamese: `vn_${w}`, metadata: null }));
}

describe('DictionaryWasmLookup', () => {
  describe('initialize', () => {
    it('calls adapter.initialize with config and marks ready', async () => {
      const adapter = makeAdapter();
      const lookup = new DictionaryWasmLookup(adapter);
      const ok = await lookup.initialize({ maxMemoryMB: 15 });
      expect(ok).toBe(true);
      expect(adapter.initialize).toHaveBeenCalledWith({ maxMemoryMB: 15 });
      expect(lookup.isReady()).toBe(true);
    });

    it('returns false when adapter.initialize returns false', async () => {
      const adapter = makeAdapter({
        initialize: vi.fn(async () => false),
        isReady: vi.fn(() => false),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      const ok = await lookup.initialize({});
      expect(ok).toBe(false);
      expect(lookup.isReady()).toBe(false);
    });

    it('returns false and does not mark ready when adapter throws', async () => {
      const adapter = makeAdapter({
        initialize: vi.fn(async () => {
          throw new Error('init failure');
        }),
        isReady: vi.fn(() => false),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      const ok = await lookup.initialize({});
      expect(ok).toBe(false);
      expect(lookup.isReady()).toBe(false);
    });

    it('deduplicates concurrent calls via promise', async () => {
      const adapter = makeAdapter();
      const lookup = new DictionaryWasmLookup(adapter);
      const [r1, r2] = await Promise.all([lookup.initialize({}), lookup.initialize({})]);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(adapter.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('sync', () => {
    it('loads each dictionary and returns true on success', async () => {
      const adapter = makeAdapter({
        findMatches: vi.fn(() => [{ word: '好', translation: 'tốt', metadata: null }]),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});

      const entries = new Map([['characters', makeEntries(['好', '大'])]]);
      const ok = await lookup.sync(entries, new Map([['characters', 4]]));

      expect(ok).toBe(true);
      expect(adapter.loadDictionary).toHaveBeenCalledWith('characters', makeEntries(['好', '大']));
    });

    it('stores priority map for later use in findAllMatches', async () => {
      const adapter = makeAdapter({
        findMatches: vi.fn((dict) =>
          dict === 'characters' ? [{ word: '好', translation: 'tốt', metadata: null }] : []
        ),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});
      await lookup.sync(
        new Map([
          ['characters', makeEntries(['好'])],
          ['phrases', makeEntries(['你好'])],
        ]),
        new Map([
          ['characters', 4],
          ['phrases', 3],
        ])
      );

      const matches = await lookup.findAllMatches('好', 0, ['characters', 'phrases']);
      expect(matches[0].priority).toBe(4);
    });

    it('returns false when no dictionaries load successfully', async () => {
      const adapter = makeAdapter({
        loadDictionary: vi.fn(async () => {
          throw new Error('fail');
        }),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});
      const ok = await lookup.sync(new Map([['characters', makeEntries(['好'])]]), new Map());
      expect(ok).toBe(false);
    });

    it('skips failed dictionary but continues with others', async () => {
      let callCount = 0;
      const adapter = makeAdapter({
        loadDictionary: vi.fn(async () => {
          if (++callCount === 1) throw new Error('first fails');
        }),
        findMatches: vi.fn(() => [{ word: '大', translation: 'lớn', metadata: null }]),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});
      const entries = new Map([
        ['phrases', makeEntries(['你好'])],
        ['characters', makeEntries(['大'])],
      ]);
      const ok = await lookup.sync(entries, new Map());
      expect(ok).toBe(true);
      expect(adapter.loadDictionary).toHaveBeenCalledTimes(2);
    });
  });

  describe('translate', () => {
    it('returns first match from first matching dictionary', async () => {
      const adapter = makeAdapter({
        findMatches: vi.fn((dict, word) =>
          dict === 'characters' && word === '好'
            ? [{ word: '好', translation: 'tốt', metadata: { freq: 1 } }]
            : []
        ),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});

      const result = lookup.translate('好', ['characters', 'phrases']);
      expect(result).toMatchObject({ word: '好', translation: 'tốt', dictionary: 'characters' });
    });

    it('returns null when no dictionary has a match', async () => {
      const lookup = new DictionaryWasmLookup(makeAdapter({ findMatches: vi.fn(() => []) }));
      await lookup.initialize({});
      expect(lookup.translate('xyz', ['characters'])).toBeNull();
    });

    it('skips dictionaries hasDictionary returns false for', async () => {
      const adapter = makeAdapter({ hasDictionary: vi.fn(() => false) });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});
      lookup.translate('好', ['characters']);
      expect(adapter.findMatches).not.toHaveBeenCalled();
    });
  });

  describe('findAllMatches', () => {
    it('returns matches sorted by length desc then priority asc', async () => {
      const adapter = makeAdapter({
        findMatches: vi.fn((dict) => {
          if (dict === 'characters') return [{ word: '好', translation: 'tốt', metadata: null }];
          if (dict === 'phrases')
            return [{ word: '你好', translation: 'xin chào', metadata: null }];
          return [];
        }),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});
      await lookup.sync(
        new Map([
          ['characters', makeEntries(['好'])],
          ['phrases', makeEntries(['你好'])],
        ]),
        new Map([
          ['characters', 4],
          ['phrases', 3],
        ])
      );

      const matches = await lookup.findAllMatches('你好', 0, ['characters', 'phrases']);
      expect(matches[0].word).toBe('你好');
      expect(matches[1].word).toBe('好');
    });

    it('falls back to priority sort for same-length matches', async () => {
      const adapter = makeAdapter({
        findMatches: vi.fn((dict) => [{ word: '大', translation: `from_${dict}`, metadata: null }]),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});
      await lookup.sync(
        new Map([
          ['phrases', makeEntries(['大'])],
          ['characters', makeEntries(['大'])],
        ]),
        new Map([
          ['phrases', 3],
          ['characters', 4],
        ])
      );

      const matches = await lookup.findAllMatches('大', 0, ['phrases', 'characters']);
      expect(matches[0].priority).toBe(3);
    });
  });

  describe('getStatus', () => {
    it('reflects initialized and ready state', async () => {
      const lookup = new DictionaryWasmLookup(makeAdapter());
      await lookup.initialize({});
      const status = lookup.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.ready).toBe(true);
      expect(status.hasAdapter).toBe(true);
    });
  });

  describe('dispose', () => {
    it('calls adapter.cleanup and clears ready state', async () => {
      const adapter = makeAdapter({
        isReady: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});
      lookup.dispose();
      expect(adapter.cleanup).toHaveBeenCalled();
      expect(lookup.isReady()).toBe(false);
    });

    it('does not throw if adapter.cleanup throws', async () => {
      const adapter = makeAdapter({
        cleanup: vi.fn(() => {
          throw new Error('cleanup error');
        }),
      });
      const lookup = new DictionaryWasmLookup(adapter);
      await lookup.initialize({});
      expect(() => lookup.dispose()).not.toThrow();
    });
  });
});
