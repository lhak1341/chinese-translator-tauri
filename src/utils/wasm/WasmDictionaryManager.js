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

import init, { DictionaryEngine } from '../../wasm/translation_wasm_core.js';
import { wasmMemoryPoolManager } from './WasmMemoryPoolManager.js';
import { logger } from '../logger';
import { wasmTextAssembler } from './WasmTextAssembler';
import { TOAST_DURATIONS, TOAST_IDS } from '../../constants/toastConfig';
import { FallbackManager } from '../FallbackManager';
import { WasmProcessorLifecycle } from './WasmProcessorLifecycle';
import { registerCascadeHandler, fireCascadeRetire } from './WasmCascadeRegistry';

// Static literal required so Vite transforms import.meta.url to the correct asset URL in production
const _WASM_BINARY_URL = new URL('../../wasm/translation_wasm_core_bg.wasm', import.meta.url);

// Set when shared WASM module is known-corrupted (e.g. NumberProcessor panic).
// Guards all engine calls so the corrupted module is never touched again.
let _sharedModuleCorrupted = false;

export function retireWasmDictionaryOnSharedPanic() {
  _sharedModuleCorrupted = true;
}
registerCascadeHandler(retireWasmDictionaryOnSharedPanic);

export class WasmDictionaryManager {
  constructor() {
    this._lifecycle = new WasmProcessorLifecycle({
      name: 'DictionaryManager',
      wasmFileName: 'translation_wasm_core_bg.wasm',
      wasmBinaryUrl: _WASM_BINARY_URL,
      expectedMethods: ['load_dictionary', 'find_matches', 'find_longest_match'],
    });

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

    // REFACTOR (2026-01-28): Centralized failure handling via FallbackManager
    this.fallbackHandler = new FallbackManager({
      systemName: 'WASM Dictionary Engine',
      maxFailures: 3,
      toastMessage: 'Dictionary system using slower fallback mode. Performance may be reduced.',
      toastId: TOAST_IDS.WASM_DICT_FALLBACK,
      toastDuration: TOAST_DURATIONS.LOAD_FAILURE,
    });

    // ARCHITECTURAL FIX: Track sync failures for performance dashboard
    // CODE REVIEW FIX (CRITICAL-2): Use pre-allocated circular buffers
    this.syncFailureTracking = {
      totalSyncAttempts: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncAttempt: null,
      lastSyncSuccess: null,
      lastSyncFailure: null,
      failureReasons: new Array(10).fill(null), // Pre-allocated circular buffer
      syncHistory: new Array(20).fill(null), // Pre-allocated circular buffer
      // Track batch vs sequential loading separately
      batchAttempts: 0,
      batchSuccesses: 0,
      sequentialAttempts: 0,
      sequentialSuccesses: 0,
    };

    // Circular buffer indices for O(1) operations
    this.failureReasonsIndex = 0;
    this.syncHistoryIndex = 0;

    // Memory pool integration
    this.memoryPool = wasmMemoryPoolManager;
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
    logger.log('🦀 Initializing WASM Dictionary Engine...');

    const success = await this._lifecycle.initialize(async (wasmBinary) => {
      // Pass verified binary to init — parity with Pattern and Number processors
      await init(wasmBinary);
      const engine = new DictionaryEngine();
      this.engine = engine;
      logger.log('✅ WASM Dictionary Engine initialized successfully');
      return engine;
    });

    if (!success) {
      this.initialized = false;
      this.fallbackHandler.recordFailure();
      return false;
    }

    this.fallbackManager = fallbackManager;
    this.initialized = true;
    this.fallbackHandler.recordSuccess();
    return true;
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

    if (!this.initialized || this.fallbackHandler.isInFallbackMode()) {
      logger.log('🔄 Using fallback for batch loading (WASM not available)');
      this._recordSyncFailure('WASM not initialized or in fallback mode', 'batch');
      // CRITICAL FIX: Pass _skipMetrics=true to prevent double-counting
      // Batch attempt already counted above (line 116), fallback loop shouldn't increment sequential metrics
      // Without this: batch fail for 12 dicts = 1 batch attempt + 12 sequential attempts (wrong!)
      // With this: batch fail for 12 dicts = 1 batch attempt + 0 sequential attempts (correct!)
      let successCount = 0;
      for (const { name, entries } of dictionaries) {
        const success = await this.loadDictionary(name, entries, true); // Skip metrics
        if (success) successCount++;
      }
      logger.log(
        `✅ Sequential fallback loaded ${successCount}/${dictionaries.length} dictionaries`
      );

      // CODE REVIEW FIX (CRITICAL-1): Record sequential fallback success
      if (successCount === dictionaries.length) {
        this._recordSyncSuccess('sequential_fallback');
      } else {
        this._recordSyncFailure(
          `Sequential fallback only loaded ${successCount}/${dictionaries.length} dictionaries`,
          'sequential_fallback'
        );
      }

      // Return actual success — callers must know when only a partial set loaded
      // so they can avoid producing silent translation gaps from missing dictionaries.
      return successCount === dictionaries.length;
    }

    try {
      logger.log(`🚀 Memory pool batch loading ${dictionaries.length} dictionaries...`);

      // Estimate memory requirements for batch operation
      const totalEntries = dictionaries.reduce((sum, dict) => sum + dict.entries.length, 0);
      const estimatedMemoryNeeds = this.estimateBatchMemoryRequirement(dictionaries);

      // CODE REVIEW FIX: Track buffer and its release status
      let buffer = null;
      let bufferReleased = false;

      try {
        // Get optimized buffer from memory pool (inside try to ensure cleanup)
        buffer = this.memoryPool.getBuffer(estimatedMemoryNeeds);
        // Convert all dictionaries to WASM format in one operation
        const batchData = dictionaries.map(({ name, entries }) => ({
          name,
          entries: entries.map((entry) => ({
            chinese: entry.chinese || entry.original || entry.word || '',
            vietnamese: entry.vietnamese || entry.translation || '',
            metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
          })),
        }));

        // INVESTIGATION: Check if batch methods exist (debug only)
        const hasBatchMethod = typeof this.engine.load_dictionaries_batch === 'function';
        const hasFallbackMethod =
          typeof this.engine.load_dictionaries_batch_fallback === 'function';

        logger.debug(
          `🔍 WASM batch method investigation:\n` +
            `  - load_dictionaries_batch exists: ${hasBatchMethod}\n` +
            `  - load_dictionaries_batch_fallback exists: ${hasFallbackMethod}\n` +
            `  - Available methods: ${Object.keys(this.engine)
              .filter((k) => typeof this.engine[k] === 'function')
              .join(', ')}`
        );

        // Single WASM call for all dictionaries with memory pool optimization
        // JSON.stringify required — load_dictionaries_batch takes &str to avoid JS interop during Rc borrow
        const success =
          this.engine.load_dictionaries_batch?.(JSON.stringify(batchData)) ??
          this.engine.load_dictionaries_batch_fallback?.(batchData) ??
          false;

        if (success) {
          // Update performance stats with memory pool usage
          this.performanceStats.memoryUsage = this.memoryPool.getCurrentMemoryUsage();
          logger.log(
            `✅ Memory pool batch loaded ${dictionaries.length} dictionaries (${totalEntries} entries, ${(estimatedMemoryNeeds / 1024).toFixed(1)}KB buffer)`
          );
          // ARCHITECTURAL FIX: Record successful sync
          this._recordSyncSuccess('batch');

          return true;
        } else {
          logger.log('⚠️ Memory pool batch loading returned false, using sequential fallback');
          this._recordSyncFailure('Batch loading returned false', 'batch');
          return false; // Trigger fallback to sequential loading
        }
      } finally {
        // CODE REVIEW FIX: Guarantee buffer return even on process interruption, with null check
        if (buffer && !bufferReleased) {
          this.memoryPool.returnBuffer(buffer);
          bufferReleased = true;
        }
      }
    } catch (error) {
      logger.error('❌ Batch dictionary loading failed:', error);

      // ARCHITECTURAL FIX: Record sync failure with reason
      this._recordSyncFailure(error.message || 'Unknown error', 'batch');

      // REFACTOR (2026-01-28): Use centralized failure handling
      this.handleFailure();

      return false;
    }
  }

