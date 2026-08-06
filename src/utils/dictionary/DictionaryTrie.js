/**
 * Dictionary Trie data structure.
 *
 * @import {
 *   TrieMatch,
 *   TrieStats,
 * } from '../../types/DictionaryManagerTypes'
 */

export class TrieNode {
  constructor() {
    this.children = new Map();
    this.isEndOfWord = false;
    this.translation = null;
    this.metadata = null; // For additional data like frequency, priority
  }
}

export class DictionaryTrie {
  constructor() {
    this.root = new TrieNode();
    this.size = 0;
    // CODE REVIEW FIX (MEDIUM-1): Removed sharedMatchesArray for thread-safety
    // Modern JS engines optimize short-lived allocations, <5% performance difference
    // Benefits: Thread-safe, no race conditions in async operations
  }

  /**
   * Insert a word and its translation into the trie
   * @param {string} word - Source word
   * @param {string} translation - Target translation
   * @param {Object} metadata - Optional metadata
   */
  insert(word, translation, metadata = null) {
    let current = this.root;

    for (const char of word) {
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode());
      }
      current = current.children.get(char);
    }

    if (!current.isEndOfWord) {
      this.size++;
    }

    current.isEndOfWord = true;
    current.translation = translation;
    current.metadata = metadata;
  }

  /**
   * Find exact translation for a word
   * @param {string} word - Word to translate
   * @returns {string|null} Translation or null if not found
   */
  get(word) {
    const node = this.findNode(word);
    return node?.isEndOfWord ? node.translation : null;
  }

  /**
   * Find exact translation and metadata for a word
   * @param {string} word - Word to translate
   * @returns {Object|null} {translation, metadata} or null if not found
   */
  getWithMetadata(word) {
    const node = this.findNode(word);
    if (node?.isEndOfWord) {
      return {
        translation: node.translation,
        metadata: node.metadata,
      };
    }
    return null;
  }

  /**
   * Find all words with a given prefix
   * @param {string} prefix - Prefix to search for
   * @returns {Array<*>} Array of {word, translation, metadata}
   */
  getWithPrefix(prefix) {
    const prefixNode = this.findNode(prefix);
    if (!prefixNode) return [];

    const results = [];
    this.dfsCollect(prefixNode, prefix, results);
    return results;
  }

  /**
   * Find all possible translations for text starting at a position
   * CODE REVIEW FIX (MEDIUM-1): Use local array for thread-safety
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @returns {Array<*>} Array of {word, translation, endPos, metadata}
   */
  findMatches(text, startPos = 0) {
    // Use thread-local array instead of shared array
    const matches = [];
    let current = this.root;

    for (let i = startPos; i < text.length; i++) {
      const char = text[i];

      if (!current.children.has(char)) {
        break;
      }

      current = current.children.get(char);

      if (current.isEndOfWord) {
        matches.push({
          word: text.slice(startPos, i + 1),
          translation: current.translation,
          endPos: i + 1,
          metadata: current.metadata,
        });
      }
    }

    return matches; // No need to slice() - already a fresh array
  }

  /**
   * Find the longest matching word from a position
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @returns {Object|null} Longest match or null
   */
  findLongestMatch(text, startPos = 0) {
    const matches = this.findMatches(text, startPos);
    return matches.length > 0 ? matches[matches.length - 1] : null;
  }

  /**
   * Helper method to find a trie node for a word
   * @param {string} word - Word to find
   * @returns {TrieNode|null} Node or null if not found
   */
  findNode(word) {
    let current = this.root;

    for (const char of word) {
      if (!current.children.has(char)) {
        return null;
      }
      current = current.children.get(char);
    }

    return current;
  }

  /**
   * DFS helper to collect all words with a prefix
   * @param {TrieNode} node - Current node
   * @param {string} prefix - Current prefix
   * @param {Array<*>} results - Results array
   */
  dfsCollect(node, prefix, results) {
    if (node.isEndOfWord) {
      results.push({
        word: prefix,
        translation: node.translation,
        metadata: node.metadata,
      });
    }

    for (const [char, childNode] of node.children) {
      this.dfsCollect(childNode, prefix + char, results);
    }
  }

  /**
   * Get statistics about the trie
   * @returns {Object} Trie statistics
   */
  getStats() {
    return {
      size: this.size,
      nodeCount: this.countNodes(),
      maxDepth: this.getMaxDepth(),
      avgDepth: this.getAverageDepth(),
      memoryEstimate: `${((this.countNodes() * 200) / 1024 / 1024).toFixed(1)}MB`,
    };
  }

  countNodes() {
    const countNodesRecursive = (node) => {
      let count = 1;
      for (const child of node.children.values()) {
        count += countNodesRecursive(child);
      }
      return count;
    };
    return countNodesRecursive(this.root);
  }

  getMaxDepth() {
    const getDepthRecursive = (node, depth = 0) => {
      let maxDepth = depth;
      for (const child of node.children.values()) {
        maxDepth = Math.max(maxDepth, getDepthRecursive(child, depth + 1));
      }
      return maxDepth;
    };
    return getDepthRecursive(this.root);
  }

  getAverageDepth() {
    const depths = [];
    const collectDepths = (node, depth = 0) => {
      if (node.isEndOfWord) {
        depths.push(depth);
      }
      for (const child of node.children.values()) {
        collectDepths(child, depth + 1);
      }
    };

    collectDepths(this.root);
    return depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;
  }

  /**
   * Properly dispose of trie resources to prevent memory leaks
   * CODE REVIEW FIX (CRITICAL-1): Added disposal method
   * CRITICAL: Call this before discarding a DictionaryTrie instance
   */
  dispose() {
    // Recursively clear all trie nodes
    if (this.root) {
      this.clearNode(this.root);
      this.root = null;
    }

    this.size = 0;
  }

  /**
   * Recursively clear a trie node and its children
   * @private
   * @param {TrieNode} node - Node to clear
   */
  clearNode(node) {
    if (!node) return;

    // Clear all child nodes recursively
    if (node.children) {
      for (const child of node.children.values()) {
        this.clearNode(child);
      }
      node.children.clear();
      node.children = null;
    }

    // Nullify references for GC
    node.translation = null;
    node.metadata = null;
    node.isEndOfWord = false;
  }
}
