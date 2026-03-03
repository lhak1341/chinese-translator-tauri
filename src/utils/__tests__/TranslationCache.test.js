/**
 * Tests for TranslationCache
 *
 * Covers the critical paths that were previously untested:
 * - Cache invalidation via dictionaryIndex (O(1) path)
 * - Multi-dictionary key generation and fast-path caching
 * - Separate character / phrase / pattern / lookup cache namespacing
 * - dispose() idempotency
 * - setEnabled() clearing behaviour
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { TranslationCache } from '../dictionary/TranslationCache.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCache(opts = {}) {
  return new TranslationCache(opts);
}

// ---------------------------------------------------------------------------
// Basic get / set
// ---------------------------------------------------------------------------

describe('TranslationCache — basic get/set', () => {
  let cache;
  beforeEach(() => {
    cache = makeCache();
  });

  test('getCharacter returns undefined on miss', () => {
    expect(cache.getCharacter('你', 'characters')).toBeUndefined();
  });

  test('setCharacter / getCharacter round-trip', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    expect(cache.getCharacter('你', 'characters')).toBe('bạn');
  });

  test('different dictionary names are separate namespaces', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.setCharacter('你', 'properNouns-Test', 'Bạn');
    expect(cache.getCharacter('你', 'characters')).toBe('bạn');
    expect(cache.getCharacter('你', 'properNouns-Test')).toBe('Bạn');
  });

  test('setPhrase / getPhrase round-trip', () => {
    cache.setPhrase('不知道', 'phrases', 'không biết');
    expect(cache.getPhrase('不知道', 'phrases')).toBe('không biết');
  });

  test('character cache and phrase cache are separate', () => {
    cache.setCharacter('好', 'characters', 'tốt');
    expect(cache.getPhrase('好', 'characters')).toBeUndefined();
  });

  test('setPattern / getPattern round-trip', () => {
    cache.setPattern('在X中', '在公园中', { matched: true });
    expect(cache.getPattern('在X中', '在公园中')).toEqual({ matched: true });
  });

  test('pattern cache is separate from character cache', () => {
    cache.setCharacter('在', 'characters', 'ở');
    expect(cache.getPattern('在', 'characters')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Multi-dictionary lookup cache
// ---------------------------------------------------------------------------

describe('TranslationCache — multi-dictionary lookup', () => {
  let cache;
  beforeEach(() => {
    cache = makeCache();
  });

  test('getLookup returns undefined on miss', () => {
    expect(cache.getLookup('好', ['characters', 'phrases'])).toBeUndefined();
  });

  test('setLookup / getLookup round-trip', () => {
    cache.setLookup('好', ['characters', 'phrases'], { translation: 'tốt' });
    expect(cache.getLookup('好', ['characters', 'phrases'])).toEqual({ translation: 'tốt' });
  });

  test('different dictionary array contents produce different keys', () => {
    cache.setLookup('好', ['characters'], 'value-A');
    cache.setLookup('好', ['phrases'], 'value-B');
    expect(cache.getLookup('好', ['characters'])).toBe('value-A');
    expect(cache.getLookup('好', ['phrases'])).toBe('value-B');
  });

  test('same array reference uses fast-path (no re-join)', () => {
    const dicts = ['characters', 'phrases'];
    cache.setLookup('好', dicts, 'result');
    // Second call with same reference should still hit
    expect(cache.getLookup('好', dicts)).toBe('result');
  });

  test('new array with same contents hits the cache (element-wise fast-path)', () => {
    cache.setLookup('好', ['characters', 'phrases'], 'result');
    // Different reference, same content
    expect(cache.getLookup('好', ['characters', 'phrases'])).toBe('result');
  });

  test('dictionary order matters in the key', () => {
    cache.setLookup('好', ['characters', 'phrases'], 'order-A');
    // Same elements but different order — different key
    expect(cache.getLookup('好', ['phrases', 'characters'])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Dictionary index and invalidation (CRITICAL-3 fix)
// ---------------------------------------------------------------------------

describe('TranslationCache — invalidateDictionary', () => {
  let cache;
  beforeEach(() => {
    cache = makeCache();
  });

  test('invalidateDictionary removes character entries for that dictionary', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.setCharacter('好', 'characters', 'tốt');

    cache.invalidateDictionary('characters');

    expect(cache.getCharacter('你', 'characters')).toBeUndefined();
    expect(cache.getCharacter('好', 'characters')).toBeUndefined();
  });

  test('invalidateDictionary does not affect other dictionaries', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.setCharacter('你', 'properNouns-Test', 'Bạn');

    cache.invalidateDictionary('characters');

    // properNouns-Test entry should survive
    expect(cache.getCharacter('你', 'properNouns-Test')).toBe('Bạn');
  });

  test('invalidateDictionary removes phrase entries', () => {
    cache.setPhrase('不知道', 'phrases', 'không biết');
    cache.invalidateDictionary('phrases');
    expect(cache.getPhrase('不知道', 'phrases')).toBeUndefined();
  });

  test('invalidateDictionary removes lookup entries containing that dictionary', () => {
    cache.setLookup('好', ['characters', 'phrases'], 'result');
    cache.invalidateDictionary('characters');
    // Multi-dict lookup that included 'characters' must be gone
    expect(cache.getLookup('好', ['characters', 'phrases'])).toBeUndefined();
  });

  test('invalidateDictionary removes lookup entry even if the invalidated dict is non-primary', () => {
    cache.setLookup('好', ['phrases', 'characters'], 'result');
    // Invalidate the second dict in the list
    cache.invalidateDictionary('characters');
    expect(cache.getLookup('好', ['phrases', 'characters'])).toBeUndefined();
  });

  test('lookup entries not containing the invalidated dictionary survive', () => {
    cache.setLookup('好', ['phrases'], 'phrases-only');
    cache.invalidateDictionary('characters');
    // 'phrases' lookup did not involve 'characters', so it should survive
    expect(cache.getLookup('好', ['phrases'])).toBe('phrases-only');
  });

  test('invalidating a dictionary that was never populated is a no-op', () => {
    // Should not throw
    expect(() => cache.invalidateDictionary('nonexistent')).not.toThrow();
  });

  test('new entries can be added after invalidation', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.invalidateDictionary('characters');

    // Re-add after invalidation
    cache.setCharacter('你', 'characters', 'bạn-v2');
    expect(cache.getCharacter('你', 'characters')).toBe('bạn-v2');
  });

  test('dictionaryIndex is cleared after invalidation', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.invalidateDictionary('characters');

    // The index for 'characters' should now be gone
    expect(cache.dictionaryIndex.character.has('characters')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

describe('TranslationCache — clear', () => {
  let cache;
  beforeEach(() => {
    cache = makeCache();
  });

  test('clear removes all cached entries', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.setPhrase('不知道', 'phrases', 'không biết');
    cache.setPattern('在X中', 'text', 'result');
    cache.setLookup('好', ['characters'], 'tốt');

    cache.clear();

    expect(cache.getCharacter('你', 'characters')).toBeUndefined();
    expect(cache.getPhrase('不知道', 'phrases')).toBeUndefined();
    expect(cache.getPattern('在X中', 'text')).toBeUndefined();
    expect(cache.getLookup('好', ['characters'])).toBeUndefined();
  });

  test('clear resets all dictionaryIndex maps', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.setPhrase('好', 'phrases', 'tốt');
    cache.setLookup('他', ['characters'], 'anh ấy');

    cache.clear();

    expect(cache.dictionaryIndex.character.size).toBe(0);
    expect(cache.dictionaryIndex.phrase.size).toBe(0);
    expect(cache.dictionaryIndex.lookup.size).toBe(0);
  });

  test('cache is usable after clear', () => {
    cache.setCharacter('你', 'characters', 'old');
    cache.clear();
    cache.setCharacter('你', 'characters', 'new');
    expect(cache.getCharacter('你', 'characters')).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// setEnabled()
// ---------------------------------------------------------------------------

describe('TranslationCache — setEnabled', () => {
  let cache;
  beforeEach(() => {
    cache = makeCache();
  });

  test('disabling cache prevents new entries from being stored', () => {
    cache.setEnabled(false);
    cache.setCharacter('你', 'characters', 'bạn');
    expect(cache.getCharacter('你', 'characters')).toBeUndefined();
  });

  test('disabling cache clears existing entries', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.setEnabled(false);
    expect(cache.getCharacter('你', 'characters')).toBeUndefined();
  });

  test('re-enabling cache allows new entries', () => {
    cache.setEnabled(false);
    cache.setEnabled(true);
    cache.setCharacter('你', 'characters', 'bạn');
    expect(cache.getCharacter('你', 'characters')).toBe('bạn');
  });

  test('disabled=false constructor option disables cache', () => {
    const disabledCache = makeCache({ enabled: false });
    disabledCache.setCharacter('你', 'characters', 'bạn');
    expect(disabledCache.getCharacter('你', 'characters')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// dispose()
// ---------------------------------------------------------------------------

describe('TranslationCache — dispose', () => {
  let cache;
  beforeEach(() => {
    cache = makeCache();
  });

  test('dispose nullifies cache references', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.dispose();
    expect(cache.characterCache).toBeNull();
    expect(cache.phraseCache).toBeNull();
    expect(cache.patternCache).toBeNull();
    expect(cache.lookupCache).toBeNull();
  });

  test('dispose sets isEnabled to false', () => {
    cache.dispose();
    expect(cache.isEnabled).toBe(false);
  });

  test('calling dispose twice is a no-op (idempotent)', () => {
    cache.dispose();
    expect(() => cache.dispose()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getStats()
// ---------------------------------------------------------------------------

describe('TranslationCache — getStats', () => {
  let cache;
  beforeEach(() => {
    cache = makeCache();
  });

  test('getStats returns enabled status', () => {
    expect(cache.getStats().enabled).toBe(true);
  });

  test('getStats overall hit rate starts at 0', () => {
    const stats = cache.getStats();
    expect(stats.overall.totalQueries).toBe(0);
    expect(stats.overall.totalHits).toBe(0);
  });

  test('getStats reflects hits after cache population', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.getCharacter('你', 'characters'); // hit
    cache.getCharacter('好', 'characters'); // miss

    const stats = cache.getStats();
    expect(stats.overall.totalQueries).toBeGreaterThanOrEqual(2);
    expect(stats.overall.totalHits).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// getMemoryUsage()
// ---------------------------------------------------------------------------

describe('TranslationCache — getMemoryUsage', () => {
  let cache;
  beforeEach(() => {
    cache = makeCache();
  });

  test('getMemoryUsage starts at zero total entries', () => {
    expect(cache.getMemoryUsage().totalEntries).toBe(0);
  });

  test('getMemoryUsage increments as entries are added', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.setPhrase('不知道', 'phrases', 'không biết');
    expect(cache.getMemoryUsage().totalEntries).toBe(2);
  });

  test('getMemoryUsage drops to zero after clear', () => {
    cache.setCharacter('你', 'characters', 'bạn');
    cache.clear();
    expect(cache.getMemoryUsage().totalEntries).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Custom cache sizes
// ---------------------------------------------------------------------------

describe('TranslationCache — custom sizes', () => {
  test('respects custom characterCacheSize', () => {
    const c = makeCache({ characterCacheSize: 10 });
    expect(c.characterCacheSize).toBe(10);
  });

  test('respects custom phraseCacheSize', () => {
    const c = makeCache({ phraseCacheSize: 20 });
    expect(c.phraseCacheSize).toBe(20);
  });
});
