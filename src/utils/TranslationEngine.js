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
 *     .postProcess()            Assembles semantic array after translation phases.
 *
 * =============================================================================
 * FILE STRUCTURE
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
 * see SECTION 10's note). Entries cite method NAMES, never line numbers: numbers
 * drifted on every edit; `grep -n "name("` gives the live line. See
 * docs/guides/deleted-symbols.md for what was removed:
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. Core Engine Class - Constructor                         [COUPLED]
 *    - Critical: Initializes all subsystems
 *
 * 5. Engine Initialization                                   [COUPLED]
 *    - initialize() — dictionary loading & WASM setup
 *    - Critical: Initialization order matters
 *
 * 6. Main Translation Entry Points                           [COUPLED]
 *    - translateWithCharactersOnly()
 *    - Note: the non-progressive translate() dispatcher was deleted 2026-08-17 (zero production
 *      reachability — translateWithSegments always takes the progressive branch), and
 *      translateWithChunking() with it on 2026-10-05; translateDirectly() is still live,
 *      reached via processChunksInParallel(), not via this section
 *
 * 7. Conflict Resolution & Segment Helpers                   [COUPLED]
 *    - translateWithSegments()
 *
 * 8. Phase 1 - Pattern Processing                            [COUPLED]
 *    - applyPatterns()
 *    - Hierarchical two-phase WASM patterns
 *    - Critical: Must run first (highest priority)
 *
 * 9. Phase 4 - Phrase Processing                             [COUPLED]
 *    - processRemainingPhrases() — the phase's entry; its conflict resolution is the pure
 *      resolveGlobalConflicts() in ConflictResolution.ts
 *
 * 10. Phase 5 - Character Processing                         [COUPLED]
 *     - Also contains Phase 2 (Proper Noun) logic: applyProperNouns()
 *       sits inside this section, not its own. The main Phase 5 method,
 *       processRemainingTokens(), is NOT here — it's physically inside
 *       section 12 (Parallel Processing). Phase content and physical section
 *       boundaries diverge throughout this file; do not assume a section named
 *       after a phase contains only that phase's code.
 *
 * 11. Post-Processing                                        [COUPLED]
 *     - postProcess()
 *     - Semantic array, position mapping, text assembly
 *     - Critical: Position precision for clickable highlighting
 *
 * 12. Parallel Processing                                    [COUPLED]
 *     - processChunksInParallel()
 *     - processRemainingTokens() — Phase 5's main method, see note above
 *     - Critical: assigns semantic indices by chunk-completion order
 *
 * 13. Progressive Batch Translation                          [COUPLED]
 *     - translateWithProgressiveBatches()
 *
 * 14. Direct Translation                                      [COUPLED]
 *     - translateDirectly()
 *
 * 15. Core 5-Phase Pipeline                                  [COUPLED]
 *     - translateSinglePass()
 *       • Phase 1: Patterns
 *       • Phase 2: Proper Nouns
 *       • Phase 3: Numbers (NumberProcessor.processTokens, via this.numberProcessor —
 *         a separate class, not a TranslationEngine method like its phase siblings;
 *         fixed 2026-08-18, previously cited a non-existent processNumbersWasm method)
 *       • Phase 4: Phrases
 *       • Phase 5: Characters
 *     - Critical: Phase order is IMMUTABLE
 *
 * 16. Utility Methods & Factory                              [SAFE]
 *     - createTranslationEngine()
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
import {
  getTokenSpanForText,
  getTextFromTokens,
  getTextPositionForTokenIndex,
} from './TokenHelpers.js';
import { PatternStore } from './pattern/PatternStore.js';
import { TextChunker } from './text/TextChunker.js';
import { ChunkPostProcessor } from './text/ChunkPostProcessor.js';
import { NumberProcessor } from './NumberProcessor.js';
import { fixNumberPlusLiang } from './NumberLiangFix';
import { cleanupFormatting } from './text/FormattingPasses';
import { assembleCharOnlyResult } from './text/CharOnlyAssembly';
import { SemanticArrayBuilder } from './highlighting/SemanticArrayBuilder.js';
import { emptySemanticArrays } from './highlighting/SegmentPrecomputer.js';
import TwoPhasePatternProcessor from './pattern/TwoPhasePatternProcessor.js';
import { PatternFailureTracker } from './pattern/PatternFailureTracker.js';
import { claimSpan, claimGroupedSpan, isClaimed } from './TokenClaim.js';
import { openMatchSource } from './dictionary/MatchSource';
import { characterMatchFor } from './dictionary/CharacterMatch';
// WasmTranslationAccelerator removed - using pure JavaScript translation
// Phase 4 conflict resolution — pure JS (the WASM twin was slower, ADR-083)
import { resolveGlobalConflicts } from './ConflictResolution';

import {
  getSourcePriority as getSourcePriorityFn,
  isConsumedSource,
  validateConsumedTokenContract,
} from './TranslationSourcePriority.js';
import { calculateNextBatchSize, MIN_BATCH_SIZE } from './text/AdaptiveBatchSizer.js';
import { createProgressiveBatchText } from './text/ProgressiveBatchText';
import { assembleFullText } from './text/FullTextAssembly';
import { logger } from './logger';
import { buildProperNounCapitalizationMap } from './text/ProperNounCapitalizationMap';
import { assembleWithSpacing } from './text/TextAssembly.js';
import { TranslationProfiler } from './performance/TranslationProfiler.js';
import toast from './toast';
import {
  MEMORY_MANAGEMENT,
  PHASE_TIMEOUTS, // LOW-2 FIX: Import phase timeouts from constants
  MAX_INPUT_TOKENS,
  UI_TIMEOUTS,
  PATTERN_FAILURE_DETECTION,
} from '../constants/TranslationConstants.js';

/**
 * @import {
 *   TranslationEngine,
 *   TranslationEngineInitOptions,
 * } from '../types/TranslationEngineTypes'
 */

