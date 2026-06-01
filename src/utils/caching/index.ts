/**
 * Caching utilities public API.
 *
 * Primary entry points:
 *   - LRUCache                    — generic least-recently-used cache
 *   - ContentAwarePositionCache   — position cache keyed by content hash
 *   - PrecomputedTrieCache        — disk-backed trie serialization helpers
 */

export { LRUCache } from './LRUCache';

export type {
  ContentAwarePositionCacheOptions,
  ContentSignature,
} from './ContentAwarePositionCache';
export { ContentAwarePositionCache, contentAwarePositionCache } from './ContentAwarePositionCache';

export {
  deserializeTrie,
  serializeTrie,
  calculateDictionaryChecksum,
  tryLoadPrecomputedTrie,
  savePrecomputedTrie,
  invalidatePrecomputedTrie,
  PrecomputedTrieStats,
  precomputedTrieStats,
} from './PrecomputedTrieCache.js';
