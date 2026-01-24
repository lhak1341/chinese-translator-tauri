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

import init, { DictionaryEngine } from '../wasm/translation_wasm_core.js';
import { wasmMemoryPoolManager, WasmDictionaryOperationHelper } from './WasmMemoryPoolManager.js';
import toast from './toast';
import { logger } from './logger';

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

    // HIGH-4 FIX: Track if fallback warning shown
    this.notifiedFallbackMode = false;

    // ARCHITECTURAL FIX: Track sync failures for performance dashboard
    this.syncFailureTracking = {
      totalSyncAttempts: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncAttempt: null,
      lastSyncSuccess: null,
      lastSyncFailure: null,
      failureReasons: [], // Last 10 failure reasons
      syncHistory: [], // Last 20 sync attempts with timestamps
      // Track batch vs sequential loading separately
      batchAttempts: 0,
      batchSuccesses: 0,
      sequentialAttempts: 0,
      sequentialSuccesses: 0,
    };

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
      logger.log('🦀 Initializing WASM Dictionary Engine...');

      // Initialize the WASM module
      await init();

      // Create the engine instance
      this.engine = new DictionaryEngine();
      this.fallbackManager = fallbackManager;

      // Initialize memory pool operation helper
      this.operationHelper = new WasmDictionaryOperationHelper(this.memoryPool, this);

      this.initialized = true;
      this.fallbackMode = false;

      logger.log('✅ WASM Dictionary Engine initialized successfully');
      return true;
    } catch (error) {
      logger.error('❌ WASM initialization failed:', error);
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
    // ARCHITECTURAL FIX: Track sync attempt
    this.syncFailureTracking.totalSyncAttempts++;
    this.syncFailureTracking.batchAttempts++;
    this.syncFailureTracking.lastSyncAttempt = Date.now();

    if (!this.initialized || this.fallbackMode) {
      logger.log('🔄 Using fallback for batch loading (WASM not available)');
      this._recordSyncFailure('WASM not initialized or in fallback mode', 'batch');
      // Fall back to sequential loading (tracked separately)
      let successCount = 0;
      for (const { name, entries } of dictionaries) {
        const success = await this.loadDictionary(name, entries);
        if (success) successCount++;
      }
      logger.log(
        `✅ Sequential fallback loaded ${successCount}/${dictionaries.length} dictionaries`
      );
      return true;
    }

    try {
      logger.log(`🚀 Memory pool batch loading ${dictionaries.length} dictionaries...`);

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
          logger.log(
            `✅ Memory pool batch loaded ${dictionaries.length} dictionaries (${totalEntries} entries, ${(estimatedMemoryNeeds / 1024).toFixed(1)}KB buffer)`
          );
          this.consecutiveFailures = 0;

          // ARCHITECTURAL FIX: Record successful sync
          this._recordSyncSuccess('batch');

          return true;
        } else {
          logger.log('⚠️ Memory pool batch loading returned false, using sequential fallback');
          this._recordSyncFailure('Batch loading returned false', 'batch');
          return false; // Trigger fallback to sequential loading
        }
      } finally {
        // Always return buffer to pool
        this.memoryPool.returnBuffer(buffer);
      }
    } catch (error) {
      logger.error('❌ Batch dictionary loading failed:', error);
      this.consecutiveFailures++;

      // ARCHITECTURAL FIX: Record sync failure with reason
      this._recordSyncFailure(error.message || 'Unknown error', 'batch');

      if (this.consecutiveFailures >= this.maxFailuresBeforeFallback) {
        logger.log('🔄 Too many failures, switching to fallback mode');
        this.fallbackMode = true;
      }

      return false;
    }
  }

  async loadDictionary(name, entries) {
    // ARCHITECTURAL FIX: Track sequential loading attempts
    this.syncFailureTracking.sequentialAttempts++;

    if (!this.initialized || this.fallbackMode) {
      logger.log(`🔄 Using fallback for dictionary ${name} (WASM not available)`);
      this._recordSyncFailure(`Sequential: WASM not available for ${name}`, 'sequential');
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
        logger.log(`📚 Loaded dictionary '${name}' into WASM: ${entries.length} entries`);
        this.consecutiveFailures = 0; // Reset failure counter
        this.performanceStats.memoryUsage = this.memoryPool.getCurrentMemoryUsage();

        // ARCHITECTURAL FIX: Record sequential success
        this._recordSyncSuccess('sequential');
      } else {
        this._recordSyncFailure(
          `Sequential: load_dictionary returned false for ${name}`,
          'sequential'
        );
      }

      return success;
    } catch (error) {
      logger.error(`❌ WASM dictionary loading failed for ${name}:`, error);
      this._recordSyncFailure(`Sequential: ${error.message} for ${name}`, 'sequential');
      this.handleFailure();
      return this.fallbackManager?.loadDictionary(name, entries) ?? false;
    }
  }

  /**
   * Safely parse JSON metadata with fallback to null
   * Prevents metadata corruption from crashing WASM lookups
   */
  _safeParseMetadata(metadataString) {
    if (!metadataString) return null;

    try {
      return JSON.parse(metadataString);
    } catch (error) {
      logger.warn('⚠️ Corrupted metadata encountered, using null:', error.message);
      return null;
    }
  }

  findMatches(dictionaryName, text, startPos = 0) {
    if (!this.initialized || this.fallbackMode) {
      return this.fallbackManager?.findMatches?.(dictionaryName, text, startPos) ?? [];
    }

    try {
      const matches = this.engine.find_matches(dictionaryName, text, startPos);

      // MEDIUM-2 FIX: Validate WASM results to prevent undefined values in translations
      // Convert results to expected format with safe metadata parsing
      return matches
        .map((match) => {
          // Rust Option<String> serializes to undefined, not null
          // Explicitly convert undefined → null to prevent "undefined" in output
          const word = match.word === undefined ? null : match.word;
          const translation = match.translation === undefined ? null : match.translation;

          // Validation: Ensure required fields are present
          if (!word || !translation) {
            logger.warn('⚠️ WASM returned undefined values, falling back to JavaScript', {
              dictionaryName,
              match,
            });
            this.handleFailure(); // Enter fallback mode after undefined values
            return null; // Filter out invalid matches
          }

          return {
            word,
            translation,
            startPos: match.start_pos,
            endPos: match.end_pos,
            metadata: this._safeParseMetadata(match.metadata),
          };
        })
        .filter((match) => match !== null); // Remove invalid matches
    } catch (error) {
      logger.error('❌ WASM lookup failed:', error);
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

      // MEDIUM-2 FIX: Validate WASM results to prevent undefined values
      // Rust Option<String> serializes to undefined, not null
      const word = match.word === undefined ? null : match.word;
      const translation = match.translation === undefined ? null : match.translation;

      // Validation: Ensure required fields are present
      if (!word || !translation) {
        logger.warn('⚠️ WASM findLongestMatch returned undefined values, falling back', {
          dictionaryName,
          match,
        });
        this.handleFailure(); // Enter fallback mode
        return this.fallbackManager?.findLongestMatch?.(dictionaryName, text, startPos) ?? null;
      }

      return {
        word,
        translation,
        startPos: match.start_pos,
        endPos: match.end_pos,
        metadata: this._safeParseMetadata(match.metadata),
      };
    } catch (error) {
      logger.error('❌ WASM longest match failed:', error);
      this.handleFailure();
      return this.fallbackManager?.findLongestMatch?.(dictionaryName, text, startPos) ?? null;
    }
  }

  handleFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.maxFailuresBeforeFallback) {
      logger.warn('🚨 WASM engine entering fallback mode after repeated failures');
      this.fallbackMode = true;

      // HIGH-4 FIX: Show one-time notification when entering fallback mode
      if (!this.notifiedFallbackMode) {
        toast.warning('Dictionary system using slower fallback mode. Performance may be reduced.', {
          duration: 5000,
        });
        this.notifiedFallbackMode = true;
      }
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
   * ARCHITECTURAL FIX: Record successful sync for performance dashboard
   * @private
   * @param {string} method - 'batch' or 'sequential'
   */
  _recordSyncSuccess(method = 'unknown') {
    this.syncFailureTracking.successfulSyncs++;
    this.syncFailureTracking.lastSyncSuccess = Date.now();

    // Track method-specific successes
    if (method === 'batch') {
      this.syncFailureTracking.batchSuccesses++;
    } else if (method === 'sequential') {
      this.syncFailureTracking.sequentialSuccesses++;
    }

    // Add to history (keep last 20)
    this.syncFailureTracking.syncHistory.push({
      timestamp: Date.now(),
      success: true,
      method: method,
      reason: null,
    });

    if (this.syncFailureTracking.syncHistory.length > 20) {
      this.syncFailureTracking.syncHistory.shift();
    }
  }

  /**
   * ARCHITECTURAL FIX: Record sync failure with reason for performance dashboard
   * @private
   * @param {string} reason - Failure reason
   * @param {string} method - 'batch' or 'sequential'
   */
  _recordSyncFailure(reason, method = 'unknown') {
    this.syncFailureTracking.failedSyncs++;
    this.syncFailureTracking.lastSyncFailure = Date.now();

    // Add to failure reasons (keep last 10)
    this.syncFailureTracking.failureReasons.push({
      timestamp: Date.now(),
      method: method,
      reason: reason,
    });

    if (this.syncFailureTracking.failureReasons.length > 10) {
      this.syncFailureTracking.failureReasons.shift();
    }

    // Add to history (keep last 20)
    this.syncFailureTracking.syncHistory.push({
      timestamp: Date.now(),
      success: false,
      method: method,
      reason: reason,
    });

    if (this.syncFailureTracking.syncHistory.length > 20) {
      this.syncFailureTracking.syncHistory.shift();
    }
  }

  /**
   * ARCHITECTURAL FIX: Get sync metrics for performance dashboard
   * @returns {Object} Sync metrics including success rate and recent failures
   */
  getSyncMetrics() {
    const {
      totalSyncAttempts,
      successfulSyncs,
      failedSyncs,
      batchAttempts,
      batchSuccesses,
      sequentialAttempts,
      sequentialSuccesses,
    } = this.syncFailureTracking;

    // Calculate overall success rate
    const overallSuccessRate =
      totalSyncAttempts > 0 ? ((successfulSyncs / totalSyncAttempts) * 100).toFixed(1) : '0.0';

    // Calculate batch success rate
    const batchSuccessRate =
      batchAttempts > 0 ? ((batchSuccesses / batchAttempts) * 100).toFixed(1) : 'N/A';

    // Calculate sequential success rate
    const sequentialSuccessRate =
      sequentialAttempts > 0
        ? ((sequentialSuccesses / sequentialAttempts) * 100).toFixed(1)
        : 'N/A';

    return {
      // Overall metrics
      totalAttempts: totalSyncAttempts,
      successfulSyncs: successfulSyncs,
      failedSyncs: failedSyncs,
      successRate: overallSuccessRate,

      // Batch loading metrics
      batch: {
        attempts: batchAttempts,
        successes: batchSuccesses,
        successRate: batchSuccessRate,
      },

      // Sequential loading metrics
      sequential: {
        attempts: sequentialAttempts,
        successes: sequentialSuccesses,
        successRate: sequentialSuccessRate,
      },

      // Timestamps
      lastSyncAttempt: this.syncFailureTracking.lastSyncAttempt,
      lastSyncSuccess: this.syncFailureTracking.lastSyncSuccess,
      lastSyncFailure: this.syncFailureTracking.lastSyncFailure,

      // Failure tracking
      recentFailures: this.syncFailureTracking.failureReasons.slice(-5), // Last 5 failures
      syncHistory: this.syncFailureTracking.syncHistory,

      // Status
      currentStatus: this.fallbackMode
        ? 'FALLBACK_MODE'
        : this.initialized
          ? 'ACTIVE'
          : 'NOT_INITIALIZED',
      consecutiveFailures: this.consecutiveFailures,
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

    logger.log('🧠 WASM Dictionary Manager with Memory Pool cleaned up');
  }
}
