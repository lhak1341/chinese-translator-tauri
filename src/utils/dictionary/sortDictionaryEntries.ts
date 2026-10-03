import type { DictionaryData } from '../../types/DictionaryTypes';

/**
 * A copy of `dictionary` with its keys longest first, then alphabetical (`localeCompare`).
 *
 * Always a full sort, with no cache: it keeps no state, so a failed save that rolls a
 * dictionary back cannot leave an old value behind for the next sort. A dictionary over
 * 50,000 entries is never loaded, so the worst case is bounded (16k entries: 2-6 ms).
 */
export function sortDictionaryEntries(dictionary: DictionaryData): DictionaryData {
  return Object.fromEntries(
    Object.entries(dictionary).sort(([a], [b]) => b.length - a.length || a.localeCompare(b))
  );
}
