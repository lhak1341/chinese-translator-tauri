/**
 * WASM Dictionary Manager - Memory Pool Integration
 * Provides a JavaScript wrapper around the Rust WASM dictionary engine
 * with optimized memory allocation and batch processing
 *
 * @import {
 *   WasmDictionaryManagerOptions,
 *   WasmPerformanceStats,
 *   WasmPerformanceReport,
 *   WasmEnhancedPerformanceReport,
 *   DictionaryEntry,
 *   WasmDictionaryEntry,
 *   WasmBatchDictionary,
 *   WasmMatchResult,
 *   TrieMatch,
 *   MemoryPoolStats
 * } from '../types/DictionaryManagerTypes'
 */

import init, { DictionaryEngine } from '../wasm/translation_wasm.js';
import { wasmMemoryPoolManager, WasmDictionaryOperationHelper } from './WasmMemoryPoolManager.js';

export class WasmDictionaryManager {
  constructor() {
    this.engine = null;
    this.initialized = false;
    this.fallbackManager = null;
    this.initializationPromise = null;

    // Performance tracking
    this.performanceStats = {
      totalLookups: 0,
      totalTime: 0,
      averageTime: 0,
      cacheHitRate: 0,
      memoryUsage: 0,
    };

    // Fallback trigger conditions
    this.consecutiveFailures = 0;
    this.maxFailuresBeforeFallback = 3;
    this.fallbackMode = false;

    // Memory pool integration
    this.memoryPool = wasmMemoryPoolManager;
    this.operationHelper = null; // Initialize after WASM engine is ready
  }

  async initialize(fallbackManager, config = {}) {
    // Prevent multiple initialization attempts
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize(fallbackManager, config);
    return this.initializationPromise;
  }

  async _doInitialize(fallbackManager, _config) {
    try {
      console.log('🦀 Initializing WASM Dictionary Engine...');

      // Initialize the WASM module
      await init();

      // Create the engine instance
      this.engine = new DictionaryEngine();
      this.fallbackManager = fallbackManager;

      // Initialize memory pool operation helper
      this.operationHelper = new WasmDictionaryOperationHelper(this.memoryPool, this);

      this.initialized = true;
      this.fallbackMode = false;

      console.log('✅ WASM Dictionary Engine initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ WASM initialization failed:', error);
      this.initialized = false;
      this.fallbackMode = true;
      return false;
    }
  }

