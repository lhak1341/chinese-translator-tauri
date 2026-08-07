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
/** @import { WasmBufferAllocator } from './WasmMemoryPoolManager.js' */
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
  /** @param {WasmBufferAllocator} [allocator] */
  constructor(allocator = wasmMemoryPoolManager) {
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

    // Memory pool integration
    this.memoryPool = allocator;
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

  async loadDictionary(name, entries) {
    if (!this.initialized || this.fallbackHandler.isInFallbackMode()) {
      logger.log(`🔄 Using fallback for dictionary ${name} (WASM not available)`);
      return this.fallbackManager?.loadDictionary(name, entries) ?? false;
    }

    try {
      // Convert entries to WASM format. metadata arrives pre-serialized
      // (string|null) from DictionaryManager.flatEntries — do not re-stringify.
      const wasmEntries = entries.map((entry) => ({
        chinese: entry.chinese || entry.original || entry.word || '',
        vietnamese: entry.vietnamese || entry.translation || '',
        metadata: entry.metadata ?? null,
      }));

      // JSON.stringify required — load_dictionary takes &str to avoid JS interop during Rc borrow
      const success = this.engine.load_dictionary(name, JSON.stringify(wasmEntries));

      if (success) {
        logger.log(`📚 Loaded dictionary '${name}' into WASM: ${entries.length} entries`);

        // REFACTOR (2026-01-28): Use centralized failure tracking
        this.fallbackHandler.recordSuccess();

        this.performanceStats.memoryUsage = this.memoryPool.getStats().totalMemoryUsage;
      }

      return success;
    } catch (error) {
      logger.error(`❌ WASM dictionary loading failed for ${name}:`, error);
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
            // Drop-only, no fallback substitution: this is one entry in a multi-match
            // array — the other matches from this same call are still valid and must
            // survive. Contrast with findLongestMatch below, which substitutes the
            // fallback's whole result because it has nothing else to return.
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
        // Fallback substitution, not drop-only: this call returns a single result,
        // so a corrupt one must be replaced wholesale — there's no sibling match to
        // fall back on the way findMatches's array-filter branch has.
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
