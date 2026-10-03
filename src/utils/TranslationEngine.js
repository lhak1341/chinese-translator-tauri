/**
 * Optimized Translation Engine
 * Single-pass, token-based translation with efficient dictionary lookups and pattern matching
 *
 * =============================================================================
 * PUBLIC API — three exports, everything else is internal
 * =============================================================================
 *
 *   createTranslationEngine()   Factory — returns a new TranslationEngine instance.
 *                               Use this; do not call `new TranslationEngine()` directly.
 *
 *   TranslationEngine           Class — coordinates all 5 translation phases.
 *     .translateWithSegments()  Translates a Chinese text string → Vietnamese + highlighting.
 *     .translateWithChunking()  Long-text path with adaptive chunking.
 *     .postProcess()            Assembles semantic array after translation phases.
 *
 *   DEBUG_LEVELS                Enum — verbosity constants for engine logging.
 *
 * =============================================================================
 * FILE STRUCTURE (6355 lines)
 * =============================================================================
 *
 * This file coordinates all 5 translation phases with shared token state.
 * Large size is intentional - tight coupling prevents phase conflicts.
 *
 * SECTIONS (numbered by physical file order — NOT by the 5-phase execution order;
 * the two do not match. Phase 4 (Phrase Processing) and Phase 5 (Character
 * Processing) code physically precede Phase 2 (Proper Noun) code, for example.
 * Section names below still carry "PHASE N" where that's the section's dominant
 * content, but treat that as a label, not a guarantee the section is phase-pure —
 * see SECTION 10's note. Rebuilt 2026-09-26 after ~1,500 lines of dead methods were
 * deleted — see docs/guides/deleted-symbols.md):
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. Core Engine Class - Constructor     (Lines 296-506)    [COUPLED]
 *    - Critical: Initializes all subsystems
 *
 * 3. Dictionary Operations               (Lines 507-575)    [COUPLED]
 *    - Semantic caching with phase priority
 *    - Critical: Cache timing affects phase order
 *
 * 5. Engine Initialization               (Lines 754-936)    [COUPLED]
 *    - initialize()                      (Line 820) — dictionary loading & WASM setup
 *    - Critical: Initialization order matters
 *
 * 6. Main Translation Entry Points       (Lines 937-1302)   [COUPLED]
 *    - translateWithCharactersOnly()     (Line 1005)
 *    - Note: the non-progressive translate()/translateWithChunking()-as-dispatcher path was
 *      deleted 2026-08-17 (zero production reachability — translateWithSegments always takes
 *      the progressive branch); translateWithChunking()/translateDirectly() still exist and
 *      are still live, reached via processChunksInParallel(), not via this section
 *
 * 7. Conflict Resolution & Segment Helpers (Lines 1303-1567) [COUPLED]
 *    - translateWithSegments()           (Line 1382)
 *    - createOptimalPhraseGroups()       (Line 1489) — Phase 4, physically here
 *    - resolveGlobalConflicts()          (Line 1551) — Phase 4 conflict resolution
 *
 * 8. Phase 1 - Pattern Processing        (Lines 1568-1890)  [COUPLED]
 *    - applyPatterns()                   (Line 1636)
 *    - Hierarchical two-phase WASM patterns
 *    - Critical: Must run first (highest priority)
 *
 * 9. Phase 4 - Phrase Processing         (Lines 1891-2357)  [COUPLED]
 *    - The phase's entry, createOptimalPhraseGroups(), sits in section 7, not here
 *
 * 10. Phase 5 - Character Processing     (Lines 2358-2721)  [COUPLED]
 *     - Also contains Phase 2 (Proper Noun) logic: applyDictionaryTranslation()
 *       (Line 2492) sits inside this range, not its own section. The main Phase 5
 *       method, processRemainingTokensInBatches(), is NOT here — it's at Line
 *       4000, physically inside section 12 (Parallel Processing). Phase content
 *       and physical section boundaries diverge throughout this file; do not
 *       assume a section named after a phase contains only that phase's code.
 *
 * 11. Post-Processing                    (Lines 2722-3801)  [COUPLED]
 *     - postProcess()                    (Line 2798)
 *     - Semantic array, position mapping, text assembly
 *     - Critical: Position precision for clickable highlighting
 *
 * 12. Parallel Processing                (Lines 3802-4282)  [COUPLED]
 *     - processChunksInParallel()        (Line 3831)
 *     - processRemainingTokensInBatches() (Line 4000) — Phase 5's main method, see note above
 *     - Critical: assigns semantic indices by chunk-completion order
 *
 * 13. Progressive Batch Translation      (Lines 4283-4707)  [COUPLED]
 *     - translateWithProgressiveBatches() (Line 4294)
 *
 * 14. Chunked Translation Paths          (Lines 4708-5089)  [COUPLED]
 *     - translateWithChunking()          (Line 4785)
 *     - translateDirectly()              (Line 5003)
 *     - Note: translateWithChunking's only production entry point is
 *       translateDirectly's own oversized-input recursive fallback — see section 6
 *
 * 15. Core 5-Phase Pipeline              (Lines 5090-6268)  [COUPLED]
 *     - translateSinglePass()            (Line 5207)
 *       • Phase 1: Patterns
 *       • Phase 2: Proper Nouns
 *       • Phase 3: Numbers (NumberProcessor.processTokens, via this.numberProcessor —
 *         a separate class, not a TranslationEngine method like its phase siblings;
 *         fixed 2026-08-18, previously cited a non-existent processNumbersWasm method)
 *       • Phase 4: Phrases
 *       • Phase 5: Characters
 *     - Critical: Phase order is IMMUTABLE
 *
 * 16. Cache Management                   (Lines 6269-6347)  [EXTENSION]
 *     - invalidateDictionaryCaches()     (Line 6298) — targeted, after a dictionary edit
 *
 * 17. Utility Methods & Factory          (Lines 6348-6355)  [SAFE]
 *     - createTranslationEngine()        (Line 6355)
 *
 * NOTE: Key function anchors (rebuilt 2026-09-26):
 *       initialize 820, translateWithCharactersOnly 1005,
 *       translateWithSegments 1382, resolveGlobalConflicts 1551,
 *       applyPatterns 1636, postProcess 2798,
 *       processChunksInParallel 3831, translateWithProgressiveBatches 4294,
 *       translateWithChunking 4785, translateDirectly 5003,
 *       translateSinglePass 5207, invalidateDictionaryCaches 6298,
 *       createTranslationEngine 6355.
 *
 * These numbers WILL drift again the next time this file is edited — they are a
 * navigation aid accurate as of this commit, not a maintained invariant enforced
 * by any test or lint rule. Treat a mismatch as expected, not a bug, and re-grep
 * before trusting a specific line number cited here.
 *
 * =============================================================================
 * ARCHITECTURAL NOTES
 * =============================================================================
 *
 * WHY THIS FILE CANNOT BE SPLIT:
 * - 5-phase processing requires shared token state (synchronous coordination)
 * - Phase order is immutable (Pattern → Proper Noun → Number → Phrase → Character)
 * - Token consumption tracking prevents double-processing conflicts
 * - Position mapping depends on exact post-processing assembly order
 * - Cache invalidation timing is phase-critical
 *
 * WHAT CAN BE EXTRACTED:
 * ✅ Pure utilities with zero `this.*` references (e.g., formatBytes)
 * ✅ Self-contained classes with no engine state (e.g., NumberProcessor)
 * ✅ Pure functions taking all data as parameters
 * ❌ Accessor methods that read `this.*` properties
 * ❌ Methods that call `this.*` instance methods
 * ❌ Phase implementations (require token state coordination)
 *
 * SUCCESSFUL EXTRACTIONS (2026):
 * - TokenHelpers.js (6 pure functions) - No state modification
 * - PatternPriorityCalculator.js - Pure calculation function
 * - ProperNounCapitalizationMap.ts - Pure map builder, no engine state
 *
 * See: docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md
 * =============================================================================
 */

import { TextTokenizer, TokenType } from './text/TextTokenizer.js';
import { DictionaryManager } from './dictionary/DictionaryManager.js';
import {
  filterDictionariesForEngine,
  isActiveProperNounSource,
} from './dictionary/FictionDictionaryFilter';
import { WasmDictionaryAdapter } from './wasm/WasmDictionaryAdapter.js';
import tauriAPI from '../tauriAPI.js';
import {
  getTokenSpanForText,
  reconstructTextFromIndex,
  getTextFromTokens,
  getTextPositionForTokenIndex,
} from './TokenHelpers.js';
import { SemanticPatternProcessor } from './pattern/SemanticPatternProcessor.js';
import { TextChunker } from './text/TextChunker.js';
import { ChunkPostProcessor } from './text/ChunkPostProcessor.js';
import { NumberProcessor } from './NumberProcessor.js';
import { QuoteProcessor } from './text/QuoteProcessor';
import { needsSpaceCharOnly } from './text/CharOnlySpacing';
import { SemanticArrayBuilder } from './highlighting/SemanticArrayBuilder.js';
import { emptySemanticArrays } from './highlighting/SegmentPrecomputer.js';
import { MAX_SAFE_SEGMENTS } from './highlighting/index.js';
import TwoPhasePatternProcessor from './pattern/TwoPhasePatternProcessor.js';
import { PatternFailureTracker } from './pattern/PatternFailureTracker.js';
import { markPhraseFollowersConsumed } from './pattern/PhraseConsumptionMarker.js';
import { getIndexedMatches } from './dictionary/LookupIndexUtils.js';
import { buildLookupIndexOrFallback } from './dictionary/LookupIndexBuilder';
import { parallelConfig } from './ParallelConfig.js';
// WasmTranslationAccelerator removed - using pure JavaScript translation
// WASM conflict resolution — flat Uint32Array boundary, near-zero overhead
import { resolveGlobalConflictsWasm } from './wasm/WasmConflictResolution.js';

import { getSourcePriority as getSourcePriorityFn } from './TranslationSourcePriority.js';
import { globalPerformanceMonitor } from './performance/PerformanceMonitor.js';
import { calculateNextBatchSize, MIN_BATCH_SIZE } from './text/AdaptiveBatchSizer.js';
import { buildProgressiveProgressUpdate } from './performance/ProgressiveProgressReporter.js';
import { matchWordSegments } from './highlighting/WordSegmentMatcher.js';
import { scanTokens } from './ReadonlyOptimizationUtils.js';
import { logger } from './logger';
import { buildProperNounCapitalizationMap } from './text/ProperNounCapitalizationMap';
import { wasmTextAssembler } from './wasm/WasmTextAssembler.js';
import { MEMORY_THRESHOLDS, UI_UPDATE_THRESHOLDS } from '../constants/PerformanceThresholds.js';
import { TranslationProfiler } from './performance/TranslationProfiler.js';
import toast from './toast';
import {
  isWasmPatternProcessorReady,
  hasWasmPatternProcessorFailed,
} from './wasm/WasmPatternProcessor.js';
import {
  PHRASE_PROCESSING,
  MEMORY_MANAGEMENT,
  getAdaptiveMaxSegments, // CODE REVIEW FIX (MEDIUM-2)
  PHASE_TIMEOUTS, // LOW-2 FIX: Import phase timeouts from constants
  DEVICE_MEMORY_LIMITS,
  UI_TIMEOUTS,
  PATTERN_FAILURE_DETECTION,
} from '../constants/TranslationConstants.js';

/**
 * @import {
 *   TranslationEngine,
 *   TranslationEngineInitOptions,
 *   TranslationOptions,
 *   TranslationResult,
 *   CharacterOnlyResult,
 *   TranslationProgressData,
 *   EngineStats,
 *   MemoryPressureThresholds,
 *   MemoryCleanupEvent,
 *   MemorySnapshot,
 *   BatchPerformanceMetrics,
 *   TranslationSegment,
 *   DEBUG_LEVELS,
 *   DebugLevel
 * } from '../types/TranslationEngineTypes'
 */

/**
 * @typedef {Object} ChunkOptions
 * @property {number}  [chunkOffset=0]          - TOKEN count of all preceding chunks.
 *                                                 Used as offset for cross-chunk tokenIndex.
 *                                                 DO NOT confuse with chunkStartChar.
 * @property {number}  [chunkStartChar=0]        - CHARACTER position of this chunk's start
 *                                                 in the full source text. Passed to postProcess()
 *                                                 so originalStart values are absolute, not chunk-relative.
 *                                                 token.start (bytes) is chunk-relative; add chunkStartChar
 *                                                 to get the absolute character position.
 * @property {boolean} [returnSemanticArrays]    - Include semantic arrays in result object
 * @property {boolean} [returnPrebuiltSegments]  - Include pre-built segments for ClickableTranslationOptimized
 * @property {boolean} [useChunking]             - Enable adaptive chunking for long texts
 * @property {Function} [onProgress]            - Progress callback (chunk, total) => void
 */

/**
 * Valid translationSource strings for addUnit() — must be a PHASE_PRIORITIES key.
 * Any unrecognised string returns priority 999, silently ranking below character fallback.
 *
 * Phase 1 — Pattern:  'pattern' | 'hierarchical_pattern' | 'hierarchical_patterns' | 'hierarchical_patterns_composite'
 * Phase 2 — ProperNoun: dynamic dictionary name (e.g. 'properNouns-MyNovel') — NOT a static key
 * Phase 3 — Number:   'number_conversion' | 'number_plus_liang_fix'
 * Phase 4 — Phrase:   'phrases'
 * Phase 5 — Char:     'characters'
 * Consumed tokens:    source ends with '_consumed' (e.g. 'phrases_consumed') — getSourcePriority returns null
 *
 * @typedef {'pattern'|'hierarchical_pattern'|'hierarchical_patterns'|'hierarchical_patterns_composite'|'number_conversion'|'number_plus_liang_fix'|'phrases'|'characters'|string} TranslationSource
 */

// PatternProcessorResult and PatternProcessorAdapter — canonical types in src/types/PatternProcessingTypes.d.ts

// Debug logging levels
export const DEBUG_LEVELS = {
  ERROR: 0, // Only errors and warnings
  INFO: 1, // Key milestones and results
  DEBUG: 2, // Detailed phase information
  VERBOSE: 3, // Ultra-detailed token-by-token logging
};

// WASM Number Processing Thresholds moved to TranslationConstants.js
// Import via: import { WASM_NUMBER_THRESHOLDS } from '../constants/TranslationConstants.js';

// ============================================================================
// SECTION 2: CORE ENGINE CLASS - CONSTRUCTOR & INITIALIZATION
// ============================================================================
// Purpose: Main engine class, configuration, and system setup
// Dependencies: All translation subsystems
// Extraction Potential: NONE - Central coordinator, must remain coupled
// Critical: Manages shared state across all 5 phases
// ============================================================================

export class TranslationEngine {
  constructor() {
    this.tokenizer = new TextTokenizer();
    this.dictionaryManager = new DictionaryManager({
      // Enable caching with optimized cache sizes
      cacheEnabled: true,
      lookupCacheSize: 800,

      // WASM acceleration via adapter (omit to get pure-JS / NullWasmAdapter behaviour)
      wasmAdapter: new WasmDictionaryAdapter(),
      debugLevel: 1,

      // Dictionary Precomputation: 5-7x faster loading with cached tries
      enablePrecomputedCache: true,
      tauriAPI: tauriAPI,
    });
    this.semanticPatternProcessor = new SemanticPatternProcessor();
    this.textChunker = new TextChunker();
    this.chunkPostProcessor = new ChunkPostProcessor();
    this.numberProcessor = new NumberProcessor();

    // WASM Core Engine REMOVED:
    // Phase 6 & 7 WASM translation acceleration was disabled due to:
    // - Dictionary lookups returning 0 matches
    // - Pattern matching integration issues
    // - Maintaining pure JavaScript for reliability and translation quality
    // Tauri Rust backend (file I/O, parallel loading) remains active and working perfectly

    this.semanticArrayBuilder = new SemanticArrayBuilder();

    this.isInitialized = false;
    // ERROR HANDLING FIX: Track initialization error for better debugging
    this.initializationError = null;
    // PERFORMANCE OPTIMIZATION: Reduce default logging to prevent console spam
    this.debugLevel =
      process.env.NODE_ENV === 'production' ? DEBUG_LEVELS.ERROR : DEBUG_LEVELS.DEBUG; // Production: errors only, Development: debug messages
    this.punctuationDict = {}; // Store punctuation translation dictionary

    // MEMORY MANAGEMENT: Bounded collection limits for stats
    this.MAX_TOKEN_STATS = MEMORY_MANAGEMENT.MAX_TOKEN_STATS; // Most frequently used token types
    this.MAX_PROPER_NOUN_TRANSLATIONS = MEMORY_MANAGEMENT.MAX_PROPER_NOUN_TRANSLATIONS; // Maximum proper noun cache size (prevents unbounded growth)

    this.stats = {
      totalTranslations: 0,
      totalTime: 0,
      tokenStats: new Map(),
    };

    // Initialize parallel processing configuration (will be set during first use)
    this.parallelConfig = null;

    // Translation segments for interactive highlighting
    this.translationSegments = [];

    // Hierarchical pattern processing settings
    this.settings = {
      enableTwoPhasePatterns: true, // Enable hierarchical pattern processing
      maxCompositeDetectionTime: 100, // ms
      fallbackToSinglePhase: true,
    };

    // Initialize translation profiler for performance analysis
    this.phaseProfiler = new TranslationProfiler();

    // Store reference to TwoPhasePatternProcessor for internal profiling
    this.twoPhaseProcessor = null;

    // Tracks WASM init-failure warning (separate from retry warnings owned by patternFailureTracker)
    this._wasmInitWarningShown = false;

    // Tracks runtime pattern failures — failure count, time window, disable threshold
    this.patternFailureTracker = new PatternFailureTracker({
      failureWindowMs: PATTERN_FAILURE_DETECTION.FAILURE_WINDOW_MS,
      disableThreshold: PATTERN_FAILURE_DETECTION.MAX_FAILURES,
    });

    // CODE REVIEW FIX (2026-02-01): Track pending cleanup callbacks for proper cancellation
    // Prevents memory leak when translation is aborted before cleanup completes
    this.pendingCleanupCallbacks = new Set();
  }

  /**
   * Log message based on debug level
   * @param {number} level - Debug level required
   * @param {string} message - Message to log
   * @param {*} data - Optional data to log
   */
  /**
   * CODE REVIEW FIX (LOW-1): Optimized logging with lazy evaluation support
   * Accepts both strings and functions to avoid string interpolation overhead when logging disabled
   * @param {number} level - Debug level threshold
   * @param {string|Function} message - Message string or lazy function that returns message
   * @param {*} data - Optional data to log
   */
  log(level, message, data = null) {
    // Early exit before evaluating lazy message.
    // globalPerformanceMonitor does its own level filtering, but we still
    // gate on debugLevel so the lazy message function is never called
    // when neither output path would actually log.
    const levelEnabled = this.debugLevel >= level;
    if (!levelEnabled && !globalPerformanceMonitor) {
      return; // Skip evaluation entirely
    }

    // CODE REVIEW FIX (LOW-1): Lazy evaluation - only call function if needed
    const evaluatedMessage = typeof message === 'function' ? message() : message;

    // Use optimized performance monitor for environment-aware logging with sampling
    if (globalPerformanceMonitor) {
      if (data !== null) {
        globalPerformanceMonitor.log(level, evaluatedMessage, data);
      } else {
        globalPerformanceMonitor.log(level, evaluatedMessage);
      }
    }
    // Fallback to original behavior if monitor not available
    else if (this.debugLevel >= level) {
      if (process.env.NODE_ENV === 'development') {
        if (data !== null) {
          logger.log(evaluatedMessage, data);
        } else {
          logger.log(evaluatedMessage);
        }
      }
    }
  }

  /**
   * Calculate maximum safe token count based on available device memory
   * @returns {number} Maximum tokens that can be safely processed
   */
  calculateMaxTokensForDevice() {
    const defaultMaxTokens = DEVICE_MEMORY_LIMITS.DEFAULT_MAX_TOKENS;

    try {
      // Use performance memory API if available (Chrome/Edge)
      if (performance.memory) {
        const totalMemory = performance.memory.jsHeapSizeLimit;
        const usedMemory = performance.memory.usedJSHeapSize;
        const availableMemory = totalMemory - usedMemory;

        // Estimate memory per token: ~100 bytes per token (conservative)
        // Includes token object, translation data, semantic arrays, DOM elements
        const estimatedBytesPerToken = 100;
        const maxTokensByMemory = Math.floor(
          (availableMemory * DEVICE_MEMORY_LIMITS.MEMORY_USAGE_PERCENTAGE) / estimatedBytesPerToken
        );

        // Device-specific limits based on total memory
        let deviceMaxTokens;
        if (totalMemory > 4 * 1024 * 1024 * 1024) {
          // >4GB heap limit
          deviceMaxTokens = DEVICE_MEMORY_LIMITS.VERY_HIGH_MEMORY_TOKENS;
        } else if (totalMemory > 2 * 1024 * 1024 * 1024) {
          // >2GB heap limit
          deviceMaxTokens = DEVICE_MEMORY_LIMITS.MEDIUM_MEMORY_TOKENS;
        } else {
          deviceMaxTokens = DEVICE_MEMORY_LIMITS.LOW_MEMORY_TOKENS;
        }

        // Return the minimum of memory-based and device-based limits
        const calculatedLimit = Math.min(maxTokensByMemory, deviceMaxTokens);
        this.log(
          DEBUG_LEVELS.DEBUG,
          `🖥️ Device token limit: ${calculatedLimit} (memory: ${maxTokensByMemory}, device: ${deviceMaxTokens})`
        );

        return Math.max(calculatedLimit, DEVICE_MEMORY_LIMITS.MIN_TOKEN_LIMIT);
      }

      // Fallback for browsers without performance.memory API
      const navigatorMemory = navigator.deviceMemory; // GB, available in some browsers
      if (navigatorMemory) {
        if (navigatorMemory >= 8) return DEVICE_MEMORY_LIMITS.VERY_HIGH_MEMORY_TOKENS;
        if (navigatorMemory >= 4) return DEVICE_MEMORY_LIMITS.HIGH_MEMORY_TOKENS;
        if (navigatorMemory >= 2) return DEVICE_MEMORY_LIMITS.LOW_MEMORY_TOKENS;
        return 8000; // <2GB RAM
      }
    } catch (error) {
      this.log(
        DEBUG_LEVELS.WARN,
        '⚠️ Device memory detection failed, using conservative limits:',
        error
      );
    }

    return defaultMaxTokens;
  }

  // ============================================================================
  // SECTION 3: DICTIONARY OPERATIONS
  // ============================================================================
  // Purpose: Dictionary lookups, caching, synchronization
  // Dependencies: DictionaryManager, caching system
  // Extraction Potential: NONE - Timing-sensitive, phase-critical
  // Critical: Cache invalidation must coordinate with phase processing
  // ============================================================================

  /**
   * Dictionary Lookup (Direct - No Caching)
   *
   * IMPORTANT: Semantic caching was removed to fix phase priority violations.
   * This method performs direct dictionary lookups without caching.
   *
   * @param {string} fullText - Full text to search
   * @param {number} textPosition - Position in text
   * @param {string[]} dictionaryTypes - Dictionary types to search
   * @returns {Promise<Array>} Array of dictionary matches
   *
   * HISTORY: This method previously used semantic caching with phase priority validation
   * PROBLEM: Cache served stale translations violating 5-phase priority order
   *          (lower phases like proper nouns must override higher phases like characters)
   * SOLUTION: Caching removed entirely - translation quality over performance
   *
   * If re-enabling caching in the future, MUST validate phase priority:
   * - Phase 1 (patterns) = priority 1 (highest)
   * - Phase 2 (proper nouns) = priority 2
   * - Phase 3 (numbers) = priority 3
   * - Phase 4 (phrases) = priority 4
   * - Phase 5 (characters) = priority 5 (lowest)
   * Cache entries from higher priority phases must override lower priority cached results.
   *
   * See git history for phase priority validation code (removed for simplicity)
   */
  async findAllMatches(fullText, textPosition, dictionaryTypes) {
    // Perform direct dictionary lookup (no caching)
    const matches = await this.dictionaryManager.findAllMatchesAsync(
      fullText,
      textPosition,
      dictionaryTypes
    );

    return matches;
  }

  /**
   * Sync dictionaries to Phase 6 Core Engine (Rust) - Deprecated
   *
   * This method is a no-op maintained for backward compatibility. Originally synchronized
   * dictionaries with the WASM Core Engine, but the WASM Core Engine was removed. Dictionary
   * synchronization is now handled automatically by the DictionaryManager.
   *
   * @returns {Promise<void>} Resolves immediately (no synchronization needed)
   *
   * @deprecated Since 2025 - WASM Core Engine removed, no synchronization needed
   *
   * @example
   * // This call is safe but does nothing
   * await engine.syncDictionaries();
   *
   * @see DictionaryManager - Handles all dictionary operations
   * @see invalidateDictionaryCaches - Use this to refresh caches after dictionary changes
   */
  async syncDictionaries() {
    // WASM Core Engine removed - this method is a no-op
    // Kept for backward compatibility (may be called during initialization)
  }

  // ============================================================================
  // SECTION 4: TRANSLATION SEGMENT CAP
  // ============================================================================
  // Purpose: Keep translationSegments bounded (trackTranslationSegment's hard ceiling)
  // Critical: Cleanup timing must not interfere with translation
  // ============================================================================

  /**
   * Cleanup old translation segments to prevent memory leaks
   *
   * Removes oldest translation segments when exceeding device-specific threshold. This
   * prevents unbounded memory growth in long-running applications. Called automatically
   * before each new translation in translateWithSegments().
   *
   * Memory leak prevention:
   * - Uses adaptive threshold based on device memory (10-35 segments)
   * - Removes oldest segments first (splice from beginning)
   * - Keeps only most recent segments for highlighting
   *
   * Adaptive thresholds:
   * - Low memory devices (<2GB): 10 segments
   * - Medium memory devices (2-4GB): 20 segments
   * - High memory devices (>4GB): 35 segments
   *
   * @returns {void}
   *
   * @example
   * // Called automatically before each translation
   * this.cleanupOldSegments(); // Before translateWithSegments
   * this.translationSegments = []; // Start fresh
   *
   * @see getAdaptiveMaxSegments - Calculates device-specific threshold
   * @see translateWithSegments - Calls this before starting new translation
   * @see performHighPriorityCleanup - More aggressive cleanup during memory pressure
   *
   * @performance
   * - Fast operation: <1ms even with 100+ segments
   * - Array splice is efficient for small removals
   * - Prevents gradual memory accumulation
   *
   * @critical
   * Must be called before each translation to prevent memory leaks.
   * Without this, segments accumulate indefinitely causing OOM crashes.
   * Adaptive threshold ensures compatibility across device classes.
   *
   * @fix
   * HIGH-5 FIX (2026-01): Prevents memory leaks from segment accumulation.
   * MEDIUM-2 FIX (2026-01): Adaptive threshold based on device memory.
   */
  cleanupOldSegments() {
    // CODE REVIEW FIX (MEDIUM-2): Use adaptive threshold based on device memory
    const maxSegments = getAdaptiveMaxSegments();

    if (this.translationSegments.length > maxSegments) {
      const removedCount = this.translationSegments.length - maxSegments;
      this.translationSegments.splice(0, removedCount);

      this.log(
        DEBUG_LEVELS.DEBUG,
        `🧹 Cleaned up ${removedCount} old segments, ${this.translationSegments.length} remaining (adaptive threshold: ${maxSegments})`
      );
    }
  }

