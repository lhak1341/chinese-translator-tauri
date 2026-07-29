import { describe, test, expect, vi, beforeEach } from 'vitest';
import { IncrementalDictionarySorter } from '../dictionary/IncrementalDictionarySorter.js';

vi.mock('../logger.js', () => ({
  logger: { warn: vi.fn(), log: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { logger } from '../logger.js';

describe('IncrementalDictionarySorter', () => {
  let sorter;

  beforeEach(() => {
    sorter = new IncrementalDictionarySorter();
    vi.clearAllMocks();
  });

  describe('fullSort', () => {
    test('sorts by length descending, then alphabetically ascending', () => {
      const dictionary = { a: '1', bb: '2', ccc: '3', ab: '4' };
      const result = sorter.sortDictionary(dictionary, 'dict1');

      expect(Object.keys(result)).toEqual(['ccc', 'ab', 'bb', 'a']);
    });

    test('caches sorted entries for the dictionaryId', () => {
      sorter.sortDictionary({ a: '1' }, 'dict1');
      expect(sorter.getSortedEntries('dict1')).toEqual([['a', '1']]);
    });

    test('evicts oldest cache entry once MAX_CACHE_SIZE is exceeded', () => {
      for (let i = 0; i < sorter.MAX_CACHE_SIZE; i++) {
        sorter.sortDictionary({ x: '1' }, `dict${i}`);
      }
      expect(sorter.getSortedEntries('dict0')).toEqual([['x', '1']]);

      sorter.sortDictionary({ x: '1' }, 'dictOverflow');
      expect(sorter.getSortedEntries('dict0')).toEqual([]);
      expect(sorter.getSortedEntries('dictOverflow')).toEqual([['x', '1']]);
    });
  });

  describe('incrementalSort (single-key changes)', () => {
    test('repositions a single added key without re-sorting the rest', () => {
      sorter.sortDictionary({ bb: '2', a: '1' }, 'dict1');
      const result = sorter.sortDictionary({ bb: '2', a: '1', ccc: '3' }, 'dict1', 'ccc');

      expect(Object.keys(result)).toEqual(['ccc', 'bb', 'a']);
      expect(sorter.getStats().incrementalSorts).toBe(1);
    });

    test('repositions a single edited key (value change, same key)', () => {
      sorter.sortDictionary({ a: '1', bb: '2' }, 'dict1');
      const result = sorter.sortDictionary({ a: 'updated', bb: '2' }, 'dict1', 'a');

      expect(result.a).toBe('updated');
      expect(Object.keys(result)).toEqual(['bb', 'a']);
    });

    test('handles a rename via oldKey removal', () => {
      sorter.sortDictionary({ a: '1', bb: '2' }, 'dict1');
      const result = sorter.sortDictionary({ renamed: '1', bb: '2' }, 'dict1', 'renamed', 'a');

      expect(Object.keys(result)).toEqual(['renamed', 'bb']);
    });

    test('handles a single-key deletion', () => {
      sorter.sortDictionary({ a: '1', bb: '2' }, 'dict1');
      const result = sorter.sortDictionary({ bb: '2' }, 'dict1', 'a');

      expect(Object.keys(result)).toEqual(['bb']);
    });

    test('falls back to full sort when no cache exists yet for dictionaryId', () => {
      const result = sorter.sortDictionary({ a: '1', bb: '2' }, 'freshDict', 'a');
      expect(Object.keys(result)).toEqual(['bb', 'a']);
      expect(sorter.getStats().fullSorts).toBe(1);
      expect(sorter.getStats().incrementalSorts).toBe(0);
    });
  });

  describe('bulk-op guard (dropped-entry protection)', () => {
    test('self-heals to a full sort and warns when changedKey is passed but the entry count no longer matches the cache', () => {
      sorter.sortDictionary({ a: '1', bb: '2' }, 'dict1');

      // Simulates the documented footgun: caller passes a non-null changedKey while the
      // dictionary actually had multiple entries change (a bulk op) — 'ccc' and 'ddd' are
      // both new, but only 'ccc' is named as changedKey.
      const bulkDictionary = { a: '1', bb: '2', ccc: '3', ddd: '4' };
      const result = sorter.sortDictionary(bulkDictionary, 'dict1', 'ccc');

      // Every entry must survive — the guard must not return a truncated dictionary.
      expect(Object.keys(result).sort()).toEqual(['a', 'bb', 'ccc', 'ddd'].sort());
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn.mock.calls[0][0]).toContain('dict1');
    });

    test('repairs the cache after a self-heal so the next incremental call is correct', () => {
      sorter.sortDictionary({ a: '1', bb: '2' }, 'dict1');
      sorter.sortDictionary({ a: '1', bb: '2', ccc: '3', ddd: '4' }, 'dict1', 'ccc');

      // Cache should now reflect all 4 entries (repaired by the fullSort fallback),
      // so a subsequent single-key incremental update stays correct.
      const result = sorter.sortDictionary(
        { a: '1', bb: '2', ccc: '3', ddd: '4', e: '5' },
        'dict1',
        'e'
      );
      expect(Object.keys(result).sort()).toEqual(['a', 'bb', 'ccc', 'ddd', 'e'].sort());
    });
  });
});