  async loadDictionary(name, entries, _skipMetrics = false) {
    // ARCHITECTURAL FIX: Track sequential loading attempts
    // CRITICAL FIX: Skip metrics when called as batch fallback to prevent double-counting
    if (!_skipMetrics) {
      this.syncFailureTracking.sequentialAttempts++;
    }

    if (!this.initialized || this.fallbackHandler.isInFallbackMode()) {
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

      // JSON.stringify required — load_dictionary takes &str to avoid JS interop during Rc borrow
      const success = this.engine.load_dictionary(name, JSON.stringify(wasmEntries));

      if (success) {
        logger.log(`📚 Loaded dictionary '${name}' into WASM: ${entries.length} entries`);

        // REFACTOR (2026-01-28): Use centralized failure tracking
        this.fallbackHandler.recordSuccess();

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
   * CODE REVIEW FIX (MEDIUM-6): Added size limit to prevent DoS
   * CODE REVIEW FIX (CRITICAL-3): Added structure validation for pattern metadata
   */
  _safeParseMetadata(metadataString) {
    if (!metadataString) return null;

    // CRITICAL: Size limit to prevent DoS from malicious large metadata
    // 10KB is reasonable for pattern metadata (e.g., priority, variables)
    const MAX_METADATA_SIZE = 10240; // 10KB
    if (metadataString.length > MAX_METADATA_SIZE) {
      logger.warn(
        `⚠️ Metadata too large (${metadataString.length} bytes, max ${MAX_METADATA_SIZE}), using null`
      );
      return null;
    }

    try {
      const parsed = JSON.parse(metadataString);

      // CODE REVIEW FIX (CRITICAL-3): Validate pattern metadata structure
      // Invalid structure could crash pattern priority calculation
      if (parsed !== null && typeof parsed === 'object') {
        // Validate priority field (used in PatternPriorityCalculator)
        if (parsed.priority !== undefined && typeof parsed.priority !== 'number') {
          logger.warn(
            `⚠️ Invalid priority type in metadata (${typeof parsed.priority}), using null`
          );
          return null;
        }

        // Validate variables field (used in pattern matching)
        if (parsed.variables !== undefined && !Array.isArray(parsed.variables)) {
          logger.warn(
            `⚠️ Invalid variables type in metadata (${typeof parsed.variables}), using null`
          );
          return null;
        }

        // Validate lowPriority flag (used in priority calculation)
        if (parsed.lowPriority !== undefined && typeof parsed.lowPriority !== 'boolean') {
          logger.warn(
            `⚠️ Invalid lowPriority type in metadata (${typeof parsed.lowPriority}), using null`
          );
          return null;
        }

        // Validate allowAsPatternVariable flag (used in two-phase processing)
        if (
          parsed.allowAsPatternVariable !== undefined &&
          typeof parsed.allowAsPatternVariable !== 'boolean'
        ) {
          logger.warn(
            `⚠️ Invalid allowAsPatternVariable type in metadata (${typeof parsed.allowAsPatternVariable}), using null`
          );
          return null;
        }
      }

      return parsed;
    } catch (error) {
      logger.warn('⚠️ Corrupted metadata encountered, using null:', error.message);
      return null;
    }
  }

  findMatches(dictionaryName, text, startPos = 0) {
    if (!this.initialized || _sharedModuleCorrupted || this.fallbackHandler.isInFallbackMode()) {
      return this.fallbackManager?.findMatches?.(dictionaryName, text, startPos) ?? [];
    }

    try {
      // find_matches returns a JSON string — zero JS interop inside WASM Rc borrow window
      const matches = JSON.parse(this.engine.find_matches(dictionaryName, text, startPos));

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
      _sharedModuleCorrupted = true;
      wasmTextAssembler.retireOnSharedModulePanic();
      this.handleFailure();
      fireCascadeRetire();
      return this.fallbackManager?.findMatches?.(dictionaryName, text, startPos) ?? [];
    }
  }

  findLongestMatch(dictionaryName, text, startPos = 0) {
    if (!this.initialized || _sharedModuleCorrupted || this.fallbackHandler.isInFallbackMode()) {
      return this.fallbackManager?.findLongestMatch?.(dictionaryName, text, startPos) ?? null;
    }

    try {
      // find_longest_match returns a JSON string — zero JS interop inside WASM Rc borrow window
      const match = JSON.parse(this.engine.find_longest_match(dictionaryName, text, startPos));

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
      _sharedModuleCorrupted = true;
      wasmTextAssembler.retireOnSharedModulePanic();
      this.handleFailure();
      fireCascadeRetire();
      return this.fallbackManager?.findLongestMatch?.(dictionaryName, text, startPos) ?? null;
    }
  }

  /**
   * Handle WASM operation failure
   * REFACTOR (2026-01-28): Delegates to FallbackManager for consistent handling
   */
  handleFailure() {
    this.fallbackHandler.recordFailure();
  }

  // Performance and status methods
  getPerformanceReport() {
    if (!this.initialized || !this.engine) {
      return {
        initialized: false,
        fallbackMode: this.fallbackHandler.isInFallbackMode(),
        error: 'WASM engine not initialized',
      };
    }

    try {
      const wasmStats = JSON.parse(this.engine.get_performance_stats());
      return {
        ...wasmStats,
        initialized: this.initialized,
        fallbackMode: this.fallbackHandler.isInFallbackMode(),
        consecutiveFailures: this.fallbackHandler.getFailureCount(),
      };
    } catch (error) {
      return {
        initialized: this.initialized,
        fallbackMode: this.fallbackHandler.isInFallbackMode(),
        error: error.message,
      };
    }
  }

  getDictionaryCount() {
    return this.initialized && !_sharedModuleCorrupted && !this.fallbackHandler.isInFallbackMode()
      ? this.engine.get_dictionary_count()
      : 0;
  }

  getTotalEntries() {
    return this.initialized && !_sharedModuleCorrupted && !this.fallbackHandler.isInFallbackMode()
      ? this.engine.get_total_entries()
      : 0;
  }

  hasDictionary(name) {
    return this.initialized && !_sharedModuleCorrupted && !this.fallbackHandler.isInFallbackMode()
      ? this.engine.has_dictionary(name)
      : false;
  }

  clearAllDictionaries() {
    if (this.initialized && !this.fallbackHandler.isInFallbackMode()) {
      this.engine.clear_all_dictionaries();
    }
  }

  // Status check methods
  isInitialized() {
    return this.initialized;
  }

  isInFallbackMode() {
    return this.fallbackHandler.isInFallbackMode();
  }

  /**
   * Estimate memory requirement for batch dictionary loading
   *
   * CODE REVIEW FIX (MEDIUM-2): Improved accuracy and documentation
   *
   * Memory estimation formula:
   * - Chinese characters: 3 bytes/char (UTF-8 typical)
   * - Vietnamese characters: 1.5 bytes/char average (mostly Latin-1 + diacritics)
   * - Metadata: 2 bytes/char (JSON overhead)
   * - Structure overhead: 50% (trie nodes, pointers, padding)
   *
   * Conservative bounds:
   * - Minimum: 4KB (prevent tiny allocations)
   * - Maximum: 1MB (prevent OOM from malicious/corrupted data)
   *
   * @param {Array} dictionaries - Array of {name, entries}
   * @returns {number} Estimated memory in bytes
   */
  estimateBatchMemoryRequirement(dictionaries) {
    // Calculate total text size for all dictionary entries
    let totalTextSize = 0;

    for (const { entries } of dictionaries) {
      for (const entry of entries) {
        const chinese = entry.chinese || entry.original || entry.word || '';
        const vietnamese = entry.vietnamese || entry.translation || '';
        const metadata = entry.metadata ? JSON.stringify(entry.metadata) : '';

        // CODE REVIEW FIX (MEDIUM-2): More accurate UTF-8 size estimation
        // Chinese: 3 bytes/char (typical CJK in UTF-8)
        // Vietnamese: 1.5 bytes/char (Latin-1 base + diacritics)
        // Metadata: 2 bytes/char (JSON structure overhead)
        totalTextSize += chinese.length * 3 + vietnamese.length * 1.5 + metadata.length * 2;
      }
    }

    // Add overhead for structure and serialization (50% overhead)
    // Accounts for: trie nodes, HashMap entries, pointers, padding, Vec capacity
    const structureOverhead = Math.ceil(totalTextSize * 0.5);
    const totalEstimate = totalTextSize + structureOverhead;

    // Minimum 4KB (avoid tiny allocations), maximum 1MB (prevent OOM)
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
    };
  }

  /**
   * ARCHITECTURAL FIX: Record successful sync for performance dashboard
   * CODE REVIEW FIX (CRITICAL-2): Use circular buffer for O(1) operations
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

    // Add to history using circular buffer (O(1) instead of O(n) with shift)
    this.syncFailureTracking.syncHistory[this.syncHistoryIndex] = {
      timestamp: Date.now(),
      success: true,
      method: method,
      reason: null,
    };

    this.syncHistoryIndex = (this.syncHistoryIndex + 1) % 20;
  }

  /**
   * ARCHITECTURAL FIX: Record sync failure with reason for performance dashboard
   * CODE REVIEW FIX (CRITICAL-2): Use circular buffer + truncate messages
   * @private
   * @param {string} reason - Failure reason
   * @param {string} method - 'batch' or 'sequential'
   */
  _recordSyncFailure(reason, method = 'unknown') {
    this.syncFailureTracking.failedSyncs++;
    this.syncFailureTracking.lastSyncFailure = Date.now();

    // CRITICAL FIX: Truncate large error messages to prevent unbounded growth
    const MAX_REASON_LENGTH = 200; // 200 chars = ~200 bytes
    const truncatedReason =
      typeof reason === 'string' && reason.length > MAX_REASON_LENGTH
        ? reason.substring(0, MAX_REASON_LENGTH) + '...'
        : reason;

    // Use circular buffer (O(1) instead of O(n) with shift)
    this.syncFailureTracking.failureReasons[this.failureReasonsIndex] = {
      timestamp: Date.now(),
      method: method,
      reason: truncatedReason,
    };

    this.failureReasonsIndex = (this.failureReasonsIndex + 1) % 10;

    // Add to history using circular buffer
    this.syncFailureTracking.syncHistory[this.syncHistoryIndex] = {
      timestamp: Date.now(),
      success: false,
      method: method,
      reason: truncatedReason,
    };

    this.syncHistoryIndex = (this.syncHistoryIndex + 1) % 20;
  }

  /**
   * ARCHITECTURAL FIX: Get sync metrics for performance dashboard
   * CODE REVIEW FIX (CRITICAL-2): Filter null entries from circular buffers
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

    // Filter out null entries from circular buffers
    const validFailures = this.syncFailureTracking.failureReasons.filter((f) => f !== null);
    const validHistory = this.syncFailureTracking.syncHistory.filter((h) => h !== null);

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

      // Failure tracking (filter nulls from circular buffer)
      recentFailures: validFailures.slice(-5), // Last 5 non-null failures
      syncHistory: validHistory, // All non-null history entries

      // Status
      currentStatus: this.fallbackHandler.isInFallbackMode()
        ? 'FALLBACK_MODE'
        : this.initialized
          ? 'ACTIVE'
          : 'NOT_INITIALIZED',
      consecutiveFailures: this.fallbackHandler.getFailureCount(),
    };
  }

  /**
   * Clean up resources including memory pool
   * CODE REVIEW FIX (HIGH-2): Clear WASM dictionaries before nullifying engine
   */
  cleanup() {
    // CODE REVIEW FIX (HIGH-2): Clear WASM dictionaries before cleanup
    // Without this, 15MB+ WASM memory may not be released until GC runs
    if (this.engine && typeof this.engine.clear_all_dictionaries === 'function') {
      try {
        this.engine.clear_all_dictionaries();
        logger.log('🗑️ WASM dictionaries cleared before cleanup');
      } catch (error) {
        logger.error('Failed to clear WASM dictionaries during cleanup:', error);
      }
    }

    if (this.memoryPool) {
      this.memoryPool.cleanup();
    }

    this.engine = null;
    this.initialized = false;

    logger.log('🧠 WASM Dictionary Manager with Memory Pool cleaned up');
  }
}
