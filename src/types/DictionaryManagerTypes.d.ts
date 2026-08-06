/**
 * DictionaryManagerTypes.d.ts
 *
 * TypeScript type definitions for the Dictionary Management system's trie layer.
 *
 * @module DictionaryManagerTypes
 */

// ============================================================================
// Core Trie Structures
// ============================================================================

/**
 * Metadata stored with each dictionary entry
 */
export interface DictionaryEntryMetadata {
  /** Name of the dictionary this entry belongs to */
  dictionary: string;

  /** Priority for conflict resolution (lower = higher priority) */
  priority: number;

  /** Estimated frequency score for sorting */
  frequency: number;

  /** Whether this entry can be used as a pattern variable */
  allowAsPatternVariable?: boolean;
}

/**
 * Match result from trie lookup
 */
export interface TrieMatch {
  /** Matched word from input text */
  word: string;

  /** Translation for the matched word */
  translation: string;

  /** End position in input text */
  endPos: number;

  /** Metadata for the matched entry */
  metadata: DictionaryEntryMetadata | null;
}

/**
 * Statistics about a trie structure
 */
export interface TrieStats {
  /** Total number of words stored in trie */
  size: number;

  /** Total number of nodes in trie */
  nodeCount: number;

  /** Maximum depth of the trie */
  maxDepth: number;

  /** Average depth across all words */
  averageDepth: number;

  /** Branching factor (average children per node) */
  branchingFactor: number;
}
