/**
 * Tests for TranslationCache
 *
 * The lookup memo's interface, crossed directly:
 * - Multi-dictionary key generation and fast-path caching
 * - Invalidation of every entry that searched a dictionary
 * - clear(), setEnabled(), dispose() idempotency
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

  test('lookups under another dictionary survive invalidation', () => {
    cache.setLookup('你', ['characters'], 'bạn');
    cache.setLookup('你', ['properNouns-Test'], 'Bạn');

    cache.invalidateDictionary('characters');

    expect(cache.getLookup('你', ['properNouns-Test'])).toBe('Bạn');
  });

  test('new entries can be added after invalidation', () => {
    cache.setLookup('你', ['characters'], 'bạn');
    cache.invalidateDictionary('characters');

    cache.setLookup('你', ['characters'], 'bạn-v2');
    expect(cache.getLookup('你', ['characters'])).toBe('bạn-v2');
  });

  test('invalidation drops only entries that searched the dictionary', () => {
    cache.setLookup('你', ['characters', 'phrases'], 'bạn');
    cache.setLookup('他', ['phrases'], 'anh ấy');
    cache.invalidateDictionary('characters');

    expect(cache.getLookup('你', ['characters', 'phrases'])).toBeUndefined();
    expect(cache.getLookup('他', ['phrases'])).toBe('anh ấy');
  });

  test('invalidation drops a cached null too', () => {
    cache.setLookup('无', ['characters'], null);
    expect(cache.getLookup('无', ['characters'])).toBeNull();
    cache.invalidateDictionary('characters');
    expect(cache.getLookup('无', ['characters'])).toBeUndefined();
  });

  test('holds no bookkeeping beyond the LRU: evicted lookups leave nothing behind', () => {
    const small = makeCache({ lookupCacheSize: 5 });
    for (let i = 0; i < 100; i++) small.setLookup(`w${i}`, ['characters'], i);

    expect(small.lookupCache.size()).toBe(5);
    expect(small.dictionaryIndex).toBeUndefined();
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
    cache.setLookup('好', ['characters'], 'tốt');
    cache.setLookup('他', ['phrases'], 'anh ấy');

    cache.clear();

    expect(cache.getLookup('好', ['characters'])).toBeUndefined();
    expect(cache.getLookup('他', ['phrases'])).toBeUndefined();
  });

  test('cache is usable after clear', () => {
    cache.setLookup('你', ['characters'], 'old');
    cache.clear();
    cache.setLookup('你', ['characters'], 'new');
    expect(cache.getLookup('你', ['characters'])).toBe('new');
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
    cache.setLookup('你', ['characters'], 'bạn');
    expect(cache.getLookup('你', ['characters'])).toBeUndefined();
  });

  test('disabling cache clears existing entries', () => {
    cache.setLookup('你', ['characters'], 'bạn');
    cache.setEnabled(false);
    expect(cache.getLookup('你', ['characters'])).toBeUndefined();
  });

  test('re-enabling cache allows new entries', () => {
    cache.setEnabled(false);
    cache.setEnabled(true);
    cache.setLookup('你', ['characters'], 'bạn');
    expect(cache.getLookup('你', ['characters'])).toBe('bạn');
  });

  test('enabled: false constructor option disables cache', () => {
    const disabledCache = makeCache({ enabled: false });
    disabledCache.setLookup('你', ['characters'], 'bạn');
    expect(disabledCache.getLookup('你', ['characters'])).toBeUndefined();
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

  test('dispose nullifies the cache and its index', () => {
    cache.setLookup('你', ['characters'], 'bạn');
    cache.dispose();
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

describe('TranslationCache — custom size', () => {
  test('respects custom lookupCacheSize', () => {
    expect(makeCache({ lookupCacheSize: 10 }).lookupCacheSize).toBe(10);
  });
});
