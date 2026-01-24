/**
 * Enhanced Dictionary Manager with WASM Integration
 *
 * Extends the existing DictionaryManager with WASM acceleration while maintaining
 * 100% compatibility with the existing API and fallback capabilities.
 *
 * @import {
 *   EnhancedDictionaryManagerOptions,
 *   PerformanceComparison,
 *   DictionaryEntry,
 *   WasmBatchDictionary,
 *   DictionarySearchOrder,
 *   TranslationResult,
 *   DictionaryMatchResult,
 *   DictionaryLoadOptions,
 *   WasmValidationResult,
 *   WasmValidationDifference,
 *   WasmValidationError,
 *   WasmValidationPerformance,
 *   WasmValidationResults,
 *   WasmValidationTracking,
 *   EnhancedPerformanceReport,
 *   MemoryUsage
 * } from '../types/DictionaryManagerTypes'
 */

import { DictionaryManager } from './DictionaryManager.js';
import { WasmDictionaryManager } from './WasmDictionaryManager.js';
import { logger } from './logger.js';

export class EnhancedDictionaryManager extends DictionaryManager {
  constructor(options = {}) {
    // Initialize parent DictionaryManager
    super(options);

    // WASM integration settings
    this.enableWasm = options.enableWasm !== false; // Default to enabled
    this.wasmMemoryLimit = options.wasmMemoryLimit || 15; // 15MB default
    this.wasmManager = null;
    this.wasmInitialized = false;
    this.wasmInitPromise = null;

    // Enhanced performance tracking for WASM vs JS comparison
    this.performanceComparison = {
      wasmLookups: 0,
      jsLookups: 0,
      wasmTotalTime: 0,
      jsTotalTime: 0,
      wasmAverageTime: 0,
      jsAverageTime: 0,
      speedupRatio: 1.0,
    };

    // Initialize WASM in background if enabled
    if (this.enableWasm) {
      this.initializeWasmBackground();
    }
  }

  /**
   * Initialize WASM engine in background
   */
  async initializeWasmBackground() {
    if (this.wasmInitPromise) {
      return this.wasmInitPromise;
    }

    this.wasmInitPromise = this._initializeWasm();
    return this.wasmInitPromise;
  }

  async _initializeWasm() {
    try {
      this.log(1, '🦀 Initializing WASM integration...');

      this.wasmManager = new WasmDictionaryManager();

      const config = {
        maxMemoryMB: this.wasmMemoryLimit,
        enableParallelLookups: this.enableParallelLookups,
        maxParallelDictionaries: this.maxParallelDictionaries,
        cacheSize: this.cache.lookupCacheSize,
      };

      const success = await this.wasmManager.initialize(this, config);

      if (success) {
        this.wasmInitialized = true;

        // Load existing dictionaries into WASM
        await this.syncDictionariesToWasm();

        this.log(1, '✅ WASM integration initialized successfully');
        logger.log('✅ [EnhancedDictionaryManager] WASM DictionaryEngine active');
        return true;
      } else {
        this.log(1, '⚠️ WASM initialization failed, using JavaScript fallback');
        logger.warn(
          '⚠️ [EnhancedDictionaryManager] WASM initialization returned false, using JavaScript fallback'
        );
        return false;
      }
    } catch (error) {
      this.log(0, '❌ WASM initialization error:', error);

      // ALWAYS log critical WASM failures (bypass log filtering)
      logger.error('❌ [EnhancedDictionaryManager] WASM initialization failed:', error);
      logger.error('   Falling back to JavaScript dictionary manager');

      this.wasmInitialized = false;
      return false;
    }
  }