  /**
   * Batch load multiple dictionaries in a single WASM call
   * Reduces boundary crossings from N calls to 1 call
   */
  async loadDictionariesBatch(dictionaries) {
    if (!this.initialized || this.fallbackMode) {
      console.log('🔄 Using fallback for batch loading (WASM not available)');
      // Fall back to sequential loading
      for (const { name, entries } of dictionaries) {
        await this.loadDictionary(name, entries);
      }
      return true;
    }

    try {
      console.log(`🚀 Memory pool batch loading ${dictionaries.length} dictionaries...`);

      // Estimate memory requirements for batch operation
      const totalEntries = dictionaries.reduce((sum, dict) => sum + dict.entries.length, 0);
      const estimatedMemoryNeeds = this.estimateBatchMemoryRequirement(dictionaries);

      // Get optimized buffer from memory pool
      const buffer = this.memoryPool.getBuffer(estimatedMemoryNeeds);

      try {
        // Convert all dictionaries to WASM format in one operation
        const batchData = dictionaries.map(({ name, entries }) => ({
          name,
          entries: entries.map((entry) => ({
            chinese: entry.chinese || entry.original || entry.word || '',
            vietnamese: entry.vietnamese || entry.translation || '',
            metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
          })),
        }));

        // Single WASM call for all dictionaries with memory pool optimization
        const success =
          this.engine.load_dictionaries_batch?.(batchData) ??
          this.engine.load_dictionaries_batch_fallback?.(batchData) ??
          false;

        if (success) {
          // Update performance stats with memory pool usage
          this.performanceStats.memoryUsage = this.memoryPool.getCurrentMemoryUsage();
          console.log(
            `✅ Memory pool batch loaded ${dictionaries.length} dictionaries (${totalEntries} entries, ${(estimatedMemoryNeeds / 1024).toFixed(1)}KB buffer)`
          );
          this.consecutiveFailures = 0;
          return true;
        } else {
          console.log('⚠️ Memory pool batch loading returned false, using sequential fallback');
          return false; // Trigger fallback to sequential loading
        }
      } finally {
        // Always return buffer to pool
        this.memoryPool.returnBuffer(buffer);
      }
    } catch (error) {
      console.error('❌ Batch dictionary loading failed:', error);
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= this.maxFailuresBeforeFallback) {
        console.log('🔄 Too many failures, switching to fallback mode');
        this.fallbackMode = true;
      }

      return false;
    }
  }

  async loadDictionary(name, entries) {
    if (!this.initialized || this.fallbackMode) {
      console.log(`🔄 Using fallback for dictionary ${name} (WASM not available)`);
      return this.fallbackManager?.loadDictionary(name, entries) ?? false;
    }

    try {
      // Convert entries to WASM format
      const wasmEntries = entries.map((entry) => ({
        chinese: entry.chinese || entry.original || entry.word || '',
        vietnamese: entry.vietnamese || entry.translation || '',
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      }));

      const success = this.engine.load_dictionary(name, wasmEntries);

      if (success) {
        console.log(`📚 Loaded dictionary '${name}' into WASM: ${entries.length} entries`);
        this.consecutiveFailures = 0; // Reset failure counter
      }

      return success;
    } catch (error) {
      console.error(`❌ WASM dictionary loading failed for ${name}:`, error);
      this.handleFailure();
      return this.fallbackManager?.loadDictionary(name, entries) ?? false;
    }
  }

  findMatches(dictionaryName, text, startPos = 0) {
    if (!this.initialized || this.fallbackMode) {
      return this.fallbackManager?.findMatches?.(dictionaryName, text, startPos) ?? [];
    }

    try {
      const matches = this.engine.find_matches(dictionaryName, text, startPos);

      // Convert results to expected format
      return matches.map((match) => ({
        word: match.word,
        translation: match.translation,
        startPos: match.start_pos,
        endPos: match.end_pos,
        metadata: match.metadata ? JSON.parse(match.metadata) : null,
      }));
    } catch (error) {
      console.error('❌ WASM lookup failed:', error);
      this.handleFailure();
      return this.fallbackManager?.findMatches?.(dictionaryName, text, startPos) ?? [];
    }
  }

  findLongestMatch(dictionaryName, text, startPos = 0) {
    if (!this.initialized || this.fallbackMode) {
      return this.fallbackManager?.findLongestMatch?.(dictionaryName, text, startPos) ?? null;
    }

    try {
      const match = this.engine.find_longest_match(dictionaryName, text, startPos);

      if (!match) return null;

      return {
        word: match.word,
        translation: match.translation,
        startPos: match.start_pos,
        endPos: match.end_pos,
        metadata: match.metadata ? JSON.parse(match.metadata) : null,
      };
    } catch (error) {
      console.error('❌ WASM longest match failed:', error);
      this.handleFailure();
      return this.fallbackManager?.findLongestMatch?.(dictionaryName, text, startPos) ?? null;
    }
  }

  handleFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.maxFailuresBeforeFallback) {
      console.warn('🚨 WASM engine entering fallback mode after repeated failures');
      this.fallbackMode = true;
    }
  }

  // Performance and status methods
  getPerformanceReport() {
    if (!this.initialized || !this.engine) {
      return {
        initialized: false,
        fallbackMode: this.fallbackMode,
        error: 'WASM engine not initialized',
      };
    }

    try {
      const wasmStats = this.engine.get_performance_stats();
      return {
        ...wasmStats,
        initialized: this.initialized,
        fallbackMode: this.fallbackMode,
        consecutiveFailures: this.consecutiveFailures,
      };
    } catch (error) {
      return {
        initialized: this.initialized,
        fallbackMode: this.fallbackMode,
        error: error.message,
      };
    }
  }

  getDictionaryCount() {
    return this.initialized && !this.fallbackMode ? this.engine.get_dictionary_count() : 0;
  }

  getTotalEntries() {
    return this.initialized && !this.fallbackMode ? this.engine.get_total_entries() : 0;
  }

  hasDictionary(name) {
    return this.initialized && !this.fallbackMode ? this.engine.has_dictionary(name) : false;
  }

  clearAllDictionaries() {
    if (this.initialized && !this.fallbackMode) {
      this.engine.clear_all_dictionaries();
    }
  }

  // Status check methods
  isInitialized() {
    return this.initialized;
  }

  isInFallbackMode() {
    return this.fallbackMode;
  }

  /**
   * Estimate memory requirement for batch dictionary loading
   */
  estimateBatchMemoryRequirement(dictionaries) {
    // Calculate total text size for all dictionary entries
    let totalTextSize = 0;

    for (const { entries } of dictionaries) {
      for (const entry of entries) {
        const chinese = entry.chinese || entry.original || entry.word || '';
        const vietnamese = entry.vietnamese || entry.translation || '';
        const metadata = entry.metadata ? JSON.stringify(entry.metadata) : '';

        // Estimate UTF-8 size (worst case: 4 bytes per character)
        totalTextSize += (chinese.length + vietnamese.length + metadata.length) * 4;
      }
    }

    // Add overhead for structure and serialization (50% overhead)
    const structureOverhead = Math.ceil(totalTextSize * 0.5);
    const totalEstimate = totalTextSize + structureOverhead;

    // Minimum 4KB, maximum 1MB for safety
    return Math.max(4096, Math.min(totalEstimate, 1024 * 1024));
  }

  /**
   * Get enhanced performance report including memory pool statistics
   */
  getEnhancedPerformanceReport() {
    const baseReport = this.getPerformanceReport();

    return {
      ...baseReport,
      memoryPool: this.memoryPool.getStats(),
      operationHelper: this.operationHelper?.getStats?.() || null,
    };
  }

  /**
   * Clean up resources including memory pool
   */
  cleanup() {
    if (this.memoryPool) {
      this.memoryPool.cleanup();
    }

    if (this.operationHelper) {
      this.operationHelper = null;
    }

    this.engine = null;
    this.initialized = false;

    console.log('🧠 WASM Dictionary Manager with Memory Pool cleaned up');
  }
}
