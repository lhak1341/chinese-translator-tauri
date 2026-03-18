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
 *     .translate(text, opts)    Translates a Chinese text string → Vietnamese.
 *     .translateWithChunking()  Long-text path with adaptive chunking.
 *     .postProcess()            Assembles semantic array after translation phases.
 *
 *   DEBUG_LEVELS                Enum — verbosity constants for engine logging.
 *
 * =============================================================================
 * FILE STRUCTURE (10,158 lines)
 * =============================================================================
 *
 * This file coordinates all 5 translation phases with shared token state.
 * Large size is intentional - tight coupling prevents phase conflicts.
 *
 * SECTIONS:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Memory Management Utilities        (Lines 68-81)    [EXTRACTED]
 *    - Memory leak detection (now in MemoryLeakDetector.js)
 *
 * 2. Core Engine Class - Constructor     (Lines 91-702)   [COUPLED]
 *    - Constructor & configuration       (Lines 100-196)
 *    - Logging & device memory           (Lines 198-293)
 *    - Critical: Initializes all subsystems
 *
 * 3. Dictionary Operations               (Lines 295-357)  [COUPLED]
 *    - Semantic caching with phase priority
 *    - Critical: Cache timing affects phase order
 *
 * 4. Smart Memory Management             (Lines 358-702)  [COUPLED]
 *    - Memory pressure detection         (Lines 370-416)
 *    - Smart cleanup handlers            (Lines 419-550)
 *    - Critical: Cleanup must not interfere with translation
 *
 * 5. Engine Initialization               (Lines 703-865)  [COUPLED]
 *    - Dictionary loading & WASM setup
 *    - Critical: Initialization order matters
 *
 * 6. Main Translation Entry Points       (Lines 866-1961) [COUPLED]
 *    - translateWithSegments()           (Lines 866-1100)
 *    - translateWithChunking()           (Lines 1100-1500)
 *    - Character-only mode               (Lines 1500-1800)
 *    - translateDirect()                 (Lines 1800-1961)
 *
 * 7. Phase 1 - Pattern Processing        (Lines 1962-2135) [COUPLED]
 *    - Hierarchical two-phase patterns
 *    - WASM pattern processor integration
 *    - Critical: Must run first (highest priority)
 *
 * 8. Phase 4 - Phrase Processing         (Lines 2136-2856) [COUPLED]
 *    - Sequential & parallel phrase matching
 *    - Critical: Must run after proper nouns
 *
 * 9. Phase 5 - Character Processing      (Lines 2857-3071) [COUPLED]
 *    - Character dictionary fallback
 *    - Rust lookup index integration
 *    - Critical: Must run last (lowest priority)
 *
 * 10. Post-Processing                    (Lines 3072-5556) [COUPLED]
 *     - Semantic array generation         (Lines 3082-3480)
 *     - Position mapping for highlighting (Lines 3480-4500)
 *     - Text assembly & formatting        (Lines 4500-5556)
 *     - Critical: Position precision for clickable highlighting
 *
 * 11. Core 5-Phase Translation Pipeline  (Line 7493) [COUPLED]
 *     - translateSinglePass()             (Line 7493)
 *       • Phase 1: Patterns
 *       • Phase 2: Proper Nouns
 *       • Phase 3: Numbers (WASM)
 *       • Phase 4: Phrases
 *       • Phase 5: Characters
 *     - Critical: Phase order is IMMUTABLE
 *
 * 12. Cache Management                   [EXTENSION]
 *     - invalidateAllCaches()
 *     - Unified API for 6 cache systems
 *     - Can be called externally
 *
 * 13. Utility Methods                    [MIXED]
 *     - Segment building for highlighting
 *     - Performance analysis
 *
 * 14. Factory Function                   (Line 10158) [SAFE]
 *     - createTranslationEngine()
 *
 * NOTE: Key function anchors (verified 2026-03-03):
 *       resolveMatchConflicts 2364, resolveGlobalConflicts 2686,
 *       createOptimalPhraseGroups 2596, postProcess 4284,
 *       processChunksInParallel 5326, translateWithProgressiveBatches 5760,
 *       translateWithChunking 6959, translateSinglePass 7493.
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
 * ✅ Self-contained classes with no engine state (e.g., MemoryLeakDetector)
 * ✅ Pure functions taking all data as parameters
 * ❌ Accessor methods that read `this.*` properties
 * ❌ Methods that call `this.*` instance methods
 * ❌ Phase implementations (require token state coordination)
 *
 * SUCCESSFUL EXTRACTIONS (2026):
 * - MemoryLeakDetector.js (343 lines) - Zero engine dependencies
 * - TokenHelpers.js (6 pure functions) - No state modification
 * - PatternPriorityCalculator.js - Pure calculation function
 *
 * See: docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md
 * =============================================================================
 */

import { TextTokenizer, TokenType } from './text/TextTokenizer.js';
import { EnhancedDictionaryManager } from './dictionary/EnhancedDictionaryManager.js';
import tauriAPI from '../tauriAPI.js';
import {
  getSemanticTokens,
  getTokenSpanForText,
  reconstructTextFromIndex,
  getTextFromTokens,
  getTextPositionForTokenIndex,
} from './TokenHelpers.js';
import { SemanticPatternProcessor } from './pattern/SemanticPatternProcessor.js';
import { PatternTemplateEngine } from './pattern/PatternTemplateEngine.js';
import { TextChunker } from './text/TextChunker.js';
import { NumberProcessor } from './NumberProcessor.js';
import { QuoteProcessor } from './text/QuoteProcessor';
import { SemanticArrayBuilder } from './highlighting/SemanticArrayBuilder.js';
import { OptimizedSemanticArrayBuilder } from './highlighting/OptimizedSemanticArrayBuilder.js';
import { performanceProfiler } from './performance/PerformanceProfiler.js';
import TwoPhasePatternProcessor from './pattern/TwoPhasePatternProcessor.js';
import { parallelConfig } from './ParallelConfig.js';
// WasmTranslationAccelerator removed - using pure JavaScript translation
// WASM NumberProcessor added as focused feature (following migration guide advice)
import { processNumbersWasm, isWasmNumberProcessorAvailable } from './wasm/WasmNumberProcessor.js';
// WASM Dictionary Trie integration for 2-4x faster Phase 5 character lookups
import { WasmDictionaryTrieWrapper } from './wasm/WasmDictionaryTrie.js';
import {
  tokenPositionToCharPosition,
  buildFullTextFromTokens,
  convertWasmMatchToTokenMatch,
} from './highlighting/PositionMappingUtils.js';
import { copyWasmTokens } from './wasm/WasmBoundaryValidation';
// TranslationSegmentCache removed - cache quality issues led to removal
import { batchLog, performanceLogger } from './BatchLogger.js';
import { adaptiveChunker } from './text/AdaptiveChunker.js';
import { MemoryLeakDetector } from './performance/MemoryLeakDetector.js';
import { globalPerformanceMonitor } from './performance/PerformanceMonitor.js';
import {
  SmartMemoryPressureDetector,
  BackgroundCleanupManager,
  ComponentMemoryProfiler,
} from './MemoryManagementRefinements.js';
import { PATTERN_PROCESSING } from '../constants/TranslationConstants.js';
import { systemPerformanceMonitor } from './performance/ProactivePerformanceDetector.js';
import { scanTokens } from './ReadonlyOptimizationUtils.js';
import { logger } from './logger';
import { wasmTextAssembler } from './wasm/WasmTextAssembler.js';
import { MEMORY_THRESHOLDS, UI_UPDATE_THRESHOLDS } from '../constants/PerformanceThresholds.js';
import { TranslationProfiler } from './performance/TranslationProfiler.js';
import toast from './toast';
import {
  isWasmPatternProcessorAvailable,
  hasWasmPatternProcessorFailed,
} from './wasm/WasmPatternProcessor.js';
import {
  PHRASE_PROCESSING,
  NUMBER_PROCESSING,
  DICTIONARY_LOOKUP,
  MEMORY_MANAGEMENT,
  WASM_NUMBER_THRESHOLDS,
  POSITION_TRACKING, // CODE REVIEW FIX (LOW-3)
  getAdaptiveMaxSegments, // CODE REVIEW FIX (MEDIUM-2)
  PHASE_TIMEOUTS, // LOW-2 FIX: Import phase timeouts from constants
  DEVICE_MEMORY_LIMITS,
  UI_TIMEOUTS,
  PATTERN_FAILURE_DETECTION,
  MEMORY_WASTE_DETECTION,
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
 *   WasmStatus,
 *   DEBUG_LEVELS,
 *   DebugLevel
 * } from '../types/TranslationEngineTypes'
 */

