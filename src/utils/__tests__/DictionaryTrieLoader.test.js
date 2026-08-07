import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockPrecomputedTrieStats = vi.hoisted(() => ({
  recordCacheHit: vi.fn(),
  recordCacheMiss: vi.fn(),
  recordCacheSave: vi.fn(),
}));

vi.mock('../caching/PrecomputedTrieCache.js', () => ({
  tryLoadPrecomputedTrie: vi.fn(),
  savePrecomputedTrie: vi.fn(),
  precomputedTrieStats: mockPrecomputedTrieStats,
}));

import { loadDictionaryWithCache, getCacheStats } from '../dictionary/DictionaryTrieLoader.js';
import { tryLoadPrecomputedTrie, savePrecomputedTrie } from '../caching/PrecomputedTrieCache.js';

describe('DictionaryTrieLoader.loadDictionaryWithCache', () => {
  const tauriAPI = {
    loadDictionary: vi.fn(),
    saveDictionary: vi.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tauriAPI.saveDictionary.mockResolvedValue({ success: true });
  });

  test('cache hit: reconstructs a trie from the cached data without building from raw entries', async () => {
    const cachedRoot = { children: {}, isEndOfWord: false };
    tryLoadPrecomputedTrie.mockResolvedValue({ root: cachedRoot, size: 3 });

    const result = await loadDictionaryWithCache('phrases', { 你好: 'xin chào' }, tauriAPI);

    expect(result.fromCache).toBe(true);
    expect(result.trie.root).toBe(cachedRoot);
    expect(result.trie.size).toBe(3);
    expect(typeof result.loadTime).toBe('number');
    expect(mockPrecomputedTrieStats.recordCacheHit).toHaveBeenCalledTimes(1);
    expect(mockPrecomputedTrieStats.recordCacheMiss).not.toHaveBeenCalled();
  });

  test('cache miss: builds a trie from raw dictionary data and triggers an async save', async () => {
    tryLoadPrecomputedTrie.mockResolvedValue(null);
    savePrecomputedTrie.mockResolvedValue(true);

    const result = await loadDictionaryWithCache(
      'phrases',
      { 你好: 'xin chào', 谢谢: 'cảm ơn' },
      tauriAPI
    );

    expect(result.fromCache).toBe(false);
    expect(result.trie.size).toBe(2);
    expect(result.trie.get('你好')).toBe('xin chào');
    expect(result.trie.get('谢谢')).toBe('cảm ơn');
    expect(mockPrecomputedTrieStats.recordCacheMiss).toHaveBeenCalledTimes(1);

    // Save is fire-and-forget (not awaited by loadDictionaryWithCache) — flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(savePrecomputedTrie).toHaveBeenCalledTimes(1);
    expect(savePrecomputedTrie.mock.calls[0][0]).toBe('phrases');
  });

  test('cache miss: preserves object-form entry metadata (no enrichment) when building the trie', async () => {
    tryLoadPrecomputedTrie.mockResolvedValue(null);
    savePrecomputedTrie.mockResolvedValue(true);

    const dictionaryData = {
      王: { translation: 'Vương', allowAsPatternVariable: true },
    };
    const result = await loadDictionaryWithCache('properNouns', dictionaryData, tauriAPI);

    expect(result.trie.getWithMetadata('王')).toMatchObject({
      translation: 'Vương',
      metadata: dictionaryData.王,
    });
  });

  test('skips entries whose value is neither a string nor a {translation} object', async () => {
    tryLoadPrecomputedTrie.mockResolvedValue(null);
    savePrecomputedTrie.mockResolvedValue(true);

    const result = await loadDictionaryWithCache(
      'phrases',
      { valid: 'ok', invalid: { noTranslationField: true } },
      tauriAPI
    );

    expect(result.trie.size).toBe(1);
    expect(result.trie.get('valid')).toBe('ok');
    expect(result.trie.get('invalid')).toBeNull();
  });
});

describe('DictionaryTrieLoader.getCacheStats', () => {
  test('delegates to precomputedTrieStats.getSummary', () => {
    mockPrecomputedTrieStats.getSummary = vi.fn(() => ({ hits: 1, misses: 2 }));
    expect(getCacheStats()).toEqual({ hits: 1, misses: 2 });
  });
});
