/**
 * Efficient Dictionary Manager with Trie-based lookups
 * Optimizes dictionary operations for fast translation
 * Features intelligent caching for improved performance
 *
 * @import {
 *   TrieNode,
 *   DictionaryEntryMetadata,
 *   TrieMatch,
 *   TrieStats,
 *   TrieValidationResult,
 *   TrieValidationError,
 *   TrieValidationWarning,
 *   TrieValidationStatistics,
 *   TrieValidationPerformance,
 *   TrieRepairResult,
 *   TrieRepairAction,
 *   TrieHealthScore,
 *   DictionaryEntry,
 *   DictionaryData,
 *   DictionaryPriorities,
 *   DictionaryMetadata,
 *   DictionarySearchOrder,
 *   TranslationResult,
 *   DictionaryMatchResult,
 *   DebugLevel,
 *   CacheConfiguration,
 *   DictionaryManagerOptions,
 *   DictionaryLoadOptions,
 *   ParallelLookupStats,
 *   LookupIndexStats,
 *   DictionaryManagerStats
 * } from '../types/DictionaryManagerTypes'
 */

import { TranslationCache } from './TranslationCache.js';

class TrieNode {
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
    // Shared array for findMatches to reduce GC pressure
    this.sharedMatchesArray = [];
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
        metadata: node.metadata
      };
    }
    return null;
  }

  /**
   * Find all words with a given prefix
   * @param {string} prefix - Prefix to search for
   * @returns {Array} Array of {word, translation, metadata}
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
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @returns {Array} Array of {word, translation, endPos, metadata}
   */
  findMatches(text, startPos = 0) {
    // Use shared array and reset it instead of creating new one
    this.sharedMatchesArray.length = 0;
    let current = this.root;
    
    for (let i = startPos; i < text.length; i++) {
      const char = text[i];
      
      if (!current.children.has(char)) {
        break;
      }
      
      current = current.children.get(char);
      
      if (current.isEndOfWord) {
        this.sharedMatchesArray.push({
          word: text.slice(startPos, i + 1),
          translation: current.translation,
          endPos: i + 1,
          metadata: current.metadata
        });
      }
    }
    
    // Return a copy to prevent mutation of shared array
    return this.sharedMatchesArray.slice();
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
   * @param {Array} results - Results array
   */
  dfsCollect(node, prefix, results) {
    if (node.isEndOfWord) {
      results.push({
        word: prefix,
        translation: node.translation,
        metadata: node.metadata
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
      memoryEstimate: `${(this.countNodes() * 200 / 1024 / 1024).toFixed(1)}MB`
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
        duplicateEntries: 0
      },
      performance: {
        validationTime: 0
      }
    };

    const startTime = performance.now();
    
    try {
      // Track visited nodes to detect circular references
      const visitedNodes = new Set();
      const duplicateTracker = new Map(); // word -> translation mapping
      
      // Recursive validation function
      const validateNode = (node, currentPath = '', depth = 0) => {
        validation.statistics.nodesChecked++;
        
        // Check for circular references
        if (visitedNodes.has(node)) {
          validation.errors.push({
            type: 'CIRCULAR_REFERENCE',
            path: currentPath,
            message: `Circular reference detected at path: ${currentPath}`
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
            path: currentPath,
            message: `Node missing children Map at path: ${currentPath}`
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
              path: currentPath,
              word: currentPath,
              message: `End-of-word node missing translation: ${currentPath}`
            });
            validation.isValid = false;
          } else if (node.translation.trim().length === 0) {
            validation.warnings.push({
              type: 'EMPTY_TRANSLATION',
              path: currentPath,
              word: currentPath,
              message: `Empty translation for word: ${currentPath}`
            });
            validation.statistics.emptyTranslations++;
          }
          
          // Check for duplicate entries (same word, different translation)
          if (currentPath.length > 0) {
            const existingTranslation = duplicateTracker.get(currentPath);
            if (existingTranslation && existingTranslation !== node.translation) {
              validation.warnings.push({
                type: 'DUPLICATE_ENTRY',
                path: currentPath,
                word: currentPath,
                existing: existingTranslation,
                current: node.translation,
                message: `Duplicate entry detected: ${currentPath} -> "${existingTranslation}" vs "${node.translation}"`
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
            path: currentPath,
            message: `Orphaned node (no children, not end-of-word): ${currentPath}`
          });
          validation.statistics.orphanedNodes++;
        }
        
        // Validate children
        for (const [char, childNode] of node.children) {
          // Validate character is single char
          if (!char || char.length !== 1) {
            validation.errors.push({
              type: 'INVALID_CHARACTER',
              path: currentPath,
              char: char,
              message: `Invalid character in trie: "${char}" at path: ${currentPath}`
            });
            validation.isValid = false;
            continue;
          }
          
          // Validate child node exists
          if (!childNode || typeof childNode !== 'object') {
            validation.errors.push({
              type: 'INVALID_CHILD_NODE',
              path: currentPath + char,
              message: `Invalid child node at path: ${currentPath + char}`
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
          message: 'Trie missing root node'
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
          message: `Size mismatch: trie.size=${this.size}, actual end-of-word nodes=${validation.statistics.endOfWordNodes}`
        });
      }
      
    } catch (error) {
      validation.errors.push({
        type: 'VALIDATION_ERROR',
        message: `Validation failed: ${error.message}`,
        stack: error.stack
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
      actions: []
    };

    // Get validation result if not provided
    const validation = validationResult || this.validateIntegrity();
    
    if (validation.isValid && validation.errors.length === 0) {
      repairResult.actions.push({
        type: 'NO_REPAIR_NEEDED',
        message: 'Trie is already valid, no repairs needed'
      });
      return repairResult;
    }

    try {
      // Repair size mismatch
      const sizeMismatch = validation.warnings.find(w => w.type === 'SIZE_MISMATCH');
      if (sizeMismatch) {
        repairResult.repairsAttempted++;
        const oldSize = this.size;
        this.size = sizeMismatch.actual;
        repairResult.repairsSuccessful++;
        repairResult.actions.push({
          type: 'SIZE_CORRECTED',
          oldSize: oldSize,
          newSize: this.size,
          message: `Corrected trie size from ${oldSize} to ${this.size}`
        });
      }

      // Remove orphaned nodes
      const orphanedNodes = validation.warnings.filter(w => w.type === 'ORPHANED_NODE');
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
          childrenToRemove.forEach(char => node.children.delete(char));
        };
        
        removeOrphans(this.root);
        
        if (removedCount > 0) {
          repairResult.repairsSuccessful++;
          repairResult.actions.push({
            type: 'ORPHANED_NODES_REMOVED',
            count: removedCount,
            message: `Removed ${removedCount} orphaned nodes`
          });
        }
      }

      // Report unrepairable errors
      const unreparableErrors = validation.errors.filter(e => 
        !['SIZE_MISMATCH'].includes(e.type)
      );
      
      unreparableErrors.forEach(error => {
        repairResult.repairsFailed++;
        repairResult.actions.push({
          type: 'REPAIR_FAILED',
          error: error.type,
          message: `Could not repair: ${error.message}`
        });
      });

    } catch (error) {
      repairResult.repairsFailed++;
      repairResult.actions.push({
        type: 'REPAIR_ERROR',
        message: `Repair process failed: ${error.message}`
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
      issues.push(`${validation.statistics.emptyTranslations} empty translations (-${emptyDeduction})`);
    }

    return {
      score: Math.max(0, score),
      grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
      issues: issues,
      validation: validation,
      statistics: stats,
      recommendations: score < 80 ? [
        'Consider running repair() to fix common issues',
        'Validate dictionary source data for consistency',
        'Check for duplicate or conflicting entries'
      ] : []
    };
  }
}

// Debug logging levels  
const DEBUG_LEVELS = {
  ERROR: 0,   // Only errors and warnings
  INFO: 1,    // Key milestones and results
  DEBUG: 2,   // Detailed phase information
  VERBOSE: 3  // Ultra-detailed token-by-token logging
};

export class DictionaryManager {
  constructor(options = {}) {
    this.dictionaries = new Map(); // Map of dictionary name to DictionaryTrie
    this.metadata = new Map(); // Dictionary metadata
    this.pendingDictionaries = null; // Phase 4: Dictionaries awaiting lazy loading
    this.loadTime = 0;
    this.ready = false;
    this.debugLevel = DEBUG_LEVELS.INFO; // Default to INFO level
    
    // Initialize translation caching system
    this.cache = new TranslationCache({
      characterCacheSize: options.characterCacheSize || 500,
      phraseCacheSize: options.phraseCacheSize || 1000,
      patternCacheSize: options.patternCacheSize || 200,
      lookupCacheSize: options.lookupCacheSize || 800,
      enabled: options.cacheEnabled !== false // Default to enabled
    });
    
    // Parallel processing configuration
    this.enableParallelLookups = options.enableParallelLookups !== false; // Default true
    this.maxParallelDictionaries = options.maxParallelDictionaries || 10; // Limit concurrent lookups
    this.dictionaryParallelThreshold = 2; // Minimum dictionaries for parallel processing
    
    // Performance monitoring for parallel operations
    this.parallelLookupStats = {
      parallelCalls: 0,
      sequentialCalls: 0,
      averageParallelTime: 0,
      averageSequentialTime: 0,
      fallbackCount: 0
    };

    // Performance monitoring for lookup indexing optimization
    this.lookupIndexStats = {
      buildCalls: 0,
      avgBuildTime: 0,
      lastIndexSize: 0,
      savedLookups: 0,
      totalSavedTime: 0
    };
  }

  /**
   * Log message based on debug level
   * @param {number} level - Debug level required
   * @param {string} message - Message to log
   * @param {*} data - Optional data to log
   */
  log(level, message, data = null) {
    if (this.debugLevel >= level) {
      // CRITICAL ERRORS (level 0) always show, regardless of NODE_ENV
      const isCritical = level === DEBUG_LEVELS.ERROR;
      const isDevelopment = process.env.NODE_ENV === 'development';

      if (isCritical || isDevelopment) {
        if (data !== null) {
          console.log(message, data);
        } else {
          console.log(message);
        }
      }
    }
  }

  /**
   * Load dictionaries from dictionary objects
   * @param {Object} dictionaryData - Dictionary data {name: {source: target}}
   * @param {Object} options - Loading options
   */
  async loadDictionaries(dictionaryData, options = {}) {
    const startTime = performance.now();
    
    // Set debug level from options
    this.debugLevel = options.debugLevel !== undefined ? options.debugLevel : DEBUG_LEVELS.INFO;
    
    this.log(DEBUG_LEVELS.INFO, 'Loading dictionaries into trie structures...');
    
    // Clear existing dictionaries
    this.dictionaries.clear();
    this.metadata.clear();

    const priorities = options.priorities || {
      properNouns: 1,
      patterns: 2,
      phrases: 3,
      characters: 4,
      punctuation: 5,
      conversion: 6
    };

    // Phase 4 Optimization: Filter dictionaries for lazy loading
    const filteredDictionaries = this.filterActiveDictionaries(dictionaryData, options);
    this.pendingDictionaries = this.getPendingDictionaries(dictionaryData, filteredDictionaries);
    
    this.log(DEBUG_LEVELS.DEBUG, `📊 Lazy loading: ${Object.keys(filteredDictionaries).length} active, ${Object.keys(this.pendingDictionaries).length} pending`);

    // Load each active dictionary
    for (const [dictionaryName, dictionary] of Object.entries(filteredDictionaries)) {
      if (!dictionary || typeof dictionary !== 'object') {
        this.log(DEBUG_LEVELS.ERROR, `Skipping invalid dictionary: ${dictionaryName}`);
        continue;
      }

      const trie = new DictionaryTrie();
      let entryCount = 0;

      // Insert all entries into the trie
      for (const [source, target] of Object.entries(dictionary)) {
        if (typeof source === 'string') {
          let translation, allowAsPatternVariable = false;
          
          // Handle both old format (string) and new format (object with metadata)
          if (typeof target === 'string') {
            // Old format: "source": "translation"
            translation = target;
          } else if (typeof target === 'object' && target.translation) {
            // New format: "source": {"translation": "...", "allowAsPatternVariable": true}
            translation = target.translation;
            allowAsPatternVariable = target.allowAsPatternVariable === true;
          } else {
            this.log(DEBUG_LEVELS.ERROR, `Invalid entry format for "${source}" in dictionary "${dictionaryName}"`);
            continue;
          }
          
          // Assign priority: proper noun dictionaries get priority 1, others use defaults
          let priority = priorities[dictionaryName];
          if (!priority) {
            // If not in priorities list, check if it's a proper noun dictionary
            priority = dictionaryName.startsWith('properNouns') ? 1 : 10;
          }
          
          const metadata = {
            dictionary: dictionaryName,
            priority: priority,
            frequency: this.estimateFrequency(source, dictionaryName),
            allowAsPatternVariable: allowAsPatternVariable
          };
          
          trie.insert(source, translation, metadata);
          entryCount++;
        }
      }

      this.dictionaries.set(dictionaryName, trie);
      
      // Use the same priority logic for metadata
      let metadataPriority = priorities[dictionaryName];
      if (!metadataPriority) {
        metadataPriority = dictionaryName.startsWith('properNouns') ? 1 : 10;
      }
      
      this.metadata.set(dictionaryName, {
        name: dictionaryName,
        entryCount,
        priority: metadataPriority,
        stats: trie.getStats()
      });

      this.log(DEBUG_LEVELS.DEBUG, `Loaded ${dictionaryName}: ${entryCount} entries`);
    }

    this.loadTime = performance.now() - startTime;
    this.ready = true;
    
    this.log(DEBUG_LEVELS.INFO, `✅ Dictionary loading completed in ${this.loadTime.toFixed(2)}ms`);
    this.log(DEBUG_LEVELS.DEBUG, '📊 Dictionary stats:', this.getGlobalStats());

    // Pre-warm cache with novel-specific vocabulary if enabled
    if (options.preWarmCache !== false) {
      const activeProperNouns = options.activeProperNouns || [];
      const preWarmOptions = {
        novelSpecific: true,
        activeProperNouns: activeProperNouns
      };
      
      try {
        const preWarmResult = await this.cache.preWarmCaches(this, preWarmOptions);
        if (preWarmResult.success) {
          this.log(DEBUG_LEVELS.INFO, 
            `🔥 Cache pre-warmed: ${preWarmResult.charactersWarmed} characters, ` +
            `${preWarmResult.phrasesWarmed} phrases, ${preWarmResult.properNounsWarmed} proper nouns ` +
            `in ${preWarmResult.timeMs}ms`);
        }
      } catch (error) {
        this.log(DEBUG_LEVELS.WARN, `⚠️ Cache pre-warming failed: ${error.message}`);
      }
    }
  }

  /**
   * Estimate frequency for sorting (simple heuristic)
   * @param {string} source - Source text
   * @param {string} dictionaryName - Dictionary name
   * @returns {number} Estimated frequency score
   */
  estimateFrequency(source, dictionaryName) {
    // Simple heuristics for frequency estimation
    let score = 1;
    
    // Shorter entries are often more frequent
    score += Math.max(0, 10 - source.length);
    
    // Dictionary-specific adjustments
    if (dictionaryName === 'characters') score += 5;
    if (dictionaryName === 'phrases' && source.length <= 3) score += 3;
    
    return score;
  }

  /**
   * Find translation for a word across all dictionaries
   * @param {string} word - Word to translate
   * @param {Array} dictionaryOrder - Specific order of dictionaries to check
   * @returns {Object|null} Translation result with metadata
   */
  translate(word, dictionaryOrder = null) {
    if (!this.ready) {
      this.log(DEBUG_LEVELS.ERROR, 'Dictionary manager not ready');
      return null;
    }

    const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();
    
    // Check cache first for multi-dictionary lookup
    const cachedResult = this.cache.getLookup(word, searchOrder);
    if (cachedResult) {
      return cachedResult;
    }
    
    for (const dictionaryName of searchOrder) {
      const dictionary = this.dictionaries.get(dictionaryName);
      if (!dictionary) continue;

      // Check individual dictionary cache
      let result;
      if (word.length === 1) {
        // Character lookup - use character cache
        result = this.cache.getCharacter(word, dictionaryName);
        if (!result) {
          result = dictionary.getWithMetadata(word);
          if (result) {
            // Cache the character translation
            const translationResult = {
              word,
              translation: result.translation,
              dictionary: dictionaryName,
              metadata: result.metadata
            };
            this.cache.setCharacter(word, dictionaryName, translationResult);
            result = translationResult;
          }
        }
      } else {
        // Phrase lookup - use phrase cache
        result = this.cache.getPhrase(word, dictionaryName);
        if (!result) {
          result = dictionary.getWithMetadata(word);
          if (result) {
            // Cache the phrase translation
            const translationResult = {
              word,
              translation: result.translation,
              dictionary: dictionaryName,
              metadata: result.metadata
            };
            this.cache.setPhrase(word, dictionaryName, translationResult);
            result = translationResult;
          }
        }
      }

      if (result) {
        // Cache the multi-dictionary lookup result
        this.cache.setLookup(word, searchOrder, result);
        return result;
      }
    }

    // Cache negative result to avoid repeated failed lookups
    this.cache.setLookup(word, searchOrder, null);
    return null;
  }

  /**
   * Thread-safe findMatches implementation that doesn't use shared arrays
   * @param {DictionaryTrie} dictionary - Dictionary trie to search
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @returns {Array} Matches from this dictionary
   */
  findMatchesThreadSafe(dictionary, text, startPos = 0) {
    const matches = [];
    let current = dictionary.root;
    
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
          metadata: current.metadata
        });
      }
    }
    
    return matches;
  }

  /**
   * Find all matches using parallel dictionary lookups with thread safety
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {Array} dictionaryOrder - Dictionary search order
   * @returns {Promise<Array>} All matches sorted by priority and length
   */
  async findAllMatchesParallel(text, startPos = 0, dictionaryOrder = null) {
    if (!this.ready) return [];

    const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();
    const startTime = performance.now();
    
    try {
      // Create parallel lookup promises with thread-safe operations
      const lookupPromises = searchOrder.map(async (dictionaryName) => {
        const dictionary = this.dictionaries.get(dictionaryName);
        if (!dictionary) return { dictionaryName, matches: [], success: true };
        
        try {
          // Use thread-safe findMatches implementation
          const matches = this.findMatchesThreadSafe(dictionary, text, startPos);
          const priority = this.metadata.get(dictionaryName)?.priority || 10;
          
          // Add metadata to matches
          const enrichedMatches = matches.map(match => ({
            ...match,
            dictionary: dictionaryName,
            priority
          }));
          
          return { dictionaryName, matches: enrichedMatches, success: true };
        } catch (error) {
          // Log error but don't fail entire lookup
          if (typeof console !== 'undefined') {
            console.error(`Dictionary lookup failed for ${dictionaryName}:`, error);
          }
          return { dictionaryName, matches: [], success: false, error };
        }
      });
      
      // Wait for all parallel lookups to complete
      const lookupResults = await Promise.all(lookupPromises);
      
      // Check for any failures
      const failures = lookupResults.filter(result => !result.success);
      if (failures.length > 0) {
        if (typeof console !== 'undefined') {
          console.warn(`${failures.length} dictionary lookups failed, proceeding with available results`);
        }
      }
      
      // Combine successful results
      const allMatches = lookupResults
        .filter(result => result.success)
        .flatMap(result => result.matches);
      
      // Sort by priority (lower number = higher priority) and then by length (longer first)
      const sortedMatches = allMatches.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.word.length - a.word.length;
      });
      
      const lookupTime = performance.now() - startTime;
      
      // Record performance metrics
      if (this.parallelLookupStats) {
        this.parallelLookupStats.parallelCalls++;
        this.parallelLookupStats.averageParallelTime = 
          (this.parallelLookupStats.averageParallelTime + lookupTime) / 2;
      }
      
      return sortedMatches;
      
    } catch (error) {
      if (typeof console !== 'undefined') {
        console.error('Parallel dictionary lookup failed, falling back to sequential:', error);
      }
      
      // Record fallback
      if (this.parallelLookupStats) {
        this.parallelLookupStats.fallbackCount = (this.parallelLookupStats.fallbackCount || 0) + 1;
      }
      
      return this.findAllMatchesSequential(text, startPos, dictionaryOrder);
    }
  }

  /**
   * Sequential fallback method (renamed from original findAllMatches)
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {Array} dictionaryOrder - Dictionary search order
   * @returns {Array} All matches sorted by priority and length
   */
  findAllMatchesSequential(text, startPos = 0, dictionaryOrder = null) {
    if (!this.ready) return [];

    const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();
    const allMatches = [];
    const startTime = performance.now();

    for (const dictionaryName of searchOrder) {
      const dictionary = this.dictionaries.get(dictionaryName);
      if (!dictionary) continue;

      try {
        // Use thread-safe method instead of potentially unsafe shared array method
        const matches = this.findMatchesThreadSafe(dictionary, text, startPos);
        
        // Add dictionary info to each match
        matches.forEach(match => {
          match.dictionary = dictionaryName;
          match.priority = this.metadata.get(dictionaryName)?.priority || 10;
        });

        allMatches.push(...matches);
      } catch (error) {
        if (typeof console !== 'undefined') {
          console.error(`Dictionary ${dictionaryName} lookup failed:`, error);
        }
        // Continue with other dictionaries
      }
    }

    const lookupTime = performance.now() - startTime;
    
    // Record performance metrics
    if (this.parallelLookupStats) {
      this.parallelLookupStats.sequentialCalls++;
      this.parallelLookupStats.averageSequentialTime = 
        (this.parallelLookupStats.averageSequentialTime + lookupTime) / 2;
    }

    // Sort by priority (lower number = higher priority) and then by length (longer first)
    return allMatches.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return b.word.length - a.word.length;
    });
  }

  /**
   * Find all possible matches for text at a position across all dictionaries
   * This is the main synchronous method for backward compatibility
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {Array} dictionaryOrder - Dictionary search order
   * @returns {Array} All possible matches sorted by priority and length
   */
  findAllMatches(text, startPos = 0, dictionaryOrder = null) {
    // Always use sequential processing for backward compatibility
    // Parallel processing is opt-in via findAllMatchesAsync
    return this.findAllMatchesSequential(text, startPos, dictionaryOrder);
  }
  
  /**
   * Find all possible matches with automatic parallel/sequential selection
   * This is the async method that chooses the best processing approach
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {Array} dictionaryOrder - Dictionary search order
   * @returns {Promise<Array>} All possible matches sorted by priority and length
   */
  async findAllMatchesAsync(text, startPos = 0, dictionaryOrder = null) {
    if (!this.ready) return [];

    const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();
    
    // Decide whether to use parallel processing
    const shouldUseParallel = this.enableParallelLookups && 
                             searchOrder.length >= this.dictionaryParallelThreshold;
    
    let results;
    if (shouldUseParallel) {
      results = await this.findAllMatchesParallel(text, startPos, dictionaryOrder);
    } else {
      results = await this.findAllMatchesSequential(text, startPos, dictionaryOrder);
    }
    
    return results;
  }

  /**
   * Find the best translation for text at a position
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {Array} dictionaryOrder - Dictionary search order
   * @returns {Object|null} Best match
   */
  findBestMatch(text, startPos = 0, dictionaryOrder = null) {
    const matches = this.findAllMatches(text, startPos, dictionaryOrder);
    return matches.length > 0 ? matches[0] : null;
  }
  
  /**
   * Find the best translation for text at a position (async version with parallel processing)
   * @param {string} text - Input text
   * @param {number} startPos - Starting position
   * @param {Array} dictionaryOrder - Dictionary search order
   * @returns {Promise<Object|null>} Best match
   */
  async findBestMatchAsync(text, startPos = 0, dictionaryOrder = null) {
    const matches = await this.findAllMatchesAsync(text, startPos, dictionaryOrder);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Build comprehensive lookup index for all dictionary types and positions
   * This pre-computes all possible matches to eliminate redundant trie traversals
   * @param {string} text - Input text to analyze
   * @param {Object} options - Lookup options
   * @returns {Promise<Map>} Lookup index: position -> {matches by dictionary category}
   */
  async buildComprehensiveLookupIndex(text, options = {}) {
    if (!this.ready) return new Map();
    
    const startTime = performance.now();
    const lookupIndex = new Map();
    const enableLookupIndexing = options.enableLookupIndexing !== false; // Default to true
    
    // Skip indexing for very short texts (overhead not worth it)
    if (!enableLookupIndexing || text.length < 50) {
      if (typeof console !== 'undefined' && process.env.NODE_ENV === 'development') {
        console.log('⚡ Skipping lookup indexing for short text or disabled feature');
      }
      return lookupIndex;
    }
    
    try {
      // Get all dictionaries that should be searched
      const searchOrder = options.dictionaryOrder || this.getDefaultSearchOrder();
      const totalPositions = text.length;
      let positionsWithMatches = 0;
      
      // PERFORMANCE: Disable lookup index logging for speed
      // if (typeof console !== 'undefined' && process.env.NODE_ENV === 'development') {
      //   console.log(`🚀 Building lookup index for ${totalPositions} positions across ${searchOrder.length} dictionaries`);
      // }
      
      // Build index for each text position
      for (let pos = 0; pos < totalPositions; pos++) {
        // Find all matches starting at this position
        const allMatches = await this.findAllMatchesSequential(text, pos, searchOrder);
        
        if (allMatches.length > 0) {
          // Categorize matches by dictionary type for different phases
          const categorizedMatches = {
            patterns: allMatches.filter(m => this.isDictionaryType(m.dictionary, 'patterns')),
            properNouns: allMatches.filter(m => this.isDictionaryType(m.dictionary, 'properNouns')),
            phrases: allMatches.filter(m => this.isDictionaryType(m.dictionary, 'phrases')), 
            characters: allMatches.filter(m => this.isDictionaryType(m.dictionary, 'characters')),
            numbers: allMatches.filter(m => this.isDictionaryType(m.dictionary, 'numbers'))
          };
          
          // Only store position if it has matches for any category
          const hasAnyMatches = Object.values(categorizedMatches).some(matches => matches.length > 0);
          if (hasAnyMatches) {
            lookupIndex.set(pos, categorizedMatches);
            positionsWithMatches++;
          }
        }
        
        // PERFORMANCE: Disable progress logging
        // if (typeof console !== 'undefined' && process.env.NODE_ENV === 'development' && 
        //     pos > 0 && pos % 1000 === 0) {
        //   console.log(`🔍 Lookup index progress: ${pos}/${totalPositions} positions (${positionsWithMatches} with matches)`);
        // }
      }
      
      const indexTime = performance.now() - startTime;
      const _avgTimePerPosition = indexTime / totalPositions;
      
      // PERFORMANCE: Disable completion logging
      // if (typeof console !== 'undefined' && process.env.NODE_ENV === 'development') {
      //   console.log(`✅ Lookup index built: ${positionsWithMatches}/${totalPositions} positions with matches in ${indexTime.toFixed(1)}ms (${avgTimePerPosition.toFixed(2)}ms/pos)`);
      // }
      
      // Record performance metrics
      if (this.lookupIndexStats) {
        this.lookupIndexStats.buildCalls = (this.lookupIndexStats.buildCalls || 0) + 1;
        this.lookupIndexStats.avgBuildTime = this.lookupIndexStats.avgBuildTime 
          ? (this.lookupIndexStats.avgBuildTime + indexTime) / 2 
          : indexTime;
        this.lookupIndexStats.lastIndexSize = positionsWithMatches;
      }
      
      return lookupIndex;
      
    } catch (error) {
      if (typeof console !== 'undefined') {
        console.error('🚨 Lookup index building failed:', error);
      }
      
      // Return empty index on failure - phases will fall back to individual lookups
      return new Map();
    }
  }

  /**
   * Determine if a dictionary belongs to a specific category/type
   * @param {string} dictionaryName - Name of the dictionary
   * @param {string} category - Category to check ('patterns', 'properNouns', 'phrases', 'characters', 'numbers')
   * @returns {boolean} True if dictionary matches category
   */
  isDictionaryType(dictionaryName, category) {
    const metadata = this.metadata.get(dictionaryName);
    if (!metadata) return false;
    
    // Map dictionary names to categories based on naming patterns and metadata
    switch (category) {
      case 'patterns':
        return dictionaryName.includes('pattern') || metadata.type === 'patterns';
        
      case 'properNouns': 
        return dictionaryName.includes('proper') || 
               dictionaryName.includes('noun') ||
               dictionaryName.includes('character') ||
               dictionaryName.includes('place') ||
               metadata.type === 'properNouns';
               
      case 'phrases':
        return dictionaryName.includes('phrase') || 
               dictionaryName === 'phrases' ||
               metadata.type === 'phrases';
               
      case 'characters':
        return dictionaryName === 'characters' || metadata.type === 'characters';
        
      case 'numbers':
        return dictionaryName.includes('number') || metadata.type === 'numbers';
        
      default:
        return false;
    }
  }

  /**
   * Get matches from lookup index for a specific position and category
   * @param {Map} lookupIndex - Pre-built lookup index
   * @param {number} position - Text position
   * @param {string} category - Dictionary category ('patterns', 'properNouns', 'phrases', 'characters')
   * @returns {Array} Matches for the category at this position
   */
  getIndexedMatches(lookupIndex, position, category) {
    const positionMatches = lookupIndex.get(position);
    if (!positionMatches) return [];

    // Handle both camelCase (JavaScript) and snake_case (Rust) field names
    // Rust uses: proper_nouns, JavaScript uses: properNouns
    const categoryMap = {
      'properNouns': 'proper_nouns',  // Map JavaScript name to Rust name
      'phrases': 'phrases',
      'characters': 'characters',
      'patterns': 'patterns',
      'numbers': 'numbers',
    };

    // Try the category directly first (for JavaScript-built indexes)
    let matches = positionMatches[category];

    // If not found and category is camelCase, try snake_case (for Rust-built indexes)
    if (!matches && categoryMap[category]) {
      matches = positionMatches[categoryMap[category]];
    }

    return matches || [];
  }

  /**
   * Get default search order based on dictionary priorities
   * @returns {Array} Dictionary names in search order
   */
  getDefaultSearchOrder() {
    return Array.from(this.metadata.entries())
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([name]) => name);
  }

  /**
   * Get specific dictionary trie
   * @param {string} name - Dictionary name
   * @returns {DictionaryTrie|null} Dictionary trie
   */
  getDictionary(name) {
    return this.dictionaries.get(name) || null;
  }

  /**
   * Check if manager is ready
   * @returns {boolean} Ready state
   */
  isReady() {
    return this.ready;
  }

  /**
   * Get global statistics
   * @returns {Object} Global stats
   */
  getGlobalStats() {
    const stats = {
      dictionaryCount: this.dictionaries.size,
      totalEntries: 0,
      totalNodes: 0,
      loadTime: this.loadTime,
      dictionaries: {}
    };

    for (const [name, metadata] of this.metadata.entries()) {
      stats.totalEntries += metadata.entryCount;
      stats.totalNodes += metadata.stats.nodeCount;
      stats.dictionaries[name] = metadata;
    }

    return stats;
  }

  /**
   * Clear all dictionaries
   */
  clear() {
    this.dictionaries.clear();
    this.metadata.clear();
    this.ready = false;
    this.loadTime = 0;
    this.cache.clear(); // Clear translation cache
  }

  /**
   * Get cache statistics for performance monitoring
   * @returns {Object} Cache performance statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get cache memory usage information
   * @returns {Object} Memory usage statistics
   */
  getCacheMemoryUsage() {
    return this.cache.getMemoryUsage();
  }

  /**
   * Enable or disable translation caching
   * @param {boolean} enabled - Whether to enable caching
   */
  setCacheEnabled(enabled) {
    this.cache.setEnabled(enabled);
  }

  /**
   * Invalidate cache entries for a specific dictionary
   * Called when dictionary is reloaded or modified
   * @param {string} dictionaryName - Dictionary name to invalidate
   */
  invalidateCache(dictionaryName) {
    this.cache.invalidateDictionary(dictionaryName);
  }

  /**
   * Clear all translation caches
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get sorting performance statistics
   * Phase 6/7: Dictionary sorting and performance monitoring
   * @returns {Object} Sorting performance stats
   */
  getSortingStats() {
    // This will be provided by the context that imports the sorter
    return {
      message: 'Sorting stats available via DictionaryContext.getSortingStats()'
    };
  }

  /**
   * Phase 4: Filter dictionaries for lazy loading
   * Only loads active proper noun dictionaries and core dictionaries
   * @param {Object} dictionaryData - All available dictionaries
   * @param {Object} options - Options including activeProperNouns
   * @returns {Object} Filtered dictionaries to load immediately
   */
  filterActiveDictionaries(dictionaryData, options = {}) {
    const activeProperNouns = options.activeProperNouns || ['properNouns'];
    const filteredDictionaries = {};
    
    for (const [dictionaryName, dictionary] of Object.entries(dictionaryData)) {
      // Always load core dictionaries (not proper nouns)
      if (!dictionaryName.startsWith('properNouns')) {
        filteredDictionaries[dictionaryName] = dictionary;
      }
      // Only load active proper noun dictionaries
      else if (activeProperNouns.includes(dictionaryName)) {
        filteredDictionaries[dictionaryName] = dictionary;
        this.log(DEBUG_LEVELS.DEBUG, `✅ Loading active proper noun dictionary: ${dictionaryName}`);
      } else {
        this.log(DEBUG_LEVELS.DEBUG, `⏭️ Skipping inactive proper noun dictionary: ${dictionaryName}`);
      }
    }
    
    return filteredDictionaries;
  }

  /**
   * Get dictionaries that were not loaded immediately (for lazy loading)
   * @param {Object} allDictionaries - All available dictionaries
   * @param {Object} loadedDictionaries - Dictionaries that were loaded
   * @returns {Object} Dictionaries pending lazy loading
   */
  getPendingDictionaries(allDictionaries, loadedDictionaries) {
    const pending = {};
    
    for (const [dictionaryName, dictionary] of Object.entries(allDictionaries)) {
      if (!loadedDictionaries[dictionaryName]) {
        pending[dictionaryName] = dictionary;
      }
    }
    
    return pending;
  }

  /**
   * Lazy load a pending dictionary on-demand
   * @param {string} dictionaryName - Name of dictionary to load
   * @returns {boolean} Success status
   */
  async lazyLoadDictionary(dictionaryName) {
    if (!this.pendingDictionaries || !this.pendingDictionaries[dictionaryName]) {
      this.log(DEBUG_LEVELS.DEBUG, `❌ Dictionary "${dictionaryName}" not available for lazy loading`);
      return false;
    }

    this.log(DEBUG_LEVELS.DEBUG, `🔄 Lazy loading dictionary: ${dictionaryName}`);

    const dictionary = this.pendingDictionaries[dictionaryName];
    const trie = new DictionaryTrie();
    let entryCount = 0;

    // Insert all entries into the trie
    for (const [key, value] of Object.entries(dictionary)) {
      if (typeof value === 'string') {
        trie.insert(key, value);
        entryCount++;
      } else if (typeof value === 'object' && value.translation) {
        trie.insert(key, value.translation);
        entryCount++;
      }
    }

    // Store dictionary and metadata
    this.dictionaries.set(dictionaryName, trie);
    this.metadata.set(dictionaryName, {
      name: dictionaryName,
      entryCount,
      priority: this.getDefaultPriority(dictionaryName),
      stats: trie.getStats()
    });

    // Remove from pending
    delete this.pendingDictionaries[dictionaryName];

    this.log(DEBUG_LEVELS.INFO, `✅ Lazy loaded ${dictionaryName}: ${entryCount} entries`);
    return true;
  }

  /**
   * Get default priority for a dictionary name
   * @param {string} dictionaryName - Dictionary name
   * @returns {number} Priority value
   */
  getDefaultPriority(dictionaryName) {
    if (dictionaryName.startsWith('properNouns')) return 1;
    if (dictionaryName === 'patterns') return 2;
    if (dictionaryName === 'phrases') return 3;
    if (dictionaryName === 'characters') return 4;
    if (dictionaryName === 'punctuation') return 5;
    if (dictionaryName === 'conversion') return 6;
    return 7; // Unknown dictionaries get lowest priority
  }

  /**
   * Get priority for a specific dictionary (checks loaded metadata first, then defaults)
   * @param {string} dictionaryName - Dictionary name
   * @returns {number} Priority value
   */
  getPriorityForDictionary(dictionaryName) {
    // First check if the dictionary is loaded and has metadata with priority
    const dictMetadata = this.metadata.get(dictionaryName);
    if (dictMetadata && typeof dictMetadata.priority === 'number') {
      return dictMetadata.priority;
    }
    
    // Fall back to default priority
    return this.getDefaultPriority(dictionaryName);
  }

  /**
   * Get lazy loading statistics
   * @returns {Object} Lazy loading stats
   */
  getLazyLoadingStats() {
    return {
      loadedDictionaries: Array.from(this.dictionaries.keys()),
      pendingDictionaries: this.pendingDictionaries ? Object.keys(this.pendingDictionaries) : [],
      totalLoaded: this.dictionaries.size,
      totalPending: this.pendingDictionaries ? Object.keys(this.pendingDictionaries).length : 0
    };
  }

  /**
   * Validate integrity of all loaded dictionaries
   * @returns {Object} Comprehensive validation results
   */
  validateAllDictionaries() {
    const overallValidation = {
      timestamp: Date.now(),
      totalDictionaries: this.dictionaries.size,
      validDictionaries: 0,
      invalidDictionaries: 0,
      validationResults: new Map(),
      summary: {
        totalErrors: 0,
        totalWarnings: 0,
        totalNodesChecked: 0,
        totalValidationTime: 0
      },
      healthScores: [],
      recommendations: []
    };

    this.log(1, `🔍 Starting dictionary validation for ${this.dictionaries.size} loaded dictionaries...`);

    for (const [dictionaryName, trie] of this.dictionaries) {
      this.log(2, `🔍 Validating dictionary: ${dictionaryName}...`);
      
      const validation = trie.validateIntegrity();
      const healthScore = trie.getHealthScore();
      
      overallValidation.validationResults.set(dictionaryName, {
        validation,
        healthScore,
        dictionaryName
      });

      // Update summary statistics
      overallValidation.summary.totalErrors += validation.errors.length;
      overallValidation.summary.totalWarnings += validation.warnings.length;
      overallValidation.summary.totalNodesChecked += validation.statistics.nodesChecked;
      overallValidation.summary.totalValidationTime += validation.performance.validationTime;
      overallValidation.healthScores.push({
        dictionary: dictionaryName,
        score: healthScore.score,
        grade: healthScore.grade
      });

      if (validation.isValid) {
        overallValidation.validDictionaries++;
        this.log(2, `✅ Dictionary "${dictionaryName}" validation passed (Score: ${healthScore.score}/100)`);
      } else {
        overallValidation.invalidDictionaries++;
        this.log(1, `❌ Dictionary "${dictionaryName}" validation failed (Score: ${healthScore.score}/100)`, {
          errors: validation.errors.length,
          warnings: validation.warnings.length
        });
        
        // Add specific recommendations for failed dictionaries
        overallValidation.recommendations.push(
          `Dictionary "${dictionaryName}" needs attention: ${healthScore.issues.join(', ')}`
        );
      }
    }

    // Calculate overall health
    const avgHealthScore = overallValidation.healthScores.length > 0 
      ? overallValidation.healthScores.reduce((sum, score) => sum + score.score, 0) / overallValidation.healthScores.length
      : 0;

    overallValidation.overallHealth = {
      averageScore: avgHealthScore,
      grade: avgHealthScore >= 90 ? 'A' : avgHealthScore >= 80 ? 'B' : avgHealthScore >= 70 ? 'C' : avgHealthScore >= 60 ? 'D' : 'F',
      status: overallValidation.invalidDictionaries === 0 ? 'HEALTHY' : 'NEEDS_ATTENTION'
    };

    // Add overall recommendations
    if (overallValidation.summary.totalErrors > 0) {
      overallValidation.recommendations.unshift('Critical errors detected - run repairAllDictionaries() to fix common issues');
    }
    if (avgHealthScore < 80) {
      overallValidation.recommendations.unshift('Overall dictionary health below 80% - consider data validation and cleanup');
    }

    // Log summary
    this.log(1, `📊 Dictionary validation completed:`, {
      totalDictionaries: overallValidation.totalDictionaries,
      validDictionaries: overallValidation.validDictionaries,
      invalidDictionaries: overallValidation.invalidDictionaries,
      averageHealthScore: avgHealthScore.toFixed(1),
      totalErrors: overallValidation.summary.totalErrors,
      totalWarnings: overallValidation.summary.totalWarnings,
      validationTimeMs: overallValidation.summary.totalValidationTime.toFixed(1)
    });

    return overallValidation;
  }

  /**
   * Repair common issues in all dictionaries
   * @returns {Object} Repair results for all dictionaries
   */
  repairAllDictionaries() {
    const overallRepair = {
      timestamp: Date.now(),
      totalDictionaries: this.dictionaries.size,
      dictionariesRepaired: 0,
      repairResults: new Map(),
      summary: {
        totalRepairsAttempted: 0,
        totalRepairsSuccessful: 0,
        totalRepairsFailed: 0
      }
    };

    this.log(1, `🔧 Starting dictionary repair for ${this.dictionaries.size} loaded dictionaries...`);

    for (const [dictionaryName, trie] of this.dictionaries) {
      this.log(2, `🔧 Repairing dictionary: ${dictionaryName}...`);
      
      const repairResult = trie.repair();
      overallRepair.repairResults.set(dictionaryName, repairResult);

      // Update summary statistics
      overallRepair.summary.totalRepairsAttempted += repairResult.repairsAttempted;
      overallRepair.summary.totalRepairsSuccessful += repairResult.repairsSuccessful;
      overallRepair.summary.totalRepairsFailed += repairResult.repairsFailed;

      if (repairResult.repairsSuccessful > 0 || repairResult.repairsAttempted > 0) {
        overallRepair.dictionariesRepaired++;
        this.log(1, `🔧 Dictionary "${dictionaryName}" repairs:`, {
          attempted: repairResult.repairsAttempted,
          successful: repairResult.repairsSuccessful,
          failed: repairResult.repairsFailed
        });
      } else {
        this.log(2, `✅ Dictionary "${dictionaryName}" needs no repairs`);
      }
    }

    // Log summary
    this.log(1, `📊 Dictionary repair completed:`, {
      totalDictionaries: overallRepair.totalDictionaries,
      dictionariesRepaired: overallRepair.dictionariesRepaired,
      totalRepairsAttempted: overallRepair.summary.totalRepairsAttempted,
      totalRepairsSuccessful: overallRepair.summary.totalRepairsSuccessful,
      totalRepairsFailed: overallRepair.summary.totalRepairsFailed
    });

    return overallRepair;
  }

  /**
   * Get comprehensive health report for all dictionaries
   * @returns {Object} Health report with scores and recommendations
   */
  getDictionaryHealthReport() {
    const validation = this.validateAllDictionaries();
    
    const healthReport = {
      timestamp: Date.now(),
      overallHealth: validation.overallHealth,
      dictionaryScores: validation.healthScores,
      criticalIssues: [],
      recommendations: validation.recommendations,
      statistics: {
        ...validation.summary,
        dictionariesByGrade: {
          A: 0, B: 0, C: 0, D: 0, F: 0
        }
      }
    };

    // Count dictionaries by grade
    validation.healthScores.forEach(score => {
      healthReport.statistics.dictionariesByGrade[score.grade]++;
    });

    // Identify critical issues
    for (const [dictionaryName, result] of validation.validationResults) {
      const criticalErrors = result.validation.errors.filter(error => 
        ['CIRCULAR_REFERENCE', 'MISSING_ROOT', 'INVALID_NODE_STRUCTURE'].includes(error.type)
      );
      
      if (criticalErrors.length > 0) {
        healthReport.criticalIssues.push({
          dictionary: dictionaryName,
          errors: criticalErrors,
          healthScore: result.healthScore.score
        });
      }
    }

    return healthReport;
  }

  /**
   * Monitor dictionary health during operations
   * @param {string} dictionaryName - Dictionary to monitor
   * @param {number} frequency - Monitor every Nth operation (default: 1000)
   */
  monitorDictionaryHealth(dictionaryName, frequency = 1000) {
    if (!this.dictionaryHealthMonitors) {
      this.dictionaryHealthMonitors = new Map();
    }

    const monitor = this.dictionaryHealthMonitors.get(dictionaryName) || {
      operationCount: 0,
      lastHealthCheck: null,
      healthHistory: []
    };

    monitor.operationCount++;

    // Perform health check every Nth operation
    if (monitor.operationCount % frequency === 0) {
      const trie = this.dictionaries.get(dictionaryName);
      if (trie) {
        const healthScore = trie.getHealthScore();
        monitor.lastHealthCheck = healthScore;
        monitor.healthHistory.push({
          timestamp: Date.now(),
          score: healthScore.score,
          operationCount: monitor.operationCount
        });

        // Keep only last 10 health checks
        if (monitor.healthHistory.length > 10) {
          monitor.healthHistory.shift();
        }

        // Log health warnings
        if (healthScore.score < 70) {
          this.log(1, `⚠️ Dictionary health warning for "${dictionaryName}": ${healthScore.score}/100 (${healthScore.grade})`, {
            issues: healthScore.issues,
            operationCount: monitor.operationCount
          });
        }

        this.dictionaryHealthMonitors.set(dictionaryName, monitor);
      }
    }
  }
}

// Factory function
export const createDictionaryManager = () => new DictionaryManager();