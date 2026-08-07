/**
 * Caching utilities public API.
 *
 * Primary entry points:
 *   - LRUCache                    — generic least-recently-used cache
 *   - PrecomputedTrieCache        — disk-backed trie serialization helpers
 */

export { LRUCache } from './LRUCache';

export {
  deserializeTrie,
  serializeTrie,
  calculateDictionaryChecksum,
  tryLoadPrecomputedTrie,
  savePrecomputedTrie,
  PrecomputedTrieStats,
  precomputedTrieStats,
} from './PrecomputedTrieCache.js';