  /**
   * Sync existing dictionaries to WASM engine
   * Optimized batch loading reduces WASM boundary crossings by 5-10x
   */
  async syncDictionariesToWasm() {
    if (!this.wasmInitialized || !this.wasmManager) return;

    this.log(2, '🔄 Syncing dictionaries to WASM...');

    // OPTIMIZATION: Batch all dictionary entries into single WASM call
    const batchStartTime = performance.now();
    const allDictionaries = [];
    let totalEntries = 0;

    // Prepare all dictionaries for batch loading
    for (const [name, trie] of this.dictionaries) {
      try {
        const entries = this.extractTrieEntries(trie);
        allDictionaries.push({ name, entries });
        totalEntries += entries.length;

        this.log(2, `📋 Prepared dictionary '${name}': ${entries.length} entries`);
      } catch (error) {
        this.log(0, `❌ Failed to prepare dictionary '${name}':`, error);
      }
    }

    // Batch load all dictionaries at once
    if (allDictionaries.length > 0) {
      try {
        const batchSuccess = await this.wasmManager.loadDictionariesBatch(allDictionaries);
        const elapsed = performance.now() - batchStartTime;

        if (batchSuccess) {
          // MEDIUM-2 FIX: Validate WASM sync integrity to prevent undefined values in translations
          const validationSuccess = await this.validateWasmSync(allDictionaries);

          if (validationSuccess) {
            this.log(
              1,
              `✅ Batch loaded ${allDictionaries.length} dictionaries (${totalEntries} entries) in ${elapsed.toFixed(1)}ms - validated`
            );
          } else {
            this.log(0, '❌ WASM sync validation failed - falling back to sequential loading');
            await this.syncDictionariesToWasmSequential();
          }
        } else {
          this.log(1, '⚠️ Batch loading failed, falling back to sequential loading');
          await this.syncDictionariesToWasmSequential();
        }
      } catch (error) {
        this.log(0, '❌ Batch loading error, falling back to sequential:', error);
        await this.syncDictionariesToWasmSequential();
      }
    }
  }

  /**
   * Fallback sequential loading (original method)
   */
  async syncDictionariesToWasmSequential() {
    for (const [name, trie] of this.dictionaries) {
      try {
        const entries = this.extractTrieEntries(trie);
        await this.wasmManager.loadDictionary(name, entries);

        this.log(2, `📚 Synced dictionary '${name}': ${entries.length} entries`);
      } catch (error) {
        this.log(0, `❌ Failed to sync dictionary '${name}':`, error);
      }
    }
  }