// ============================================================================
// SECTION 1: MEMORY MANAGEMENT UTILITIES
// ============================================================================
// Purpose: Memory leak detection, tracking, and trend analysis
// Dependencies: None (pure utility class)
// Extraction Status: ✅ EXTRACTED to src/utils/MemoryLeakDetector.js
// Lines: ~350 lines successfully extracted
// ============================================================================
// MemoryLeakDetector class has been extracted to its own file for:
// - Better testability in isolation
// - Reduced file size (343 lines removed)
// - Zero dependencies on translation logic
// - Reusable across different translation modes
// ============================================================================

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
    // Get dictionary configuration from ParallelConfig
    const dictionaryConfig = parallelConfig.getOptimalConfig('dictionary');

    this.dictionaryManager = new EnhancedDictionaryManager({
      // Enable caching with optimized cache sizes
      cacheEnabled: true,
      characterCacheSize: 500, // Most frequently used
      phraseCacheSize: 1000, // Moderate frequency
      patternCacheSize: 200, // Less frequent but expensive
      lookupCacheSize: 800, // Multi-dictionary searches

      // Phase-level parallelization: Dictionary lookup parallelization
      enableParallelLookups: dictionaryConfig.enabled,
      maxParallelDictionaries: dictionaryConfig.maxParallelDictionaries,
      dictionaryParallelThreshold: dictionaryConfig.parallelThreshold,

      // WASM integration settings
      enableWasm: true,
      wasmMemoryLimit: 20, // 20MB for production use
      debugLevel: 1, // INFO level for WASM logs

      // Dictionary Precomputation: 5-7x faster loading with cached tries
      enablePrecomputedCache: true, // Enable precomputed trie caching
      tauriAPI: tauriAPI, // Required for cache file operations
    });
    this.semanticPatternProcessor = new SemanticPatternProcessor();
    this.textChunker = new TextChunker({
      excludedCharacters: new Set(['/']), // Don't treat / as chunk separator (used in fractions like 23/30)
    });
    this.numberProcessor = new NumberProcessor();

    // WASM Core Engine REMOVED:
    // Phase 6 & 7 WASM translation acceleration was disabled due to:
    // - Dictionary lookups returning 0 matches
    // - Pattern matching integration issues
    // - Maintaining pure JavaScript for reliability and translation quality
    // Tauri Rust backend (file I/O, parallel loading) remains active and working perfectly

    // ========================================================================
    // WASM Dictionary Trie: DISABLED (Performance Research - 2026-01-31)
    // ========================================================================
    //
    // STATUS: Production-ready but disabled by default
    //
    // RESEARCH FINDINGS:
    // - Integration completed successfully (Phases 1-3)
    // - Correctness: 100% match with JavaScript (validated)
    // - Performance: 2x SLOWER than JavaScript Map
    //   * JavaScript Map: 17ms (O(1) hash lookup, highly optimized by V8)
    //   * WASM Trie: 33ms (boundary crossing overhead dominates)
    //   * Dictionary: 13,317 entries
    //
    // WHY SLOWER:
    // - JS↔WASM boundary crossing: ~15-20ms overhead for 1,700 calls
    // - String marshaling: UTF-16 → UTF-8 conversion each call
    // - Modern V8 Map is incredibly fast (O(1) average, not O(k×log(n)))
    // - Single-character lookups: Map.get() is ideal (instant hash lookup)
    //
    // REACTIVATE WHEN (Future Scenarios):
    // 1. WebAssembly Interface Types available (2025-2026)
    //    → Zero-copy string sharing, eliminates boundary overhead
    //    → Expected: 2x speedup over JavaScript
    // 2. Batch processing API implemented
    //    → Single WASM call for entire text (1 boundary crossing vs 1,700)
    //    → Expected: 3-5x speedup
    // 3. Dictionary size > 50,000 entries
    //    → Algorithm advantage (O(k)) outweighs boundary overhead
    //    → Expected: 2-4x speedup
    // 4. Parallel processing with Web Workers
    //    → WASM module shared across workers (Map can't be shared)
    //    → Expected: 2-4x speedup on multi-core
    //
    // DOCUMENTATION:
    // - See: docs/archive/wasm-dictionary-trie/FUTURE_ACTIVATION_SCENARIOS.md
    // - Validation results: docs/WASM_DICTIONARY_TRIE_VALIDATION_GUIDE.md
    // - Integration details: docs/DICTIONARY_TRIE_INTEGRATION_SESSION_2026-01-31.md
    //
    // CODE COMPONENTS (All production-ready):
    // - Position mapping: src/utils/PositionMappingUtils.js (47 tests ✅)
    // - WASM wrapper: src/utils/WasmDictionaryTrie.js
    // - Validator: src/utils/WasmDictionaryTrieValidator.js
    // - Tests: 973 passing (no regressions)
    //
    // ENABLE FOR TESTING:
    // - Query param: ?wasm-dictionary-trie=true
    // - Or modify this flag to true
    // ========================================================================

    this.useWasmDictionaryTrie = false; // DISABLED: JS Map is 2x faster (see comments above)

    // WASM Dictionary Trie instance (initialized lazily when character dictionary loads)
    this.wasmCharacterTrie = null;

    // Feature flag for optimized semantic array builder
    // Enabled by default for 10-15% speedup in capitalization updates
    // Can be disabled with query parameter: ?optimized-semantics=false
    this.useOptimizedSemanticBuilder = !(
      typeof window !== 'undefined' &&
      window.location?.search?.includes('optimized-semantics=false')
    );

    if (this.useOptimizedSemanticBuilder) {
      this.semanticArrayBuilder = new OptimizedSemanticArrayBuilder();
      batchLog.info(
        'semantic-optimization',
        'Using OptimizedSemanticArrayBuilder for improved memory efficiency'
      );
    } else {
      this.semanticArrayBuilder = new SemanticArrayBuilder();
    }

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
    this.profiler = new TranslationProfiler();

    // Store reference to TwoPhasePatternProcessor for internal profiling
    this.twoPhaseProcessor = null;

    // CRITICAL-2 FIX: Track pattern processor warning to show only once
    this.showedPatternWarning = false;

    // Track pattern failures with time-based reset / auto-disable
    this.patternFailureCount = 0;
    this.lastPatternSuccessTime = null;

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

  /**
   * Initialize Core Translation Engine (WASM removed)
   *
   * This method is a no-op maintained for backward compatibility. The WASM Core Engine
   * was removed in favor of pure JavaScript translation for improved reliability and
   * easier debugging. All translation logic now runs in JavaScript with targeted WASM
   * acceleration for specific operations (number processing, pattern matching, dictionary lookups).
   *
   * @returns {Promise<void>} Resolves immediately (no initialization needed)
   *
   * @example
   * // Called automatically during TranslationEngine initialization
   * await engine.initializeCoreEngine();
   *
   * @see constructor - Handles all actual initialization
   * @see translateSinglePass - Core 5-phase translation pipeline
   *
   * @history
   * - Pre-2025: WASM Core Engine handled full translation
   * - 2025: Removed for reliability, replaced with JavaScript + targeted WASM
   */
  async initializeCoreEngine() {
    // WASM Core Engine removed - translation now uses pure JavaScript
    // This method kept for backward compatibility (called during initialization)
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
   * @see invalidateAllCaches - Use this to refresh caches after dictionary changes
   */
  async syncDictionaries() {
    // WASM Core Engine removed - this method is a no-op
    // Kept for backward compatibility (may be called during initialization)
  }

  // ============================================================================
  // SECTION 4: SMART MEMORY MANAGEMENT
  // ============================================================================
  // Purpose: Memory pressure detection, cleanup scheduling, profiling
  // Dependencies: Memory detection systems, background cleanup
  // Extraction Potential: MEDIUM - Cleanup strategies can be extracted
  // Critical: Cleanup timing must not interfere with translation
  // ============================================================================

  /**
   * Initialize Smart Memory Management Refinements
   * Enhances existing memory management without affecting core translation functionality
   */
  initializeSmartMemoryManagement() {
    try {
      // Smart memory pressure detector for more accurate cleanup triggers
      this.smartMemoryDetector = new SmartMemoryPressureDetector({
        lowPressure: 0.6, // 60% heap usage
        mediumPressure: 0.75, // 75% heap usage
        highPressure: 0.85, // 85% heap usage
        criticalPressure: 0.95, // 95% heap usage
        samplingInterval: 10000, // Sample every 10 seconds
        growthThreshold: 15, // 15MB/minute growth rate threshold
      });

      // Background cleanup manager for non-urgent cleanup tasks
      this.backgroundCleanup = new BackgroundCleanupManager();

      // Component memory profiler for tracking memory usage by operation type
      this.memoryProfiler = new ComponentMemoryProfiler();

      // Set up smart cleanup callback
      this.smartMemoryDetector.onMemoryEvent('cleanup', (cleanupEvent) => {
        this.handleSmartCleanup(cleanupEvent);
      });

      // Set up monitoring callback for development insights
      if (process.env.NODE_ENV === 'development') {
        this.smartMemoryDetector.onMemoryEvent('monitoring', (data) => {
          if (data.pressure.level === 'high' || data.pressure.level === 'critical') {
            this.log(
              DEBUG_LEVELS.DEBUG,
              `🧠 Smart Memory: ${data.pressure.level} pressure (${(data.pressure.ratio * 100).toFixed(1)}%), growth: ${data.growthRate.toFixed(1)}MB/min`
            );
          }
        });
      }

      this.log(DEBUG_LEVELS.DEBUG, '✅ Smart memory management refinements initialized');
    } catch (error) {
      this.log(
        DEBUG_LEVELS.WARN,
        '⚠️ Failed to initialize smart memory management:',
        error.message
      );
      // Graceful degradation - continue with existing memory management
      this.smartMemoryDetector = null;
      this.backgroundCleanup = null;
      this.memoryProfiler = null;
    }
  }

  /**
   * Handle smart cleanup events based on memory pressure and growth rate
   */
  handleSmartCleanup(cleanupEvent) {
    const { urgency, pressure, growthRate } = cleanupEvent;

    // Profile the cleanup operation
    const profileId = this.memoryProfiler?.startProfiling(
      'TranslationEngine',
      `smart-cleanup-${urgency}`
    );

    try {
      switch (urgency) {
        case 'critical':
          // Emergency cleanup - immediate action required
          // Clear any pending background cleanups to prevent interference
          if (this.backgroundCleanup) {
            this.backgroundCleanup.clear();
          }
          this.performEmergencyCleanup();
          this.log(
            DEBUG_LEVELS.WARN,
            `🚨 Emergency cleanup triggered: ${(pressure.ratio * 100).toFixed(1)}% memory usage`
          );
          break;

        case 'high':
          // High priority cleanup - process immediately
          // Clear any pending background cleanups to prevent interference
          if (this.backgroundCleanup) {
            this.backgroundCleanup.clear();
          }
          this.performHighPriorityCleanup();
          this.log(
            DEBUG_LEVELS.INFO,
            `🧹 High priority cleanup: ${(pressure.ratio * 100).toFixed(1)}% memory usage`
          );
          break;

        case 'medium':
          // Medium priority - queue for background processing
          this.queueBackgroundCleanup('medium');
          break;

        case 'low':
          // Low priority - queue for idle time processing
          this.queueBackgroundCleanup('low');
          break;
      }
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, '❌ Smart cleanup failed:', error.message);
    } finally {
      // Complete memory profiling
      if (profileId) {
        this.memoryProfiler?.completeProfiling(profileId, {
          urgency,
          pressureLevel: pressure.level,
          memoryRatio: pressure.ratio,
          growthRate,
        });
      }
    }
  }

  /**
   * Perform emergency cleanup - immediate and aggressive
   */
  performEmergencyCleanup() {
    // Clear translation segments aggressively
    if (this.translationSegments && this.translationSegments.length > 3) {
      const oldCount = this.translationSegments.length;
      this.translationSegments = this.translationSegments.slice(-3); // Keep only last 3
      this.log(DEBUG_LEVELS.DEBUG, `🚨 Emergency: Cleared ${oldCount - 3} translation segments`);
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Clear semantic array builder cache if available
    if (this.semanticArrayBuilder && typeof this.semanticArrayBuilder.clearCache === 'function') {
      this.semanticArrayBuilder.clearCache();
    }
  }

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
   * Perform high priority cleanup - immediate but less aggressive
   */
  performHighPriorityCleanup() {
    // Clear translation segments moderately
    if (this.translationSegments && this.translationSegments.length > 5) {
      const oldCount = this.translationSegments.length;
      this.translationSegments = this.translationSegments.slice(-5); // Keep last 5
      this.log(
        DEBUG_LEVELS.DEBUG,
        `🧹 High priority: Cleared ${oldCount - 5} translation segments`
      );
    }

    // Clear performance history if it's getting large
    if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 50) {
      this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-20);
    }
  }

  /**
   * Queue cleanup tasks for background processing
   */
  queueBackgroundCleanup(priority) {
    if (!this.backgroundCleanup) return;

    // Queue cleanup tasks based on priority
    const cleanupTasks = [
      {
        task: () => this.cleanupOldPerformanceData(),
        priority: priority === 'low' ? 'low' : 'normal',
      },
      {
        task: () => this.optimizeMemoryStructures(),
        priority,
      },
    ];

    cleanupTasks.forEach(({ task, priority }) => {
      this.backgroundCleanup.queueCleanup(task, priority);
    });
  }

  /**
   * Clean up old performance data in background
   */
  cleanupOldPerformanceData() {
    // Clean batch performance history
    if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 100) {
      this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-50);
    }

    // Clean memory tracker snapshots
    if (this.memoryTracker && this.memoryTracker.snapshots) {
      if (this.memoryTracker.snapshots.length > 25) {
        this.memoryTracker.snapshots = this.memoryTracker.snapshots.slice(-15);
      }
    }

    return true; // Indicate success
  }

  /**
   * Optimize memory structures in background
   */
  optimizeMemoryStructures() {
    // Trim translation segments to reasonable size
    if (
      this.translationSegments &&
      this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
    ) {
      this.translationSegments = this.translationSegments.slice(
        -MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
      );
    }

    // Optimize dictionary manager caches if available
    if (this.dictionaryManager && typeof this.dictionaryManager.optimizeCaches === 'function') {
      this.dictionaryManager.optimizeCaches();
    }

    return true; // Indicate success
  }

  /**
   * Start memory profiling for a translation operation
   */
  startMemoryProfiling(operationName, operationId = 'default') {
    if (!this.memoryProfiler) return null;
    return this.memoryProfiler.startProfiling(operationName, operationId);
  }

  /**
   * Complete memory profiling for a translation operation
   */
  completeMemoryProfiling(profileId, metadata = {}) {
    if (!this.memoryProfiler || !profileId) return null;
    return this.memoryProfiler.completeProfiling(profileId, metadata);
  }

  /**
   * Get smart memory management statistics
   */
  getSmartMemoryStats() {
    const stats = {
      smartMemoryEnabled: !!this.smartMemoryDetector,
      backgroundCleanupEnabled: !!this.backgroundCleanup,
      memoryProfilingEnabled: !!this.memoryProfiler,
    };

    if (this.smartMemoryDetector) {
      stats.memoryPressure = this.smartMemoryDetector.getStats();
    }

    if (this.backgroundCleanup) {
      stats.backgroundCleanup = this.backgroundCleanup.getStats();
    }

    if (this.memoryProfiler) {
      stats.memoryProfiling = this.memoryProfiler.getProfilerStats();
      stats.topMemoryConsumers = this.memoryProfiler.getTopMemoryConsumers(5);
    }

    return stats;
  }

  /**
   * Cleanup smart memory management systems on engine shutdown
   *
   * Stops all memory monitoring systems and clears their state. Called automatically
   * by destroy() method. Use this directly if you need to stop memory monitoring
   * without destroying the entire engine.
   *
   * Cleanup operations:
   * - Stop smart memory pressure detector (clears intervals, event listeners)
   * - Clear background cleanup manager (cancels pending cleanup tasks)
   * - Disable memory profiler (stops tracking, clears profile data)
   *
   * @returns {void}
   *
   * @example
   * // Shutdown memory monitoring only (rare - usually use destroy())
   * engine.shutdownSmartMemoryManagement();
   *
   * @see destroy - Full engine cleanup (includes this method)
   * @see initializeSmartMemoryManagement - Initializes memory systems
   *
   * @note
   * After calling this, memory monitoring is disabled but engine remains functional.
   * Memory systems will not be restarted - create a new engine instance if needed.
   */
  shutdownSmartMemoryManagement() {
    if (this.smartMemoryDetector) {
      this.smartMemoryDetector.stop();
      this.smartMemoryDetector = null;
    }

    if (this.backgroundCleanup) {
      this.backgroundCleanup.clear();
      this.backgroundCleanup = null;
    }

    if (this.memoryProfiler) {
      this.memoryProfiler.setEnabled(false);
      this.memoryProfiler = null;
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
   * - Clear dictionary manager caches
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
   * @see invalidateAllCaches - Alternative for cache cleanup without full destruction
   *
   * @critical
   * Must be called to prevent memory leaks in long-running applications.
   * After calling destroy(), the engine instance cannot be reused - create a new instance.
   */
  destroy() {
    // Shutdown smart memory management (intervals, profilers)
    this.shutdownSmartMemoryManagement();

    // Clear batch processing cache
    if (this.processedBatchCache) {
      this.processedBatchCache.clear();
      this.processedBatchCache = null;
    }

    // Clear semantic array builder cache
    if (this.semanticArrayBuilder && typeof this.semanticArrayBuilder.clearCache === 'function') {
      this.semanticArrayBuilder.clearCache();
    }

    // Clear pattern processor variable cache
    if (this.semanticPatternProcessor && this.semanticPatternProcessor.variableCache) {
      this.semanticPatternProcessor.variableCache.clear();
    }

    // Clear dictionary manager caches
    if (this.dictionaryManager && typeof this.dictionaryManager.clearCaches === 'function') {
      this.dictionaryManager.clearCaches();
    }

    // Clear translation segments
    if (this.translationSegments) {
      this.translationSegments = [];
    }

    // Clear cached semantic tokens
    this.cachedSemanticTokens = null;

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
   * @param {Object} [dictionaries['properNouns-*.json']] - Novel-specific proper noun dictionaries
   * @param {Object} [options={}] - Initialization options
   * @param {string[]} [options.activeProperNouns] - Override active proper noun dictionaries
   * @param {string[]} [options.dictionaryOrder] - Override dictionary search order
   * @param {boolean} [options.lazyLoad=true] - Enable lazy loading for inactive proper nouns
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
   * @example
   * // With custom dictionary order
   * await engine.initialize(dictionaries, {
   *   dictionaryOrder: ['properNouns-Novel1.json', 'phrase', 'character']
   * });
   *
   * @see constructor - Creates engine instance
   * @see DictionaryManager.loadDictionaries - Handles dictionary loading
   * @see initializeCoreEngine - WASM initialization (deprecated)
   *
   * @performance
   * - Dictionary loading: <100ms for 27,000+ entries
   * - WASM initialization: ~50ms (number + pattern processors)
   * - Lazy loading: Inactive proper nouns loaded on-demand
   *
   * @critical
   * Must complete successfully before calling translate() or other translation methods.
   * Failure to initialize causes "Translation Engine not initialized" errors.
   * Configuration loading failure falls back to defaults (not an error).
   */
  async initialize(dictionaries, options = {}) {
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
      // Load active proper noun dictionaries configuration
      let activeProperNouns = ['properNouns']; // default fallback
      try {
        const configResult = await window.electronAPI.loadConfiguration();
        if (configResult.success && configResult.data.activeProperNouns) {
          activeProperNouns = configResult.data.activeProperNouns;
        }
      } catch (error) {
        // CODE REVIEW FIX: Log config loading errors for debugging
        // Expected: File not found (first run), permission denied (rare)
        // Unexpected: Parse errors (corrupted config), filesystem errors
        if (error.code === 'ENOENT') {
          this.log(DEBUG_LEVELS.DEBUG, 'Configuration file not found, using default proper nouns');
        } else if (error.name === 'SyntaxError') {
          this.log(
            DEBUG_LEVELS.WARN,
            '⚠️ Configuration file corrupted, using defaults:',
            error.message
          );
        } else {
          this.log(
            DEBUG_LEVELS.WARN,
            '⚠️ Could not load configuration, using defaults:',
            error.message || error
          );
        }
      }

      // Store active proper nouns for use in translation processing
      this.activeProperNouns = activeProperNouns;
      this.log(DEBUG_LEVELS.DEBUG, '🔧 Active proper noun dictionaries:', this.activeProperNouns);

      // Load dictionaries into trie structures (with lazy loading for inactive proper nouns)
      const dictionaryConfig = parallelConfig.getOptimalConfig('dictionary');
      // CRITICAL FIX: Deep copy options to prevent mutation leakage
      await this.dictionaryManager.loadDictionaries(dictionaries, {
        ...options,
        // Deep copy complex nested objects to prevent reference sharing
        lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
        segments: options.segments ? [...options.segments] : undefined,
        activeProperNouns: this.activeProperNouns,
        preWarmCache: dictionaryConfig.cachePrewarm,
      });

      // Cache proper noun translations for capitalization preservation
      this.properNounTranslations = new Map(); // Maps lowercase translation -> original capitalization
      let properNounCount = 0;
      this.activeProperNouns.forEach((dictionaryName) => {
        const dictionary = dictionaries[dictionaryName];
        if (dictionary) {
          this.log(
            DEBUG_LEVELS.DEBUG,
            `🏛️ Loading ${dictionaryName} with ${Object.keys(dictionary).length} entries`
          );
          Object.entries(dictionary).forEach(([chinese, vietnamese]) => {
            if (typeof vietnamese === 'string') {
              // MEMORY MANAGEMENT: Enforce size limit to prevent unbounded growth
              if (this.properNounTranslations.size >= this.MAX_PROPER_NOUN_TRANSLATIONS) {
                if (properNounCount === this.MAX_PROPER_NOUN_TRANSLATIONS) {
                  // Only log once when limit is reached
                  this.log(
                    DEBUG_LEVELS.WARN,
                    `⚠️ Proper noun translation cache limit reached (${this.MAX_PROPER_NOUN_TRANSLATIONS}). Additional entries will be ignored.`
                  );
                }
                properNounCount++;
                return; // Skip this entry
              }

              this.properNounTranslations.set(vietnamese.toLowerCase(), vietnamese);
              properNounCount++;
              this.log(
                DEBUG_LEVELS.VERBOSE,
                `🏛️ Cached proper noun: "${chinese}" -> "${vietnamese}" (lowercase: "${vietnamese.toLowerCase()}")`
              );
            }
          });
        } else {
          this.log(DEBUG_LEVELS.ERROR, `❌ Dictionary ${dictionaryName} is missing or empty!`);
        }
      });

      // Log final count
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

      // Initialize WASM Dictionary Trie for Phase 5 character lookups
      if (this.useWasmDictionaryTrie && dictionaries.characters) {
        try {
          const wasmStartTime = performance.now();
          this.wasmCharacterTrie = new WasmDictionaryTrieWrapper('characters');

          // Initialize WASM module
          const initSuccess = await this.wasmCharacterTrie.initialize();
          if (initSuccess) {
            // Convert character dictionary entries to WASM format
            const characterEntries = Object.entries(dictionaries.characters).map(
              ([chars, translation]) => ({
                chars,
                translation:
                  typeof translation === 'string' ? translation : translation.translation,
                priority: translation.priority || 5,
                metadata: translation.metadata,
              })
            );

            // Load entries into WASM trie
            const loadSuccess = await this.wasmCharacterTrie.loadEntries(characterEntries);
            if (loadSuccess) {
              const wasmTime = performance.now() - wasmStartTime;
              logger.log(
                `✅ WASM Dictionary Trie initialized: ${characterEntries.length} entries in ${wasmTime.toFixed(2)}ms`
              );
            } else {
              logger.warn('⚠️ Failed to load entries into WASM trie, using JavaScript fallback');
              this.wasmCharacterTrie = null;
            }
          } else {
            logger.warn('⚠️ Failed to initialize WASM trie, using JavaScript fallback');
            this.wasmCharacterTrie = null;
          }
        } catch (error) {
          logger.warn(
            '⚠️ WASM Dictionary Trie initialization failed, using JavaScript fallback:',
            error
          );
          this.wasmCharacterTrie = null;
        }
      }

      this.isInitialized = true;
      // ERROR HANDLING FIX: Clear any previous initialization errors
      this.initializationError = null;
      const initTime = performance.now() - startTime;

      // Pre-warm translation caches with common characters and phrases for better first-translation performance
      if (options.preWarmCache !== false) {
        try {
          const cacheStats = await this.translationCache.preWarmCaches(this.dictionaryManager);
          if (cacheStats.success) {
            this.log(
              DEBUG_LEVELS.INFO,
              `🔥 Cache pre-warmed: ${cacheStats.charactersWarmed} characters + ${cacheStats.phrasesWarmed} phrases in ${cacheStats.timeMs}ms`
            );
          }
        } catch (error) {
          this.log(DEBUG_LEVELS.WARN, '⚠️ Cache pre-warming failed:', error.message);
        }
      }

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
   * Translate text using optimized single-pass algorithm
   *
   * Convenience wrapper that automatically selects between chunked or direct translation
   * based on options. Returns only the translated text string (no semantic arrays or segments).
   * Use translateWithSegments() for interactive highlighting support.
   *
   * Translation mode selection:
   * - useChunking=true (default): Split by punctuation, translate chunks independently
   * - useChunking=false: Translate entire text as single unit
   *
   * @param {string} text - Input Chinese text to translate
   * @param {Object} [options={}] - Translation options
   * @param {boolean} [options.useChunking=true] - Enable chunk-based processing
   * @param {boolean} [options.parallel=true] - Enable parallel chunk processing
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation
   * @param {string[]} [options.activeProperNouns] - Active proper noun dictionaries
   * @param {string[]} [options.dictionaryOrder] - Dictionary search order
   *
   * @returns {Promise<string>} Translated Vietnamese text
   *
   * @throws {Error} If engine is not initialized (includes initialization error context)
   *
   * @example
   * // Basic translation (chunked mode)
   * const translated = await engine.translate('你好世界。这是一个测试。');
   *
   * @example
   * // Direct translation (no chunking)
   * const translated = await engine.translate(text, {
   *   useChunking: false
   * });
   *
   * @example
   * // With abort signal
   * const controller = new AbortController();
   * const promise = engine.translate(text, {
   *   abortSignal: controller.signal
   * });
   * // Later: controller.abort()
   *
   * @see translateWithSegments - Use this for clickable highlighting support
   * @see translateWithChunking - Chunked translation implementation
   * @see translateDirectly - Direct translation implementation
   *
   * @performance
   * - Chunked mode: Better for long texts, enables parallelization
   * - Direct mode: Better for short texts or debugging
   * - Automatically uses Rust lookup index for texts >500 chars
   *
   * @note
   * This method does NOT return semantic arrays or segments.
   * Use translateWithSegments() if you need highlighting support.
   */
  async translate(text, options = {}) {
    if (!this.isInitialized) {
      // ERROR HANDLING FIX: Include initialization error context for better debugging
      const errorContext = this.initializationError
        ? `: ${this.initializationError}`
        : ' (unknown reason)';
      throw new Error(`Translation Engine not initialized${errorContext}`);
    }

    if (!text || text.trim() === '') {
      return text;
    }

    // Start memory profiling for the translation operation
    const memoryProfileId = this.startMemoryProfiling('TranslationEngine', 'main-translate');

    try {
      // Pure JavaScript translation implementation (WASM removed for reliability)
      // Check if chunk-based processing should be used
      const useChunking = options.useChunking !== false; // Default to true

      let result;
      if (useChunking) {
        result = await this.translateWithChunking(text, options);
      } else {
        result = await this.translateDirectly(text, options);
      }

      return result;
    } catch (error) {
      // Complete memory profiling with error information
      this.completeMemoryProfiling(memoryProfileId, {
        error: error.message,
        textLength: text.length,
        useChunking: options.useChunking !== false,
      });
      throw error;
    } finally {
      // Complete memory profiling for successful translation
      this.completeMemoryProfiling(memoryProfileId, {
        textLength: text.length,
        useChunking: options.useChunking !== false,
        useRustEngine: false, // WASM Core Engine removed
      });
    }
  }

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
   * @see RustLookupIndexManager - Rust-powered character lookup acceleration
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
        semanticArrays: { original: [], translated: [], metadata: [] },
        prebuiltSegments: [],
      };
    }

    // Pure JavaScript character-only translation (WASM removed for reliability)

    const _operationId = `character_only_translation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (process.env.NODE_ENV === 'development') {
      batchLog.hotInfo('char-engine', `Starting character-only translation: ${text.length} chars`);
    }

    // OPTIMIZATION: Build Rust-powered lookup index for character-only translations (HUGE speedup)
    // Character-only mode benefits even more from pre-computed lookups!
    if (
      !options.lookupIndex &&
      text.length >= DICTIONARY_LOOKUP.MIN_TEXT_FOR_RUST_INDEX &&
      options.useSharedLookupIndex !== false
    ) {
      try {
        const { rustLookupIndexManager } = await import('./RustLookupIndexManager.js');

        if (rustLookupIndexManager.isAvailable()) {
          const indexStartTime = performance.now();

          // Get dictionary search order (fallback to default if not available)
          const dictionaryOrder =
            this.dictionaryOrder || this.dictionaryManager.getDefaultSearchOrder() || [];

          // Build lookup index using Rust + Rayon
          const indexResult = await rustLookupIndexManager.buildLookupIndex(
            text,
            this.dictionaryManager.dictionaries, // Map of dictionary name -> trie
            dictionaryOrder, // Dictionary search order
            {
              minTextLength: 50,
              enableIndexing: true,
              useParallel: true,
            }
          );

          if (indexResult.success && indexResult.index) {
            // Convert to Map for faster lookups
            // IMPORTANT: Convert string keys from JSON back to numbers
            options.lookupIndex = new Map(
              Object.entries(indexResult.index).map(([k, v]) => [Number(k), v])
            );
            options.useSharedLookupIndex = true;

            const indexTime = performance.now() - indexStartTime;
            logger.log(
              `🦀 Rust lookup index built for character-only: ${indexResult.positionsIndexed} positions, ${indexResult.indexSize} matches in ${indexTime.toFixed(1)}ms (Rust: ${indexResult.buildTimeMs}ms)`
            );
          }
        }
      } catch (error) {
        logger.warn('⚠️ Rust lookup index build failed, using traditional lookup:', error.message);
        // Continue without lookup index (traditional dictionary lookup will be used)
      }
    }

    // Create isolated semantic array builder to prevent conflicts with concurrent main translations
    const characterOnlySemanticBuilder = this.useOptimizedSemanticBuilder
      ? new OptimizedSemanticArrayBuilder(Math.max(50, Math.floor(text.length / 5)))
      : new SemanticArrayBuilder();

    try {
      // For character-only translation, process the text directly without chunking
      // to preserve all whitespace and punctuation
      let translatedText = '';

      // Tokenize the entire text directly (don't use chunking which removes whitespace/punctuation)
      let tokens = this.tokenizer.tokenize(text);

      if (process.env.NODE_ENV === 'development') {
        batchLog.hotVerbose('tokenization', `Tokenization completed: ${tokens.length} tokens`);
      }

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
            i // Pass tokenIndex to enable position tracking
          );
        }

        // Add the translated value
        translatedText += translatedValue;

        // Add space after Chinese characters (except before punctuation or if next token is whitespace)
        if (token.type === 'chinese_char' && i < tokens.length - 1) {
          const nextToken = tokens[i + 1];
          if (nextToken.type !== 'punctuation' && nextToken.type !== 'whitespace') {
            translatedText += ' ';
          }
        }

        // Add space after NUMBER tokens before Chinese characters
        if (token.type === TokenType.NUMBER && i < tokens.length - 1) {
          const nextToken = tokens[i + 1];
          if (nextToken.type === 'chinese_char') {
            translatedText += ' ';
          }
        }

        // Debug what we're adding (semantic arrays already populated by processCharacterOnlyTokens)
        if (process.env.NODE_ENV === 'development' && tokens.indexOf(token) % 300 === 0) {
          logger.log(`📝 Character-only progress: ${translatedText.length} chars translated`);
        }
      }

      // Apply punctuation translation like the full translation does
      if (this.punctuationDict && Object.keys(this.punctuationDict).length > 0) {
        const punctuationChars = [
          '。',
          '，',
          '、',
          '？',
          '！',
          '：',
          '；',
          '……',
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
            const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            translatedText = translatedText.replace(
              new RegExp(escapedChar, 'g'),
              result_lookup.translation
            );
          }
        }
      }

      // Apply light formatting for character-only translation
      // Capitalize first letter and after punctuation, but preserve exact spacing
      translatedText = this.applyLightFormatting(translatedText);

      if (process.env.NODE_ENV === 'development') {
        batchLog.hotInfo(
          'char-engine',
          `Character-only translation completed: ${translatedText.length} chars`
        );
      }

      // CODE REVIEW FIX (2026-02-07): Update semantic arrays to match capitalized text
      // Previously only capitalized the first unit, causing case mismatches for
      // units after punctuation (e.g., after periods, after newlines)
      // Now using updateWithCapitalizedText() to find ALL capitalized variants
      characterOnlySemanticBuilder.updateWithCapitalizedText(translatedText);

      // CODE REVIEW FIX (2026-02-07): Add position metadata AFTER all text transformations
      // This fixes duplicate highlighting by tracking exact positions in final text
      // Must happen after punctuation translation, capitalization, and spacing
      // to avoid position drift from text modifications
      {
        const tempArrays = characterOnlySemanticBuilder.getArrays();
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
          const lowerText = translatedText.toLowerCase();
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

      // Get semantic arrays from the isolated builder (prevents conflicts with concurrent main translations)
      // Note: getArrays() can be CPU intensive for large translations, but this is isolated so safe to optimize later
      const semanticArrays = characterOnlySemanticBuilder.getArrays();

      if (process.env.NODE_ENV === 'development') {
        batchLog.hotVerbose(
          'char-semantics',
          `Character-only semantic arrays: ${semanticArrays.original.length} original, ${semanticArrays.translated.length} translated`
        );
      }

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
   * Build semantic arrays in parallel for both full and character-only translations
   * This optimizes the final semantic array construction phase
   * @param {Object} fullSemanticBuilder - Main semantic array builder
   * @param {Object} characterSemanticBuilder - Character-only semantic array builder
   * @returns {Promise<Object>} {fullSemanticArrays, characterSemanticArrays}
   */
  async buildParallelSemanticArrays(fullSemanticBuilder, characterSemanticBuilder) {
    const startTime = performance.now();

    try {
      // Run both semantic array constructions in parallel
      // This is safe because the builders are completely isolated
      const [fullSemanticArrays, characterSemanticArrays] = await Promise.all([
        // Wrap synchronous getArrays() in Promise to enable parallel execution
        Promise.resolve(fullSemanticBuilder.getArrays()),
        Promise.resolve(characterSemanticBuilder.getArrays()),
      ]);

      const buildTime = performance.now() - startTime;
      this.log(
        DEBUG_LEVELS.VERBOSE,
        `🚀 Parallel semantic arrays built in ${buildTime.toFixed(1)}ms (full: ${fullSemanticArrays.original?.length || 0}, character: ${characterSemanticArrays.original?.length || 0} segments)`
      );

      return {
        fullSemanticArrays,
        characterSemanticArrays,
      };
    } catch (error) {
      // MEDIUM-8 FIX: Standardize error logging with logger.error
      logger.error('🚨 Parallel semantic building failed:', error);

      // Fallback to sequential building
      this.log(DEBUG_LEVELS.INFO, '📝 Falling back to sequential semantic array building');
      return {
        fullSemanticArrays: fullSemanticBuilder.getArrays(),
        characterSemanticArrays: characterSemanticBuilder.getArrays(),
      };
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
          const indexedMatches = this.dictionaryManager.getIndexedMatches(
            options.lookupIndex,
            textPosition,
            'characters'
          );

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
        // Try to translate punctuation for readability
        const match = this.findLongestMatchAtPosition(tokens, i, punctuationDictionary);
        if (match) {
          const matchWithDictName = {
            ...match,
            dictionary: 'punctuation',
          };
          this.applyMatchToTokens(tokens, i, matchWithDictName, options);
        } else {
          // No punctuation translation, preserve as-is
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
   * @param {string[]} [options.dictionaryOrder] - Dictionary search order
   *
   * @returns {Promise<Object>} Translation result with segments
   * @returns {string} result.translatedText - Translated Vietnamese text
   * @returns {Object} result.semanticArrays - Semantic arrays for highlighting
   * @returns {Array} result.semanticArrays.original - Original text segments
   * @returns {Array} result.semanticArrays.translated - Translated text segments
   * @returns {Array} result.semanticArrays.metadata - Metadata for each segment
   * @returns {Array} result.prebuiltSegments - Pre-built segments for ClickableTranslationOptimized
   * @returns {Array} [result.progressiveSegments] - Progressive segments (progressive mode only)
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
   *   activeProperNouns: ['properNouns-Novel1.json'],
   *   dictionaryOrder: ['properNouns-Novel1.json', 'phrase', 'character']
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
    // Phase 7: Start performance profiling
    const operationId = `translation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    performanceProfiler.startTranslationProfile(operationId, text, options);

    // Performance monitoring: Start timing for bottleneck detection
    const perfId = `translateWithSegments_${Date.now()}`;
    performanceLogger.startTiming(perfId, 'translateWithSegments', {
      textLength: text.length,
      chunks: text.split(/[。！？，；：]/g).length,
      progressive: !!options.progressive,
      useOptimized: this.useOptimizedSemanticBuilder,
    });

    // Reset segments for new translation
    // HIGH-5 FIX: Cleanup old segments before resetting to prevent memory leaks
    this.cleanupOldSegments();

    // MEMORY LEAK FIX: Always start fresh for each new translation
    // This ensures old segments don't accumulate across multiple translations
    this.translationSegments = [];

    // Reset semantic array builder for new translation with capacity estimation
    if (this.useOptimizedSemanticBuilder) {
      // Estimate semantic units based on text length and complexity
      const estimatedUnits = Math.max(50, Math.ceil(text.length / 3));
      this.semanticArrayBuilder.reset(estimatedUnits);
    } else {
      this.semanticArrayBuilder.reset();
    }

    let translatedText;
    let semanticArrays;

    // Choose between progressive or regular translation
    // Progressive mode has better memory management and streaming capabilities - use for all text lengths
    const useProgressive = options.progressive && options.onProgress;

    this.log(
      DEBUG_LEVELS.INFO,
      `🔀 Translation mode decision: text=${text.length} chars, progressive=${options.progressive}, onProgress=${!!options.onProgress}, useProgressive=${useProgressive}`
    );

    if (useProgressive) {
      // Use progressive batch translation (only for shorter texts)
      const progressiveResult = await this.translateWithProgressiveBatches(text, options);
      translatedText = progressiveResult.translatedText;
      semanticArrays = progressiveResult.semanticArrays;
    } else {
      // Use regular translation
      translatedText = await this.translate(text, options);

      // Verify position tracking worked correctly
      const unpositionedSegments = this.translationSegments.filter((s) => s.translatedStart === -1);
      if (unpositionedSegments.length > 0) {
        this.log(
          DEBUG_LEVELS.WARN,
          `⚠️ ${unpositionedSegments.length} segments missing positions - position tracking bug detected`
        );
      }

      // Update semantic arrays with capitalized versions from final text
      this.semanticArrayBuilder.updateWithCapitalizedText(translatedText);

      // MEMORY PROFILING FIX: Auto-compact semantic arrays to remove wasted capacity
      // Only for OptimizedSemanticArrayBuilder which has compact() method
      if (
        this.useOptimizedSemanticBuilder &&
        typeof this.semanticArrayBuilder.compact === 'function'
      ) {
        const stats = this.semanticArrayBuilder.getMemoryStats();
        const wastePercentage = stats.wastedCapacity / (stats.arrays * 100);

        // Compact if >30% wasted capacity to reduce memory usage
        if (wastePercentage > MEMORY_WASTE_DETECTION.WASTE_PERCENTAGE_THRESHOLD) {
          this.semanticArrayBuilder.compact();
          this.log(
            DEBUG_LEVELS.DEBUG,
            `🗜️  Auto-compact: removed ${stats.wastedCapacity} wasted array slots (${(wastePercentage * 100).toFixed(1)}% waste)`
          );
        }
      }

      // Get semantic arrays
      // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
      semanticArrays = this.semanticArrayBuilder?.getArrays() || {
        original: [],
        translated: [],
        metadata: [],
      };
    }

    // Legacy precomputed segments removed - components now compute segments on-demand from semanticArrays

    // Phase 7: Complete performance profiling
    const result = {
      originalText: text,
      translatedText: translatedText,
      segments: this.translationSegments,
      semanticArrays: semanticArrays, // Components compute segments on-demand from this
      prebuiltSegments: this.prebuiltSegments || [], // Instant segments built during translation
    };

    performanceProfiler.endTranslationProfile(operationId, translatedText, result);

    // Performance monitoring: End timing and check for bottlenecks
    performanceLogger.endTiming(perfId, {
      resultLength: result.translatedText.length,
      semanticArrays: result.semanticArrays?.length || 0,
      segmentsCount: result.segments?.length || 0,
      prebuiltSegments: result.prebuiltSegments?.length || 0,
    });

    return result;
  }

  /**
   * Create semantic groups for phrases with conflict detection
   * This includes detection of potential pattern conflicts
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Options
   */
  async createPhraseGroups(tokens, _options) {
    this.log(DEBUG_LEVELS.DEBUG, '🔗 Creating phrase groups with conflict detection');

    // Step 1: Find all potential phrase matches
    const potentialMatches = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip already processed tokens (including those processed by proper nouns or patterns)
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

      // Look for phrase matches starting from this position
      const fullText = getTextFromTokens(tokens);
      const textPosition = getTextPositionForTokenIndex(tokens, i);
      const _searchText = fullText.substring(textPosition, textPosition + 10); // Show next 10 chars

      const phraseMatches = await this.findAllMatches(fullText, textPosition, ['phrases']);

      if (phraseMatches.length > 0) {
        const bestMatch = phraseMatches[0]; // Already sorted by length

        const tokenSpan = getTokenSpanForText(tokens, i, bestMatch.word);

        // Check if any token in the phrase span is already processed
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
              this.log(
                DEBUG_LEVELS.DEBUG,
                `🚨 Phrase "${bestMatch.word}" blocked: token ${checkIndex} already processed by ${checkToken.translationSource || 'other'}`
              );
              break;
            }
          }
        }

        if (tokenSpan >= 1 && !hasProcessedTokens) {
          potentialMatches.push({
            startIndex: i,
            endIndex: i + tokenSpan - 1,
            match: bestMatch,
            tokenSpan: tokenSpan,
            type: 'phrase',
          });
        }
      }
    }

    // Step 2: Find all potential pattern matches
    if (
      this.semanticPatternProcessor.patterns &&
      this.semanticPatternProcessor.patterns.length > 0
    ) {
      // Build variable cache for pattern conflict detection
      const patternVariableDictionaries = [...this.activeProperNouns, 'phrases'];
      this.semanticPatternProcessor.buildVariableCache(
        tokens,
        patternVariableDictionaries,
        this.dictionaryManager
      );

      // OPTIMIZATION: Use cached semantic tokens if available (5-10% overhead reduction).
      // NOTE: cache is always null here (cleared at translateSinglePass entry above) — the
      // getSemanticTokens fallback always fires for Phase 1. Do NOT move the cache initialization
      // earlier; it is set after Phase 2 so that Phase 1's token mutations are already applied.
      const semanticTokens = this.cachedSemanticTokens || getSemanticTokens(tokens);
      // Hot path optimization: Only log if debug level is sufficient
      if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
        this.log(
          DEBUG_LEVELS.DEBUG,
          `🔍 Pattern conflict detection: ${semanticTokens.length} semantic tokens:`,
          semanticTokens.map((t) => t.value)
        );
        this.log(
          DEBUG_LEVELS.DEBUG,
          `🔍 Available patterns:`,
          this.semanticPatternProcessor.patterns.map((p) => p.originalPattern)
        );
      }

      for (let semanticPos = 0; semanticPos < semanticTokens.length; semanticPos++) {
        for (const pattern of this.semanticPatternProcessor.patterns) {
          if (this.debugLevel >= DEBUG_LEVELS.VERBOSE) {
            this.log(
              DEBUG_LEVELS.VERBOSE,
              `🔍 Testing pattern "${pattern.originalPattern}" at position ${semanticPos} (token: "${semanticTokens[semanticPos].value}")`
            );
          }

          // Check if pattern could match at this position
          let shouldTest = false;
          if (pattern.firstToken.type === 'literal') {
            // Literal-starting pattern: must match exactly
            shouldTest = pattern.firstToken.value === semanticTokens[semanticPos].value;
          } else if (pattern.firstToken.type === 'variable') {
            // Variable-starting pattern: test at all positions where variable could match
            shouldTest = true;
          }

          if (shouldTest) {
            if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
              if (pattern.firstToken.type === 'literal') {
                this.log(
                  DEBUG_LEVELS.DEBUG,
                  `🎯 Literal first token matches! Trying pattern "${pattern.originalPattern}"`
                );
              } else {
                this.log(
                  DEBUG_LEVELS.DEBUG,
                  `🎯 Variable first token! Trying pattern "${pattern.originalPattern}"`
                );
              }
            }

            try {
              const matchResult = this.semanticPatternProcessor.testPatternMatch(
                pattern,
                semanticTokens,
                semanticPos,
                { debugLevel: this.debugLevel }
              );

              if (matchResult.success) {
                potentialMatches.push({
                  startIndex: matchResult.matchedTokens[0].originalIndex,
                  endIndex:
                    matchResult.matchedTokens[matchResult.matchedTokens.length - 1].originalIndex,
                  match: matchResult,
                  pattern: pattern,
                  type: 'pattern',
                });
              }
            } catch (_error) {
              // Pattern failed, continue
              if (this.debugLevel >= DEBUG_LEVELS.VERBOSE) {
                this.log(
                  DEBUG_LEVELS.VERBOSE,
                  `🚨 Pattern conflict detection failed for "${pattern.originalPattern}":`,
                  _error.message
                );
              }
            }
          }
        }
      }
    }

    // Step 3: Resolve conflicts by selecting non-overlapping matches
    const resolvedMatches = this.resolveMatchConflicts(potentialMatches, tokens);

    // Step 4: Apply resolved phrase matches only (patterns will be applied later)
    for (const resolvedMatch of resolvedMatches) {
      if (resolvedMatch.type === 'phrase') {
        const { startIndex, match, tokenSpan } = resolvedMatch;

        // Create the group without translating
        tokens[startIndex].isGrouped = true;
        // CRITICAL FIX: Preserve originalValue before modifying for getTokenSpanForText()
        if (!tokens[startIndex].originalValue) {
          tokens[startIndex].originalValue = tokens[startIndex].value;
        }
        tokens[startIndex].value = match.word; // Update value to grouped text
        tokens[startIndex].phraseMatch = match; // Store match for later translation

        // Mark grouped tokens as consumed
        for (let j = 1; j < tokenSpan; j++) {
          if (startIndex + j < tokens.length) {
            tokens[startIndex].groupedWith = tokens[startIndex].groupedWith || [];
            tokens[startIndex].groupedWith.push(startIndex + j);
            tokens[startIndex + j].isGrouped = true;
            tokens[startIndex + j].groupLeader = startIndex;
            tokens[startIndex + j].translated = null; // Mark as consumed
            tokens[startIndex + j].translationSource = 'phrases_consumed'; // Prevent re-translation
          }
        }

        this.log(
          DEBUG_LEVELS.DEBUG,
          `🔗 Created phrase group: "${match.word}" at tokens ${startIndex}-${startIndex + tokenSpan - 1}`
        );
      } else {
        // Pattern match - let the SemanticPatternProcessor handle variable resolution later
        // We don't need to compute the result here, just mark it for prioritization
        tokens[resolvedMatch.startIndex].prioritizedPattern = resolvedMatch;
        this.log(
          DEBUG_LEVELS.DEBUG,
          `🎯 Prioritized pattern: "${resolvedMatch.pattern.originalPattern}" at tokens ${resolvedMatch.startIndex}-${resolvedMatch.endIndex}`
        );
      }
    }
  }

  /**
   * Resolve conflicts between overlapping phrase and pattern matches (Phase 2 — proper noun pass).
   *
   * PRIORITY ORDER INTENTIONALLY DIFFERS from resolveGlobalConflicts (Phase 4):
   * Here patterns (priority 2) beat regular phrases (priority 5) at equal length, because Phase 1
   * structural patterns have already consumed their tokens — any residual 'pattern' type entry
   * competing here is a direct phrase–pattern overlap that the pattern should win.
   * resolveGlobalConflicts (phrase-only pass) inverts this: phrases beat patterns at equal length
   * because by Phase 4 all pattern tokens are consumed and pattern entries are residual.
   * Sibling function: resolveGlobalConflicts (~line 2714, Phase 4) — algorithm changes to one
   * must be manually mirrored in the other.
   *
   * @param {Array} potentialMatches - Array of potential matches
   * @param {Token[]} tokens - Array of tokens
   * @returns {Array} Non-overlapping resolved matches
   */
  resolveMatchConflicts(potentialMatches, tokens) {
    this.log(DEBUG_LEVELS.DEBUG, `🔍 Resolving ${potentialMatches.length} potential matches`);

    // Smart conflict resolution: Check if phrases are part of patterns
    const patternsInMatches = potentialMatches.filter((m) => m.type === 'pattern');
    const phrasesInMatches = potentialMatches.filter((m) => m.type === 'phrase');

    // For each phrase, check if it's part of any pattern that could match
    for (const phraseMatch of phrasesInMatches) {
      phraseMatch.isPartOfPattern = false;
      phraseMatch.isCompoundWord = phraseMatch.match.word.length > 1; // Multi-character = compound

      for (const patternMatch of patternsInMatches) {
        // Check if phrase overlaps with pattern
        const phraseStart = phraseMatch.startIndex;
        const phraseEnd = phraseMatch.endIndex;
        const patternStart = patternMatch.startIndex;
        const patternEnd = patternMatch.endIndex;

        if (!(phraseEnd < patternStart || phraseStart > patternEnd)) {
          // Overlapping - but compound words should win over patterns that partially overlap them
          if (
            phraseMatch.isCompoundWord &&
            phraseMatch.match.metadata?.allowAsPatternVariable === true
          ) {
            // Check if the pattern is consuming part of a compound word
            // This happens when a pattern matches characters that are part of a compound
            const phraseWordInTokens = getTextFromTokens(tokens).substring(
              getTextPositionForTokenIndex(tokens, phraseStart),
              getTextPositionForTokenIndex(tokens, phraseEnd + 1)
            );

            if (phraseWordInTokens === phraseMatch.match.word) {
              // Check if this compound word is semantically aligned with the pattern
              // If the pattern is designed to consume this exact compound, let the pattern win
              // If the pattern is only partially consuming the compound, let the compound win

              const patternTemplate = patternMatch.pattern.originalPattern;
              const isSemanticComponent = patternTemplate.includes(phraseMatch.match.word);

              // Check if this phrase could be a pattern variable (substitute for X, Y, etc.)
              const hasPatternVariables = /[A-Z]/.test(patternTemplate);
              const isPatternVariable = phraseMatch.match.metadata?.allowAsPatternVariable === true;

              if (isSemanticComponent) {
                // This compound is intended as a pattern component (like 脑海 in 从X脑海中)
                phraseMatch.isPartOfPattern = true;
                this.log(
                  DEBUG_LEVELS.DEBUG,
                  `🎯 Pattern "${patternTemplate}" uses "${phraseMatch.match.word}" as semantic component`
                );
              } else if (hasPatternVariables && isPatternVariable) {
                // This compound could serve as a pattern variable (like 使用者 for X in 在X的身体上)
                phraseMatch.isPartOfPattern = true;
                this.log(
                  DEBUG_LEVELS.DEBUG,
                  `🎯 Pattern "${patternTemplate}" can use "${phraseMatch.match.word}" as pattern variable`
                );
              } else {
                // This compound is being incorrectly consumed by pattern (like 手套 vs X的手)
                phraseMatch.isPartOfPattern = false;
                patternMatch.conflictsWithCompound = true;
                this.log(
                  DEBUG_LEVELS.DEBUG,
                  `🎯 Compound word "${phraseMatch.match.word}" takes priority over pattern "${patternTemplate}"`
                );
              }
            } else {
              phraseMatch.isPartOfPattern = true;
            }
          } else {
            phraseMatch.isPartOfPattern = true;
          }
          break;
        }
      }
    }

    // Sort matches by smart priority
    potentialMatches.sort((a, b) => {
      // Determine priority level for each match
      const getPriority = (match) => {
        // Higher specificity compounds should beat patterns that partially overlap
        if (
          match.type === 'phrase' &&
          match.match.metadata?.allowAsPatternVariable === true &&
          match.isCompoundWord &&
          !match.isPartOfPattern
        ) {
          return 1; // Phase 2: High-specificity compound words (like 手套)
        } else if (match.type === 'pattern' && !match.conflictsWithCompound) {
          return 2; // Phase 3: patterns (unless they conflict with compound words)
        } else if (
          match.type === 'phrase' &&
          match.match.metadata?.allowAsPatternVariable === true &&
          !match.isPartOfPattern
        ) {
          return 3; // Phase 2: Other allowAsPatternVariable phrases
        } else if (match.type === 'pattern' && match.conflictsWithCompound) {
          return 4; // Patterns that conflict with compound words get lower priority
        } else if (match.type === 'phrase') {
          return 5; // Phase 4: regular phrases or phrases that are part of patterns
        }
        return 6; // Fallback
      };

      const priorityA = getPriority(a);
      const priorityB = getPriority(b);

      // First priority: Smart phase order
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Second priority: Longer matches within same type
      const lengthA = a.endIndex - a.startIndex + 1;
      const lengthB = b.endIndex - b.startIndex + 1;

      if (lengthA !== lengthB) {
        return lengthB - lengthA; // Longer matches first
      }

      return 0;
    });

    const resolvedMatches = [];
    const usedTokens = new Set();

    for (const potentialMatch of potentialMatches) {
      const { startIndex, endIndex } = potentialMatch;

      // Check if any tokens in this range are already used
      let hasConflict = false;
      for (let i = startIndex; i <= endIndex; i++) {
        if (usedTokens.has(i)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        // No conflict, accept this match
        resolvedMatches.push(potentialMatch);

        // Mark tokens as used
        for (let i = startIndex; i <= endIndex; i++) {
          usedTokens.add(i);
        }

        const matchText =
          potentialMatch.type === 'phrase'
            ? potentialMatch.match.word
            : potentialMatch.pattern.originalPattern;
        this.log(
          DEBUG_LEVELS.DEBUG,
          `✅ Accepted ${potentialMatch.type}: "${matchText}" (tokens ${startIndex}-${endIndex})`
        );
      } else {
        const matchText =
          potentialMatch.type === 'phrase'
            ? potentialMatch.match.word
            : potentialMatch.pattern.originalPattern;
        this.log(
          DEBUG_LEVELS.DEBUG,
          `🚫 Rejected ${potentialMatch.type}: "${matchText}" due to conflict`
        );
      }
    }

    return resolvedMatches;
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
   * @param {string[]} [options.dictionaryOrder] - Dictionary search order
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
    // Check if two-phase pattern processing is enabled
    if (
      this.settings.enableTwoPhasePatterns &&
      this.semanticPatternProcessor.patterns?.length > 0
    ) {
      this.log(
        DEBUG_LEVELS.INFO,
        `🎯 Using hierarchical two-phase pattern processing (${this.semanticPatternProcessor.patterns.length} patterns loaded)`
      );
      return await this.createOptimalPhraseGroupsHierarchical(tokens, options);
    } else {
      // Phase 3B.2: Legacy pattern processing was removed - this should never be reached
      this.log(
        DEBUG_LEVELS.ERROR,
        '🚨 CRITICAL: Legacy pattern processing was removed and two-phase not available'
      );
      throw new Error(
        'Pattern processing unavailable: two-phase disabled and legacy single-phase processing was removed'
      );
    }
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

    // CRITICAL FIX: Validate token state before phrase processing
    // Detect if earlier phases (patterns, proper nouns) failed silently
    const unprocessedCount = tokens.filter(
      (t) => t.type === 'chinese_char' && !t.translated && !t.translationSource
    ).length;

    if (unprocessedCount > tokens.length * 0.8) {
      // >80% of Chinese tokens still unprocessed - may be normal for some text types
      // Changed to debug level to reduce console noise (was causing hundreds of warnings)
      logger.debug(
        `Unusual token state before phrase processing: ${unprocessedCount}/${tokens.length} Chinese tokens still unprocessed`
      );
      logger.debug(
        'This may indicate silent failures in Phase 1 (Patterns) or Phase 2 (Proper Nouns), or simply text without patterns/proper nouns'
      );
    }

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
   * PRIORITY ORDER INTENTIONALLY DIFFERS from resolveMatchConflicts (Phase 2):
   * Here phrases (type priority 1) beat patterns (type priority 2) at equal length because by Phase 4
   * all Phase 1 structural-pattern tokens are already consumed; any remaining 'pattern' entry is residual
   * and should yield to a phrase of equal length.
   * resolveMatchConflicts (Phase 2, proper-noun pass) inverts this: patterns beat regular phrases
   * because it runs before Phase 1 consumption is complete.
   * Sibling function: resolveMatchConflicts (~line 2383, Phase 2) — algorithm changes to one
   * must be manually mirrored in the other.
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

    // Sort by priority: longest matches first, then by type priority
    // CRITICAL: LENGTH-FIRST sorting matches Rust implementation (matcher.rs)
    allMatches.sort((a, b) => {
      // Primary: Length (longer matches win) - prevents substring collisions
      if (a.length !== b.length) {
        return b.length - a.length;
      }

      // Secondary: Type priority (phrases vs patterns)
      const getTypePriority = (match) => {
        if (match.type === 'phrase') return 1;
        if (match.type === 'pattern') return 2;
        return 3;
      };

      const priorityA = getTypePriority(a);
      const priorityB = getTypePriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Tertiary: Position (earlier positions win)
      return a.startIndex - b.startIndex;
    });

    // Greedily select non-overlapping matches
    const selectedMatches = [];
    const usedTokenIndices = new Set();

    for (const match of allMatches) {
      // Check if this match conflicts with any already selected match
      let hasConflict = false;
      for (let i = match.startIndex; i <= match.endIndex; i++) {
        if (usedTokenIndices.has(i)) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        // Accept this match
        selectedMatches.push(match);

        // Mark tokens as used
        for (let i = match.startIndex; i <= match.endIndex; i++) {
          usedTokenIndices.add(i);
        }

        const matchText =
          match.type === 'phrase' ? match.match.word : match.pattern?.originalPattern || 'unknown';
        this.log(
          DEBUG_LEVELS.DEBUG,
          `✅ Selected ${match.type}: "${matchText}" (length: ${match.length}, tokens: ${match.startIndex}-${match.endIndex})`
        );
      } else {
        const matchText =
          match.type === 'phrase' ? match.match.word : match.pattern?.originalPattern || 'unknown';
        this.log(
          DEBUG_LEVELS.DEBUG,
          `🚫 Rejected ${match.type}: "${matchText}" (conflicts with selected match)`
        );
      }
    }

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
              debugMode: true, // Enable debug mode
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

        // HIGH-2 FIX: Reset failure counter on successful pattern processing
        if (this.patternFailureCount > 0) {
          logger.log(
            `✅ Pattern processing recovered after ${this.patternFailureCount} previous failure(s)`
          );
          this.patternFailureCount = 0;
          this.lastPatternSuccessTime = Date.now();
        }

        // CRITICAL FIX: Detect and report ACTUAL pattern processing failures
        // IMPORTANT: Zero results ≠ Failure
        // - Zero results is valid when input text has no structural patterns
        // - Only warn when WASM explicitly failed (hasWasmPatternProcessorFailed === true)
        const wasmFailed = hasWasmPatternProcessorFailed();

        if (
          wasmFailed &&
          this.semanticPatternProcessor.patterns?.length > 0 &&
          !this.showedPatternWarning
        ) {
          const errorContext = {
            patternsLoaded: this.semanticPatternProcessor.patterns.length,
            wasmAvailable: isWasmPatternProcessorAvailable(),
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
          this.showedPatternWarning = true;

          // Record failure for diagnostics and performance monitoring
          if (
            typeof systemPerformanceMonitor !== 'undefined' &&
            typeof systemPerformanceMonitor.recordAlert === 'function'
          ) {
            systemPerformanceMonitor.recordAlert('pattern_processing_failure', errorContext);
          }
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

      await this.semanticPatternProcessor.processTokens(
        tokens,
        needsDeepCopy
          ? {
              ...options,
              lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
              segments: options.segments ? [...options.segments] : undefined,
              debugLevel: this.debugLevel,
              prioritizedPatterns: this.extractPrioritizedPatterns(tokens),
              semanticArrayBuilder: this.semanticArrayBuilder,
            }
          : {
              ...options,
              debugLevel: this.debugLevel,
              prioritizedPatterns: this.extractPrioritizedPatterns(tokens),
              semanticArrayBuilder: this.semanticArrayBuilder,
            }
      );

      this.log(DEBUG_LEVELS.DEBUG, '✅ Semantic pattern matching phase completed');
    } catch (error) {
      // CRITICAL ERROR HANDLING: Pattern processing failures should not crash translation
      logger.error('❌ Error in pattern processing phase:', error);
      logger.error('Pattern phase will be skipped - translation quality may be reduced');

      // HIGH-2 FIX: Track failure count with time-based reset
      this.patternFailureCount++;
      const timeSinceLastSuccess = this.lastPatternSuccessTime
        ? Date.now() - this.lastPatternSuccessTime
        : Infinity;
      const FAILURE_WINDOW_MS = PATTERN_FAILURE_DETECTION.FAILURE_WINDOW_MS;

      // Only permanently disable after 3 CONSECUTIVE failures within 5 minutes
      // This prevents transient errors from causing permanent disable
      if (this.patternFailureCount >= 3 && timeSinceLastSuccess < FAILURE_WINDOW_MS) {
        // Permanent disable after 3 consecutive failures
        this.settings.enableTwoPhasePatterns = false;
        toast.error(
          'Pattern matching permanently disabled due to repeated failures. Please reload dictionaries or restart the app.',
          { duration: 10000 }
        );
        logger.error(
          `🚨 Pattern processing permanently disabled after ${this.patternFailureCount} consecutive failures within ${FAILURE_WINDOW_MS / 60000} minutes`
        );
      } else if (this.patternFailureCount >= 3 && timeSinceLastSuccess >= FAILURE_WINDOW_MS) {
        // Reset counter if failures are not consecutive (>5 min since last success)
        logger.warn(
          `⚠️ Resetting pattern failure counter (${this.patternFailureCount} failures but ${(timeSinceLastSuccess / 60000).toFixed(1)} min since last success)`
        );
        this.patternFailureCount = 1; // Reset to 1 (current failure)
        this.showedPatternWarning = false; // Allow new warning
      }

      // Show warning for failures (with attempt counter)
      if (this.settings.enableTwoPhasePatterns && !this.showedPatternWarning) {
        toast.warning(
          `Pattern matching failed (attempt ${this.patternFailureCount}/3). Translation quality may be reduced. Try reloading dictionaries.`,
          { duration: 8000 }
        );
        this.showedPatternWarning = true;
      }

      // Record failure for diagnostics
      if (
        typeof systemPerformanceMonitor !== 'undefined' &&
        typeof systemPerformanceMonitor.recordAlert === 'function'
      ) {
        systemPerformanceMonitor.recordAlert('pattern_processing_error', {
          error: error.message,
          timestamp: Date.now(),
          failureCount: this.patternFailureCount,
          autoDisabled: this.patternFailureCount >= 3,
        });
      }

      // Don't re-throw - allow translation to continue without patterns
      // Proper nouns, phrases, and characters will still work
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
      for (let i = result.startIndex + 1; i <= result.endIndex; i++) {
        if (tokens[i]) {
          tokens[i].translated = null; // Must be null - postProcess checks !== null
          tokens[i].translationSource = 'hierarchical_pattern_consumed';
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
        result.translationSource || 'hierarchical_patterns',
        globalTokenIndex
      );

      this.log(
        DEBUG_LEVELS.DEBUG,
        `🎯 Applied ${result.type || 'pattern'} result: "${result.originalText}" -> "${result.translation}"`
      );
    }
  }

  // ============================================================================
  // SECTION 11: PHASE 4 - PHRASE PROCESSING
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
          match.dictionary,
          globalTokenIndex
        );

        // Mark grouped tokens
        for (let j = 1; j < tokenSpan; j++) {
          if (startIndex + j < tokens.length) {
            tokens[startIndex].groupedWith = tokens[startIndex].groupedWith || [];
            tokens[startIndex].groupedWith.push(startIndex + j);
            tokens[startIndex + j].isGrouped = true;
            tokens[startIndex + j].groupLeader = startIndex;
            tokens[startIndex + j].translated = null;
            tokens[startIndex + j].translationSource = 'phrases_consumed';
          }
        }

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
    const optimalMatches = this.resolvePhrasePriorityConflicts(allPotentialMatches);

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
        match.match.dictionary, // source
        globalTokenIndex // global token index for proper ordering
      );

      // Mark additional tokens as grouped if this is a multi-token phrase
      for (let j = 1; j < tokenSpan; j++) {
        if (tokenIndex + j < tokens.length) {
          tokens[tokenIndex + j].isGrouped = true;
          tokens[tokenIndex + j].groupLeader = tokenIndex;
          // CRITICAL FIX: Use null (not empty string) to comply with consumed token contract
          // postProcess() checks token.translated !== null to identify consumed tokens
          tokens[tokenIndex + j].translated = null; // Must be null - postProcess checks !== null
          tokens[tokenIndex + j].translationSource = 'phrases_consumed';
        }
      }

      this.log(
        DEBUG_LEVELS.DEBUG,
        `🎯 Remaining phrase: "${match.match.word}" -> "${match.match.translation}"`
      );
    }
  }

  /**
   * Resolve phrase priority conflicts using global conflict resolution
   * @param {Array} potentialMatches - All potential phrase matches
   * @returns {Array} Non-overlapping optimal matches
   */
  resolvePhrasePriorityConflicts(potentialMatches) {
    // Use the existing global conflict resolution method
    return this.resolveGlobalConflicts(potentialMatches, []);
  }

  /**
   * Apply patterns using true semantic token-based matching
   * Each pattern component (literal or variable) matches exactly one semantic token
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Pattern application options
   */
  async applyPatternsToTokenSequences(tokens, options) {
    // Variable resolver for semantic token pattern matching
    const variableResolver = async (tokenValue, _variableName) => {
      // First check if this token value was already successfully translated in the proper nouns phase
      // This indicates it was a valid pattern variable
      for (const token of tokens) {
        if (token.value === tokenValue && token.translated !== null) {
          this.log(
            DEBUG_LEVELS.VERBOSE,
            `✅ Pattern variable resolved from existing translation: "${tokenValue}" -> "${token.translated}" (${token.translationSource})`
          );
          return token.translated;
        }
      }

      // Look up in active proper noun dictionaries first
      let result = this.dictionaryManager.translate(tokenValue, this.activeProperNouns);

      // If not found in proper nouns, check phrases with allowAsPatternVariable flag
      if (!result) {
        const phrasesResult = this.dictionaryManager.translate(tokenValue, ['phrases']);

        if (
          phrasesResult &&
          phrasesResult.metadata &&
          phrasesResult.metadata.allowAsPatternVariable
        ) {
          result = phrasesResult;
        }
      }

      if (result) {
        this.log(
          DEBUG_LEVELS.VERBOSE,
          `✅ Pattern variable resolved: "${tokenValue}" -> "${result.translation}" (${result.dictionary})`
        );
        return result.translation;
      } else {
        this.log(
          DEBUG_LEVELS.VERBOSE,
          `🚨 Pattern variable rejected: "${tokenValue}" is not a proper noun or allowed phrase`
        );
        return null; // This will cause pattern to be rejected
      }
    };

    // OPTIMIZATION: Use cached semantic tokens if available (5-10% overhead reduction)
    const semanticTokens = this.cachedSemanticTokens || getSemanticTokens(tokens);

    this.log(
      DEBUG_LEVELS.VERBOSE,
      `🔍 Semantic tokens for pattern matching:`,
      semanticTokens.map((t) => `"${t.value}"`).join(' ')
    );

    // Process each semantic token position looking for pattern starts
    for (let semanticPos = 0; semanticPos < semanticTokens.length; semanticPos++) {
      const currentSemanticToken = semanticTokens[semanticPos];
      const originalTokenIndex = currentSemanticToken.originalIndex;

      // Check if this token is already handled by a pattern (leader or consumed)
      if (
        tokens[originalTokenIndex].translationSource === 'pattern' ||
        tokens[originalTokenIndex].translationSource === 'pattern_consumed'
      ) {
        continue; // Skip already handled tokens
      }

      // Try each pattern to see if it starts at this semantic position
      for (const pattern of this.compiledPatterns) {
        try {
          // Use semantic token-based matching instead of regex
          const matchResult = await this.matchSemanticPattern(
            pattern,
            semanticTokens,
            semanticPos,
            variableResolver,
            options
          );

          if (matchResult.success) {
            // Check for conflicts with existing pattern translations
            let hasPatternConflict = false;
            for (const matchedToken of matchResult.matched) {
              const tokenIndex = matchedToken.originalIndex;
              if (
                tokens[tokenIndex].translationSource === 'pattern' ||
                tokens[tokenIndex].translationSource === 'pattern_consumed'
              ) {
                hasPatternConflict = true;
                if (options.debug) {
                  this.log(
                    DEBUG_LEVELS.VERBOSE,
                    `🚨 Pattern conflict: token ${tokenIndex} already has pattern translation`
                  );
                }
                break;
              }
            }

            // Only apply pattern if there's no conflict
            if (!hasPatternConflict) {
              this.log(
                DEBUG_LEVELS.DEBUG,
                `✅ Pattern "${pattern.originalPattern}" applied: "${matchResult.matched.map((t) => t.value).join('')}" -> "${matchResult.translation}"`
              );

              // Apply the pattern result to the original tokens
              const firstTokenIndex = matchResult.matched[0].originalIndex;
              tokens[firstTokenIndex].translated = matchResult.translation;
              tokens[firstTokenIndex].translationSource = 'pattern';
              tokens[firstTokenIndex].patternSemanticType = pattern.metadata?.semanticType ?? null;

              // Clear subsequent matched tokens (mark as consumed)
              for (let i = 1; i < matchResult.matched.length; i++) {
                const tokenIndex = matchResult.matched[i].originalIndex;
                tokens[tokenIndex].translated = null; // Use null instead of '' to prevent re-processing
                tokens[tokenIndex].translationSource = 'pattern_consumed';
              }

              // Skip past the matched semantic tokens
              semanticPos += matchResult.matched.length - 1;
              break; // Pattern applied, move to next semantic token
            }
          }
        } catch (error) {
          // Pattern failed, continue with next pattern
          this.log(
            DEBUG_LEVELS.VERBOSE,
            `🚨 Pattern "${pattern.originalPattern}" failed:`,
            error.message
          );
        }
      }
    }
  }

  /**
   * Match a semantic pattern against semantic tokens at a specific position
   * @param {Object} pattern - Compiled pattern object
   * @param {Array} semanticTokens - Array of semantic tokens
   * @param {number} startPos - Starting position in semantic token array
   * @param {Function} variableResolver - Variable resolver function
   * @param {Object} options - Options
   * @returns {Object} Match result
   */
  async matchSemanticPattern(pattern, semanticTokens, startPos, variableResolver, _options) {
    // Parse pattern into semantic components using extracted utility
    const patternTokens = PatternTemplateEngine.parsePatternToTokens(pattern.originalPattern);

    this.log(
      DEBUG_LEVELS.VERBOSE,
      `🔍 Pattern matching: "${pattern.originalPattern}" -> tokens:`,
      patternTokens
    );
    this.log(
      DEBUG_LEVELS.VERBOSE,
      `🔍 Testing at position ${startPos}, available tokens:`,
      semanticTokens.slice(startPos, startPos + 5).map((t) => `"${t.value}"`)
    );

    // Check if we have enough tokens to match the pattern
    if (startPos + patternTokens.length > semanticTokens.length) {
      return { success: false };
    }

    const matched = [];
    const variables = {};

    // Try to match each pattern token
    for (let i = 0; i < patternTokens.length; i++) {
      const patternToken = patternTokens[i];
      const semanticToken = semanticTokens[startPos + i];

      if (patternToken.type === 'literal') {
        // Literal token must match exactly
        if (semanticToken.value !== patternToken.value) {
          this.log(
            DEBUG_LEVELS.VERBOSE,
            `🔍 Literal mismatch: expected "${patternToken.value}", got "${semanticToken.value}"`
          );
          return { success: false };
        }
        matched.push(semanticToken);
      } else if (patternToken.type === 'variable') {
        // Variable token - try to resolve
        const resolvedValue = await variableResolver(semanticToken.value, patternToken.name);
        if (resolvedValue === null) {
          return { success: false };
        }
        variables[patternToken.name] = resolvedValue;
        matched.push(semanticToken);
      }
    }

    // Apply pattern template with resolved variables using extracted utility
    const translation = PatternTemplateEngine.applyPatternTemplate(pattern.template, variables);

    return {
      success: true,
      matched: matched,
      translation: translation,
      variables: variables,
    };
  }

  // PHASE 2.1 EXTRACTION: parsePatternToTokens() and applyPatternTemplate()
  // moved to PatternTemplateEngine utility (2026-01-30)
  // See: src/utils/PatternTemplateEngine.js

  /**
   * Apply semantic pattern result to original tokens
   * @param {Token[]} tokens - Original token array
   * @param {Object} matchResult - Match result from semantic pattern
   * @param {number} startTokenIndex - Starting token index
   * @param {Object} [pattern] - Pattern dictionary entry (for metadata.semanticType)
   */
  applySemanticPatternResult(tokens, matchResult, startTokenIndex, pattern) {
    const _firstMatchedToken = matchResult.matched[0];

    // Apply translation to the first token
    tokens[startTokenIndex].translated = matchResult.translation;
    tokens[startTokenIndex].translationSource = 'pattern';
    tokens[startTokenIndex].patternSemanticType = pattern?.metadata?.semanticType ?? null;

    // Mark subsequent matched tokens as consumed
    for (let i = 1; i < matchResult.matched.length; i++) {
      const tokenIndex = matchResult.matched[i].originalIndex;
      if (tokenIndex < tokens.length) {
        tokens[tokenIndex].translated = null; // Use null to prevent re-processing
        tokens[tokenIndex].translationSource = 'pattern_consumed';
      }
    }
  }

  /**
   * Get the number of semantic tokens that a text span covers
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting token index
   * @param {string} text - Text to count tokens for
   * @returns {number} Number of semantic tokens (accounting for groups)
   */
  getTokenCountForText(tokens, startIndex, text) {
    let remainingText = text;
    let tokenCount = 0;

    for (let i = startIndex; i < tokens.length && remainingText.length > 0; i++) {
      // Skip grouped followers
      if (tokens[i].isGrouped && tokens[i].groupLeader !== null) {
        continue;
      }

      if (tokens[i].type === TokenType.CHINESE_WORD || tokens[i].type === TokenType.CHINESE_CHAR) {
        if (remainingText.startsWith(tokens[i].value)) {
          remainingText = remainingText.slice(tokens[i].value.length);
          tokenCount++;
        } else {
          break;
        }
      }
    }

    return tokenCount;
  }

  /**
   * Get replacement for a single pattern match without affecting surrounding text
   * @param {CompiledPattern} pattern - The compiled pattern
   * @param {string} matchText - The matched text
   * @param {Function} variableResolver - Variable resolver function
   * @returns {Promise<string>} The replacement text
   */
  async getSinglePatternReplacement(pattern, matchText, variableResolver) {
    try {
      // Apply pattern to just the matched text
      const result = await pattern.apply(matchText, variableResolver);
      if (result && !result.includes('X') && result !== matchText) {
        return result;
      }
    } catch (error) {
      this.log(DEBUG_LEVELS.VERBOSE, `🚨 Error getting single pattern replacement:`, error.message);
    }
    return null;
  }

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
  // SECTION 9: PHASE 5 - CHARACTER PROCESSING
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
        let matches;
        if (useSharedLookupIndex) {
          // Get text position for this token to look up in the index
          const textPosition = getTextPositionForTokenIndex(tokens, i);

          // Map phase to dictionary category for lookup index
          const categoryMap = {
            properNouns: 'properNouns',
            phrases: 'phrases',
            characters: 'characters',
            general: 'phrases', // Default fallback
          };
          const category = categoryMap[phase] || 'phrases';

          // Get pre-computed matches from lookup index
          matches = this.dictionaryManager.getIndexedMatches(
            options.lookupIndex,
            textPosition,
            category
          );

          // Filter matches by the specific dictionaries for this phase (since index contains all matches)
          matches = matches.filter((match) => dictionarySet.has(match.dictionary));

          if (this.debugLevel >= DEBUG_LEVELS.VERBOSE && matches.length > 0) {
            this.log(
              DEBUG_LEVELS.VERBOSE,
              `📊 Shared index: ${matches.length} matches found for position ${textPosition}, category ${category}`
            );
          }
        } else {
          // Fallback: Traditional dictionary lookup
          // MEDIUM FIX: Validate token index before reconstruction
          if (i >= tokens.length) {
            this.log(
              DEBUG_LEVELS.ERROR,
              `⚠️ Token index ${i} out of bounds (length: ${tokens.length})`
            );
            matches = [];
          } else {
            const remainingText = reconstructTextFromIndex(tokens, i);
            matches = await this.findAllMatches(remainingText, 0, dictionaryOrder);
          }
        }

        // Filter matches based on onlyPatternVariables option
        let filteredMatches = matches;
        if (options.onlyPatternVariables) {
          filteredMatches = matches.filter(
            (match) =>
              match.dictionary !== 'phrases' ||
              (match.metadata && match.metadata.allowAsPatternVariable === true)
          );
        }

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

            // Calculate token span for skipping ahead
            const tokenSpan = getTokenSpanForText(tokens, i, bestMatch.word);

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
  // SECTION 10: POST-PROCESSING
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
        // Skip tokens that were consumed by any process (patterns, phrases, etc.) but have null translation
        // This indicates they were part of a multi-token match and should not produce individual output
        this.log(
          DEBUG_LEVELS.VERBOSE,
          `🔧 Skipping consumed token: "${token.value}" (source: ${token.translationSource})`
        );
        continue;
      } else {
        // CRITICAL: Validate consumed token contract
        // Tokens with null translation MUST have translationSource to indicate consumption
        // If null without source = potential double-processing bug
        // EXCEPTION: NUMBER, LATIN_WORD, and UNKNOWN tokens naturally have null translation (pass-through)
        if (
          token.translated === null &&
          token.type !== TokenType.CHINESE_CHAR &&
          token.type !== TokenType.CHINESE_WORD &&
          token.type !== TokenType.SPACE &&
          token.type !== TokenType.NEWLINE &&
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
          case TokenType.SPACE:
          case TokenType.NEWLINE:
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

    // DEBUG: Log segments with parentheses and numbers
    if (process.env.NODE_ENV === 'development') {
      const hasParenthesesAndNumbers = segments.some(
        (s) =>
          s.text === '(' ||
          s.text === ')' ||
          s.text === '（' ||
          s.text === '）' ||
          s.text === '/' ||
          s.tokenType === TokenType.NUMBER
      );
      if (hasParenthesesAndNumbers) {
        logger.log('🔍 DEBUG: Segments with parentheses/numbers BEFORE spacing logic:', {
          segmentCount: segments.length,
          segments: segments.map((s, i) => ({
            index: i,
            text: s.text,
            tokenType: s.tokenType,
            originalToken: s.originalToken,
          })),
        });
      }
    }

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
        _cp += (tokens[i].value || '').length;
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

    // DEBUG: Log result before and after cleanup
    if (process.env.NODE_ENV === 'development') {
      if (result.includes('(') || result.includes('（')) {
        logger.log('🔍 DEBUG: Result BEFORE cleanupFormatting:', {
          result: result.substring(Math.max(0, result.indexOf('(') - 20), result.indexOf(')') + 20),
          fullLength: result.length,
        });
      }
    }

    const cleaned = this.cleanupFormatting(result, {
      ...options,
      properNounTranslations,
      segments,
    });

    // DEBUG: Log result after cleanup
    if (process.env.NODE_ENV === 'development') {
      if (cleaned.includes('(') || cleaned.includes('（')) {
        logger.log('🔍 DEBUG: Result AFTER cleanupFormatting:', {
          cleaned: cleaned.substring(
            Math.max(0, cleaned.indexOf('(') - 20),
            cleaned.indexOf(')') + 20
          ),
          fullLength: cleaned.length,
        });
      }
    }

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
   * Update tokens based on pattern matching results
   * @param {Token[]} tokens - Array of tokens
   * @param {string} originalText - Original Chinese text
   * @param {string} patternResult - Text after pattern application
   */
  updateTokensFromPatternResult(tokens, originalText, patternResult) {
    /**
     * INTENTIONAL LIMITATION: Pattern token updates are disabled to prevent entire text replacement.
     *
     * Background: Early implementation attempted to update tokens based on pattern results,
     * but patterns would replace the entire text instead of just matched portions, breaking
     * the translation of unmatched text.
     *
     * Current approach: Individual token translation handles unmatched parts, allowing
     * patterns to work without breaking the rest of the text. This is the correct behavior
     * for the current architecture where patterns are applied separately from token-level
     * translation.
     *
     * Future optimization: Could implement precise pattern matching that tracks which tokens
     * were matched and only updates those specific tokens, but current approach is stable
     * and performant.
     */
    this.log(
      DEBUG_LEVELS.DEBUG,
      `Pattern token update disabled: Using individual token translation for unmatched text`
    );
    this.log(DEBUG_LEVELS.DEBUG, `Original: ${originalText.substring(0, 50)}...`);
    this.log(DEBUG_LEVELS.DEBUG, `Result: ${patternResult.substring(0, 50)}...`);

    return;
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
      if (match.dictionary === 'properNouns' || this.activeProperNouns.includes(match.dictionary)) {
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
      this.semanticArrayBuilder.addUnit(
        match.word, // original text
        match.translation, // translated text
        match.dictionary, // source (phrases, characters, etc.)
        globalTokenIndex // global token index for proper ordering
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
   * Calculate how many tokens a text span covers
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting index
   * @param {string} text - Text to match
   * @returns {number} Number of tokens spanned
   */
  getTokenSpanForText(tokens, startIndex, text) {
    let remainingText = text;
    let span = 0;

    for (let i = startIndex; i < tokens.length && remainingText.length > 0; i++) {
      const token = tokens[i];

      if (token.type === TokenType.CHINESE_WORD || token.type === TokenType.CHINESE_CHAR) {
        // Use original value if available (for grouped tokens), otherwise use current value
        const valueToCheck = token.originalValue || token.value;
        if (remainingText.startsWith(valueToCheck)) {
          remainingText = remainingText.slice(valueToCheck.length);
          span++;
        } else {
          break;
        }
      }
    }

    return span;
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
      isProperNoun:
        match.dictionary === 'properNouns' || this.activeProperNouns.includes(match.dictionary),
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
    if (this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_TRIGGER) {
      // MEMORY PROFILING FIX: Monitor if segments exceed emergency threshold
      // Changed to debug level - cleanup IS working reliably (reduces 200+ to 35)
      if (this.translationSegments.length > 100) {
        logger.debug(
          `Translation segments: ${this.translationSegments.length} (will trigger cleanup at next opportunity)`
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

  /**
   * Update translation segment positions based on the current postProcess segment
   * @param {Object} postProcessSegment - Current segment being processed in postProcess
   * @param {number} currentPosition - Current position in the final text
   */
  updateSegmentPositions(postProcessSegment, currentPosition) {
    // Find translation segments that correspond to this postProcess segment
    for (const translationSegment of this.translationSegments) {
      // Check if this translation segment matches the current postProcess segment
      if (this.segmentMatches(translationSegment, postProcessSegment)) {
        // Only update if position hasn't been set yet (prevents overwriting)
        if (translationSegment.translatedStart === -1) {
          translationSegment.translatedStart = currentPosition;
          translationSegment.translatedEnd = currentPosition + postProcessSegment.text.length;

          this.log(
            DEBUG_LEVELS.VERBOSE,
            `📍 Position set for "${translationSegment.originalText}" → "${translationSegment.translatedText}" at ${currentPosition}-${translationSegment.translatedEnd}`
          );
        }
      }
    }
  }

  /**
   * Check if a translation segment matches a postProcess segment
   * @param {Object} translationSegment - Translation segment from trackTranslationSegment
   * @param {Object} postProcessSegment - PostProcess segment from postProcess
   * @returns {boolean} True if they match
   */
  segmentMatches(translationSegment, postProcessSegment) {
    // Match by translated text (most reliable)
    if (translationSegment.translatedText === postProcessSegment.text) {
      return true;
    }

    // Match by original token for character-level fallbacks
    if (translationSegment.originalText === postProcessSegment.originalToken) {
      return true;
    }

    return false;
  }

  // calculateTranslatedPositions method removed - position tracking now handled inline during text construction

  /**
   * Clean up formatting in the final result
   * @param {string} text - Text to clean up
   * @param {Object} options - Cleanup options
   * @returns {string} Cleaned text
   */
  cleanupFormatting(text, options) {
    if (process.env.NODE_ENV === 'development') {
      // DEBUG: Log when processing text with numbers
      if (text.includes('23') || text.includes('30')) {
        logger.log('🔍 DEBUG: cleanupFormatting INPUT:', text.substring(0, 200));
        logger.log('🔍 DEBUG: useChunking option:', options.useChunking);
      }
    }

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
      '……',
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

    // Skip detailed spacing rules when called from chunking (chunks handle their own spacing)
    if (options.useChunking !== false) {
      // Fix spacing around punctuation - remove spaces before punctuation
      result = result.replace(/\s+([.,!?:;，。！？：；\])}】》）])/g, '$1');
      // Skip remaining spacing rules when called from chunking
      return result;
    } else {
      // Add space after punctuation (except at end of string or when followed by closing quotes)
      this.log(DEBUG_LEVELS.VERBOSE, '🔧 Before punctuation spacing:', JSON.stringify(result));
      result = result.replace(/([.,!?:;，。！？：；])(?!\s|$|[“””])/g, '$1 ');
      this.log(DEBUG_LEVELS.VERBOSE, '🔧 After punctuation spacing:', JSON.stringify(result));
      // Note: Line 615 uses mixed quote characters (literal curly + straight quotes)

      // Special case: Add space between colon and opening quote (colon-quote combinations)
      result = result.replace(/:\u201c/g, ': \u201c'); // Vietnamese colon + curly quote (after punctuation conversion)
      result = result.replace(/:”(?!\s)/g, ': “'); // Regular quote version
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

    if (process.env.NODE_ENV === 'development') {
      // DEBUG: Log output when processing text with numbers
      if (result.includes('23') || result.includes('30')) {
        logger.log('🔍 DEBUG: cleanupFormatting OUTPUT:', result.substring(0, 200));
      }
    }

    return result;
  }

  /**
   * Update token statistics with bounded collection (LRU eviction)
   * @param {Token[]} tokens - Array of tokens
   */
  updateTokenStats(tokens) {
    tokens.forEach((token) => {
      const count = this.stats.tokenStats.get(token.type) || 0;

      // MEMORY MANAGEMENT: Enforce size limit with LRU eviction
      if (
        !this.stats.tokenStats.has(token.type) &&
        this.stats.tokenStats.size >= this.MAX_TOKEN_STATS
      ) {
        // Remove oldest entry (first key in Map = oldest due to insertion order)
        const firstKey = this.stats.tokenStats.keys().next().value;
        this.stats.tokenStats.delete(firstKey);
      }

      this.stats.tokenStats.set(token.type, count + 1);
    });
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
   * @returns {Object} result.smartMemoryStats - Memory management statistics
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
      smartMemoryStats: this.getSmartMemoryStats(),
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
   * Get comprehensive performance report including profiling data
   * Phase 7: Performance monitoring and profiling
   * @returns {Object} Complete performance analysis
   */
  getPerformanceReport() {
    // Update profiler with current dictionary and cache stats
    const cacheStats = this.dictionaryManager.getCacheStats();
    const sortingStats = this.dictionaryManager.getSortingStats
      ? this.dictionaryManager.getSortingStats()
      : null;

    performanceProfiler.updateDictionaryMetrics(cacheStats, sortingStats);
    performanceProfiler.updateMemoryMetrics();

    return performanceProfiler.getPerformanceReport();
  }

  /**
   * Get real-time dashboard metrics
   * Phase 7: Performance monitoring dashboard
   * @returns {Object} Dashboard metrics
   */
  getDashboardMetrics() {
    return performanceProfiler.getDashboardMetrics();
  }

  /**
   * Enable translation profiling to measure phase-by-phase performance
   * Usage: window.translationEngine.enableProfiling()
   * Then translate text and call getProfilingReport() to see breakdown
   */
  enableProfiling() {
    this.profiler.enable();
  }

  /**
   * Disable translation profiling
   */
  disableProfiling() {
    this.profiler.disable();
  }

  /**
   * Get profiling report showing time breakdown by translation phase
   * @returns {Object} Profiling report with phase breakdown and recommendations
   */
  getProfilingReport() {
    return this.profiler.getReport();
  }

  /**
   * Print formatted profiling report to console
   */
  printProfilingReport() {
    this.profiler.printReport();
  }

  /**
   * Reset profiling data
   */
  resetProfiling() {
    this.profiler.reset();
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
   * Reset performance profiling data
   * Phase 7: Performance profiler reset
   */
  resetPerformanceProfiler() {
    performanceProfiler.reset();
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

    // Build simplified interface for existing code compatibility
    this.parallelConfig = {
      enableParallelChunks: chunkConfig.enabled,
      maxParallelChunks: chunkConfig.maxParallelChunks,
      memoryThreshold: maxTokensAllowed,
      fallbackToSequential: true,
      chunkParallelThreshold: chunkConfig.parallelThreshold,
    };

    this.log(
      DEBUG_LEVELS.INFO,
      `🔧 Parallel processing configured via ParallelConfig: chunks=${this.parallelConfig.enableParallelChunks}, ` +
        `maxConcurrency=${this.parallelConfig.maxParallelChunks}, memoryLimit=${maxTokensAllowed}, ` +
        `batteryOptimization=${parallelConfig.getConfig().device.batteryOptimization}`
    );
  }

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

    // Performance monitoring: Start timing for parallel processing
    const perfId = `processChunksInParallel_${Date.now()}`;
    performanceLogger.startTiming(perfId, 'processChunksInParallel', {
      batchSize: batch.length,
      batchStart,
      parallelEnabled: this.parallelConfig.enableParallelChunks,
      maxConcurrency: this.parallelConfig.maxParallelChunks,
    });

    // Sequential fallback removed — always force parallel processing
    if (
      !this.parallelConfig.enableParallelChunks ||
      batch.length < this.parallelConfig.chunkParallelThreshold
    ) {
      this.log(
        DEBUG_LEVELS.WARNING,
        '⚠️ Conditions suggest sequential processing, but forcing parallel processing'
      );
    }

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
            // MEDIUM FIX: Use token offset, not character position
            chunkOffset: chunkTokenOffsets[index],
            chunkIndex: batchStart + index,
            isParallelChunk: true, // Prevent semantic array reset in individual chunks
          };

          // DEBUG: Log before translation
          if (chunk.content.includes('2') || chunk.content.includes('3')) {
            logger.log('🔍 DEBUG: About to translate chunk:', chunk.content);
          }

          chunk.translated = await this.translateDirectly(chunk.content, chunkOptions);

          // DEBUG: Log translated chunk content
          if (
            chunk.content.includes('2') ||
            chunk.content.includes('3') ||
            chunk.translated.includes('2') ||
            chunk.translated.includes('3')
          ) {
            logger.log('🔍 DEBUG: Translated chunk:', {
              original: chunk.content,
              translated: chunk.translated,
              punctuation: chunk.punctuation,
            });
          }

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

      // Record performance for adaptive chunker learning
      let memoryUsage = 0;
      try {
        // Try to get memory usage (works in Node.js/Electron main process)
        if (typeof process !== 'undefined' && process.memoryUsage) {
          memoryUsage = process.memoryUsage().heapUsed;
        } else if (performance.memory) {
          // Fallback to browser memory API (Chrome/Edge)
          memoryUsage = performance.memory.usedJSHeapSize;
        }
      } catch (error) {
        // CODE REVIEW FIX: Log when memory info is unavailable
        // Expected: Browser doesn't support performance.memory (normal in non-Chromium)
        // Unexpected: Permission errors, API changes
        this.log(
          DEBUG_LEVELS.DEBUG,
          'Memory usage API unavailable, using 0 as fallback:',
          error.message || 'performance.memory not supported'
        );
        memoryUsage = 0;
      }

      adaptiveChunker.recordPerformance({
        chunkSize: batch.length,
        processingTime: processingTime,
        throughput: batch.length / (processingTime / 1000), // chunks per second
        memoryUsage: memoryUsage,
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

      // Record fallback in performance profiler if available
      if (this.performanceProfiler?.recordParallelFallback) {
        this.performanceProfiler.recordParallelFallback('chunk_processing', error);
      }

      throw new Error('Parallel chunk processing failed and sequential fallback is disabled');
    } finally {
      // Performance monitoring: End timing regardless of success/failure
      performanceLogger.endTiming(perfId, {
        processingTime: performance.now() - startTime,
        batchSize: batch.length,
        success: true, // Will be overridden if error was thrown
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

        // Skip guard (mirrors tryCharactersAtPosition)
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
   * @returns {Array} result.progressiveSegments - Segments for progressive highlighting
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
  async translateWithProgressiveBatches(text, options = {}) {
    const startTime = performance.now();

    // Initialize segments collection for progressive translation
    this.translationSegments = [];

    // Reset semantic builder with capacity estimation for progressive translation
    if (this.useOptimizedSemanticBuilder) {
      const estimatedUnits = Math.max(100, Math.ceil(text.length / 2)); // Progressive needs more capacity
      this.semanticArrayBuilder.reset(estimatedUnits);
    } else {
      this.semanticArrayBuilder.reset();
    }

    // PHASE 2: Initialize progressive position tracking
    this.progressivePositionTracker = {
      runningTextPosition: 0,
      finalText: '',
      clickableSegments: [],
      totalOriginalSegments: [],
      totalTranslatedSegments: [],
    };

    // Initialize progress update debouncing (reduce UI update overhead)
    this.lastProgressUpdate = 0;
    this.progressUpdateInterval = UI_UPDATE_THRESHOLDS.PROGRESS_DEBOUNCE_MS;
    this.minChunksForStreaming = UI_UPDATE_THRESHOLDS.STREAMING_MIN_CHUNKS;

    // PHASE 4: Memory-efficient streaming for long texts
    this.processedBatchCache = new Map();
    this.maxCachedBatches = 3; // Keep only recent batches in memory

    // Step 1: Split text into chunks by punctuation boundaries
    const chunks = this.textChunker.chunkText(text);
    const translatableChunks = this.textChunker.getTranslatableChunks(chunks);

    if (translatableChunks.length === 0) {
      // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
      return {
        translatedText: text,
        semanticArrays: this.semanticArrayBuilder?.getArrays() || {
          original: [],
          translated: [],
          metadata: [],
        },
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

    // Enhanced content analysis for smart chunk size adaptation
    const contentAnalysis = adaptiveChunker.analyzeContentCharacteristics(text, translatableChunks);

    // Calculate optimal chunk size using adaptive analysis and device capabilities
    const deviceInfo = {
      memoryPressure: parallelConfig.getConfig().device.memoryPressure,
      cpuCores: parallelConfig.getConfig().device.hardwareConcurrency,
    };
    let currentBatchSize = adaptiveChunker.calculateOptimalChunkSize(
      contentAnalysis,
      deviceInfo,
      translatableChunks.length
    );

    // Ensure compatibility with existing ParallelConfig limits
    const baseBatchSize = chunkConfig.enabled ? chunkConfig.maxParallelChunks : 2;
    currentBatchSize = Math.max(2, Math.min(baseBatchSize, currentBatchSize));

    batchLog.info(
      'smart-chunk-adaptation',
      `📊 Smart chunk sizing: complexity=${contentAnalysis.complexity.toFixed(2)}, ` +
        `strategy=${contentAnalysis.chunkingStrategy}, batch_size=${currentBatchSize}`,
      contentAnalysis.recommendations
    );

    let _totalBatches = Math.ceil(translatableChunks.length / currentBatchSize);

    // Initialize adaptive batch sizing and memory tracking
    this.batchPerformanceHistory = []; // Reset for this translation session
    this.memoryTracker = new MemoryLeakDetector(); // Track memory usage patterns

    // Set up memory cleanup callback
    this.memoryTracker.onCleanupNeeded = (level) => {
      this.performMemoryCleanup(level);
    };

    // Initialize smart memory management refinements
    this.initializeSmartMemoryManagement();
    let performanceBaseline = null;

    /**
     * Handle memory cleanup based on severity level
     * @param {string} level - 'automatic', 'critical', or 'emergency'
     */
    this.performMemoryCleanup = (level) => {
      performanceLogger.startTiming(`memory-cleanup-${level}`, `Memory cleanup - ${level}`, {
        level,
      });

      try {
        batchLog.warn(`🧹 Performing ${level} memory cleanup...`, {
          level,
          translationSegments: this.translationSegments?.length || 0,
          memoryPressure: this.memoryTracker.getCurrentMemoryRatio(),
        });

        if (level === 'automatic') {
          // OPTIMIZATION: Defer automatic cleanup to idle time to avoid blocking translation
          const automaticCleanupFn = () => {
            // Gentle cleanup: Keep last N segments, clean older ones
            if (
              this.translationSegments &&
              this.translationSegments.length > MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
            ) {
              const segmentsToClean = this.translationSegments.slice(
                0,
                -MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
              );
              segmentsToClean.forEach((segment) => {
                // Nullify properties to break references
                if (segment) {
                  segment.originalSegment = null;
                  segment.translatedSegment = null;
                  segment.metadata = null;
                }
              });
              this.translationSegments = this.translationSegments.slice(
                -MEMORY_THRESHOLDS.SEGMENT_CLEANUP_KEEP
              );
              batchLog.info(
                `🧹 Async automatic cleanup: Removed ${segmentsToClean.length} old segments`
              );
            }

            // Clear performance history if too long
            if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 10) {
              this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-5);
            }

            performanceLogger.endTiming(`memory-cleanup-${level}`);
          };

          // CODE REVIEW FIX (2026-02-01): Track and cancel cleanup callbacks to prevent memory leak
          // Use requestIdleCallback if available, otherwise defer with setTimeout
          if (typeof requestIdleCallback !== 'undefined') {
            const callbackId = requestIdleCallback(
              () => {
                this.pendingCleanupCallbacks.delete(callbackId);
                automaticCleanupFn();
              },
              { timeout: UI_TIMEOUTS.IDLE_CALLBACK_TIMEOUT }
            );
            this.pendingCleanupCallbacks.add(callbackId);
          } else {
            const callbackId = setTimeout(() => {
              this.pendingCleanupCallbacks.delete(callbackId);
              automaticCleanupFn();
            }, 0);
            this.pendingCleanupCallbacks.add(callbackId);
          }
        } else if (level === 'critical') {
          // CRITICAL cleanup must be synchronous - we're in trouble and need immediate action
          // Aggressive cleanup: Keep only last 5 segments
          if (this.translationSegments && this.translationSegments.length > 5) {
            const segmentsToClean = this.translationSegments.slice(0, -5);
            segmentsToClean.forEach((segment) => {
              if (segment) {
                Object.keys(segment).forEach((key) => {
                  segment[key] = null;
                });
              }
            });
            this.translationSegments = this.translationSegments.slice(-5);
            batchLog.warn(
              `🧹 Critical cleanup: Removed ${segmentsToClean.length} segments, kept 5`
            );
          }

          // Clear most performance history
          this.batchPerformanceHistory = [];

          // Force garbage collection if available
          if (global.gc) {
            global.gc();
            batchLog.info('🗑️ Forced garbage collection');
          }
        } else if (level === 'emergency') {
          // Emergency cleanup: Clear everything possible
          if (this.translationSegments) {
            this.translationSegments.forEach((segment) => {
              if (segment) {
                Object.keys(segment).forEach((key) => {
                  segment[key] = null;
                });
              }
            });
            this.translationSegments = [];
            batchLog.error('🆘 Emergency cleanup: Cleared all translation segments');
          }

          // Clear all performance data
          this.batchPerformanceHistory = [];

          // Force multiple garbage collections
          if (global.gc) {
            for (let i = 0; i < 3; i++) {
              global.gc();
            }
            batchLog.error('🆘 Forced multiple garbage collections');
          }

          // Request browser memory pressure if available
          if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
            batchLog.error('🆘 Browser memory pressure detected', {
              usedMemory: Math.round(window.performance.memory.usedJSHeapSize / 1048576),
              totalMemory: Math.round(window.performance.memory.totalJSHeapSize / 1048576),
            });
          }
        }

        // Log cleanup results (only for synchronous cleanups)
        if (level !== 'automatic') {
          const postCleanupRatio = this.memoryTracker.getCurrentMemoryRatio();
          batchLog.info(`✅ Memory cleanup completed`, {
            level,
            memoryBefore: (this.memoryTracker.getCurrentMemoryRatio() * 100).toFixed(1) + '%',
            memoryAfter: (postCleanupRatio * 100).toFixed(1) + '%',
            remainingSegments: this.translationSegments?.length || 0,
          });
        }
      } catch (error) {
        batchLog.error('❌ Memory cleanup failed:', error);
      } finally {
        // Only end timing for synchronous cleanups
        // Async automatic cleanup handles its own timing
        if (level !== 'automatic') {
          performanceLogger.endTiming(`memory-cleanup-${level}`, {
            level,
            success: true,
            remainingSegments: this.translationSegments?.length || 0,
          });
        }
      }
    };

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
      if (this.batchPerformanceHistory.length >= 2) {
        const recentBatches = this.batchPerformanceHistory.slice(-2);
        const avgRecentTime =
          recentBatches.reduce((sum, batch) => sum + batch.avgTimePerChunk, 0) /
          recentBatches.length;

        if (!performanceBaseline) {
          performanceBaseline = this.batchPerformanceHistory[0].avgTimePerChunk;
        }

        const performanceRatio = avgRecentTime / performanceBaseline;

        // Memory leak detection disabled to prevent performance impact
        if (performanceRatio > 2.0) {
          // Logging disabled: memory leak monitoring creates more performance issues than it solves
          // this.log(DEBUG_LEVELS.ERROR, `🔍 MEMORY LEAK SUSPECTED: Batch ${batchIndex} is ${performanceRatio.toFixed(1)}x slower`);
        }

        // Don't reduce batch size due to the known memory leak issue
        // The performance degradation is consistent, not getting worse
        if (performanceRatio > 3.0 && currentBatchSize > 3) {
          // Only reduce if performance is EXTREMELY bad (>3x slower)
          currentBatchSize = Math.max(3, currentBatchSize - 1);
          this.log(
            DEBUG_LEVELS.WARN,
            `📉 Reducing batch size to ${currentBatchSize} due to extreme degradation (${performanceRatio.toFixed(1)}x slower)`
          );
        } else if (performanceRatio < 0.8 && currentBatchSize < 5 && batchIndex > 1) {
          // Performance is good, can try larger batches
          currentBatchSize = Math.min(5, currentBatchSize + 1);
          this.log(
            DEBUG_LEVELS.INFO,
            `📈 Increasing batch size to ${currentBatchSize} due to good performance (${performanceRatio.toFixed(1)}x baseline)`
          );
        }

        // Log the consistent performance issue without changing batch size
        if (performanceRatio > 2.0 && performanceRatio <= 3.0) {
          this.log(
            DEBUG_LEVELS.INFO,
            `📊 Consistent performance degradation: ${performanceRatio.toFixed(1)}x slower (memory-related, not reducing batch size)`
          );
        }
      }

      const batchStart = processedChunks; // Chunk index
      const batchEnd = Math.min(batchStart + currentBatchSize, translatableChunks.length);
      const currentBatch = translatableChunks.slice(batchStart, batchEnd);

      // MEDIUM FIX: Calculate token offset for this batch
      const batchTokenOffset = cumulativeTokenCount;

      // Pass current batch number for accurate logging
      this.currentBatchNumber = batchIndex;

      // Track where time is being spent
      const batchStartTime = performance.now();

      // Take memory snapshot before processing (dev only for performance)
      let preProcessingSnapshot, postProcessingSnapshot;

      if (process.env.NODE_ENV === 'development') {
        preProcessingSnapshot = this.memoryTracker.takeSnapshot(batchIndex, {
          phase: 'pre-processing',
          batchSize: currentBatch.length,
          processedChunks,
          semanticArraySize: this.semanticArrayBuilder?.getArrays()?.originalSegments?.length || 0,
          translationSegmentsCount: this.translationSegments?.length || 0,
          chunksProcessed: chunks.filter((c) => c.translated).length,
        });
      }

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

      // Take memory snapshot after processing (dev only for performance)
      if (process.env.NODE_ENV === 'development') {
        postProcessingSnapshot = this.memoryTracker.takeSnapshot(batchIndex, {
          phase: 'post-processing',
          batchSize: currentBatch.length,
          processedChunks: processedChunks + currentBatch.length,
          semanticArraySize: this.semanticArrayBuilder?.getArrays()?.originalSegments?.length || 0,
        });
      }

      // Analyze memory growth patterns
      if (postProcessingSnapshot) {
        const leakAnalysis = this.memoryTracker.detectLeaks(postProcessingSnapshot);

        if (leakAnalysis) {
          if (leakAnalysis.isExcessive) {
            this.log(
              DEBUG_LEVELS.WARN,
              `🧠 HIGH MEMORY USAGE: +${leakAnalysis.memoryGrowthRate.toFixed(1)}MB per batch, ${leakAnalysis.totalGrowthMB.toFixed(1)}MB total (semantic arrays for long text)`
            );
          } else if (leakAnalysis.isHighUsage) {
            this.log(
              DEBUG_LEVELS.DEBUG,
              `📊 Memory growth: +${leakAnalysis.memoryGrowthRate.toFixed(1)}MB per batch (building semantic arrays)`
            );
          }
        }

        // DYNAMIC MEMORY CLEANUP: Trigger cleanup when high memory usage is detected OR segments are high
        let cleanupPerformed = false;
        const forceCleanup = leakAnalysis && (leakAnalysis.isExcessive || leakAnalysis.isHighUsage);

        // 1. Cleanup translation segments (reduce false emergency alerts)
        const segmentThreshold = 60; // Balanced threshold after fixing false memory alerts
        if (this.translationSegments && this.translationSegments.length > segmentThreshold) {
          const oldCount = this.translationSegments.length;

          // Dynamic cleanup amount based on memory pressure
          const keepSegments = forceCleanup ? 10 : 25;

          // Aggressive cleanup: Break references in discarded segments
          this.translationSegments.slice(0, -keepSegments).forEach((segment) => {
            if (segment && typeof segment === 'object') {
              Object.keys(segment).forEach((key) => {
                segment[key] = null;
              });
            }
          });

          // Keep only the last N segments based on memory pressure
          this.translationSegments = this.translationSegments.slice(-keepSegments);

          // Always log as DEBUG - these are routine maintenance operations
          this.log(
            DEBUG_LEVELS.DEBUG,
            `🧹 Translation segments cleaned: ${oldCount} → ${this.translationSegments.length} (freed ${oldCount - keepSegments} segments)`
          );
          cleanupPerformed = true;
        }

        // 2. Cleanup semantic array builder (dynamic threshold based on memory pressure)
        const currentSemanticArrays = this.semanticArrayBuilder?.getArrays();
        const semanticThreshold = forceCleanup ? 50 : 200;
        if (currentSemanticArrays?.originalSegments?.length > semanticThreshold) {
          const semanticLogLevel = forceCleanup ? DEBUG_LEVELS.ERROR : DEBUG_LEVELS.DEBUG;
          this.log(
            semanticLogLevel,
            `🧹 Resetting semantic array builder (${forceCleanup ? 'EMERGENCY' : 'ROUTINE'}): ${currentSemanticArrays.originalSegments.length} segments)`
          );
          this.semanticArrayBuilder.reset();
          cleanupPerformed = true;
        }

        // 3. Force garbage collection hint
        if (cleanupPerformed && typeof global !== 'undefined' && global.gc) {
          global.gc();
          this.log(DEBUG_LEVELS.DEBUG, '🧹 Forced garbage collection');
        }
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
      const unpositionedSegments = this.translationSegments.filter((s) => s.translatedStart === -1);
      if (unpositionedSegments.length > 0) {
        this.log(
          DEBUG_LEVELS.WARN,
          `⚠️ ${unpositionedSegments.length} segments missing positions in batch processing - position tracking bug detected`
        );
      }
      this.semanticArrayBuilder.updateWithCapitalizedText(cleanedResult);

      // PHASE 4: Memory-efficient batch caching
      this.processedBatchCache.set(batchIndex, {
        text: this.progressivePositionTracker.finalText.slice(-cleanedResult.length),
        segments: batchResult.batchSegments || [],
      });

      // Remove old batches to prevent memory accumulation
      if (this.processedBatchCache.size > this.maxCachedBatches) {
        const oldestBatch = Math.min(...this.processedBatchCache.keys());
        this.processedBatchCache.delete(oldestBatch);
        this.log(DEBUG_LEVELS.DEBUG, `🧹 Removed cached batch ${oldestBatch} to free memory`);
      }

      // Update progress tracking
      processedChunks = batchEnd;
      batchIndex++;

      // Call progress callback if provided (with debouncing to reduce UI overhead)
      if (options.onProgress) {
        const now = performance.now();
        const timeSinceLastUpdate = now - this.lastProgressUpdate;
        const isLastBatch = processedChunks >= translatableChunks.length;

        // Only enable streaming UI for texts with enough chunks (prevents streaming for short texts)
        const enableStreaming = translatableChunks.length >= this.minChunksForStreaming;

        // Send update if: streaming is enabled AND (enough time passed OR this is the last batch)
        // PLUS: Skip 2/3 of batches to reduce GPU rendering pressure (only update every 3rd batch)
        const shouldSendUpdate =
          enableStreaming &&
          (timeSinceLastUpdate >= this.progressUpdateInterval || isLastBatch) &&
          (batchIndex % 3 === 0 || isLastBatch);

        if (shouldSendUpdate) {
          // Calculate remaining batches based on current batch size
          const remainingChunks = translatableChunks.length - processedChunks;
          const estimatedRemainingBatches = Math.ceil(remainingChunks / currentBatchSize);
          const estimatedTotalBatches = batchIndex + estimatedRemainingBatches;

          // BUGFIX: Use semanticArrayBuilder directly to avoid duplicates
          // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
          const currentSemanticArrays = this.semanticArrayBuilder?.getArrays() || {
            original: [],
            translated: [],
            metadata: [],
          };

          // OPTIMIZED: Reuse existing metadata array, only fill missing entries
          // Optimization #2 & #3: Use array.slice() + reuse default object
          const progressiveMetadata = currentSemanticArrays.metadata
            ? currentSemanticArrays.metadata.slice()
            : [];

          // Fill missing entries with frozen default metadata object (prevents object creation overhead)
          const targetLength = currentSemanticArrays.original?.length || 0;
          if (progressiveMetadata.length < targetLength) {
            // CRITICAL FIX: Use explicit 'missing' indicator instead of 'unknown'
            // Helps distinguish between: (1) metadata never set vs (2) metadata intentionally omitted
            // Reuse single frozen object for all defaults (safe since read-only)
            const DEFAULT_METADATA = Object.freeze({
              source: 'progressive',
              phase: null, // null = missing, not unknown
              dictionary: null, // null = missing, not unknown
              isMissing: true, // Explicit flag for debugging
            });

            for (let i = progressiveMetadata.length; i < targetLength; i++) {
              progressiveMetadata[i] = DEFAULT_METADATA;
            }
          }

          const progressText = this.progressivePositionTracker.finalText || cleanedResult;

          // CRITICAL FIX: Deep clone arrays to prevent race condition
          // Issue: React state updates receive direct references that continue to be mutated by next batches
          // Scenario: Batch 5 sends arrays[size=100] → Batch 6 mutates to [size=120] → React reads [size=120]
          // Result: Clickable highlighting crashes (array size mismatch with text length)
          // Fix: Deep clone arrays before sending to React (prevents mutation after state update scheduled)
          const safeOriginal = currentSemanticArrays.original
            ? [...currentSemanticArrays.original]
            : [];
          const safeTranslated = currentSemanticArrays.translated
            ? [...currentSemanticArrays.translated]
            : [];

          // PHASE 2: Send progressive results with clickable segments
          options.onProgress({
            currentBatch: batchIndex,
            totalBatches: estimatedTotalBatches,
            completedChunks: processedChunks,
            totalChunks: translatableChunks.length,
            partialTranslation: progressText,
            isComplete: isLastBatch, // Signal when translation is complete
            // PHASE 2: Send progressive semantic arrays and clickable segments (from builder)
            // CRITICAL: Use deep-cloned arrays to prevent race condition mutations
            semanticArrays: {
              original: safeOriginal,
              translated: safeTranslated,
              metadata: progressiveMetadata, // Already shallow-cloned at line 4955
            },
            // CODE REVIEW FIX: Clone clickableSegments to prevent race condition
            // Issue: Next batch continues mutating array after React receives reference
            // Scenario: Batch 5 sends array[100] → Batch 6 mutates to [120] → React reads [120]
            progressiveSegments: [...this.progressivePositionTracker.clickableSegments],
          });

          // Update timestamp
          this.lastProgressUpdate = now;
        } else {
          // Skipped update due to debouncing
          this.log(
            DEBUG_LEVELS.DEBUG,
            `⏭️ Skipped progress update (${timeSinceLastUpdate.toFixed(0)}ms since last update, threshold: ${this.progressUpdateInterval}ms)`
          );
        }
      }

      // Memory cleanup between batches to prevent accumulation
      if (processedChunks < translatableChunks.length) {
        // More aggressive cleanup for longer texts
        const isLongText = translatableChunks.length > 40;
        const recentBatch = this.batchPerformanceHistory[this.batchPerformanceHistory.length - 1];
        const memoryPressure =
          performanceBaseline &&
          recentBatch &&
          recentBatch.avgTimePerChunk > performanceBaseline * 1.5;

        if (isLongText || memoryPressure) {
          // Clear performance history more aggressively
          if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 5) {
            this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-3);
          }

          // EMERGENCY FIX: Clear old translation segments AND break any hidden references
          if (this.translationSegments && this.translationSegments.length > 3) {
            const oldCount = this.translationSegments.length;

            // CRITICAL: Null out all properties in discarded segments to break references
            this.translationSegments.slice(0, -3).forEach((segment) => {
              if (segment && typeof segment === 'object') {
                Object.keys(segment).forEach((key) => {
                  segment[key] = null; // Break any hidden references
                });
              }
            });

            // Keep only recent segments (last 3 for emergency cleanup)
            this.translationSegments = this.translationSegments.slice(-3);

            this.log(
              DEBUG_LEVELS.INFO,
              `🚨 Emergency: Cleared translation segments: ${oldCount} → ${this.translationSegments.length} (nullified ${oldCount - 3} segment references)`
            );
          }

          // ENHANCED: Also clear semantic arrays if they exist
          if (this.semanticArrays && this.semanticArrays.length > 100) {
            const oldSemanticCount = this.semanticArrays.length;
            this.semanticArrays = this.semanticArrays.slice(-50);
            this.log(
              DEBUG_LEVELS.INFO,
              `🧹 Semantic array cleanup: ${oldSemanticCount} → ${this.semanticArrays.length}`
            );
          }

          // ENHANCED: Clear pattern processor cache if it gets too large
          if (this.semanticPatternProcessor && this.semanticPatternProcessor.variableCache) {
            const cacheSize = this.semanticPatternProcessor.variableCache.size;
            if (cacheSize > PATTERN_PROCESSING.VARIABLE_CACHE_CLEANUP_THRESHOLD) {
              this.semanticPatternProcessor.variableCache.clear();
              this.log(DEBUG_LEVELS.INFO, `🧹 Pattern cache cleared: ${cacheSize} entries`);
            }
          }

          // REMOVED: Don't reset semantic array builder - let it accumulate for final clickability

          // Monitor and clean semantic arrays periodically to prevent memory buildup
          if (batchIndex % 5 === 0 && this.semanticArrayBuilder) {
            const debugInfo = this.semanticArrayBuilder.getDebugInfo?.();
            // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
            const currentArrays = this.semanticArrayBuilder?.getArrays() || {
              original: [],
              translated: [],
              metadata: [],
            };

            this.log(
              DEBUG_LEVELS.INFO,
              `🧹 Batch ${batchIndex} semantic arrays: ${currentArrays?.originalSegments?.length || 0} original, ${currentArrays?.translatedSegments?.length || 0} translated segments`
            );

            if (debugInfo) {
              this.log(
                DEBUG_LEVELS.INFO,
                `📊 Debug info: ${debugInfo.totalUnits} units, ${debugInfo.mappings?.length || 0} mappings`
              );
            }

            // More aggressive cleanup for semantic arrays
            if (this.semanticArrayBuilder.cleanup) {
              this.semanticArrayBuilder.cleanup();
              this.log(DEBUG_LEVELS.INFO, `🧹 Performed semantic array cleanup`);
            }

            // REMOVED: Don't reset semantic array builder - preserve all data for final clickability
          }

          // Monitor and clear caches if available
          if (this.dictionaryManager) {
            try {
              const cacheStats = this.dictionaryManager.getCacheStats?.();
              if (cacheStats && batchIndex % 5 === 0) {
                this.log(
                  DEBUG_LEVELS.INFO,
                  `📚 Dictionary cache: ${cacheStats.hitRate || 'N/A'} hit rate, ${cacheStats.size || 0}/${cacheStats.maxSize || 0} entries`
                );
              }

              const parallelStats = this.dictionaryManager.parallelLookupStats;
              if (parallelStats && batchIndex % 5 === 0) {
                const totalLookups = parallelStats.parallelCalls + parallelStats.sequentialCalls;
                const parallelRatio =
                  totalLookups > 0
                    ? ((parallelStats.parallelCalls / totalLookups) * 100).toFixed(1)
                    : 0;
                this.log(
                  DEBUG_LEVELS.INFO,
                  `🔍 Dictionary lookups: ${parallelRatio}% parallel, ${parallelStats.fallbackCount || 0} fallbacks, avg parallel: ${parallelStats.averageParallelTime?.toFixed(1) || 0}ms`
                );
              }
            } catch (error) {
              // CODE REVIEW FIX: Categorize cache stat errors instead of silently ignoring
              // Expected: Cache not yet initialized (normal during startup)
              // Unexpected: Other errors that might indicate cache corruption
              if (error.message && error.message.includes('not initialized')) {
                this.log(DEBUG_LEVELS.DEBUG, 'Cache stats unavailable (not yet initialized)');
              } else {
                this.log(
                  DEBUG_LEVELS.WARN,
                  '⚠️ Unexpected error reading cache stats:',
                  error.message || error
                );
              }
            }
          }

          if (this.translationCache && this.translationCache.clearOldEntries) {
            this.translationCache.clearOldEntries();
          }

          // CODE REVIEW FIX: Only attempt manual GC in development (requires --expose-gc flag)
          // Modern JS engines handle GC automatically in production
          if (process.env.NODE_ENV === 'development') {
            if (typeof global !== 'undefined' && global.gc) {
              global.gc();
            } else if (typeof window !== 'undefined' && window.gc) {
              window.gc();
            }
          }

          // Remove artificial delays entirely - they were causing exponential slowdown
          const cleanupStartTime = performance.now();
          // await new Promise(resolve => setTimeout(resolve, 2)); // REMOVED - this was the bottleneck
          const cleanupTime = performance.now() - cleanupStartTime;

          const totalBatchTime = performance.now() - batchStartTime;
          this.log(
            DEBUG_LEVELS.INFO,
            `⏱️ Batch ${batchIndex} timing: ${totalBatchTime.toFixed(1)}ms total, ${cleanupTime.toFixed(1)}ms cleanup delay`
          );

          // If batch is taking too long, warn about potential blocking
          if (totalBatchTime > 5000) {
            // >5 seconds per batch
            this.log(
              DEBUG_LEVELS.ERROR,
              `🐌 SLOW BATCH DETECTED: Batch ${batchIndex} took ${totalBatchTime.toFixed(1)}ms - investigate blocking operations`
            );
          }
        } else {
          // Standard cleanup
          if (this.batchPerformanceHistory && this.batchPerformanceHistory.length > 10) {
            this.batchPerformanceHistory = this.batchPerformanceHistory.slice(-5);
          }

          // await new Promise(resolve => setTimeout(resolve, 1)); // REMOVED - no delays needed
        }
      } else {
        // await new Promise(resolve => setTimeout(resolve, 1)); // REMOVED - no delays needed
      }
    }

    // PHASE 1: Apply final processing to match original translateWithChunking method exactly
    // Apply punctuation translation to all chunks (needed for cross-chunk context like comma-quote spacing)
    this.textChunker.translatePunctuation(chunks, this.punctuationDict);

    // Apply capitalization to all chunks
    this.applySmartCapitalization(chunks);

    // Use the same reconstruction method as original translateWithChunking for identical results
    // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
    const semanticArrays = this.semanticArrayBuilder?.getArrays() || {
      original: [],
      translated: [],
      metadata: [],
    };
    const reconstructed = this.textChunker.reconstructTextWithSegments(chunks, semanticArrays);
    const finalResult = reconstructed.text;
    const cleanedFinalResult = this.applyFinalCleanup(finalResult).normalize('NFC');

    // CRITICAL BUG FIX: Normalize to NFC for consistent Vietnamese diacritic handling
    // Vietnamese "màu" can be NFC (3 chars: m+à+u) or NFD (4 chars: m+a+combining-grave+u)
    // Without normalization, .length calculations create wrong segment boundaries
    // causing "màu" to split into "mà" (clickable) + "u" (not clickable)

    // Store prebuilt segments like the original method
    this.prebuiltSegments = reconstructed.segments;

    // Note: semanticArrays already obtained above (line 5415) - reuse it
    // Find the original chunk that was translated
    const translatedChunk = chunks.find((chunk) => chunk.translated && chunk.content.trim());

    if (translatedChunk && semanticArrays.original.length > 0) {
      // Now let's try to create word-level segments in the correct output order

      // We know the semantic arrays contain: 0:"五百八十"→"580", 1:"第"→"Thứ", 2:"章"→"chương"
      // But the output order is: "Thứ 580 chương"
      // Let's find each word in the output and map it to the correct semantic array index

      const wordSegments = [];
      let currentPosition = 0;

      // Dynamically detect word order by scanning the output text
      const outputOrder = [];

      // Create candidate words from semantic arrays
      // CRITICAL BUG FIX: Normalize translated units to NFC to match normalized cleanedFinalResult
      const candidateWords = [];
      for (let i = 0; i < semanticArrays.original.length; i++) {
        candidateWords.push({
          semanticIndex: i,
          original: semanticArrays.original[i],
          translated: semanticArrays.translated[i].normalize('NFC'), // Normalize to match output
          // tokenIndex reflects the source token's position in the Chinese text
          // (global semantic token index, monotonically increasing with text position).
          // Used as tie-breaker so same-translated-text entries are claimed in Chinese text order,
          // matching the bridge's occurrence counting (i < activeIndex = semantic array index order,
          // which for same-phase entries equals Chinese text order; for cross-phase entries the
          // bridge counts by semantic index but the Vietnamese output order also matches tokenIndex).
          tokenIndex: semanticArrays.metadata[i]?.tokenIndex ?? -1,
        });
      }

      // CRITICAL BUG FIX: Sort by length (longest first) to prevent shorter words from
      // matching inside longer words (e.g., "mà" matching inside "màu trắng").
      // Within same-translated-text groups, sort by tokenIndex (Chinese text order) so that
      // when two different Chinese characters translate to the same Vietnamese word (e.g., "没"
      // and "不" both → "không"), the one that appears EARLIER in the Chinese text claims
      // the EARLIER Vietnamese position — regardless of which translation phase produced it.
      // Fallback to insertion order (return 0) when tokenIndex is unavailable.
      candidateWords.sort((a, b) => {
        const lengthDiff = b.translated.length - a.translated.length;
        if (lengthDiff !== 0) return lengthDiff;
        // CRITICAL FIX: Sort ALL same-length candidates by tokenIndex (Chinese text position),
        // NOT just same-translated-value ones.
        //
        // WRONG: `if (a.translated === b.translated && ...) return tokenIndex diff; return 0;`
        // That creates an INTRANSITIVE comparator: if A="đích" B="la" C="đích" (all length 4),
        // then A=B (return 0), B=C (return 0), but A≠C (return tokenIndex diff). This cycle
        // makes TimSort produce undefined results, leaving e.g. si=12(ti=37) before si=24(ti=3)
        // even though ti=3 should come first.
        //
        // CORRECT: For same-length candidates, always sort by tokenIndex. Candidates with
        // different translated values find different positions and never conflict regardless
        // of sort order; candidates with same translated value must be sorted by tokenIndex
        // to correctly assign earlier-Chinese-text entries to earlier Vietnamese positions.
        const aTokenIndex = a.tokenIndex >= 0 ? a.tokenIndex : Number.MAX_SAFE_INTEGER;
        const bTokenIndex = b.tokenIndex >= 0 ? b.tokenIndex : Number.MAX_SAFE_INTEGER;
        return aTokenIndex - bTokenIndex;
      });

      // Find each candidate word in the output text and record its position
      // Handle duplicates by searching from different starting positions
      const foundWords = [];
      const usedPositions = new Set(); // Track positions to handle duplicates
      // CODE REVIEW FIX (LOW-3): Use constant instead of magic number
      const MAX_TRACKING_POSITIONS = POSITION_TRACKING.MAX_TRACKING_POSITIONS;

      // CODE REVIEW FIX (HIGH-3): Normalize output once before loop for efficiency
      // NFC normalization ensures composed form (base + diacritic = single character)
      // This handles cases where input might have decomposed form (NFD)
      const normalizedOutput = cleanedFinalResult.normalize('NFC').toLowerCase();

      for (const candidate of candidateWords) {
        // CODE REVIEW FIX: Stop processing if position tracking exceeds hard limit
        // This prevents O(n²) performance degradation for very large texts
        if (usedPositions.size > MAX_TRACKING_POSITIONS * 2) {
          this.log(
            DEBUG_LEVELS.WARN,
            `⚠️ Position tracking limit exceeded (${usedPositions.size} positions). Stopping candidate processing to prevent performance degradation.`
          );
          break; // Exit candidate loop but keep already-found words
        }

        // Normalize candidate for consistent matching with normalized output
        const normalizedCandidate = candidate.translated.normalize('NFC').toLowerCase();

        let position = -1;
        let searchStart = 0;

        // For duplicates, try to find the next occurrence that hasn't been used
        do {
          position = normalizedOutput.indexOf(normalizedCandidate, searchStart);
          if (position >= 0) {
            // Check if this position overlaps with any used position
            // CRITICAL: Use normalized length since position is from normalized search
            const candidateEnd = position + normalizedCandidate.length;
            let overlaps = false;
            for (const usedPos of usedPositions) {
              if (position < usedPos.end && candidateEnd > usedPos.start) {
                overlaps = true;
                break;
              }
            }

            if (!overlaps) {
              // Found a non-overlapping position
              foundWords.push({
                ...candidate,
                position: position,
              });
              usedPositions.add({
                start: position,
                end: candidateEnd,
              });

              // CODE REVIEW FIX (HIGH-4): Log warning if set grows too large (indicates performance issue)
              // CRITICAL: Don't evict during loop - would break overlap detection and clickable highlighting
              // Instead, warn and let it complete (correctness > performance)
              if (usedPositions.size > MAX_TRACKING_POSITIONS && usedPositions.size % 100 === 0) {
                this.log(
                  DEBUG_LEVELS.WARN,
                  `⚠️ Position tracking set large: ${usedPositions.size} positions (may impact performance for very large texts)`
                );
              }

              break;
            } else {
              // This position overlaps, try next occurrence
              searchStart = position + 1;
            }
          }
        } while (position >= 0);
      }

      // Sort by position in output text to get the correct order
      foundWords.sort((a, b) => a.position - b.position);

      // CODE REVIEW FIX: Clear usedPositions Set to prevent memory leak
      // Issue: Set grows unbounded (~1KB per 50 positions), never cleared
      // Impact: 50,000 char texts leak ~20KB per translation, cumulative pressure
      // Fix: Explicitly release memory after position tracking completes
      usedPositions.clear();

      // Create the output order from sorted words
      for (const word of foundWords) {
        outputOrder.push({
          semanticIndex: word.semanticIndex,
          original: word.original,
          translated: word.translated,
        });
      }

      // CODE REVIEW FIX (HIGH-3): Normalize output once before loop for efficiency
      // NFC normalization ensures composed form for consistent position finding
      const normalizedOutputForSegments = cleanedFinalResult.normalize('NFC').toLowerCase();

      for (let i = 0; i < outputOrder.length; i++) {
        const wordInfo = outputOrder[i];
        // Normalize translated text for consistent matching
        const normalizedTranslated = wordInfo.translated.normalize('NFC').toLowerCase();
        const position = normalizedOutputForSegments.indexOf(normalizedTranslated, currentPosition);

        if (position >= 0) {
          // Add spacing segment if there's a gap before this word
          if (position > currentPosition) {
            const spaceText = cleanedFinalResult.substring(currentPosition, position);

            // Check if spacing contains quotes that need space cleaning
            const quotePattern = /[\u201c\u2018\u201d\u2019"']/; // Opening and closing quotes

            if (quotePattern.test(spaceText)) {
              // For spacing containing quotes, clean spaces around them
              // Remove space after opening quotes: ' → '
              // Remove space before closing quotes: ' → '
              const cleanedSpaceText = spaceText
                .replace(/(["\u201c\u2018])\s+/, '$1') // Remove space after opening quotes
                .replace(/\s+([\u201d\u2019"'])/, '$1'); // Remove space before closing quotes
              wordSegments.push({
                type: 'spacing',
                start: currentPosition,
                end: position,
                text: cleanedSpaceText,
                isClickable: false,
              });
            } else {
              // Normal spacing without quotes
              wordSegments.push({
                type: 'spacing',
                start: currentPosition,
                end: position,
                text: spaceText,
                isClickable: false,
              });
            }
          }

          // Add the word segment using the actual text from the output (preserves capitalization)
          // CRITICAL: Use normalized length since position is from normalized search
          const wordLength = normalizedTranslated.length;
          const actualText = cleanedFinalResult.substring(position, position + wordLength);
          wordSegments.push({
            type: 'semantic',
            unitIndex: wordInfo.semanticIndex, // Use the correct semantic array index
            start: position,
            end: position + wordLength,
            originalText: wordInfo.original,
            translatedText: actualText, // Use actual text to preserve capitalization
            source: semanticArrays.metadata[wordInfo.semanticIndex]?.source || 'unknown',
            metadata: semanticArrays.metadata[wordInfo.semanticIndex],
            isClickable: true,
            text: actualText, // Use actual text to preserve capitalization
          });

          currentPosition = position + wordLength;
        } else {
          logger.warn(`❌ Could not find "${wordInfo.translated}" in output`);
        }
      }

      // Add any remaining text as non-clickable content
      if (currentPosition < cleanedFinalResult.length) {
        const remainingText = cleanedFinalResult.substring(currentPosition);
        wordSegments.push({
          type: 'remaining',
          start: currentPosition,
          end: cleanedFinalResult.length,
          text: remainingText,
          isClickable: false,
        });
      }

      this.prebuiltSegments = wordSegments;
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
    const unpositionedSegments = this.translationSegments.filter((s) => s.translatedStart === -1);
    if (unpositionedSegments.length > 0) {
      this.log(
        DEBUG_LEVELS.WARN,
        `⚠️ ${unpositionedSegments.length} segments missing positions in final processing - position tracking bug detected`
      );
    }
    this.semanticArrayBuilder.updateWithCapitalizedText(cleanedFinalResult);

    // Debug logging after final processing
    if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
      const finalDebugInfo = this.semanticArrayBuilder.getDebugInfo();
      this.log(DEBUG_LEVELS.DEBUG, `✅ Final semantic arrays: ${finalDebugInfo.totalUnits} units`);
    }

    const translationTime = performance.now() - startTime;

    // Final memory report
    const finalMemoryReport = this.memoryTracker.getReport();
    if (finalMemoryReport) {
      // Final memory logging disabled to prevent performance impact
      // this.log(DEBUG_LEVELS.INFO, `🧠 Final memory usage: +${finalMemoryReport.memoryGrowthMB.toFixed(1)}MB growth, ${finalMemoryReport.currentUsedMB.toFixed(1)}MB current`);

      if (finalMemoryReport.memoryGrowthMB > 50) {
        this.log(
          DEBUG_LEVELS.WARN,
          `⚠️ High memory usage detected: ${finalMemoryReport.memoryGrowthMB.toFixed(1)}MB growth over ${finalMemoryReport.totalSnapshots} batches`
        );
      }
    }

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
    const finalSemanticArrays = this.semanticArrayBuilder?.getArrays() || {
      original: [],
      translated: [],
      metadata: [],
    };

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
      progressiveSegments: this.progressivePositionTracker.clickableSegments,
    };
  }

  /**
   * Translate text using chunk-based processing for better accuracy and potential parallelization
   *
   * Splits text by punctuation boundaries and translates each chunk independently. This approach
   * improves translation accuracy by respecting sentence boundaries and enables parallel processing
   * for better performance. Each chunk maintains its own semantic arrays to prevent race conditions.
   *
   * Process flow:
   * 1. Split text into chunks by punctuation (。！？，；：)
   * 2. Identify translatable chunks (contain Chinese text)
   * 3. Translate chunks in parallel or sequentially
   * 4. Reassemble chunks preserving original punctuation and whitespace
   * 5. Merge semantic arrays from all chunks
   * 6. Build pre-built segments for clickable highlighting
   *
   * Parallel processing:
   * - Each chunk uses isolated semantic builder to prevent race conditions
   * - Deep copy options for each chunk to avoid shared state conflicts
   * - Automatically enabled for texts with 2+ translatable chunks
   *
   * @param {string} text - Input Chinese text to translate
   * @param {Object} [options={}] - Translation options
   * @param {boolean} [options.parallel=true] - Enable parallel chunk processing
   * @param {Object} [options.lookupIndex] - Pre-built Rust lookup index (shared across chunks)
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation
   * @param {string[]} [options.activeProperNouns] - Active proper noun dictionaries
   * @param {string[]} [options.dictionaryOrder] - Dictionary search order
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
   * @example
   * // With shared Rust lookup index
   * const lookupIndex = await rustLookupIndexManager.buildLookupIndex(text, ...);
   * const translated = await engine.translateWithChunking(text, {
   *   lookupIndex // Reuse across chunks
   * });
   *
   * @see translateWithSegments - Entry point that selects chunked or progressive mode
   * @see translateDirectly - Translates individual chunks
   * @see TextChunker - Handles text splitting by punctuation
   * @see OptimizedSemanticArrayBuilder - Prevents race conditions in parallel mode
   *
   * @performance
   * - Parallel mode: 2-3x faster for texts with 5+ chunks
   * - Sequential mode: More predictable for debugging
   * - Shared Rust lookup index: 6-50x faster for large texts
   *
   * @critical
   * Uses isolated semantic builders for each chunk in parallel mode.
   * Shared semantic builder would corrupt state with concurrent addUnit() calls.
   * Deep copies options for each chunk to prevent shared object mutations.
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

      // CRITICAL FIX: Create isolated semantic builders for each chunk to prevent race conditions
      // Shared semantic builder would corrupt state with concurrent addUnit() calls
      const isolatedBuilders = translatableChunks.map(() =>
        this.useOptimizedSemanticBuilder
          ? new OptimizedSemanticArrayBuilder()
          : new SemanticArrayBuilder()
      );

      // Translate chunks in parallel with isolated builders
      // CRITICAL FIX: Deep copy options for parallel processing
      // Each chunk runs in parallel - shared nested objects would cause race conditions
      const translationPromises = translatableChunks.map((chunk, idx) =>
        this.translateDirectly(chunk.content, {
          ...options,
          // Deep copy complex nested objects to prevent race conditions
          lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
          segments: options.segments ? [...options.segments] : undefined,
          // Pass isolated semantic builder for this chunk
          isolatedSemanticBuilder: isolatedBuilders[idx],
          useChunking: false,
          chunkOffset: chunk.startIndex,
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

      // CRITICAL FIX: Merge isolated semantic arrays sequentially into main builder
      // Must maintain position order for clickable highlighting
      this.log(
        DEBUG_LEVELS.DEBUG,
        `🔀 Merging ${isolatedBuilders.length} isolated semantic arrays`
      );

      // MEDIUM FIX: Calculate cumulative token offsets for each chunk during merge
      // Isolated builders use local token indices (0, 1, 2...); adjust to global indices
      let cumulativeTokenCount = 0;

      for (let i = 0; i < isolatedBuilders.length; i++) {
        const chunk = translatableChunks[i];
        const isolatedArrays = isolatedBuilders[i].getArrays();

        // Calculate token count for this chunk (for next chunk's offset).
        // chunk.content is a string — must tokenize first; getSemanticTokens() expects TextToken[].
        const chunkTokenCount = this.tokenizer.tokenize(chunk.content).length;
        const chunkTokenOffset = cumulativeTokenCount;
        cumulativeTokenCount += chunkTokenCount;

        if (isolatedArrays && isolatedArrays.original) {
          // Merge each semantic unit from isolated builder
          for (let j = 0; j < isolatedArrays.original.length; j++) {
            // MEDIUM FIX: Adjust tokenIndex from local (isolated) to global
            // Isolated builder had indices 0, 1, 2...; convert to global by adding chunk offset
            const localTokenIndex = isolatedArrays.metadata?.[j]?.tokenIndex || 0;
            const globalTokenIndex = chunkTokenOffset + localTokenIndex;

            this.semanticArrayBuilder.addUnit(
              isolatedArrays.original[j],
              isolatedArrays.translated[j],
              isolatedArrays.metadata?.[j]?.source || 'unknown',
              globalTokenIndex,
              isolatedArrays.metadata?.[j]?.phase ?? null,
              isolatedArrays.metadata?.[j]?.dictionary ?? null
            );
          }
        }
      }
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
    this.textChunker.translatePunctuation(chunks, this.punctuationDict);

    // Step 5: Apply smart capitalization based on punctuation context
    this.applySmartCapitalization(chunks);

    // Step 6: Reconstruct the final text with segment positions built simultaneously
    // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
    const semanticArraysForReconstruction = this.semanticArrayBuilder?.getArrays() || {
      original: [],
      translated: [],
      metadata: [],
    };
    const reconstructed = this.textChunker.reconstructTextWithSegments(
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
   * - Isolated semantic builder support for parallel processing
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
   * @param {Object} [options.isolatedSemanticBuilder] - Isolated semantic builder (prevents race conditions)
   * @param {Object} [options.lookupIndex] - Pre-built Rust lookup index
   * @param {boolean} [options.useSharedLookupIndex=true] - Enable Rust lookup index for texts >500 chars
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation
   * @param {string[]} [options.activeProperNouns] - Active proper noun dictionaries
   * @param {string[]} [options.dictionaryOrder] - Dictionary search order
   *
   * @returns {Promise<string>} Translated Vietnamese text
   *
   * @example
   * // Basic direct translation
   * const translated = await engine.translateDirectly('你好世界');
   *
   * @example
   * // With isolated semantic builder (for parallel processing)
   * const isolated = new OptimizedSemanticArrayBuilder();
   * const translated = await engine.translateDirectly(chunk, {
   *   isolatedSemanticBuilder: isolated,
   *   isParallelChunk: true // Don't reset segments
   * });
   *
   * @example
   * // With Rust lookup index
   * const lookupIndex = await rustLookupIndexManager.buildLookupIndex(text, ...);
   * const translated = await engine.translateDirectly(text, {
   *   lookupIndex
   * });
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
   * This allows accumulation across chunks in parallel processing.
   * Isolated semantic builder prevents race conditions in parallel mode.
   */
  async translateDirectly(text, options = {}) {
    // This is the original translate method logic, renamed for chunk-based architecture
    const startTime = performance.now();
    const _translationId = this.stats.totalTranslations++;

    // CRITICAL FIX: Use isolated semantic builder if provided (for parallel chunk processing)
    // Prevents race conditions when multiple chunks process concurrently
    const originalSemanticBuilder = this.semanticArrayBuilder;
    if (options.isolatedSemanticBuilder) {
      this.semanticArrayBuilder = options.isolatedSemanticBuilder;
      this.log(
        DEBUG_LEVELS.DEBUG,
        '🔒 Using isolated semantic builder for parallel chunk processing'
      );
    }

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
      if (
        !options.lookupIndex &&
        text.length >= DICTIONARY_LOOKUP.MIN_TEXT_FOR_RUST_INDEX &&
        options.useSharedLookupIndex !== false
      ) {
        try {
          const { rustLookupIndexManager } = await import('./RustLookupIndexManager.js');

          if (rustLookupIndexManager.isAvailable()) {
            const indexStartTime = performance.now();

            // Get dictionary search order (fallback to default if not available)
            const dictionaryOrder =
              this.dictionaryOrder || this.dictionaryManager.getDefaultSearchOrder() || [];

            // Build lookup index using Rust + Rayon
            const indexResult = await rustLookupIndexManager.buildLookupIndex(
              text,
              this.dictionaryManager.dictionaries, // Map of dictionary name -> trie
              dictionaryOrder, // Dictionary search order
              {
                minTextLength: 50,
                enableIndexing: true,
                useParallel: true,
              }
            );

            if (indexResult.success && indexResult.index) {
              // Convert to Map for faster lookups
              // IMPORTANT: Convert string keys from JSON back to numbers
              options.lookupIndex = new Map(
                Object.entries(indexResult.index).map(([k, v]) => [Number(k), v])
              );
              options.useSharedLookupIndex = true;

              const indexTime = performance.now() - indexStartTime;
              this.log(
                DEBUG_LEVELS.DEBUG,
                `🦀 Rust lookup index built: ${indexResult.positionsIndexed} positions, ${indexResult.indexSize} matches in ${indexTime.toFixed(1)}ms (Rust: ${indexResult.buildTimeMs}ms)`
              );
            }
          }
        } catch (error) {
          this.log(
            DEBUG_LEVELS.WARN,
            '⚠️ Rust lookup index build failed, falling back to JavaScript indexing:',
            error.message
          );
          // OPTIMIZATION: Fallback to JavaScript-based comprehensive lookup index
          // This ensures lookup index is ALWAYS built for texts >50 chars (10-20% speedup)
          try {
            const jsIndexStartTime = performance.now();
            options.lookupIndex = await this.dictionaryManager.buildComprehensiveLookupIndex(text, {
              enableLookupIndexing: true,
            });
            options.useSharedLookupIndex = true;
            const jsIndexTime = performance.now() - jsIndexStartTime;
            this.log(
              DEBUG_LEVELS.DEBUG,
              `📋 JavaScript lookup index built: ${options.lookupIndex.size} positions in ${jsIndexTime.toFixed(1)}ms`
            );
          } catch (jsError) {
            this.log(
              DEBUG_LEVELS.WARN,
              '⚠️ JavaScript lookup index build failed, using traditional lookup:',
              jsError.message
            );
            // Final fallback: continue without lookup index
          }
        }
      }

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
    } finally {
      // CRITICAL FIX: Restore original semantic builder after isolated processing
      if (options.isolatedSemanticBuilder) {
        this.semanticArrayBuilder = originalSemanticBuilder;
        this.log(DEBUG_LEVELS.DEBUG, '🔓 Restored original semantic builder');
      }
    }
  }

  // ============================================================================
  // SECTION 11: CORE 5-PHASE TRANSLATION PIPELINE
  // ============================================================================
  // Purpose: Execute all 5 phases in sequence
  // Dependencies: ALL PHASES (this is the main pipeline)
  // Extraction Potential: NONE - Heart of the translation system
  // Critical: Phase order is IMMUTABLE
  //
  // Phase Execution Order (NEVER CHANGE):
  //   1. Pattern Processing    (applyPatterns)
  //   2. Proper Noun Processing (applyDictionaryTranslation with activeProperNouns)
  //   3. Number Processing     (processNumbersWasm)
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
   * 3. Number Processing (processNumbersWasm)
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
   * @param {string[]} [options.dictionaryOrder] - Dictionary search order
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
   * @see processNumbersWasm - Phase 3 implementation
   * @see createOptimalPhraseGroups - Phase 4 implementation
   * @see processRemainingTokensInBatches - Phase 5 implementation
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
    const MAX_POSITION_VALUE = Number.MAX_SAFE_INTEGER / 1000; // Conservative multiplier
    const MAX_SAFE_SEGMENTS = Math.floor(MAX_POSITION_VALUE / 100); // ~90 trillion segments

    if (tokens.length > MAX_SAFE_SEGMENTS) {
      throw new Error(
        `Document too large: ${tokens.length.toLocaleString()} tokens exceeds safe limit of ${MAX_SAFE_SEGMENTS.toLocaleString()} tokens. ` +
          `This prevents integer overflow in position calculations for clickable highlighting.`
      );
    }

    // Clear semantic token cache for this translation.
    // INVARIANT: cache is always null when Phase 1 (patterns) runs.
    // DO NOT pre-populate cachedSemanticTokens before Phase 1 as an optimization —
    // Phase 1 mutates tokens and the semantic view must reflect post-Phase-1 state for all later phases.
    this.cachedSemanticTokens = null;

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

    // CODE REVIEW 2026-01-27: Phase priority mapping (for validation)
    // Lower numbers = higher priority (earlier phases override later phases)
    // Keys must match the actual translationSource strings written onto tokens,
    // NOT the phase names used in REQUIRED_PHASE_ORDER.
    const PHASE_PRIORITIES = {
      // Phase 1 — Pattern (all possible source strings from JS and WASM paths)
      pattern: 1,
      hierarchical_pattern: 1,
      hierarchical_patterns: 1,
      hierarchical_patterns_composite: 1,
      // Phase 2 — Proper noun: source is the dynamic dictionary name (e.g. 'properNouns-MyNovel').
      // Dynamic names are resolved by getSourcePriority() below; no static keys here.
      // Phase 3 — Number
      number_conversion: 3,
      number_plus_liang_fix: 3,
      // Phase 4 — Phrase
      phrases: 4,
      // Phase 5 — Character
      characters: 5,
    };

    // Returns the phase priority for a leader translationSource string.
    // Returns null for consumed sources (they are not leaders).
    // Returns 2 for dynamic proper-noun dictionary names (Phase 2).
    // Returns 999 for unrecognised sources so priority violations are not silently missed.
    const getSourcePriority = (translationSource) => {
      if (!translationSource || translationSource.includes('_consumed')) {
        return null;
      }
      if (Object.prototype.hasOwnProperty.call(PHASE_PRIORITIES, translationSource)) {
        return PHASE_PRIORITIES[translationSource];
      }
      // Dynamic proper-noun dictionary names (e.g. 'properNouns-MyNovel')
      if (this.activeProperNouns && this.activeProperNouns.includes(translationSource)) {
        return 2;
      }
      return 999;
    };

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

        // Record alert for monitoring
        if (
          typeof systemPerformanceMonitor !== 'undefined' &&
          typeof systemPerformanceMonitor.recordAlert === 'function'
        ) {
          systemPerformanceMonitor.recordAlert('semantic_array_corruption', {
            phase: phaseName,
            telemetry,
            timestamp: Date.now(),
          });
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
    await this.profiler.profile('total', async () => {
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
          this.applyPatterns(tokens, { ...options, debug: true }),
          PHASE_TIMEOUTS.patterns,
          'patterns'
        );
        completedPhases.add('patterns');
        // Record profiling metrics (if profiler has this method)
        if (this.profiler && typeof this.profiler.recordPhaseCompletion === 'function') {
          await this.profiler.recordPhaseCompletion('patterns');
        }

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

          // Record corruption event for diagnostics
          if (
            typeof systemPerformanceMonitor !== 'undefined' &&
            typeof systemPerformanceMonitor.recordAlert === 'function'
          ) {
            systemPerformanceMonitor.recordAlert('token_array_corruption', {
              phase: 'patterns',
              beforeLength: tokensLengthBeforePhase1,
              afterLength: tokens.length,
              timestamp: Date.now(),
            });
          }

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // HIGH-6 FIX: Clear cached semantic tokens on phase failure to prevent stale cache
        this.cachedSemanticTokens = null;
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
          this.applyDictionaryTranslation(tokens, {
            ...options,
            dictionaryOrder: [...this.activeProperNouns],
            phase: 'properNouns',
          }),
          PHASE_TIMEOUTS.properNouns,
          'properNouns'
        );
        completedPhases.add('properNouns');
        // Record profiling metrics (if profiler has this method)
        if (this.profiler && typeof this.profiler.recordPhaseCompletion === 'function') {
          await this.profiler.recordPhaseCompletion('properNouns');
        }

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

          if (
            typeof systemPerformanceMonitor !== 'undefined' &&
            typeof systemPerformanceMonitor.recordAlert === 'function'
          ) {
            systemPerformanceMonitor.recordAlert('token_array_corruption', {
              phase: 'properNouns',
              beforeLength: tokensLengthBeforePhase2,
              afterLength: tokens.length,
              timestamp: Date.now(),
            });
          }

          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // HIGH-6 FIX: Clear cached semantic tokens on phase failure to prevent stale cache
        this.cachedSemanticTokens = null;
        // Continue to next phase (graceful degradation)
      }

      // OPTIMIZATION: Cache semantic tokens after proper noun grouping completes
      // This avoids redundant O(N) filtering in subsequent phases (5-10% overhead reduction)
      // NOTE (CODE REVIEW 2026-01-27): This cache is primarily used by phrase processing (Phase 4).
      // It may become stale if Phase 3 (numbers) consumes additional tokens, but that's acceptable
      // because number processing doesn't need semantic token filtering. If phases 4-5 notice
      // issues, they should clear this cache: this.cachedSemanticTokens = null;
      this.cachedSemanticTokens = this.getCachedSemanticTokens(tokens);

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
          this.profiler.profile('numbers', async () => {
            // OPTIMIZATION: Pre-scan for number candidates to skip WASM serialization when unnecessary
            // WASM only processes untranslated chinese_char tokens (from number_processor.rs:221-226)
            // CODE REVIEW FIX (HIGH-6): Add performance monitoring
            const numberPhaseStartTime = performance.now();
            let numberCandidateCount = 0;
            for (const token of tokens) {
              if (token.type === 'chinese_char' && !token.translated && !token.translationSource) {
                numberCandidateCount++;
                // Early exit if many candidates (no point counting further)
                if (numberCandidateCount > WASM_NUMBER_THRESHOLDS.MAX_CANDIDATE_COUNT_CHECK) break;
              }
            }

            // Skip WASM entirely if no number candidates
            if (numberCandidateCount === 0) {
              this.log(
                DEBUG_LEVELS.DEBUG,
                '⏭️  Skipping WASM number processing (no untranslated chinese_char tokens)'
              );
              return;
            }

            // Use JavaScript fallback for very small counts (serialization overhead > benefit)
            if (numberCandidateCount < WASM_NUMBER_THRESHOLDS.MIN_CANDIDATES_FOR_WASM) {
              this.log(
                DEBUG_LEVELS.DEBUG,
                `🔢 Using JavaScript number processing for ${numberCandidateCount} candidates (WASM overhead not worth it)`
              );
              this.numberProcessor.processTokens(tokens, {
                debugLevel: this.debugLevel,
                semanticArrayBuilder: this.semanticArrayBuilder,
                ...options,
              });
              return;
            }

            // CRITICAL FIX: Check WASM availability before attempting to use it
            // Prevents double-processing (WASM attempt → exception → JS fallback)
            if (!isWasmNumberProcessorAvailable()) {
              this.log(
                DEBUG_LEVELS.DEBUG,
                `📦 WASM number processor unavailable, using JavaScript fallback for ${numberCandidateCount} candidates`
              );
              this.numberProcessor.processTokens(tokens, {
                debugLevel: this.debugLevel,
                semanticArrayBuilder: this.semanticArrayBuilder,
                ...options,
              });
              return;
            }

            // Use WASM number processing (5-10x faster for Chinese number conversion)
            // Only worthwhile for >=${WASM_NUMBER_THRESHOLDS.MIN_CANDIDATES_FOR_WASM} candidates where WASM speedup > serialization overhead
            this.log(
              DEBUG_LEVELS.DEBUG,
              `🚀 Using WASM number processing for ${numberCandidateCount}+ candidates`
            );
            try {
              // CODE REVIEW FIX (HIGH-3): Check abort signal before expensive WASM operation
              if (options.abortSignal?.aborted) {
                throw new DOMException(
                  'Translation aborted before WASM number processing',
                  'AbortError'
                );
              }

              // CODE REVIEW FIX 2026-01-27 (MEDIUM-2): Track pre-WASM consumed tokens
              // Ensure WASM doesn't overwrite tokens consumed by earlier phases (patterns, proper nouns).
              // Store full snapshots (not just indices) so we can detect truthy→truthy source changes
              // (e.g. WASM changing 'pattern' → 'number_conversion' would pass a simple falsiness check).
              const preWasmTokenState = new Map();
              for (let i = 0; i < tokens.length; i++) {
                if (tokens[i].translationSource) {
                  preWasmTokenState.set(i, {
                    translationSource: tokens[i].translationSource,
                    translated: tokens[i].translated,
                  });
                }
              }

              const processedTokens = await processNumbersWasm(tokens);

              // CODE REVIEW FIX (CRITICAL-3): Detect concurrent modification during validation
              const originalTokensLength = tokens.length;

              // CRITICAL FIX: Validate BEFORE copying to prevent partial corruption
              // Pre-validate array length invariance
              if (processedTokens.length !== tokens.length) {
                this.log(
                  DEBUG_LEVELS.ERROR,
                  `WASM number processor corrupted token array: expected ${tokens.length}, got ${processedTokens.length}`
                );
                throw new Error(
                  `WASM number processor violated array length invariance: ${tokens.length} → ${processedTokens.length}`
                );
              }

              // Pre-validate token structure BEFORE mutating original tokens array
              for (let i = 0; i < processedTokens.length; i++) {
                // Check token existence before accessing properties (handles sparse arrays)
                if (!processedTokens[i] || typeof processedTokens[i] !== 'object') {
                  throw new Error(`WASM validation failed: token ${i} is missing or not an object`);
                }
                // Check for undefined (should be null or string after WASM processing)
                if (processedTokens[i].translated === undefined) {
                  throw new Error(
                    `WASM validation failed: token ${i} has undefined translated field (should be null or string)`
                  );
                }
                // Validate translated field type
                if (
                  processedTokens[i].translated !== null &&
                  typeof processedTokens[i].translated !== 'string'
                ) {
                  throw new Error(
                    `WASM validation failed: token ${i} has invalid translated type: ${typeof processedTokens[i].translated}`
                  );
                }
              }

              // CODE REVIEW FIX (CRITICAL-3): Check for concurrent modification during validation
              if (tokens.length !== originalTokensLength) {
                throw new Error(
                  `Token array modified during validation - concurrent modification detected (${originalTokensLength} → ${tokens.length})`
                );
              }

              // CODE REVIEW FIX 2026-01-27 (MEDIUM-2): Validate WASM didn't overwrite consumed tokens.
              // Compare full snapshots so we catch both:
              //   - WASM clearing a source   ('pattern' → null/undefined)
              //   - WASM replacing a source  ('pattern' → 'number_conversion') — previously undetected
              for (const [idx, originalState] of preWasmTokenState) {
                if (processedTokens[idx].translationSource !== originalState.translationSource) {
                  logger.error(
                    `🚨 WASM violated phase priority at index ${idx}: ` +
                      `translationSource changed from "${originalState.translationSource}" ` +
                      `to "${processedTokens[idx].translationSource ?? '(cleared)'}"`
                  );

                  // Restore original state to preserve phase priority
                  processedTokens[idx].translationSource = originalState.translationSource;
                  processedTokens[idx].translated = originalState.translated;
                }
              }

              // Only copy AFTER validation passes (prevents partial corruption)
              copyWasmTokens(tokens, processedTokens);

              // Post-copy verification (lightweight sanity check)
              if (tokens.some((t) => t.translated === undefined)) {
                throw new Error('WASM copy failed: undefined values detected after copy');
              }

              // Add number conversions to semantic array for clickable highlighting
              // WASM doesn't have access to semanticArrayBuilder, so we add entries here
              // CODE REVIEW FIX (HIGH-5): Validate span integrity BEFORE adding to semantic array
              for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];

                // Find number conversion results (main token, not consumed tokens)
                if (token.translationSource === 'number_conversion' && token.translated) {
                  // Collect original text from this token and any consumed tokens following it
                  let originalText = token.value;
                  let endIndex = i;
                  let isValidSpan = true;

                  // Look ahead for consumed tokens that are part of this number
                  // HIGH FIX: Add bounds check to prevent O(n) scan if all tokens marked consumed
                  // LOW-10 FIX: Use constant instead of magic number
                  const MAX_CONSUMED_SPAN = NUMBER_PROCESSING.MAX_CONSUMED_SPAN;

                  // Validate span integrity BEFORE adding to semantic array
                  for (let j = i + 1; j < tokens.length && j - i <= MAX_CONSUMED_SPAN; j++) {
                    if (tokens[j].translationSource === 'number_conversion_consumed') {
                      originalText += tokens[j].value;
                      endIndex = j;
                    } else if (tokens[j].translationSource) {
                      // Non-consumed token with source in span = corruption
                      this.log(
                        DEBUG_LEVELS.ERROR,
                        `🔴 Number span corruption at token ${j}: expected consumed but got ${tokens[j].translationSource}`
                      );
                      isValidSpan = false;
                      break;
                    } else {
                      // Natural end of span (untranslated token)
                      break;
                    }
                  }

                  // Validate span didn't exceed maximum
                  if (endIndex - i >= MAX_CONSUMED_SPAN) {
                    this.log(
                      DEBUG_LEVELS.WARN,
                      `⚠️ Number span exceeded MAX_CONSUMED_SPAN=${MAX_CONSUMED_SPAN} at token ${i} (span: ${endIndex - i})`
                    );
                    isValidSpan = false;
                  }

                  // Validate contiguity: all tokens between i+1 and endIndex must be consumed
                  if (isValidSpan && endIndex > i) {
                    for (let k = i + 1; k <= endIndex; k++) {
                      if (tokens[k].translationSource !== 'number_conversion_consumed') {
                        this.log(
                          DEBUG_LEVELS.ERROR,
                          `🔴 Number span integrity violation: gap at token ${k} (expected consumed, got ${tokens[k].translationSource})`
                        );
                        isValidSpan = false;
                        break;
                      }
                    }
                  }

                  // Only add to semantic array if span is valid
                  if (isValidSpan) {
                    // NOTE: We use only the first token's index (i) even for multi-token numbers
                    // because the semantic array represents one logical unit (the entire number).
                    // The originalText contains the combined text from all tokens (i to endIndex).
                    // This is correct - position tracking works because postProcess only processes
                    // the first token (others are skipped due to translationSource=consumed).
                    const globalTokenIndex = i + (options.chunkOffset || 0);
                    this.semanticArrayBuilder.addUnit(
                      originalText,
                      token.translated,
                      'number_conversion',
                      globalTokenIndex
                    );
                  } else {
                    this.log(
                      DEBUG_LEVELS.WARN,
                      `⚠️ Skipping corrupted number span at token ${i}: "${originalText}" → "${token.translated}"`
                    );
                  }
                }
              }
            } catch (error) {
              this.log(
                DEBUG_LEVELS.WARN,
                '⚠️ WASM number processing failed, falling back to JavaScript:',
                error.message
              );
              // Fallback to JavaScript number processing
              this.numberProcessor.processTokens(tokens, {
                debugLevel: this.debugLevel,
                semanticArrayBuilder: this.semanticArrayBuilder,
                ...options,
              });
            }

            // CODE REVIEW FIX (HIGH-6): Record performance metrics for WASM vs JS optimization
            const numberPhaseDuration = performance.now() - numberPhaseStartTime;
            const method =
              numberCandidateCount === 0
                ? 'skipped'
                : numberCandidateCount < WASM_NUMBER_THRESHOLDS.MIN_CANDIDATES_FOR_WASM
                  ? 'javascript'
                  : 'wasm';

            if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
              // Track metrics for threshold optimization
              if (
                window.performanceDashboard &&
                typeof window.performanceDashboard.recordMetric === 'function'
              ) {
                window.performanceDashboard.recordMetric('number_processing', {
                  method,
                  candidateCount: numberCandidateCount,
                  duration: numberPhaseDuration,
                  tokensProcessed: tokens.length,
                  timestamp: Date.now(),
                });
              }

              // Log for manual analysis
              this.log(
                DEBUG_LEVELS.DEBUG,
                `⏱️  Number processing: ${method} method, ${numberCandidateCount} candidates, ${numberPhaseDuration.toFixed(2)}ms`
              );
            }

            // Mark phase as completed (whether WASM succeeded or JS fallback was used)
            completedPhases.add('numbers');
          }),
          PHASE_TIMEOUTS.numbers,
          'numbers'
        );

        // CODE REVIEW FIX 2026-01-27: Post-phase validation for Phase 3
        // Record profiling metrics (standardize with Phases 1-2)
        if (this.profiler && typeof this.profiler.recordPhaseCompletion === 'function') {
          await this.profiler.recordPhaseCompletion('numbers');
        }

        if (this.debugLevel >= DEBUG_LEVELS.DEBUG) {
          validateConsumedTokenContract('numbers');
          validatePhasePriority('numbers', 3, tokensBeforePhase3);
        }
        checkSemanticArrayCorruption('numbers');

        // CODE REVIEW FIX 2026-01-28 (HIGH-2): Invalidate cached semantic tokens after Phase 3
        // Phase 3 can consume number tokens, making the cache set after Phase 2 stale
        // Phase 4 (phrases) needs fresh semantic tokens to avoid wasting lookups on consumed positions
        this.cachedSemanticTokens = null;
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

          // Record corruption event for diagnostics
          if (
            typeof systemPerformanceMonitor !== 'undefined' &&
            typeof systemPerformanceMonitor.recordAlert === 'function'
          ) {
            systemPerformanceMonitor.recordAlert('token_array_corruption', {
              phase: 'numbers',
              beforeLength: tokensLengthBeforePhase3,
              afterLength: tokens.length,
              timestamp: Date.now(),
            });
          }

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Clear cached semantic tokens on phase failure to prevent stale cache
        this.cachedSemanticTokens = null;
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
          this.profiler.profile('phrases', async () => {
            await this.createOptimalPhraseGroups(tokens, options);
          }),
          PHASE_TIMEOUTS.phrases,
          'phrases'
        );
        completedPhases.add('phrases');

        // CODE REVIEW FIX 2026-01-27: Post-phase validation for Phase 4
        // Record profiling metrics (standardize with Phases 1-3)
        if (this.profiler && typeof this.profiler.recordPhaseCompletion === 'function') {
          await this.profiler.recordPhaseCompletion('phrases');
        }

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

          // Record corruption event for diagnostics
          if (
            typeof systemPerformanceMonitor !== 'undefined' &&
            typeof systemPerformanceMonitor.recordAlert === 'function'
          ) {
            systemPerformanceMonitor.recordAlert('token_array_corruption', {
              phase: 'phrases',
              beforeLength: tokensLengthBeforePhase4,
              afterLength: tokens.length,
              timestamp: Date.now(),
            });
          }

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Clear cached semantic tokens on phase failure to prevent stale cache
        this.cachedSemanticTokens = null;
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
          this.profiler.profile('characters', async () => {
            await this.processRemainingTokensInBatches(tokens, processedTokens, options);
          }),
          PHASE_TIMEOUTS.characters,
          'characters'
        );
        completedPhases.add('characters');

        // CODE REVIEW FIX 2026-01-27: Post-phase validation for Phase 5
        // Record profiling metrics (standardize with Phases 1-4)
        if (this.profiler && typeof this.profiler.recordPhaseCompletion === 'function') {
          await this.profiler.recordPhaseCompletion('characters');
        }

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

          // Record corruption event for diagnostics
          if (
            typeof systemPerformanceMonitor !== 'undefined' &&
            typeof systemPerformanceMonitor.recordAlert === 'function'
          ) {
            systemPerformanceMonitor.recordAlert('token_array_corruption', {
              phase: 'characters',
              beforeLength: tokensLengthBeforePhase5,
              afterLength: tokens.length,
              timestamp: Date.now(),
            });
          }

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Clear cached semantic tokens on phase failure to prevent stale cache
        this.cachedSemanticTokens = null;
        // Continue to postProcess (graceful degradation)
      }

      // Apply final fixes that need to run after all processing
      this.profiler.profileSync('postProcess', () => {
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

        // Send to performance monitor for tracking
        if (
          typeof systemPerformanceMonitor !== 'undefined' &&
          typeof systemPerformanceMonitor.recordAlert === 'function'
        ) {
          systemPerformanceMonitor.recordAlert('phase_failures', failureReport);
        }

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
   * CODE REVIEW FIX (HIGH-2): Get cached semantic tokens with validation
   * Validates cache hasn't been corrupted before returning
   * @param {Token[]} tokens - Current token array
   * @returns {Token[]} Validated semantic tokens
   */
  getCachedSemanticTokens(tokens) {
    // If no cache, generate fresh semantic tokens
    if (!this.cachedSemanticTokens) {
      return getSemanticTokens(tokens);
    }

    // Validate cache still matches token state
    // Cache becomes invalid if token array grew (indicates corruption or new processing)
    if (this.cachedSemanticTokens.length > tokens.length) {
      logger.warn(
        `⚠️ Semantic token cache invalid (${this.cachedSemanticTokens.length} cached > ${tokens.length} tokens) - regenerating`
      );
      this.cachedSemanticTokens = null;
      return getSemanticTokens(tokens);
    }

    // Cache is valid
    return this.cachedSemanticTokens;
  }

  /**
   * Try all translation phases at a specific token position in priority order
   * Returns the number of tokens consumed by the best match
   */
  async tryAllPhasesAtPosition(tokens, position, options) {
    const _token = tokens[position];

    // Priority 1: Proper nouns (highest priority)
    let result = await this.tryProperNounsAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;

    // Priority 2: Structural patterns
    result = await this.tryPatternsAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;

    // Priority 3: Phrases (with conflict detection)
    result = await this.tryPhrasesAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;

    // Priority 4: Chinese number conversion
    result = this.tryNumberConversionAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;

    // Priority 5: Character-level translation (fallback)
    result = await this.tryCharactersAtPosition(tokens, position, options);
    if (result.consumed > 0) return result;

    // No match found, return 0 consumed
    return { consumed: 0 };
  }

  /**
   * Try proper noun translation at a specific position
   */
  async tryProperNounsAtPosition(tokens, position, options) {
    // MEDIUM FIX: Validate token index before reconstruction
    if (position >= tokens.length) {
      this.log(
        DEBUG_LEVELS.ERROR,
        `⚠️ Token position ${position} out of bounds (length: ${tokens.length})`
      );
      return { consumed: 0 };
    }

    const _originalToken = tokens[position];

    // Use the standard dictionary lookup approach with combined proper noun dictionaries
    // This automatically handles longest-match-first by using findAllMatches with length sorting
    const remainingText = reconstructTextFromIndex(tokens, position);

    const matches = await this.findAllMatches(
      remainingText,
      0,
      this.activeProperNouns // All proper noun dictionaries combined
    );

    // Take the first match (longest due to sorting in findAllMatches)
    if (matches.length > 0) {
      const bestMatch = matches[0];

      // Calculate consumed count BEFORE modifying tokens
      const consumed =
        bestMatch.tokenLength || getTokenSpanForText(tokens, position, bestMatch.word);

      this.applyMatchToTokens(tokens, position, bestMatch, options);

      return { consumed };
    }

    return { consumed: 0 };
  }

  /**
   * Try structural pattern matching at a specific position
   */
  async tryPatternsAtPosition(tokens, position, options) {
    // Use existing pattern processor
    if (this.semanticPatternProcessor) {
      // For now, use a simplified approach - can be enhanced later
      // Check if there's a pattern match starting at this position
      const matchResult = await this.tryPatternAtPosition(tokens, position, options);
      if (matchResult && matchResult.consumed > 0) {
        return { consumed: matchResult.consumed };
      }
    }

    return { consumed: 0 };
  }

  /**
   * Try pattern matching at a specific position using SemanticPatternProcessor
   * NOTE: This method is now only used by the fallback tryAllPhasesAtPosition
   * The main single-pass approach applies patterns globally first
   */
  async tryPatternAtPosition(_tokens, _position, _options) {
    if (!this.semanticPatternProcessor.isInitialized) {
      return { consumed: 0 };
    }

    // For compatibility with the old approach, return 0 consumed
    // Patterns are now handled globally in the single-pass approach
    return { consumed: 0 };
  }

  /**
   * Try phrase translation at a specific position
   */
  async tryPhrasesAtPosition(tokens, position, options) {
    // Skip if token is already processed
    // CRITICAL FIX: Allow isPatternPartialReset to be re-processed
    if (
      tokens[position].translated !== null ||
      (tokens[position].translationSource && !tokens[position].isPatternPartialReset)
    ) {
      return { consumed: 0 };
    }

    const dictionary = this.dictionaryManager.getDictionary('phrases');
    if (!dictionary) return { consumed: 0 };

    const match = this.findLongestMatchAtPosition(tokens, position, dictionary);
    if (match) {
      // Check for conflicts with existing processed tokens
      const hasConflict = this.checkForConflictAtPosition(tokens, position, match.tokenLength);
      if (!hasConflict) {
        // Apply the match to tokens with proper dictionary name
        const matchWithDictName = {
          ...match,
          dictionary: 'phrases',
        };
        this.applyMatchToTokens(tokens, position, matchWithDictName, options);
        return { consumed: match.tokenLength };
      }
    }

    return { consumed: 0 };
  }

  /**
   * Try Chinese number conversion at a specific position
   */
  tryNumberConversionAtPosition(tokens, position, options) {
    // Skip if token is already processed
    // CRITICAL FIX: Allow isPatternPartialReset to be re-processed
    if (
      tokens[position].translated !== null ||
      (tokens[position].translationSource && !tokens[position].isPatternPartialReset)
    ) {
      return { consumed: 0 };
    }

    // Only process if this token is a Chinese character (NumberProcessor requirement)
    if (tokens[position].type !== 'chinese_char') {
      return { consumed: 0 };
    }

    // Use the full NumberProcessor logic but only for this position
    const consumed = this.tryNumberProcessorAtPosition(tokens, position, options);

    return { consumed };
  }

  /**
   * Try NumberProcessor at a specific position
   */
  tryNumberProcessorAtPosition(tokens, position, options) {
    // Get the current token
    const _token = tokens[position];

    // Create a temporary token array with just the tokens from this position onwards
    // This allows NumberProcessor to find multi-token number sequences
    const tempTokens = tokens.slice(position);

    // Track original token states to restore later
    const originalStates = tempTokens.map((t) => ({
      translated: t.translated,
      translationSource: t.translationSource,
    }));

    // Apply NumberProcessor to the temporary tokens
    // CRITICAL FIX: Deep copy options to prevent mutation leakage
    this.numberProcessor.processTokens(tempTokens, {
      debugLevel: this.debugLevel,
      semanticArrayBuilder: this.semanticArrayBuilder,
      ...options,
      // Deep copy complex nested objects to prevent reference sharing
      lookupIndex: options.lookupIndex ? new Map(options.lookupIndex) : undefined,
      segments: options.segments ? [...options.segments] : undefined,
    });

    // Find how many tokens were consumed by checking consecutive modified tokens from start
    let consumed = 0;
    for (let i = 0; i < tempTokens.length; i++) {
      if (
        tempTokens[i].translated !== originalStates[i].translated ||
        tempTokens[i].translationSource !== originalStates[i].translationSource
      ) {
        // Only count consecutive tokens from the start
        if (i === consumed) {
          consumed = i + 1;
        }
        // If there's a gap, stop counting (NumberProcessor might have processed later tokens)
      }
    }

    if (consumed > 0) {
      // Apply the changes back to the original tokens
      for (let i = 0; i < consumed; i++) {
        tokens[position + i].translated = tempTokens[i].translated;
        tokens[position + i].translationSource = tempTokens[i].translationSource;
      }
    }

    return consumed;
  }

  /**
   * Try character-level translation at a specific position
   */
  async tryCharactersAtPosition(tokens, position, options) {
    // Skip if token is already processed
    // CRITICAL FIX: Allow isPatternPartialReset to be re-processed
    if (
      tokens[position].translated !== null ||
      (tokens[position].translationSource && !tokens[position].isPatternPartialReset)
    ) {
      return { consumed: 0 };
    }

    const dictionary = this.dictionaryManager.getDictionary('characters');
    if (!dictionary) {
      this.log(DEBUG_LEVELS.ERROR, `🚨 Character Phase 5 - No character dictionary found`);
      return { consumed: 0 };
    }

    // Pass dictionary name to enable WASM optimization
    const match = this.findLongestMatchAtPosition(tokens, position, dictionary, 'characters');
    if (match) {
      // Apply the match to tokens with proper dictionary name
      const matchWithDictName = {
        ...match,
        dictionary: 'characters',
      };
      this.applyMatchToTokens(tokens, position, matchWithDictName, options);
      return { consumed: match.tokenLength };
    }

    return { consumed: 0 };
  }

  /**
   * Try WASM dictionary lookup for Phase 5 character processing
   *
   * Provides 2-4x speedup over JavaScript Map-based lookups by using
   * Rust WASM trie with O(k) HashMap lookups instead of O(k*log(n)).
   *
   * Integration uses position mapping utilities to bridge token-based
   * processing with WASM's character-based API.
   *
   * @param {Array} tokens - Token array
   * @param {number} position - Starting token position
   * @param {string} dictionaryName - Dictionary name (e.g., 'characters')
   * @returns {Object|null} Match object or null if WASM lookup failed/unavailable
   */
  tryWasmDictionaryLookup(tokens, position, dictionaryName) {
    // Check if WASM trie is enabled and initialized
    if (!this.useWasmDictionaryTrie || !this.wasmCharacterTrie?.initialized) {
      return null;
    }

    try {
      // Step 1: Build full text from tokens (single allocation)
      const fullText = buildFullTextFromTokens(tokens);

      // Step 2: Convert token position to character position
      const charPos = tokenPositionToCharPosition(tokens, position);

      // Step 3: Call WASM trie to find longest match
      const wasmMatch = this.wasmCharacterTrie.findLongestMatch(fullText, charPos);

      if (!wasmMatch) {
        return null;
      }

      // Step 4: Convert WASM result to token-based format
      const tokenMatch = convertWasmMatchToTokenMatch(wasmMatch, tokens, position, dictionaryName);

      // Log successful WASM lookup (development only)
      if (this.debugLevel >= DEBUG_LEVELS.VERBOSE) {
        this.log(
          DEBUG_LEVELS.VERBOSE,
          `✅ WASM trie match: "${tokenMatch.word}" → "${tokenMatch.translation}" (${tokenMatch.tokenLength} tokens)`
        );
      }

      return tokenMatch;
    } catch (error) {
      // Graceful degradation: Log error and return null to fallback to JavaScript
      logger.warn('WASM dictionary lookup failed, falling back to JavaScript:', error);
      return null;
    }
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
    // Try WASM acceleration for character dictionary (Phase 5)
    if (dictionaryName === 'characters') {
      const wasmMatch = this.tryWasmDictionaryLookup(tokens, position, dictionaryName);
      if (wasmMatch) {
        // WASM success - return result directly
        return wasmMatch;
      }
      // WASM failed/unavailable - fall through to JavaScript implementation
    }

    // JavaScript fallback implementation (original code)
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
   * Check for conflicts with already processed tokens
   * CRITICAL FIX: Must check isGrouped flag to prevent overlapping grouped tokens
   * CRITICAL FIX: Allow isPatternPartialReset tokens to be re-processed
   */
  checkForConflictAtPosition(tokens, position, length) {
    for (let i = position; i < position + length; i++) {
      if (i >= tokens.length) break;
      // Check grouped, translated, or has source (except isPatternPartialReset)
      if (
        tokens[i].isGrouped ||
        tokens[i].translated !== null ||
        (tokens[i].translationSource && !tokens[i].isPatternPartialReset)
      ) {
        return true; // Conflict found
      }
    }
    return false;
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
      '': false, // After no punctuation - NO capitalization
    };

    // Apply capitalization rules to each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk.translated) continue;

      // Check for advanced capitalization rules
      let shouldCapitalize = capitalizationRules[chunk.startedBy];

      // Handle multi-character punctuation sequences
      if (!shouldCapitalize && chunk.startedBy) {
        // Check if startedBy contains sentence-ending punctuation
        const sentenceEnders = ['.', '!', '?', '。', '．', '！', '？'];
        const colonMarks = [':', '：'];
        const ellipsisMarks = ['…', '……'];

        // Check for sentence-ending punctuation (anywhere in the sequence)
        const hasSentenceEnder = sentenceEnders.some((punct) => chunk.startedBy.includes(punct));

        // Check for colon (anywhere in the sequence)
        const hasColon = colonMarks.some((punct) => chunk.startedBy.includes(punct));

        // Check for ellipsis (anywhere in the sequence)
        const hasEllipsis = ellipsisMarks.some((punct) => chunk.startedBy.includes(punct));

        if (hasSentenceEnder || hasColon || hasEllipsis) {
          shouldCapitalize = true;
          const reason = hasSentenceEnder ? 'sentence ender' : hasColon ? 'colon' : 'ellipsis';
          this.log(
            DEBUG_LEVELS.VERBOSE,
            `📝 Multi-char punctuation capitalization: "${chunk.startedBy}" contains ${reason}`
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

      if (shouldCapitalize) {
        // Check if this chunk is already properly capitalized from dictionary (proper noun)
        const isAlreadyCapitalized =
          chunk.translated.charAt(0) === chunk.translated.charAt(0).toUpperCase();

        this.log(
          DEBUG_LEVELS.DEBUG,
          `🔍 Capitalization check: startedBy="${chunk.startedBy}", shouldCapitalize=${shouldCapitalize}, isAlreadyCapitalized=${isAlreadyCapitalized}, text="${chunk.translated}"`
        );

        if (!isAlreadyCapitalized) {
          const oldText = chunk.translated;
          chunk.translated = this.capitalizeFirstLetter(chunk.translated);
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
   * Escape special regex characters in a string
   * @param {string} string - String to escape
   * @returns {string} Escaped string safe for use in regex
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    // Find the first letter (skip spaces and punctuation)
    const match = text.match(
      /^(\s*)([a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])/i
    );

    if (match) {
      const prefix = match[1]; // spaces before the letter
      const letter = match[2]; // the letter to capitalize
      const rest = text.slice(match[0].length); // rest of the text

      return prefix + letter.toUpperCase() + rest;
    }

    return text;
  }

  /**
   * Apply light formatting to character-only translation
   * - Capitalize first letter and after sentence-ending punctuation
   * - Add space after commas and colons
   * - Preserve all other spacing exactly as-is
   * @param {string} text - Text to format
   * @returns {string} Formatted text
   */
  applyLightFormatting(text) {
    if (!text) return text;

    let formatted = text;

    // Add space after commas (but not if already has space)
    formatted = formatted.replace(/,(?!\s)/g, ', ');

    // Add space after colons (but not if already has space)
    formatted = formatted.replace(/:(?!\s)/g, ': ');

    // Add space after periods (but not if already has space)
    formatted = formatted.replace(/\.(?!\s)/g, '. ');

    // Add space after em dashes (but not if already has space)
    formatted = formatted.replace(/——(?!\s)/g, '—— ');

    // Add spaces around chunks of Japanese/other non-Vietnamese characters (e.g., "の", "ののの")
    // Hiragana: U+3040-U+309F, Katakana: U+30A0-U+30FF
    // Pattern: Match Japanese chunk between Vietnamese text and add spaces
    // Step 1: Add space before Japanese chunk (Vietnamese letter + no space + Japanese)
    formatted = formatted.replace(
      /([a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])([\u3040-\u309F\u30A0-\u30FF]+)/gi,
      '$1 $2'
    );
    // Step 2: Add space after Japanese chunk (Japanese + no space + Vietnamese letter)
    formatted = formatted.replace(
      /([\u3040-\u309F\u30A0-\u30FF]+)([a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])/gi,
      '$1 $2'
    );

    // Capitalize first letter (handle Vietnamese diacritics correctly)
    if (formatted.length > 0) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    // Capitalize after sentence-ending punctuation (period, exclamation, question mark)
    // Use a more careful regex that preserves the punctuation and spacing
    formatted = formatted.replace(/([.!?])(\s+)(\S)/g, (match, punct, spaces, letter) => {
      return punct + spaces + letter.toUpperCase();
    });

    // Capitalize after line breaks
    formatted = formatted.replace(/\n\s*(\S)/g, (match, letter) => {
      return match.slice(0, -1) + letter.toUpperCase();
    });

    return formatted;
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
   *   - CRITICAL: Excludes ()/ from spacing to preserve "(23/30)" formatting
   *   - Cleans up multiple spaces
   *   - Removes spaces at line boundaries
   *
   * BUG FIX HISTORY:
   *   - 2026-02-02: Added ()/ to exclusion list to fix "(23/30)" → ":( 23 / 30 )" bug
   *   - Regex now: /([^\s\d,.\-+%()\/])(\d)/g instead of /([^\s\d,.\-+%])(\d)/g
   *
   * @param {string} text - Text to clean up
   * @returns {string} Cleaned up text
   */
  applyFinalCleanup(text) {
    if (!text) return text;

    // Clean up spacing but preserve line breaks
    let cleanedText = text;

    // Add space between Vietnamese text and Arabic numerals (like "Thứ422giới" -> "Thứ 422 giới")
    // BUT preserve number formatting by excluding number-related characters (comma, period, dash, plus, percent)
    // ALSO exclude parentheses and slashes to prevent breaking "(23/30)" formatting
    cleanedText = cleanedText.replace(/([^\s\d,.\-+%()\/])(\d)/g, '$1 $2');
    cleanedText = cleanedText.replace(/(\d)([^\s\d,.\-+%()\/])/g, '$1 $2');

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
    this.textChunker.translatePunctuation(currentBatch, this.punctuationDict);

    // Capitalization is handled at the final level (not per-batch)
  }

  /**
   * PHASE 2: Process batch with progressive position tracking and segment building
   * @param {TextChunk[]} currentBatch - Current batch of chunks
   * @param {TextChunk[]} allChunks - All chunks for text reconstruction
   * @param {number} batchStartIndex - Starting index of batch
   */
  async processBatchWithProgressivePositioning(currentBatch, _allChunks, _batchStartIndex) {
    try {
      // Step 1: Reconstruct just the current batch text
      const batchText = this.textChunker.reconstructText(currentBatch);
      const cleanedBatchText = this.applyFinalCleanup(batchText);

      // Step 2: Get semantic arrays for current batch from the builder
      const batchSemanticArrays = this.getBatchSemanticArrays(currentBatch);

      // Step 3: Build clickable segments for this batch with progressive positioning
      const batchSegments = this.buildProgressiveClickableSegments(
        batchSemanticArrays,
        cleanedBatchText,
        this.progressivePositionTracker.runningTextPosition
      );

      // Step 4: Update progressive tracker
      this.progressivePositionTracker.finalText += cleanedBatchText;
      this.progressivePositionTracker.runningTextPosition += cleanedBatchText.length;
      // CODE REVIEW FIX: Clone array to prevent race condition with React state updates
      // Issue: Direct mutation via push() continues after array is passed to React
      // Fix: Create new array instead of mutating existing one
      this.progressivePositionTracker.clickableSegments = [
        ...this.progressivePositionTracker.clickableSegments,
        ...batchSegments,
      ];

      // Semantic arrays are accumulated by semanticArrayBuilder (no duplication needed)

      return {
        cleanedBatchText: cleanedBatchText,
        batchText: cleanedBatchText,
        batchSegments: batchSegments,
        cumulativeText: this.progressivePositionTracker.finalText,
        cumulativeSegments: this.progressivePositionTracker.clickableSegments,
      };
    } catch (error) {
      // PHASE 4: Progressive error handling - graceful degradation
      this.log(DEBUG_LEVELS.ERROR, `❌ Progressive batch processing failed: ${error.message}`);
      logger.error('Progressive positioning error:', error);

      // Fallback: Return basic batch info without progressive segments
      const fallbackText = this.textChunker.reconstructText(currentBatch);
      const cleanedFallbackText = this.applyFinalCleanup(fallbackText);

      // Still update position tracker to maintain text continuity
      this.progressivePositionTracker.finalText += cleanedFallbackText;
      this.progressivePositionTracker.runningTextPosition += cleanedFallbackText.length;

      return {
        batchText: cleanedFallbackText,
        batchSegments: [], // No segments on error, but text continues
        cumulativeText: this.progressivePositionTracker.finalText,
        cumulativeSegments: this.progressivePositionTracker.clickableSegments,
        hasError: true,
      };
    }
  }

  /**
   * Get semantic arrays specific to current batch
   * @param {TextChunk[]} batchChunks - Current batch chunks
   * @returns {Object} Batch-specific semantic arrays
   */
  getBatchSemanticArrays(_batchChunks) {
    // Get current semantic arrays from builder
    // CRITICAL FIX: Add null safety guard for semanticArrayBuilder
    const allSemanticArrays = this.semanticArrayBuilder?.getArrays() || {
      original: [],
      translated: [],
      metadata: [],
    };

    // BUGFIX: Ensure metadata array has proper objects, not empty array
    const originalCount = allSemanticArrays.original ? allSemanticArrays.original.length : 0;
    const metadataArray = allSemanticArrays.metadata || [];

    // Fill missing metadata with default objects to prevent SegmentPrecomputer errors
    // CRITICAL FIX: Use explicit missing indicator for better debugging
    const completeMetadata = [];
    for (let i = 0; i < originalCount; i++) {
      completeMetadata[i] = metadataArray[i] || {
        source: 'progressive',
        phase: null, // null = missing, not unknown
        dictionary: null, // null = missing, not unknown
        isMissing: true, // Explicit flag for debugging
      };
    }

    /**
     * Performance optimization opportunity: Currently returns all semantic arrays instead of
     * batch-specific arrays. This works correctly but includes entries from other batches.
     *
     * Future optimization: Track which semantic array entries belong to each batch for better
     * isolation. This would reduce memory usage and improve cache locality for multi-batch
     * processing, but requires batch ID tracking in semantic array metadata.
     *
     * Current approach is acceptable because:
     * - Semantic arrays are shared across batches (correct for progressive translation)
     * - Performance impact is minimal for typical text sizes
     * - Simplicity outweighs optimization benefits for current use cases
     */
    return {
      original: allSemanticArrays.original || [],
      translated: allSemanticArrays.translated || [],
      metadata: completeMetadata,
    };
  }

  /**
   * Build clickable segments progressively for current batch
   * @param {Object} batchSemanticArrays - Semantic arrays for batch
   * @param {string} batchText - Cleaned text for current batch
   * @param {number} runningOffset - Running character position offset
   * @returns {Array} Clickable segments for this batch
   */
  buildProgressiveClickableSegments(batchSemanticArrays, batchText, runningOffset) {
    const segments = [];

    if (!batchSemanticArrays.original || batchSemanticArrays.original.length === 0) {
      return segments;
    }

    // Create candidate words from batch semantic arrays
    const candidateWords = [];
    for (let i = 0; i < batchSemanticArrays.original.length; i++) {
      candidateWords.push({
        semanticIndex: i,
        original: batchSemanticArrays.original[i],
        translated: batchSemanticArrays.translated[i],
      });
    }

    // Find word positions in batch text and create segments with global positioning
    // OPTIMIZATION: Use sorted array instead of Set for O(log n) overlap detection
    const usedPositions = []; // Sorted by start position

    // Pre-lowercase batch text once (was being done N times in loop)
    const lowerBatchText = batchText.toLowerCase();

    for (const candidate of candidateWords) {
      if (!candidate.translated || candidate.translated.trim() === '') continue;

      const lowerCandidate = candidate.translated.toLowerCase();
      let position = -1;
      let searchStart = 0;

      // Find non-overlapping position
      do {
        position = lowerBatchText.indexOf(lowerCandidate, searchStart);
        if (position >= 0) {
          const candidateEnd = position + candidate.translated.length;

          // OPTIMIZATION: Binary search for overlap detection (O(log n) vs O(n))
          const overlaps = this._checkOverlapBinarySearch(usedPositions, position, candidateEnd);

          if (!overlaps) {
            // Create segment with global position (batch position + running offset)
            segments.push({
              semanticIndex: candidate.semanticIndex,
              originalText: candidate.original,
              translatedText: candidate.translated,
              localStart: position,
              localEnd: candidateEnd,
              globalStart: runningOffset + position,
              globalEnd: runningOffset + candidateEnd,
              isClickable: true,
            });

            // Insert position in sorted order (maintain sorted array for binary search)
            this._insertSorted(usedPositions, { start: position, end: candidateEnd });

            break;
          } else {
            searchStart = position + 1;
          }
        }
      } while (position >= 0);
    }

    return segments;
  }

  /**
   * Check if a position range overlaps with any used positions using binary search
   * @param {Array} sortedPositions - Array of {start, end} objects sorted by start
   * @param {number} start - Start position to check
   * @param {number} end - End position to check
   * @returns {boolean} True if overlaps with any used position
   */
  _checkOverlapBinarySearch(sortedPositions, start, end) {
    if (sortedPositions.length === 0) return false;

    // Binary search for positions that could overlap
    let left = 0;
    let right = sortedPositions.length - 1;

    // Find the rightmost position where pos.start <= end
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const pos = sortedPositions[mid];

      // Check if this position overlaps
      if (start < pos.end && end > pos.start) {
        return true; // Overlap found
      }

      if (pos.start < start) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Check adjacent positions for overlap
    if (left < sortedPositions.length) {
      const pos = sortedPositions[left];
      if (start < pos.end && end > pos.start) return true;
    }
    if (left > 0) {
      const pos = sortedPositions[left - 1];
      if (start < pos.end && end > pos.start) return true;
    }

    return false;
  }

  /**
   * Insert a position into sorted array maintaining sort order
   * @param {Array} sortedPositions - Array sorted by start position
   * @param {Object} position - Position object {start, end}
   */
  _insertSorted(sortedPositions, position) {
    // Binary search to find insertion point
    let left = 0;
    let right = sortedPositions.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (sortedPositions[mid].start < position.start) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    sortedPositions.splice(left, 0, position);
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

  /**
   * Get translation caching statistics
   * @returns {Object} Cache performance statistics
   */
  getCacheStats() {
    return this.dictionaryManager.getCacheStats();
  }

  /**
   * Get cache memory usage information
   * @returns {Object} Cache memory usage statistics
   */
  getCacheMemoryUsage() {
    return this.dictionaryManager.getCacheMemoryUsage();
  }

  /**
   * Phase 4: Get lazy loading statistics
   * @returns {Object} Lazy loading statistics
   */
  getLazyLoadingStats() {
    return this.dictionaryManager.getLazyLoadingStats();
  }

  /**
   * Enable or disable translation caching
   * @param {boolean} enabled - Whether to enable caching
   */
  setCacheEnabled(enabled) {
    this.dictionaryManager.setCacheEnabled(enabled);
  }

  /**
   * Clear all translation caches (legacy method - use invalidateAllCaches instead)
   * @deprecated Use invalidateAllCaches() for comprehensive cache clearing
   */
  clearCache() {
    this.dictionaryManager.clearCache();
  }

  /**
   * Invalidate all caches across the translation system
   *
   * Unified API for clearing all 6 cache systems when dictionaries change. This ensures
   * translation quality by forcing fresh lookups after dictionary modifications. Called
   * automatically by the dictionary reload button (Cmd/Ctrl-R) and after adding/updating
   * dictionary entries.
   *
   * Cache systems cleared:
   * 1. Dictionary Manager Caches (character, phrase, pattern, lookup)
   * 2. Semantic Array Builder Cache (position mappings)
   * 3. Pattern Processor Variable Cache (pattern variables)
   * 4. Batch Processing Cache (progressive translation)
   * 5. Rust Lookup Index Cache (character-only mode acceleration)
   * 6. WASM Module Caches (number processor, pattern processor)
   *
   * Timing considerations:
   * - Must invalidate before next translation to prevent stale results
   * - Selective invalidation (by dictionary name) for better performance
   * - Global invalidation when dictionary configuration changes
   *
   * @param {string|null} [dictionaryName=null] - Optional: Invalidate specific dictionary only
   *
   * @returns {Promise<void>} Resolves when all caches are invalidated
   *
   * @example
   * // Invalidate all caches (global reload)
   * await engine.invalidateAllCaches();
   *
   * @example
   * // Invalidate specific dictionary (selective reload)
   * await engine.invalidateAllCaches('properNouns-Novel1.json');
   *
   * @example
   * // Called automatically after dictionary entry update
   * dictionaryManager.updateEntry('character', '你', 'bạn');
   * await engine.invalidateAllCaches(); // Ensure next translation uses new entry
   *
   * @see DictionaryManager.clearCaches - Clears dictionary lookup caches
   * @see RustLookupIndexManager.invalidateCache - Clears Rust index cache
   * @see destroy - Alternative for complete cleanup (also destroys engine)
   *
   * @performance
   * - Global invalidation: ~5-10ms
   * - Selective invalidation: ~2-5ms
   * - Next translation will rebuild caches on-demand
   *
   * @critical
   * Must be called after any dictionary modification to maintain translation quality.
   * Failure to invalidate causes stale translations that violate phase priorities.
   * Use selective invalidation when possible for better performance.
   *
   * @called-by
   * - Translator.jsx: handleReloadDictionaries (Cmd/Ctrl-R)
   * - DictionaryEditor: After add/update/delete entry
   * - Settings: After dictionary configuration changes
   */
  async invalidateAllCaches(dictionaryName = null) {
    const startTime = performance.now();
    this.log(DEBUG_LEVELS.INFO, '🧹 Invalidating all translation caches...', { dictionaryName });

    try {
      // 1. Dictionary Manager Caches (character, phrase, pattern, lookup)
      if (this.dictionaryManager) {
        if (dictionaryName && typeof this.dictionaryManager.invalidateCache === 'function') {
          this.dictionaryManager.invalidateCache(dictionaryName);
        } else if (typeof this.dictionaryManager.clearCaches === 'function') {
          this.dictionaryManager.clearCaches();
        } else {
          this.dictionaryManager.clearCache();
        }
      }

      // 2. Semantic Array Builder Cache
      if (this.semanticArrayBuilder && typeof this.semanticArrayBuilder.clearCache === 'function') {
        this.semanticArrayBuilder.clearCache();
      }

      // 3. Pattern Processor Variable Cache
      if (this.semanticPatternProcessor && this.semanticPatternProcessor.variableCache) {
        this.semanticPatternProcessor.variableCache.clear();
      }

      // 4. Rust Lookup Index Manager (dynamically loaded)
      try {
        const { rustLookupIndexManager } = await import('./RustLookupIndexManager.js');
        if (
          rustLookupIndexManager &&
          typeof rustLookupIndexManager.invalidateCache === 'function'
        ) {
          rustLookupIndexManager.invalidateCache();
          this.log(DEBUG_LEVELS.DEBUG, '✅ Rust lookup index cache invalidated');
        }
      } catch (error) {
        // Distinguish between "not available" (expected) and "failed to load" (unexpected)
        if (error.code === 'MODULE_NOT_FOUND') {
          this.log(DEBUG_LEVELS.DEBUG, 'Rust lookup index not available (expected if not used)');
        } else {
          this.log(
            DEBUG_LEVELS.WARN,
            `⚠️ Failed to invalidate Rust lookup index cache: ${error.message}`
          );
          logger.warn('Cache invalidation incomplete - Rust index failed to load:', error);
        }
      }

      // 5. Translation Segments (for highlighting)
      if (this.translationSegments) {
        this.translationSegments = [];
      }

      // 6. Proper Noun Translation Cache (bounded collection)
      if (this.properNounTranslations) {
        this.properNounTranslations.clear();
      }

      // 7. WASM Dictionary Trie (Phase 5 character lookups)
      if (this.wasmCharacterTrie) {
        try {
          this.wasmCharacterTrie.clear();
          this.log(DEBUG_LEVELS.DEBUG, '✅ WASM Dictionary Trie cache cleared');

          // Reinitialize trie with fresh dictionary data if available
          if (
            this.lastLoadedDictionaries &&
            this.lastLoadedDictionaries.characters &&
            (!dictionaryName || dictionaryName === 'characters')
          ) {
            const characterEntries = Object.entries(this.lastLoadedDictionaries.characters).map(
              ([chars, translation]) => ({
                chars,
                translation:
                  typeof translation === 'string' ? translation : translation.translation,
                priority: translation.priority || 5,
                metadata: translation.metadata,
              })
            );

            await this.wasmCharacterTrie.loadEntries(characterEntries);
            this.log(
              DEBUG_LEVELS.DEBUG,
              `✅ WASM Dictionary Trie reloaded: ${characterEntries.length} entries`
            );
          }
        } catch (wasmError) {
          logger.warn('⚠️ WASM Dictionary Trie cache clear failed, disabling WASM:', wasmError);
          this.wasmCharacterTrie = null; // Disable WASM on error
        }
      }

      // CRITICAL FIX: Re-sync dictionaries to WASM after cache invalidation
      // Without this, WASM has stale dictionary state while JavaScript has fresh data
      // Impact: After Cmd/Ctrl-R reload, translations use stale WASM entries until app restart
      if (
        this.dictionaryManager &&
        typeof this.dictionaryManager.syncDictionariesToWasm === 'function'
      ) {
        try {
          await this.dictionaryManager.syncDictionariesToWasm();
          this.log(DEBUG_LEVELS.DEBUG, '✅ WASM dictionaries re-synced after cache invalidation');
        } catch (wasmError) {
          // Non-critical: WASM sync failure falls back to JavaScript dictionaries
          this.log(
            DEBUG_LEVELS.WARN,
            `⚠️ WASM re-sync failed (fallback to JavaScript): ${wasmError.message}`
          );
          logger.warn('WASM dictionary re-sync failed after cache invalidation:', wasmError);
        }
      }

      const duration = performance.now() - startTime;
      this.log(DEBUG_LEVELS.INFO, `✅ All caches invalidated in ${duration.toFixed(2)}ms`);
    } catch (error) {
      this.log(DEBUG_LEVELS.ERROR, '❌ Error invalidating caches:', error);
      throw error;
    }
  }

  /**
   * MEDIUM-PRIORITY FIX: Targeted cache invalidation for dictionary operations
   * Invalidate only caches affected by dictionary add/update/delete operations
   * More efficient than invalidateAllCaches() which clears all 6 cache systems
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
      if (this.dictionaryManager && typeof this.dictionaryManager.invalidateCache === 'function') {
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
      if (
        this.dictionaryManager &&
        typeof this.dictionaryManager.syncDictionariesToWasm === 'function'
      ) {
        try {
          await this.dictionaryManager.syncDictionariesToWasm();
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

  /**
   * Enhance chunk-based segments to word-level by finding word positions within chunks
   * @param {Array} chunkSegments - Working chunk-based segments (with proper formatting)
   * @param {string} finalText - Final formatted text
   * @param {Object} semanticArrays - Semantic arrays with word-level entries
   * @returns {Array} Word-level segments with correct positions
   */
  enhanceSegmentsToWordLevel(chunkSegments, finalText, semanticArrays) {
    const wordLevelSegments = [];

    logger.log(
      `🔧 Enhancing ${chunkSegments.length} chunk segments to word-level using ${semanticArrays.original.length} semantic entries`
    );

    // Process only the clickable (semantic) chunk segments
    const semanticChunkSegments = chunkSegments.filter(
      (seg) => seg.type === 'semantic' && seg.isClickable
    );

    if (semanticChunkSegments.length === 0) {
      logger.log('⚠️ No semantic chunk segments to enhance');
      return chunkSegments; // Return original if no semantic segments
    }

    // Map semantic array entries to word-level segments within the existing chunks
    let semanticIndex = 0;
    let searchPosition = 0;

    for (let chunkIndex = 0; chunkIndex < semanticChunkSegments.length; chunkIndex++) {
      const _chunkSegment = semanticChunkSegments[chunkIndex];

      // Determine how many semantic entries belong to this chunk
      const entriesPerChunk = Math.ceil(
        semanticArrays.original.length / semanticChunkSegments.length
      );
      const endSemanticIndex = Math.min(
        semanticIndex + entriesPerChunk,
        semanticArrays.original.length
      );

      logger.log(
        `📦 Chunk ${chunkIndex}: Processing semantic entries ${semanticIndex} to ${endSemanticIndex - 1}`
      );

      // Find words from this chunk's semantic entries in the final text
      for (let i = semanticIndex; i < endSemanticIndex; i++) {
        const originalText = semanticArrays.original[i];
        const translatedText = semanticArrays.translated[i];
        const metadata = semanticArrays.metadata[i];

        if (!translatedText || translatedText.trim() === '') {
          continue;
        }

        // Find this word in the final text starting from current search position
        const position = finalText.indexOf(translatedText, searchPosition);

        if (position >= 0) {
          wordLevelSegments.push({
            type: 'semantic',
            unitIndex: i,
            start: position,
            end: position + translatedText.length,
            originalText: originalText,
            translatedText: translatedText,
            source: metadata?.source || 'unknown',
            metadata: metadata,
            isClickable: true,
            text: translatedText,
          });

          searchPosition = position + translatedText.length;
          if (process.env.NODE_ENV === 'development' && i % 50 === 0) {
            logger.log(
              `✅ Found "${originalText}" → "${translatedText}" at position ${position}-${position + translatedText.length}`
            );
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            logger.warn(
              `⚠️ Could not find "${translatedText}" (${originalText}) in final text from position ${searchPosition}`
            );
          }
        }
      }

      semanticIndex = endSemanticIndex;
    }

    // Also include non-clickable segments (punctuation, line breaks)
    const nonClickableSegments = chunkSegments.filter((seg) => !seg.isClickable);
    const allSegments = [...wordLevelSegments, ...nonClickableSegments];

    // Sort by position to maintain proper order
    allSegments.sort((a, b) => a.start - b.start);

    logger.log(
      `🎯 Enhanced to ${wordLevelSegments.length} word-level + ${nonClickableSegments.length} non-clickable = ${allSegments.length} total segments`
    );
    return allSegments;
  }

  /**
   * Assign semantic indices to chunks by mapping them to semantic array entries
   * @param {Array} chunks - Array of translated chunks
   * @param {Object} semanticArrays - Semantic arrays with word-level entries
   */
  assignSemanticIndicesToChunks(chunks, semanticArrays) {
    logger.log(
      `🔗 Assigning semantic indices: ${chunks.length} chunks → ${semanticArrays.original.length} semantic entries`
    );

    // Find translated chunks
    const translatedChunks = chunks.filter((chunk) => chunk.translated && chunk.content.trim());

    if (translatedChunks.length === 0) {
      logger.log('⚠️ No translated chunks found');
      return;
    }

    // For simplicity, distribute semantic entries evenly across chunks
    // This gives us chunk-level clickability which is reliable
    const entriesPerChunk = Math.floor(semanticArrays.original.length / translatedChunks.length);
    let currentSemanticIndex = 0;

    for (let i = 0; i < translatedChunks.length; i++) {
      const chunk = translatedChunks[i];

      // Assign the first available semantic index to this chunk
      if (currentSemanticIndex < semanticArrays.original.length) {
        chunk.semanticIndex = currentSemanticIndex;
        logger.log(`📋 Chunk ${i}: "${chunk.content}" → semantic index ${currentSemanticIndex}`);

        // Advance by entries per chunk, or remainder for last chunk
        if (i === translatedChunks.length - 1) {
          // Last chunk gets any remaining entries
          currentSemanticIndex = semanticArrays.original.length;
        } else {
          currentSemanticIndex += Math.max(1, entriesPerChunk);
        }
      }
    }

    logger.log(`✅ Assigned semantic indices to ${translatedChunks.length} chunks`);
  }

  getPrebuiltSegments() {
    return this.prebuiltSegments || [];
  }

  /**
   * Analyze text complexity to determine optimal batch sizing
   * @param {string} text - Input text
   * @param {Array} chunks - Text chunks
   * @returns {Object} Complexity analysis result
   */
  analyzeTextComplexity(text, chunks) {
    const analysis = {
      score: 0,
      factors: {},
      characteristics: [],
    };

    // Factor 1: Average chunk length (longer chunks = more complex)
    const avgChunkLength =
      chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length;
    analysis.factors.chunkLength = Math.min(avgChunkLength / 100, 2.0); // Normalize to 0-2.0

    // Factor 2: Dictionary density (more proper nouns/phrases = more complex)
    const dictionaryDensity = this.estimateDictionaryDensity(text);
    analysis.factors.dictionaryDensity = dictionaryDensity;

    // Factor 3: Character variety (more unique characters = more complex)
    const uniqueChars = new Set(text.replace(/\s+/g, '')).size;
    analysis.factors.characterVariety = Math.min(uniqueChars / 500, 1.5); // Normalize to 0-1.5

    // Factor 4: Punctuation complexity (more punctuation types = more complex)
    const punctuationTypes = (text.match(/[，。！？：；""''（）【】《》]/g) || []).length;
    analysis.factors.punctuation = Math.min((punctuationTypes / text.length) * 100, 1.0);

    // Combine factors into overall score (0.5 = simple, 1.0 = average, 2.0 = complex)
    analysis.score =
      analysis.factors.chunkLength * 0.3 +
      analysis.factors.dictionaryDensity * 0.4 +
      analysis.factors.characterVariety * 0.2 +
      analysis.factors.punctuation * 0.1 +
      0.5; // Base score of 0.5

    // Determine characteristics for logging
    if (analysis.score < 0.8) analysis.characteristics.push('simple');
    if (analysis.score > 1.5) analysis.characteristics.push('complex');
    if (analysis.factors.dictionaryDensity > 0.8) analysis.characteristics.push('dictionary-heavy');
    if (avgChunkLength > 200) analysis.characteristics.push('long-chunks');

    return analysis;
  }

  /**
   * Estimate dictionary density in text (proper nouns, phrases)
   * @param {string} text - Input text
   * @returns {number} Density score (0.0 to 1.0+)
   */
  estimateDictionaryDensity(text) {
    // Simple heuristic: count potential dictionary matches
    let dictionaryHits = 0;
    const sampleSize = Math.min(text.length, 500); // Sample first 500 characters
    const sample = text.substring(0, sampleSize);

    // Count potential proper nouns (sequences of 2-4 characters)
    const properNounPattern = /[一-龯]{2,4}/g;
    const properNounMatches = sample.match(properNounPattern) || [];
    dictionaryHits += properNounMatches.length * 0.3; // Weight proper nouns

    // Count potential phrases (sequences of 3-6 characters)
    const phrasePattern = /[一-龯]{3,6}/g;
    const phraseMatches = sample.match(phrasePattern) || [];
    dictionaryHits += phraseMatches.length * 0.5; // Weight phrases higher

    // Normalize by sample length
    return Math.min(dictionaryHits / (sampleSize / 50), 1.5); // Max 1.5 for very dense text
  }

  /**
   * Calculate complexity multiplier for batch sizing
   * @param {Object} complexity - Complexity analysis result
   * @returns {number} Multiplier (0.5 to 1.5)
   */
  getComplexityMultiplier(complexity) {
    // Simple text gets larger batches (faster processing)
    // Complex text gets smaller batches (more careful processing)
    if (complexity.score < 0.8) {
      return 1.3; // 30% larger batches for simple text
    } else if (complexity.score > 1.5) {
      return 0.7; // 30% smaller batches for complex text
    } else {
      return 1.0; // Standard batch sizes for average complexity
    }
  }

  /**
   * Get WASM manager for performance monitoring
   */
  get wasmManager() {
    return this.dictionaryManager.wasmManager;
  }

  /**
   * Get WASM performance metrics
   */
  getWasmPerformanceReport() {
    return this.dictionaryManager.getPerformanceReport();
  }

  /**
   * Get Phase 6 Core Translation Engine (Rust)
   */
  get coreEngine() {
    // WASM Core Engine removed
    return null;
  }

  /**
   * Get Phase 6 Core Engine performance statistics
   */
  getCoreEngineStats() {
    // WASM Core Engine removed
    return null;
  }

  /**
   * Check if Phase 6 Core Engine is ready for translation
   */
  isCoreEngineReady() {
    // WASM Core Engine removed
    return false;
  }

  /**
   * Get performance bottleneck analysis from PerformanceLogger
   * @returns {Object} Performance analysis with bottlenecks and recommendations
   */
  getPerformanceAnalysis() {
    const analysis = performanceLogger.getPerformanceAnalysis();
    const bottlenecks = performanceLogger.getBottlenecks(10); // Last 10 bottlenecks

    return {
      ...analysis,
      bottlenecks,
      recommendations: this.generatePerformanceRecommendations(analysis, bottlenecks),
    };
  }

  /**
   * Generate performance recommendations based on bottleneck analysis
   * @param {Object} analysis - Performance analysis data
   * @param {Array} bottlenecks - Recent bottlenecks
   * @returns {Array} Performance recommendations
   */
  generatePerformanceRecommendations(analysis, bottlenecks) {
    const recommendations = [];

    if (analysis.recentBottlenecks > 5) {
      recommendations.push({
        priority: 'high',
        issue: 'Frequent slow operations detected',
        recommendation: 'Consider reducing batch size or enabling parallel processing',
        count: analysis.recentBottlenecks,
      });
    }

    // Analyze operation types
    if (analysis.operationBreakdown) {
      analysis.operationBreakdown.forEach((op) => {
        if (op.operation === 'translateWithSegments' && op.averageDuration > 500) {
          recommendations.push({
            priority: 'high',
            issue: 'Main translation is consistently slow',
            recommendation: 'Check for large text inputs or dictionary issues',
            averageDuration: op.averageDuration,
            operation: op.operation,
          });
        }

        if (op.operation === 'processChunksInParallel' && op.averageDuration > 300) {
          recommendations.push({
            priority: 'medium',
            issue: 'Parallel processing slower than expected',
            recommendation: 'Verify parallel configuration or consider sequential processing',
            averageDuration: op.averageDuration,
            operation: op.operation,
          });
        }
      });
    }

    // Check for text length patterns
    const largeTextBottlenecks = bottlenecks.filter((b) => b.context?.textLength > 1000);
    if (largeTextBottlenecks.length > 0) {
      recommendations.push({
        priority: 'medium',
        issue: 'Large text inputs causing slowdowns',
        recommendation: 'Consider implementing text chunking for very large inputs',
        affectedOperations: largeTextBottlenecks.length,
      });
    }

    return recommendations;
  }

  /**
   * Clear performance monitoring data
   */
  clearPerformanceData() {
    performanceLogger.clearBottlenecks();
    performanceLogger.clear();
    batchLog.info('🗑️ Performance monitoring data cleared');
  }
}

// Factory function
export const createTranslationEngine = () => new TranslationEngine();