  /**
   * Destroy the translation engine and cleanup all resources
   *
   * Performs comprehensive cleanup of all engine resources including memory management
   * systems, caches, event listeners, and internal state. Call this when the engine
   * is no longer needed to prevent memory leaks.
   *
   * Cleanup operations performed:
   * - Shutdown smart memory management (intervals, profilers, background cleanup)
   * - Clear batch processing cache
   * - Clear semantic array builder cache
   * - Clear pattern processor variable cache
   * - Dispose the dictionary manager (tries, flat entries, WASM dictionaries)
   * - Clear translation segments
   * - Clear cached semantic tokens
   *
   * @returns {void}
   *
   * @example
   * // Cleanup when component unmounts
   * useEffect(() => {
   *   return () => {
   *     if (engineRef.current) {
   *       engineRef.current.destroy();
   *     }
   *   };
   * }, []);
   *
   * @see shutdownSmartMemoryManagement - Stops memory monitoring
   * @see invalidateDictionaryCaches - Targeted cache cleanup without full destruction
   *
   * @critical
   * Must be called to prevent memory leaks in long-running applications.
   * After calling destroy(), the engine instance cannot be reused - create a new instance.
   */
  destroy() {
    // Clear semantic array builder cache
    if (this.semanticArrayBuilder && typeof this.semanticArrayBuilder.clearCache === 'function') {
      this.semanticArrayBuilder.clearCache();
    }

    // Clear pattern processor variable cache
    if (this.semanticPatternProcessor && this.semanticPatternProcessor.variableCache) {
      this.semanticPatternProcessor.variableCache.clear();
    }

    // Dispose the dictionary manager, rather than only clearing its cache.
    //
    // `clearCache()` empties the translation cache and nothing else, so every trie, the
    // flat entry list, and — through `wasmLookup` — the WASM `DictionaryEngine` holding a
    // copy of every dictionary all outlived the engine that owned them. A reload builds a
    // replacement engine, so that was a leak *per reload*, and WASM linear memory never
    // shrinks: a session that reloads twenty times ends up carrying twenty copies of the
    // character dictionary, which is what made a long reading session get slower the more
    // entries were added.
    //
    // `dispose()` is what releases all three. It leaves the manager unusable, which is
    // exactly the contract this method already documents for the engine as a whole. It
    // also sets `ready = false`, so `isReady()` stays answerable rather than throwing on
    // the nulled fields.
    if (this.dictionaryManager) {
      this.dictionaryManager.dispose();
    }

    // Clear translation segments
    if (this.translationSegments) {
      this.translationSegments = [];
    }

    // Clear proper noun translations map
    if (this.properNounTranslations) {
      this.properNounTranslations.clear();
      this.properNounTranslations = null;
    }

    // CODE REVIEW FIX (2026-02-01): Cancel all pending cleanup callbacks to prevent memory leak
    // Prevents callbacks from accessing destroyed state after engine is destroyed
    if (this.pendingCleanupCallbacks && this.pendingCleanupCallbacks.size > 0) {
      this.pendingCleanupCallbacks.forEach((callbackId) => {
        try {
          if (typeof cancelIdleCallback !== 'undefined') {
            cancelIdleCallback(callbackId);
          } else {
            clearTimeout(callbackId);
          }
        } catch (error) {
          // Ignore errors during cleanup (callback may have already fired)
        }
      });
      const cancelledCount = this.pendingCleanupCallbacks.size;
      this.pendingCleanupCallbacks.clear();
      logger.log(`🧹 Cancelled ${cancelledCount} pending cleanup callbacks`);
    }

    // Reset initialization state
    this.isInitialized = false;
    this.initializationError = null;

    logger.log('🧹 Translation engine destroyed and all resources cleaned up');
  }

  // ============================================================================
  // SECTION 5: ENGINE INITIALIZATION
  // ============================================================================
  // Purpose: Load dictionaries, configure subsystems, prepare engine
  // Dependencies: All subsystems (DictionaryManager, PatternProcessor, etc.)
  // Extraction Potential: NONE - System-wide coordination required
  // Critical: Initialization order affects pattern compilation and caching
  // ============================================================================

  /**
   * Initialize the engine with dictionaries and configuration
   *
   * Main initialization method that loads all dictionaries into trie structures, sets up
   * active proper noun dictionaries, initializes WASM modules, and configures the translation
   * engine. Must be called before any translation can be performed.
   *
   * Initialization steps:
   * 1. Load user configuration (active proper nouns, dictionary order)
   * 2. Load dictionaries into trie structures (with lazy loading for inactive proper nouns)
   * 3. Initialize WASM modules (number processor, pattern processor)
   * 4. Set up semantic array builder
   * 5. Set initialization flag to enable translation
   *
   * @param {Object} dictionaries - Dictionary data to load
   * @param {Object} dictionaries.character - Character dictionary (27,000+ entries)
   * @param {Object} dictionaries.phrase - Phrase dictionary (10,000+ entries)
   * @param {Object} dictionaries.pattern - Pattern dictionary (100+ patterns)
   * @param {Object} [dictionaries.properNouns] - Default proper noun dictionary
   * @param {Object} [dictionaries['properNouns-*']] - Novel-specific and generic proper noun
   *   dictionaries, active or not, with their paired `patterns-*` dictionaries. Pass them all:
   *   the engine keeps what `filterDictionariesForEngine` keeps for `activeProperNouns`.
   * @param {Object} [options={}] - Initialization options
   * @param {string[]} [options.activeProperNouns] - Active proper noun dictionaries
   *
   * @returns {Promise<void>} Resolves when initialization is complete
   *
   * @throws {Error} If dictionary loading fails
   * @throws {Error} If WASM modules fail to load
   *
   * @example
   * // Basic initialization
   * const engine = new TranslationEngine();
   * await engine.initialize({
   *   character: characterDict,
   *   phrase: phraseDict,
   *   pattern: patternDict
   * });
   *
   * @example
   * // With active proper nouns
   * await engine.initialize(dictionaries, {
   *   activeProperNouns: ['properNouns-Novel1.json', 'properNouns-Novel2.json']
   * });
   *
   * @see constructor - Creates engine instance
   * @see DictionaryManager.loadDictionaries - Handles dictionary loading
   *
   * @performance
   * - Dictionary loading: <100ms for 27,000+ entries
   * - WASM initialization: ~50ms (number + pattern processors)
   *
   * @critical
   * Must complete successfully before calling translate() or other translation methods.
   * Failure to initialize causes "Translation Engine not initialized" errors.
   * Configuration loading failure falls back to defaults (not an error).
   */
  async initialize(allDictionaries, options = {}) {
    // Use caller-supplied activeProperNouns (already loaded by Translator.jsx before engine init)
    this.activeProperNouns = options.activeProperNouns || ['properNouns'];
    // The one place the engine's dictionaries are chosen: inactive proper nouns dropped, active
    // paired patterns merged into `patterns` (ADR-027, ADR-048).
    const dictionaries = filterDictionariesForEngine(allDictionaries, this.activeProperNouns);

    // Store dictionaries for Core Engine sync
    this.lastLoadedDictionaries = dictionaries;
    logger.log(
      `🔧 Stored dictionaries for Core Engine sync: ${Object.keys(dictionaries).join(', ')}`
    );

    // Set debug level from options
    // PERFORMANCE: Keep error-only logging for normal operation
    this.debugLevel = DEBUG_LEVELS.ERROR;
    const startTime = performance.now();

    try {
      // Documented in TranslationEngineInitOptions (TranslationEngineTypes.d.ts) as
      // `patternSettings?: PatternProcessingSettings` but never actually wired up
      // (architecture review 2026-07-30, candidate #3 grilling — zero references
      // to `options.patternSettings` anywhere before this fix). Merge onto the
      // constructor's { enableTwoPhasePatterns: true, ... } defaults.
      if (options.patternSettings) {
        this.settings = { ...this.settings, ...options.patternSettings };
      }

      this.log(DEBUG_LEVELS.DEBUG, '🔧 Active proper noun dictionaries:', this.activeProperNouns);

      // Load dictionaries into trie structures
      // CRITICAL FIX: Deep copy options to prevent mutation leakage
      await this.dictionaryManager.loadDictionaries(dictionaries, {
        ...options,
        // Deep copy complex nested objects to prevent reference sharing
        lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
        segments: options.segments ? [...options.segments] : undefined,
        activeProperNouns: this.activeProperNouns,
      });

      // Cache proper noun translations for capitalization preservation
      this.properNounTranslations = buildProperNounCapitalizationMap(
        dictionaries,
        this.activeProperNouns,
        this.MAX_PROPER_NOUN_TRANSLATIONS
      );
      this.log(
        DEBUG_LEVELS.DEBUG,
        `🏛️ Loaded ${this.properNounTranslations.size} proper noun translations into cache`
      );

      // Initialize semantic pattern processor
      if (dictionaries.patterns) {
        const patternCount = Object.keys(dictionaries.patterns).length;
        this.log(
          DEBUG_LEVELS.INFO,
          `🎯 Initializing pattern processor with ${patternCount} patterns`
        );
        await this.semanticPatternProcessor.initializePatterns(dictionaries.patterns, {
          debugLevel: this.debugLevel,
        });
        this.log(
          DEBUG_LEVELS.INFO,
          `🎯 Pattern processor initialized with ${this.semanticPatternProcessor.patterns?.length || 0} processed patterns`
        );
      } else {
        this.log(
          DEBUG_LEVELS.INFO,
          '⚠️ No patterns dictionary found - hierarchical processing will be disabled'
        );
      }

      // Load punctuation dictionary for post-processing
      if (dictionaries.punctuation) {
        this.punctuationDict = dictionaries.punctuation;
        this.log(
          DEBUG_LEVELS.DEBUG,
          '🔧 Loaded punctuation dictionary:',
          Object.keys(this.punctuationDict).length,
          'mappings'
        );
      }

      this.isInitialized = true;
      // ERROR HANDLING FIX: Clear any previous initialization errors
      this.initializationError = null;
      const initTime = performance.now() - startTime;

      this.log(DEBUG_LEVELS.INFO, `✅ Translation Engine initialized in ${initTime.toFixed(2)}ms`);
      this.log(DEBUG_LEVELS.DEBUG, '📊 Engine stats:', this.getEngineStats());

      // WASM Core Engine removed - dictionary sync no longer needed
    } catch (error) {
      // ERROR HANDLING FIX: Capture initialization error for better debugging
      this.isInitialized = false;
      this.initializationError = error.message || String(error);

      if (process.env.NODE_ENV === 'development') {
        logger.error('Failed to initialize Translation Engine:', error);
      }
      throw error;
    }
  }

  // ============================================================================
  // SECTION 6: MAIN TRANSLATION ENTRY POINTS
  // ============================================================================
  // Purpose: Public API for translation operations
  // Dependencies: All 5 phases, chunking, batching
  // Extraction Potential: NONE - Phase orchestration coordinator
  // Critical: Controls sequential phase execution and state management
  // ============================================================================