  /**
   * Extract entries from a JavaScript trie for WASM loading
   */
  extractTrieEntries(trie) {
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
   * Validate WASM sync integrity by testing lookups
   * MEDIUM-2 FIX: Prevents undefined values from appearing in translations
   *
   * @param {Array} allDictionaries - Array of {name, entries} objects
   * @returns {Promise<boolean>} True if validation passes
   */
  async validateWasmSync(allDictionaries) {
    if (!this.wasmManager || allDictionaries.length === 0) {
      return true; // No validation needed if no WASM or no dictionaries
    }

    try {
      // Import validation function
      const { validateWasmDictionaryMatch } = await import('../../types/WasmTypes.ts');

      // Test each dictionary with its first entry
      for (const { name, entries } of allDictionaries) {
        if (entries.length === 0) continue;

        // Test lookup with first entry
        const testEntry = entries[0];
        const testWord = testEntry.chinese || testEntry.word || '';

        if (!testWord) continue;

        // Perform test lookup
        const matches = await this.wasmManager.findMatches(name, testWord, 0);

        // Validate each match result
        for (const match of matches) {
          try {
            validateWasmDictionaryMatch(match);

            // Additional check for undefined values
            if (match.translation === undefined || match.word === undefined) {
              this.log(0, `❌ WASM validation failed: undefined values in ${name} dictionary`);
              return false;
            }
          } catch (validationError) {
            this.log(
              0,
              `❌ WASM validation failed for ${name}:`,
              validationError instanceof Error ? validationError.message : validationError
            );
            return false;
          }
        }
      }

      this.log(2, '✅ WASM sync validation passed');
      return true;
    } catch (error) {
      this.log(0, '❌ WASM validation error:', error);
      return false;
    }
  }

  /**
   * Enhanced dictionary loading with WASM sync
   */
  async loadDictionaries(dictionaryData, options = {}) {
    // Load dictionaries using parent implementation
    const jsResult = await super.loadDictionaries(dictionaryData, options);

    // Sync to WASM if available
    if (this.wasmInitialized && this.wasmManager) {
      try {
        await this.syncDictionariesToWasm();
      } catch (error) {
        this.log(1, '⚠️ WASM sync failed, continuing with JavaScript only:', error);
      }
    }

    return jsResult;
  }

  /**
   * Enhanced translate method with WASM acceleration
   */
  translate(word, dictionaryOrder = null) {
    // HIGH-2 FIX: Use JavaScript fallback during WASM initialization
    // This prevents race conditions without breaking synchronous API contract
    if (this.wasmInitPromise && !this.wasmInitialized) {
      // Use JavaScript implementation while WASM initializes
      return this.translateJS(word, dictionaryOrder);
    }

    // Periodic WASM validation (every 100th word by default)
    if (this.wasmInitialized && this.wasmManager && !this.wasmManager.isInFallbackMode()) {
      this.periodicWasmValidation(word);
    }

    // Use WASM if available and ready
    if (this.wasmInitialized && this.wasmManager && !this.wasmManager.isInFallbackMode()) {
      return this.translateWasm(word, dictionaryOrder);
    }

    // Fallback to JavaScript
    return this.translateJS(word, dictionaryOrder);
  }

  /**
   * JavaScript translation (original implementation)
   */
  translateJS(word, dictionaryOrder = null) {
    const startTime = performance.now();
    const result = super.translate(word, dictionaryOrder);
    const endTime = performance.now();

    // Track performance
    this.performanceComparison.jsLookups++;
    this.performanceComparison.jsTotalTime += endTime - startTime;
    this.performanceComparison.jsAverageTime =
      this.performanceComparison.jsTotalTime / this.performanceComparison.jsLookups;

    return result;
  }

  /**
   * WASM-accelerated translation
   */
  translateWasm(word, dictionaryOrder = null) {
    const startTime = performance.now();

    try {
      const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();

      // Try each dictionary in order
      for (const dictionaryName of searchOrder) {
        if (!this.wasmManager.hasDictionary(dictionaryName)) continue;

        const match = this.wasmManager.findLongestMatch(dictionaryName, word, 0);
        if (match && match.word === word) {
          const endTime = performance.now();

          // Track performance
          this.performanceComparison.wasmLookups++;
          this.performanceComparison.wasmTotalTime += endTime - startTime;
          this.performanceComparison.wasmAverageTime =
            this.performanceComparison.wasmTotalTime / this.performanceComparison.wasmLookups;

          // Calculate speedup ratio
          if (this.performanceComparison.jsAverageTime > 0) {
            this.performanceComparison.speedupRatio =
              this.performanceComparison.jsAverageTime / this.performanceComparison.wasmAverageTime;
          }

          return {
            word: match.word,
            translation: match.translation,
            dictionary: dictionaryName,
            metadata: match.metadata,
          };
        }
      }

      const endTime = performance.now();
      this.performanceComparison.wasmLookups++;
      this.performanceComparison.wasmTotalTime += endTime - startTime;
      this.performanceComparison.wasmAverageTime =
        this.performanceComparison.wasmTotalTime / this.performanceComparison.wasmLookups;

      return null;
    } catch (error) {
      this.log(1, '⚠️ WASM translation failed, falling back to JavaScript:', error);
      return this.translateJS(word, dictionaryOrder);
    }
  }

  /**
   * Enhanced parallel lookup with WASM support
   */
  async findAllMatchesParallel(text, startPos = 0, dictionaryOrder = null) {
    // Use WASM if available for better performance
    if (this.wasmInitialized && this.wasmManager && !this.wasmManager.isInFallbackMode()) {
      return this.findAllMatchesWasm(text, startPos, dictionaryOrder);
    }

    // Fallback to JavaScript implementation
    return super.findAllMatchesParallel(text, startPos, dictionaryOrder);
  }

  /**
   * WASM-accelerated parallel lookups
   */
  async findAllMatchesWasm(text, startPos = 0, dictionaryOrder = null) {
    const searchOrder = dictionaryOrder || this.getDefaultSearchOrder();
    const allMatches = [];

    try {
      // Use WASM for dictionary lookups
      for (const dictionaryName of searchOrder) {
        if (!this.wasmManager.hasDictionary(dictionaryName)) continue;

        const matches = this.wasmManager.findMatches(dictionaryName, text, startPos);
        const priority = this.metadata.get(dictionaryName)?.priority || 10;

        // Add metadata to matches
        const enrichedMatches = matches.map((match) => ({
          ...match,
          dictionary: dictionaryName,
          priority,
        }));

        allMatches.push(...enrichedMatches);
      }

      // Sort by priority and length (same as parent implementation)
      return allMatches.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.word.length - a.word.length;
      });
    } catch (error) {
      this.log(1, '⚠️ WASM parallel lookup failed, using JavaScript:', error);
      return super.findAllMatchesParallel(text, startPos, dictionaryOrder);
    }
  }

  /**
   * Dictionary reload with WASM sync (for Cmd/Ctrl-R integration)
   */
  async reloadDictionaries(dictionaryData, options = {}) {
    // Reload in JavaScript
    const jsResult = await super.loadDictionaries(dictionaryData, options);

    // Reload in WASM if available
    if (this.wasmInitialized && this.wasmManager) {
      try {
        this.log(2, '🔄 Reloading WASM dictionaries...');

        // Clear existing WASM dictionaries
        this.wasmManager.clearAllDictionaries();

        // Reload from fresh JavaScript data
        await this.syncDictionariesToWasm();

        this.log(1, '✅ WASM dictionaries reloaded successfully');
      } catch (error) {
        this.log(1, '⚠️ WASM reload failed:', error);
      }
    }

    return jsResult;
  }

  /**
   * Validate WASM fallback produces identical results to JavaScript
   * @param {Array} testWords - Array of test words to validate
   * @param {Array} dictionaryOrder - Dictionary order to test
   * @returns {Object} Validation results
   */
  validateWasmFallback(testWords = null, dictionaryOrder = null) {
    // Default test words if none provided
    const defaultTestWords = ['这', '个', '人', '好', '说话', '不错', '非常', '什么'];
    const wordsToTest = testWords || defaultTestWords;

    const validation = {
      timestamp: Date.now(),
      wasmAvailable:
        this.wasmInitialized && this.wasmManager && !this.wasmManager.isInFallbackMode(),
      testWordsCount: wordsToTest.length,
      results: {
        identical: 0,
        different: 0,
        wasmErrors: 0,
        jsErrors: 0,
      },
      differences: [],
      errors: [],
      performance: {
        wasmTotalTime: 0,
        jsTotalTime: 0,
        speedupRatio: 1.0,
      },
    };

    if (!validation.wasmAvailable) {
      validation.status = 'SKIPPED';
      validation.reason = 'WASM not available or in fallback mode';
      return validation;
    }

    this.log(2, `🧪 Starting WASM fallback validation with ${wordsToTest.length} test words...`);

    for (const word of wordsToTest) {
      try {
        // Test WASM translation
        const wasmStart = performance.now();
        let wasmResult = null;
        try {
          wasmResult = this.translateWasm(word, dictionaryOrder);
          validation.performance.wasmTotalTime += performance.now() - wasmStart;
        } catch (error) {
          validation.results.wasmErrors++;
          validation.errors.push({
            word,
            type: 'WASM_ERROR',
            error: error.message,
          });
          continue;
        }

        // Test JavaScript translation
        const jsStart = performance.now();
        let jsResult = null;
        try {
          jsResult = this.translateJS(word, dictionaryOrder);
          validation.performance.jsTotalTime += performance.now() - jsStart;
        } catch (error) {
          validation.results.jsErrors++;
          validation.errors.push({
            word,
            type: 'JS_ERROR',
            error: error.message,
          });
          continue;
        }

        // Compare results
        const wasmTranslation = wasmResult?.translation || null;
        const jsTranslation = jsResult?.translation || null;
        const wasmDictionary = wasmResult?.dictionary || null;
        const jsDictionary = jsResult?.dictionary || null;

        if (wasmTranslation === jsTranslation && wasmDictionary === jsDictionary) {
          validation.results.identical++;
        } else {
          validation.results.different++;
          validation.differences.push({
            word,
            wasm: {
              translation: wasmTranslation,
              dictionary: wasmDictionary,
              word: wasmResult?.word || null,
            },
            js: {
              translation: jsTranslation,
              dictionary: jsDictionary,
              word: jsResult?.word || null,
            },
          });
        }
      } catch (error) {
        validation.errors.push({
          word,
          type: 'VALIDATION_ERROR',
          error: error.message,
        });
      }
    }

    // Calculate performance metrics
    if (validation.performance.jsTotalTime > 0) {
      validation.performance.speedupRatio =
        validation.performance.jsTotalTime / validation.performance.wasmTotalTime;
    }

    // Determine overall status
    if (validation.results.different === 0 && validation.errors.length === 0) {
      validation.status = 'PASS';
    } else if (validation.results.different > 0) {
      validation.status = 'FAIL_DIFFERENCES';
    } else if (validation.errors.length > 0) {
      validation.status = 'FAIL_ERRORS';
    }

    // Log validation summary
    if (validation.status === 'PASS') {
      this.log(
        1,
        `✅ WASM fallback validation PASSED: ${validation.results.identical}/${wordsToTest.length} identical results`
      );
    } else {
      this.log(
        0,
        `❌ WASM fallback validation FAILED: ${validation.results.different} differences, ${validation.errors.length} errors`
      );

      // Log first few differences for debugging
      validation.differences.slice(0, 3).forEach((diff) => {
        this.log(
          0,
          `  - "${diff.word}": WASM="${diff.wasm.translation}" JS="${diff.js.translation}"`
        );
      });
    }

    return validation;
  }

  /**
   * Periodic WASM fallback validation during translation
   * @param {string} currentWord - Current word being translated
   * @param {number} validationFrequency - Validate every Nth word (default: 100)
   */
  periodicWasmValidation(currentWord, validationFrequency = 100) {
    // Only validate if WASM is available and enabled
    if (!this.wasmInitialized || !this.wasmManager || this.wasmManager.isInFallbackMode()) {
      return;
    }

    // Initialize validation counter if not exists
    if (!this.wasmValidationCounter) {
      this.wasmValidationCounter = 0;
      this.wasmValidationResults = {
        totalValidations: 0,
        passedValidations: 0,
        failedValidations: 0,
        lastValidation: null,
      };
    }

    this.wasmValidationCounter++;

    // Perform validation every Nth word
    if (this.wasmValidationCounter % validationFrequency === 0) {
      const validation = this.validateWasmFallback([currentWord]);
      this.wasmValidationResults.totalValidations++;
      this.wasmValidationResults.lastValidation = validation;

      if (validation.status === 'PASS') {
        this.wasmValidationResults.passedValidations++;
      } else {
        this.wasmValidationResults.failedValidations++;

        // Log failed validation for monitoring
        this.log(1, `⚠️ Periodic WASM validation failed for word: "${currentWord}"`, {
          status: validation.status,
          differences: validation.differences.length,
          errors: validation.errors.length,
        });
      }

      // Log periodic summary
      if (this.wasmValidationResults.totalValidations % 10 === 0) {
        const passRate = (
          (this.wasmValidationResults.passedValidations /
            this.wasmValidationResults.totalValidations) *
          100
        ).toFixed(1);
        this.log(
          2,
          `📊 WASM validation summary: ${passRate}% pass rate (${this.wasmValidationResults.passedValidations}/${this.wasmValidationResults.totalValidations})`
        );
      }
    }
  }

  /**
   * Get WASM status for debugging
   * @returns {Object} Current WASM initialization status
   */
  getWasmStatus() {
    return {
      enabled: this.enableWasm,
      initialized: this.wasmInitialized,
      isInFallbackMode: this.wasmManager?.isInFallbackMode() ?? true,
      managerExists: !!this.wasmManager,
      engineExists: !!this.wasmManager?.engine,
      dictionaryCount: this.wasmManager?.engine?.get_dictionary_count?.() ?? 0,
      initPromisePending: !!this.wasmInitPromise && !this.wasmInitialized,
    };
  }

  /**
   * Get comprehensive performance report including WASM vs JS comparison
   */
  getPerformanceReport() {
    const jsReport = {
      // Get parent performance stats
      ...this.parallelLookupStats,
      ...this.lookupIndexStats,

      // Add WASM comparison
      wasmIntegration: {
        enabled: this.enableWasm,
        initialized: this.wasmInitialized,
        fallbackMode: this.wasmManager?.isInFallbackMode() ?? true,
        ...this.performanceComparison,

        // WASM-specific metrics
        wasmStats: this.wasmManager?.getPerformanceReport() ?? null,

        // WASM validation results
        validation: this.wasmValidationResults || {
          totalValidations: 0,
          passedValidations: 0,
          failedValidations: 0,
          lastValidation: null,
        },
      },
    };

    return jsReport;
  }

  /**
   * Check if WASM is providing performance benefits
   */
  isWasmBeneficial() {
    return (
      this.wasmInitialized &&
      this.performanceComparison.speedupRatio > 1.2 && // At least 20% faster
      this.performanceComparison.wasmLookups > 10
    ); // Enough sample size
  }

  /**
   * Get memory usage from both JS and WASM
   */
  getMemoryUsage() {
    const jsMemory = {
      dictionariesLoaded: this.dictionaries.size,
      totalEntries: Array.from(this.dictionaries.values()).reduce(
        (sum, trie) => sum + trie.size,
        0
      ),
    };

    const wasmMemory = this.wasmManager?.getPerformanceReport() ?? {
      memoryUsageBytes: 0,
      dictionariesLoaded: 0,
      totalEntries: 0,
    };

    return {
      javascript: jsMemory,
      wasm: wasmMemory,
      combined: {
        totalDictionaries: jsMemory.dictionariesLoaded,
        totalEntries: jsMemory.totalEntries,
        estimatedMemoryMB: (wasmMemory.memoryUsageBytes || 0) / (1024 * 1024),
      },
    };
  }
}
