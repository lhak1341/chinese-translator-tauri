/**
 * Caching utilities public API.
 *
 * Primary entry points:
 *   - LRUCache                  — generic least-recently-used cache
 *   - contentAwarePositionCache — position mapping cache keyed by content hash
 *   - precomputed trie cache    — 5–7× dictionary load speedup via serialized tries
 */

export { LRUCache } from './LRUCache';

export type { ContentAwarePositionCacheOptions } from './ContentAwarePositionCache';
export { ContentAwarePositionCache, contentAwarePositionCache } from './ContentAwarePositionCache';

export {
  tryLoadPrecomputedTrie,
  savePrecomputedTrie,
  invalidatePrecomputedTrie,
  precomputedTrieStats,
} from './PrecomputedTrieCache';
