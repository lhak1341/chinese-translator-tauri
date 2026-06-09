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
import { logger } from '../logger.js';
import { loadDictionaryWithCache, getCacheStats } from './DictionaryTrieLoader.js';
import { DictionaryWasmLookup } from './DictionaryWasmLookup.js';
import { DictionaryTrie } from './DictionaryTrie.js';

// Debug logging levels
const DEBUG_LEVELS = {
  ERROR: 0, // Only errors and warnings
  INFO: 1, // Key milestones and results
  DEBUG: 2, // Detailed phase information
  VERBOSE: 3, // Ultra-detailed token-by-token logging
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
      enabled: options.cacheEnabled !== false, // Default to enabled
    });

    // Parallel processing configuration
    this.enableParallelLookups = options.enableParallelLookups !== false; // Default true
    this.maxParallelDictionaries = options.maxParallelDictionaries || 10; // Limit concurrent lookups
    this.dictionaryParallelThreshold = 2; // Minimum dictionaries for parallel processing

    // Precomputed trie caching (optional, enabled by default for 5-7x faster loading)
    this.enablePrecomputedCache = options.enablePrecomputedCache !== false;
    this.tauriAPI = options.tauriAPI || null; // Required for cache file operations

    // Performance monitoring for parallel operations
    this.parallelLookupStats = {
      parallelCalls: 0,
      sequentialCalls: 0,
      averageParallelTime: 0,
      averageSequentialTime: 0,
      fallbackCount: 0,
    };

    // Performance monitoring for lookup indexing optimization
    this.lookupIndexStats = {
      buildCalls: 0,
      avgBuildTime: 0,
      lastIndexSize: 0,
      savedLookups: 0,
      totalSavedTime: 0,
    };

    // WASM acceleration — provide wasmAdapter option to enable (omit for pure-JS / tests)
    this.wasmLookup = options.wasmAdapter ? new DictionaryWasmLookup(options.wasmAdapter) : null;
    this._validationCallCount = 0;
    if (this.wasmLookup) {
      this._initializeWasmBackground();
    }
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
          logger.log(message, data);
        } else {
          logger.log(message);
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

    // CODE REVIEW FIX (CRITICAL-1): Dispose existing tries before clearing to prevent memory leaks
    // Each dictionary trie contains nested Map structures that need recursive cleanup
    // Without disposal, 2-10MB per dictionary can leak on reload
    for (const [name, trie] of this.dictionaries.entries()) {
      if (trie && typeof trie.dispose === 'function') {
        try {
          trie.dispose(); // Recursively clean up trie nodes and their children Maps
          this.log(DEBUG_LEVELS.DEBUG, `🗑️ Disposed dictionary "${name}" before reload`);
        } catch (error) {
          this.log(DEBUG_LEVELS.ERROR, `Error disposing dictionary ${name}:`, error);
        }
      }
    }

    // Clear existing dictionaries
    this.dictionaries.clear();
    this.metadata.clear();

    const priorities = options.priorities || {
      patterns: 2,
      phrases: 3,
      properNouns: 3, // base; f_* → 1, _* → 2 assigned below by prefix
      characters: 4,
      punctuation: 5,
      conversion: 6,
    };

    // Phase 4 Optimization: Filter dictionaries for lazy loading
    const filteredDictionaries = this.filterActiveDictionaries(dictionaryData, options);
    this.pendingDictionaries = this.getPendingDictionaries(dictionaryData, filteredDictionaries);

    this.log(
      DEBUG_LEVELS.DEBUG,
      `📊 Lazy loading: ${Object.keys(filteredDictionaries).length} active, ${Object.keys(this.pendingDictionaries).length} pending`
    );

    // Load each active dictionary
    for (const [dictionaryName, dictionary] of Object.entries(filteredDictionaries)) {
      if (!dictionary || typeof dictionary !== 'object') {
        this.log(DEBUG_LEVELS.ERROR, `Skipping invalid dictionary: ${dictionaryName}`);
        continue;
      }

      let trie;
      let entryCount = 0;
      let fromCache = false;

      // Try loading from precomputed cache if enabled
      if (this.enablePrecomputedCache && this.tauriAPI) {
        try {
          const cacheResult = await loadDictionaryWithCache(
            dictionaryName,
            dictionary,
            this.tauriAPI
          );

          if (cacheResult) {
            trie = cacheResult.trie;
            fromCache = cacheResult.fromCache;
            entryCount = trie.size;

            if (fromCache) {
              this.log(
                DEBUG_LEVELS.INFO,
                `⚡ Loaded ${dictionaryName} from cache (${entryCount} entries, ${cacheResult.loadTime.toFixed(2)}ms)`
              );
            }
          }
        } catch (cacheError) {
          this.log(
            DEBUG_LEVELS.DEBUG,
            `Cache load failed for ${dictionaryName}, building from dictionary:`,
            cacheError
          );
        }
      }

      // Fallback: build trie from dictionary if cache didn't work
      if (!trie) {
        trie = new DictionaryTrie();

        // Insert all entries into the trie
        for (const [source, target] of Object.entries(dictionary)) {
          if (typeof source === 'string') {
            let translation,
              allowAsPatternVariable = undefined,
              semanticType = undefined,
              allowedVariableTypes = undefined;

            if (typeof target === 'string') {
              // Pure lookup-table dicts (characters, conversion, punctuation) use string values.
              translation = target;
            } else if (typeof target === 'object' && target !== null && target.translation) {
              // Preserve undefined (absent field) vs explicit true/false so that callers
              // using `!== false` treat missing-field entries as "not excluded".
              translation = target.translation;
              allowAsPatternVariable =
                'allowAsPatternVariable' in target ? target.allowAsPatternVariable : undefined;
              semanticType = target.semanticType || undefined;
              allowedVariableTypes = target.allowedVariableTypes || undefined;
            } else {
              this.log(
                DEBUG_LEVELS.ERROR,
                `Invalid entry format for "${source}" in dictionary "${dictionaryName}"`
              );
              continue;
            }

            // Assign priority: prefix rules always win over caller-supplied priorities map
            let priority;
            if (dictionaryName.startsWith('properNouns-f_')) {
              priority = 1; // fiction-specific (highest)
            } else if (dictionaryName.startsWith('properNouns-_')) {
              priority = 2; // generic
            } else {
              priority =
                priorities[dictionaryName] || (dictionaryName.startsWith('properNouns') ? 3 : 10);
            }

            const metadata = {
              dictionary: dictionaryName,
              priority: priority,
              frequency: this.estimateFrequency(source, dictionaryName),
              allowAsPatternVariable: allowAsPatternVariable,
              ...(semanticType && { semanticType }),
              ...(allowedVariableTypes && { allowedVariableTypes }),
            };

            trie.insert(source, translation, metadata);
            entryCount++;
          }
        }
      } // End fallback trie building

      this.dictionaries.set(dictionaryName, trie);

      // Use the same priority logic for metadata (prefix rules always win)
      let metadataPriority;
      if (dictionaryName.startsWith('properNouns-f_')) {
        metadataPriority = 1; // fiction-specific (highest)
      } else if (dictionaryName.startsWith('properNouns-_')) {
        metadataPriority = 2; // generic
      } else {
        metadataPriority =
          priorities[dictionaryName] || (dictionaryName.startsWith('properNouns') ? 3 : 10);
      }

      this.metadata.set(dictionaryName, {
        name: dictionaryName,
        entryCount,
        priority: metadataPriority,
        stats: trie.getStats(),
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
        activeProperNouns: activeProperNouns,
      };

      try {
        const preWarmResult = await this.cache.preWarmCaches(this, preWarmOptions);
        if (preWarmResult.success) {
          this.log(
            DEBUG_LEVELS.INFO,
            `🔥 Cache pre-warmed: ${preWarmResult.charactersWarmed} characters, ` +
              `${preWarmResult.phrasesWarmed} phrases, ${preWarmResult.properNounsWarmed} proper nouns ` +
              `in ${preWarmResult.timeMs}ms`
          );
        }
      } catch (error) {
        this.log(DEBUG_LEVELS.WARN, `⚠️ Cache pre-warming failed: ${error.message}`);
      }
    }

    if (this.wasmLookup?.isReady()) {
      try {
        await this.syncDictionariesToWasm();
      } catch (error) {
        this.log(1, '⚠️ WASM sync failed, continuing with JavaScript only:', error);
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

    if (this.wasmLookup?.isReady()) {
      try {
        return this.wasmLookup.translate(word, dictionaryOrder || this.getDefaultSearchOrder());
      } catch (error) {
        this.log(1, '⚠️ WASM translate failed, falling back to JavaScript:', error);
      }
    }

    const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();

    // Check cache first for multi-dictionary lookup
    const cachedResult = this.cache.getLookup(word, searchOrder);
    if (cachedResult) {
      return cachedResult;
    }

    // MEDIUM-9 FIX: Remove per-dictionary cache checks to eliminate duplicate lookups
    // Multi-dictionary cache check above is sufficient
    for (const dictionaryName of searchOrder) {
      const dictionary = this.dictionaries.get(dictionaryName);
      if (!dictionary) continue;

      // Direct dictionary lookup (no per-dictionary cache check)
      const result = dictionary.getWithMetadata(word);

      if (result) {
        // Build translation result
        const translationResult = {
          word,
          translation: result.translation,
          dictionary: dictionaryName,
          metadata: result.metadata,
        };

        // Cache based on word length for future lookups
        if (word.length === 1) {
          // Cache single character lookups aggressively
          this.cache.setCharacter(word, dictionaryName, translationResult);
        } else {
          // Cache phrase lookups
          this.cache.setPhrase(word, dictionaryName, translationResult);
        }

        // Also cache in multi-dictionary lookup cache
        this.cache.setLookup(word, searchOrder, translationResult);

        // Return the found result
        return translationResult;
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
          metadata: current.metadata,
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

    if (this.wasmLookup?.isReady()) {
      try {
        return await this.wasmLookup.findAllMatches(
          text,
          startPos,
          dictionaryOrder || this.getDefaultSearchOrder()
        );
      } catch (error) {
        this.log(1, '⚠️ WASM parallel lookup failed, using JavaScript:', error);
      }
    }

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
          const enrichedMatches = matches.map((match) => ({
            ...match,
            dictionary: dictionaryName,
            priority,
          }));

          return { dictionaryName, matches: enrichedMatches, success: true };
        } catch (error) {
          // Log error but don't fail entire lookup
          logger.error(`Dictionary lookup failed for ${dictionaryName}:`, error);
          return { dictionaryName, matches: [], success: false, error };
        }
      });

      // Wait for all parallel lookups to complete
      const lookupResults = await Promise.all(lookupPromises);

      // Check for any failures
      const failures = lookupResults.filter((result) => !result.success);
      if (failures.length > 0) {
        logger.warn(
          `${failures.length} dictionary lookups failed, proceeding with available results`
        );
      }

      // Combine successful results
      const allMatches = lookupResults
        .filter((result) => result.success)
        .flatMap((result) => result.matches);

      // Sort by length first (longer match = more specific), priority as tiebreak at equal length
      const sortedMatches = allMatches.sort((a, b) => {
        if (a.word.length !== b.word.length) {
          return b.word.length - a.word.length;
        }
        return a.priority - b.priority;
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
      logger.error('Parallel dictionary lookup failed, falling back to sequential:', error);

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
        matches.forEach((match) => {
          match.dictionary = dictionaryName;
          match.priority = this.metadata.get(dictionaryName)?.priority || 10;
        });

        allMatches.push(...matches);
      } catch (error) {
        logger.error(`Dictionary ${dictionaryName} lookup failed:`, error);
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

    // Sort by length first (longer match = more specific), priority as tiebreak at equal length
    return allMatches.sort((a, b) => {
      if (a.word.length !== b.word.length) {
        return b.word.length - a.word.length;
      }
      return a.priority - b.priority;
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
    const shouldUseParallel =
      this.enableParallelLookups && searchOrder.length >= this.dictionaryParallelThreshold;

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
      logger.log('⚡ Skipping lookup indexing for short text or disabled feature');
      return lookupIndex;
    }

    try {
      // Get all dictionaries that should be searched
      const searchOrder = options.dictionaryOrder || this.getDefaultSearchOrder();
      const totalPositions = text.length;
      let positionsWithMatches = 0;

      // Build index for each text position
      for (let pos = 0; pos < totalPositions; pos++) {
        // Find all matches starting at this position
        const allMatches = await this.findAllMatchesSequential(text, pos, searchOrder);

        if (allMatches.length > 0) {
          // Categorize matches by dictionary type for different phases
          const categorizedMatches = {
            patterns: allMatches.filter((m) => this.isDictionaryType(m.dictionary, 'patterns')),
            properNouns: allMatches.filter((m) =>
              this.isDictionaryType(m.dictionary, 'properNouns')
            ),
            phrases: allMatches.filter((m) => this.isDictionaryType(m.dictionary, 'phrases')),
            characters: allMatches.filter((m) => this.isDictionaryType(m.dictionary, 'characters')),
            numbers: allMatches.filter((m) => this.isDictionaryType(m.dictionary, 'numbers')),
          };

          // Only store position if it has matches for any category
          const hasAnyMatches = Object.values(categorizedMatches).some(
            (matches) => matches.length > 0
          );
          if (hasAnyMatches) {
            lookupIndex.set(pos, categorizedMatches);
            positionsWithMatches++;
          }
        }
      }

      const indexTime = performance.now() - startTime;
      const _avgTimePerPosition = indexTime / totalPositions;

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
      logger.error('🚨 Lookup index building failed:', error);

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
        return (
          dictionaryName.includes('proper') ||
          dictionaryName.includes('noun') ||
          dictionaryName.includes('character') ||
          dictionaryName.includes('place') ||
          metadata.type === 'properNouns'
        );

      case 'phrases':
        return (
          dictionaryName.includes('phrase') ||
          dictionaryName === 'phrases' ||
          metadata.type === 'phrases'
        );

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
      properNouns: 'proper_nouns', // Map JavaScript name to Rust name
      phrases: 'phrases',
      characters: 'characters',
      patterns: 'patterns',
      numbers: 'numbers',
    };

    // Try the category directly first (for JavaScript-built indexes)
    let matches = positionMatches[category];

    // If not found and category is camelCase, try snake_case (for Rust-built indexes)
    if (!matches && categoryMap[category]) {
      matches = positionMatches[categoryMap[category]];
    }

    const result = matches || [];
    // Rust index stores matches in dictionary-iteration order (priority order), not length order.
    // Sort here to match findAllMatchesSequential: longer match wins, priority as tiebreak.
    if (result.length > 1) {
      return [...result].sort((a, b) => {
        if (a.word.length !== b.word.length) return b.word.length - a.word.length;
        return (a.priority || 0) - (b.priority || 0);
      });
    }
    return result;
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
      dictionaries: {},
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
   * Properly dispose of all dictionary resources to prevent memory leaks
   * CODE REVIEW FIX (CRITICAL-1): Added comprehensive disposal method
   *
   * CRITICAL: Call this before reloading dictionaries or discarding the manager
   * to prevent 2-10MB memory leaks per reload.
   *
   * Usage:
   *   await manager.loadDictionaries({...});
   *   // ... use dictionaries ...
   *   manager.dispose();  // Proper cleanup before reload
   *   await manager.loadDictionaries({...});  // Load new dictionaries
   */
  dispose() {
    // Clear all caches first
    this.clearCache();

    // Dispose each dictionary trie properly
    for (const [name, trie] of this.dictionaries.entries()) {
      if (trie && typeof trie.dispose === 'function') {
        try {
          trie.dispose(); // Let trie clean up its internal structures
        } catch (error) {
          this.log(DEBUG_LEVELS.ERROR, `Error disposing dictionary ${name}:`, error);
        }
      }
    }

    // Clear and nullify all references for GC
    this.dictionaries.clear();
    this.dictionaries = null;

    this.metadata.clear();
    this.metadata = null;

    // CODE REVIEW FIX (MEDIUM-2): Clear pending dictionaries defensively
    // pendingDictionaries contains raw dictionary data (plain objects)
    // but clear for consistency and safety
    if (this.pendingDictionaries) {
      if (typeof this.pendingDictionaries === 'object' && this.pendingDictionaries !== null) {
        // If it's a Map, clear it; if it's an object, nullify
        if (typeof this.pendingDictionaries.clear === 'function') {
          this.pendingDictionaries.clear();
        }
      }
      this.pendingDictionaries = null;
    }

    // Dispose cache
    if (this.cache) {
      // CODE REVIEW FIX (MEDIUM-1): Use dispose() method for proper cleanup
      if (typeof this.cache.dispose === 'function') {
        this.cache.dispose();
      } else {
        this.cache.clear(); // Fallback for older implementations
      }
      this.cache = null;
    }

    // Clear health monitors if they exist
    if (this.dictionaryHealthMonitors) {
      this.dictionaryHealthMonitors.clear();
      this.dictionaryHealthMonitors = null;
    }

    // Cleanup WASM lookup
    this.wasmLookup?.dispose();
    this.wasmLookup = null;

    // Reset state flags
    this.ready = false;
    this.loadTime = 0;

    this.log(DEBUG_LEVELS.INFO, '🧹 DictionaryManager disposed successfully');
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
   * Get precomputed trie cache statistics
   * @returns {Object} Precomputed cache performance statistics
   */
  getPrecomputedCacheStats() {
    return getCacheStats();
  }

  /**
   * Get sorting performance statistics
   * Phase 6/7: Dictionary sorting and performance monitoring
   * @returns {Object} Sorting performance stats
   */
  getSortingStats() {
    // This will be provided by the context that imports the sorter
    return {
      message: 'Sorting stats available via DictionaryContext.getSortingStats()',
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
        this.log(
          DEBUG_LEVELS.DEBUG,
          `⏭️ Skipping inactive proper noun dictionary: ${dictionaryName}`
        );
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
      this.log(
        DEBUG_LEVELS.DEBUG,
        `❌ Dictionary "${dictionaryName}" not available for lazy loading`
      );
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
      stats: trie.getStats(),
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
      totalPending: this.pendingDictionaries ? Object.keys(this.pendingDictionaries).length : 0,
    };
  }

  getDictionary(name) {
    return this.dictionaries.get(name) ?? null;
  }

  getDictionaryNames() {
    return this.dictionaries.keys();
  }

  // ─── WASM Acceleration ────────────────────────────────────────────────────

  async _initializeWasmBackground() {
    if (!this.wasmLookup) return;
    const config = {
      maxMemoryMB: 15,
      enableParallelLookups: this.enableParallelLookups,
      maxParallelDictionaries: this.maxParallelDictionaries,
      cacheSize: this.cache?.lookupCacheSize,
    };
    const ok = await this.wasmLookup.initialize(config);
    if (ok) {
      await this.syncDictionariesToWasm();
      this.log(1, '✅ WASM integration initialized successfully');
    } else {
      this.log(1, '⚠️ WASM initialization failed, using JavaScript fallback');
      logger.warn(
        '⚠️ [DictionaryManager] WASM initialization returned false, using JavaScript fallback'
      );
    }
  }

  async syncDictionariesToWasm() {
    if (!this.wasmLookup?.isReady()) return;
    return this.wasmLookup.sync(this._extractAllEntries(), this._extractPriorityMap());
  }

  _extractAllEntries() {
    const result = new Map();
    for (const [name, trie] of this.dictionaries) {
      result.set(name, this._extractTrieEntries(trie));
    }
    return result;
  }

  _extractPriorityMap() {
    const result = new Map();
    for (const [name, meta] of this.metadata) {
      result.set(name, meta.priority ?? 999);
    }
    return result;
  }

  _extractTrieEntries(trie) {
    const entries = [];
    const traverse = (node, currentWord = '') => {
      if (node.isEndOfWord) {
        entries.push({
          chinese: currentWord,
          vietnamese: node.translation,
          metadata: node.metadata,
        });
      }
      for (const [char, childNode] of node.children) {
        traverse(childNode, currentWord + char);
      }
    };
    traverse(trie.root);
    return entries;
  }

  /**
   * Validate WASM produces results identical to JavaScript for a word sample.
   * Called from Translator.jsx during force-reload diagnostics.
   */
  validateWasmFallback(testWords = null, dictionaryOrder = null) {
    const validation = {
      wasmAvailable: this.wasmLookup?.isReady() ?? false,
      status: 'PENDING',
      reason: null,
      results: { tested: 0, passed: 0, failed: 0, wasmErrors: 0, jsErrors: 0 },
      differences: [],
      errors: [],
      performance: { wasmTotalTime: 0, jsTotalTime: 0, speedupRatio: 1.0 },
    };

    if (!validation.wasmAvailable) {
      validation.status = 'SKIPPED';
      validation.reason = 'WASM not available or in fallback mode';
      return validation;
    }

    const wordsToTest = testWords || this._getSampleTestWords(20);
    this.log(2, `🧪 Starting WASM fallback validation with ${wordsToTest.length} test words...`);

    for (const word of wordsToTest) {
      validation.results.tested++;
      let wasmResult = null;
      let jsResult = null;
      try {
        wasmResult = this.wasmLookup.translate(
          word,
          dictionaryOrder || this.getDefaultSearchOrder()
        );
      } catch (error) {
        validation.results.wasmErrors++;
        validation.errors.push({ word, type: 'wasm', error: error.message });
        continue;
      }
      try {
        jsResult = this._translateJSDirect(word, dictionaryOrder);
      } catch (error) {
        validation.results.jsErrors++;
        validation.errors.push({ word, type: 'js', error: error.message });
        continue;
      }
      if ((wasmResult?.translation ?? null) === (jsResult?.translation ?? null)) {
        validation.results.passed++;
      } else {
        validation.results.failed++;
        validation.differences.push({
          word,
          wasm: wasmResult?.translation ?? null,
          js: jsResult?.translation ?? null,
        });
      }
    }

    validation.status =
      validation.results.failed === 0 && validation.results.wasmErrors === 0 ? 'PASSED' : 'FAILED';
    validation.performance = this.wasmLookup?.getStatus().performanceComparison ?? {
      wasmTotalTime: 0,
      jsTotalTime: 0,
      speedupRatio: 1.0,
    };
    return validation;
  }

  periodicWasmValidation(currentWord, validationFrequency = 100) {
    if (!this.wasmLookup?.isReady()) return;
    this._validationCallCount++;
    if (this._validationCallCount % validationFrequency !== 0) return;
    const result = this.validateWasmFallback([currentWord]);
    if (result.status === 'FAILED' || result.results.wasmErrors > 0) {
      this.log(0, '❌ Periodic WASM validation failed', result);
      logger.error('❌ [DictionaryManager] WASM validation failed:', result.differences);
    }
  }

  _getSampleTestWords(count) {
    const words = [];
    for (const [, trie] of this.dictionaries) {
      if (words.length >= count) break;
      const node = trie?.root;
      if (node?.children?.size > 0) {
        for (const [char, child] of node.children) {
          if (child?.isEndOfWord) {
            words.push(char);
            break;
          }
        }
      }
    }
    return words;
  }

  _translateJSDirect(word, dictionaryOrder = null) {
    const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();
    for (const dictionaryName of searchOrder) {
      const dictionary = this.dictionaries.get(dictionaryName);
      if (!dictionary) continue;
      const result = dictionary.getWithMetadata(word);
      if (result) {
        return {
          word,
          translation: result.translation,
          dictionary: dictionaryName,
          metadata: result.metadata,
        };
      }
    }
    return null;
  }

  getWasmStatus() {
    return (
      this.wasmLookup?.getStatus() ?? {
        initialized: false,
        ready: false,
        hasAdapter: false,
        performanceComparison: {
          wasmLookups: 0,
          jsLookups: 0,
          wasmTotalTime: 0,
          jsTotalTime: 0,
          wasmAverageTime: 0,
          jsAverageTime: 0,
          speedupRatio: 1.0,
        },
      }
    );
  }

  getEnhancedPerformanceReport() {
    return (
      this.wasmLookup?.getPerformanceReport() ?? {
        wasmEnabled: false,
        wasmReady: false,
        performanceComparison: {
          wasmLookups: 0,
          jsLookups: 0,
          wasmTotalTime: 0,
          jsTotalTime: 0,
          wasmAverageTime: 0,
          jsAverageTime: 0,
          speedupRatio: 1.0,
        },
        wasmAdapterStats: null,
        isWasmBeneficial: false,
      }
    );
  }

  isWasmBeneficial() {
    return this.wasmLookup?.isBeneficial() ?? false;
  }

  getMemoryUsage() {
    return {
      dictionaries: this.dictionaries?.size ?? 0,
      cacheEnabled: !!this.cache,
      wasmMemory: this._wasmAdapter?.getTimingStats()?.memoryUsage ?? null,
    };
  }

  async reloadDictionaries(dictionaryData, options = {}) {
    if (this._wasmInitialized && this._wasmAdapter) {
      try {
        this._wasmAdapter.clearAll();
        this.log(2, '🔄 Cleared WASM dictionaries for reload');
      } catch (error) {
        this.log(1, '⚠️ WASM clear failed:', error);
      }
    }
    return this.loadDictionaries(dictionaryData, options);
  }
}
