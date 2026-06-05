/**
 * Dictionary Trie data structure with integrity validation and self-healing.
 *
 * @import {
 *   TrieMatch,
 *   TrieStats,
 *   TrieValidationResult,
 *   TrieRepairResult,
 *   TrieHealthScore,
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
   * Validate trie integrity and detect corruption
   * @returns {Object} Validation results
   */
  validateIntegrity() {
    const validation = {
      timestamp: Date.now(),
      isValid: true,
      errors: [],
      warnings: [],
      statistics: {
        nodesChecked: 0,
        endOfWordNodes: 0,
        emptyTranslations: 0,
        orphanedNodes: 0,
        circularReferences: 0,
        duplicateEntries: 0,
      },
      performance: {
        validationTime: 0,
      },
    };

    const startTime = performance.now();

    try {
      // Track visited nodes to detect circular references
      const visitedNodes = new Set();
      const duplicateTracker = new Map(); // word -> translation mapping

      // Truncate trie paths in diagnostic output to avoid leaking dictionary content
      const truncatePath = (p) => (p.length > 20 ? p.slice(0, 20) + '…' : p);

      // Recursive validation function
      const validateNode = (node, currentPath = '', depth = 0) => {
        validation.statistics.nodesChecked++;
        const safePath = truncatePath(currentPath);

        // Check for circular references
        if (visitedNodes.has(node)) {
          validation.errors.push({
            type: 'CIRCULAR_REFERENCE',
            path: safePath,
            message: `Circular reference detected at path: ${safePath}`,
          });
          validation.statistics.circularReferences++;
          validation.isValid = false;
          return;
        }

        visitedNodes.add(node);

        // Validate node structure
        if (!node.children || typeof node.children.has !== 'function') {
          validation.errors.push({
            type: 'INVALID_NODE_STRUCTURE',
            path: safePath,
            message: `Node missing children Map at path: ${safePath}`,
          });
          validation.isValid = false;
          return;
        }

        // Check end-of-word nodes
        if (node.isEndOfWord) {
          validation.statistics.endOfWordNodes++;

          // Validate translation exists and is not empty
          if (!node.translation || typeof node.translation !== 'string') {
            validation.errors.push({
              type: 'MISSING_TRANSLATION',
              path: safePath,
              word: safePath,
              message: `End-of-word node missing translation: ${safePath}`,
            });
            validation.isValid = false;
          } else if (node.translation.trim().length === 0) {
            validation.warnings.push({
              type: 'EMPTY_TRANSLATION',
              path: safePath,
              word: safePath,
              message: `Empty translation for word: ${safePath}`,
            });
            validation.statistics.emptyTranslations++;
          }

          // Check for duplicate entries (same word, different translation)
          if (currentPath.length > 0) {
            const existingTranslation = duplicateTracker.get(currentPath);
            if (existingTranslation && existingTranslation !== node.translation) {
              validation.warnings.push({
                type: 'DUPLICATE_ENTRY',
                path: safePath,
                word: safePath,
                message: `Duplicate entry detected at: ${safePath}`,
              });
              validation.statistics.duplicateEntries++;
            } else {
              duplicateTracker.set(currentPath, node.translation);
            }
          }
        }

        // Check for orphaned nodes (non-end nodes with no children)
        if (!node.isEndOfWord && node.children.size === 0 && currentPath.length > 0) {
          validation.warnings.push({
            type: 'ORPHANED_NODE',
            path: safePath,
            message: `Orphaned node (no children, not end-of-word): ${safePath}`,
          });
          validation.statistics.orphanedNodes++;
        }

        // Validate children
        for (const [char, childNode] of node.children) {
          // Validate character is single char
          if (!char || char.length !== 1) {
            validation.errors.push({
              type: 'INVALID_CHARACTER',
              path: safePath,
              char: char,
              message: `Invalid character in trie at: ${safePath}`,
            });
            validation.isValid = false;
            continue;
          }

          // Validate child node exists
          if (!childNode || typeof childNode !== 'object') {
            validation.errors.push({
              type: 'INVALID_CHILD_NODE',
              path: currentPath + char,
              message: `Invalid child node at path: ${currentPath + char}`,
            });
            validation.isValid = false;
            continue;
          }

          // Recursively validate child
          validateNode(childNode, currentPath + char, depth + 1);
        }

        visitedNodes.delete(node);
      };

      // Start validation from root
      if (!this.root) {
        validation.errors.push({
          type: 'MISSING_ROOT',
          message: 'Trie missing root node',
        });
        validation.isValid = false;
      } else {
        validateNode(this.root);
      }

      // Validate size consistency
      if (validation.statistics.endOfWordNodes !== this.size) {
        validation.warnings.push({
          type: 'SIZE_MISMATCH',
          expected: this.size,
          actual: validation.statistics.endOfWordNodes,
          message: `Size mismatch: trie.size=${this.size}, actual end-of-word nodes=${validation.statistics.endOfWordNodes}`,
        });
      }
    } catch (error) {
      validation.errors.push({
        type: 'VALIDATION_ERROR',
        message: `Validation failed: ${error.message}`,
        stack: error.stack,
      });
      validation.isValid = false;
    }

    validation.performance.validationTime = performance.now() - startTime;

    return validation;
  }

  /**
   * Repair common trie corruption issues
   * @param {Object} validationResult - Result from validateIntegrity()
   * @returns {Object} Repair results
   */
  repair(validationResult = null) {
    const repairResult = {
      timestamp: Date.now(),
      repairsAttempted: 0,
      repairsSuccessful: 0,
      repairsFailed: 0,
      actions: [],
    };

    // Get validation result if not provided
    const validation = validationResult || this.validateIntegrity();

    if (validation.isValid && validation.errors.length === 0) {
      repairResult.actions.push({
        type: 'NO_REPAIR_NEEDED',
        message: 'Trie is already valid, no repairs needed',
      });
      return repairResult;
    }

    try {
      // Repair size mismatch
      const sizeMismatch = validation.warnings.find((w) => w.type === 'SIZE_MISMATCH');
      if (sizeMismatch) {
        repairResult.repairsAttempted++;
        const oldSize = this.size;
        this.size = sizeMismatch.actual;
        repairResult.repairsSuccessful++;
        repairResult.actions.push({
          type: 'SIZE_CORRECTED',
          oldSize: oldSize,
          newSize: this.size,
          message: `Corrected trie size from ${oldSize} to ${this.size}`,
        });
      }

      // Remove orphaned nodes
      const orphanedNodes = validation.warnings.filter((w) => w.type === 'ORPHANED_NODE');
      if (orphanedNodes.length > 0) {
        repairResult.repairsAttempted++;
        let removedCount = 0;

        const removeOrphans = (node, path = '') => {
          const childrenToRemove = [];

          for (const [char, childNode] of node.children) {
            const childPath = path + char;

            // Check if this child is orphaned
            if (!childNode.isEndOfWord && childNode.children.size === 0) {
              childrenToRemove.push(char);
              removedCount++;
            } else {
              // Recursively check children
              removeOrphans(childNode, childPath);
            }
          }

          // Remove orphaned children
          childrenToRemove.forEach((char) => node.children.delete(char));
        };

        removeOrphans(this.root);

        if (removedCount > 0) {
          repairResult.repairsSuccessful++;
          repairResult.actions.push({
            type: 'ORPHANED_NODES_REMOVED',
            count: removedCount,
            message: `Removed ${removedCount} orphaned nodes`,
          });
        }
      }

      // Report unrepairable errors
      const unreparableErrors = validation.errors.filter(
        (e) => !['SIZE_MISMATCH'].includes(e.type)
      );

      unreparableErrors.forEach((error) => {
        repairResult.repairsFailed++;
        repairResult.actions.push({
          type: 'REPAIR_FAILED',
          error: error.type,
          message: `Could not repair: ${error.message}`,
        });
      });
    } catch (error) {
      repairResult.repairsFailed++;
      repairResult.actions.push({
        type: 'REPAIR_ERROR',
        message: `Repair process failed: ${error.message}`,
      });
    }

    return repairResult;
  }

  /**
   * Get health score for the trie (0-100)
   * @returns {Object} Health assessment
   */
  getHealthScore() {
    const validation = this.validateIntegrity();
    const stats = this.getStats();

    let score = 100;
    const issues = [];

    // Deduct points for errors (critical issues)
    if (validation.errors.length > 0) {
      const errorDeduction = Math.min(50, validation.errors.length * 20);
      score -= errorDeduction;
      issues.push(`${validation.errors.length} critical errors (-${errorDeduction})`);
    }

    // Deduct points for warnings (minor issues)
    if (validation.warnings.length > 0) {
      const warningDeduction = Math.min(25, validation.warnings.length * 5);
      score -= warningDeduction;
      issues.push(`${validation.warnings.length} warnings (-${warningDeduction})`);
    }

    // Performance penalties
    if (stats.maxDepth > 50) {
      score -= 10;
      issues.push(`Deep trie structure (depth: ${stats.maxDepth}) (-10)`);
    }

    if (validation.statistics.emptyTranslations > 0) {
      const emptyDeduction = Math.min(10, validation.statistics.emptyTranslations * 2);
      score -= emptyDeduction;
      issues.push(
        `${validation.statistics.emptyTranslations} empty translations (-${emptyDeduction})`
      );
    }

    return {
      score: Math.max(0, score),
      grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
      issues: issues,
      validation: validation,
      statistics: stats,
      recommendations:
        score < 80
          ? [
              'Consider running repair() to fix common issues',
              'Validate dictionary source data for consistency',
              'Check for duplicate or conflicting entries',
            ]
          : [],
    };
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
