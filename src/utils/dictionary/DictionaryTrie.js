/**
 * Dictionary Trie data structure.
 *
 * @import { TrieMatch } from '../../types/DictionaryManagerTypes'
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
    /** @private Read matches through `findMatches`/`get`; only the dispose test looks at this. */
    this.root = new TrieNode();
    this.size = 0;
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
   * Every dictionary word that starts at `startPos`, shortest first. The one prefix walk:
   * DictionaryManager.findAllMatches and PatternVariableCache both read matches through it.
   *
   * Walks by code point, because `insert` keys the trie by code point: a UTF-16 walk could never
   * match a word holding an astral character (CJK Ext-B, e.g. 𠮷). `startPos` and `endPos` are
   * UTF-16 offsets into `text`, so callers can slice the string with them.
   *
   * @param {string} text - Input text
   * @param {number} startPos - Starting position (UTF-16 offset)
   * @returns {TrieMatch[]} Matches with {word, translation, endPos, metadata}
   */
  findMatches(text, startPos = 0) {
    const matches = [];
    let current = this.root;

    for (let i = startPos; i < text.length;) {
      const codePoint = text.codePointAt(i);
      const char = codePoint > 0xffff ? String.fromCodePoint(codePoint) : text[i];
      i += char.length;

      current = current.children.get(char);
      if (!current) break;

      if (current.isEndOfWord) {
        matches.push({
          word: text.slice(startPos, i),
          translation: current.translation,
          endPos: i,
          metadata: current.metadata,
        });
      }
    }

    return matches;
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