  /**
   * Translate text using only character-level translation (Phase 5 only)
   *
   * Performs character-by-character translation without applying patterns, proper nouns,
   * numbers, or phrases. This mode is useful for understanding raw character meanings and
   * is significantly faster than full 5-phase translation. Automatically uses Rust lookup
   * index for texts over 500 characters (6-50x speedup).
   *
   * Translation process:
   * 1. Tokenize input text into individual characters
   * 2. Build Rust-powered lookup index for large texts (>500 chars, optional)
   * 3. Lookup each character in character dictionary
   * 4. Generate semantic arrays for clickable highlighting
   * 5. Assemble final translated text with position tracking
   *
   * @param {string} text - Input Chinese text to translate
   * @param {Object} [options={}] - Translation options
   * @param {Object} [options.lookupIndex] - Pre-built Rust lookup index (for reuse across calls)
   * @param {boolean} [options.useSharedLookupIndex=true] - Enable Rust lookup index for texts >500 chars
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation
   *
   * @returns {Promise<Object>} Translation result
   * @returns {string} result.translatedText - Translated Vietnamese text
   * @returns {Object} result.semanticArrays - Semantic arrays for highlighting
   * @returns {Array} result.semanticArrays.original - Original text segments with positions
   * @returns {Array} result.semanticArrays.translated - Translated text segments with positions
   * @returns {Array} result.semanticArrays.metadata - Metadata for each segment (source, confidence)
   * @returns {Array} result.prebuiltSegments - Pre-built segments for clickable highlighting
   *
   * @throws {Error} If engine is not initialized (includes initialization error context)
   *
   * @example
   * // Basic character-only translation
   * const result = await engine.translateWithCharactersOnly('你好世界');
   * console.log(result.translatedText); // "bạn tốt thế giới"
   *
   * @example
   * // With Rust lookup index for large texts
   * const result = await engine.translateWithCharactersOnly(longText, {
   *   useSharedLookupIndex: true // Auto-enabled for texts >500 chars
   * });
   *
   * @example
   * // With abort signal
   * const controller = new AbortController();
   * const result = await engine.translateWithCharactersOnly(text, {
   *   abortSignal: controller.signal
   * });
   * // Later: controller.abort() to cancel translation
   *
   * @see translateWithSegments - Full 5-phase translation (patterns, proper nouns, numbers, phrases, characters)
   * @see translateSinglePass - Core 5-phase translation pipeline
   * @see buildLookupIndexOrFallback - Rust-powered whole-text lookup index (LookupIndexBuilder.ts)
   *
   * @performance
   * - Small texts (<500 chars): ~10ms for 100 characters
   * - Large texts (>500 chars with Rust index): 6-50x faster than sequential lookup
   * - 27,000+ dictionary entries loaded in <100ms
   */
  async translateWithCharactersOnly(text, options = {}) {
    if (!this.isInitialized) {
      // ERROR HANDLING FIX: Include initialization error context for better debugging
      const errorContext = this.initializationError
        ? `: ${this.initializationError}`
        : ' (unknown reason)';
      throw new Error(`Translation Engine not initialized${errorContext}`);
    }

    if (!text || text.trim() === '') {
      return {
        translatedText: text,
        semanticArrays: emptySemanticArrays(),
        prebuiltSegments: [],
      };
    }

    // Pure JavaScript character-only translation (WASM removed for reliability)

    const _operationId = `character_only_translation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.debug('[char-engine]', `Starting character-only translation: ${text.length} chars`);

    // OPTIMIZATION: Build Rust-powered lookup index for character-only translations (HUGE speedup)
    // Character-only mode benefits even more from pre-computed lookups!
    await buildLookupIndexOrFallback(text, options, {
      dictionaryManager: this.dictionaryManager,
      logDebug: (msg) => this.log(DEBUG_LEVELS.DEBUG, msg),
      logWarn: (msg) => this.log(DEBUG_LEVELS.WARN, msg),
    });

    // Create isolated semantic array builder to prevent conflicts with concurrent main translations
    const characterOnlySemanticBuilder = new SemanticArrayBuilder(
      Math.max(50, Math.floor(text.length / 5))
    );

    try {
      // For character-only translation, process the text directly without chunking
      // to preserve all whitespace and punctuation
      let translatedText = '';

      // Tokenize the entire text directly (don't use chunking which removes whitespace/punctuation)
      let tokens = this.tokenizer.tokenize(text);

      logger.debug('[tokenization]', `Tokenization completed: ${tokens.length} tokens`);

      // Skip number processing in character-only mode - translate each character individually
      // Character-only mode should only apply Phase 5 (character-level translation)

      // Only apply Phase 5: Character-level translation to all tokens
      await this.processCharacterOnlyTokens(tokens, options, characterOnlySemanticBuilder);

      // Build result text and semantic arrays from tokens
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        const translatedValue = token.translated != null ? token.translated : token.value;

        // Build semantic array entry for each token
        // Check for both null and undefined to avoid adding invalid entries
        if (
          token.type === 'chinese_char' &&
          token.translated != null && // != null checks for both null and undefined
          token.translated !== token.value
        ) {
          characterOnlySemanticBuilder.addUnit(
            token.value,
            token.translated,
            token.translationSource || 'characters',
            i, // Pass tokenIndex to enable position tracking
            'characters',
            // applyMatchToTokens sets token.translationSource = match.dictionary (never token.dictionary).
            // For translated tokens in character-only mode, translationSource IS the dictionary name.
            token.translationSource || null
          );
        }

        // Add the translated value
        translatedText += translatedValue;

        // Spacing decision for this token → next token. A third, independently
        // verified copy of the spacing rules alongside needsSpace() (full
        // translation path) — see needsSpaceCharOnly()'s own doc comment for
        // why it isn't the same function, and src/utils/CLAUDE.md's
        // "Spacing (11 rules)" row.
        if (
          i < tokens.length - 1 &&
          needsSpaceCharOnly(token, tokens[i + 1], translatedValue, translatedText.endsWith(' '))
        ) {
          translatedText += ' ';
        }

        // Debug what we're adding (semantic arrays already populated by processCharacterOnlyTokens)
        if (process.env.NODE_ENV === 'development' && tokens.indexOf(token) % 300 === 0) {
          logger.log(`📝 Character-only progress: ${translatedText.length} chars translated`);
        }
      }

      // Shared post-assembly cleanup — same pipeline as full translation.
      // Handles: punctuation dict translation, comma-digit preservation (1,200 stays intact),
      // colon-quote spacing (道：「→ 道： 「), space-after-punct, first-letter + colon/newline caps.
      translatedText = this.cleanupFormatting(translatedText, { useChunking: false });

      // Supplements: rules not covered by cleanupFormatting (carried over from the since-deleted
      // applyLightFormatting).
      // Em dash spacing, Japanese character spacing, capitalize after sentence-ending punctuation.
      translatedText = translatedText.replace(/——(?!\s)/g, '—— ');
      translatedText = translatedText.replace(
        /([a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])([぀-ゟ゠-ヿ]+)/gi,
        '$1 $2'
      );
      translatedText = translatedText.replace(
        /([぀-ゟ゠-ヿ]+)([a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])/gi,
        '$1 $2'
      );
      // [^\p{L}\d]* (not \P{L}*) on both sides of the mandatory \s so a closing quote sitting
      // between the sentence-ender and the space (e.g. `!" "xuy`) doesn't block capitalization
      // of the next dialogue's opening letter, while excluding digits keeps the \s mandatory
      // right after the punctuation for decimal numbers like "1.75 mét" or "99.9% rồi" — a
      // digit immediately after "." breaks the match before it can reach a later space.
      translatedText = translatedText.replace(
        /([.!?])([^\p{L}\d]*\s[^\p{L}\d]*)(\p{L})/gu,
        (match, punct, sep, letter) => punct + sep + letter.toUpperCase()
      );

      logger.debug(
        '[char-engine]',
        `Character-only translation completed: ${translatedText.length} chars`
      );

      // Add position metadata AFTER all text transformations but BEFORE updateWithCapitalizedText.
      // Order matters: this loop advances searchPosition sequentially, correctly assigning distinct
      // positions to duplicate words. updateWithCapitalizedText's fallback path uses first-occurrence
      // indexOf (no searchPosition), so running it first stamps every duplicate with the same wrong
      // position — the loop then sees translatedStart >= 0 and skips them all, locking in bad data.
      // With the correct order: loop sets accurate positions → updateWithCapitalizedText takes the
      // O(1) fast path for every unit (reads capitalized form from finalText[start:end]) → no fallback.
      {
        const tempArrays = characterOnlySemanticBuilder.getArrays();
        const lowerText = translatedText.toLowerCase();
        let searchPosition = 0;

        for (let i = 0; i < tempArrays.translated.length; i++) {
          const translatedUnit = tempArrays.translated[i];
          const metadata = tempArrays.metadata[i];

          // Skip if already has valid position metadata
          if (
            metadata &&
            metadata.translatedStart >= 0 &&
            metadata.translatedEnd > metadata.translatedStart
          ) {
            searchPosition = metadata.translatedEnd;
            continue;
          }

          // Find unit position in final text (case-insensitive after capitalization)
          const lowerUnit = translatedUnit.toLowerCase();
          const unitPosition = lowerText.indexOf(lowerUnit, searchPosition);

          if (unitPosition !== -1 && metadata && metadata.tokenIndex >= 0) {
            const startPos = unitPosition;
            const endPos = unitPosition + translatedUnit.length;

            characterOnlySemanticBuilder.setPositionByMatch(
              metadata.tokenIndex,
              translatedUnit,
              startPos,
              endPos
            );

            searchPosition = endPos;
          } else {
            // Move past this position to avoid infinite loop
            searchPosition++;
          }
        }
      }

      // Update semantic arrays to match capitalized text. Runs AFTER the position loop so every
      // entry already has translatedStart/End set — updateWithCapitalizedText takes the O(1) fast
      // path (reads from the known position) instead of the fallback indexOf that aliases duplicates.
      characterOnlySemanticBuilder.updateWithCapitalizedText(translatedText);

      // Get semantic arrays from the isolated builder (prevents conflicts with concurrent main translations)
      // Note: getArrays() can be CPU intensive for large translations, but this is isolated so safe to optimize later
      const semanticArrays = characterOnlySemanticBuilder.getArrays();

      logger.debug(
        '[char-semantics]',
        `Character-only semantic arrays: ${semanticArrays.original.length} original, ${semanticArrays.translated.length} translated`
      );

      const result = {
        translatedText,
        semanticArrays,
        prebuiltSegments: [],
      };

      return result;
    } catch (error) {
      // MEDIUM-8 FIX: Standardize error logging with logger.error
      logger.error('🚨 Character-only translation failed:', error);
      throw error;
    }
  }

  /**
   * Process tokens using only character-level translation (Phase 5)
   * Also includes punctuation and whitespace for readability
   */
  async processCharacterOnlyTokens(
    tokens,
    options = {},
    _semanticBuilder = this.semanticArrayBuilder
  ) {
    const characterDictionary = this.dictionaryManager.getDictionary('characters');
    const punctuationDictionary = this.dictionaryManager.getDictionary('punctuation');

    if (!characterDictionary) {
      // MEDIUM-8 FIX: Standardize error logging with logger.error
      logger.error('🚨 Character-only processing - No character dictionary found');
      return;
    }

    // Process each token individually
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip already processed tokens (including WASM number conversions)
      if (token.translated != null || token.translationSource === 'number_conversion_consumed') {
        continue;
      }

      // Handle different token types - ensure ALL tokens get processed
      if (token.type === 'chinese_char') {
        // OPTIMIZATION: Use shared lookup index for character dictionary when available
        let match = null;
        if (options.useSharedLookupIndex && options.lookupIndex) {
          const textPosition = getTextPositionForTokenIndex(tokens, i);
          const indexedMatches = getIndexedMatches(options.lookupIndex, textPosition, 'characters');

          // Take the first (longest) match for characters
          if (indexedMatches.length > 0) {
            match = indexedMatches[0];
          }

          if (this.debugLevel >= DEBUG_LEVELS.VERBOSE && match) {
            this.log(
              DEBUG_LEVELS.VERBOSE,
              `📊 Character index: found "${match.word}" → "${match.translation}" at position ${textPosition}`
            );
          }
        } else {
          // Fallback: Traditional character dictionary lookup
          match = this.findLongestMatchAtPosition(tokens, i, characterDictionary);
        }

        if (match) {
          const matchWithDictName = {
            ...match,
            dictionary: 'characters',
          };
          this.applyMatchToTokens(tokens, i, matchWithDictName, options);
        } else {
          // No dictionary match, preserve as-is
          token.translated = token.value;
          token.translationSource = 'untranslated-chinese';
          if (process.env.NODE_ENV === 'development') {
            logger.log(`⚠️ Chinese char untranslated: "${token.value}"`);
          }
        }
      } else if (token.type === 'punctuation' && punctuationDictionary) {
        // Try to translate punctuation for readability.
        // Only apply if the match covers the FULL token value — multi-char punctuation tokens
        // like '……' (two U+2026) would otherwise get a partial 1-char match and lose the
        // second char (token.translated = '…' instead of '……').
        const match = this.findLongestMatchAtPosition(tokens, i, punctuationDictionary);
        if (match && match.word.length >= token.value.length) {
          const matchWithDictName = {
            ...match,
            dictionary: 'punctuation',
          };
          this.applyMatchToTokens(tokens, i, matchWithDictName, options);
        } else {
          // No full match — preserve as-is; cleanupFormatting translates char-by-char later.
          token.translated = token.value;
          token.translationSource = 'untranslated-punctuation';
        }
      } else {
        // For ALL other token types (whitespace, latin_word, number, unknown, etc.)
        // Preserve as-is to ensure readable output
        token.translated = token.value;
        token.translationSource = `preserved-${token.type}`;
      }
    }
  }

  // ============================================================================
  // SECTION 7: CONFLICT RESOLUTION & SEGMENT HELPERS
  // ============================================================================
  // Purpose: translateWithSegments entry point, dictionary match conflict resolution
  // Dependencies: TextChunker, progressive/chunked translation paths
  // Extraction Potential: NONE - resolveGlobalConflicts is Phase 4's; see src/utils/CLAUDE.md
  // Critical: translateWithSegments resets translationSegments per call
  // ============================================================================

  /**
   * Translate text and return enhanced result with segments for interactive highlighting
   *
   * Main entry point for full 5-phase translation with clickable highlighting support.
   * Automatically selects between progressive batch translation (for streaming UI updates)
   * or chunked translation (for maximum accuracy) based on options.
   *
   * Translation modes:
   * - Progressive mode: Translates in batches (3-5 chunks at a time) with progress callbacks
   * - Chunked mode: Translates by punctuation boundaries with potential parallelization
   *
   * 5-Phase Translation Pipeline (IMMUTABLE ORDER):
   * 1. Pattern Processing (Phase 1): Structural patterns with variables
   * 2. Proper Noun Processing (Phase 2): Novel-specific terms
   * 3. Number Processing (Phase 3): Chinese numbers → Vietnamese numbers
   * 4. Phrase Processing (Phase 4): Common phrases
   * 5. Character Processing (Phase 5): Character dictionary fallback
   *
   * @param {string} text - Input Chinese text to translate
   * @param {Object} [options={}] - Translation options
   * @param {boolean} [options.progressive=false] - Enable progressive batch translation
   * @param {Function} [options.onProgress] - Progress callback (required for progressive mode)
   * @param {boolean} [options.parallel=true] - Enable parallel chunk processing
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation
   * @param {string[]} [options.activeProperNouns] - Active proper noun dictionaries
   *
   * @returns {Promise<Object>} Translation result with segments
   * @returns {string} result.translatedText - Translated Vietnamese text
   * @returns {Object} result.semanticArrays - Semantic arrays for highlighting
   * @returns {Array} result.semanticArrays.original - Original text segments
   * @returns {Array} result.semanticArrays.translated - Translated text segments
   * @returns {Array} result.semanticArrays.metadata - Metadata for each segment
   * @returns {Array} result.prebuiltSegments - Pre-built segments for ClickableTranslationOptimized
   *
   * @throws {Error} If engine is not initialized
   *
   * @example
   * // Basic translation
   * const result = await engine.translateWithSegments('你好世界，这是一个测试。');
   * console.log(result.translatedText);
   *
   * @example
   * // Progressive translation with streaming updates
   * const result = await engine.translateWithSegments(longText, {
   *   progressive: true,
   *   onProgress: (progress) => {
   *     console.log(`${progress.percent}%: ${progress.translatedText}`);
   *   }
   * });
   *
   * @example
   * // With proper noun dictionaries
   * const result = await engine.translateWithSegments(text, {
   *   activeProperNouns: ['properNouns-Novel1.json']
   * });
   *
   * @see translateWithProgressiveBatches - Progressive batch translation implementation
   * @see translateWithChunking - Chunked translation implementation
   * @see translateSinglePass - Core 5-phase translation pipeline
   * @see ClickableTranslationOptimized - UI component that renders segments
   *
   * @performance
   * - Progressive mode: Better for long texts (>5000 chars), enables streaming UI updates
   * - Chunked mode: Better for accuracy and potential parallelization
   * - Automatically builds Rust lookup index for texts >500 chars (6-50x speedup)
   *
   * @critical
   * This method resets translationSegments for each new translation.
   * Do not call concurrently - results will interfere with each other.
   */
  async translateWithSegments(text, options = {}) {
    // Performance monitoring: track timing for bottleneck detection
    const perfStartTime = performance.now();

    // Reset segments for new translation
    // HIGH-5 FIX: Cleanup old segments before resetting to prevent memory leaks
    this.cleanupOldSegments();

    // MEMORY LEAK FIX: Always start fresh for each new translation
    // This ensures old segments don't accumulate across multiple translations
    this.translationSegments = [];

    // Reset semantic array builder for new translation with capacity estimation
    const estimatedUnits = Math.max(50, Math.ceil(text.length / 3));
    this.semanticArrayBuilder.reset(estimatedUnits);

    // Progressive batch translation is the sole path — the non-progressive `translate()`
    // dispatcher (translateWithChunking/translateDirectly at the top level) was deleted
    // 2026-08-17 (architecture review candidate #2 grilling) after tracing zero production
    // reachability: the only caller of this method (Translator.jsx) always passes
    // `progressive: true`, and progressiveBatches tolerates a missing `onProgress` via its
    // own internal guard, so there was never a real reason to take a different path here.
    const progressiveResult = await this.translateWithProgressiveBatches(text, options);
    const translatedText = progressiveResult.translatedText;
    const semanticArrays = progressiveResult.semanticArrays;

    // Legacy precomputed segments removed - components now compute segments on-demand from semanticArrays

    const result = {
      originalText: text,
      translatedText: translatedText,
      segments: this.translationSegments,
      semanticArrays: semanticArrays, // Components compute segments on-demand from this
      prebuiltSegments: this.prebuiltSegments || [], // Instant segments built during translation
    };

    // Performance monitoring: check for bottlenecks
    logger.warnIfSlow('translateWithSegments', perfStartTime, {
      textLength: text.length,
      resultLength: result.translatedText.length,
      semanticArrays: result.semanticArrays?.length ?? 0,
      segmentsCount: result.segments?.length ?? 0,
      prebuiltSegments: result.prebuiltSegments?.length ?? 0,
    });

    return result;
  }

  /**
   * Create optimal phrase groups with hierarchical pattern processing (Phase 4 of 5)
   *
   * Fourth phase of translation that matches common phrases in the phrase dictionary.
   * Only processes tokens not translated by Phase 1 (patterns), Phase 2 (proper nouns),
   * or Phase 3 (numbers). Uses hierarchical two-phase system for better accuracy.
   *
   * Process:
   * 1. Validate token state (detect silent failures in earlier phases)
   * 2. Find unprocessed ranges (continuous unconsumed tokens)
   * 3. Look up phrases at each position
   * 4. Resolve conflicts using phrase priority and length
   * 5. Apply translations and mark tokens as phrase-consumed
   *
   * Phrase matching strategies:
   * - Sequential matching: Processes left-to-right, applies longest match first
   * - Parallel matching: Processes ranges in parallel for better performance
   * - Conflict resolution: Prioritizes longer phrases, then phrase priority metadata
   *
   * Optimization:
   * - O(n) conflict detection with range tracking
   * - Skip already-processed tokens
   * - Batch lookup for adjacent unconsumed tokens
   *
   * @param {Array<Object>} tokens - Tokenized input text
   * @param {string} tokens[].original - Original Chinese character
   * @param {string|null} tokens[].translated - Translated text (null = not yet translated)
   * @param {string|null} tokens[].translationSource - Source of translation
   * @param {Object} [options={}] - Translation options
   * @param {boolean} [options.parallel=false] - Enable parallel phrase processing
   *
   * @returns {Promise<void>} Modifies tokens in-place
   *
   * @example
   * // Called internally by translateSinglePass (Phase 4)
   * await this.createOptimalPhraseGroups(tokens, options);
   * // Tokens with phrase matches now have:
   * // - translated: "không biết" (from "不知道")
   * // - translationSource: "phrase"
   *
   * @see translateSinglePass - Calls this method as Phase 4
   * @see processRemainingPhrases - Sequential phrase processing implementation
   * @see processRemainingPhrasesParallel - Parallel phrase processing (future optimization)
   *
   * @performance
   * - Small texts (<1000 chars): ~10-20ms
   * - Large texts (>5000 chars): ~30-50ms
   * - Phrase count impact: ~0.1ms per unprocessed token
   *
   * @critical
   * Must run AFTER Phase 1 (patterns), Phase 2 (proper nouns), and Phase 3 (numbers).
   * Must run BEFORE Phase 5 (characters) to prevent character-by-character splitting.
   * Phase order is IMMUTABLE - phrases must override character translations.
   *
   * @architectural
   * Cannot be extracted because phrase-consumed tokens affect Phase 5.
   * Token state validation detects silent failures in earlier phases.
   * Validates that >80% of tokens aren't unprocessed (indicates phase failure).
   */
  async createOptimalPhraseGroups(tokens, options) {
    if (this.settings.enableTwoPhasePatterns) {
      this.log(
        DEBUG_LEVELS.INFO,
        `🎯 Using hierarchical phrase processing (${this.semanticPatternProcessor.patterns?.length ?? 0} patterns loaded)`
      );
      return await this.createOptimalPhraseGroupsHierarchical(tokens, options);
    }
    // enableTwoPhasePatterns disabled (WASM pattern init failed) — phrases are pure JS, still process them
    this.log(
      DEBUG_LEVELS.INFO,
      '🎯 Phrase processing (two-phase disabled, WASM patterns unavailable)'
    );
    await this.processRemainingPhrases(tokens, options);
  }

  /**
   * Hierarchical two-phase phrase group creation with composite pattern support
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Options
   */
  async createOptimalPhraseGroupsHierarchical(tokens, options) {
    this.log(
      DEBUG_LEVELS.DEBUG,
      '🎯 Starting phrase processing (patterns already processed in Phase 1)'
    );

    try {
      // Skip pattern processing since it was already handled in Phase 1
      // Only process remaining phrases using traditional approach
      await this.processRemainingPhrases(tokens, options);

      this.log(
        DEBUG_LEVELS.DEBUG,
        `✅ Phrase processing completed (patterns were processed in Phase 1)`
      );
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, '🚨 Phrase processing failed:', error);
      throw new Error(
        'Two-phase pattern processing failed and legacy single-phase processing is disabled'
      );
    }
  }

  /**
   * Global conflict resolution using longest-match-first with smart prioritization (Phase 4 — phrase pass).
   *
   * Phrases (type priority 1) beat patterns (type priority 2) at equal length because by Phase 4
   * all Phase 1 structural-pattern tokens are already consumed; any remaining 'pattern' entry is residual
   * and should yield to a phrase of equal length. (A Phase 2 twin with the inverse order,
   * resolveMatchConflicts, was reachable only from dead code and was deleted 2026-09-26.)
   *
   * NOTE: find_best_pattern_match() in matcher.rs is NOT a Rust counterpart of this function —
   * that selects the best pattern at a single position (Phase 1). This function runs greedy
   * interval scheduling across ALL positions at once (Phase 4).
   * Rust parity validator: wasm-core/tests/conflict_resolution_parity_test.rs
   * Match length indicates better context coverage and prevents substring collisions
   *
   * @param {Array} allMatches - All potential matches from all positions
   * @param {Token[]} tokens - Array of tokens
   * @returns {Array} Non-overlapping optimal matches
   */
  resolveGlobalConflicts(allMatches, _tokens) {
    this.log(
      DEBUG_LEVELS.DEBUG,
      `🎯 Resolving ${allMatches.length} global matches with longest-match-first`
    );

    // Delegate sort + greedy selection to WASM (flat Uint32Array boundary).
    // Falls back to JS automatically when WASM is not yet initialized.
    const selectedMatches = resolveGlobalConflictsWasm(allMatches);

    this.log(
      DEBUG_LEVELS.DEBUG,
      `🎯 Global resolution complete: ${selectedMatches.length} optimal matches selected`
    );
    return selectedMatches;
  }

  // ============================================================================
  // SECTION 8: PHASE 1 - PATTERN PROCESSING
  // ============================================================================
  // Purpose: Apply semantic patterns (legacy + two-phase hierarchical)
  // Dependencies: SemanticPatternProcessor OR TwoPhasePatternProcessor
  // Extraction Potential: NONE - First phase, sets token state for all others
  // Critical: Pattern-consumed tokens block all subsequent phases
  // Note: Supports both legacy patterns and hierarchical two-phase system
  // ============================================================================

  /**
   * Apply pattern-based translations to tokens (Phase 1 of 5-phase pipeline)
   *
   * First phase of translation that matches structural patterns with variables and applies
   * template-based translations. Patterns have highest priority - consumed tokens are blocked
   * from all subsequent phases. Uses hierarchical two-phase pattern system with WASM acceleration.
   *
   * Pattern types:
   * - Structural patterns: "在XY中" → "ở trong X Y" (variables X, Y)
   * - Context patterns: Patterns that depend on surrounding context
   * - Prioritized patterns: Patterns with explicit priority for conflict resolution
   *
   * Two-phase hierarchical processing:
   * 1. Phase 1: Parse patterns, extract priority tiers
   * 2. Phase 2: Apply patterns from highest to lowest priority (WASM accelerated)
   *
   * Pattern matching:
   * - WASM pattern processor: 10-50x faster for large texts (2000+ chars)
   * - Fallback to JavaScript if WASM unavailable
   * - Variable extraction and validation
   * - Conflict resolution based on pattern priority
   *
   * @param {Array<Object>} tokens - Tokenized input text
   * @param {string} tokens[].original - Original Chinese character
   * @param {string|null} tokens[].translated - Translated text (null = not yet translated)
   * @param {string|null} tokens[].translationSource - Source of translation
   * @param {Object} [options={}] - Translation options
   * @param {Object} [options.dictionaryManager] - Dictionary manager for variable lookups
   * @param {number} [options.debugLevel] - Debug logging level
   *
   * @returns {Promise<void>} Modifies tokens in-place
   *
   * @example
   * // Called internally by translateSinglePass (Phase 1)
   * await this.applyPatterns(tokens, options);
   * // Tokens with pattern matches now have:
   * // - translated: "ở trong X Y"
   * // - translationSource: "pattern"
   *
   * @see translateSinglePass - Calls this method as Phase 1
   * @see SemanticPatternProcessor - Implements pattern matching logic
   * @see TwoPhaseHierarchicalProcessor - Implements hierarchical pattern system
   * @see WasmPatternProcessor - WASM acceleration module
   *
   * @performance
   * - Small texts (<500 chars): ~1-5ms
   * - Large texts (>2000 chars with WASM): 10-50x faster than JavaScript
   * - Pattern count impact: ~0.1-0.5ms per pattern
   *
   * @critical
   * Must run FIRST in 5-phase pipeline (highest priority).
   * Consumed tokens are blocked from all subsequent phases.
   * Pattern failures fall back to JavaScript (not fatal).
   *
   * @architectural
   * Cannot be extracted because pattern-consumed tokens affect all subsequent phases.
   * Token state changes must be synchronized with phase execution order.
   */
  async applyPatterns(tokens, options) {
    if (!this.semanticPatternProcessor.isInitialized) {
      return;
    }

    try {
      // Use hierarchical two-phase processing if enabled, otherwise use legacy processing
      // Re-enabled to debug hierarchical path
      if (
        this.settings.enableTwoPhasePatterns &&
        this.semanticPatternProcessor.patterns?.length > 0
      ) {
        this.log(
          DEBUG_LEVELS.INFO,
          `🎯 Using hierarchical pattern processing in Phase 1 (${this.semanticPatternProcessor.patterns.length} patterns available)`
        );

        // Apply hierarchical pattern processing here in Phase 1 (before phrases)
        // Create or reuse TwoPhasePatternProcessor instance
        if (!this.twoPhaseProcessor) {
          this.twoPhaseProcessor = new TwoPhasePatternProcessor(
            this.semanticPatternProcessor.patterns,
            {
              debugMode: process.env.NODE_ENV === 'development',
              maxCompositeDetectionTime: this.settings.maxCompositeDetectionTime,
              enableFallback: this.settings.fallbackToSinglePhase,
            }
          );
        }

        // MEDIUM-4 FIX: Only create new object when deep copy is actually needed
        // Check if deep copy is required for lookupIndex or segments
        const needsDeepCopy = options.lookupIndex || options.segments;

        const enhancedOptions = needsDeepCopy
          ? {
              ...options,
              // Deep copy mutable collections to prevent external modifications
              ...(options.lookupIndex && { lookupIndex: new Map(options.lookupIndex) }),
              ...(options.segments && { segments: [...options.segments] }),
              activeProperNouns: this.activeProperNouns,
              dictionaryManager: this.dictionaryManager,
              debugLevel: this.debugLevel,
            }
          : {
              // Simple spread when no deep copy needed (reduces allocation overhead)
              ...options,
              activeProperNouns: this.activeProperNouns,
              dictionaryManager: this.dictionaryManager,
              debugLevel: this.debugLevel,
            };

        const hierarchicalResults = await this.twoPhaseProcessor.processTokens(
          tokens,
          enhancedOptions
        );

        this.applyHierarchicalResults(tokens, hierarchicalResults, options);

        this.log(
          DEBUG_LEVELS.DEBUG,
          `✅ Hierarchical pattern processing completed with ${hierarchicalResults.length} results`
        );

        const { recovered, previousCount } = this.patternFailureTracker.reportSuccess();
        if (recovered) {
          logger.log(`✅ Pattern processing recovered after ${previousCount} previous failure(s)`);
        }

        // CRITICAL FIX: Detect and report ACTUAL pattern processing failures
        // IMPORTANT: Zero results ≠ Failure
        // - Zero results is valid when input text has no structural patterns
        // - Only warn when WASM explicitly failed (hasWasmPatternProcessorFailed === true)
        const wasmFailed = hasWasmPatternProcessorFailed();

        if (
          wasmFailed &&
          this.semanticPatternProcessor.patterns?.length > 0 &&
          !this._wasmInitWarningShown
        ) {
          const errorContext = {
            patternsLoaded: this.semanticPatternProcessor.patterns.length,
            wasmReady: isWasmPatternProcessorReady(),
            wasmFailed: true,
            timestamp: Date.now(),
          };

          logger.error(
            '⚠️ Pattern processing system failure - WASM initialization failed:',
            errorContext
          );

          // Show user-facing notification (only once per session to prevent spam)
          toast.warning(
            'Pattern matching unavailable. Translation quality may be reduced. Try reloading dictionaries.',
            { duration: 8000 }
          );
          this._wasmInitWarningShown = true;
        }

        return;
      }

      this.log(DEBUG_LEVELS.DEBUG, '🔍 Starting semantic pattern matching phase');

      // Build variable cache by looking up tokens in proper-noun and phrase dictionaries.
      // This is the fallback path (runs as Phase 1, before Phase 2), so tokens have no
      // proper-noun translations yet — the cache is populated via dictionary lookups, not token state.
      const patternVariableDictionaries = [...this.activeProperNouns, 'phrases'];
      this.semanticPatternProcessor.buildVariableCache(
        tokens,
        patternVariableDictionaries,
        this.dictionaryManager
      );

      // Process tokens using unified semantic approach with prioritized patterns
      // MEDIUM-4 FIX: Only create new object when deep copy is actually needed
      const needsDeepCopy = options.lookupIndex || options.segments;

      const jsResults = await this.semanticPatternProcessor.processTokens(
        tokens,
        needsDeepCopy
          ? {
              ...options,
              lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
              segments: options.segments ? [...options.segments] : undefined,
              debugLevel: this.debugLevel,
              prioritizedPatterns: this.extractPrioritizedPatterns(tokens),
            }
          : {
              ...options,
              debugLevel: this.debugLevel,
              prioritizedPatterns: this.extractPrioritizedPatterns(tokens),
            }
      );
      this.applyHierarchicalResults(tokens, jsResults, options);

      this.log(DEBUG_LEVELS.DEBUG, '✅ Semantic pattern matching phase completed');
    } catch (error) {
      // Pattern processing failures must not crash translation — phases 2-5 continue
      logger.error('❌ Error in pattern processing phase:', error);
      logger.error('Pattern phase will be skipped - translation quality may be reduced');

      const { action, count } = this.patternFailureTracker.reportFailure();

      if (action === 'disable') {
        this.settings.enableTwoPhasePatterns = false;
        toast.error(
          'WASM pattern matching was turned off after repeated failures; patterns continue on the slower JS path. Reload dictionaries (Cmd+R) to turn it back on.',
          { duration: 10000 }
        );
        logger.error(
          `🚨 WASM pattern processing disabled after ${count} consecutive failures within ${PATTERN_FAILURE_DETECTION.FAILURE_WINDOW_MS / 60000} minutes — falling back to SemanticPatternProcessor until the engine is rebuilt`
        );
      } else if (action === 'reset') {
        logger.warn(
          `⚠️ Resetting pattern failure counter (failures outside ${PATTERN_FAILURE_DETECTION.FAILURE_WINDOW_MS / 60000} min window)`
        );
        toast.warning(
          `Pattern matching failed (attempt ${count}/${PATTERN_FAILURE_DETECTION.MAX_FAILURES}). Translation quality may be reduced. Try reloading dictionaries.`,
          { duration: 8000 }
        );
      } else if (action === 'warn') {
        toast.warning(
          `Pattern matching failed (attempt ${count}/${PATTERN_FAILURE_DETECTION.MAX_FAILURES}). Translation quality may be reduced. Try reloading dictionaries.`,
          { duration: 8000 }
        );
      }
    }
  }

  /**
   * Extract prioritized patterns from tokens
   * @param {Token[]} tokens - Array of tokens
   * @returns {Array} Array of prioritized pattern matches
   */
  extractPrioritizedPatterns(tokens) {
    const prioritizedPatterns = [];

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].prioritizedPattern) {
        prioritizedPatterns.push(tokens[i].prioritizedPattern);
        // Clear the prioritized pattern to prevent re-processing
        tokens[i].prioritizedPattern = null;
      }
    }

    this.log(DEBUG_LEVELS.DEBUG, `🎯 Found ${prioritizedPatterns.length} prioritized patterns`);
    return prioritizedPatterns;
  }

  /**
   * Apply hierarchical pattern results to tokens
   * @param {Array} tokens - Token array
   * @param {Array} hierarchicalResults - Results from two-phase processing
   * @param {Object} options - Processing options
   */
  applyHierarchicalResults(tokens, hierarchicalResults, options) {
    for (const result of hierarchicalResults) {
      // Apply translation to the first token of the span
      tokens[result.startIndex].translated = result.translation;
      tokens[result.startIndex].translationSource =
        result.translationSource || 'hierarchical_pattern';
      tokens[result.startIndex].patternSemanticType = result.semanticType ?? null;

      // Mark the result type for debugging and analysis
      if (result.type === 'composite') {
        tokens[result.startIndex].compositePattern = true;
        tokens[result.startIndex].compositeComponents = result.components;
      }

      // Store pattern information for debugging
      if (result.pattern) {
        tokens[result.startIndex].patternUsed = result.pattern.originalPattern;
      }

      // Mark consumed tokens (if span is longer than 1 token)
      // CRITICAL FIX: Use null (not empty string) to comply with consumed token contract
      // Derive consumed source from leader so both JS ('pattern_consumed') and
      // WASM ('hierarchical_pattern_consumed') paths produce the correct string.
      const consumedSource = `${result.translationSource || 'hierarchical_pattern'}_consumed`;
      for (let i = result.startIndex + 1; i <= result.endIndex; i++) {
        if (tokens[i]) {
          tokens[i].translated = null; // Must be null - postProcess checks !== null
          tokens[i].translationSource = consumedSource;
          tokens[i].groupLeader = result.startIndex; // needed by postProcess orphan check
        }
      }

      // Add to semantic array builder for bidirectional highlighting
      const globalTokenIndex = result.startIndex + (options.chunkOffset || 0);

      // Get the actual original text from token positions instead of using result.originalText
      // which may contain corrupted data from pattern processing
      const actualOriginalText = tokens
        .slice(result.startIndex, result.endIndex + 1)
        .map((token) => token.value)
        .join('');

      this.semanticArrayBuilder.addUnit(
        actualOriginalText,
        result.translation,
        result.translationSource || 'hierarchical_pattern',
        globalTokenIndex,
        'pattern',
        null
      );

      this.log(
        DEBUG_LEVELS.DEBUG,
        `🎯 Applied ${result.type || 'pattern'} result: "${result.originalText}" -> "${result.translation}"`
      );
    }
  }

  // ============================================================================
  // SECTION 9: PHASE 4 - PHRASE PROCESSING
  // ============================================================================
  // Purpose: Common phrase dictionary matching for remaining tokens
  // Dependencies: Previous phase results (patterns, proper nouns, numbers)
  // Extraction Potential: NONE - Sequential token consumption required
  // Critical: Only processes tokens not consumed by earlier phases
  // Note: Supports both sequential and parallel processing modes
  // ============================================================================

  /**
   * Process remaining phrases that weren't handled by hierarchical patterns
   * @param {Array} tokens - Token array
   * @param {Object} options - Processing options
   */
  async processRemainingPhrases(tokens, options) {
    const fullText = getTextFromTokens(tokens);

    // Check if phase-level parallelization is enabled
    const dictionaryConfig = parallelConfig.getOptimalConfig('dictionary');
    // BUGFIX COMPLETE: Fixed parallel phrase processing - now applies matches correctly
    const enablePhaseLevelParallel = dictionaryConfig.enabled && tokens.length > 10;

    if (enablePhaseLevelParallel) {
      return this.processRemainingPhrasesParallel(tokens, options, fullText);
    } else {
      return this.processRemainingPhrasesSequential(tokens, options, fullText);
    }
  }

  /**
   * Find unprocessed ranges in token array for efficient phrase processing
   * @param {Array} tokens - Token array
   * @returns {Array} Array of {start, end} ranges that need processing
   */
  findUnprocessedRanges(tokens) {
    const ranges = [];
    let rangeStart = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const isProcessed =
        token.translated !== null ||
        token.translationSource ||
        token.isGrouped ||
        (token.groupLeader !== undefined && token.groupLeader !== null);
      const isChinese = token.type === 'chinese_char' || token.type === 'chinese_word';

      if (!isProcessed && isChinese) {
        // Start of unprocessed range
        if (rangeStart === null) {
          rangeStart = i;
        }
      } else {
        // End of unprocessed range
        if (rangeStart !== null) {
          ranges.push({ start: rangeStart, end: i - 1 });
          rangeStart = null;
        }
      }
    }

    // Close final range if needed
    if (rangeStart !== null) {
      ranges.push({ start: rangeStart, end: tokens.length - 1 });
    }

    return ranges;
  }

  /**
   * Process remaining phrases sequentially (optimized implementation)
   */
  async processRemainingPhrasesSequential(tokens, options, fullText) {
    const allPotentialMatches = [];

    // HIGH-4 FIX: Pre-compute unprocessed ranges to avoid redundant checks
    const unprocessedRanges = this.findUnprocessedRanges(tokens);

    this.log(
      DEBUG_LEVELS.DEBUG,
      `🔍 Found ${unprocessedRanges.length} unprocessed ranges for phrase processing`
    );

    // Process only unprocessed ranges
    for (const range of unprocessedRanges) {
      for (let i = range.start; i <= range.end; i++) {
        const token = tokens[i];

        // Double-check token is still unprocessed (may have been grouped in previous iteration)
        if (
          token.translated !== null ||
          token.translationSource ||
          token.isGrouped ||
          (token.groupLeader !== undefined && token.groupLeader !== null)
        ) {
          continue;
        }

        const textPosition = getTextPositionForTokenIndex(tokens, i);
        const phraseMatches = await this.findAllMatches(fullText, textPosition, ['phrases']);

        // Add matches for remaining phrases
        for (const match of phraseMatches) {
          const tokenSpan = getTokenSpanForText(tokens, i, match.word);

          if (tokenSpan >= 1) {
            // Check if any token in the span is already processed
            let hasProcessedTokens = false;
            for (let j = 0; j < tokenSpan; j++) {
              const checkIndex = i + j;
              if (checkIndex < tokens.length) {
                const checkToken = tokens[checkIndex];
                if (
                  checkToken.translated !== null ||
                  checkToken.translationSource ||
                  checkToken.isGrouped
                ) {
                  hasProcessedTokens = true;
                  break;
                }
              }
            }

            if (!hasProcessedTokens) {
              allPotentialMatches.push({
                startIndex: i,
                endIndex: i + tokenSpan - 1,
                match: match,
                tokenSpan: tokenSpan,
                type: 'phrase',
                length: match.word.length,
              });
            }
          }
        }
      }
    }

    // Resolve conflicts and apply remaining phrases
    const resolvedMatches = this.resolveGlobalConflicts(allPotentialMatches, tokens);

    for (const resolvedMatch of resolvedMatches) {
      if (resolvedMatch.type === 'phrase') {
        const { startIndex, match, tokenSpan } = resolvedMatch;

        // Apply phrase translation
        tokens[startIndex].isGrouped = true;
        // CRITICAL FIX: Preserve originalValue before modifying for getTokenSpanForText()
        if (!tokens[startIndex].originalValue) {
          tokens[startIndex].originalValue = tokens[startIndex].value;
        }
        tokens[startIndex].value = match.word;
        tokens[startIndex].phraseMatch = match;
        tokens[startIndex].translated = match.translation;
        tokens[startIndex].translationSource = 'phrases';

        // Add to semantic array for bidirectional highlighting
        const globalTokenIndex = startIndex + (options.chunkOffset || 0);
        this.semanticArrayBuilder.addUnit(
          match.word,
          match.translation,
          'phrases',
          globalTokenIndex,
          'phrases',
          match.dictionary
        );

        // Mark grouped tokens
        markPhraseFollowersConsumed(tokens, startIndex, tokenSpan);

        this.log(
          DEBUG_LEVELS.DEBUG,
          `🎯 Remaining phrase: "${match.word}" -> "${match.translation}"`
        );
      }
    }
  }

  /**
   * Process remaining phrases with batch-level parallelization
   * Divides unprocessed tokens into batches and processes them concurrently
   */
  async processRemainingPhrasesParallel(tokens, options, fullText) {
    // LOW-10 FIX: Use constant instead of magic number
    const BATCH_SIZE = PHRASE_PROCESSING.BATCH_SIZE; // Process tokens concurrently for optimal I/O performance

    // INTEGRATION #4: Use ReadonlyArray optimization for token scanning
    let unprocessedIndices;

    try {
      const scanResult = scanTokens(
        tokens,
        (token) => {
          // Match: unprocessed Chinese tokens
          return (
            token.translated === null &&
            !token.translationSource &&
            !token.isGrouped &&
            (token.groupLeader === undefined || token.groupLeader === null) &&
            (token.type === 'chinese_char' || token.type === 'chinese_word')
          );
        },
        {
          startIndex: 0,
          endIndex: tokens.length,
        }
      );

      unprocessedIndices = scanResult.indices;
    } catch (readonlyError) {
      // Fallback to manual loop if ReadonlyArray optimization fails
      this.log(
        DEBUG_LEVELS.DEBUG,
        'ReadonlyArray optimization failed, using fallback:',
        readonlyError.message || readonlyError
      );

      unprocessedIndices = [];
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Skip already processed tokens
        if (
          token.translated !== null ||
          token.translationSource ||
          token.isGrouped ||
          (token.groupLeader !== undefined && token.groupLeader !== null)
        ) {
          continue;
        }

        // Only process Chinese content
        if (token.type !== 'chinese_char' && token.type !== 'chinese_word') {
          continue;
        }

        unprocessedIndices.push(i);
      }
    }

    if (unprocessedIndices.length === 0) return;

    // Process tokens in parallel batches
    const allPotentialMatches = [];
    const batches = [];

    for (let i = 0; i < unprocessedIndices.length; i += BATCH_SIZE) {
      const batch = unprocessedIndices.slice(i, i + BATCH_SIZE);
      batches.push(batch);
    }

    // Process batches concurrently
    const batchPromises = batches.map(async (batch) => {
      const batchMatches = [];

      // Batch dictionary lookup using JavaScript (WASM removed for reliability)
      const positions = batch.map((tokenIndex) => getTextPositionForTokenIndex(tokens, tokenIndex));

      const lookupResults = await Promise.all(
        positions.map((pos) =>
          this.dictionaryManager
            .findAllMatchesAsync(fullText, pos, ['phrases'])
            .then((matches) => ({ position: pos, matches }))
        )
      );

      // Process all lookup results
      for (let i = 0; i < batch.length; i++) {
        const tokenIndex = batch[i];
        const phraseMatches = lookupResults[i].matches;

        // Add matches for this token
        for (const match of phraseMatches) {
          const tokenSpan = getTokenSpanForText(tokens, tokenIndex, match.word);

          if (tokenSpan >= 1) {
            // Check if any token in the span is already processed
            let hasProcessedTokens = false;
            for (let j = 0; j < tokenSpan; j++) {
              const checkToken = tokens[tokenIndex + j];
              if (
                checkToken &&
                (checkToken.translated !== null ||
                  checkToken.translationSource ||
                  checkToken.isGrouped)
              ) {
                hasProcessedTokens = true;
                break;
              }
            }

            if (!hasProcessedTokens) {
              // Create data structure that matches what resolveGlobalConflicts expects
              batchMatches.push({
                startIndex: tokenIndex,
                endIndex: tokenIndex + tokenSpan - 1,
                match: match,
                tokenSpan: tokenSpan,
                type: 'phrase',
                length: match.word.length,
                priority: this.dictionaryManager.getPriorityForDictionary('phrases'),
              });
            }
          }
        }
      }

      return batchMatches;
    });

    // Wait for all batches to complete and combine results
    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((batchMatches) => {
      allPotentialMatches.push(...batchMatches);
    });

    // Apply the optimal matches (same logic as sequential version)
    const optimalMatches = this.resolveGlobalConflicts(allPotentialMatches, []);

    for (const match of optimalMatches) {
      const { startIndex: tokenIndex, tokenSpan } = match;

      // Apply phrase translation to tokens (same as sequential method)
      tokens[tokenIndex].isGrouped = true;
      // CRITICAL FIX: Preserve originalValue before modifying for getTokenSpanForText()
      if (!tokens[tokenIndex].originalValue) {
        tokens[tokenIndex].originalValue = tokens[tokenIndex].value;
      }
      tokens[tokenIndex].value = match.match.word;
      tokens[tokenIndex].phraseMatch = match.match;
      tokens[tokenIndex].translated = match.match.translation;
      tokens[tokenIndex].translationSource = 'phrases';

      // Add to semantic array for bidirectional highlighting
      const globalTokenIndex = tokenIndex + (options.chunkOffset || 0);
      this.semanticArrayBuilder.addUnit(
        match.match.word, // original text
        match.match.translation, // translated text
        'phrases', // source
        globalTokenIndex, // global token index for proper ordering
        'phrases',
        match.match.dictionary
      );

      // Mark additional tokens as grouped if this is a multi-token phrase.
      // postProcess() checks token.translated !== null to identify consumed tokens.
      markPhraseFollowersConsumed(tokens, tokenIndex, tokenSpan);

      this.log(
        DEBUG_LEVELS.DEBUG,
        `🎯 Remaining phrase: "${match.match.word}" -> "${match.match.translation}"`
      );
    }
  }

  // PHASE 2.1 EXTRACTION: parsePatternToTokens() and applyPatternTemplate()
  // moved to PatternTemplateEngine utility (2026-01-30)
  // See: src/utils/PatternTemplateEngine.js

  /**
   * Update tokens with proper segmentation after pattern matching
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Start of sequence
   * @param {number} endIndex - End of sequence
   * @param {string} beforeMatch - Text before the match
   * @param {string} matchedReplacement - The replacement for the matched part
   * @param {string} afterMatch - Text after the match
   * @param {number} matchStart - Start position of match in sequence
   * @param {number} matchEnd - End position of match in sequence
   */
  updateTokensWithPatternSegmentation(
    tokens,
    startIndex,
    endIndex,
    beforeMatch,
    matchedReplacement,
    afterMatch,
    matchStart,
    matchEnd
  ) {
    // CRITICAL FIX: Mark all tokens in sequence as consumed by pattern processing
    // Consumed tokens MUST have translationSource set to prevent double-processing
    for (let j = startIndex; j < endIndex; j++) {
      tokens[j].translated = null;
      tokens[j].translationSource = 'pattern_consumed'; // REQUIRED for consumption contract
    }

    // Put the pattern replacement in the first token
    tokens[startIndex].translated = matchedReplacement;
    tokens[startIndex].translationSource = 'pattern'; // Main token gets pattern source

    // If there's text after the match, we need to preserve it for later translation
    if (afterMatch.length > 0) {
      // Find where to place the afterMatch text
      // We need to create new virtual tokens or modify existing ones
      // For now, let's put afterMatch as untranslated content that phases 4-5 can handle

      // Find the token that corresponds to the start of afterMatch
      let afterMatchTokenIndex = this.findTokenIndexForPosition(
        tokens,
        startIndex,
        endIndex,
        matchEnd
      );
      if (afterMatchTokenIndex < endIndex && afterMatchTokenIndex >= startIndex) {
        // CRITICAL FIX: Use separate flag to avoid state violation with consumed token contract
        // isPatternPartialReset indicates token should be re-processed by later phases
        // Pattern wants these tokens re-processed by later phases (phrases, characters)
        // but we need to track that they were partially processed by patterns
        tokens[afterMatchTokenIndex].translated = null;
        tokens[afterMatchTokenIndex].isPatternPartialReset = true; // Separate boolean flag
        tokens[afterMatchTokenIndex].translationSource = null; // Don't set source (not consumed)

        // Also reset subsequent tokens that are part of afterMatch
        for (let k = afterMatchTokenIndex + 1; k < endIndex; k++) {
          const tokenEndPos = this.getTokenPositionInSequence(tokens, startIndex, k);
          if (tokenEndPos <= matchEnd + afterMatch.length) {
            tokens[k].translated = null;
            tokens[k].isPatternPartialReset = true; // Separate boolean flag
            tokens[k].translationSource = null; // Don't set source (not consumed)
          }
        }
      }
    }

    this.log(
      DEBUG_LEVELS.VERBOSE,
      `🔧 Segmented pattern result: "${matchedReplacement}" + remaining untranslated: "${afterMatch}"`
    );
  }

  /**
   * Find token index for a specific position in the sequence
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Start of sequence
   * @param {number} endIndex - End of sequence
   * @param {number} position - Position to find
   * @returns {number} Token index
   */
  findTokenIndexForPosition(tokens, startIndex, endIndex, position) {
    let currentPos = 0;
    for (let i = startIndex; i < endIndex; i++) {
      const tokenLength = tokens[i].value.length;
      if (currentPos + tokenLength > position) {
        return i;
      }
      currentPos += tokenLength;
    }
    return endIndex - 1;
  }

  /**
   * Get the end position of a token within a sequence
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Start of sequence
   * @param {number} tokenIndex - Token index
   * @returns {number} End position
   */
  getTokenPositionInSequence(tokens, startIndex, tokenIndex) {
    let position = 0;
    for (let i = startIndex; i <= tokenIndex; i++) {
      position += tokens[i].value.length;
    }
    return position;
  }

  // ============================================================================
  // SECTION 10: PHASE 5 - CHARACTER PROCESSING
  // ============================================================================
  // Purpose: Character dictionary fallback for untranslated tokens
  // Dependencies: All previous phases (patterns, proper nouns, numbers, phrases)
  // Extraction Potential: NONE - Final phase, depends on all prior results
  // Critical: Last resort translation, must handle any remaining tokens
  // Note: Only processes tokens with translated === null
  // ============================================================================

  /**
   * Apply dictionary-based translation to tokens (Phase 2: Proper Nouns)
   *
   * Second phase of translation that looks up proper nouns in novel-specific dictionaries.
   * Only processes tokens that haven't been translated by Phase 1 (patterns). Proper nouns
   * have second-highest priority to ensure character names and places are correctly identified
   * before generic phrases.
   *
   * Process:
   * 1. Skip tokens already translated by Phase 1 (patterns)
   * 2. Look up remaining text in active proper noun dictionaries
   * 3. Find longest matching proper noun at current position
   * 4. Apply translation and mark tokens as proper-noun-consumed
   * 5. Track processed ranges to detect conflicts with Phase 1
   *
   * Dictionary selection:
   * - Uses activeProperNouns from options or engine configuration
   * - Searches dictionaries in order (first match wins)
   * - Lazy loads inactive proper noun dictionaries on-demand
   *
   * Conflict resolution:
   * - Respects Phase 1 results (patterns have higher priority)
   * - Uses O(n) range-based conflict detection
   * - Prevents overlapping translations
   *
   * @param {Array<Object>} tokens - Tokenized input text
   * @param {string} tokens[].original - Original Chinese character
   * @param {string|null} tokens[].translated - Translated text (null = not yet translated)
   * @param {string|null} tokens[].translationSource - Source of translation
   * @param {Object} [options={}] - Translation options
   * @param {string[]} [options.activeProperNouns] - Active proper noun dictionaries to search
   * @param {string[]} [options.dictionaryOrder] - Dictionary search order (fallback)
   *
   * @returns {Promise<void>} Modifies tokens in-place
   *
   * @example
   * // Called internally by translateSinglePass (Phase 2)
   * await this.applyDictionaryTranslation(tokens, {
   *   activeProperNouns: ['properNouns-Novel1.json']
   * });
   * // Tokens with proper noun matches now have:
   * // - translated: "Tiêu Viêm" (character name)
   * // - translationSource: "properNoun"
   *
   * @see translateSinglePass - Calls this method as Phase 2
   * @see DictionaryManager.findAllMatchesAsync - Performs dictionary lookups
   * @see applyPatterns - Phase 1 (higher priority)
   *
   * @performance
   * - Proper noun lookup: ~5-20ms depending on dictionary size
   * - Lazy loading: First access slower, subsequent fast
   * - Conflict detection: O(n) with range tracking
   *
   * @critical
   * Must run AFTER Phase 1 (patterns) but BEFORE Phase 4 (phrases).
   * Phase order is IMMUTABLE - proper nouns must override generic phrases.
   * Only processes unconsumed tokens (translated === null).
   *
   * @architectural
   * Cannot be extracted because proper-noun-consumed tokens affect Phase 4 and 5.
   * Token state coordination requires synchronous phase execution.
   */
  /**
   * Resolve candidate dictionary matches at a single token position, hiding the
   * shared-lookup-index-vs-fallback branch and the onlyPatternVariables filter.
   * Shared by applyDictionaryTranslation's main scan and its lookahead-defer scan —
   * both need identical candidate resolution, just at a different position.
   * @param {Array} tokens
   * @param {number} pos
   * @param {string} category
   * @param {Set<string>} dictionarySet
   * @param {Array<string>} dictionaryOrder
   * @param {boolean} useSharedLookupIndex
   * @param {Object} options
   * @param {string} logContext - 'main' or 'lookahead', for VERBOSE log disambiguation
   * @returns {Promise<Array>}
   */
  async getCandidateMatchesAtPosition(
    tokens,
    pos,
    category,
    dictionarySet,
    dictionaryOrder,
    useSharedLookupIndex,
    options,
    logContext
  ) {
    let matches;
    if (useSharedLookupIndex) {
      const textPosition = getTextPositionForTokenIndex(tokens, pos);
      matches = getIndexedMatches(options.lookupIndex, textPosition, category);
      matches = matches.filter((match) => dictionarySet.has(match.dictionary));

      if (this.debugLevel >= DEBUG_LEVELS.VERBOSE && matches.length > 0) {
        this.log(
          DEBUG_LEVELS.VERBOSE,
          `📊 Shared index (${logContext}): ${matches.length} matches found for position ${textPosition}, category ${category}`
        );
      }
    } else {
      // MEDIUM FIX: Validate token index before reconstruction
      if (pos >= tokens.length) {
        this.log(
          DEBUG_LEVELS.ERROR,
          `⚠️ Token index ${pos} out of bounds (length: ${tokens.length})`
        );
        matches = [];
      } else {
        const remainingText = reconstructTextFromIndex(tokens, pos);
        matches = await this.findAllMatches(remainingText, 0, dictionaryOrder);
      }
    }

    if (options.onlyPatternVariables) {
      matches = matches.filter(
        (match) =>
          match.dictionary !== 'phrases' ||
          (match.metadata && match.metadata.allowAsPatternVariable === true)
      );
    }

    return matches;
  }

  async applyDictionaryTranslation(tokens, options) {
    const dictionaryOrder =
      options.dictionaryOrder !== undefined
        ? options.dictionaryOrder
        : this.dictionaryManager.getDefaultSearchOrder();
    const phase = options.phase || 'general';
    const useSharedLookupIndex = options.useSharedLookupIndex && options.lookupIndex;

    // Hot path optimization: Only log if debug level is sufficient
    if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
      const indexInfo = useSharedLookupIndex
        ? ` (using shared lookup index with ${options.lookupIndex.size} positions)`
        : '';
      this.log(
        DEBUG_LEVELS.DEBUG,
        `🔧 Starting ${phase} phase with dictionaries:${indexInfo}`,
        dictionaryOrder
      );
    }

    let phaseMatches = 0;
    const startTime = performance.now();

    try {
      // OPTIMIZATION: Create dictionary Set once outside loop (hot path optimization)
      const dictionarySet = new Set(dictionaryOrder);

      // CRITICAL FIX: Track processed text ranges for O(n) conflict detection
      // Instead of checking all tokens (O(n²)), we maintain ranges of processed positions
      // Each range: { start: number, end: number, source: string }
      const processedRanges = [];

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Skip already translated tokens or tokens consumed by other processes
        // CRITICAL FIX: Allow isPatternPartialReset to be re-processed by later phases
        if (token.translated !== null || (token.translationSource && !token.isPatternPartialReset))
          continue;

        // For phrases phase, check if token has a pre-stored phrase match
        if (phase === 'phrases' && token.phraseMatch) {
          // Hot path optimization: Only log if debug level is sufficient
          if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
            this.log(
              DEBUG_LEVELS.DEBUG,
              `🔍 Checking phrase match "${token.phraseMatch.word}" at token ${i}`
            );
          }
          // Check if any tokens in the phrase span were already consumed by patterns
          const tokenSpan = getTokenSpanForText(tokens, i, token.phraseMatch.word);
          let hasConsumedTokens = false;

          for (let j = 0; j < tokenSpan; j++) {
            if (i + j < tokens.length) {
              const conflictToken = tokens[i + j];
              if (conflictToken.translationSource) {
                hasConsumedTokens = true;
                const extraInfo =
                  conflictToken.translationSource === 'pattern' && conflictToken.translated
                    ? ` with result "${conflictToken.translated}"`
                    : '';
                // Hot path optimization: Only log if debug level is sufficient
                if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
                  this.log(
                    DEBUG_LEVELS.DEBUG,
                    `🚨 Phrase match blocked: token ${i + j} already consumed by ${conflictToken.translationSource}${extraInfo}`
                  );
                }
                break;
              }
            }
          }

          if (!hasConsumedTokens) {
            // Apply the pre-stored phrase match
            this.applyMatchToTokens(tokens, i, token.phraseMatch, options);
            phaseMatches++;

            // Skip past grouped tokens
            i += tokenSpan - 1;
            continue;
          } else {
            // Skip this phrase match as some tokens were already consumed
            // Hot path optimization: Only log if debug level is sufficient
            if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
              this.log(
                DEBUG_LEVELS.DEBUG,
                `🚫 Skipping phrase match "${token.phraseMatch.word}" - tokens already consumed`
              );
            }
            // Clear the phraseMatch to prevent future conflicts
            token.phraseMatch = null;
          }
        }

        // Only translate Chinese content
        if (token.type !== TokenType.CHINESE_WORD && token.type !== TokenType.CHINESE_CHAR) {
          continue;
        }

        // OPTIMIZATION: Use shared lookup index when available
        const category =
          {
            properNouns: 'properNouns',
            phrases: 'phrases',
            characters: 'characters',
            general: 'phrases',
          }[phase] || 'phrases';
        const filteredMatches = await this.getCandidateMatchesAtPosition(
          tokens,
          i,
          category,
          dictionarySet,
          dictionaryOrder,
          useSharedLookupIndex,
          options,
          'main'
        );

        if (filteredMatches.length > 0) {
          const bestMatch = filteredMatches[0];

          // Check for conflicts with existing results using position-based detection
          let hasConflict = false;
          const matchStart = getTextPositionForTokenIndex(tokens, i);
          const matchEnd = matchStart + bestMatch.word.length;

          // CRITICAL FIX: O(n) conflict detection using processed ranges
          // Old approach: iterate ALL tokens (O(n²))
          // New approach: check only processed ranges (O(m) where m = number of matches << n)
          for (const range of processedRanges) {
            // Check for overlap: match overlaps with range if they share any position
            if (!(matchEnd <= range.start || matchStart >= range.end)) {
              hasConflict = true;
              this.log(
                DEBUG_LEVELS.DEBUG,
                `🚨 ${phase} phase match blocked: "${bestMatch.word}" at position ${matchStart}-${matchEnd} conflicts with ${range.source} result at position ${range.start}-${range.end}`
              );
              break;
            }
          }

          if (!hasConflict) {
            const tokenSpan = getTokenSpanForText(tokens, i, bestMatch.word);

            // Lookahead: if a LONGER match exists starting within our span, defer to it.
            // Prevents greedy left-to-right from picking a short match (e.g. "日元", 2 chars)
            // and consuming a character needed by a longer match at the next position
            // (e.g. "元始圣人", 4 chars). Only defers when j's match is STRICTLY LONGER —
            // same-length matches at a later start position lose to the earlier match.
            let deferToLookahead = false;
            for (let j = i + 1; j < i + tokenSpan && !deferToLookahead; j++) {
              if (
                tokens[j].translated !== null ||
                (tokens[j].translationSource && !tokens[j].isPatternPartialReset)
              )
                continue;
              const jMatches = await this.getCandidateMatchesAtPosition(
                tokens,
                j,
                category,
                dictionarySet,
                dictionaryOrder,
                useSharedLookupIndex,
                options,
                'lookahead'
              );
              if (jMatches.length > 0 && jMatches[0].word.length > bestMatch.word.length) {
                deferToLookahead = true;
              }
            }
            if (deferToLookahead) {
              continue;
            }

            // Apply translation to the matched tokens
            this.applyMatchToTokens(tokens, i, bestMatch, options);
            phaseMatches++;

            // CRITICAL FIX: Add processed range for O(n) conflict detection
            // Track this match's text range to prevent future overlaps
            processedRanges.push({
              start: matchStart,
              end: matchEnd,
              source: phase,
            });

            // Skip ahead past the matched tokens
            // BUG FIX: Ensure we never go backwards or stay in same place
            if (tokenSpan > 0) {
              i += tokenSpan - 1;
            }
            // If tokenSpan is 0, just continue to next token (i will increment naturally)

            this.log(
              DEBUG_LEVELS.VERBOSE,
              `🔧 ${phase} phase match: "${bestMatch.word}" -> "${bestMatch.translation}" (${bestMatch.dictionary})`
            );
          } else {
            this.log(
              DEBUG_LEVELS.DEBUG,
              `🚫 Skipping ${phase} match "${bestMatch.word}" due to pattern conflict`
            );
          }
        }
      }

      const phaseTime = performance.now() - startTime;
      this.log(
        DEBUG_LEVELS.DEBUG,
        `📊 ${phase} phase completed: ${phaseMatches} matches in ${phaseTime.toFixed(1)}ms`
      );
    } catch (error) {
      // CRITICAL ERROR HANDLING: Dictionary lookup failures should not crash translation
      logger.error(`❌ Error in ${phase} phase dictionary translation:`, error);
      logger.error(`Phase will be skipped - translation quality may be reduced`);

      // Log error for diagnostics but allow translation to continue
      // Tokens remain untranslated, will fall back to later phases
      this.log(
        DEBUG_LEVELS.ERROR,
        `🚨 ${phase} phase failed: ${error.message} - continuing with remaining phases`
      );

      // Don't re-throw - allow translation to continue with degraded quality
      // Better to have partial translation than complete failure
    }
  }

  // ============================================================================
  // SECTION 11: POST-PROCESSING
  // ============================================================================
  // Purpose: Assemble final translation from token results
  // Dependencies: Complete token state from all 5 phases
  // Extraction Potential: NONE - Requires full phase completion
  // Critical: Capitalization, punctuation, spacing, position tracking
  // Note: This is where translation text is actually constructed
  // ============================================================================

  /**
   * Post-process tokens and reconstruct final text with semantic arrays
   *
   * Final phase of translation that assembles translated tokens into output text with
   * proper spacing, generates semantic arrays for clickable highlighting, and builds
   * pre-built segments for ClickableTranslationOptimized component. Position tracking
   * is critical for bidirectional highlighting accuracy.
   *
   * EXECUTION PATH:
   *   - Called by: translateSinglePass() after all 5 translation phases complete
   *   - Called for: ONLY Chinese characters that needed translation
   *   - NOT called for: Numbers (already Arabic), Latin text (already target language)
   *
   * CRITICAL DEBUGGING INSIGHT:
   *   If you're debugging content like "23" or "30" and logs here don't appear,
   *   it's because those numbers are ALREADY in Arabic numerals - they skip this
   *   function entirely! Numbers only go through Phase 3 (Number Processing) which
   *   converts Chinese numbers (三十 → 30), but Arabic numbers pass through untouched.
   *
   * Post-processing steps:
   * 1. Build semantic arrays with position tracking (original, translated, metadata)
   * 2. Generate segments for clickable highlighting
   * 3. Assemble final text with proper spacing rules
   * 4. Track position mappings for bidirectional highlighting
   * 5. Apply formatting cleanup (punctuation, whitespace)
   *
   * Spacing rules:
   * - Add space between consecutive Chinese translations
   * - Add space between Chinese and punctuation (context-sensitive)
   * - Preserve original punctuation and whitespace
   * - No space before/after brackets, quotes, commas
   *
   * @param {Array<Object>} tokens - Translated tokens from translateSinglePass
   * @param {string} tokens[].original - Original Chinese character
   * @param {string} tokens[].translated - Translated Vietnamese text (or original if no match)
   * @param {string} tokens[].translationSource - Source of translation (pattern, properNoun, number, phrase, character)
   * @param {Object} [options={}] - Translation options
   * @param {boolean} [options.includeMetadata=true] - Include translation source metadata in semantic arrays
   * @param {boolean} [options.buildSegments=true] - Build pre-built segments for highlighting
   *
   * @returns {string} Final translated Vietnamese text with proper spacing
   *
   * @example
   * // Called internally after translateSinglePass
   * const tokens = await this.translateSinglePass(tokenizedText, options);
   * const finalText = this.postProcess(tokens, options);
   *
   * @see translateSinglePass - Generates tokens that are post-processed
   * @see buildSemanticArrays - Generates semantic arrays (internal)
   * @see buildPrebuiltSegments - Generates clickable segments (internal)
   * @see ClickableTranslationOptimized - UI component that renders segments
   *
   * @performance
   * - Small texts (<1000 chars): ~5-10ms
   * - Large texts (>5000 chars): ~20-50ms
   * - Optimized semantic builder reduces allocation overhead by 60%
   *
   * @critical
   * Position tracking must be exact for clickable highlighting to work correctly.
   * Off-by-one errors cause misaligned highlighting and click targets.
   * Spacing rules must match those in semantic array generation.
   *
   * @architectural
   * Cannot be extracted because position tracking depends on exact text assembly order.
   * Semantic arrays and text assembly must stay synchronized for highlighting accuracy.
   */
  postProcess(tokens, options) {
    this.log(DEBUG_LEVELS.DEBUG, '🔧 Post-processing tokens:', tokens.length, 'tokens');

    // Reset position tracking for new chunk (positions start from 0 for each chunk)
    // This prevents "Position decreased" errors when processing multiple chunks
    if (
      this.semanticArrayBuilder &&
      typeof this.semanticArrayBuilder.resetPositionTracking === 'function'
    ) {
      this.semanticArrayBuilder.resetPositionTracking();
    }

    // Step 1: Build array of output segments from tokens
    const segments = [];
    const properNounTranslations = new Set(); // Track proper noun translations for capitalization

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let output = '';
      let isProperNoun = false;

      if (token.translated !== null) {
        output = token.translated;

        // Check if this token was marked as a proper noun during dictionary matching
        if (token.isProperNoun) {
          isProperNoun = true;
          properNounTranslations.add(output.toLowerCase());
        }

        this.log(DEBUG_LEVELS.VERBOSE, `🔧 Proper noun: "${token.value}" -> "${output}"`);
      } else if (token.translationSource) {
        // Token is consumed (part of a multi-token match). Normally skip — but guard against
        // orphaned consumed tokens whose leader was itself overwritten by a later phase.
        // An orphan has a groupLeader that either doesn't exist or has translated=null (also consumed).
        const leaderIdx = token.groupLeader;
        const isOrphaned =
          (token.type === TokenType.CHINESE_CHAR || token.type === TokenType.CHINESE_WORD) &&
          (leaderIdx === null ||
            leaderIdx === undefined ||
            leaderIdx >= tokens.length ||
            tokens[leaderIdx].translated === null);

        if (isOrphaned) {
          // Orphaned consumed Chinese token — fall back to character dict rather than drop silently.
          const charTranslation = this.dictionaryManager.translate(
            token.originalValue ?? token.value,
            ['characters']
          );
          output = charTranslation
            ? charTranslation.translation
            : (token.originalValue ?? token.value);
          logger.warn(
            `⚠️ Orphaned consumed token recovered via char fallback: "${token.originalValue ?? token.value}" (src: ${token.translationSource})`
          );
        } else {
          this.log(
            DEBUG_LEVELS.VERBOSE,
            `🔧 Skipping consumed token: "${token.value}" (source: ${token.translationSource})`
          );
          continue;
        }
      } else {
        // CRITICAL: Validate consumed token contract
        // Tokens with null translation MUST have translationSource to indicate consumption
        // If null without source = potential double-processing bug
        // EXCEPTION: NUMBER, LATIN_WORD, and UNKNOWN tokens naturally have null translation (pass-through)
        if (
          token.translated === null &&
          token.type !== TokenType.CHINESE_CHAR &&
          token.type !== TokenType.CHINESE_WORD &&
          token.type !== TokenType.WHITESPACE &&
          token.type !== TokenType.PUNCTUATION &&
          token.type !== TokenType.NUMBER &&
          token.type !== TokenType.LATIN_WORD &&
          token.type !== TokenType.UNKNOWN
        ) {
          // Suspicious: Non-pass-through token with null translation but no source
          // This could indicate a phase forgot to set translationSource after consumption
          logger.warn(
            `⚠️ Suspicious null token without source: "${token.value}" (type: ${token.type})` +
              ` - treating as consumed to prevent double-processing`
          );
          // Treat as consumed (skip) to prevent potential double-processing
          continue;
        }

        // Handle genuinely untranslated tokens
        switch (token.type) {
          case TokenType.CHINESE_CHAR:
          case TokenType.CHINESE_WORD: {
            // Apply fallback character translation if available
            const charTranslation = this.dictionaryManager.translate(token.value, ['characters']);
            output = charTranslation ? charTranslation.translation : token.value;
            break;
          }
          case TokenType.NUMBER:
          case TokenType.LATIN_WORD:
            // Pass-through tokens: keep original value and add to semantic array
            output = token.value;
            // Add to semantic array for clickable highlighting (original = translated for pass-through)
            this.semanticArrayBuilder.addUnit(
              token.value, // original
              token.value, // translated (same as original for pass-through)
              'characters', // source type — lowest recognised priority (5), appropriate for pass-through
              i + (options.chunkOffset || 0) // global token index
            );
            break;
          case TokenType.WHITESPACE:
          case TokenType.PUNCTUATION:
          case TokenType.UNKNOWN:
            // CRITICAL FIX: Explicit handling for whitespace, punctuation, and unknown tokens
            // These are pass-through tokens but typically don't need semantic array entries
            // (spacing/punctuation handled separately in postProcess spacing logic)
            // UNKNOWN tokens include characters like Japanese hiragana "の" that don't match
            // Chinese/Latin/Number patterns but should still be preserved
            output = token.value;
            // Note: No semantic array entry needed - these are structural, not translatable content
            break;
          default:
            // Unknown token types: pass through as-is (defensive coding)
            output = token.value;
            logger.warn(
              `⚠️ Unknown token type in postProcess: "${token.value}" (type: ${token.type})`
            );
        }
      }

      // Only add non-empty outputs as segments
      if (output !== '') {
        segments.push({
          text: output,
          tokenType: token.type,
          isTranslated: token.translated !== null,
          originalToken: token.value,
          isProperNoun: isProperNoun,
          tokenIndex: i, // Store token index for position tracking
        });
      }
    }

    this.log(
      DEBUG_LEVELS.VERBOSE,
      '🔧 Segments:',
      segments.map((s) => `"${s.text}" (${s.tokenType})${s.isProperNoun ? ' [proper noun]' : ''}`)
    );

    // Step 2: Join segments with appropriate spacing AND track positions for semantic array
    // WASM-accelerated path (30-50% faster); falls back to JS if WASM not ready.
    const { translatedText: result, positions: assembledPositions } =
      wasmTextAssembler.assembleWithSpacing(segments);

    // chunkStartChar is the character offset of this chunk's start in the original full text.
    // For a direct (non-chunked) translation it is 0 by default.
    // For sequential chunked translation, translateWithChunking passes chunk.startIndex here.
    const chunkStartChar = typeof options?.chunkStartChar === 'number' ? options.chunkStartChar : 0;

    // Compute cumulative character positions from token value lengths.
    // token.start from the WASM tokenizer is a BYTE offset (Chinese chars = 3 bytes each),
    // not a character offset. Summing value.length gives the correct char position.
    const tokenCharPositions = new Array(tokens.length);
    {
      let _cp = 0;
      for (let i = 0; i < tokens.length; i++) {
        tokenCharPositions[i] = _cp;
        _cp += (
          (tokens[i].originalValue !== undefined ? tokens[i].originalValue : tokens[i].value) || ''
        ).length;
      }
    }

    for (const { tokenIndex, text, start, end } of assembledPositions) {
      if (tokenIndex >= 0) {
        this.semanticArrayBuilder.setPositionByMatch(
          tokenIndex,
          text,
          start,
          end,
          tokenIndex < tokens.length ? chunkStartChar + tokenCharPositions[tokenIndex] : undefined
        );
      }
    }

    const cleaned = this.cleanupFormatting(result, {
      ...options,
      properNounTranslations,
      segments,
    });

    this.log(
      DEBUG_LEVELS.VERBOSE,
      '🔧 Final result:',
      cleaned.substring(0, 100) + (cleaned.length > 100 ? '...' : '')
    );
    return cleaned;
  }

  /**
   * Reconstruct Chinese text from tokens for pattern matching
   * @param {Token[]} tokens - Array of tokens
   * @returns {string} Chinese text
   */
  reconstructChineseText(tokens) {
    return tokens
      .filter((t) => t.type === TokenType.CHINESE_WORD || t.type === TokenType.CHINESE_CHAR)
      .map((t) => t.value)
      .join('');
  }

  /**
   * Apply a dictionary match to the appropriate tokens with semantic grouping
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting token index
   * @param {Object} match - Dictionary match object
   * @param {Object} options - Translation options (may include chunkOffset)
   */
  applyMatchToTokens(tokens, startIndex, match, options = {}) {
    // CRITICAL BUG FIX: Verify that the starting token is actually Chinese before applying the match
    if (startIndex >= tokens.length) {
      this.log(
        DEBUG_LEVELS.ERROR,
        `🚨 BUG: applyMatchToTokens called with invalid startIndex ${startIndex} >= ${tokens.length}`
      );
      return;
    }

    const startToken = tokens[startIndex];
    if (startToken.type !== TokenType.CHINESE_CHAR && startToken.type !== TokenType.CHINESE_WORD) {
      // Skip non-Chinese tokens (validation handled by caller)
      return;
    }

    const tokenSpan = getTokenSpanForText(tokens, startIndex, match.word);

    // Debug logging for segment tracking
    this.log(
      DEBUG_LEVELS.DEBUG,
      `🔍 Segment tracking: "${match.word}" -> "${match.translation}" (${match.dictionary}), tokenSpan: ${tokenSpan}`
    );

    // Mark the first token with the translation and create semantic group
    if (tokenSpan > 0) {
      // For proper nouns, preserve original dictionary capitalization exactly
      if (isActiveProperNounSource(match.dictionary, this.activeProperNouns)) {
        tokens[startIndex].translated = match.translation; // Keep original capitalization
        tokens[startIndex].isProperNoun = true;
        this.log(
          DEBUG_LEVELS.DEBUG,
          `🏛️ Proper noun translation preserved: "${match.word}" -> "${match.translation}"`
        );
      } else {
        tokens[startIndex].translated = match.translation;
      }

      tokens[startIndex].translationSource = match.dictionary;

      // Track segment for interactive highlighting (legacy position-based system)
      this.log(
        DEBUG_LEVELS.DEBUG,
        `📍 Tracking segment: "${match.word}" -> "${match.translation}" (${match.dictionary})`
      );
      this.trackTranslationSegment(tokens, startIndex, tokenSpan, match, options);

      // NEW: Capture semantic relationship for array-based highlighting
      // Calculate global position accounting for chunk offset
      //
      // IMPORTANT: Semantic array added BEFORE grouping (intentional design):
      // - One semantic unit represents the entire match (e.g., "我的朋友" → "bạn của tôi")
      // - Consumed tokens (tokens[i+1], tokens[i+2], ...) don't need separate semantic entries
      // - They have translated=null and are skipped by postProcess() (only first token processed)
      // - This creates correct one-to-one mapping: 1 match = 1 semantic unit
      //
      // Why this works:
      // - First token (tokens[startIndex]): contains full translation
      // - Consumed tokens: have translated=null, translationSource set, isGrouped=true
      // - postProcess() only processes tokens with translated !== null
      // - Result: One output segment for entire match, clickable highlighting works correctly
      const globalTokenIndex = startIndex + (options.chunkOffset || 0);
      // Proper noun dictionaries have their own priority tier — pass match.dictionary as the
      // source so getSourcePriority() resolves them at priority 2, not phrase priority 4.
      const isProperNounMatch = isActiveProperNounSource(match.dictionary, this.activeProperNouns);
      const semanticSource = isProperNounMatch ? match.dictionary : 'phrases';
      this.semanticArrayBuilder.addUnit(
        match.word, // original text
        match.translation, // translated text
        semanticSource, // source — proper noun dict name or 'phrases'
        globalTokenIndex, // global token index for proper ordering
        isProperNounMatch ? 'properNoun' : 'phrases',
        match.dictionary
      );

      // Create semantic group for multi-token matches
      if (tokenSpan > 1) {
        tokens[startIndex].isGrouped = true;
        // Store original value before modifying for getTokenSpanForText() calculations
        tokens[startIndex].originalValue = tokens[startIndex].value;
        tokens[startIndex].value = match.word; // Update value to grouped text

        // CRITICAL FIX: Update token positions to match grouped text span
        const lastTokenIndex = startIndex + tokenSpan - 1;
        if (lastTokenIndex < tokens.length) {
          tokens[startIndex].end = tokens[lastTokenIndex].end;
        }

        // Track which tokens are grouped together
        tokens[startIndex].groupedWith = tokens[startIndex].groupedWith || [];
        for (let i = 1; i < tokenSpan; i++) {
          if (startIndex + i < tokens.length) {
            tokens[startIndex].groupedWith.push(startIndex + i);
            // Store original value before marking as grouped
            tokens[startIndex + i].originalValue = tokens[startIndex + i].value;

            // If this token was previously a group leader (e.g. a Phase 1 pattern leader being
            // overwritten by a Phase 2 proper-noun match), free any orphaned followers outside
            // the new match span. Phase 1 (applyHierarchicalResults) does NOT populate groupedWith,
            // so we detect prior leadership via translationSource: non-consumed src + non-null translated.
            {
              const priorSrc = tokens[startIndex + i].translationSource;
              if (
                tokens[startIndex + i].translated !== null &&
                priorSrc &&
                !priorSrc.endsWith('_consumed')
              ) {
                const orphanedSrc = priorSrc + '_consumed';
                const newMatchEnd = startIndex + tokenSpan;
                for (let k = newMatchEnd; k < tokens.length; k++) {
                  if (tokens[k].translationSource === orphanedSrc) {
                    tokens[k].translated = null;
                    tokens[k].translationSource = null;
                    tokens[k].isGrouped = false;
                    tokens[k].groupLeader = null;
                  } else {
                    break; // orphaned followers are always consecutive
                  }
                }
              }
            }

            // CRITICAL FIX: Use null (not empty string) to comply with consumed token contract.
            // translationSource must contain "_consumed" so validateConsumedTokenContract detects violations.
            tokens[startIndex + i].translated = null; // Must be null - postProcess checks !== null
            tokens[startIndex + i].translationSource = match.dictionary + '_consumed';
            tokens[startIndex + i].isGrouped = true;
            tokens[startIndex + i].groupLeader = startIndex;
          }
        }

        this.log(
          DEBUG_LEVELS.VERBOSE,
          `🔗 Semantic group created: "${match.word}" (${tokenSpan} tokens)`
        );
      }
    }
  }

  /**
   * Track translation segment for interactive highlighting
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting token index
   * @param {number} tokenSpan - Number of tokens in the segment
   * @param {Object} match - Dictionary match object
   * @param {Object} options - Translation options (may include chunkOffset)
   */
  trackTranslationSegment(tokens, startIndex, tokenSpan, match, options = {}) {
    // Calculate original text positions by counting all characters
    let originalStart = 0;
    for (let i = 0; i < startIndex; i++) {
      originalStart += tokens[i].value.length;
    }

    // Add chunk offset if provided (for chunked translation)
    if (typeof options.chunkOffset === 'number') {
      originalStart += options.chunkOffset;
    }

    const originalEnd = originalStart + match.word.length;
    const tokenIndices = [];

    // Collect token indices that are part of this segment
    for (let i = 0; i < tokenSpan; i++) {
      if (startIndex + i < tokens.length) {
        tokenIndices.push(startIndex + i);
      }
    }

    // Create segment object
    const segment = {
      id: `seg_${this.translationSegments.length}`,
      originalText: match.word,
      translatedText: match.translation,
      originalStart,
      originalEnd,
      translatedStart: -1, // Will be set during text construction
      translatedEnd: -1, // Will be set during text construction
      translationSource: match.dictionary,
      sourceDict: match.dictionary,
      tokenIndices,
      isProperNoun: isActiveProperNounSource(match.dictionary, this.activeProperNouns),
      metadata: match.metadata || {},
    };

    // Add pattern-specific information if available
    if (match.pattern) {
      segment.pattern = match.pattern;
    }

    this.translationSegments.push(segment);

    // MEMORY LEAK FIX: Proactive cleanup during normal operation
    // Keep reasonable number of segments while preserving clickable highlighting
    // This prevents the 100x slowdown from unbounded segment growth
    //
    // Thresholds based on regression detection testing:
    // - 75 segments = Observable slowdown threshold (2.5x baseline degradation detected)
    // - 35 segments = Optimal balance (maintains full clickable highlighting + performance)
    // - Lower values break highlighting coverage, higher values degrade performance
    //
    // Technical reasoning:
    // Each segment adds O(n) complexity to position calculations during rendering.
    // At 75 segments: ~5-10ms position lookup overhead per highlight interaction.
    // At 35 segments: ~1-2ms overhead (negligible for real-time UI).
    // OPTIMIZATION: Defer cleanup to idle time to avoid blocking translation
    if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_HARD_CEILING) {
      // Idle-deferred cleanup below never got a chance to run (starved idle time,
      // or a synchronous burst of pushes outran it) — trim now instead of waiting.
      const segmentsBefore = this.translationSegments.length;
      this.translationSegments = this.translationSegments.slice(
        -MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
      );
      logger.warn(
        `🧹 Segment cleanup fell behind (idle callback starved): synchronous trim ${segmentsBefore} → ${this.translationSegments.length}`
      );
    } else if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
      // Log once when crossing the threshold, not on every subsequent push
      if (this.translationSegments.length === MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER + 1) {
        logger.debug(
          `Translation segments crossed cleanup threshold (${this.translationSegments.length}) — cleanup queued`
        );
      }

      // Use requestIdleCallback for non-blocking cleanup (or setTimeout fallback)
      const cleanupFn = () => {
        // Re-check threshold before cleanup to prevent race condition
        // (new segments may have been added while cleanup was queued)
        if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
          const segmentsToKeep = MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP;
          const segmentsBefore = this.translationSegments.length;
          const actualRemoved = segmentsBefore - segmentsToKeep;

          this.translationSegments = this.translationSegments.slice(-segmentsToKeep);

          // MEMORY PROFILING FIX: Always log cleanup trigger for verification
          // This helps verify cleanup executes reliably in production
          logger.log(
            `🧹 Segment cleanup triggered: ${actualRemoved} segments removed (${segmentsBefore} → ${this.translationSegments.length})`
          );
        }
      };

      // Use requestIdleCallback if available, otherwise defer with setTimeout
      if (typeof requestIdleCallback !== 'undefined') {
        const callbackId = requestIdleCallback(
          () => {
            this.pendingCleanupCallbacks.delete(callbackId);
            cleanupFn();
          },
          { timeout: 1000 }
        );
        this.pendingCleanupCallbacks.add(callbackId);
      } else {
        const callbackId = setTimeout(() => {
          this.pendingCleanupCallbacks.delete(callbackId);
          cleanupFn();
        }, 0);
        this.pendingCleanupCallbacks.add(callbackId);
      }
    }

    // Only log segment creation at DEBUG level to avoid performance impact
    if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
      this.log(
        DEBUG_LEVELS.DEBUG,
        `✅ Segment created: "${match.word}" -> "${match.translation}" (${match.dictionary}) [${this.translationSegments.length} total]`
      );
    }
  }

  // calculateTranslatedPositions method removed - position tracking now handled inline during text construction

  /**
   * Clean up formatting in the final result
   * @param {string} text - Text to clean up
   * @param {Object} options - Cleanup options
   * @returns {string} Cleaned text
   */
  cleanupFormatting(text, options) {
    let result = text;

    // Apply punctuation translations FIRST using the actual punctuation dictionary
    // Get punctuation mappings by checking common punctuation marks from the dictionary
    const punctuationChars = [
      '。',
      '，',
      '、',
      '？',
      '！',
      '：',
      '；',
      '…',
      '．',
      '（',
      '）',
      '《',
      '》',
      '「',
      '」',
      '﹁',
      '﹂',
      '『',
      '』',
      '【',
      '】',
      '〖',
      '〗',
      '～',
      '˙',
      '——',
    ];

    for (const char of punctuationChars) {
      const result_lookup = this.dictionaryManager.translate(char, ['punctuation']);
      if (result_lookup && result_lookup.translation) {
        // Escape special regex characters in the source punctuation
        const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escapedChar, 'g'), result_lookup.translation);
      }
    }

    // Tilde/wave is a range operator — never gets surrounding spaces regardless of path.
    // (Source of spaces is unclear from static analysis; this normalizes both paths.)
    result = result.replace(/[ \t]*([~～])[ \t]*/g, '$1');

    // Space after closing quotes before content (mirrors processSequence trailing-space logic).
    // Dict translation has already run, so Chinese 》→» etc. are in their translated form.
    // Collapse any resulting double-spaces via the [ \t]+ rule below.
    // A ’ with a letter on both sides is an apostrophe inside a word ("Thori’dal", "don’t"),
    // not a closing quote: spacing it split dictionary translations, and the inserted char
    // shifted every click-to-highlight position after it.
    result = result.replace(/([”’»>])(?!\s|$)/g, (match, quote, offset, string) =>
      quote === '’' &&
      /\p{L}/u.test(string[offset - 1] ?? '') &&
      /\p{L}/u.test(string[offset + 1] ?? '')
        ? match
        : quote + ' '
    );

    // Skip detailed spacing rules when called from chunking (chunks handle their own spacing)
    if (options.useChunking !== false) {
      // Fix spacing around punctuation - remove spaces before punctuation, but keep any line
      // break inside that whitespace run: bare \s swallows \n, deleting a paragraph break
      // whenever the next line starts with punctuation. `(\r?\n|)` and `(\r?\n)?` behave
      // identically here — a non-participating group interpolates as an empty string in a
      // string replacement, and only yields `undefined` in a replacer function.
      result = result.replace(
        /[^\S\r\n]*(\r?\n|)[^\S\r\n]*([.,!?:;，。！？：；\])}】》）])/g,
        '$1$2'
      );
      // Skip remaining spacing rules when called from chunking
      return result;
    } else {
      // Add space after punctuation (except at end of string, before closing quotes, or when
      // it's a decimal point inside a converted number's own translated value, e.g.
      // NumberProcessor's "99.9%" — digits on BOTH sides. Forcing a space there splits the
      // number into "99. 9%" and, since positions are recorded against this text before
      // cleanup runs, also corrupts every subsequent click-to-highlight position by the one
      // inserted char. Checking only the following digit (fixed 2026-08-29) over-excluded: a
      // real sentence-ending punct followed by a digit-led new sentence (preceding char NOT a
      // digit) also lost its space, e.g. "...rồi.5 người" stayed unspaced. Checking both
      // neighbors distinguishes the two cases.
      this.log(DEBUG_LEVELS.VERBOSE, '🔧 Before punctuation spacing:', JSON.stringify(result));
      result = result.replace(
        /([.!?:;，。！？：；])(?!\s|$|[“”\])}】》）»>])/g,
        (match, punct, offset, string) => {
          const prevChar = offset > 0 ? string[offset - 1] : '';
          const nextChar = string[offset + punct.length] || '';
          if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
            return punct;
          }
          return punct + ' ';
        }
      );
      // Comma: add space only when NOT followed by a digit (preserves “1,200” thousands separators)
      result = result.replace(/,(?!\s|$|[“””\d])/g, ', ');
      this.log(DEBUG_LEVELS.VERBOSE, '🔧 After punctuation spacing:', JSON.stringify(result));
      // Note: Line 615 uses mixed quote characters (literal curly + straight quotes)

      // Special case: Add space between colon and opening quote (colon-quote combinations)
      result = result.replace(/:\u201c/g, ': \u201c'); // Vietnamese colon + curly quote (after punctuation conversion)
      result = result.replace(/:”(?!\s)/g, ': “'); // Regular quote version

      // Capitalize first word after colon or linebreak, skipping any intervening non-letter chars
      // \P{L}*? lazily consumes quotes/spaces — no char class needed, works for any quote encoding
      result = result.replace(
        /(:\P{L}*?)(\p{L})/gu,
        (m, pre, letter) => pre + letter.toUpperCase()
      );
      result = result.replace(
        /(\n\P{L}*?)(\p{L})/gu,
        (m, pre, letter) => pre + letter.toUpperCase()
      );
      // Capitalize start of text only for standalone (non-chunk) translations.
      // When isParallelChunk=true, applySmartCapitalization handles this via startedBy='start'.
      // Applying it per-chunk would capitalize the first letter of every chunk, not just the first.
      if (!options.isParallelChunk) {
        result = result.replace(/^(\P{L}*)(\p{L})/u, (m, pre, letter) =>
          /\d/.test(pre) ? m : pre + letter.toUpperCase()
        );
      }
    }

    // Remove excessive spaces but preserve line breaks
    result = result.replace(/[ \t]+/g, ' '); // Only collapse spaces and tabs, not newlines

    // Trim leading/trailing spaces
    result = result.trim();

    // Respect proper noun capitalization exactly as defined in dictionary
    // No automatic capitalization - only capitalize at sentence starts
    if (options.segments) {
      options.segments.forEach((segment) => {
        if (segment.isProperNoun && segment.text) {
          this.log(
            DEBUG_LEVELS.VERBOSE,
            `🔧 Proper noun capitalization preserved as-is: "${segment.text}"`
          );
        }
      });
    }

    // DISABLED: Old capitalization logic - now handled by smart chunk-based capitalization
    // result = result.replace(/^./, match => match.toUpperCase());
    // result = result.replace(/[.!?]\s+./g, match => match.toUpperCase());

    // Capitalize first letter after line breaks (new paragraphs)
    // result = result.replace(/\n\s*./g, match => match.toUpperCase());

    // Capitalize first letter after opening quotes (straight and curly)
    //     result = result.replace(/["“]\s*./g, match => match.toUpperCase()); // " and "

    // Capitalize first letter after closing quotes (period + quote + space + text)
    //     result = result.replace(/[.!?][""]\s+./g, match => match.toUpperCase()); // " and "

    return result;
  }

  /**
   * Get comprehensive engine performance and usage statistics
   *
   * Returns detailed metrics about translation performance, dictionary usage, memory
   * management, and pattern processing. Useful for debugging, performance monitoring,
   * and system health checks.
   *
   * Statistics included:
   * - Translation metrics: total translations, total time, average time, throughput
   * - Dictionary stats: cache hit rates, lookup counts, dictionary sizes
   * - Pattern stats: pattern matches, variable extractions, cache performance
   * - Token stats: token type distribution (bounded to prevent memory leaks)
   * - Memory stats: pressure levels, cleanup events, profiling data
   *
   * @returns {Object} Comprehensive engine statistics
   * @returns {boolean} result.isInitialized - Whether engine is initialized
   * @returns {number} result.totalTranslations - Total number of translations performed
   * @returns {number} result.totalTime - Total time spent translating (milliseconds)
   * @returns {number} result.averageTime - Average translation time (milliseconds)
   * @returns {number} result.throughput - Translations per second
   * @returns {Object} result.tokenStats - Token type distribution (limited to 1000 entries)
   * @returns {Object} result.dictionaryStats - Dictionary cache hit rates and sizes
   * @returns {Object} result.patternStats - Pattern processing statistics
   *
   * @example
   * // Get engine statistics
   * const stats = engine.getEngineStats();
   * console.log(`Average translation time: ${stats.averageTime.toFixed(2)}ms`);
   * console.log(`Cache hit rate: ${stats.dictionaryStats.cacheHitRate}%`);
   *
   * @example
   * // Monitor performance in development
   * if (process.env.NODE_ENV === 'development') {
   *   setInterval(() => {
   *     const stats = engine.getEngineStats();
   *     console.log('Engine Stats:', stats);
   *   }, 10000); // Every 10 seconds
   * }
   *
   * @see getSmartMemoryStats - Memory management statistics
   * @see DictionaryManager.getGlobalStats - Dictionary statistics
   * @see SemanticPatternProcessor.getDebugInfo - Pattern statistics
   *
   * @performance
   * - Fast operation: <1ms to collect statistics
   * - Safe to call frequently for monitoring
   * - Token stats bounded to 1000 entries to prevent memory leaks
   *
   * @note
   * Token stats use LRU eviction when exceeding MAX_TOKEN_STATS (1000).
   * Statistics persist across translations until engine is destroyed.
   */
  getEngineStats() {
    const avgTime =
      this.stats.totalTranslations > 0 ? this.stats.totalTime / this.stats.totalTranslations : 0;

    return {
      isInitialized: this.isInitialized,
      totalTranslations: this.stats.totalTranslations,
      totalTime: this.stats.totalTime,
      averageTime: avgTime,
      throughput:
        this.stats.totalTime > 0 ? this.stats.totalTranslations / (this.stats.totalTime / 1000) : 0,
      tokenStats: Object.fromEntries(this.stats.tokenStats),
      dictionaryStats: this.dictionaryManager.getGlobalStats(),
      patternStats: this.semanticPatternProcessor.getDebugInfo(),
    };
  }

  /**
   * Get partial translation result for streaming UI updates
   * @param {number} completedChunks - Number of completed chunks
   * @returns {Object} Partial translation result
   */
  getPartialTranslationResult(completedChunks) {
    try {
      // Get current partial text from progressive position tracker
      const partialText = this.progressivePositionTracker?.finalText || '';

      // Calculate progress metrics
      const totalChunks = this.totalChunks || 1;
      const progress = Math.min(100, (completedChunks / totalChunks) * 100);

      // Get partial semantic arrays from current builder state
      let partialSemanticArrays = null;
      try {
        const currentArrays = this.semanticArrayBuilder?.getArrays();
        if (currentArrays && currentArrays.original && currentArrays.original.length > 0) {
          partialSemanticArrays = {
            original: [...currentArrays.original],
            translated: [...currentArrays.translated],
            metadata: currentArrays.metadata ? [...currentArrays.metadata] : [],
            isPartial: true,
            completedSegments: currentArrays.original.length,
          };
        }
      } catch (semanticError) {
        this.log(DEBUG_LEVELS.WARN, '⚠️ Failed to get partial semantic arrays:', semanticError);
      }

      return {
        partialText,
        completedChunks,
        totalChunks,
        progress: Math.round(progress * 10) / 10, // Round to 1 decimal
        partialSemanticArrays,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, '🚨 Failed to build partial translation result:', error);
      return {
        partialText: '',
        completedChunks: 0,
        totalChunks: 1,
        progress: 0,
        partialSemanticArrays: null,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Enable translation profiling to measure phase-by-phase performance
   * Usage: window.translationEngine.enableProfiling()
   * Then translate text and call getProfilingReport() to see breakdown
   */
  enableProfiling() {
    this.phaseProfiler.enable();
  }

  /**
   * Disable translation profiling
   */
  disableProfiling() {
    this.phaseProfiler.disable();
  }

  /**
   * Get profiling report showing time breakdown by translation phase
   * @returns {Object} Profiling report with phase breakdown and recommendations
   */
  getProfilingReport() {
    return this.phaseProfiler.getReport();
  }

  /**
   * Reset profiling data
   */
  resetProfiling() {
    this.phaseProfiler.reset();
  }

  /**
   * Enable pattern matching internal profiling
   * Provides detailed breakdown of TwoPhasePatternProcessor operations
   */
  enablePatternProfiling() {
    if (this.twoPhaseProcessor) {
      this.twoPhaseProcessor.enableInternalProfiling();
    } else {
      logger.warn(
        '⚠️ TwoPhasePatternProcessor not initialized. Translate some text first, then enable profiling.'
      );
    }
  }

  /**
   * Disable pattern matching internal profiling
   */
  disablePatternProfiling() {
    if (this.twoPhaseProcessor) {
      this.twoPhaseProcessor.disableInternalProfiling();
    }
  }

  /**
   * Get pattern matching internal profiling report
   * @returns {Object} Internal profiling data
   */
  getPatternProfilingReport() {
    if (this.twoPhaseProcessor) {
      return this.twoPhaseProcessor.getInternalProfilingReport();
    }
    return {
      enabled: false,
      message: 'TwoPhasePatternProcessor not initialized. Translate some text first.',
    };
  }

  /**
   * Print pattern matching internal profiling report to console
   */
  printPatternProfilingReport() {
    if (this.twoPhaseProcessor) {
      this.twoPhaseProcessor.printInternalProfilingReport();
    } else {
      logger.log('TwoPhasePatternProcessor not initialized. Translate some text first.');
    }
  }

  /**
   * Reset pattern matching profiling data
   */
  resetPatternProfiling() {
    if (this.twoPhaseProcessor) {
      this.twoPhaseProcessor.resetInternalProfiling();
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalTranslations: 0,
      totalTime: 0,
      tokenStats: new Map(),
    };
  }

  /**
   * Initialize parallel processing configuration based on device capabilities
   * @param {Object} options - Configuration options
   */
  initializeParallelProcessing(options = {}) {
    // Get device memory limitations
    const maxTokensAllowed = this.calculateMaxTokensForDevice();

    // Build device information for ParallelConfig adaptation
    const deviceInfo = {
      totalMemory: maxTokensAllowed * 50, // Rough estimate: 50 bytes per token
      cpuCores: navigator.hardwareConcurrency || 4,
      onBattery: false, // Could be enhanced with battery API if available
    };

    // Adapt ParallelConfig to current device
    parallelConfig.adaptToDevice(deviceInfo);

    // Get optimized configuration for chunk processing
    const chunkConfig = parallelConfig.getOptimalConfig('chunk', {
      textLength: options.textLength || 0,
    });

    // Set once per engine; translateBatchInParallel's guard reads it to know init has run
    this.parallelConfig = { maxParallelChunks: chunkConfig.maxParallelChunks };

    this.log(
      DEBUG_LEVELS.INFO,
      `🔧 Parallel processing configured via ParallelConfig: ` +
        `maxConcurrency=${this.parallelConfig.maxParallelChunks}, memoryLimit=${maxTokensAllowed}, ` +
        `batteryOptimization=${parallelConfig.getConfig().device.batteryOptimization}`
    );
  }

  // ============================================================================
  // SECTION 12: PARALLEL PROCESSING
  // ============================================================================
  // Purpose: Process a batch's chunks concurrently within progressive translation
  // Dependencies: translateDirectly, tokenizer (for chunkOffset computation)
  // Critical: assigns semantic indices by chunk-completion order — see
  //   compareByTokenIndex (src/utils/highlighting/TextPositionMapper.ts) for the
  //   downstream correction this depends on
  // ============================================================================

  /**
   * Process chunks in parallel within a batch
   *
   * EXECUTION PATH:
   *   - Called by: translateDirectly() when processing large texts in batches
   *   - Used by: Full Translation mode (Character-only uses simpler path)
   *   - Purpose: Parallel processing of text chunks for performance
   *   - When: Only when text is chunked (multiple chunks exist)
   *
   * WHAT IT DOES:
   *   - Processes multiple chunks concurrently using Promise.all
   *   - Each chunk goes through full 5-phase translation pipeline
   *   - Applies progressive batch processing for memory efficiency
   *
   * @param {Array} batch - Array of chunks to process
   * @param {Object} options - Translation options
   * @param {number} batchStart - Starting index for chunk offset calculation
   * @returns {Promise} Resolves when all chunks are processed
   */
  async processChunksInParallel(batch, options, batchStart) {
    const startTime = performance.now();

    // Initialize parallel config if not already done - MUST BE FIRST
    if (!this.parallelConfig) {
      this.initializeParallelProcessing(options);
    }

    // Chunks in a batch always run in parallel; there is no sequential fallback.

    try {
      // MEDIUM FIX: Calculate token counts for each chunk upfront
      // chunk.content is a string; tokenize it first to get raw token count.
      // getSemanticTokens() expects TextToken[], not a string — calling it with a string
      // returns [] (every char fails the type check), making all chunkTokenCounts=0 and
      // chunkTokenOffsets all equal to batchStart. That collapses cross-chunk token indices
      // to local-chunk-only indices, causing same-translated-text sort to be wrong.
      const chunkTokenCounts = batch.map((chunk) => {
        return this.tokenizer.tokenize(chunk.content).length;
      });

      // Calculate cumulative token offset for each chunk
      let cumulativeTokenOffset = batchStart; // batchStart should be cumulative token count from previous batches
      const chunkTokenOffsets = batch.map((_, index) => {
        const offset = cumulativeTokenOffset;
        cumulativeTokenOffset += chunkTokenCounts[index];
        return offset;
      });

      // Process all chunks in parallel
      await Promise.all(
        batch.map(async (chunk, index) => {
          // CRITICAL FIX: Deep copy options for parallel processing
          // Each chunk runs in parallel - shared nested objects would cause race conditions
          const chunkOptions = {
            ...options,
            // Deep copy complex nested objects to prevent race conditions
            lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
            segments: options.segments ? [...options.segments] : undefined,
            useChunking: false,
            // Apply global token offset so addUnit entries land at correct positions in the
            // shared semantic builder. Chunks run in parallel on the shared builder — this
            // can produce "all candidates already mapped" debug logs when setPositionByMatch
            // is called redundantly, but those are harmless: the first call sets the correct
            // position and subsequent calls are no-ops.
            chunkOffset: chunkTokenOffsets[index],
            chunkIndex: batchStart + index,
            isParallelChunk: true, // Prevent semantic array reset in individual chunks
          };

          chunk.translated = await this.translateDirectly(chunk.content, chunkOptions);

          // Log individual chunk completion for debugging
          if (this.debugLevel >= DEBUG_LEVELS.VERBOSE) {
            this.log(
              DEBUG_LEVELS.VERBOSE,
              `✅ Chunk ${batchStart + index} completed: "${chunk.content.slice(0, 50)}..."`
            );
          }
        })
      );

      const processingTime = performance.now() - startTime;
      const avgTimePerChunk = processingTime / batch.length;

      // Use INFO level for better visibility of batch performance
      const actualBatchNumber =
        this.currentBatchNumber || Math.floor(batchStart / batch.length) + 1;
      this.log(
        DEBUG_LEVELS.INFO,
        `🚀 Parallel batch ${actualBatchNumber}: ${batch.length} chunks in ${processingTime.toFixed(1)}ms (${avgTimePerChunk.toFixed(1)}ms/chunk)`
      );

      // NEW: Call batch completion callback for streaming UI updates
      if (options.onBatchComplete) {
        try {
          const partialResult = this.getPartialTranslationResult(batchStart + batch.length);
          options.onBatchComplete({
            ...partialResult,
            batchNumber: actualBatchNumber,
            batchTime: processingTime,
            avgTimePerChunk: avgTimePerChunk,
          });
        } catch (callbackError) {
          this.log(DEBUG_LEVELS.WARN, '⚠️ Batch completion callback failed:', callbackError);
        }
      }

      // Track performance degradation across batches
      if (!this.batchPerformanceHistory) this.batchPerformanceHistory = [];
      this.batchPerformanceHistory.push({
        batchNumber: actualBatchNumber,
        processingTime,
        avgTimePerChunk,
        chunkCount: batch.length,
        timestamp: Date.now(),
      });

      // Warn if significant performance degradation detected
      if (this.batchPerformanceHistory.length > 1) {
        const firstBatch = this.batchPerformanceHistory[0];
        const currentBatch = this.batchPerformanceHistory[this.batchPerformanceHistory.length - 1];
        const degradationRatio = currentBatch.avgTimePerChunk / firstBatch.avgTimePerChunk;

        if (degradationRatio > 2.0) {
          // >2x slower than first batch
          this.log(
            DEBUG_LEVELS.WARN,
            `⚠️ Performance degradation detected: Batch ${currentBatch.batchNumber} is ${degradationRatio.toFixed(1)}x slower than batch 1 (${currentBatch.avgTimePerChunk.toFixed(1)}ms vs ${firstBatch.avgTimePerChunk.toFixed(1)}ms per chunk)`
          );
        }
      }
    } catch (error) {
      // Handle parallel processing errors with performance tracking
      this.log(DEBUG_LEVELS.ERROR, 'Parallel chunk processing failed:', error);

      throw new Error('Parallel chunk processing failed and sequential fallback is disabled');
    } finally {
      // Performance monitoring: check for bottlenecks regardless of success/failure
      logger.warnIfSlow('processChunksInParallel', startTime, {
        batchSize: batch.length,
      });
    }
  }

  /**
   * Process remaining tokens in optimized batches for character-level translation
   * @param {Token[]} tokens - Array of tokens
   * @param {Set} processedTokens - Set of already processed token indices
   * @param {Object} options - Translation options
   */
  async processRemainingTokensInBatches(tokens, processedTokens, options) {
    const BATCH_SIZE = 150; // Process 150 tokens at a time for improved performance (reduced from 20)
    const batchPromises = [];
    let currentBatch = [];
    let currentBatchIndices = [];

    // Count unprocessed tokens for debugging
    let unprocessedCount = 0;
    for (let i = 0; i < tokens.length; i++) {
      if (!processedTokens.has(i)) {
        unprocessedCount++;
      }
    }

    if (unprocessedCount > 0) {
      this.log(
        DEBUG_LEVELS.VERBOSE,
        `🔍 Phase 5 Character Processing - Starting with ${unprocessedCount} unprocessed tokens`
      );
    }

    try {
      let characterPhaseYieldTime = performance.now();

      for (let i = 0; i < tokens.length; i++) {
        // CODE REVIEW FIX (HIGH-3): Check abort signal periodically in long loops
        if (i % 100 === 0 && options.abortSignal?.aborted) {
          throw new DOMException(
            'Translation aborted during character batch processing',
            'AbortError'
          );
        }

        if (processedTokens.has(i)) {
          // Process batch at end of loop even if current token is processed
          if (i === tokens.length - 1 && currentBatch.length > 0) {
            // Create batch processing promise
            const batchPromise = this.processTokenBatch(
              tokens,
              currentBatchIndices,
              processedTokens,
              options
            );
            batchPromises.push(batchPromise);

            await Promise.all(batchPromises);
          }
          continue;
        }

        currentBatch.push(tokens[i]);
        currentBatchIndices.push(i);

        // Process batch when it's full or we've reached the end
        if (currentBatch.length >= BATCH_SIZE || i === tokens.length - 1) {
          // Create batch processing promise
          const batchPromise = this.processTokenBatch(
            tokens,
            currentBatchIndices,
            processedTokens,
            options
          );
          batchPromises.push(batchPromise);

          // Process batches in groups to avoid overwhelming the system
          if (batchPromises.length >= 3 || i === tokens.length - 1) {
            await Promise.all(batchPromises);
            batchPromises.length = 0; // Clear the array
          }

          // Reset current batch
          currentBatch = [];
          currentBatchIndices = [];

          // Time-slice: Yield control when processing time exceeds 16ms (60fps threshold)
          const currentTime = performance.now();
          if (currentTime - characterPhaseYieldTime > 16 && i < tokens.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            characterPhaseYieldTime = performance.now();
          }
        }
      }
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, `🚨 Phase 5 Character Processing failed:`, error);
      this.log(DEBUG_LEVELS.ERROR, `🚨 Phase 5 Error stack:`, error.stack);
    }
  }

  /**
   * Process a batch of tokens for character-level translation
   * @param {Token[]} tokens - Full token array
   * @param {number[]} batchIndices - Indices of tokens to process in this batch
   * @param {Set} processedTokens - Set of already processed token indices
   * @param {Object} options - Translation options
   */
  async processTokenBatch(tokens, batchIndices, processedTokens, options) {
    const dictionary = this.dictionaryManager.getDictionary('characters');

    // Phase A: Concurrent lookups — find matches without mutating tokens.
    // findLongestMatchAtPosition is a pure trie read; no token state is changed here.
    const lookupResults = await Promise.all(
      batchIndices.map(async (i) => {
        if (processedTokens.has(i)) {
          return { index: i, match: null };
        }

        // Skip guard: a token another phase translated or consumed, unless a pattern partial
        // reset released it
        if (
          tokens[i].translated !== null ||
          (tokens[i].translationSource && !tokens[i].isPatternPartialReset)
        ) {
          return { index: i, match: null };
        }

        if (!dictionary) {
          return { index: i, match: null };
        }

        try {
          const match = this.findLongestMatchAtPosition(tokens, i, dictionary, 'characters');
          return { index: i, match };
        } catch (error) {
          this.log(
            DEBUG_LEVELS.ERROR,
            `🚨 Token batch lookup failed at index ${i} ("${tokens[i]?.value}"):`,
            error
          );
          return { index: i, match: null };
        }
      })
    );

    // Phase B: Sequential application — each match is applied and processedTokens is
    // updated before the next match is considered, eliminating mutation races between
    // concurrent lookups that returned overlapping spans.
    for (const { index, match } of lookupResults) {
      if (!match) continue;

      // Overlap check against the up-to-date set (earlier results in this loop
      // may have already claimed some of these indices).
      let hasOverlap = false;
      for (let j = 0; j < match.tokenLength; j++) {
        if (processedTokens.has(index + j)) {
          logger.warn(
            `⚠️ Overlap detected: token ${index + j} already consumed. Skipping match at ${index}.`
          );
          hasOverlap = true;
          break;
        }
      }
      if (hasOverlap) continue;

      // Apply the match — this is the only place tokens[] is mutated in this method
      const matchWithDictName = { ...match, dictionary: 'characters' };
      this.applyMatchToTokens(tokens, index, matchWithDictName, options);

      // Mark consumed indices so subsequent iterations see them immediately
      for (let j = 0; j < match.tokenLength; j++) {
        processedTokens.add(index + j);
      }
    }
  }

  /**
   * Progressive translation with batch processing (3-5 chunks at a time)
   *
   * Translates text in batches to enable streaming UI updates and better memory management.
   * Processes 3-5 chunks at a time, calling onProgress after each batch completes. This
   * mode is ideal for long texts where users need visual feedback during translation.
   *
   * Process flow:
   * 1. Split text into chunks by punctuation boundaries
   * 2. Group chunks into batches (3-5 chunks per batch)
   * 3. Translate each batch sequentially
   * 4. Call onProgress callback with cumulative results
   * 5. Maintain position tracking across batches for clickable highlighting
   * 6. Cleanup old batches to maintain memory efficiency
   *
   * Memory management:
   * - Keeps only 3 most recent batches in cache
   * - Debounces progress updates (minimum 100ms between updates)
   * - Cleans up segments to prevent accumulation
   *
   * @param {string} text - Input Chinese text to translate
   * @param {Object} [options={}] - Translation options
   * @param {Function} options.onProgress - Progress callback (REQUIRED)
   * @param {Function} options.onProgress.callback - Called after each batch
   * @param {number} options.onProgress.callback.percent - Completion percentage (0-100)
   * @param {string} options.onProgress.callback.translatedText - Cumulative translated text
   * @param {number} options.onProgress.callback.batch - Current batch number
   * @param {number} options.onProgress.callback.totalBatches - Total number of batches
   * @param {Object} [options.lookupIndex] - Pre-built Rust lookup index
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation
   *
   * @returns {Promise<Object>} Translation result
   * @returns {string} result.translatedText - Complete translated text
   * @returns {Object} result.semanticArrays - Semantic arrays for highlighting
   * @returns {Array} result.semanticArrays.original - Original text segments
   * @returns {Array} result.semanticArrays.translated - Translated text segments
   * @returns {Array} result.semanticArrays.metadata - Metadata for each segment
   *
   * @example
   * // Progressive translation with UI updates
   * const result = await engine.translateWithProgressiveBatches(longText, {
   *   onProgress: ({ percent, translatedText, batch, totalBatches }) => {
   *     console.log(`Batch ${batch}/${totalBatches} (${percent}%)`);
   *     updateUI(translatedText); // Update UI with partial results
   *   }
   * });
   *
   * @example
   * // With abort signal
   * const controller = new AbortController();
   * const promise = engine.translateWithProgressiveBatches(text, {
   *   onProgress: (progress) => console.log(progress.percent + '%'),
   *   abortSignal: controller.signal
   * });
   * // Later: controller.abort() to cancel
   *
   * @see translateWithSegments - Entry point that selects progressive or chunked mode
   * @see translateWithChunking - Alternative chunked translation (no progress updates)
   * @see TextChunker - Handles text splitting by punctuation
   *
   * @performance
   * - Batch size: 3-5 chunks (configurable via UI_UPDATE_THRESHOLDS.BATCH_SIZE)
   * - Progress debouncing: 100ms minimum between updates
   * - Memory efficient: Only keeps 3 recent batches in cache
   * - Best for texts >5000 chars where streaming updates improve UX
   *
   * @critical
   * Requires onProgress callback - will not provide intermediate updates without it.
   * Each batch processes sequentially to maintain position tracking accuracy.
   */

  /**
   * translateWithProgressiveBatches' initial batch size: maxParallelChunks when chunking
   * is enabled, MIN_BATCH_SIZE when not, floored at MIN_BATCH_SIZE (not a bare 2) so
   * currentBatchSize never starts below the range calculateNextBatchSize's
   * severe-degradation shrink guard (currentBatchSize > MIN_BATCH_SIZE) assumes — below
   * that range the guard silently never fires (architecture review 2026-08-15).
   * AdaptiveBatchSizer owns every later batch.
   */
  _initialBatchSize(chunkConfig) {
    const base = chunkConfig.enabled ? chunkConfig.maxParallelChunks : MIN_BATCH_SIZE;
    return Math.max(MIN_BATCH_SIZE, base);
  }

  /**
   * Verifies translationSegments position tracking and warns on any segment still
   * missing a position. Shared by translateWithSegments and translateWithProgressiveBatches
   * (3 call sites hand-copied the same filter+warn check before being unified here,
   * architecture review 2026-08-15, candidate #4).
   * @param {string} [contextSuffix] - e.g. ' in batch processing', appended to the log message
   */
  _logUnpositionedSegments(contextSuffix = '') {
    const unpositionedSegments = this.translationSegments.filter((s) => s.translatedStart === -1);
    if (unpositionedSegments.length > 0) {
      this.log(
        DEBUG_LEVELS.WARN,
        `⚠️ ${unpositionedSegments.length} segments missing positions${contextSuffix} - position tracking bug detected`
      );
    }
  }

  // ============================================================================
  // SECTION 13: PROGRESSIVE BATCH TRANSLATION
  // ============================================================================
  // Purpose: Stream translation results in batches for UI progress updates
  // Dependencies: AdaptiveBatchSizer, processChunksInParallel,
  //   ProgressiveProgressReporter, WordSegmentMatcher
  // Critical: this.batchPerformanceHistory resets per translation
  // ============================================================================

  async translateWithProgressiveBatches(text, options = {}) {
    const startTime = performance.now();

    // Initialize segments collection for progressive translation
    this.translationSegments = [];

    // Reset semantic builder with capacity estimation for progressive translation
    const estimatedUnits = Math.max(100, Math.ceil(text.length / 2)); // Progressive needs more capacity
    this.semanticArrayBuilder.reset(estimatedUnits);

    // PHASE 2: Initialize progressive position tracking
    this.progressivePositionTracker = {
      runningTextPosition: 0,
      finalText: '',
      totalOriginalSegments: [],
      totalTranslatedSegments: [],
    };

    // Initialize progress update debouncing (reduce UI update overhead)
    this.lastProgressUpdate = 0;
    this.progressUpdateInterval = UI_UPDATE_THRESHOLDS.PROGRESS_DEBOUNCE_MS;
    this.minChunksForStreaming = UI_UPDATE_THRESHOLDS.STREAMING_MIN_CHUNKS;

    // Step 1: Split text into chunks by punctuation boundaries
    const chunks = this.textChunker.chunkText(text);
    const translatableChunks = this.textChunker.getTranslatableChunks(chunks);

    if (translatableChunks.length === 0) {
      // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
      return {
        translatedText: text,
        semanticArrays: this.semanticArrayBuilder?.getArrays() || emptySemanticArrays(),
      };
    }

    const streamingEnabled = translatableChunks.length >= this.minChunksForStreaming;
    this.log(
      DEBUG_LEVELS.INFO,
      `🚀 Starting progressive translation: ${translatableChunks.length} chunks (streaming ${streamingEnabled ? 'ENABLED' : 'DISABLED - below ' + this.minChunksForStreaming + ' chunk threshold'})`
    );

    // Store total chunks for streaming progress calculation
    this.totalChunks = translatableChunks.length;

    // Step 2: Process chunks in adaptive batches with ParallelConfig integration
    const chunkConfig = parallelConfig.getOptimalConfig('chunk', {
      textLength: text.length,
      chunkCount: translatableChunks.length,
    });

    let currentBatchSize = this._initialBatchSize(chunkConfig);

    logger.info('[batch-sizing]', `📊 Initial batch size: ${currentBatchSize}`);

    let _totalBatches = Math.ceil(translatableChunks.length / currentBatchSize);

    // Initialize adaptive batch sizing
    this.batchPerformanceHistory = []; // Reset for this translation session
    let performanceBaseline = null;

    let processedChunks = 0;
    let batchIndex = 0;

    // MEDIUM FIX: Track cumulative token count for accurate batchStart calculation
    // processedChunks tracks chunk indices (0, 1, 2...); we need token counts for chunkOffset
    let cumulativeTokenCount = 0;

    while (processedChunks < translatableChunks.length) {
      // CODE REVIEW FIX (2026-02-01): Check abort signal between batches
      // Allows users to cancel long translations mid-processing
      if (options.abortSignal?.aborted) {
        this.log(DEBUG_LEVELS.WARN, '🛑 Translation cancelled by user (abort signal)');
        throw new Error('Translation cancelled by user');
      }

      // Adaptive batch sizing: adjust based on performance history
      const sizing = calculateNextBatchSize({
        batchPerformanceHistory: this.batchPerformanceHistory,
        currentBatchSize,
        performanceBaseline,
        batchIndex,
      });
      currentBatchSize = sizing.batchSize;
      performanceBaseline = sizing.performanceBaseline;
      if (sizing.log) {
        this.log(
          sizing.log.level === 'warn' ? DEBUG_LEVELS.WARN : DEBUG_LEVELS.INFO,
          sizing.log.message
        );
      }

      const batchStart = processedChunks; // Chunk index
      const batchEnd = Math.min(batchStart + currentBatchSize, translatableChunks.length);
      const currentBatch = translatableChunks.slice(batchStart, batchEnd);

      // MEDIUM FIX: Calculate token offset for this batch
      const batchTokenOffset = cumulativeTokenCount;

      // Pass current batch number for accurate logging
      this.currentBatchNumber = batchIndex;

      // Translate current batch (with parallel processing)
      // MEDIUM FIX: Pass token offset, not chunk index
      await this.processChunksInParallel(currentBatch, options, batchTokenOffset);

      // Yield to event loop after each batch so the UI can paint a frame.
      // processChunksInParallel runs synchronous WASM (pattern + number processing) inside
      // Promise.all — microtasks drain without ever returning to the browser event loop.
      // This single setTimeout(0) is the same pattern used in translateWithChunking's
      // 16ms time-slice guard, but applied unconditionally here since each batch is already
      // a natural yield point.
      await new Promise((resolve) => setTimeout(resolve, 0));

      // MEDIUM FIX: Update cumulative token count for next batch
      // chunk.content is a string — must tokenize before counting (see processChunksInParallel
      // comment). Use raw token count to match the raw-index startIndex used in addUnit calls.
      const batchTokenCount = currentBatch.reduce((sum, chunk) => {
        return sum + this.tokenizer.tokenize(chunk.content).length;
      }, 0);
      cumulativeTokenCount += batchTokenCount;

      if (batchIndex % 5 === 0) {
        // Periodic diagnostics (semantic array size) — read-only, every 5th batch.
        const currentArrays = this.semanticArrayBuilder?.getArrays() || emptySemanticArrays();
        this.log(
          DEBUG_LEVELS.INFO,
          `🧹 Batch ${batchIndex} semantic arrays: ${currentArrays?.originalSegments?.length || 0} original, ${currentArrays?.translatedSegments?.length || 0} translated segments`
        );
      }

      // PHASE 1 FIX: Process only current batch chunks, not all chunks (eliminates O(n²) redundancy)
      this.processBatchChunksProgressive(currentBatch, chunks, batchStart);

      // PHASE 2: Process batch progressively with position tracking
      const batchResult = await this.processBatchWithProgressivePositioning(
        currentBatch,
        chunks,
        batchStart
      );

      // Use the already-processed text from batch processing (eliminates redundant reconstruction)
      const cleanedResult = batchResult.cleanedBatchText;

      // Verify position tracking worked correctly
      this._logUnpositionedSegments(' in batch processing');
      this.semanticArrayBuilder.updateWithCapitalizedText(cleanedResult);

      // Update progress tracking
      processedChunks = batchEnd;
      batchIndex++;

      // Call progress callback if provided (with debouncing to reduce UI overhead)
      if (options.onProgress) {
        const enableStreaming = translatableChunks.length >= this.minChunksForStreaming;
        const isLastBatch = processedChunks >= translatableChunks.length;

        const update = buildProgressiveProgressUpdate({
          now: performance.now(),
          lastProgressUpdate: this.lastProgressUpdate,
          progressUpdateInterval: this.progressUpdateInterval,
          isLastBatch,
          enableStreaming,
          batchIndex,
          processedChunks,
          totalChunks: translatableChunks.length,
          currentBatchSize,
          semanticArrays: this.semanticArrayBuilder?.getArrays(),
          progressText: this.progressivePositionTracker.finalText || cleanedResult,
        });

        if (update.send) {
          options.onProgress(update.payload);
          this.lastProgressUpdate = performance.now();
        } else {
          this.log(DEBUG_LEVELS.DEBUG, update.log.message);
        }
      }
    }

    // PHASE 1: Apply final processing to match original translateWithChunking method exactly
    // Apply punctuation translation to all chunks (needed for cross-chunk context like comma-quote spacing)
    this.chunkPostProcessor.translatePunctuation(chunks, this.punctuationDict);

    // Apply capitalization to all chunks
    this.applySmartCapitalization(chunks);

    // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
    const semanticArrays = this.semanticArrayBuilder?.getArrays() || emptySemanticArrays();
    // Progressive-batch path: use the cheap reconstruct (no segments) per
    // ChunkPostProcessor.js's own "NOT USED BY" doc block on reconstructTextWithSegments —
    // prebuiltSegments gets rebuilt below via matchWordSegments regardless, so the segments
    // half of reconstructTextWithSegments's return would be built and immediately discarded.
    const finalResult = this.chunkPostProcessor.reconstructText(chunks);
    const cleanedFinalResult = this.applyFinalCleanup(finalResult).normalize('NFC');

    // CRITICAL BUG FIX: Normalize to NFC for consistent Vietnamese diacritic handling
    // Vietnamese "màu" can be NFC (3 chars: m+à+u) or NFD (4 chars: m+a+combining-grave+u)
    // Without normalization, .length calculations create wrong segment boundaries
    // causing "màu" to split into "mà" (clickable) + "u" (not clickable)

    // Note: semanticArrays already obtained above - reuse it
    // Find the original chunk that was translated
    const translatedChunk = chunks.find((chunk) => chunk.translated && chunk.content.trim());

    if (translatedChunk && semanticArrays.original.length > 0) {
      // Map each translated semantic unit onto its actual position in the output text
      // (extracted to WordSegmentMatcher — architecture review 2026-07-29, candidate #1)
      this.prebuiltSegments = matchWordSegments(semanticArrays, cleanedFinalResult);
    } else {
      this.prebuiltSegments = [];
      logger.log(`⚠️ Progressive: No translated chunks or semantic arrays available`);
    }

    // Debug logging for semantic array building
    if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
      const debugInfo = this.semanticArrayBuilder.getDebugInfo();
      this.log(
        DEBUG_LEVELS.DEBUG,
        `🔍 Semantic arrays before final processing: ${debugInfo.totalUnits} units`
      );
      this.log(
        DEBUG_LEVELS.VERBOSE,
        `📋 Semantic mappings:`,
        debugInfo.mappings?.slice(0, 10) || []
      ); // Show first 10 for brevity
    }

    // Verify position tracking worked correctly
    this._logUnpositionedSegments(' in final processing');
    this.semanticArrayBuilder.updateWithCapitalizedText(cleanedFinalResult);

    // Debug logging after final processing
    if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
      const finalDebugInfo = this.semanticArrayBuilder.getDebugInfo();
      this.log(DEBUG_LEVELS.DEBUG, `✅ Final semantic arrays: ${finalDebugInfo.totalUnits} units`);
    }

    const translationTime = performance.now() - startTime;

    this.log(
      DEBUG_LEVELS.INFO,
      `✅ Progressive translation completed: ${batchIndex} batches in ${translationTime.toFixed(1)}ms`
    );

    // OPTIMIZED FIX: Use naturally accumulated semantic arrays and update with final text
    // PHASE 4: Validate progressive results before return
    const progressiveTextLength = this.progressivePositionTracker.finalText.length;
    const fallbackTextLength = cleanedFinalResult.length;

    if (Math.abs(progressiveTextLength - fallbackTextLength) > 10) {
      this.log(
        DEBUG_LEVELS.WARN,
        `⚠️ Progressive text length mismatch: ${progressiveTextLength} vs ${fallbackTextLength} (fallback)`
      );
    }

    // BUGFIX: Use semanticArrayBuilder directly for final return to avoid duplicates
    // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
    const finalSemanticArrays = this.semanticArrayBuilder?.getArrays() || emptySemanticArrays();

    this.log(
      DEBUG_LEVELS.INFO,
      `🎯 Progressive semantic arrays: ${finalSemanticArrays.original?.length || 0} segments built progressively`
    );

    // BUGFIX: Use existing metadata from builder, fill gaps with defaults
    // CRITICAL FIX: Use explicit missing indicator for better debugging
    const originalLength = finalSemanticArrays.original?.length || 0;
    const finalMetadata = [];
    for (let i = 0; i < originalLength; i++) {
      finalMetadata[i] = finalSemanticArrays.metadata?.[i] || {
        source: 'progressive',
        phase: null, // null = missing, not unknown
        dictionary: null, // null = missing, not unknown
        isMissing: true, // Explicit flag for debugging
      };
    }

    // CRITICAL FIX: Validate metadata array length matches original array
    // Sparse arrays would cause position misalignment in rendering
    if (finalMetadata.length !== originalLength) {
      throw new Error(
        `Metadata array length mismatch: ${finalMetadata.length} vs ${originalLength} (expected)`
      );
    }

    return {
      translatedText: cleanedFinalResult, // Use capitalized result, not progressive tracker (which lacks capitalization)
      semanticArrays: {
        original: finalSemanticArrays.original || [],
        translated: finalSemanticArrays.translated || [],
        metadata: finalMetadata,
      },
    };
  }

  // ============================================================================
  // SECTION 14: CHUNKED TRANSLATION PATHS
  // ============================================================================
  // Purpose: Alternative to progressive batching — chunk once, translate, reassemble
  // Dependencies: TextChunker, ChunkPostProcessor, translateDirectly
  // Note: Only production entry point is translateDirectly's own oversized-input
  //   recursive fallback (see this file's SECTION 6 comment: translateWithSegments
  //   always takes the progressive branch, not this one)
  // ============================================================================

  /**
   * Translate text using chunk-based processing for better accuracy and potential parallelization
   *
   * Splits text by punctuation boundaries and translates each chunk independently. This approach
   * improves translation accuracy by respecting sentence boundaries and enables parallel processing
   * for better performance. Each chunk writes to the shared semantic array builder with a
   * chunkOffset computed upfront, keeping global tokenIndex values correct regardless of
   * chunk-completion order.
   *
   * Process flow:
   * 1. Split text into chunks by punctuation (。！？，；：)
   * 2. Identify translatable chunks (contain Chinese text)
   * 3. Translate chunks in parallel or sequentially
   * 4. Reassemble chunks preserving original punctuation and whitespace
   * 5. Build pre-built segments for clickable highlighting
   *
   * Parallel processing:
   * - Chunks write directly to the shared this.semanticArrayBuilder (no per-chunk isolation)
   * - Deep copy options for each chunk to avoid shared state conflicts
   * - Automatically enabled for texts with 2+ translatable chunks
   *
   * @param {string} text - Input Chinese text to translate
   * @param {Object} [options={}] - Translation options
   * @param {boolean} [options.parallel=true] - Enable parallel chunk processing
   * @param {Object} [options.lookupIndex] - Pre-built Rust lookup index (shared across chunks)
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation
   * @param {string[]} [options.activeProperNouns] - Active proper noun dictionaries
   *
   * @returns {Promise<string>} Translated text with original punctuation preserved
   *
   * @example
   * // Basic chunked translation
   * const translated = await engine.translateWithChunking(
   *   '你好世界。这是一个测试，请验证结果。'
   * );
   *
   * @example
   * // Disable parallel processing for debugging
   * const translated = await engine.translateWithChunking(text, {
   *   parallel: false
   * });
   *
   * @see translateWithSegments - Entry point that selects chunked or progressive mode
   * @see translateDirectly - Translates individual chunks
   * @see TextChunker - Handles text splitting by punctuation
   *
   * @performance
   * - Parallel mode: 2-3x faster for texts with 5+ chunks
   * - Sequential mode: More predictable for debugging
   *
   * @critical
   * Parallel mode writes directly to the shared this.semanticArrayBuilder with a
   * chunkOffset computed upfront (correct regardless of which chunk's translateDirectly
   * call resolves first) — same strategy processChunksInParallel uses. A prior
   * isolated-per-chunk-builder attempt here was removed 2026-08-18 (architecture review
   * candidate #2 grilling): it was unsound, see the comment inside the parallel branch
   * for the full analysis. Deep copies options for each chunk to prevent shared object
   * mutations.
   */
  async translateWithChunking(text, options = {}) {
    const startTime = performance.now();

    // Initialize segments collection for chunked translation
    this.translationSegments = [];

    // Reset semantic array builder for new translation
    this.semanticArrayBuilder.reset();

    // Step 1: Split text into chunks by punctuation boundaries
    const chunks = this.textChunker.chunkText(text);
    const analysis = this.textChunker.analyzeChunks(chunks);

    this.log(DEBUG_LEVELS.INFO, `🧩 Starting chunked translation: ${chunks.length} chunks`);

    this.log(DEBUG_LEVELS.DEBUG, `📊 Chunk analysis:`, analysis);

    // Step 2: Get chunks that need translation (contain Chinese text)
    const translatableChunks = this.textChunker.getTranslatableChunks(chunks);

    if (translatableChunks.length === 0) {
      // No Chinese text to translate
      return text;
    }

    // Step 3: Translate chunks (with potential parallelization)
    const enableParallel = options.parallel !== false && translatableChunks.length > 1;

    if (enableParallel) {
      this.log(DEBUG_LEVELS.DEBUG, `🔄 Processing ${translatableChunks.length} chunks in parallel`);

      // Chunks write directly to the shared this.semanticArrayBuilder with a correct global
      // chunkOffset computed upfront — same strategy processChunksInParallel already uses in
      // production (see its identical chunkTokenCounts/chunkTokenOffsets computation below).
      //
      // A prior isolated-per-chunk-builder attempt here was deleted 2026-08-18 (architecture
      // review candidate #2 grilling) — it was NOT safe. It worked by swapping
      // this.semanticArrayBuilder (a single shared instance field every addUnit call site reads
      // live) in and out around await boundaries inside translateDirectly. Async functions run
      // synchronously up to their first await, so Array.prototype.map dispatches every chunk's
      // synchronous prefix — including the builder swap — before any chunk reaches real async
      // work. That guarantees every chunk past the first captures the wrong "original" builder to
      // restore, and writes its semantic units into whichever builder happens to be live at that
      // instant (a moving target other chunks are also swapping), not its own. Deterministic
      // corruption, not a timing fluke — see git history for the full analysis.
      const chunkTokenCounts = translatableChunks.map(
        (chunk) => this.tokenizer.tokenize(chunk.content).length
      );
      let cumulativeTokenCount = 0;
      const chunkTokenOffsets = translatableChunks.map((_, index) => {
        const offset = cumulativeTokenCount;
        cumulativeTokenCount += chunkTokenCounts[index];
        return offset;
      });

      // Translate chunks in parallel
      // CRITICAL FIX: Deep copy options for parallel processing
      // Each chunk runs in parallel - shared nested objects would cause race conditions
      const translationPromises = translatableChunks.map((chunk, idx) =>
        this.translateDirectly(chunk.content, {
          ...options,
          // Deep copy complex nested objects to prevent race conditions
          lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
          segments: options.segments ? [...options.segments] : undefined,
          useChunking: false,
          chunkOffset: chunkTokenOffsets[idx],
          chunkStartChar: chunk.startIndex, // char offset of chunk start in full original text
          isParallelChunk: true,
        })
      );

      // CODE REVIEW FIX (2026-02-01): Check abort signal before parallel processing
      if (options.abortSignal?.aborted) {
        this.log(DEBUG_LEVELS.WARN, '🛑 Translation cancelled by user (abort signal)');
        throw new Error('Translation cancelled by user');
      }

      const translatedContents = await Promise.all(translationPromises);

      // Apply translated results back to chunks
      translatableChunks.forEach((chunk, index) => {
        chunk.translated = translatedContents[index];
      });
    } else {
      this.log(
        DEBUG_LEVELS.DEBUG,
        `🔄 Processing ${translatableChunks.length} chunks sequentially with time-slicing`
      );

      // CRITICAL: Chunks must be processed sequentially to maintain semantic array position order
      // Each chunk uses chunkOffset to calculate globalTokenIndex for semantic array tracking.
      // Parallel processing would corrupt position order, breaking clickable highlighting.
      // Time-slicing prevents UI blocking while maintaining sequential position tracking.

      // MEDIUM FIX: Track cumulative token count for accurate chunkOffset
      // chunkOffset should be token index, not character position (chunk.startIndex is character position)
      let cumulativeTokenCount = 0;

      let lastYieldTime = performance.now();
      for (let i = 0; i < translatableChunks.length; i++) {
        const chunk = translatableChunks[i];

        // CRITICAL FIX: Deep copy options for each chunk
        // Even in sequential processing, chunks may mutate options (lookupIndex assignment)
        chunk.translated = await this.translateDirectly(chunk.content, {
          ...options,
          // Deep copy complex nested objects to prevent mutation leakage
          lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
          segments: options.segments ? [...options.segments] : undefined,
          useChunking: false,
          // MEDIUM FIX: Use token count offset, not character position
          chunkOffset: cumulativeTokenCount,
          chunkStartChar: chunk.startIndex, // char offset of chunk start in full original text
          isParallelChunk: true,
        });

        // MEDIUM FIX: Update cumulative token count for next chunk.
        // chunk.content is a string — must tokenize first; getSemanticTokens() expects TextToken[].
        cumulativeTokenCount += this.tokenizer.tokenize(chunk.content).length;

        // Time-slice: Yield control when processing time exceeds 16ms (60fps threshold)
        const currentTime = performance.now();
        if (currentTime - lastYieldTime > 16 && i < translatableChunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          lastYieldTime = performance.now();
        }
      }
    }

    // Step 4: Apply punctuation translation
    this.chunkPostProcessor.translatePunctuation(chunks, this.punctuationDict);

    // Step 5: Apply smart capitalization based on punctuation context
    this.applySmartCapitalization(chunks);

    // Step 6: Reconstruct the final text with segment positions built simultaneously
    // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
    const semanticArraysForReconstruction =
      this.semanticArrayBuilder?.getArrays() || emptySemanticArrays();
    const reconstructed = this.chunkPostProcessor.reconstructTextWithSegments(
      chunks,
      semanticArraysForReconstruction
    );
    let result = reconstructed.text;

    // Step 7: Apply final cleanup (spacing, etc.) and normalize to NFC
    // CRITICAL BUG FIX: Normalize to NFC for consistent Vietnamese diacritic handling
    result = this.applyFinalCleanup(result).normalize('NFC');

    // Step 8: Store prebuilt segments for instant clickable highlighting
    this.prebuiltSegments = reconstructed.segments;

    const translationTime = performance.now() - startTime;
    this.log(
      DEBUG_LEVELS.INFO,
      `✅ Chunked translation completed: ${chunks.length} chunks in ${translationTime.toFixed(1)}ms`
    );

    return result;
  }

  /**
   * Direct translation method (original single-text approach)
   *
   * Translates text as a single unit without chunking or progressive processing. This is the
   * core translation method that implements the full 5-phase pipeline. Used internally by
   * translateWithChunking for individual chunks and by translateWithSegments for small texts.
   *
   * Key features:
   * - Full 5-phase translation pipeline
   * - Automatic Rust lookup index for texts >500 chars (6-50x speedup)
   * - Token consumption tracking to prevent double-processing
   * - Semantic array generation for clickable highlighting
   *
   * Translation phases (IMMUTABLE ORDER):
   * 1. Pattern Processing: Structural patterns with variables
   * 2. Proper Noun Processing: Novel-specific terms
   * 3. Number Processing: Chinese numbers → Vietnamese
   * 4. Phrase Processing: Common phrases
   * 5. Character Processing: Character fallback
   *
   * @param {string} text - Input Chinese text to translate
   * @param {Object} [options={}] - Translation options
   * @param {boolean} [options.useChunking=true] - Enable chunk-based processing (for standalone calls)
   * @param {boolean} [options.isParallelChunk=false] - Internal flag for parallel chunk processing
   * @param {Object} [options.lookupIndex] - Pre-built Rust lookup index
   * @param {boolean} [options.useSharedLookupIndex=true] - Enable Rust lookup index for texts >500 chars
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation
   * @param {string[]} [options.activeProperNouns] - Active proper noun dictionaries
   *
   * @returns {Promise<string>} Translated Vietnamese text
   *
   * @example
   * // Basic direct translation
   * const translated = await engine.translateDirectly('你好世界');
   *
   * @see translateWithSegments - High-level entry point for translation
   * @see translateWithChunking - Calls this method for each chunk
   * @see translateSinglePass - Core 5-phase translation pipeline
   *
   * @performance
   * - Small texts (<500 chars): ~50-100ms
   * - Large texts (>500 chars with Rust index): 6-50x faster
   * - Automatic optimization selection based on text length
   *
   * @critical
   * When isParallelChunk=true, does NOT reset semantic builder or segments.
   * This allows accumulation across chunks in parallel processing — all parallel chunks write
   * to the same this.semanticArrayBuilder; chunkOffset (computed upfront by the caller) keeps
   * tokenIndex values globally correct regardless of chunk-completion order.
   */
  async translateDirectly(text, options = {}) {
    // This is the original translate method logic, renamed for chunk-based architecture
    const startTime = performance.now();
    const _translationId = this.stats.totalTranslations++;

    try {
      // CRITICAL FIX: Only reset segments if this is a standalone translation
      // DO NOT reset if this is part of multi-chunk translation (would lose semantic arrays from previous chunks)
      //
      // Context: When translateWithChunking() calls translateDirectly() for each chunk:
      // - Sets useChunking: false (to prevent nested chunking)
      // - Sets isParallelChunk: true (to prevent reset)
      // - This allows semantic arrays to accumulate across chunks
      //
      // Decision logic:
      // - If isParallelChunk === true: DON'T RESET (accumulate across chunks)
      // - If useChunking === false AND isParallelChunk !== true: RESET (standalone translation)
      // - If useChunking !== false: RESET (standard translation)
      const isPartOfMultiChunkTranslation = options.isParallelChunk === true;
      if (!isPartOfMultiChunkTranslation) {
        this.translationSegments = [];
        // Reset semantic array builder for new translation
        this.semanticArrayBuilder.reset();
      }

      // OPTIMIZATION: Build Rust-powered lookup index for large texts (6-50x faster)
      // Only build if not already provided and text is large enough
      await buildLookupIndexOrFallback(text, options, {
        dictionaryManager: this.dictionaryManager,
        logDebug: (msg) => this.log(DEBUG_LEVELS.DEBUG, msg),
        logWarn: (msg) => this.log(DEBUG_LEVELS.WARN, msg),
      });

      // Phase 1: Tokenization with memory-based processing limits
      const tokens = this.tokenizer.tokenize(text);

      // CRITICAL: Validate token count to prevent memory exhaustion
      const estimatedTokenCount = text.length * 1.2; // Conservative estimate
      const maxTokensAllowed = this.calculateMaxTokensForDevice();

      if (tokens.length > maxTokensAllowed || estimatedTokenCount > maxTokensAllowed) {
        // Graceful degradation: split into manageable chunks
        this.log(
          DEBUG_LEVELS.WARN,
          `⚠️ Large input detected: ${tokens.length} tokens (limit: ${maxTokensAllowed}). Applying chunking strategy.`
        );

        // Force chunking for oversized inputs
        if (!options.useChunking) {
          // CRITICAL FIX: Deep copy options for recursive call
          return this.translateWithChunking(text, {
            ...options,
            // Deep copy complex nested objects to prevent mutation leakage
            lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
            segments: options.segments ? [...options.segments] : undefined,
            useChunking: true,
            forceChunking: true,
          });
        }

        // If already chunking and still too large, split into smaller chunks
        if (tokens.length > maxTokensAllowed * 2) {
          throw new Error(
            `Input too large: ${tokens.length} tokens exceeds maximum safe processing limit. Please split your text into smaller sections.`
          );
        }
      }

      // Use optimized single-pass processing
      await this.translateSinglePass(tokens, options);

      // Phase 7: Post-processing and cleanup (simplified for direct mode)
      const result = this.postProcess(tokens, options);

      const translationTime = performance.now() - startTime;
      this.log(
        DEBUG_LEVELS.VERBOSE,
        `✅ Direct translation completed: ${tokens.length} tokens in ${translationTime.toFixed(1)}ms`
      );

      return result;
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, `🚨 Translation error:`, error);
      throw error;
    }
  }

  // ============================================================================
  // SECTION 15: CORE 5-PHASE TRANSLATION PIPELINE
  // ============================================================================
  // Purpose: Execute all 5 phases in sequence
  // Dependencies: ALL PHASES (this is the main pipeline)
  // Extraction Potential: NONE - Heart of the translation system
  // Critical: Phase order is IMMUTABLE
  //
  // Phase Execution Order (NEVER CHANGE):
  //   1. Pattern Processing    (applyPatterns)
  //   2. Proper Noun Processing (applyDictionaryTranslation with activeProperNouns)
  //   3. Number Processing     (NumberProcessor.processTokens, via this.numberProcessor)
  //   4. Phrase Processing     (createOptimalPhraseGroups)
  //   5. Character Processing  (processRemainingTokensInBatches)
  //
  // Why Sequential: Each phase consumes tokens, preventing double-processing
  // Why Coupled: Shared token state requires synchronous coordination
  // ============================================================================

  /**
   * Core 5-phase translation pipeline with token consumption tracking
   *
   * The heart of the translation engine - implements the IMMUTABLE 5-phase processing order
   * with shared token state coordination. Each phase consumes tokens to prevent double-processing
   * conflicts. This method CANNOT be split because phase coordination requires synchronous
   * token state management.
   *
   * EXECUTION PATH:
   *   - Called by: translateDirectly() after text tokenization
   *   - Used by: BOTH Full Translation and Character-only modes
   *   - Calls: postProcess() ONLY for tokens that needed translation (Chinese content)
   *   - Skips postProcess() for: Numbers (already Arabic), Latin text, punctuation
   *
   * Phase Execution Order (NEVER CHANGE):
   * 1. Pattern Processing (applyPatterns) - Highest priority
   * 2. Proper Noun Processing (applyDictionaryTranslation with activeProperNouns)
   * 3. Number Processing (NumberProcessor.processTokens, via this.numberProcessor)
   * 4. Phrase Processing (createOptimalPhraseGroups)
   * 5. Character Processing (processRemainingTokensInBatches) - Lowest priority
   *
   * Why this order cannot change:
   * - Each phase marks processed tokens with translationSource: "X_consumed"
   * - Later phases only process unconsumed tokens
   * - Higher priority phases override lower priority phases
   * - Changing order breaks conflict resolution
   *
   * Token consumption mechanism:
   * - Consumed tokens: translated = null, translationSource = "phase_consumed"
   * - Unconsumed tokens: translated = null, translationSource = null
   * - Proper translations: translated = "text", translationSource = "phase"
   *
   * Phase protection:
   * - Phase order validation ensures phases execute in correct sequence
   * - Phase timeout protection prevents infinite loops (5-60s per phase)
   * - Phase failure tracking for debugging silent failures
   *
   * @param {Array<Object>} tokens - Tokenized input text
   * @param {string} tokens[].original - Original Chinese character
   * @param {string|null} tokens[].translated - Translated text (null = not yet translated)
   * @param {string|null} tokens[].translationSource - Source of translation or consumption
   * @param {Object} [options={}] - Translation options
   * @param {Object} [options.lookupIndex] - Pre-built Rust lookup index for Phase 5
   * @param {string[]} [options.activeProperNouns] - Active proper noun dictionaries for Phase 2
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation
   *
   * @returns {Promise<Array<Object>>} Translated tokens
   * @returns {string} tokens[].original - Original Chinese character
   * @returns {string} tokens[].translated - Translated Vietnamese text (or original if no match)
   * @returns {string} tokens[].translationSource - Source of translation (pattern, properNoun, number, phrase, character)
   *
   * @throws {Error} If phase order is violated (developer error)
   * @throws {Error} If phase exceeds timeout (performance issue)
   *
   * @example
   * // Basic usage (called internally by translateDirectly)
   * const tokens = text.split('').map(char => ({
   *   original: char,
   *   translated: null,
   *   translationSource: null
   * }));
   * const translated = await engine.translateSinglePass(tokens, options);
   *
   * @see translateDirectly - Calls this method after tokenization
   * @see applyPatterns - Phase 1 implementation
   * @see applyDictionaryTranslation - Phase 2 implementation
   * @see NumberProcessor.processTokens - Phase 3 implementation (delegated to a separate
   *      class via this.numberProcessor, not a TranslationEngine method like its phase
   *      siblings — corrected 2026-08-18, architecture review follow-up to candidate #3;
   *      previously cited a non-existent `processNumbersWasm` method)
   * @see createOptimalPhraseGroups - Phase 4 implementation
   * @see processRemainingTokensInBatches - Phase 5 implementation
   *
   * @sideeffects Mutates the `tokens` array in place — every phase writes
   * `translated`, `translationSource`, `groupLeader`, and `isGrouped` directly
   * onto the token objects. The returned array IS the mutated input.
   * Calling this method a second time on the same tokens will re-translate
   * already-translated tokens (no idempotency guard).
   *
   * @architectural
   * This method CANNOT be extracted or split because:
   * - Phases share token state (synchronous coordination required)
   * - Phase order is immutable (conflict resolution depends on sequence)
   * - Token consumption tracking prevents double-processing
   * - Cache invalidation timing is phase-critical
   *
   * @performance
   * - Phase 1 (Patterns): 1-5ms
   * - Phase 2 (Proper Nouns): 5-20ms
   * - Phase 3 (Numbers with WASM): 2-10ms (5-10x faster than JS)
   * - Phase 4 (Phrases): 10-50ms
   * - Phase 5 (Characters with Rust): 20-200ms (6-50x faster with lookup index)
   *
   * @critical
   * Phase order is IMMUTABLE. Changing order breaks translation quality.
   * Each phase must run to completion before next phase starts.
   * Token state is shared - concurrent execution would corrupt results.
   */
  async translateSinglePass(tokens, options = {}) {
    const startTime = performance.now();
    this.log(DEBUG_LEVELS.VERBOSE, `🚀 Single-pass translation: ${tokens.length} tokens`);

    // CODE REVIEW FIX 2026-02-01 (IMPORTANT-2): Early document size validation
    // Validate token count before processing to prevent integer overflow in position calculations
    // Position mappings multiply segment indices by character positions, which can exceed
    // Number.MAX_SAFE_INTEGER for extremely large documents
    if (tokens.length > MAX_SAFE_SEGMENTS) {
      throw new Error(
        `Document too large: ${tokens.length.toLocaleString()} tokens exceeds safe limit of ${MAX_SAFE_SEGMENTS.toLocaleString()} tokens. ` +
          `This prevents integer overflow in position calculations for clickable highlighting.`
      );
    }

    // CRITICAL FIX: Track phase completion for debugging silent failures
    // Phases can fail silently (catch error, log, continue) which makes debugging difficult
    // This Set tracks which phases completed successfully vs failed
    const completedPhases = new Set();

    // CODE REVIEW FIX (CRITICAL-1): Phase order enforcement
    // Phase order is IMMUTABLE to prevent double-processing conflicts
    // This validator ensures developers don't accidentally reorder phases
    const REQUIRED_PHASE_ORDER = ['patterns', 'properNouns', 'numbers', 'phrases', 'characters'];
    let lastPhaseIndex = -1;
    const phaseFailures = new Map(); // Track failure reasons for MEDIUM-1

    // PHASE_PRIORITIES and getSourcePriority are imported from TranslationSourcePriority.js.
    // The wrapper closes over this.activeProperNouns so callers pass only the source string.
    const getSourcePriority = (translationSource) =>
      getSourcePriorityFn(translationSource, this.activeProperNouns ?? []);

    const validatePhaseOrder = (phaseName) => {
      const currentIndex = REQUIRED_PHASE_ORDER.indexOf(phaseName);
      if (currentIndex === -1) {
        throw new Error(`Unknown phase: ${phaseName}`);
      }
      if (currentIndex <= lastPhaseIndex) {
        throw new Error(
          `Phase order violation: ${phaseName} (index ${currentIndex}) must run after ${REQUIRED_PHASE_ORDER[lastPhaseIndex]} (index ${lastPhaseIndex})`
        );
      }
      lastPhaseIndex = currentIndex;
    };

    // CODE REVIEW FIX (HIGH-1): Phase timeout protection
    // Timeout values defined in TranslationConstants.js with rationale
    const withTimeout = (promise, timeoutMs, phaseName) => {
      let timer;
      return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${phaseName} phase timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        }),
      ]);
    };

    // CODE REVIEW FIX (CRITICAL-3): Consumed token contract validation
    // Ensures phases correctly mark consumed tokens with { translated: null, translationSource: "X_consumed" }
    // Contract has two directions:
    //   (A) consumed leaders  — translationSource includes "_consumed" → translated MUST be null
    //   (B) translation leaders — translationSource set, no "_consumed" → translated MUST NOT be null
    //       (a leader with translated=null is silently skipped by postProcess, deleting characters)
    const validateConsumedTokenContract = (phaseName) => {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (!token.translationSource) {
          continue;
        }

        if (token.translationSource.includes('_consumed')) {
          // Direction A: consumed tokens MUST have translated=null (not undefined!)
          if (token.translated !== null) {
            logger.error(
              `🚨 ${phaseName} consumed token contract violation at token ${i}: ` +
                `translated="${token.translated}" (expected null), ` +
                `source="${token.translationSource}"`
            );
            // Force correct state to prevent "undefined" appearing in output
            token.translated = null;
          }
        } else {
          // Direction B: leader tokens MUST have translated !== null.
          // If a leader has translated=null, postProcess skips it and those characters
          // vanish from the output silently.
          if (token.translated === null) {
            logger.error(
              `🚨 ${phaseName} leader token contract violation at token ${i}: ` +
                `translationSource="${token.translationSource}" but translated=null ` +
                `(token value="${token.value}" — characters will be deleted from output)`
            );
            // Do not auto-correct: we don't know the right translation; log for investigation.
          }
        }
      }
    };

    // CODE REVIEW FIX (HIGH-2): Phase priority validation
    // Ensures lower-priority phases don't override higher-priority translations
    // CODE REVIEW FIX 2026-01-28 (HIGH-1): Use before/after snapshots to detect actual overwrites
    // Previous implementation logged false positives when phases correctly skipped consumed tokens
    const validatePhasePriority = (currentPhase, currentPriority, beforeSnapshot) => {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const before = beforeSnapshot[i];

        // Check if THIS PHASE modified the token
        const wasModified =
          token.translationSource !== before.translationSource ||
          token.translated !== before.translated;

        // Only validate if current phase actually modified this token
        if (wasModified && before.translationSource) {
          // Get priority of the phase that originally set this translation.
          // getSourcePriority() handles dynamic proper-noun dict names and returns null
          // for consumed sources (which are not leaders and should not be checked here).
          const sourcePriority = getSourcePriority(before.translationSource) ?? 999;

          // ERROR: Current phase overrode higher-priority phase
          if (currentPriority > sourcePriority) {
            logger.error(
              `🚨 Phase priority violation: ${currentPhase} (priority ${currentPriority}) ` +
                `OVERWROTE ${before.translationSource} (priority ${sourcePriority}) ` +
                `at token ${i}: "${token.value}" ` +
                `(was: "${before.translated}", now: "${token.translated}")`
            );
          }
        }
      }
    };

    // CODE REVIEW FIX (HIGH-3): Semantic array corruption checking
    // Check after each phase to identify which phase caused corruption.
    // corruptionToastShown prevents duplicate toasts when isCorrupted stays true across phases —
    // once set, all subsequent phase-checks still log + record alerts, but only one toast fires.
    let corruptionToastShown = false;
    const checkSemanticArrayCorruption = (phaseName) => {
      if (this.semanticArrayBuilder.isCorrupted) {
        const telemetry = this.semanticArrayBuilder.getCorruptionTelemetry();
        logger.error(`🚨 Semantic array corruption detected in ${phaseName} phase`, {
          totalCorruptions: telemetry.totalCorruptions,
          lastEvent: telemetry.corruptionEvents[telemetry.corruptionEvents.length - 1],
        });

        // Notify user about degraded translation quality — show at most once per translation.
        if (!corruptionToastShown) {
          corruptionToastShown = true;
          toast.error(
            `Translation quality degraded (${phaseName} phase). Try reloading dictionaries.`,
            { duration: 10000 }
          );
        }
      }
    };

    // NOTE (LOW-16): Timeout protection NOW IMPLEMENTED (CODE REVIEW FIX)
    // Reasoning: Phases are expected to take time for large texts (5-10s for 10K+ chars)
    // - All phases have error handling (try-catch with graceful degradation)
    // - No infinite loops (all iteration has bounds)
    // - Profiler already tracks timing for debugging
    // - Promise.race timeouts can't actually kill async work, just stop waiting
    // - Arbitrary timeout values would cause false positives on slow machines
    // If hanging is observed in production, add timeouts then (not worth complexity now)

    // Record total translation time for profiling
    await this.phaseProfiler.profile('total', async () => {
      // Phase 1: Apply patterns first (they need full context)
      // HIGH FIX: Snapshot token count before phase for corruption detection
      const tokensLengthBeforePhase1 = tokens.length;
      // Snapshot token state for priority validation — gated to debug builds
      // to avoid 5 × O(n) array allocations on every translation in production
      const tokensBeforePhase1 =
        this.debugLevel >= DEBUG_LEVELS.DEBUG
          ? tokens.map((t) => ({
              translated: t.translated,
              translationSource: t.translationSource,
            }))
          : null;
      // CODE REVIEW FIX: Validate phase order and add timeout protection
      try {
        validatePhaseOrder('patterns');
        await withTimeout(
          this.phaseProfiler.profile('patterns', async () => {
            await this.applyPatterns(tokens, { ...options, debug: true });
          }),
          PHASE_TIMEOUTS.patterns,
          'patterns'
        );
        completedPhases.add('patterns');

        // Post-phase validation — O(n) checks gated to debug builds
        if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
          validateConsumedTokenContract('patterns');
          validatePhasePriority('patterns', 1, tokensBeforePhase1);
        }
        checkSemanticArrayCorruption('patterns');
      } catch (error) {
        // CODE REVIEW FIX (MEDIUM-1): Track failure reason
        phaseFailures.set('patterns', error.message);
        // MEDIUM-8 FIX: Standardize error logging with logger.error
        logger.error('🚨 Phase 1 (Patterns) failed:', error);

        // HIGH-3 FIX: Validate token array structure and throw on corruption
        if (tokens.length !== tokensLengthBeforePhase1) {
          const errorMsg = `Phase 1 corrupted token array: ${tokensLengthBeforePhase1} → ${tokens.length} tokens`;
          logger.error(`⚠️ ${errorMsg}`);

          // Notify user with actionable recovery steps
          toast.error('Translation engine encountered a critical error. Please reload the page.', {
            duration: UI_TIMEOUTS.TOAST_DURATION_NORMAL,
          });

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to next phase (graceful degradation)
      }

      // Phase 2: Apply proper nouns globally (highest priority after patterns)
      // HIGH FIX: Snapshot token count before phase for corruption detection
      const tokensLengthBeforePhase2 = tokens.length;
      const tokensBeforePhase2 =
        this.debugLevel >= DEBUG_LEVELS.DEBUG
          ? tokens.map((t) => ({
              translated: t.translated,
              translationSource: t.translationSource,
            }))
          : null;
      try {
        validatePhaseOrder('properNouns');
        await withTimeout(
          this.phaseProfiler.profile('properNouns', async () => {
            await this.applyDictionaryTranslation(tokens, {
              ...options,
              dictionaryOrder: [...this.activeProperNouns],
              phase: 'properNouns',
            });
          }),
          PHASE_TIMEOUTS.properNouns,
          'properNouns'
        );
        completedPhases.add('properNouns');

        if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
          validateConsumedTokenContract('properNouns');
          validatePhasePriority('properNouns', 2, tokensBeforePhase2);
        }
        checkSemanticArrayCorruption('properNouns');
      } catch (error) {
        // CODE REVIEW FIX (MEDIUM-1): Track failure reason
        phaseFailures.set('properNouns', error.message);
        // MEDIUM-8 FIX: Standardize error logging with logger.error
        logger.error('🚨 Phase 2 (Proper Nouns) failed:', error);

        // HIGH-3 FIX: Validate token array structure and throw on corruption
        if (tokens.length !== tokensLengthBeforePhase2) {
          const errorMsg = `Phase 2 corrupted token array: ${tokensLengthBeforePhase2} → ${tokens.length} tokens`;
          logger.error(`⚠️ ${errorMsg}`);

          toast.error('Translation engine encountered a critical error. Please reload the page.', {
            duration: UI_TIMEOUTS.TOAST_DURATION_NORMAL,
          });

          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to next phase (graceful degradation)
      }

      // Phase 3: Apply number conversion globally (before phrases to prevent fragmentation)
      // Numbers should be processed before phrases to preserve number sequences like "六十五"
      // This prevents phrase-level matches from breaking up number tokens
      // CODE REVIEW FIX 2026-01-27: Add token count snapshot for corruption detection
      const tokensLengthBeforePhase3 = tokens.length;
      const tokensBeforePhase3 =
        this.debugLevel >= DEBUG_LEVELS.DEBUG
          ? tokens.map((t) => ({
              translated: t.translated,
              translationSource: t.translationSource,
            }))
          : null;
      try {
        validatePhaseOrder('numbers');
        // CODE REVIEW FIX (HIGH-3): Check abort signal at start of phase
        if (options.abortSignal?.aborted) {
          throw new DOMException(
            'Translation aborted during number processing phase',
            'AbortError'
          );
        }
        await withTimeout(
          this.phaseProfiler.profile('numbers', async () => {
            this.numberProcessor.processTokens(tokens, {
              debugLevel: this.debugLevel,
              semanticArrayBuilder: this.semanticArrayBuilder,
              ...options,
            });

            // Mark phase as completed
            completedPhases.add('numbers');
          }),
          PHASE_TIMEOUTS.numbers,
          'numbers'
        );

        if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
          validateConsumedTokenContract('numbers');
          validatePhasePriority('numbers', 3, tokensBeforePhase3);
        }
        checkSemanticArrayCorruption('numbers');
      } catch (error) {
        // CODE REVIEW FIX (MEDIUM-1): Track failure reason
        phaseFailures.set('numbers', error.message);
        logger.error('🚨 Phase 3 (Numbers) failed:', error);

        // CODE REVIEW FIX 2026-01-27 (CRITICAL-2): Add token corruption validation
        // Phase 3 was missing this check - now matches Phases 1-2 behavior
        if (tokens.length !== tokensLengthBeforePhase3) {
          const errorMsg = `Phase 3 corrupted token array: ${tokensLengthBeforePhase3} → ${tokens.length} tokens`;
          logger.error(`⚠️ ${errorMsg}`);

          // Notify user with actionable recovery steps
          toast.error('Translation engine encountered a critical error. Please reload the page.', {
            duration: UI_TIMEOUTS.TOAST_DURATION_NORMAL,
          });

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to next phase (graceful degradation)
      }

      // Phase 4: Apply phrases with global longest-match optimization
      // HIGH FIX: Snapshot token count before phase for corruption detection
      const tokensLengthBeforePhase4 = tokens.length;
      const tokensBeforePhase4 =
        this.debugLevel >= DEBUG_LEVELS.DEBUG
          ? tokens.map((t) => ({
              translated: t.translated,
              translationSource: t.translationSource,
            }))
          : null;
      try {
        validatePhaseOrder('phrases');
        // CODE REVIEW FIX (HIGH-3): Check abort signal at start of phase
        if (options.abortSignal?.aborted) {
          throw new DOMException(
            'Translation aborted during phrase processing phase',
            'AbortError'
          );
        }
        await withTimeout(
          this.phaseProfiler.profile('phrases', async () => {
            await this.createOptimalPhraseGroups(tokens, options);
          }),
          PHASE_TIMEOUTS.phrases,
          'phrases'
        );
        completedPhases.add('phrases');

        if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
          validateConsumedTokenContract('phrases');
          validatePhasePriority('phrases', 4, tokensBeforePhase4); // literal per CLAUDE.md — PHASE_PRIORITIES.* is fragile if keys are renamed
        }
        checkSemanticArrayCorruption('phrases');
      } catch (error) {
        // CODE REVIEW FIX (MEDIUM-1): Track failure reason
        phaseFailures.set('phrases', error.message);
        logger.error('🚨 Phase 4 (Phrases) failed:', error);

        // CODE REVIEW FIX 2026-01-27 (CRITICAL-2): Restore throwing behavior for token corruption
        // Was downgraded to warning - now restored to match Phases 1-3
        if (tokens.length !== tokensLengthBeforePhase4) {
          const errorMsg = `Phase 4 corrupted token array: ${tokensLengthBeforePhase4} → ${tokens.length} tokens`;
          logger.error(`⚠️ ${errorMsg}`);

          // Notify user with actionable recovery steps
          toast.error('Translation engine encountered a critical error. Please reload the page.', {
            duration: UI_TIMEOUTS.TOAST_DURATION_NORMAL,
          });

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to next phase (graceful degradation)
      }

      // Track which tokens have been processed to avoid re-processing
      const processedTokens = new Set();

      // Mark tokens that were already processed by patterns and proper nouns
      // CRITICAL FIX: Don't mark isPatternPartialReset as processed - allow re-processing
      // CRITICAL FIX: Grouped tokens with isPatternPartialReset should also be re-processed
      for (let i = 0; i < tokens.length; i++) {
        // Allow re-processing if isPatternPartialReset flag is set (even if grouped)
        const isPartialReset = tokens[i].isPatternPartialReset === true;

        if (
          tokens[i].translated !== null ||
          (tokens[i].isGrouped && !isPartialReset) ||
          (tokens[i].translationSource && !isPartialReset)
        ) {
          processedTokens.add(i);
        }
      }

      // Phase 5: Process remaining tokens for character-level translation (fallback)
      // HIGH FIX: Snapshot token count before phase for corruption detection
      const tokensLengthBeforePhase5 = tokens.length;
      const tokensBeforePhase5 =
        this.debugLevel >= DEBUG_LEVELS.DEBUG
          ? tokens.map((t) => ({
              translated: t.translated,
              translationSource: t.translationSource,
            }))
          : null;
      try {
        validatePhaseOrder('characters');
        // CODE REVIEW FIX (HIGH-3): Check abort signal at start of phase
        if (options.abortSignal?.aborted) {
          throw new DOMException(
            'Translation aborted during character processing phase',
            'AbortError'
          );
        }
        await withTimeout(
          this.phaseProfiler.profile('characters', async () => {
            await this.processRemainingTokensInBatches(tokens, processedTokens, options);
          }),
          PHASE_TIMEOUTS.characters,
          'characters'
        );
        completedPhases.add('characters');

        if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
          validateConsumedTokenContract('characters');
          validatePhasePriority('characters', 5, tokensBeforePhase5); // literal per CLAUDE.md — PHASE_PRIORITIES.* is fragile if keys are renamed
        }
        checkSemanticArrayCorruption('characters');
      } catch (error) {
        // CODE REVIEW FIX (MEDIUM-1): Track failure reason
        phaseFailures.set('characters', error.message);
        logger.error('🚨 Phase 5 (Characters) failed:', error);

        // CODE REVIEW FIX 2026-01-27 (CRITICAL-2): Restore throwing behavior for token corruption
        // Was downgraded to warning - now restored to match Phases 1-4
        if (tokens.length !== tokensLengthBeforePhase5) {
          const errorMsg = `Phase 5 corrupted token array: ${tokensLengthBeforePhase5} → ${tokens.length} tokens`;
          logger.error(`⚠️ ${errorMsg}`);

          // Notify user with actionable recovery steps
          toast.error('Translation engine encountered a critical error. Please reload the page.', {
            duration: UI_TIMEOUTS.TOAST_DURATION_NORMAL,
          });

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to postProcess (graceful degradation)
      }

      // Apply final fixes that need to run after all processing
      this.phaseProfiler.profileSync('postProcess', () => {
        this.fixNumberPlusLiangTranslations(tokens);
      });

      // MEDIUM-1 FIX: Enhanced phase completion logging and monitoring
      // Track which phases completed vs failed to identify silent failures
      const failedPhases = ['patterns', 'properNouns', 'numbers', 'phrases', 'characters'].filter(
        (phase) => !completedPhases.has(phase)
      );

      if (failedPhases.length > 0) {
        // Create structured failure report
        const failureReport = {
          totalPhases: REQUIRED_PHASE_ORDER.length,
          failedPhases,
          completedPhases: Array.from(completedPhases),
          failures: Object.fromEntries(phaseFailures),
          timestamp: Date.now(),
        };

        this.log(
          DEBUG_LEVELS.WARN,
          `⚠️ Translation completed with ${failedPhases.length} failed phase(s): ${failedPhases.join(', ')}`
        );

        // Log failure reasons for each failed phase
        for (const [phase, reason] of phaseFailures) {
          this.log(DEBUG_LEVELS.WARN, `  - ${phase}: ${reason}`);
        }

        this.log(
          DEBUG_LEVELS.DEBUG,
          `✅ Completed phases: ${Array.from(completedPhases).join(', ')}`
        );

        // Store on engine instance for diagnostics API
        this.lastPhaseFailures = failureReport;
      } else {
        this.log(DEBUG_LEVELS.DEBUG, '✅ All 5 phases completed successfully');

        // Clear last failure report on successful run
        this.lastPhaseFailures = null;
      }

      // CODE REVIEW FIX 2026-01-27: Final semantic array corruption check
      // Note: Per-phase checking (added above) now identifies which phase caused corruption.
      // This final check catches any corruption that occurred during postProcess or cleanup.
      if (this.semanticArrayBuilder.isCorrupted) {
        const telemetry = this.semanticArrayBuilder.getCorruptionTelemetry();
        logger.error(
          '🚨 Semantic array corruption detected after all phases (may be in postProcess)',
          {
            totalCorruptions: telemetry.totalCorruptions,
            lastEvent: telemetry.corruptionEvents[telemetry.corruptionEvents.length - 1],
          }
        );

        // Toast notification already shown by per-phase check if corruption occurred during phases
        // This catch is for postProcess corruption only
        const lastPhaseCheck = telemetry.corruptionEvents[telemetry.corruptionEvents.length - 1];
        if (!lastPhaseCheck || !lastPhaseCheck.phase) {
          toast.error('Translation quality degraded (postProcess). Try reloading dictionaries.', {
            duration: 10000,
          });
        }

        // Log telemetry for production monitoring
        if (process.env.NODE_ENV === 'production') {
          logger.warn('📊 Semantic array corruption telemetry:', telemetry);
        }
      }
    });

    const translationTime = performance.now() - startTime;
    this.log(
      DEBUG_LEVELS.VERBOSE,
      `✅ Single-pass completed: ${tokens.length} tokens in ${translationTime.toFixed(1)}ms`
    );
  }

  /**
   * Find the longest dictionary match starting at a specific position
   *
   * Integration #6: WASM Dictionary Trie (Phase 2)
   * - Tries WASM trie first for 2-4x speedup (character dictionary only)
   * - Falls back to JavaScript Map-based lookup on WASM failure
   * - Graceful degradation ensures reliability
   *
   * @param {Array} tokens - Token array
   * @param {number} position - Starting token position
   * @param {Object} dictionary - Dictionary Map object
   * @param {string} [dictionaryName] - Optional dictionary name for WASM optimization
   * @returns {Object|null} Match object with {word, translation, tokenLength, dictionary}
   */
  findLongestMatchAtPosition(tokens, position, dictionary, dictionaryName = null) {
    // JavaScript Map-based implementation (O(1) hash lookup, faster than WASM trie at current dictionary sizes)
    let bestMatch = null;
    let maxLength = 0;

    // Try matches of different lengths starting from current position
    for (let length = 1; length <= tokens.length - position && length <= 10; length++) {
      const tokenSequence = tokens.slice(position, position + length);
      const text = tokenSequence.map((t) => t.value).join('');

      // Use dictionary trie directly instead of translation manager
      const result = dictionary.get(text);
      if (result) {
        if (length > maxLength) {
          maxLength = length;
          bestMatch = {
            word: text,
            translation: result,
            dictionary: dictionaryName || 'unknown',
            tokenLength: length,
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Apply smart capitalization based on what starts each chunk
   * @param {TextChunk[]} chunks - Array of chunks to process
   */
  applySmartCapitalization(chunks) {
    if (!chunks || chunks.length === 0) return;

    // Define capitalization rules based on what starts each chunk
    const capitalizationRules = {
      start: true, // Beginning of text
      linebreak: true, // After line breaks (new paragraph)
      '.': true, // After period
      '!': true, // After exclamation
      '?': true, // After question mark
      '。': true, // Chinese period
      '．': true, // Chinese middle dot (also used as period)
      '！': true, // Chinese exclamation
      '？': true, // Chinese question mark
      ':': true, // After colon (your example shows this should capitalize)
      '：': true, // Chinese colon
      ',': false, // After comma - NO capitalization
      '，': false, // Chinese comma - NO capitalization
      ';': false, // After semicolon - NO capitalization
      '；': false, // Chinese semicolon - NO capitalization
      '[': false, // After opening bracket - NO capitalization
      ']': false, // After closing bracket - NO capitalization
      '(': false, // After opening parenthesis - NO capitalization
      ')': false, // After closing parenthesis - NO capitalization
      '…': true, // After ellipsis - YES capitalization
      '……': true, // After Chinese double ellipsis - YES capitalization
      '"': false, // After straight quote - NO capitalization (quotes mid-sentence)
      '\u201c': false, // After curly opening quote - NO capitalization (quotes mid-sentence)
      '\u201d': false, // After curly closing quote - NO capitalization
      '\u2018': false, // After curly opening apostrophe - NO capitalization (quotes mid-sentence)
      '\u2019': false, // After curly closing apostrophe - NO capitalization
      "'": false, // After straight apostrophe - NO capitalization
      '«': false, // After « (from 《) - NO capitalization
      '»': false, // After » (from 》) - NO capitalization
      '<': false, // After < (from 〈) - NO capitalization
      '>': false, // After > (from 〉) - NO capitalization
      '': false, // After no punctuation - NO capitalization
    };

    // Punctuation chars that trigger capitalization when they appear ANYWHERE inside a
    // combined multi-char startedBy sequence (e.g. WASM combines "：«" into one string).
    // Derived from capitalizationRules itself so the two can never drift apart — this used
    // to be three independently hand-copied arrays (sentenceEnders/colonMarks/ellipsisMarks)
    // that had already drifted both from each other and from capitalizationRules (the
    // fallback block further below was missing '．', found during 2026-08-29 review).
    const capitalizingPunctuation = Object.entries(capitalizationRules)
      .filter(([key, value]) => value && key !== 'start' && key !== 'linebreak')
      .map(([key]) => key);

    // Apply capitalization rules to each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk.translated) continue;

      // Check for advanced capitalization rules
      let shouldCapitalize = capitalizationRules[chunk.startedBy];

      // Handle multi-character punctuation sequences
      if (!shouldCapitalize && chunk.startedBy) {
        const matchedPunct = capitalizingPunctuation.find((punct) =>
          chunk.startedBy.includes(punct)
        );

        if (matchedPunct) {
          shouldCapitalize = true;
          this.log(
            DEBUG_LEVELS.VERBOSE,
            `📝 Multi-char punctuation capitalization: "${chunk.startedBy}" contains "${matchedPunct}"`
          );
        }
      }

      // Special handling for opening quotes
      if (!shouldCapitalize && chunk.startedBy) {
        // Check if startedBy is an opening quote
        const isOpeningQuote = QuoteProcessor.isOpeningQuote(chunk.startedBy);

        if (isOpeningQuote) {
          // For opening quotes, we need to determine if they're starting a new sentence/paragraph
          const previousChunk = i > 0 ? chunks[i - 1] : null;

          // Consider it a sentence start if:
          // 1. It's the very beginning (no previous chunk)
          // 2. Previous chunk has line breaks (new paragraph)
          // 3. It's marked as starting the text
          const isAtSentenceStart =
            !previousChunk ||
            previousChunk.lineBreaks ||
            chunk.startedBy === 'start' ||
            (previousChunk && !previousChunk.content.trim()); // Previous chunk was just whitespace

          if (isAtSentenceStart) {
            shouldCapitalize = true;
            this.log(
              DEBUG_LEVELS.VERBOSE,
              `📝 Opening quote at sentence start: "${chunk.startedBy}" triggers capitalization`
            );
          }
        }
      }

      // Fallback: WASM chunker creates a separate empty chunk for opening punctuation (e.g. '「'),
      // placing the colon/linebreak/start context in that empty chunk's startedBy rather than here.
      // If the previous chunk is empty (no content) and carries sentence-start context, inherit it.
      // Reuses capitalizingPunctuation (see above) instead of its own hand-copied punctuation
      // list — the old inline list was missing '．' and never checked ellipsis at all.
      if (!shouldCapitalize && i > 0) {
        const prevChunk = chunks[i - 1];
        if (prevChunk && !prevChunk.content.trim()) {
          const prevSBy = prevChunk.startedBy || '';
          const hasPunctCtx = capitalizingPunctuation.some((p) => prevSBy.includes(p));
          const hasStartCtx =
            prevSBy === 'linebreak' || prevSBy === 'start' || !!prevChunk.lineBreaks;
          if (hasPunctCtx || hasStartCtx) {
            shouldCapitalize = true;
          }
        }
      }

      if (shouldCapitalize) {
        // capitalizeFirstLetter is idempotent-safe: if the first letter is already
        // uppercase (or there's no letter at all, e.g. a bare converted number),
        // .toUpperCase() returns the same char and the string comes back unchanged — so
        // there's no need for a separate "is it already capitalized?" pre-check. The old
        // check compared chunk.translated.charAt(0) directly, which was wrong for any
        // chunk starting with a non-letter (a digit like NumberProcessor's "99.9%" trivially
        // passed charAt(0)===charAt(0).toUpperCase(), skipping capitalizeFirstLetter
        // entirely even when a real word followed later in the same chunk).
        const oldText = chunk.translated;
        chunk.translated = this.capitalizeFirstLetter(chunk.translated);

        this.log(
          DEBUG_LEVELS.DEBUG,
          `🔍 Capitalization check: startedBy="${chunk.startedBy}", shouldCapitalize=${shouldCapitalize}, text="${oldText}"`
        );

        if (chunk.translated !== oldText) {
          this.log(DEBUG_LEVELS.DEBUG, `📝 CAPITALIZED: "${oldText}" → "${chunk.translated}"`);
        } else {
          this.log(DEBUG_LEVELS.DEBUG, `📝 Already capitalized: "${chunk.translated}"`);
        }
      } else {
        // For non-capitalizing contexts, check if this is a proper noun and preserve its dictionary capitalization
        const isProperNoun = this.isProperNounTranslation(chunk.translated);
        if (isProperNoun) {
          // Preserve proper noun capitalization exactly as defined in dictionary
          const originalCapitalization = this.getOriginalProperNounCapitalization(chunk.translated);
          if (originalCapitalization && originalCapitalization !== chunk.translated) {
            const oldText = chunk.translated;
            chunk.translated = originalCapitalization;
            this.log(
              DEBUG_LEVELS.DEBUG,
              `🏛️ Proper noun capitalization preserved: "${oldText}" → "${chunk.translated}"`
            );
          } else {
            this.log(
              DEBUG_LEVELS.DEBUG,
              `🏛️ Proper noun already correctly capitalized: "${chunk.translated}"`
            );
          }
        } else {
          this.log(
            DEBUG_LEVELS.DEBUG,
            `📝 NOT capitalizing chunk started by "${chunk.startedBy}": "${chunk.translated}"`
          );
        }
      }
    }
  }

  /**
   * Check if a translated text is a proper noun by checking cached proper noun translations
   * @param {string} translatedText - The translated text to check
   * @returns {boolean} True if this is a proper noun translation
   */
  isProperNounTranslation(translatedText) {
    if (!translatedText || !this.properNounTranslations) return false;

    // Check if this translation exists in our cached proper noun translations
    return this.properNounTranslations.has(translatedText.toLowerCase());
  }

  /**
   * Get the original dictionary capitalization for a proper noun translation
   * @param {string} translatedText - The translated text (possibly lowercase)
   * @returns {string|null} Original capitalization from dictionary, or null if not found
   */
  getOriginalProperNounCapitalization(translatedText) {
    if (!translatedText || !this.properNounTranslations) return null;

    // Return the original capitalization from our cache
    return this.properNounTranslations.get(translatedText.toLowerCase()) || null;
  }

  /**
   * Capitalize the first letter of a string (handles Vietnamese characters)
   * @param {string} text - Text to capitalize
   * @returns {string} Text with first letter capitalized
   */
  capitalizeFirstLetter(text) {
    if (!text) return text;

    // Find the first letter, skipping any leading non-letter run (whitespace,
    // stray punctuation like a converted number's own "99.9% " prefix) — not just
    // whitespace. \p{L} (any Unicode letter) replaces the old hand-enumerated
    // Vietnamese-only char class — a strict superset, and safe: .toUpperCase() on a
    // script with no case concept (CJK) is a no-op.
    // But skip capitalizing when a digit precedes the letter (e.g. "500 năm", "99.9%
    // something") — a number attaches its unit/following word as part of the same
    // phrase, not a new sentence, so the word after it must not be force-capitalized.
    // Mirrors translateWithCharactersOnly's identical `/\d/.test(pre) ? m : ...` guard.
    const match = text.match(/^(\P{L}*)(\p{L})/u);

    if (match) {
      const prefix = match[1]; // spaces/punctuation before the letter
      const letter = match[2]; // the letter to capitalize
      const rest = text.slice(match[0].length); // rest of the text

      if (/\d/.test(prefix)) {
        return text;
      }

      return prefix + letter.toUpperCase() + rest;
    }

    return text;
  }

  /**
   * Apply final cleanup: spacing and other formatting
   *
   * EXECUTION PATH:
   *   - Called by: translateSinglePass() AFTER reconstructTextWithSegments()
   *   - Called for: ALL translated text (both Full Translation and Character-only)
   *   - Purpose: Fix spacing between Vietnamese text and numbers
   *
   * WHAT IT DOES:
   *   - Adds space between Vietnamese text and Arabic numerals (Thứ422 → Thứ 422)
   *   - Matches only letters (\p{L}) next to digits, so punctuation of any kind
   *     (formatting or sentence-ending) is never spaced away from a number
   *   - Cleans up multiple spaces
   *   - Removes spaces at line boundaries
   *
   * BUG FIX HISTORY:
   *   - 2026-02-02: Added ()/ to exclusion list to fix "(23/30)" → ":( 23 / 30 )" bug
   *   - 2026-08-29: Exclusion-list regex missed !?:; and closing quotes, so a converted
   *     number followed by punctuation got a spurious space ("2,700!" → "2,700 !").
   *     Replaced the exclusion-list approach with a \p{L}-letter match — punctuation is
   *     never a match target at all, so no punctuation mark can trigger this rule.
   *
   * @param {string} text - Text to clean up
   * @returns {string} Cleaned up text
   */
  applyFinalCleanup(text) {
    if (!text) return text;

    // Clean up spacing but preserve line breaks
    let cleanedText = text;

    // Add space between Vietnamese text and Arabic numerals (like "Thứ422giới" -> "Thứ 422 giới").
    // Matches only against letters (\p{L}), not "any non-excluded punctuation" — punctuation
    // (formatting chars like ,.-+%()/~ AND sentence punctuation like !?:;") never gets a forced
    // space next to a digit, e.g. converted-number output "2,700!" must stay "2,700!" not "2,700 !".
    cleanedText = cleanedText.replace(/(\p{L})(\d)/gu, '$1 $2');
    cleanedText = cleanedText.replace(/(\d)(\p{L})/gu, '$1 $2');

    // Clean up multiple spaces (but not across line breaks)
    cleanedText = cleanedText.replace(/[^\S\r\n]+/g, ' ');

    // Remove spaces at the beginning and end of lines
    cleanedText = cleanedText.replace(/^[ \t]+|[ \t]+$/gm, '');

    return cleanedText;
  }

  /**
   * PHASE 1: Progressive batch processing - eliminates O(n²) redundancy
   * Process only current batch chunks instead of all chunks every time
   * @param {TextChunk[]} currentBatch - Current batch of chunks to process
   * @param {TextChunk[]} allChunks - All chunks (for context like capitalization)
   * @param {number} batchStartIndex - Starting index of current batch
   */
  processBatchChunksProgressive(currentBatch, _allChunks, _batchStartIndex) {
    // Apply punctuation translation to only the current batch chunks
    this.chunkPostProcessor.translatePunctuation(currentBatch, this.punctuationDict);

    // Capitalization is handled at the final level (not per-batch)
  }

  /**
   * PHASE 2: Process batch with progressive position tracking
   * @param {TextChunk[]} currentBatch - Current batch of chunks
   * @param {TextChunk[]} allChunks - All chunks for text reconstruction
   * @param {number} batchStartIndex - Starting index of batch
   */
  async processBatchWithProgressivePositioning(currentBatch, _allChunks, _batchStartIndex) {
    try {
      // Step 1: Reconstruct just the current batch text
      const batchText = this.chunkPostProcessor.reconstructText(currentBatch);
      const cleanedBatchText = this.applyFinalCleanup(batchText);

      // Step 2: Update progressive tracker
      this.progressivePositionTracker.finalText += cleanedBatchText;
      this.progressivePositionTracker.runningTextPosition += cleanedBatchText.length;

      // Semantic arrays are accumulated by semanticArrayBuilder (no duplication needed)

      return {
        cleanedBatchText: cleanedBatchText,
        batchText: cleanedBatchText,
        cumulativeText: this.progressivePositionTracker.finalText,
      };
    } catch (error) {
      // PHASE 4: Progressive error handling - graceful degradation
      this.log(DEBUG_LEVELS.ERROR, `❌ Progressive batch processing failed: ${error.message}`);
      logger.error('Progressive positioning error:', error);

      // Fallback: Return basic batch info
      const fallbackText = this.chunkPostProcessor.reconstructText(currentBatch);
      const cleanedFallbackText = this.applyFinalCleanup(fallbackText);

      // Still update position tracker to maintain text continuity
      this.progressivePositionTracker.finalText += cleanedFallbackText;
      this.progressivePositionTracker.runningTextPosition += cleanedFallbackText.length;

      return {
        batchText: cleanedFallbackText,
        cumulativeText: this.progressivePositionTracker.finalText,
        hasError: true,
      };
    }
  }

  /**
   * Fix number + 两 (tael unit) translations
   * Converts "lưỡng" to "lượng" when 两 follows a converted number
   * @param {Token[]} tokens - Array of tokens
   */
  fixNumberPlusLiangTranslations(tokens) {
    for (let i = 0; i < tokens.length; i++) {
      const currentToken = tokens[i];

      // Check if current token is a converted number
      if (currentToken.translated && /^\d+(?:,\d{3})*$/.test(currentToken.translated)) {
        // Find the next non-consumed token after this number
        for (let j = i + 1; j < tokens.length; j++) {
          const nextToken = tokens[j];

          // Skip consumed tokens (from number conversion)
          if (nextToken.translationSource === 'number_conversion_consumed') {
            continue;
          }

          // Check if this next token is "两" translated as "lưỡng"
          if (nextToken.value === '两' && nextToken.translated === 'lưỡng') {
            this.log(
              DEBUG_LEVELS.DEBUG,
              `🔧 Converting 两 unit: "${currentToken.translated} lưỡng" -> "${currentToken.translated} lượng"`
            );

            // Update the translation from "lưỡng" to "lượng" for tael unit
            nextToken.translated = 'lượng';
            nextToken.translationSource = 'number_plus_liang_fix';
          }

          // Only check the first non-consumed token after the number
          break;
        }
      }
    }
  }

  /**
   * Check if engine is ready for translation
   * @returns {boolean} Ready state
   */
  isReady() {
    return this.isInitialized && this.dictionaryManager.isReady();
  }

  // ============================================================================
  // SECTION 16: CACHE MANAGEMENT
  // ============================================================================
  // Purpose: Targeted cache invalidation after a dictionary edit (a full invalidation is an
  //   engine rebuild — see EngineContext's reinitialize)
  // Dependencies: DictionaryManager, SemanticArrayBuilder, pattern processor caches
  // ============================================================================

  /**
   * MEDIUM-PRIORITY FIX: Targeted cache invalidation for dictionary operations
   * Invalidate only caches affected by dictionary add/update/delete operations
   *
   * Called when:
   * - Dictionary entries are added/updated/deleted
   * - Undo/redo dictionary operations
   *
   * Clears:
   * - DictionaryManager caches (character, phrase, pattern lookups)
   * - Proper noun translation cache
   * - WASM dictionary sync (re-sync specific dictionary)
   *
   * Does NOT clear (not affected by single dictionary entry changes):
   * - Semantic array builder cache (capitalization updates)
   * - Pattern processor variable cache (pattern structure unchanged)
   * - Rust lookup index cache (character dictionary only)
   * - Translation segments (position mappings)
   *
   * @param {string} dictionaryName - Dictionary that was modified
   */
  async invalidateDictionaryCaches(dictionaryName) {
    const startTime = performance.now();
    this.log(
      DEBUG_LEVELS.INFO,
      `🧹 Invalidating dictionary-specific caches for: ${dictionaryName}`
    );

    try {
      // 1. Dictionary Manager Cache (specific dictionary only)
      if (this.dictionaryManager) {
        this.dictionaryManager.invalidateCache(dictionaryName);
        this.log(
          DEBUG_LEVELS.DEBUG,
          `✅ Dictionary manager cache invalidated for ${dictionaryName}`
        );
      }

      // 2. Proper Noun Translation Cache (all proper noun translations)
      if (this.properNounTranslations) {
        this.properNounTranslations.clear();
        this.log(DEBUG_LEVELS.DEBUG, '✅ Proper noun translation cache cleared');
      }

      // 3. Re-sync specific dictionary to WASM
      if (this.dictionaryManager) {
        try {
          // The comment above this block always said "specific dictionary"; it now is one.
          await this.dictionaryManager.syncDictionariesToWasm(dictionaryName);
          this.log(DEBUG_LEVELS.DEBUG, `✅ WASM dictionary re-synced for ${dictionaryName}`);
        } catch (wasmError) {
          // Non-critical: WASM sync failure falls back to JavaScript dictionaries
          this.log(
            DEBUG_LEVELS.WARN,
            `⚠️ WASM re-sync failed (fallback to JavaScript): ${wasmError.message}`
          );
        }
      }

      const duration = performance.now() - startTime;
      this.log(DEBUG_LEVELS.INFO, `✅ Dictionary caches invalidated in ${duration.toFixed(2)}ms`);
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, '❌ Error invalidating dictionary caches:', error);
      throw error;
    }
  }
}

// ============================================================================
// SECTION 17: UTILITY METHODS & FACTORY
// ============================================================================
// Purpose: Public factory — use this, do not call `new TranslationEngine()` directly
// ============================================================================

// Factory function
export const createTranslationEngine = () => new TranslationEngine();