/**
 * @typedef {Object} ChunkOptions
 * @property {number}  [chunkOffset=0]          - TOKEN count of all preceding chunks.
 *                                                 Used as offset for cross-chunk tokenIndex.
 * @property {number}  [chunkCharOffset=0]      - UTF-16 index of the chunk's content in the full text
 *                                                 (`TextChunk.startIndex`); added to `originalStart`.
 * @property {boolean} [returnSemanticArrays]    - Include semantic arrays in result object
 * @property {boolean} [returnPrebuiltSegments]  - Include pre-built segments for ClickableTranslationOptimized
 * @property {boolean} [useChunking]             - Enable adaptive chunking for long texts
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
    });
    this.patternStore = new PatternStore();
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
    // Per-phase contract checks run only on an engine that was never initialized, outside production
    this.validatePhaseContracts = process.env.NODE_ENV !== 'production';
    this.punctuationDict = {}; // Store punctuation translation dictionary

    // MEMORY MANAGEMENT: Bounded collection limits
    this.MAX_PROPER_NOUN_TRANSLATIONS = MEMORY_MANAGEMENT.MAX_PROPER_NOUN_TRANSLATIONS; // Maximum proper noun cache size (prevents unbounded growth)

    // Initialize parallel processing configuration (will be set during first use)

    // Hierarchical pattern processing settings
    this.settings = {
      enableTwoPhasePatterns: true, // Enable hierarchical pattern processing
    };

    // Initialize translation profiler for performance analysis
    this.phaseProfiler = new TranslationProfiler();

    // Store reference to TwoPhasePatternProcessor for internal profiling
    this.twoPhaseProcessor = null;

    // Tracks failures of the WASM pattern matcher — failure count, time window, disable threshold
    this.patternFailureTracker = new PatternFailureTracker({
      failureWindowMs: PATTERN_FAILURE_DETECTION.FAILURE_WINDOW_MS,
      disableThreshold: PATTERN_FAILURE_DETECTION.MAX_FAILURES,
    });

    // The most tokens one translateDirectly call accepts. A field, not a constant, so a test can lower it.
    this.maxInputTokens = MAX_INPUT_TOKENS;
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
   *
   * @critical
   * Must be called to prevent memory leaks in long-running applications.
   * After calling destroy(), the engine instance cannot be reused - create a new instance.
   */
  destroy() {
    // Dispose the dictionary manager, rather than only clearing its cache.
    //
    // `clearCache()` empties the translation cache and nothing else, so every trie and the
    // flat entry list outlived the engine that owned them. A reload builds a replacement
    // engine, so that was a leak *per reload*.
    //
    // `dispose()` is what releases them. It leaves the manager unusable, which is
    // exactly the contract this method already documents for the engine as a whole. It
    // also sets `ready = false`, so `isReady()` stays answerable rather than throwing on
    // the nulled fields.
    if (this.dictionaryManager) {
      this.dictionaryManager.dispose();
    }

    // Clear proper noun translations map
    if (this.properNounTranslations) {
      this.properNounTranslations.clear();
      this.properNounTranslations = null;
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
    this.activeProperNouns = options.activeProperNouns ?? ['properNouns'];
    // The one place the engine's dictionaries are chosen: inactive proper nouns dropped, active
    // paired patterns merged into `patterns` (ADR-027, ADR-048).
    const dictionaries = filterDictionariesForEngine(allDictionaries, this.activeProperNouns);

    // Store dictionaries for Core Engine sync
    this.lastLoadedDictionaries = dictionaries;
    logger.log(
      `🔧 Stored dictionaries for Core Engine sync: ${Object.keys(dictionaries).join(', ')}`
    );

    // An initialized engine skips the per-phase contract checks (O(n) snapshots per phase)
    this.validatePhaseContracts = false;

    try {
      // Documented in TranslationEngineInitOptions (TranslationEngineTypes.d.ts) as
      // `patternSettings?: PatternProcessingSettings` but never actually wired up
      // (architecture review 2026-07-30, candidate #3 grilling — zero references
      // to `options.patternSettings` anywhere before this fix). Merge onto the
      // constructor's { enableTwoPhasePatterns: true, ... } defaults.
      if (options.patternSettings) {
        this.settings = { ...this.settings, ...options.patternSettings };
      }

      // Load dictionaries into trie structures
      await this.dictionaryManager.loadDictionaries(dictionaries, {
        ...options,
        activeProperNouns: this.activeProperNouns,
      });

      // Cache proper noun translations for capitalization preservation
      this.properNounTranslations = buildProperNounCapitalizationMap(
        dictionaries,
        this.activeProperNouns,
        this.MAX_PROPER_NOUN_TRANSLATIONS
      );

      // Initialize semantic pattern processor
      if (dictionaries.patterns) {
        await this.patternStore.initializePatterns(dictionaries.patterns);

        // The WASM matcher cannot run, so say so now: left on, every chunk would throw "not
        // available", skipping Phase 1 until the failure counter gave up. Only ever turns it off.
        if (this.patternStore.patterns.length > 0 && !this.patternStore.wasmAvailable) {
          this.settings.enableTwoPhasePatterns = false;
          logger.error('WASM pattern processor unavailable; Phase 1 (patterns) is skipped');
          toast.error(
            'WASM pattern matching is unavailable, so patterns are skipped. Reload dictionaries (Cmd+R) to retry.',
            { duration: 10000 }
          );
        }
      }

      // Load punctuation dictionary for post-processing
      if (dictionaries.punctuation) {
        this.punctuationDict = dictionaries.punctuation;
      }

      this.isInitialized = true;
      // ERROR HANDLING FIX: Clear any previous initialization errors
      this.initializationError = null;

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
   * is significantly faster than full 5-phase translation. Each character is a point lookup in
   * the characters dictionary (ADR-087); no Rust lookup index is built for it.
   *
   * Translation process:
   * 1. Tokenize input text into individual characters
   * 2. Lookup each character in character dictionary
   * 3. Generate semantic arrays for clickable highlighting
   * 4. Assemble final translated text with position tracking
   *
   * @param {string} text - Input Chinese text to translate
   * @param {Object} [options={}] - Translation options
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
   * @see translateWithSegments - Full 5-phase translation (patterns, proper nouns, numbers, phrases, characters)
   * @see translateSinglePass - Core 5-phase translation pipeline
   * @see characterMatchFor - The point lookup both character passes apply (CharacterMatch.ts)
   *
   * @performance
   * - Small texts (<500 chars): ~10ms for 100 characters
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

    logger.debug('[char-engine]', `Starting character-only translation: ${text.length} chars`);

    try {
      // Tokenize the entire text directly (chunking would drop whitespace and punctuation)
      const tokens = this.tokenizer.tokenize(text);

      // Only Phase 5 applies: no number processing, each character translates on its own
      this.processCharacterOnlyTokens(tokens, options);

      // Text, units and positions come from the stamped tokens (CharOnlyAssembly)
      const { translatedText, semanticArrays } = assembleCharOnlyResult(tokens, (char) =>
        this.lookupPunctuation(char)
      );

      logger.debug(
        '[char-semantics]',
        `Character-only translation completed: ${translatedText.length} chars, ${semanticArrays.original.length} semantic units`
      );

      return {
        translatedText,
        semanticArrays,
        prebuiltSegments: [],
      };
    } catch (error) {
      logger.error('🚨 Character-only translation failed:', error);
      throw error;
    }
  }

  /**
   * Process tokens using only character-level translation (Phase 5)
   * Also includes punctuation and whitespace for readability
   *
   * Stamps tokens only: it passes `recordMatches: false` to applyMatchToTokens, so it adds
   * nothing to `this.semanticArrayBuilder`. The caller
   * (translateWithCharactersOnly) builds its own arrays from the stamped tokens.
   *
   * A point lookup, like Phase 5 (ADR-087): synchronous, so the pass cannot interleave with
   * another call into the engine.
   *
   * @param {Array} tokens
   * @param {Object} options
   */
  processCharacterOnlyTokens(tokens, options) {
    const stampOptions = { ...options, recordMatches: false };
    const dictionary = this.dictionaryManager.getDictionary('characters');

    if (!dictionary) {
      // MEDIUM-8 FIX: Standardize error logging with logger.error
      logger.error('🚨 Character-only processing - No character dictionary found');
      return;
    }

    // Process each token individually
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Skip already processed tokens (including WASM number conversions)
      if (
        token.translated != null ||
        isConsumedSource(token.translationSource, 'number_conversion')
      ) {
        continue;
      }

      // Handle different token types - ensure ALL tokens get processed
      if (token.type === 'chinese_char') {
        const match = characterMatchFor(dictionary, token);

        if (match) {
          this.applyMatchToTokens(tokens, i, match, stampOptions);
        } else {
          // No dictionary match, preserve as-is
          token.translated = token.value;
          token.translationSource = 'untranslated-chinese';
          if (process.env.NODE_ENV === 'development') {
            logger.log(`⚠️ Chinese char untranslated: "${token.value}"`);
          }
        }
      } else {
        // Every other token type (punctuation, whitespace, latin_word, number, unknown) is kept
        // as-is. Punctuation is translated later, by cleanupFormatting's lookupPunctuation:
        // applyMatchToTokens ignores a non-Chinese start token, so matching it here stamped nothing.
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
  // Extraction Potential: NONE - Phase 4's conflict resolution is already the pure ConflictResolution.ts; see src/utils/CLAUDE.md
  // Critical: translateWithSegments resets the semantic array builder per call
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
   * @param {(event: import('../types/TranslationEngineTypes').BatchCompleteEvent) => void} [options.onBatchComplete] - Called once per batch with the text so far (ADR-105)
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
   * // Streaming updates, one per batch
   * const result = await engine.translateWithSegments(longText, {
   *   onBatchComplete: ({ partialText, completedChunks, totalChunks }) => {
   *     console.log(`${completedChunks}/${totalChunks}: ${partialText}`);
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
   * @see translateSinglePass - Core 5-phase translation pipeline
   * @see ClickableTranslationOptimized - UI component that renders segments
   *
   * @performance
   * - Progressive mode: Better for long texts (>5000 chars), enables streaming UI updates
   * - Chunked mode: Better for accuracy and potential parallelization
   * - Automatically builds Rust lookup index for texts of 50+ chars (6-50x speedup)
   *
   * @critical
   * This method resets the semantic array builder for each new translation.
   * Do not call concurrently - results will interfere with each other.
   */
  async translateWithSegments(text, options = {}) {
    // Performance monitoring: track timing for bottleneck detection
    const perfStartTime = performance.now();

    // Reset semantic array builder for new translation with capacity estimation
    this.semanticArrayBuilder.reset();

    // Progressive batch translation is the sole path — the non-progressive `translate()`
    // dispatcher (with translateWithChunking/translateDirectly at the top level) was deleted
    // 2026-08-17 (architecture review candidate #2 grilling) after tracing zero production
    // reachability. The `progressive` option that used to select it was never read and is
    // gone too (ADR-105); a missing `onBatchComplete` just means no streaming updates.
    const progressiveResult = await this.translateWithProgressiveBatches(text, options);
    const translatedText = progressiveResult.translatedText;
    const semanticArrays = progressiveResult.semanticArrays;

    const result = {
      originalText: text,
      translatedText: translatedText,
      semanticArrays: semanticArrays, // Components compute segments on-demand from this
      prebuiltSegments: progressiveResult.prebuiltSegments, // Instant segments built during translation
    };

    // Performance monitoring: check for bottlenecks
    logger.debugIfSlow('translateWithSegments', perfStartTime, {
      textLength: text.length,
      resultLength: result.translatedText.length,
      semanticArrays: result.semanticArrays?.length ?? 0,
      segmentsCount: result.segments?.length ?? 0,
      prebuiltSegments: result.prebuiltSegments?.length ?? 0,
    });

    return result;
  }

  // ============================================================================
  // SECTION 8: PHASE 1 - PATTERN PROCESSING
  // ============================================================================
  // Purpose: Apply semantic patterns (hierarchical two-phase, WASM matcher)
  // Dependencies: PatternStore, TwoPhasePatternProcessor
  // Extraction Potential: NONE - First phase, sets token state for all others
  // Critical: Pattern-consumed tokens block all subsequent phases
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
   * @see PatternStore - Holds the parsed patterns and the WASM processor's lifetime
   * @see TwoPhaseHierarchicalProcessor - Implements hierarchical pattern system
   * @see WasmPatternProcessor - WASM acceleration module
   *
   * @performance
   * - ADR-096: 0.07 ms per call at p50 on the WASM matcher
   *
   * @critical
   * Must run FIRST in 5-phase pipeline (highest priority).
   * Consumed tokens are blocked from all subsequent phases.
   * A pattern failure is not fatal: Phase 1 is skipped for that call. After
   * PATTERN_FAILURE_DETECTION.MAX_FAILURES WASM failures within the window the matcher is
   * switched off and Phase 1 is skipped until the dictionaries reload (ADR-101).
   *
   * @architectural
   * Cannot be extracted because pattern-consumed tokens affect all subsequent phases.
   * Token state changes must be synchronized with phase execution order.
   */
  async applyPatterns(tokens, options) {
    if (!this.patternStore.isInitialized) {
      return;
    }

    // Off after repeated failures or when WASM never initialized: Phase 1 is skipped (ADR-101)
    if (!this.settings.enableTwoPhasePatterns || this.patternStore.patterns.length === 0) {
      return;
    }

    try {
      // Create or reuse TwoPhasePatternProcessor instance
      if (!this.twoPhaseProcessor) {
        this.twoPhaseProcessor = new TwoPhasePatternProcessor(this.patternStore.patterns);
      }

      // The processor reads exactly these two keys (to build its variable cache). Passing the
      // translation options through copied options it never looked at.
      const enhancedOptions = {
        activeProperNouns: this.activeProperNouns,
        dictionaryManager: this.dictionaryManager,
      };

      const hierarchicalResults = await this.twoPhaseProcessor.processTokens(
        tokens,
        enhancedOptions
      );

      this.applyHierarchicalResults(tokens, hierarchicalResults, options);

      const { recovered, previousCount } = this.patternFailureTracker.reportSuccess();
      if (recovered) {
        logger.log(`✅ Pattern processing recovered after ${previousCount} previous failure(s)`);
      }
    } catch (error) {
      // Pattern processing failures must not crash translation — phases 2-5 continue
      logger.error('❌ Error in pattern processing phase:', error);
      logger.error('Pattern phase will be skipped - translation quality may be reduced');

      const { action, count } = this.patternFailureTracker.reportFailure();

      if (action === 'disable') {
        this.settings.enableTwoPhasePatterns = false;
        toast.error(
          'WASM pattern matching was turned off after repeated failures, so patterns are skipped. Reload dictionaries (Cmd+R) to turn it back on.',
          { duration: 10000 }
        );
        logger.error(
          `🚨 WASM pattern processing disabled after ${count} consecutive failures within ${PATTERN_FAILURE_DETECTION.FAILURE_WINDOW_MS / 60000} minutes — Phase 1 is skipped until the engine is rebuilt`
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
   * Apply hierarchical pattern results to tokens
   * @param {Array} tokens - Token array
   * @param {Array} hierarchicalResults - Results from two-phase processing
   * @param {Object} options - Processing options
   */
  applyHierarchicalResults(tokens, hierarchicalResults, options) {
    for (const result of hierarchicalResults) {
      // Apply translation to the first token of the span
      claimSpan(
        tokens,
        result.startIndex,
        result.endIndex,
        result.translationSource || 'hierarchical_pattern',
        result.translation,
        this.activeProperNouns ?? []
      );
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
        globalTokenIndex
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
  // ============================================================================

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
      const isProcessed = isClaimed(token);
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
   * Phase 4: Phrases. Look up a phrase at every unclaimed token, resolve overlaps globally
   * (longest wins), then apply. Runs whether or not patterns loaded: it reads no pattern
   * setting (ADR-006 addendum). A failure throws to translateSinglePass's Phase 4 catch,
   * which records the real message.
   * @param {Array} tokens - Token array
   * @param {Object} options - Processing options
   */
  processRemainingPhrases(tokens, options) {
    const fullText = getTextFromTokens(tokens);
    const allPotentialMatches = [];

    // HIGH-4 FIX: Pre-compute unprocessed ranges to avoid redundant checks
    const unprocessedRanges = this.findUnprocessedRanges(tokens);

    // Process only unprocessed ranges
    for (const range of unprocessedRanges) {
      for (let i = range.start; i <= range.end; i++) {
        const token = tokens[i];

        // Double-check token is still unprocessed (may have been grouped in previous iteration)
        if (isClaimed(token)) continue;

        const textPosition = getTextPositionForTokenIndex(tokens, i);
        // The sync lookup: a one-dictionary search, which never takes the WASM tier anyway
        const phraseMatches = this.dictionaryManager.findAllMatches(fullText, textPosition, [
          'phrases',
        ]);

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
                if (isClaimed(checkToken)) {
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
    const resolvedMatches = resolveGlobalConflicts(allPotentialMatches);

    for (const resolvedMatch of resolvedMatches) {
      if (resolvedMatch.type === 'phrase') {
        const { startIndex, match, tokenSpan } = resolvedMatch;

        // Apply phrase translation
        claimGroupedSpan(
          tokens,
          startIndex,
          tokenSpan,
          'phrases',
          match.translation,
          match.word,
          this.activeProperNouns ?? []
        );

        // Add to semantic array for bidirectional highlighting
        const globalTokenIndex = startIndex + (options.chunkOffset || 0);
        this.semanticArrayBuilder.addUnit(
          match.word,
          match.translation,
          'phrases',
          globalTokenIndex
        );
      }
    }
  }

  // PHASE 2.1 EXTRACTION: parsePatternToTokens() and applyPatternTemplate()
  // moved to PatternTemplateEngine utility (2026-01-30)
  // See: src/utils/PatternTemplateEngine.js

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
   * Phase 2: Proper Nouns. Looks up the tokens no earlier phase claimed in the active
   * proper-noun dictionaries (`this.activeProperNouns`), one category, `properNouns`
   * (ADR-082: a phase's dictionaries share one category).
   *
   * Left to right, the longest match at each token wins, with one exception: the
   * lookahead defers a match when a token inside its span starts a STRICTLY LONGER match
   * (src/utils/CLAUDE.md, "Phase 2 proper noun lookahead"). The overlap check against
   * the spans already applied guards a span whose token count disagrees with its text.
   *
   * A lookup failure is logged and swallowed: the tokens stay unclaimed for later phases.
   *
   * @param {Array<Object>} tokens - Tokenized input text, modified in place
   * @param {Object} options - Translation options, passed through to applyMatchToTokens
   * @param {import('./dictionary/MatchSource').MatchSource} matchSource - Answers the match lookups
   * @returns {Promise<void>}
   *
   * @see translateSinglePass - Calls this method as Phase 2
   * @see MatchSource.forPhase - The lookup seam
   *
   * @critical
   * Runs after Phase 1 (patterns) and before Phase 3. Phase order is IMMUTABLE.
   */
  async applyProperNouns(tokens, options, matchSource) {
    // Outside the try, as at the old call site: a missing list is a phase failure, not a
    // swallowed lookup error.
    const dictionaryOrder = [...this.activeProperNouns];
    try {
      // The match lookup for the active proper-noun dictionaries, shared by the main scan and
      // the lookahead-defer scan below. It answers from the Rust index or the JS trie.
      const matchesAt = matchSource.forPhase(dictionaryOrder);

      // Text ranges of the matches already applied, for the overlap check
      const processedRanges = [];

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Skip tokens an earlier phase claimed
        if (isClaimed(token)) continue;

        // Only translate Chinese content
        if (token.type !== TokenType.CHINESE_WORD && token.type !== TokenType.CHINESE_CHAR) {
          continue;
        }

        const filteredMatches = matchesAt(tokens, i, 'properNouns');

        if (filteredMatches.length > 0) {
          const bestMatch = filteredMatches[0];

          // Check for overlap with the matches already applied
          let hasConflict = false;
          const matchStart = getTextPositionForTokenIndex(tokens, i);
          const matchEnd = matchStart + bestMatch.word.length;

          for (const range of processedRanges) {
            // Check for overlap: match overlaps with range if they share any position
            if (!(matchEnd <= range.start || matchStart >= range.end)) {
              hasConflict = true;
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
              if (isClaimed(tokens[j])) continue;
              const jMatches = matchesAt(tokens, j, 'properNouns');
              if (jMatches.length > 0 && jMatches[0].word.length > bestMatch.word.length) {
                deferToLookahead = true;
              }
            }
            if (deferToLookahead) {
              continue;
            }

            // Apply translation to the matched tokens
            this.applyMatchToTokens(tokens, i, bestMatch, options);

            processedRanges.push({ start: matchStart, end: matchEnd });

            // Skip ahead past the matched tokens
            // BUG FIX: Ensure we never go backwards or stay in same place
            if (tokenSpan > 0) {
              i += tokenSpan - 1;
            }
            // If tokenSpan is 0, just continue to next token (i will increment naturally)
          }
        }
      }
    } catch (error) {
      // A dictionary lookup failure must not crash the translation: the tokens stay
      // unclaimed and fall through to later phases, at reduced quality.
      logger.error('❌ Error in proper noun phase dictionary translation:', error);
      logger.error(
        `🚨 Proper noun phase failed: ${error.message} - continuing with remaining phases`
      );
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

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let output = '';
      let isProperNoun = false;

      if (token.translated !== null) {
        output = token.translated;

        // Check if this token was marked as a proper noun during dictionary matching
        if (token.isProperNoun) {
          isProperNoun = true;
        }
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

    // Step 2: Join segments with appropriate spacing AND track positions for semantic array
    const { translatedText: result, positions: assembledPositions } = assembleWithSpacing(segments);

    // Compute cumulative character positions from token value lengths.
    // token.start is a code-point index (WASM) or UTF-16 index (JS fallback), never bytes, and the
    // two differ after an astral char. Summing value.length gives the UTF-16 position.
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
          tokenIndex < tokens.length
            ? tokenCharPositions[tokenIndex] + (options.chunkCharOffset ?? 0)
            : undefined
        );
      }
    }

    const cleaned = cleanupFormatting(result, options, (char) => this.lookupPunctuation(char));

    return cleaned;
  }

  /**
   * Apply a dictionary match to the appropriate tokens with semantic grouping
   * @param {Token[]} tokens - Array of tokens
   * @param {number} startIndex - Starting token index
   * @param {Object} match - Dictionary match object
   * @param {Object} options - Translation options (may include chunkOffset). `recordMatches: false`
   *   stamps the tokens without touching the engine's shared semantic builder
   *   (the character-only pass, which builds its own arrays).
   */
  applyMatchToTokens(tokens, startIndex, match, options = {}) {
    // CRITICAL BUG FIX: Verify that the starting token is actually Chinese before applying the match
    if (startIndex >= tokens.length) {
      logger.error(
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

    // Mark the first token with the translation and create semantic group
    if (tokenSpan > 0) {
      // The leader keeps the dictionary's exact translation (a proper noun keeps its capitalization)
      // and the span's followers are consumed by it; see TokenClaim.ts.
      claimGroupedSpan(
        tokens,
        startIndex,
        tokenSpan,
        match.dictionary,
        match.translation,
        match.word,
        this.activeProperNouns ?? []
      );
      if (isActiveProperNounSource(match.dictionary, this.activeProperNouns)) {
        tokens[startIndex].isProperNoun = true;
      }

      const recordMatches = options.recordMatches !== false;

      // NEW: Capture semantic relationship for array-based highlighting
      // Calculate global position accounting for chunk offset
      //
      // IMPORTANT: one semantic unit per match, recorded for the leader only (intentional design):
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
      if (recordMatches) {
        this.semanticArrayBuilder.addUnit(
          match.word, // original text
          match.translation, // translated text
          semanticSource, // source — proper noun dict name or 'phrases'
          globalTokenIndex // global token index for proper ordering
        );
      }
    }
  }

  // calculateTranslatedPositions method removed - position tracking now handled inline during text construction

  /**
   * The punctuation dictionary's translation of one character, for `cleanupFormatting`.
   * @param {string} char
   * @returns {string|undefined}
   */
  lookupPunctuation(char) {
    return this.dictionaryManager.translate(char, ['punctuation'])?.translation;
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

  // ============================================================================
  // SECTION 12: PARALLEL PROCESSING
  // ============================================================================
  // Purpose: Process a batch's chunks concurrently within progressive translation
  // Dependencies: translateDirectly
  // Critical: assigns semantic indices by chunk-completion order — see
  //   compareByTokenIndex (src/utils/highlighting/TextPositionMapper.ts) for the
  //   downstream correction this depends on
  // ============================================================================

  /**
   * Process chunks in parallel within a batch
   *
   * EXECUTION PATH:
   *   - Called by: translateWithProgressiveBatches() for each batch
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
   * @param {number[]} chunkTokenOffsets - Per chunk, aligned with `batch`: the TOKEN count of all
   *   text before it (see translateWithProgressiveBatches)
   * @returns {Promise<{ batchNumber: number, processingTime: number, avgTimePerChunk: number }>}
   *   Resolves when all chunks are processed, with the batch's timing for the caller's callbacks
   */
  async processChunksInParallel(batch, options, chunkTokenOffsets) {
    const startTime = performance.now();

    // Chunks in a batch always run in parallel; there is no sequential fallback.

    try {
      // Process all chunks in parallel
      await Promise.all(
        batch.map(async (chunk, index) => {
          // CRITICAL FIX: Deep copy options for parallel processing
          // Each chunk runs in parallel - shared nested objects would cause race conditions
          const chunkOptions = {
            ...options,
            useChunking: false,
            // Apply global token offset so addUnit entries land at correct positions in the
            // shared semantic builder. Chunks run in parallel on the shared builder — this
            // can produce "all candidates already mapped" debug logs when setPositionByMatch
            // is called redundantly, but those are harmless: the first call sets the correct
            // position and subsequent calls are no-ops.
            chunkOffset: chunkTokenOffsets[index],
            // The chunk's content starts after any leading punctuation, so token positions
            // are local to it; `originalStart` is an offset into the whole text.
            chunkCharOffset: chunk.startIndex,
            isParallelChunk: true, // Prevent semantic array reset in individual chunks
          };

          chunk.translated = await this.translateDirectly(chunk.content, chunkOptions);

          // Log individual chunk completion for debugging
        })
      );

      const processingTime = performance.now() - startTime;
      const avgTimePerChunk = processingTime / batch.length;

      return { processingTime, avgTimePerChunk };
    } catch (error) {
      // Handle parallel processing errors with performance tracking
      logger.error('Parallel chunk processing failed:', error);

      throw new Error('Parallel chunk processing failed and sequential fallback is disabled', {
        cause: error,
      });
    } finally {
      // Performance monitoring: check for bottlenecks regardless of success/failure
      logger.debugIfSlow('processChunksInParallel', startTime, {
        batchSize: batch.length,
      });
    }
  }

  /**
   * Phase 5: translate every token no earlier phase claimed, by a point lookup in the characters
   * dictionary. Its keys are one code point (PersistTimeValidator enforces that on every write and
   * DictionaryManager warns on a load that breaks it), so a match is always one token long: no
   * span, no overlap, nothing to batch. See ADR-087.
   * @param {Token[]} tokens - Array of tokens
   * @param {Object} options - Translation options
   */
  async processRemainingTokens(tokens, options) {
    const dictionary = this.dictionaryManager.getDictionary('characters');
    if (!dictionary) return;

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

        // Skip guard: a token an earlier phase claimed
        if (isClaimed(tokens[i])) continue;

        const match = characterMatchFor(dictionary, tokens[i]);
        if (match) {
          this.applyMatchToTokens(tokens, i, match, options);
        }

        // Time-slice: yield control when processing time exceeds 16ms (60fps threshold)
        if (i % 150 === 149 && performance.now() - characterPhaseYieldTime > 16) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          characterPhaseYieldTime = performance.now();
        }
      }
    } catch (error) {
      logger.error(`🚨 Phase 5 Character Processing failed:`, error);
      logger.error(`🚨 Phase 5 Error stack:`, error.stack);
    }
  }

  /**
   * Progressive translation: chunks the text, translates it in adaptive batches, and reports
   * each finished batch through `options.onBatchComplete`.
   *
   * Process flow:
   * 1. Split text into chunks by punctuation boundaries
   * 2. Translate the chunks in batches sized by AdaptiveBatchSizer
   * 3. After each batch, call onBatchComplete with the text so far (ADR-105)
   * 4. Assemble the full result once, in FullTextAssembly
   *
   * The batch event carries text and counts only, never semantic arrays: the final result is
   * the only place the arrays leave the engine. Every batch fires the event; the caller owns
   * any throttling.
   *
   * @param {string} text - Input Chinese text to translate
   * @param {Object} [options={}] - Translation options
   * @param {(event: import('../types/TranslationEngineTypes').BatchCompleteEvent) => void} [options.onBatchComplete] - Called after each batch
   * @param {AbortSignal} [options.abortSignal] - Signal to abort translation (checked between batches)
   *
   * @returns {Promise<Object>} Translation result
   * @returns {string} result.translatedText - Complete translated text
   * @returns {Object} result.semanticArrays - Semantic arrays for highlighting
   *
   * @see translateWithSegments - Entry point
   * @see TextChunker - Handles text splitting by punctuation
   *
   * @critical
   * Each batch processes sequentially to maintain position tracking accuracy.
   */

  // ============================================================================
  // SECTION 13: PROGRESSIVE BATCH TRANSLATION
  // ============================================================================
  // Purpose: Stream translation results in batches for UI progress updates
  // Dependencies: AdaptiveBatchSizer, processChunksInParallel, ProgressiveBatchText,
  //   FullTextAssembly
  // Critical: batchPerformanceHistory is a local, so it resets per translation
  // ============================================================================

  async translateWithProgressiveBatches(text, options = {}) {
    // Reset semantic builder with capacity estimation for progressive translation
    this.semanticArrayBuilder.reset();

    // The running text the batch event carries; see ProgressiveBatchText.ts
    const progressiveText = createProgressiveBatchText({
      punctuationDict: this.punctuationDict,
      chunkPostProcessor: this.chunkPostProcessor,
    });

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

    // Step 2: Process chunks in adaptive batches. Start at MIN_BATCH_SIZE — the floor the
    // sizer's severe-degradation shrink guard (currentBatchSize > MIN_BATCH_SIZE) assumes —
    // and let calculateNextBatchSize grow it toward MAX_BATCH_SIZE while batches stay fast.
    let currentBatchSize = MIN_BATCH_SIZE;

    // Adaptive batch sizing reads this history; it is local, so each translation starts empty
    const batchPerformanceHistory = [];
    let performanceBaseline = null;

    let processedChunks = 0;
    let batchIndex = 0;

    // Where each chunk starts in token space: the TOKEN count of every chunk before it (not the
    // chunk index). Computed once, here, so a batch only slices it. Tokenizing the chunk is the
    // only way to count: `getSemanticTokens()` expects TextToken[], and given a string it returns
    // [], which would zero every offset and collapse cross-chunk token indices to chunk-local ones
    // (same-translated-text disambiguation then sorts wrong). The raw count matches the raw index
    // `addUnit` records.
    let cumulativeTokenCount = 0;
    const chunkTokenOffsets = translatableChunks.map((chunk) => {
      const offset = cumulativeTokenCount;
      cumulativeTokenCount += this.tokenizer.tokenize(chunk.content).length;
      return offset;
    });

    while (processedChunks < translatableChunks.length) {
      // CODE REVIEW FIX (2026-02-01): Check abort signal between batches
      // Allows users to cancel long translations mid-processing
      if (options.abortSignal?.aborted) {
        logger.warn('🛑 Translation cancelled by user (abort signal)');
        throw new Error('Translation cancelled by user');
      }

      // Adaptive batch sizing: adjust based on performance history
      const sizing = calculateNextBatchSize({
        batchPerformanceHistory,
        currentBatchSize,
        performanceBaseline,
        batchIndex,
      });
      currentBatchSize = sizing.batchSize;
      performanceBaseline = sizing.performanceBaseline;
      if (sizing.log?.level === 'warn') {
        logger.warn(sizing.log.message);
      }

      const batchStart = processedChunks; // Chunk index
      const batchEnd = Math.min(batchStart + currentBatchSize, translatableChunks.length);
      const currentBatch = translatableChunks.slice(batchStart, batchEnd);

      // Translate current batch (with parallel processing)
      const batchTiming = await this.processChunksInParallel(
        currentBatch,
        options,
        chunkTokenOffsets.slice(batchStart, batchEnd)
      );
      const batchNumber = batchIndex + 1; // 1-based, as the UI shows it

      // Track performance degradation across batches (read by calculateNextBatchSize)
      batchPerformanceHistory.push({
        batchNumber,
        processingTime: batchTiming.processingTime,
        avgTimePerChunk: batchTiming.avgTimePerChunk,
        chunkCount: currentBatch.length,
        timestamp: Date.now(),
      });

      // Yield to event loop after each batch so the UI can paint a frame.
      // processChunksInParallel runs synchronous WASM (pattern + number processing) inside
      // Promise.all — microtasks drain without ever returning to the browser event loop.
      // This single setTimeout(0) is applied unconditionally since each batch is already a
      // natural yield point.
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Only the current batch is processed here, never all chunks again (no O(n²) rework).
      // Capitalization happens once, at the final level.
      // `chunks`, not translatableChunks: comma spacing reads the non-translatable neighbours.
      const { batchText, cumulativeText } = progressiveText.addBatch(currentBatch, chunks);

      this.semanticArrayBuilder.updateWithCapitalizedText(batchText);

      // Update progress tracking
      processedChunks = batchEnd;
      batchIndex++;

      // Streaming callback: the batch's text is in place, so partialText includes the batch
      // that just finished. Text and counts only; the caller throttles (ADR-105).
      if (options.onBatchComplete) {
        try {
          options.onBatchComplete({
            partialText: cumulativeText,
            completedChunks: processedChunks,
            totalChunks: translatableChunks.length,
            batchNumber,
            avgTimePerChunk: batchTiming.avgTimePerChunk,
          });
        } catch (callbackError) {
          logger.warn('⚠️ Batch completion callback failed:', callbackError);
        }
      }
    }

    // Final processing over all chunks: the finishing order lives in FullTextAssembly.ts
    return assembleFullText(chunks, {
      chunkPostProcessor: this.chunkPostProcessor,
      punctuationDict: this.punctuationDict,
      properNounTranslations: this.properNounTranslations,
      builder: this.semanticArrayBuilder,
    });
  }

  // ============================================================================
  // SECTION 14: DIRECT TRANSLATION
  // ============================================================================
  // Purpose: Translate one chunk (or a short text) as a single unit
  // Dependencies: translateSinglePass, cleanupFormatting
  // Note: Called per chunk by processChunksInParallel, which the progressive branch drives
  // ============================================================================

  /**
   * Direct translation method (original single-text approach)
   *
   * Translates text as a single unit without chunking or progressive processing. This is the
   * core translation method that implements the full 5-phase pipeline. Called per chunk by
   * processChunksInParallel. Throws when the input is over the device token limit.
   *
   * Key features:
   * - Full 5-phase translation pipeline
   * - Automatic Rust lookup index for texts of 50+ chars (6-50x speedup)
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
   * @see processChunksInParallel - Calls this method for each chunk
   * @see translateSinglePass - Core 5-phase translation pipeline
   *
   * @performance
   * - Small texts (<500 chars): ~50-100ms
   * - Large texts (50+ chars with Rust index): 6-50x faster
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
    try {
      // CRITICAL FIX: Only reset segments if this is a standalone translation
      // DO NOT reset if this is part of multi-chunk translation (would lose semantic arrays from previous chunks)
      //
      // Context: When processChunksInParallel() calls translateDirectly() for each chunk:
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
        // Reset semantic array builder for new translation
        this.semanticArrayBuilder.reset();
      }

      // OPTIMIZATION: Rust-powered lookup index for large texts (6-50x faster); the match source
      // falls back to the JS trie for short text or when Rust is unavailable
      const matchSource = await openMatchSource(text, {
        dictionaryManager: this.dictionaryManager,
        logWarn: (msg) => logger.warn(msg),
      });

      // Phase 1: Tokenization with memory-based processing limits
      const tokens = this.tokenizer.tokenize(text);

      // CRITICAL: Validate token count to prevent memory exhaustion
      const estimatedTokenCount = text.length * 1.2; // Conservative estimate
      const maxTokensAllowed = this.maxInputTokens;

      if (tokens.length > maxTokensAllowed || estimatedTokenCount > maxTokensAllowed) {
        // A chunk is already the smallest unit the chunker produces (it splits on punctuation), so
        // there is nothing smaller to fall back to. A recursive re-chunking fallback lived here
        // until 2026-10-05: it re-split the same chunk and re-entered this check without end.
        throw new Error(
          `Input too large: ${tokens.length} tokens (limit ${maxTokensAllowed}). Please split your text into smaller sections.`
        );
      }

      // Use optimized single-pass processing
      await this.translateSinglePass(tokens, options, matchSource);

      // Phase 7: Post-processing and cleanup (simplified for direct mode)
      const result = this.postProcess(tokens, options);

      return result;
    } catch (error) {
      logger.error(`🚨 Translation error:`, error);
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
  //   2. Proper Noun Processing (applyProperNouns)
  //   3. Number Processing     (NumberProcessor.processTokens, via this.numberProcessor)
  //   4. Phrase Processing     (processRemainingPhrases)
  //   5. Character Processing  (processRemainingTokens)
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
   * 2. Proper Noun Processing (applyProperNouns)
   * 3. Number Processing (NumberProcessor.processTokens, via this.numberProcessor)
   * 4. Phrase Processing (processRemainingPhrases)
   * 5. Character Processing (processRemainingTokens) - Lowest priority
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
   * const translated = await engine.translateSinglePass(tokens, options, matchSource);
   *
   * @see translateDirectly - Calls this method after tokenization
   * @see applyPatterns - Phase 1 implementation
   * @see applyProperNouns - Phase 2 implementation
   * @see NumberProcessor.processTokens - Phase 3 implementation (delegated to a separate
   *      class via this.numberProcessor, not a TranslationEngine method like its phase
   *      siblings — corrected 2026-08-18, architecture review follow-up to candidate #3;
   *      previously cited a non-existent `processNumbersWasm` method)
   * @see processRemainingPhrases - Phase 4 implementation
   * @see processRemainingTokens - Phase 5 implementation
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
  async translateSinglePass(tokens, options, matchSource) {
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

    // CODE REVIEW FIX (CRITICAL-3): the consumed-token contract (both directions) lives in
    // TranslationSourcePriority.ts beside the source strings it checks.
    const validateContract = (phaseName) =>
      validateConsumedTokenContract(tokens, phaseName, this.activeProperNouns ?? []);

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
        logger.error(`🚨 Semantic array corruption detected in ${phaseName} phase`);

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
      const tokensBeforePhase1 = this.validatePhaseContracts
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
        if (this.validatePhaseContracts) {
          validateContract('patterns');
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
          this.notifyCriticalFailure();

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to next phase (graceful degradation)
      }

      // Phase 2: Apply proper nouns globally (highest priority after patterns)
      // HIGH FIX: Snapshot token count before phase for corruption detection
      const tokensLengthBeforePhase2 = tokens.length;
      const tokensBeforePhase2 = this.validatePhaseContracts
        ? tokens.map((t) => ({
            translated: t.translated,
            translationSource: t.translationSource,
          }))
        : null;
      try {
        validatePhaseOrder('properNouns');
        await withTimeout(
          this.phaseProfiler.profile('properNouns', async () => {
            await this.applyProperNouns(tokens, options, matchSource);
          }),
          PHASE_TIMEOUTS.properNouns,
          'properNouns'
        );
        completedPhases.add('properNouns');

        if (this.validatePhaseContracts) {
          validateContract('properNouns');
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

          this.notifyCriticalFailure();

          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to next phase (graceful degradation)
      }

      // Phase 3: Apply number conversion globally (before phrases to prevent fragmentation)
      // Numbers should be processed before phrases to preserve number sequences like "六十五"
      // This prevents phrase-level matches from breaking up number tokens
      // CODE REVIEW FIX 2026-01-27: Add token count snapshot for corruption detection
      const tokensLengthBeforePhase3 = tokens.length;
      const tokensBeforePhase3 = this.validatePhaseContracts
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
              semanticArrayBuilder: this.semanticArrayBuilder,
              ...options,
            });

            // Mark phase as completed
            completedPhases.add('numbers');
          }),
          PHASE_TIMEOUTS.numbers,
          'numbers'
        );

        if (this.validatePhaseContracts) {
          validateContract('numbers');
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
          this.notifyCriticalFailure();

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to next phase (graceful degradation)
      }

      // Phase 4: Apply phrases with global longest-match optimization
      // HIGH FIX: Snapshot token count before phase for corruption detection
      const tokensLengthBeforePhase4 = tokens.length;
      const tokensBeforePhase4 = this.validatePhaseContracts
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
            this.processRemainingPhrases(tokens, options);
          }),
          PHASE_TIMEOUTS.phrases,
          'phrases'
        );
        completedPhases.add('phrases');

        if (this.validatePhaseContracts) {
          validateContract('phrases');
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
          this.notifyCriticalFailure();

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to next phase (graceful degradation)
      }

      // Phase 5: Process remaining tokens for character-level translation (fallback)
      // HIGH FIX: Snapshot token count before phase for corruption detection
      const tokensLengthBeforePhase5 = tokens.length;
      const tokensBeforePhase5 = this.validatePhaseContracts
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
            await this.processRemainingTokens(tokens, options);
          }),
          PHASE_TIMEOUTS.characters,
          'characters'
        );
        completedPhases.add('characters');

        if (this.validatePhaseContracts) {
          validateContract('characters');
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
          this.notifyCriticalFailure();

          // Throw to stop execution (graceful degradation in caller)
          throw new Error(`Token array corruption detected: ${errorMsg}`);
        }

        // Continue to postProcess (graceful degradation)
      }

      // Apply final fixes that need to run after all processing
      this.phaseProfiler.profileSync('postProcess', () => {
        fixNumberPlusLiang(tokens);
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

        logger.warn(
          `⚠️ Translation completed with ${failedPhases.length} failed phase(s): ${failedPhases.join(', ')}`
        );

        // Log failure reasons for each failed phase
        for (const [phase, reason] of phaseFailures) {
          logger.warn(`  - ${phase}: ${reason}`);
        }

        // Store on engine instance for diagnostics API
        this.lastPhaseFailures = failureReport;
      } else {
        // Clear last failure report on successful run
        this.lastPhaseFailures = null;
      }

      // CODE REVIEW FIX 2026-01-27: Final semantic array corruption check
      // Note: Per-phase checking (added above) now identifies which phase caused corruption.
      // This final check catches any corruption that occurred during postProcess or cleanup.
      if (this.semanticArrayBuilder.isCorrupted) {
        logger.error(
          '🚨 Semantic array corruption detected after all phases (may be in postProcess)'
        );

        // A per-phase check that already toasted has told the user once; this one covers
        // corruption that only appeared during postProcess.
        if (!corruptionToastShown) {
          corruptionToastShown = true;
          toast.error('Translation quality degraded (postProcess). Try reloading dictionaries.', {
            duration: 10000,
          });
        }
      }
    });
  }

  /**
   * Tell the user a phase corrupted the token array and the translation was abandoned. The five
   * phase `catch` blocks in translateSinglePass call it; the message lives here once.
   */
  notifyCriticalFailure() {
    toast.error('Translation engine encountered a critical error. Please reload the page.', {
      duration: UI_TIMEOUTS.TOAST_DURATION_NORMAL,
    });
  }

  /**
   * Check if engine is ready for translation
   * @returns {boolean} Ready state
   */
  isReady() {
    return this.isInitialized && this.dictionaryManager.isReady();
  }
}

// ============================================================================
// SECTION 16: UTILITY METHODS & FACTORY
// ============================================================================
// Purpose: Public factory — use this, do not call `new TranslationEngine()` directly
// ============================================================================

// Factory function
export const createTranslationEngine = () => new TranslationEngine();
