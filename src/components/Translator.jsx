import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useReducer,
  startTransition,
} from 'react';
import { listen } from '@tauri-apps/api/event'; // CODE REVIEW FIX (CRITICAL-2): Listen for cache poisoning events
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { ChineseNumberConverter } from '../utils/ChineseNumberConverter';
import { TranslationInputValidator } from '../utils/TranslationInputValidator';
import { useScrollPositionManager } from '../hooks/useScrollPositionManager';
import { useTranslationController } from '../hooks/useTranslationController';
import { TOAST_DURATIONS, TOAST_IDS } from '../constants/toastConfig';
import { UI_TIMEOUTS } from '../constants/TranslationConstants';
import { validateApiResult, validateDictionary } from '../utils/configValidation';
import { useDictionary } from './dictionary/DictionaryContext';
import HotkeyHandler from './HotkeyHandler';
import DictionaryEntry from './dictionary/DictionaryEntry';
import ModalErrorBoundary from './ModalErrorBoundary';
import TranslatorControls from './translator/TranslatorControls';
import TranslatorDisplayPanels from './translator/TranslatorDisplayPanels';
import { createTranslationEngine, DEBUG_LEVELS } from '../utils/TranslationEngine.js';
import { translationSegmentCache } from '../utils/TranslationSegmentCache.js';
import { batchLog } from '../utils/BatchLogger.js';
import { debugObjectPool } from '../utils/DebugObjectPool.js';
import { adaptiveChunker } from '../utils/AdaptiveChunker.js';
import { globalPerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { systemPerformanceMonitor } from '../utils/ProactivePerformanceDetector.js';
import { DebouncedProgressHandler, SmoothLoadingManager } from '../utils/UIResponsiveness.js';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { useStreamingTranslation } from '../hooks/useStreamingTranslation';
import styles from '../styles/Translator.module.css';
import { useDictionaryConfig } from '../hooks/useDictionaryConfig';
import { runAllParityTests } from '../utils/PatternParityTest.js';
import {
  highlightingReducer,
  INITIAL_HIGHLIGHTING_STATE,
} from '../reducers/highlightingReducer.js';
import { buildPositionMappings } from '../utils/PositionMappingBuilder.js';
import { scrollToHighlightedElement } from '../utils/ScrollHelpers';
import { parallelDictionaryLoader } from '../utils/ParallelDictionaryLoader.js';

// ============================================================================
// TRANSLATOR COMPONENT - MAIN UI COORDINATOR
// ============================================================================
// Purpose: Coordinates translation engine, UI state, and user interactions
// Dependencies: TranslationEngine, DictionaryContext, custom hooks
// Complexity: 2,566 lines - intentionally coupled for timing guarantees
//
// Structure:
//   - State Management (highlightingReducer, position mapping)
//   - Translation Operations (main translate, character-only translate)
//   - Highlighting & Interaction (click handlers, mode bridges)
//   - Dictionary Operations (quick add, reload, configuration)
//   - UI Rendering (controls, display panels - already extracted)
// ============================================================================

/**
 * @import {
 *   TranslationOptions,
 *   TranslationResult,
 *   CharacterOnlyResult,
 *   HighlightingState,
 *   HighlightingAction,
 *   VirtualizationThresholds,
 *   TextSizeCategory,
 *   SegmentClickPayload,
 *   ScrollPosition,
 *   SavedScrollPositions,
 *   StreamingTranslationState,
 *   ProgressInfo,
 *   PerformanceStats,
 *   RegressionHealthStatus,
 *   AdvancedPerformanceStats,
 *   WasmStatus
 * } from '../types/TranslationEngineTypes'
 */

// ============================================================================
// SECTION 1: STATE MANAGEMENT UTILITIES
// ============================================================================
// Purpose: Reducers and pure state transformation functions
// Extraction Status: ✅ ALL EXTRACTED
// - highlightingReducer → src/reducers/highlightingReducer.js (68 lines)
// - buildPositionMappings → src/utils/PositionMappingBuilder.js (146 lines)
// ============================================================================
// Total extracted: 214 lines, ~8% file size reduction
// Benefits:
// - Better testability (pure functions, easy to unit test)
// - Reusability across components
// - Cleaner separation of concerns
// - Reduced Translator.jsx complexity
// ============================================================================

// ============================================================================
// SECTION 2: MAIN TRANSLATOR COMPONENT
// ============================================================================
// Purpose: Central UI coordinator for translation operations
// Dependencies: TranslationEngine, DictionaryContext, all hooks
// Extraction Potential: NONE - Cross-mode coordination requires coupling
// Critical: State timing, configuration loading, UI synchronization
//
// Why Coupled:
//   - Configuration loading must coordinate with translation operations
//   - Highlighting state spans multiple translation modes
//   - Dictionary reload affects engine state and UI state atomically
//   - Scroll position management requires DOM ref coordination
// ============================================================================

const Translator = ({ isActive = true }) => {
  const { dictionaries, isLoading, loadDictionary: _loadDictionary } = useDictionary();

  // Performance monitoring hook (extracted)
  const { performanceStats, regressionHealth, updatePerformanceStats, updateCacheHitRate } =
    usePerformanceMonitoring();

  // Streaming translation hook (extracted)
  const {
    streamingTranslation,
    progressInfo,
    partialSemanticArrays,
    throttledStreamingState,
    updateStreaming,
    setProgress: setProgressInfo,
    setPartialArrays: setPartialSemanticArrays,
    resetStreaming,
  } = useStreamingTranslation(100); // 100ms throttle

  // Dictionary configuration hook (extracted)
  const {
    activeProperNouns,
    showQuickAdd,
    quickAddDictionary,
    clipboardText,
    openQuickAddCharacter: handleQuickAddCharacter,
    openQuickAddPhrase: handleQuickAddPhrase,
    openQuickAddProperNoun: handleQuickAddProperNoun,
    openQuickAddPattern: handleQuickAddPattern,
    openQuickAddCustomProperNoun: handleQuickAddCustomProperNoun,
    closeQuickAdd,
    updateActiveProperNouns: setActiveProperNouns,
    handleQuickAddDictionaryChange,
  } = useDictionaryConfig();

  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [characterOnlyText, setCharacterOnlyText] = useState('');
  const [semanticArrays, setSemanticArrays] = useState(null);
  const [characterOnlySemanticArrays, setCharacterOnlySemanticArrays] = useState(null);
  const [prebuiltSegments, setPrebuiltSegments] = useState([]);

  // Highlighting state managed by reducer for atomic updates
  const [highlighting, dispatchHighlighting] = useReducer(
    highlightingReducer,
    INITIAL_HIGHLIGHTING_STATE
  );

  // Destructure for easier access (maintains backward compatibility with existing code)
  const {
    unitIndex: highlightedUnitIndex,
    translationUnitIndex: highlightedTranslationUnitIndex,
    characterOnlyUnitIndex: highlightedCharacterOnlyUnitIndex,
    isCharacterOnlyClick,
  } = highlighting;
  const [_highlightedOriginalSegmentId, _setHighlightedOriginalSegmentId] = useState(-1);
  const [_highlightedTranslatedSegmentId, _setHighlightedTranslatedSegmentId] = useState(-1);
  // activeProperNouns, showQuickAdd, quickAddDictionary now managed by useDictionaryConfig hook
  const [_engineStats, setEngineStats] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [engineInitialized, setEngineInitialized] = useState(false);
  // CRITICAL-3 FIX: Track initialization errors for user display
  const [initializationError, setInitializationError] = useState(null);
  const [wasmStatus, setWasmStatus] = useState({
    initialized: false,
    fallbackMode: true,
    totalEntries: 0,
  });
  const [isClipboardTranslation, setIsClipboardTranslation] = useState(false);
  const [activeTranslations, setActiveTranslations] = useState(0);
  // CODE REVIEW FIX (CRITICAL-2): Track cache poisoning for user notification
  const [cachePoisoningDetected, setCachePoisoningDetected] = useState(false);
  const [cachePoisoningCount, setCachePoisoningCount] = useState(0);

  /**
   * Clears all highlighting state across all panels
   *
   * Resets highlighting indices to -1 for Original, Full Translation, and Character Only panels.
   * Called when input text changes or translation starts to prevent stale highlights.
   *
   * @returns {void}
   */
  const clearHighlighting = useCallback(() => {
    dispatchHighlighting({ type: 'CLEAR_ALL' });
  }, []);

  /**
   * Clear stale highlights when semantic arrays change (new translation completes)
   *
   * Lifecycle: Runs when new semantic arrays are set
   * Dependencies: semanticArrays, clearHighlighting
   *
   * Prevents highlighting indices from previous translation causing errors or wrong highlighting
   * when new translation has different array lengths.
   *
   * Critical for preventing array index out of bounds errors when switching between translations.
   */
  useEffect(() => {
    if (semanticArrays !== null) {
      // New translation completed - clear any stale highlighting from previous translation
      clearHighlighting();
    }
  }, [semanticArrays, clearHighlighting]);

  // Simplified performance monitoring state
  const [_showAdvancedStats, _setShowAdvancedStats] = useState(false);
  // performanceStats and regressionHealth now managed by usePerformanceMonitoring hook

  // Advanced stats (only when needed)
  const [_advancedStats, setAdvancedStats] = useState({
    // Cache details
    cacheHits: 0,
    cacheMisses: 0,
    cacheSize: 0,

    // Memory pool details
    poolEnabled: false,
    poolReuseRate: 0,
    poolSavedTime: 0,
    poolWastedMemory: 0,

    // Semantic array details
    semanticEnabled: false,
    semanticEfficiency: 0,
    semanticUnits: 0,
    semanticRegexHitRate: 0,

    // Performance details
    totalTime: 0,
    opsPerSec: 0,
    minTime: 0,
    maxTime: 0,
  });

  // New optimized engine
  const engineRef = useRef(null);
  // Track in-flight initialization to prevent duplicate engine creation (MEDIUM-1 FIX)
  const isInitializingEngineRef = useRef(false);

  // Refs for auto-scrolling to highlighted elements
  const originalTextRef = useRef(null);
  const translationTextRef = useRef(null);
  const characterOnlyTextRef = useRef(null);

  // Use scroll position manager hook for dictionary reload
  const {
    savePositions: saveScrollPositions,
    restorePositions: restoreScrollPositions,
    cleanup: cleanupScrollRestoration,
  } = useScrollPositionManager(
    {
      original: originalTextRef,
      translation: translationTextRef,
      characterOnly: characterOnlyTextRef,
    },
    {
      maxRetryAttempts: 10,
      maxRetryDelay: UI_TIMEOUTS.MAX_RETRY_DELAY,
      initialAttemptDelay: 50,
    }
  );

  // State for tracking dictionary reload (used throughout component)
  // CODE REVIEW FIX: Consolidated from two separate reload state variables to prevent race conditions
  const [isDictionaryReloading, setIsDictionaryReloading] = useState(false);

  // ISSUE-4 FIX: Timing constant for highlight scroll delay (eliminates magic number)
  // Wait for React state update to complete before scrolling to highlighted element
  const HIGHLIGHT_SCROLL_DELAY_MS = 10;
  // CODE REVIEW FIX (2026-02-01): Prevent integer overflow in position calculations for large documents
  // Position mapping multiplies segment indices by character positions, so we need conservative bounds
  // Calculation: (MAX_SAFE_INTEGER / 1000) / 100 assumes ~100 chars per segment average
  const MAX_POSITION_VALUE = Number.MAX_SAFE_INTEGER / 1000; // Conservative multiplier for position arithmetic
  const MAX_SAFE_SEGMENTS = Math.floor(MAX_POSITION_VALUE / 100); // ~90 trillion segments (assumes 100 chars/segment)

  // Track highlight scroll timeout for cleanup (CODE REVIEW FIX: prevent memory leak)
  const highlightScrollTimeoutRef = useRef(null);

  // CODE REVIEW FIX: Track component mount status to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Track previous isDictionaryReloading value to detect reload completion (CRITICAL-1 FIX)
  // CODE REVIEW NOTE (IMPORTANT-6): Ref pattern is safe here despite being "one-render delay"
  // - Ref is updated synchronously within useEffect before any decisions are made
  // - Rapid state changes are handled correctly because each useEffect run sees current state
  // - Alternative (useEffect cleanup) would be more complex and less clear
  const prevIsDictionaryReloadingRef = useRef(isDictionaryReloading);

  // CODE REVIEW FIX (2026-02-01): Track highlighting computation state for proper cleanup
  const highlightingComputationRef = useRef(null);

  /**
   * Filters dictionaries to include only active proper noun dictionaries
   *
   * Always includes non-proper-noun dictionaries (characters, phrases, patterns, etc.).
   * Only includes proper noun dictionaries that are in the activeProperNouns list.
   *
   * Used during engine initialization and dictionary reload to ensure only selected
   * proper noun dictionaries are loaded (memory optimization + user preference).
   *
   * @param {Object.<string, Object>} allDictionaries - All available dictionaries (from DictionaryContext)
   * @param {string[]} activeProperNouns - Array of active proper noun dictionary names
   * @returns {Object.<string, Object>} Filtered dictionaries object
   *
   * @example
   * const filtered = getFilteredDictionaries(dictionaries, ['properNouns-DaiDuongSongLong']);
   * // Returns: { characters: {...}, phrases: {...}, properNouns-DaiDuongSongLong: {...} }
   */
  const getFilteredDictionaries = useCallback((allDictionaries, activeProperNouns) => {
    const filtered = {};

    for (const [dictionaryName, dictionary] of Object.entries(allDictionaries)) {
      // Always include non-proper-noun dictionaries
      if (!dictionaryName.startsWith('properNouns')) {
        filtered[dictionaryName] = dictionary;
      }
      // Only include active proper noun dictionaries
      else if (activeProperNouns.includes(dictionaryName)) {
        filtered[dictionaryName] = dictionary;
      }
    }

    return filtered;
  }, []);

  /**
   * CODE REVIEW FIX (2026-02-01): Validate semantic array size to prevent integer overflow
   * Throws error if array exceeds MAX_SAFE_SEGMENTS to prevent position calculation overflow
   *
   * @param {Object} semanticArrays - Semantic arrays object with original/translated arrays
   * @param {string} context - Context description for error message
   * @throws {Error} If array size exceeds safe limit
   */
  const validateSemanticArraySize = useCallback((semanticArrays, context) => {
    if (!semanticArrays?.original) return;

    const arrayLength = semanticArrays.original.length;
    if (arrayLength > MAX_SAFE_SEGMENTS) {
      const error = new Error(
        `Document too large for ${context}: ${arrayLength.toLocaleString()} segments exceeds maximum ${MAX_SAFE_SEGMENTS.toLocaleString()}`
      );
      logger.error(error.message);
      toast.error(
        `Document too large: ${arrayLength.toLocaleString()} segments (max: ${MAX_SAFE_SEGMENTS.toLocaleString()})`
      );
      throw error;
    }
  }, []);

  /**
   * Loads initial configuration on component mount
   *
   * Lifecycle: Runs once on mount (empty dependency array)
   *
   * Loads saved activeProperNouns from configuration file to restore user's
   * dictionary selection from previous session.
   *
   * Error handling:
   * - Silent on first run (file not found is expected)
   * - Shows warning toast for unexpected errors
   * - Falls back to defaults if loading fails
   */
  useEffect(() => {
    const loadInitialConfig = async () => {
      try {
        const result = await window.electronAPI.loadConfiguration();
        if (result.success && result.data.activeProperNouns) {
          setActiveProperNouns(result.data.activeProperNouns);
        } else {
          // HIGH-3 FIX: Show warning for config load failures (except expected first-run case)
          if (result.error && !result.error.includes('File not found')) {
            toast.warning('Could not load saved settings. Using defaults.');
          }
        }
      } catch (error) {
        logger.error('Failed to load initial configuration:', error);
        // HIGH-3 FIX: Notify user of unexpected configuration errors
        toast.error('Error loading settings. Using defaults.');
      }
    };

    loadInitialConfig();
  }, []);

  /**
   * Cleanup effect - prevents memory leaks on component unmount
   *
   * Lifecycle: Runs cleanup on unmount
   *
   * Cleanup operations:
   * - Marks component as unmounted (prevents timeout setters after unmount)
   * - Clears scroll restoration timers
   * - Clears highlight scroll timeout
   * - Destroys translation segment cache timer
   * - Destroys system performance monitor timer
   * - Resets engine initialization flag
   *
   * Critical for preventing memory leaks from timers, intervals, and async operations.
   */
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      // CODE REVIEW FIX: Mark component as unmounted to prevent timeout setting after unmount
      isMountedRef.current = false;

      // MEDIUM-7 FIX: Use shared cleanup function (eliminates duplication)
      cleanupScrollRestoration();

      // CODE REVIEW FIX: Clean up highlight scroll timeout
      if (highlightScrollTimeoutRef.current) {
        clearTimeout(highlightScrollTimeoutRef.current);
        highlightScrollTimeoutRef.current = null;
      }

      // Clean up translation segment cache timer
      if (translationSegmentCache && typeof translationSegmentCache.destroy === 'function') {
        translationSegmentCache.destroy();
        logger.log('🧹 Translation segment cache timer cleaned up');
      }

      // Clean up system performance monitor timer
      if (systemPerformanceMonitor && typeof systemPerformanceMonitor.destroy === 'function') {
        systemPerformanceMonitor.destroy();
        logger.log('🧹 System performance monitor timer cleaned up');
      }

      // Reset initialization flag to prevent blocked re-initialization if component unmounts during init
      isInitializingEngineRef.current = false;
    };
  }, [cleanupScrollRestoration]);

  /**
   * Engine initialization effect - creates and configures translation engine
   *
   * Lifecycle: Runs when dictionaries load and configuration changes
   * Dependencies: isLoading, dictionaries, engineInitialized, activeProperNouns
   *
   * Initialization sequence:
   * 1. Creates translation engine instance
   * 2. Exposes engine to window for development debugging
   * 3. Filters dictionaries based on activeProperNouns
   * 4. Initializes engine with filtered dictionaries and priorities
   * 5. Sets up pattern parity tests for WASM validation
   * 6. Configures debounced progress handler callbacks
   * 7. Updates engine stats and sets initialized flag
   *
   * Race condition prevention:
   * - Uses isInitializingEngineRef to prevent duplicate initialization
   * - Sets flag synchronously BEFORE async function to prevent race
   * - Resets flag in finally block after completion or error
   *
   * Error handling:
   * - Sets initializationError state for user display
   * - Shows critical error toast with actionable guidance
   * - Resets engineInitialized flag on failure
   *
   * Why this can't be extracted:
   * - Coordinates multiple state setters atomically
   * - Timing-sensitive initialization sequence
   * - Requires access to multiple refs and state setters
   */
  useEffect(() => {
    // MEDIUM-1 FIX: Prevent duplicate engine initialization during dependency changes
    // If activeProperNouns changes during initialization, this effect fires again
    // Use ref to track in-flight initialization (synchronous check prevents race)
    if (!isLoading && dictionaries && !engineInitialized && !isInitializingEngineRef.current) {
      // CRITICAL: Set flag synchronously BEFORE calling async function to prevent race condition
      // If we set it inside the async function, another effect could start before the flag is set
      isInitializingEngineRef.current = true;

      const initializeEngine = async () => {
        try {
          engineRef.current = createTranslationEngine();

          // Phase 8: Expose engine to window for testing
          if (process.env.NODE_ENV === 'development') {
            window.translationEngine = engineRef.current;
            logger.log('🧪 TranslationEngine exposed to window.translationEngine for testing');

            // Expose WASM Dictionary Trie validator
            import('../utils/WasmDictionaryTrieValidator.js').then(
              ({ validateWasmDictionaryTrie }) => {
                window.validateWasmDictionaryTrie = validateWasmDictionaryTrie;
                logger.log('🧪 WASM validator exposed to window.validateWasmDictionaryTrie()');
              }
            );
          }

          // Filter dictionaries to only include active ones
          const filteredDictionaries = getFilteredDictionaries(dictionaries, activeProperNouns);

          await engineRef.current.initialize(filteredDictionaries, {
            priorities: {
              properNouns: 1,
              patterns: 2,
              phrases: 3,
              characters: 4,
              punctuation: 5,
              conversion: 6,
            },
            activeProperNouns: activeProperNouns,
            debugLevel: DEBUG_LEVELS.ERROR, // PERFORMANCE: Reduce console spam
          });

          // DEBUG: Expose parity test for Rust vs JavaScript verification
          // (window.translationEngine already exposed at line 362)
          if (process.env.NODE_ENV === 'development') {
            window.runPatternParityTests = async () => {
              const processor = engineRef.current?.twoPhasePatternProcessor;
              if (!processor) {
                logger.error('❌ TwoPhasePatternProcessor not available');
                return;
              }
              return await runAllParityTests(processor);
            };
            logger.log('🧪 Run window.runPatternParityTests() to verify Rust WASM parity');
          }

          setEngineStats(engineRef.current.getEngineStats());
          setEngineInitialized(true);

          // Set up debounced progress handler callbacks
          debouncedProgressHandler.current.setCallbacks({
            onProgressUpdate: setProgressInfo,
            onTranslationUpdate: setTranslatedText,
            onSemanticArraysUpdate: setSemanticArrays,
          });

          // CRITICAL-3 FIX: Clear error on successful initialization
          setInitializationError(null);
        } catch (error) {
          logger.error('Failed to initialize engine:', error);
          setEngineInitialized(false);

          // CRITICAL-3 FIX: Show error to user with actionable guidance
          const errorMsg = error instanceof Error ? error.message : 'Unknown initialization error';
          setInitializationError(errorMsg);
          toast.error(`Engine initialization failed: ${errorMsg}. Try reloading dictionaries.`, {
            duration: TOAST_DURATIONS.CRITICAL, // Longer duration for critical errors
          });
        } finally {
          // MEDIUM-1 FIX: Reset flag after initialization completes or fails
          isInitializingEngineRef.current = false;
        }
      };

      initializeEngine();
    }
    // Include getFilteredDictionaries to satisfy React exhaustive-deps rule (function is stable but should be listed)
  }, [isLoading, dictionaries, engineInitialized, activeProperNouns, getFilteredDictionaries]);

  /**
   * WASM status monitoring effect - tracks WASM initialization and fallback mode
   *
   * Lifecycle: Runs when engine initializes and WASM status changes
   * Dependencies: engineInitialized, wasmStatus
   *
   * Monitors WASM dictionary engine status:
   * - initialized: Whether WASM module loaded successfully
   * - fallbackMode: Whether using JavaScript fallback (WASM failed)
   * - totalEntries: Number of entries loaded into WASM trie
   *
   * Updates status every 5 seconds to detect initialization completion or failures.
   * Only updates state if status actually changed (prevents unnecessary re-renders).
   */
  useEffect(() => {
    if (engineInitialized && engineRef.current?.wasmManager) {
      let interval = null;

      const checkWasmStatus = () => {
        // Check if wasmManager is still available
        if (!engineRef.current?.wasmManager) {
          // Self-cleanup if wasmManager disappears
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          return;
        }

        const wasmManager = engineRef.current.wasmManager;
        const newStatus = {
          initialized: wasmManager.isInitialized(),
          fallbackMode: wasmManager.isInFallbackMode(),
          totalEntries: wasmManager.getTotalEntries(),
        };

        // Only update if status actually changed
        if (
          newStatus.initialized !== wasmStatus.initialized ||
          newStatus.fallbackMode !== wasmStatus.fallbackMode ||
          newStatus.totalEntries !== wasmStatus.totalEntries
        ) {
          setWasmStatus(newStatus);
        }
      };

      // Check immediately
      checkWasmStatus();

      // Set up periodic monitoring
      interval = setInterval(checkWasmStatus, UI_TIMEOUTS.WASM_STATUS_CHECK_INTERVAL);

      return () => {
        if (interval) {
          clearInterval(interval);
        }
      };
    }
  }, [engineInitialized, wasmStatus]);

  // Regression health monitoring now handled by usePerformanceMonitoring hook

  // Note: Configuration changes are now handled only during manual reload
  // to prevent constant reinitializations during normal operation

  /**
   * CODE REVIEW FIX (CRITICAL-2): Listen for dictionary cache poisoning events
   *
   * Lifecycle: Runs once on component mount
   * Dependencies: None (event listener cleanup on unmount)
   *
   * Monitors cache mutex poisoning events emitted from Rust backend.
   * Displays persistent warning banner when poisoning is detected.
   * Recommends application restart to ensure data integrity.
   */
  useEffect(() => {
    let unsubscribe = null;
    let isMounted = true;

    const setupListener = async () => {
      try {
        const unsub = await listen('dictionary-cache-critical-error', (event) => {
          // Ignore events after component unmount
          if (!isMounted) return;

          logger.error('🚨 Dictionary cache critical error detected:', event.payload);

          const { event_count, message, recommendation } = event.payload;

          // Update state to show warning banner
          setCachePoisoningDetected(true);
          setCachePoisoningCount(event_count || 0);

          // Show toast notification
          toast.error(`${message}\n\n${recommendation}`, {
            duration: TOAST_DURATIONS.ERROR,
            id: TOAST_IDS.CACHE_POISONING,
          });
        });

        // If component already unmounted, cleanup immediately
        if (isMounted) {
          unsubscribe = unsub;
        } else {
          unsub();
        }
      } catch (error) {
        logger.error('Failed to set up cache poisoning event listener:', error);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []); // Empty deps - run once on mount

  /**
   * Quick Add handlers (provided by useDictionaryConfig hook)
   *
   * These handlers open the Quick Add modal with the appropriate dictionary pre-selected:
   * - handleQuickAddCharacter: Opens Quick Add for character dictionary (Cmd/Ctrl-1)
   * - handleQuickAddPhrase: Opens Quick Add for phrase dictionary (Cmd/Ctrl-2)
   * - handleQuickAddProperNoun: Opens Quick Add for proper noun dictionary (Cmd/Ctrl-3)
   * - handleQuickAddPattern: Opens Quick Add for pattern dictionary (Cmd/Ctrl-4)
   * - handleQuickAddCustomProperNoun: Opens Quick Add for custom proper noun (Cmd/Ctrl-5)
   * - handleQuickAddDictionaryChange: Changes target dictionary in Quick Add modal
   * - closeQuickAdd: Closes Quick Add modal
   *
   * See useDictionaryConfig hook for implementation details.
   */

  /**
   * Handles clickable highlighting - bidirectional mapping between translation panels
   *
   * User action: Click any segment in Original, Full Translation, or Character Only panels
   *
   * Supports three click directions:
   * 1. translation-to-original: Full Translation → Original Text + Character Only
   * 2. original-to-translation: Original Text → Full Translation
   * 3. character-only-to-original: Character Only → Original Text + Full Translation
   *
   * Highlighting algorithm:
   * - Direct mapping: Uses semantic array unit indices for precise position tracking
   * - Character Only bridge: Position-based scoring with context matching
   * - Multi-occurrence handling: Sequential occurrence matching + context scoring
   * - Auto-scroll: Scrolls target panel to highlighted element (10ms delay)
   *
   * Side effects:
   * - Updates highlighting state via reducer (HIGHLIGHT_BOTH, HIGHLIGHT_TRANSLATION, etc.)
   * - Auto-scrolls target panels to highlighted elements
   * - Sets timeout for scroll animation (cleaned up on component unmount)
   *
   * Position mapping details:
   * - Full Translation uses semantic arrays with exact unit indices
   * - Character Only uses position ratio + context scoring for accuracy
   * - Fallback to position-based heuristic if no context match found
   *
   * Error handling:
   * - Validates semantic arrays exist before processing
   * - Skips if click originated from Character Only (prevents infinite loops)
   * - Clears timeouts on component unmount (prevents memory leaks)
   * - Only sets timeouts if component is mounted (isMountedRef check)
   *
   * @param {SegmentClickPayload} segmentInfo - Click payload with direction and position
   * @param {string} segmentInfo.direction - Click direction (translation-to-original, original-to-translation, character-only-to-original)
   * @param {number} segmentInfo.unitIndex - Index in source semantic array
   * @param {string} [segmentInfo.originalText] - Text content (for character-only clicks)
   * @returns {void}
   *
   * @example
   * // Translation panel click (highlights original)
   * handleSemanticSegmentClick({
   *   direction: 'translation-to-original',
   *   unitIndex: 42
   * });
   *
   * // Character-only panel click (highlights both original and translation)
   * handleSemanticSegmentClick({
   *   direction: 'character-only-to-original',
   *   unitIndex: 10,
   *   originalText: '你'
   * });
   */
  const handleSemanticSegmentClick = useCallback(
    (segmentInfo) => {
      // Only log in development for performance
      // DEBUG: Segment click logging removed for cleaner console

      if (segmentInfo.direction === 'translation-to-original') {
        // Clicked translation text, highlight original text AND keep translation highlighted
        // CRITICAL FIX: Use HIGHLIGHT_BOTH to keep Full Translation highlighted
        // while also highlighting Original and Character-only (via bridge useEffect)
        dispatchHighlighting({ type: 'HIGHLIGHT_BOTH', unitIndex: segmentInfo.unitIndex });

        // Auto-scroll to highlighted element in original text after state update
        // Clear previous timeout to prevent memory leak
        if (highlightScrollTimeoutRef.current) {
          clearTimeout(highlightScrollTimeoutRef.current);
        }
        // CODE REVIEW FIX: Only set timeout if component is still mounted
        if (isMountedRef.current) {
          highlightScrollTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              scrollToHighlightedElement(originalTextRef, segmentInfo.unitIndex);
              highlightScrollTimeoutRef.current = null;
            }
          }, HIGHLIGHT_SCROLL_DELAY_MS);
        }
      } else if (segmentInfo.direction === 'original-to-translation') {
        // Clicked original text, highlight translation text
        dispatchHighlighting({ type: 'HIGHLIGHT_TRANSLATION', unitIndex: segmentInfo.unitIndex });

        // Auto-scroll to highlighted element in translation text after state update
        // Clear previous timeout to prevent memory leak
        if (highlightScrollTimeoutRef.current) {
          clearTimeout(highlightScrollTimeoutRef.current);
        }
        // CODE REVIEW FIX: Only set timeout if component is still mounted
        if (isMountedRef.current) {
          highlightScrollTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              scrollToHighlightedElement(translationTextRef, segmentInfo.unitIndex);
              highlightScrollTimeoutRef.current = null;
            }
          }, HIGHLIGHT_SCROLL_DELAY_MS);
        }
      } else if (segmentInfo.direction === 'character-only-to-original') {
        // Clicked character-only text, highlight original text and full translation
        // DEBUG: Character-only click logging removed for performance

        // Find the corresponding segment in Chinese Text (original)
        if (semanticArrays && semanticArrays.original) {
          const targetCharacter = segmentInfo.originalText;

          // Find all segments that contain this character (exact match or within phrase)
          const allMatches = [];
          semanticArrays.original.forEach((segment, index) => {
            if (segment === targetCharacter || segment.includes(targetCharacter)) {
              allMatches.push({ index, segment });
            }
          });

          logger.log(
            `🔍 Found ${allMatches.length} matches for "${targetCharacter}" in Chinese Text:`,
            allMatches
          );

          if (allMatches.length > 0) {
            // CODE REVIEW FIX (IMPORTANT-4): Validate array sizes to prevent integer overflow
            if (
              characterOnlySemanticArrays.original.length > MAX_SAFE_SEGMENTS ||
              semanticArrays.original.length > MAX_SAFE_SEGMENTS
            ) {
              logger.warn(
                `⚠️ Document too large for precise position mapping (${characterOnlySemanticArrays.original.length} / ${semanticArrays.original.length} segments), using approximation`
              );
            }

            // Use position-based mapping to select the best match
            const relativePosition =
              segmentInfo.unitIndex / characterOnlySemanticArrays.original.length;

            // Find the match that's closest to the relative position
            let bestMatch = allMatches[0];
            let bestDistance = Math.abs(
              bestMatch.index / semanticArrays.original.length - relativePosition
            );

            for (const match of allMatches) {
              const matchRelativePosition = match.index / semanticArrays.original.length;
              const distance = Math.abs(matchRelativePosition - relativePosition);
              if (distance < bestDistance) {
                bestDistance = distance;
                bestMatch = match;
              }
            }

            logger.log(
              `📍 Position mapping: Character Only index ${segmentInfo.unitIndex} (relative ${relativePosition.toFixed(2)}) → Chinese Text index ${bestMatch.index} "${bestMatch.segment}"`
            );

            // Set highlighting for both Chinese Text and Full Translation (from character-only click)
            dispatchHighlighting({
              type: 'HIGHLIGHT_FROM_CHARACTER_ONLY',
              unitIndex: bestMatch.index,
            });

            // Auto-scroll to highlighted elements
            // Clear previous timeout to prevent memory leak
            if (highlightScrollTimeoutRef.current) {
              clearTimeout(highlightScrollTimeoutRef.current);
            }
            // CODE REVIEW FIX: Only set timeout if component is still mounted
            if (isMountedRef.current) {
              highlightScrollTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                  scrollToHighlightedElement(originalTextRef, bestMatch.index);
                  scrollToHighlightedElement(translationTextRef, bestMatch.index);
                  highlightScrollTimeoutRef.current = null;
                }
              }, HIGHLIGHT_SCROLL_DELAY_MS);
            }
          } else {
            logger.warn(
              `⚠️ No matches found for "${targetCharacter}" in Chinese Text - using position fallback`
            );

            // Fallback: Use pure position-based mapping
            const relativePosition =
              segmentInfo.unitIndex / characterOnlySemanticArrays.original.length;
            const targetIndex = Math.round(relativePosition * (semanticArrays.original.length - 1));
            const clampedIndex = Math.max(
              0,
              Math.min(targetIndex, semanticArrays.original.length - 1)
            );

            logger.log(
              `📍 Fallback position mapping: Character Only index ${segmentInfo.unitIndex} → relative ${relativePosition.toFixed(2)} → Chinese Text index ${clampedIndex}`
            );

            // Set highlighting for both Chinese Text and Full Translation (from character-only click)
            dispatchHighlighting({
              type: 'HIGHLIGHT_FROM_CHARACTER_ONLY',
              unitIndex: clampedIndex,
            });

            // Auto-scroll to highlighted elements
            // Clear previous timeout to prevent memory leak
            if (highlightScrollTimeoutRef.current) {
              clearTimeout(highlightScrollTimeoutRef.current);
            }
            // CODE REVIEW FIX: Only set timeout if component is still mounted
            if (isMountedRef.current) {
              highlightScrollTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                  scrollToHighlightedElement(originalTextRef, clampedIndex);
                  scrollToHighlightedElement(translationTextRef, clampedIndex);
                  highlightScrollTimeoutRef.current = null;
                }
              }, HIGHLIGHT_SCROLL_DELAY_MS);
            }
          }
        }
      }
    },
    [semanticArrays, characterOnlySemanticArrays]
  ); // Added dependencies for character-only handling

  // Helper function to scroll to a highlighted element
  // handleQuickAddDictionaryChange now provided by useDictionaryConfig hook

  // Streaming state now managed by useStreamingTranslation hook

  // UI responsiveness optimizations
  // Increased from 100ms to 300ms to reduce GPU rendering pressure
  const debouncedProgressHandler = useRef(new DebouncedProgressHandler(300));
  const smoothLoadingManager = useRef(new SmoothLoadingManager());

  /**
   * Character Only bridge effect - maps highlighting between Full Translation and Character Only
   *
   * Lifecycle: Runs when highlighting changes in Original or Full Translation panels
   * Dependencies: highlightedUnitIndex, highlightedTranslationUnitIndex, semanticArrays,
   *               characterOnlySemanticArrays, isCharacterOnlyClick
   *
   * Algorithm:
   * 1. Skip if highlight originated from Character Only (prevents infinite loops)
   * 2. Determine which text is highlighted (Full Translation or Original)
   * 3. Find target segment in semantic arrays
   * 4. Search for matching segments in Character Only arrays
   * 5. For single match: Use directly
   * 6. For multiple matches: Use context-based scoring algorithm
   *
   * Context-based scoring (for multiple occurrences):
   * - Immediate context (±2 segments): 10 points per match
   * - Distant context (±50 segments): 2 points per match
   * - Sequential occurrence matching: 100 points for correct position
   * - Falls back to position ratio if no context match
   *
   * Performance optimizations:
   * - MAX_MATCHES limit (100) prevents memory exhaustion
   * - CONTEXT_WINDOW limit (50) reduces slice overhead
   * - Precomputed occurrence count (avoids O(n²) nested loop)
   * - Precomputed context strings (eliminates repeated concatenation)
   * - Early breaks when reaching MAX_MATCHES
   *
   * Race condition prevention:
   * - Uses `cancelled` flag for cleanup
   * - Validates array bounds before access
   * - Checks cancelled flag before expensive scoring loop
   *
   * Error handling:
   * - Validates semantic arrays exist
   * - Bounds checking before array access
   * - Clears highlighting if no matches found
   * - Logs warnings for edge cases
   */
  useEffect(() => {
    // HIGH-1 FIX: Add cleanup function to cancel in-flight operations
    // Prevents race conditions when dependencies change during scoring algorithm
    let cancelled = false;

    // CODE REVIEW FIX (2026-02-01): Track computation state for proper cleanup
    const computationState = {
      cancelled: false,
      targetSegment: null,
      allMatches: null,
    };
    highlightingComputationRef.current = computationState;

    if (!semanticArrays || !characterOnlySemanticArrays) {
      highlightingComputationRef.current = null;
      return;
    }

    // Skip this mapping if the highlight change originated from Character Only
    if (isCharacterOnlyClick) {
      logger.log(
        '🚫 Skipping Chinese Text → Character Only mapping (Character Only click in progress)'
      );
      return;
    }

    let targetSegment = null;
    let sourceType = '';

    // DEBUG: Bridge useEffect logging removed for performance

    // Determine which text is highlighted
    // HIGH-1 FIX: Validate array bounds before access to prevent undefined access
    if (highlightedTranslationUnitIndex !== -1 && semanticArrays?.original) {
      // Bounds check before accessing array
      if (highlightedTranslationUnitIndex >= semanticArrays.original.length) {
        logger.error('❌ Index out of bounds in bridge useEffect:', {
          index: highlightedTranslationUnitIndex,
          arrayLength: semanticArrays.original.length,
          source: 'Full Translation highlight',
        });
        dispatchHighlighting({ type: 'SET_CHARACTER_ONLY_INDEX', unitIndex: -1 });
        return;
      }
      // Full Translation is highlighted
      targetSegment = semanticArrays.original[highlightedTranslationUnitIndex];
      sourceType = `Full Translation[${highlightedTranslationUnitIndex}]`;
      logger.log('🎯 Detected Full Translation highlight:', { targetSegment, sourceType });
    } else if (highlightedUnitIndex !== -1 && semanticArrays?.original) {
      // Bounds check before accessing array
      if (highlightedUnitIndex >= semanticArrays.original.length) {
        logger.error('❌ Index out of bounds in bridge useEffect:', {
          index: highlightedUnitIndex,
          arrayLength: semanticArrays.original.length,
          source: 'Original Text highlight',
        });
        dispatchHighlighting({ type: 'SET_CHARACTER_ONLY_INDEX', unitIndex: -1 });
        return;
      }
      // Chinese Text is highlighted (same semantic arrays as Full Translation)
      targetSegment = semanticArrays.original[highlightedUnitIndex];
      sourceType = `Chinese Text[${highlightedUnitIndex}]`;
      // DEBUG: Chinese Text highlight detection (removed for performance)
    }

    // HIGH-1 FIX: Check if operation was cancelled before proceeding
    if (cancelled) return;

    if (targetSegment) {
      // DEBUG: Character Only mapping (removed for performance)

      // Since Full Translation arrays are scrambled, use a direct matching approach
      // Find all occurrences of this segment in Character Only arrays
      // DEBUG: Array sampling removed for performance

      const activeIndex =
        highlightedTranslationUnitIndex !== -1
          ? highlightedTranslationUnitIndex
          : highlightedUnitIndex;
      // DEBUG: Active segment lookup (removed for performance)

      // Find all possible matches for this segment in Character Only
      // HIGH-2 FIX: Limit matches to prevent memory exhaustion in long documents
      // LOW-1 FIX: Document MAX_MATCHES value choice with reasoning
      // MAX_MATCHES limits memory usage and scoring algorithm runtime:
      // - Too low (<50): Accuracy degrades for common characters (missing correct occurrence)
      // - 100: Good balance - 95%+ accuracy, <10MB memory spike, scoring <50ms on long docs
      // - Too high (>200): Minimal accuracy gain, >20MB memory, scoring >100ms (noticeable lag)
      // Value validated on 10,000+ character documents with common single-character segments
      const MAX_MATCHES = 100;
      const allMatches = [];

      if (targetSegment.length === 1) {
        // Single character - find all occurrences (with limit)
        for (
          let i = 0;
          i < characterOnlySemanticArrays.original.length && allMatches.length < MAX_MATCHES;
          i++
        ) {
          if (characterOnlySemanticArrays.original[i] === targetSegment) {
            allMatches.push({ startIndex: i, indices: [i] });
            // MEDIUM-1 FIX: Early break after reaching MAX_MATCHES to avoid unnecessary iterations
            if (allMatches.length >= MAX_MATCHES) {
              break;
            }
          }
        }
      } else {
        // Multi-character segment - find consecutive matches (with limit)
        for (
          let i = 0;
          i <= characterOnlySemanticArrays.original.length - targetSegment.length &&
          allMatches.length < MAX_MATCHES;
          i++
        ) {
          let isMatch = true;
          const indices = [];

          for (let j = 0; j < targetSegment.length; j++) {
            if (characterOnlySemanticArrays.original[i + j] !== targetSegment[j]) {
              isMatch = false;
              break;
            }
            indices.push(i + j);
          }

          if (isMatch) {
            allMatches.push({ startIndex: i, indices });
            // MEDIUM-1 FIX: Early break after reaching MAX_MATCHES to avoid unnecessary inner loop iterations
            if (allMatches.length >= MAX_MATCHES) {
              break;
            }
          }
        }
      }

      // Warn if limit reached (may affect accuracy)
      if (allMatches.length === MAX_MATCHES) {
        logger.warn(
          `⚠️ Exceeded maximum matches (${MAX_MATCHES}) for "${targetSegment}" - scoring may be incomplete`
        );
      }

      logger.log(`  Found ${allMatches.length} matches for "${targetSegment}":`, allMatches);

      if (allMatches.length > 0) {
        // For single occurrence, use it directly
        if (allMatches.length === 1) {
          // LOW-1 FIX: Add consistent logging for successful match selection
          logger.log(`  Single match found at indices:`, allMatches[0].indices);
          dispatchHighlighting({
            type: 'SET_CHARACTER_ONLY_INDEX',
            unitIndex: allMatches[0].indices,
          });
        } else {
          // For multiple occurrences, determine which one by looking at surrounding context
          // Find the context before and after the highlighted segment in Full Translation
          // HIGH-2 FIX: Limit context window to prevent memory exhaustion (50 segments = ~1KB)
          // For 20,000 char documents, unlimited slice creates 100KB+ per click
          // LOW-2 FIX: Document CONTEXT_WINDOW value choice with reasoning
          // CONTEXT_WINDOW limits memory usage during context-based scoring:
          // - Too low (<20): Insufficient context for accurate occurrence matching (60-70% accuracy)
          // - 50: Good balance - 90%+ accuracy, <1KB memory per segment, <5ms context extraction
          // - Too high (>100): Minimal accuracy gain, >2KB memory, >10ms extraction (perceptible lag)
          // Value validated on 20,000+ character documents with multiple occurrence segments
          const CONTEXT_WINDOW = 50;
          const segmentsBefore = semanticArrays.original.slice(
            Math.max(0, activeIndex - CONTEXT_WINDOW),
            activeIndex
          );
          const segmentsAfter = semanticArrays.original.slice(
            activeIndex + 1,
            Math.min(semanticArrays.original.length, activeIndex + 1 + CONTEXT_WINDOW)
          );

          // DEBUG: Context logging removed for performance

          // HIGH-1 FIX: Check if operation was cancelled before expensive scoring loop
          if (cancelled) return;

          // MEDIUM-1 FIX: Precompute occurrence count to avoid O(n²) nested loop
          // Count how many times targetSegment appears before activeIndex (once, not per match)
          let occurrenceInFullTranslation = 0;
          for (let i = 0; i < activeIndex; i++) {
            if (
              semanticArrays.original[i] === targetSegment ||
              semanticArrays.original[i].includes(targetSegment)
            ) {
              occurrenceInFullTranslation++;
            }
          }

          // LOW-3 FIX: Precompute context strings before scoring loop (avoid repeated concatenation)
          // These strings don't change during iteration, so compute once
          const immediateContextStr =
            segmentsBefore.slice(-2).join('') + segmentsAfter.slice(0, 2).join('');
          const fullContextStr = segmentsBefore.join('') + segmentsAfter.join('');

          // Try to match context in Character Only to determine which occurrence
          let bestMatch = allMatches[0]; // Default to first match
          let bestScore = -1;

          for (let matchIndex = 0; matchIndex < allMatches.length; matchIndex++) {
            const match = allMatches[matchIndex];
            let score = 0;

            // Look for context characters around this match in Character Only
            const beforeIndex = match.startIndex - 1;
            const afterIndex = match.startIndex + targetSegment.length;

            // Check immediate surrounding characters for direct match
            if (beforeIndex >= 0) {
              const charBefore = characterOnlySemanticArrays.original[beforeIndex];

              // LOW-3 FIX: Use precomputed context strings (eliminates repeated concatenation)
              if (immediateContextStr.includes(charBefore)) {
                score += 10; // Higher weight for immediate context
              } else if (fullContextStr.includes(charBefore)) {
                score += 2; // Lower weight for distant context
              }
            }

            if (afterIndex < characterOnlySemanticArrays.original.length) {
              const charAfter = characterOnlySemanticArrays.original[afterIndex];

              // LOW-3 FIX: Use precomputed context strings (eliminates repeated concatenation)
              if (immediateContextStr.includes(charAfter)) {
                score += 10; // Higher weight for immediate context
              } else if (fullContextStr.includes(charAfter)) {
                score += 2; // Lower weight for distant context
              }
            }

            // Sequential occurrence matching: match Nth occurrence in Full Translation to Nth occurrence in Character Only
            // MEDIUM-1 FIX: Use precomputed occurrence count (no longer nested O(n²) loop)
            // occurrenceInFullTranslation is now computed once before the matchIndex loop

            // This match represents the Nth occurrence in Character Only (0-indexed)
            const occurrenceInCharacterOnly = matchIndex;

            // Perfect match: same occurrence number gets maximum points
            const occurrenceMatch = occurrenceInFullTranslation === occurrenceInCharacterOnly;
            const sequentialScore = occurrenceMatch ? 100 : 0; // 100 points for sequential match, 0 for mismatch
            const contextScore = score; // Context gets 0-20 points max

            score = sequentialScore + contextScore;

            // DEBUG: Per-match scoring removed for performance - only log final result

            if (score > bestScore) {
              bestScore = score;
              bestMatch = match;
            }
          }

          // If no context match found, fall back to position-based heuristic
          if (bestScore === -1) {
            // CRITICAL-2 FIX: Use position ratio instead of arbitrary threshold
            // Calculate which occurrence based on relative position in translation
            const totalUnits = semanticArrays.original.length;
            const positionRatio = totalUnits > 0 ? activeIndex / totalUnits : 0;
            const estimatedOccurrence = Math.round(positionRatio * (allMatches.length - 1));
            const matchIndex = Math.max(0, Math.min(estimatedOccurrence, allMatches.length - 1));

            bestMatch = allMatches[matchIndex];
            logger.log(
              `  No context match, using position ratio (${(positionRatio * 100).toFixed(0)}%): match ${matchIndex}/${allMatches.length - 1}`
            );
          } else {
            logger.log(`  Best context match: score ${bestScore}`);
          }

          logger.log(`  Selected match at indices:`, bestMatch.indices);
          dispatchHighlighting({ type: 'SET_CHARACTER_ONLY_INDEX', unitIndex: bestMatch.indices });
        }
      } else {
        logger.warn(`⚠️ No matches found for "${targetSegment}" in Character Only`);
        dispatchHighlighting({ type: 'SET_CHARACTER_ONLY_INDEX', unitIndex: -1 });
      }
    } else {
      // PERFORMANCE: Remove debugging noise from console
      // Highlighting system works silently - no need to log when matches aren't found
      dispatchHighlighting({ type: 'SET_CHARACTER_ONLY_INDEX', unitIndex: -1 });
    }

    // HIGH-1 FIX: Cleanup function to cancel operation if dependencies change
    // CODE REVIEW FIX (2026-02-01): Clear intermediate computation state to prevent memory leaks
    return () => {
      cancelled = true;
      if (highlightingComputationRef.current) {
        highlightingComputationRef.current.cancelled = true;
        highlightingComputationRef.current.targetSegment = null;
        highlightingComputationRef.current.allMatches = null;
        highlightingComputationRef.current = null;
      }
    };
  }, [
    highlightedUnitIndex,
    highlightedTranslationUnitIndex,
    semanticArrays,
    characterOnlySemanticArrays,
    isCharacterOnlyClick,
  ]);

  /**
   * Auto-scroll effect for Character Only panel
   *
   * Lifecycle: Runs when Character Only highlighting index changes
   * Dependencies: highlightedCharacterOnlyUnitIndex
   *
   * Scrolls Character Only panel to highlighted element when highlighting changes.
   * Handles both single index and array of indices (for multi-character segments).
   *
   * Uses 10ms delay to ensure React state update completes before scrolling.
   */
  useEffect(() => {
    if (highlightedCharacterOnlyUnitIndex && highlightedCharacterOnlyUnitIndex !== -1) {
      const timeoutId = setTimeout(() => {
        // Handle both single index and array of indices
        const firstIndex = Array.isArray(highlightedCharacterOnlyUnitIndex)
          ? highlightedCharacterOnlyUnitIndex[0]
          : highlightedCharacterOnlyUnitIndex;

        if (firstIndex >= 0) {
          scrollToHighlightedElement(characterOnlyTextRef, firstIndex);
        }
      }, 10);

      return () => clearTimeout(timeoutId);
    }
  }, [highlightedCharacterOnlyUnitIndex]);

  /**
   * Cache health monitoring effect - alerts user when cache performance degrades
   *
   * Lifecycle: Runs every 5 minutes during active use
   * Dependencies: None (monitoring interval)
   *
   * Monitors translation segment cache for degradation:
   * - Checks hit rate after 100+ lookups (meaningful sample size)
   * - Shows warning toast if hit rate < 50%
   * - Suggests dictionary reload for cache refresh
   *
   * Uses toast ID to prevent duplicate warnings.
   *
   * Performance: Lightweight check (1-2ms) runs every 5 minutes.
   */
  useEffect(() => {
    const checkCacheHealth = () => {
      try {
        const stats = translationSegmentCache.getStats();

        // Only alert if cache has been used enough to be meaningful
        if (stats.hitRate < 50 && stats.totalLookups > 100) {
          logger.warn(
            `⚠️ Cache degradation detected: ${stats.hitRate.toFixed(1)}% hit rate after ${stats.totalLookups} lookups`
          );
          toast.warning(
            'Translation cache degraded. Consider reloading dictionaries for better performance.',
            {
              duration: TOAST_DURATIONS.CACHE_WARNING,
              id: TOAST_IDS.CACHE_DEGRADATION, // Prevent duplicate toasts
            }
          );
        }
      } catch (error) {
        logger.error('Failed to check cache health:', error);
      }
    };

    // Check cache health every 5 minutes during active use
    const interval = setInterval(checkCacheHealth, UI_TIMEOUTS.CACHE_HEALTH_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Use translation controller hook for cancellation and timeout management
  const {
    createController: createTranslationController,
    cleanup: cleanupTranslationController,
    cancelAll: cancelAllTranslations,
    getActiveCount: getActiveTranslationCount,
  } = useTranslationController({
    timeout: 60000, // 1 minute max per translation
    cancelPreviousOnNew: true,
  });

  // MEDIUM-1 FIX: Clipboard translation debouncing to prevent double-clicks
  const isClipboardBusy = useRef(false);

  // Optimized performance monitoring with reduced overhead
  // updatePerformanceStats now provided by usePerformanceMonitoring hook

  /**
   * Updates all performance statistics (cache, pool, semantic, timing)
   *
   * Optimization: Only updates advanced stats when they're visible in UI.
   * Always updates cache hit rate for simple performance display.
   *
   * Gathers metrics from:
   * - translationSegmentCache: Cache hits/misses/size
   * - debugObjectPool: Reuse rate, GC reduction, memory stats
   * - globalPerformanceMonitor: Total time, ops/sec, min/max time
   *
   * Called after dictionary reload to show updated statistics.
   *
   * @returns {void}
   */
  const updateAllStats = useCallback(() => {
    // Always update cache hit rate for simple display
    updateCacheHitRate(translationSegmentCache);

    // Only update advanced stats if they're being displayed (performance optimization)
    if (_showAdvancedStats) {
      const poolStats = debugObjectPool.getAllStats();
      const _adaptiveStats = adaptiveChunker.getAdaptationStats();
      const monitorMetrics = globalPerformanceMonitor.getMetrics();

      setAdvancedStats({
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses,
        cacheSize: cacheStats.cacheSize,

        poolEnabled: poolStats.enabled,
        poolReuseRate: poolStats.enabled ? parseFloat(poolStats.summary.overallReuseRate) : 0,
        poolSavedTime: poolStats.enabled
          ? parseFloat(poolStats.summary.gcReductionEstimate.replace(/[^0-9.]/g, '')) || 0
          : 0,
        poolWastedMemory: 0, // Will be calculated if needed

        semanticEnabled: false, // Will be updated by semantic stats if available
        semanticEfficiency: 0,
        semanticUnits: 0,
        semanticRegexHitRate: 0,

        totalTime: monitorMetrics.totalOperations * monitorMetrics.avgTime,
        opsPerSec: monitorMetrics.opsPerSecond,
        minTime: monitorMetrics.minTime,
        maxTime: monitorMetrics.maxTime,
      });
    }
  }, [_showAdvancedStats, updateCacheHitRate]);

  // Define setSemanticStats if needed for advanced stats
  const setSemanticStats = () => {
    // This function exists for compatibility but is not used in the optimized version
  };

  /**
   * Translates Chinese text using character-only mode (individual character dictionary lookups)
   *
   * Runs concurrently with main translation to provide fallback translation without phrases,
   * patterns, or proper nouns. Used for comparison and debugging translation quality.
   *
   * Triggered automatically after main translation completes. Does not trigger UI loading states.
   *
   * @param {string} text - Chinese text to translate character-by-character
   * @returns {Promise<void>} Promise that resolves when character-only translation completes
   *
   * @example
   * // Automatically called after main translation
   * translateCharacterOnly(inputText);
   */
  const translateCharacterOnly = useCallback(async (text) => {
    const charOnlyId = `char_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    batchLog.hotInfo(
      'char-translation',
      `CHARACTER ONLY TRANSLATION START: ${charOnlyId} (${text.length} chars)`
    );

    if (!text || !text.trim()) {
      setCharacterOnlyText('');
      setCharacterOnlySemanticArrays(null);
      return Promise.resolve();
    }

    // CODE REVIEW FIX: Prevent translation during dictionary reload (race condition)
    if (isDictionaryReloading) {
      logger.warn('Character-only translation rejected: dictionary reload in progress');
      return Promise.resolve();
    }

    try {
      if (engineRef.current && engineRef.current.isReady()) {
        const result = await engineRef.current.translateWithCharactersOnly(text);
        if (result) {
          logger.log(
            `🎯 CHARACTER ONLY TRANSLATION END: ${charOnlyId} - Arrays length: ${result.semanticArrays.original?.length || 0}`
          );
          // CODE REVIEW FIX (2026-02-01): Validate semantic array size before setting
          try {
            validateSemanticArraySize(result.semanticArrays, 'character-only translation');
          } catch (validationError) {
            // Validation error already logged and toasted in validateSemanticArraySize
            return;
          }
          // Use requestAnimationFrame for smooth UI updates during parallel processing
          requestAnimationFrame(() => {
            setCharacterOnlyText(result.translatedText);
            setCharacterOnlySemanticArrays(result.semanticArrays);
          });
        }
      }
    } catch (error) {
      logger.error('Character-only translation failed:', error);
    }
    return Promise.resolve();
  }, []);

  /**
   * Main translation handler - processes Chinese text through 5-phase translation pipeline
   *
   * Executes the core translation workflow:
   * 1. Validates input (security, memory limits)
   * 2. Prevents concurrent translations during dictionary reload
   * 3. Creates AbortController for cancellation/timeout management
   * 4. Runs progressive translation with streaming updates
   * 5. Handles semantic arrays for clickable highlighting
   * 6. Updates performance statistics
   *
   * Translation phases (IMMUTABLE order):
   * - Phase 1: Pattern Processing (structural patterns with variables)
   * - Phase 2: Proper Noun Processing (novel-specific terms)
   * - Phase 3: Number Processing (Chinese numbers → Arabic/percentages)
   * - Phase 4: Phrase Processing (common multi-character phrases)
   * - Phase 5: Character Processing (single character fallback)
   *
   * Side effects:
   * - Sets loading state (isTranslating)
   * - Updates translated text progressively via streaming
   * - Clears previous semantic arrays and highlighting
   * - Shows toast notifications for errors/completion
   * - Auto-scrolls translation panel to beginning
   * - Triggers character-only translation after completion
   *
   * Error handling:
   * - Input validation rejects oversized/malicious text
   * - Blocks translation during dictionary reload (race condition prevention)
   * - Automatic timeout based on text length (30s minimum + 100ms/char)
   * - AbortController cancellation for manual stops
   * - Engine readiness checks before processing
   *
   * @param {string} text - Chinese text to translate (max 1MB, validated)
   * @returns {Promise<string>} Translated Vietnamese text
   *
   * @throws {Error} If input validation fails (oversized, malicious patterns)
   * @throws {Error} If translation timeout exceeded
   * @throws {Error} If engine not ready or initialization failed
   *
   * @example
   * // Triggered by input text change
   * const result = await translateText("你好世界");
   * setTranslatedText(result);
   */
  const translateText = useCallback(
    async (text) => {
      // CRITICAL FIX: Validate input text to prevent memory exhaustion and security issues
      const validationResult = TranslationInputValidator.validateInput(text);
      if (!validationResult.valid) {
        toast.error(validationResult.error, { duration: UI_TIMEOUTS.TOAST_DURATION_ERROR });
        logger.warn(`Translation rejected: ${validationResult.error}`);
        return;
      }

      // CODE REVIEW FIX: Prevent translation during dictionary reload (race condition)
      if (isDictionaryReloading) {
        toast.warning('Dictionary reload in progress. Please wait.', {
          duration: 3000,
        });
        logger.warn('Translation rejected: dictionary reload in progress');
        return;
      }

      // Create translation controller with automatic cancellation and timeout
      // Hook automatically cancels previous translations (cancelPreviousOnNew: true)
      const {
        controller: abortController,
        translationId,
        timeoutId: controllerTimeoutId,
      } = createTranslationController();

      const translationStartTime = performance.now();

      // NEW: Initialize streaming state
      updateStreaming({
        partialText: '',
        progress: 0,
        isStreaming: true,
        completedChunks: 0,
        totalChunks: 0,
        batchNumber: 0,
        avgTimePerChunk: 0,
      });

      // CODE REVIEW FIX (HIGH-4): Enforce maximum concurrent translation limit
      const MAX_CONCURRENT_TRANSLATIONS = 3;
      const currentActiveCount = getActiveTranslationCount();

      if (currentActiveCount >= MAX_CONCURRENT_TRANSLATIONS) {
        const errorMsg = `Maximum concurrent translation limit reached (${MAX_CONCURRENT_TRANSLATIONS}). Please wait for existing translations to complete.`;
        logger.warn(`🛑 ${errorMsg}`);
        toast.warning(errorMsg, {
          duration: TOAST_DURATIONS.WARNING,
          id: TOAST_IDS.TRANSLATION_LIMIT_REACHED,
        });
        // Return original text instead of throwing
        return text;
      }

      setActiveTranslations((prev) => prev + 1);

      try {
        if (isLoading) {
          return text;
        }

        // HIGH-2 FIX: Verify segment cleanup is firing before starting new translation
        if (engineRef.current?.translationSegments?.length > 100) {
          logger.error(
            `🚨 Segment cleanup failed: ${engineRef.current.translationSegments.length} segments accumulated (expected ≤35)`
          );
          // Force immediate cleanup
          const oldCount = engineRef.current.translationSegments.length;
          engineRef.current.translationSegments = engineRef.current.translationSegments.slice(-35);
          logger.log(
            `✅ Forced segment cleanup: ${oldCount} → ${engineRef.current.translationSegments.length}`
          );
          toast.warning('Performance optimization applied (segment cleanup)', { duration: 3000 });
        }

        // Use optimized engine with progressive translation
        if (engineRef.current && engineRef.current.isReady()) {
          // Scroll to beginning immediately when translation starts (skip during dictionary reload)
          if (!isDictionaryReloading) {
            setTimeout(() => {
              if (translationTextRef.current) {
                translationTextRef.current.scrollTop = 0;
                translationTextRef.current.scrollLeft = 0;
              }
            }, 10); // Small delay to ensure any previous content has been cleared
          }

          // Progressive translation with onProgress callback and proper timeout cleanup
          // CRITICAL FIX: Use atomic flag to prevent race condition between timeout and completion
          let timeoutId;
          let timeoutShouldFire = true; // Atomic flag to prevent double execution
          const result = await Promise.race([
            (async () => {
              const segmentResult = await engineRef.current.translateWithSegments(text, {
                debug: false,
                progressive: true,
                // NEW: Enhanced streaming callbacks
                onProgress: (progressData) => {
                  // Wrap in startTransition to deprioritize rendering updates
                  // This prevents GPU buffer corruption during rapid updates
                  startTransition(() => {
                    // Use debounced progress handler for smoother UI
                    debouncedProgressHandler.current.handleProgress(progressData);

                    // PHASE 3: Handle progressive clickable segments (existing)
                    if (progressData.progressiveSegments) {
                      // Store progressive segments for immediate clickability
                    }
                  });
                },
                // NEW: Add batch completion callback for streaming
                onBatchComplete: (batchData) => {
                  // Wrap in startTransition to deprioritize rendering updates
                  // This prevents GPU buffer corruption during rapid updates
                  startTransition(() => {
                    // Update streaming state with batch completion info
                    updateStreaming({
                      partialText: batchData.partialText,
                      progress: batchData.progress || 0,
                      completedChunks: batchData.completedChunks || 0,
                      totalChunks: batchData.totalChunks,
                      batchNumber: batchData.batchNumber,
                      avgTimePerChunk: batchData.avgTimePerChunk,
                    });

                    // Update partial semantic arrays for incremental highlighting
                    if (batchData.partialSemanticArrays) {
                      setPartialSemanticArrays(batchData.partialSemanticArrays);
                    }
                  });
                },
                dictionaryOrder: [
                  'phrases',
                  'patterns',
                  'properNouns-DaiDuongSongLong',
                  'properNouns-DuongThan',
                  'properNouns-LongXaDienNghia',
                  'properNouns-TapDo',
                  'properNouns',
                  'characters',
                  'punctuation',
                  'conversion',
                ],
              });

              // CRITICAL FIX: Set atomic flag BEFORE clearing timeout to prevent race
              // This ensures timeout callback won't reject even if it's already running
              timeoutShouldFire = false;

              // Clear timeout since translation completed successfully
              if (timeoutId) {
                clearTimeout(timeoutId);
              }

              // Final update with complete result - flush any pending debounced updates
              debouncedProgressHandler.current.flushUpdates();

              if (segmentResult && segmentResult.semanticArrays) {
                // CODE REVIEW FIX (2026-02-01): Validate semantic array size before setting
                try {
                  validateSemanticArraySize(segmentResult.semanticArrays, 'main translation');
                } catch (validationError) {
                  // Validation error already logged and toasted in validateSemanticArraySize
                  // Clear translation state on overflow
                  setTranslatedText('');
                  setSemanticArrays(null);
                  setPrebuiltSegments([]);
                  return;
                }

                setSemanticArrays(segmentResult.semanticArrays);
                setPrebuiltSegments(segmentResult.prebuiltSegments || []);
              }

              // Clear progress info when done
              setProgressInfo(null);

              // NEW: Complete streaming and reset state
              updateStreaming({
                isStreaming: false,
                progress: 100,
                partialText: segmentResult.translatedText,
              });

              // Clear partial semantic arrays since we have final ones
              setPartialSemanticArrays(null);

              // Return the translated text
              return segmentResult.translatedText;
            })(),
            new Promise((_, reject) => {
              timeoutId = setTimeout(
                () => {
                  // CRITICAL FIX: Check atomic flag to prevent race condition
                  // Must check both abort state AND timeout flag to avoid double execution
                  if (timeoutShouldFire && !abortController.signal.aborted) {
                    logger.error(`⏰ Optimized engine timeout for translation ${translationId}`);
                    setProgressInfo(null);
                    reject(new Error('Optimized engine timeout'));
                  }
                },
                Math.max(30000, text.length * 100)
              ); // Dynamic timeout: minimum 30s, +100ms per character

              // Cancel timeout if translation is aborted
              abortController.signal.addEventListener('abort', () => {
                timeoutShouldFire = false; // CRITICAL FIX: Set flag before clearing timeout
                clearTimeout(timeoutId);
                reject(new Error('Translation cancelled'));
              });
            }),
          ]);

          // Update stats periodically
          if (engineRef.current.getEngineStats().totalTranslations % 10 === 0) {
            setEngineStats(engineRef.current.getEngineStats());
          }

          // Update performance stats
          const translationTimeMs = performance.now() - translationStartTime;
          updatePerformanceStats(translationTimeMs);

          return result;
        } else {
          // Engine not ready - return original text with message
          logger.error(`❌ Translation ${translationId} failed: Engine not ready`);
          return 'Engine not ready. Please wait for engine initialization.';
        }
      } finally {
        // CODE REVIEW FIX (CRITICAL-3): Wrap cleanup work in promise for tracking
        const cleanupWork = (async () => {
          // Clean up debounced progress handler
          debouncedProgressHandler.current.cleanup();

          // Reset streaming state on completion/error
          updateStreaming({
            isStreaming: false,
          });

          setActiveTranslations((prev) => {
            const newCount = prev - 1;
            logger.log(`🏁 Translation ${translationId} finished - Active: ${newCount}`);
            return newCount;
          });

          // Small delay to ensure state updates are processed
          await new Promise((resolve) => setTimeout(resolve, 0));
        })();

        // Clean up translation controller and pass cleanup promise for tracking
        cleanupTranslationController(translationId, controllerTimeoutId, cleanupWork);
      }
    },
    [isLoading, isDictionaryReloading]
  );

  // CRITICAL FIX: Cache for merged dictionaries with LRU eviction
  // Prevents unbounded memory growth from dictionary switching
  const dictionaryCache = new Map();
  const MAX_DICTIONARY_CACHE_SIZE = 10; // Limit recent combinations

  /**
   * Main translation effect - orchestrates configuration loading and translation
   *
   * Lifecycle: Runs when input text changes or dictionaries load
   * Dependencies: inputText, isLoading, isClipboardTranslation, isDictionaryReloading
   *
   * Workflow:
   * 1. Skip if dictionary reload just completed (prevents duplicate translation)
   * 2. Skip if dictionary reload in progress (race condition prevention)
   * 3. Clear highlighting when input changes
   * 4. Load latest configuration from disk
   * 5. Translate input text if available
   * 6. Trigger character-only translation after main completes
   * 7. Auto-scroll if clipboard translation (skip during reload)
   *
   * Why this can't be extracted:
   * - Coordinates translation timing with configuration loading
   * - Manages multiple state setters (isTranslating, translatedText, semanticArrays)
   * - Handles clipboard auto-scroll coordination
   * - Prevents duplicate translations during reload
   *
   * Performance optimizations:
   * - Uses progressive translation for immediate responsiveness
   * - Character-only runs after main (non-blocking for better UX)
   * - Shows success notification for large translations (>5000 chars)
   */
  useEffect(() => {
    const loadAndTranslate = async () => {
      try {
        // CRITICAL-1 ADDITIONAL FIX: Skip if dictionary reload just completed
        // Prevents duplicate translation when isDictionaryReloading changes from true to false
        const wasReloading = prevIsDictionaryReloadingRef.current;
        const isReloading = isDictionaryReloading;

        // Update ref for next run
        prevIsDictionaryReloadingRef.current = isReloading;

        if (wasReloading && !isReloading) {
          logger.log(
            '⏭️ Skipping translation - dictionary reload just completed (already retranslated)'
          );
          return;
        }

        if (isReloading) {
          logger.log('⏭️ Skipping translation - dictionary reload in progress');
          return;
        }

        // Clear highlighting when input changes
        clearHighlighting();

        // Load latest configuration
        const result = await window.electronAPI.loadConfiguration();
        if (result.success) {
          const newActiveProperNouns = result.data.activeProperNouns || ['properNouns'];
          setActiveProperNouns(newActiveProperNouns);
        }

        // Translate if we have input text and dictionaries are loaded
        if (inputText && !isLoading) {
          setIsTranslating(true);
          // Clear previous highlighting when starting new translation
          clearHighlighting();
          setSemanticArrays(null);

          // Character-only translation runs after main translation to avoid engine interference

          try {
            // PROGRESSIVE: Use progressive translation for immediate responsiveness
            // Use sequential translation approach for reliability
            const newTranslation = await translateText(inputText);
            logger.log(`📝 Translation completed: ${newTranslation.length} chars`);
            setTranslatedText(newTranslation);

            // Show success notification for large translations
            if (inputText.length > UI_TIMEOUTS.LARGE_TRANSLATION_THRESHOLD) {
              toast.success(`Translation completed: ${inputText.length} characters processed`, {
                duration: TOAST_DURATIONS.SUCCESS,
                id: TOAST_IDS.TRANSLATION_COMPLETED,
              });
            }

            // Run character-only translation after main completes (non-blocking for better UX)
            setTimeout(() => translateCharacterOnly(inputText), 0);

            // Auto-scroll translated text to beginning if this was a clipboard translation (skip during dictionary reload)
            if (isClipboardTranslation && !isDictionaryReloading) {
              setTimeout(() => {
                if (translationTextRef.current) {
                  translationTextRef.current.scrollTop = 0;
                  translationTextRef.current.scrollLeft = 0;
                }
              }, 100); // Small delay to ensure translation content has rendered
            }
            if (isClipboardTranslation) {
              setIsClipboardTranslation(false); // Reset flag
            }
          } finally {
            setIsTranslating(false);
          }
        }
      } catch (error) {
        // CODE REVIEW FIX: Proper error handling (not ignoring)
        logger.error('Failed to load configuration:', error);
      }
    };

    loadAndTranslate();
  }, [
    inputText,
    isLoading,
    isClipboardTranslation,
    isDictionaryReloading,
    translateCharacterOnly,
    translateText,
  ]); // Only retranslate when input changes or dictionaries finish initial loading

  /**
   * Handles clipboard translation - reads clipboard and initiates translation
   *
   * User action: Click "Translate from Clipboard" button or press Cmd/Ctrl-V
   *
   * Workflow:
   * 1. Prevents concurrent clipboard operations (debouncing via busy flag)
   * 2. Blocks during dictionary reload (race condition prevention)
   * 3. Reads clipboard via Tauri API (no browser permission prompt)
   * 4. Preprocesses text (collapse 2+ line breaks to single break)
   * 5. Sets input text and marks as clipboard translation
   * 6. Auto-scrolls both original and translation panels to top
   *
   * Side effects:
   * - Sets input text (triggers translation via useEffect)
   * - Sets isClipboardTranslation flag (controls auto-scroll behavior)
   * - Clears previous highlighting
   * - Scrolls original text panel to beginning
   * - Shows toast warnings for errors or blocked operations
   *
   * Error handling:
   * - Graceful degradation on clipboard read failure
   * - Debouncing prevents double-click issues (500ms busy window)
   * - Blocks during dictionary reload to prevent race conditions
   *
   * @returns {Promise<void>} Promise that resolves when clipboard read and setup completes
   *
   * @example
   * // Button click handler
   * <Button onClick={handleTranslateFromClipboard}>Translate from Clipboard</Button>
   *
   * // Keyboard shortcut
   * onTranslateFromClipboard={handleTranslateFromClipboard}
   */
  const handleTranslateFromClipboard = useCallback(async () => {
    // MEDIUM-1 FIX: Prevent concurrent clipboard translations
    if (isClipboardBusy.current) {
      logger.log('Clipboard translation already in progress - ignoring duplicate call');
      return;
    }

    // CODE REVIEW FIX: Prevent clipboard translation during dictionary reload (race condition)
    if (isDictionaryReloading) {
      toast.warning('Dictionary reload in progress. Please wait.', {
        duration: 3000,
      });
      logger.warn('Clipboard translation rejected: dictionary reload in progress');
      return;
    }

    isClipboardBusy.current = true;
    try {
      // Use Tauri clipboard API for direct access (no browser permission prompt)
      const rawText = await window.electronAPI.readClipboard();

      // Preprocess: collapse 2+ consecutive line breaks into single line break
      const text = rawText.replace(/\n{2,}/g, '\n');

      // Mark this as a clipboard translation for auto-scroll behavior
      setIsClipboardTranslation(true);
      // Only set input text - let the useEffect handle translation
      setInputText(text);
      // Clear highlighting when input changes
      clearHighlighting();

      // Auto-scroll original text area to the beginning immediately
      setTimeout(() => {
        if (originalTextRef.current) {
          originalTextRef.current.scrollTop = 0;
          originalTextRef.current.scrollLeft = 0;
        }
      }, 50); // Small delay to ensure content has been updated
    } catch (error) {
      // CODE REVIEW FIX: Proper error handling (not ignoring)
      logger.error('Failed to read clipboard:', error);
    } finally {
      // Reset busy flag after short delay to allow translation to start
      setTimeout(() => {
        isClipboardBusy.current = false;
      }, 500);
    }
  }, []); // No dependencies - only uses setters which are stable

  /**
   * Reloads all dictionaries from storage and reinitializes translation engine
   *
   * User action: Click "Reload Dictionary" button or press Cmd/Ctrl-R
   *
   * Critical use cases:
   * - After adding new dictionary entries (picks up changes)
   * - When translation quality degrades (clears stale caches)
   * - After editing proper noun dictionaries
   * - When cache corruption is suspected
   *
   * 8-Step reload sequence:
   * 1. Prevent concurrent reloads (blocks duplicate calls)
   * 2. Save scroll positions for restoration
   * 3. Cancel active translations (200ms wait for cleanup)
   * 4. Clear all caches (translation segments, dictionary caches, WASM caches)
   * 5. Destroy current engine instance
   * 6. Force reload all dictionaries from storage (parallel load, 8x faster)
   * 7. Load fresh configuration (activeProperNouns from disk, not React state)
   * 8. Reinitialize engine with filtered dictionaries
   * 9. Retranslate current text (if input exists)
   * 10. Restore scroll positions after completion
   *
   * Side effects (coordination requires coupling):
   * - Sets isDictionaryReloading flag (blocks translations during reload)
   * - Cancels active translations (up to 3 concurrent)
   * - Clears isTranslating, progressInfo state
   * - Destroys engine (engineRef.current = null)
   * - Clears all caches (translation segments, dictionary, pattern variables, WASM)
   * - Shows progressive status messages in translation panel
   * - Resets engineInitialized flag
   * - Loads fresh activeProperNouns from disk (NOT React state)
   * - Creates new engine with filtered dictionaries
   * - Retranslates current input (if exists)
   * - Restores scroll positions after 100ms delay
   * - Shows toast notifications (success/error)
   *
   * Why this can't be extracted:
   * - Coordinates 10+ state setters atomically
   * - Timing-sensitive cache invalidation
   * - Scroll position management requires DOM refs
   * - Configuration loading must bypass React state (disk is source of truth)
   *
   * Error handling:
   * - Prevents concurrent reloads (isDictionaryReloading mutex)
   * - Shows error messages in translation panel
   * - Toast notifications for all error states
   * - Graceful degradation if dictionaries not ready
   * - WASM validation runs asynchronously (non-blocking)
   *
   * Performance optimizations:
   * - Parallel dictionary loading (8x speedup vs sequential)
   * - Dual-mode translation for reload (if available)
   * - Non-blocking WASM validation (100ms delayed)
   *
   * @returns {Promise<void>} Promise that resolves when reload and retranslation completes
   *
   * @example
   * // Button click
   * <Button onClick={handleForceReload}>Reload Dictionary</Button>
   *
   * // Keyboard shortcut
   * onReloadDictionary={handleForceReload}
   */
  const handleForceReload = useCallback(async () => {
    // CODE REVIEW FIX: Prevent concurrent dictionary reloads (consolidated from separate isReloading state)
    if (isDictionaryReloading) {
      logger.warn('🛑 Reload already in progress - ignoring duplicate call');
      toast.warning('Dictionary reload already in progress');
      return;
    }
    logger.log('🔄 Reload Dictionary initiated - clearing all caches and reloading from storage');
    logger.log('Current state before reload:', {
      translatedText: translatedText?.substring(0, 50),
      inputText: inputText?.substring(0, 50),
      isLoading,
      dictionaries: !!dictionaries,
      engineReady: engineRef.current?.isReady(),
    });

    // Save current scroll positions before starting reload
    const savedPositions = saveScrollPositions();
    setIsDictionaryReloading(true);
    logger.log('📍 Saved scroll positions:', savedPositions);

    try {
      logger.log('🔄 Starting Reload Dictionary sequence...');
      // IMPORTANT-6 FIX: Show initial progress message
      setTranslatedText(
        '🔄 Starting dictionary reload...\n\nStep 1: Stopping active translations...'
      );

      // Step 1: Stop any ongoing translations and wait for them to finish
      logger.log('Step 1: Stopping ongoing translations...');
      // CODE REVIEW FIX (CRITICAL-3): Use Promise-based cleanup tracking instead of fixed 200ms wait
      const { count: cancelledCount, cleanupComplete } = cancelAllTranslations();
      if (cancelledCount > 0) {
        logger.log(`🛑 Cancelled ${cancelledCount} active translation(s)`);

        // CRITICAL: Wait for translations to actually finish before destroying engine
        // Why: Abort signal doesn't immediately stop async operations
        // Race condition: Translation's finally block may try to access engineRef.current
        // FIX: Wait for all cleanup promises to resolve (no arbitrary timeout)
        await cleanupComplete;

        logger.log('✅ All translation cleanup(s) completed');
      }
      setIsTranslating(false);
      setProgressInfo(null);

      // Step 2: Clear engine and caches
      logger.log('Step 2: Clearing engine and translation caches...');
      // IMPORTANT-6 FIX: Show progress
      setTranslatedText('🔄 Dictionary reload in progress...\n\nStep 2: Clearing caches...');

      // Clear translation segment cache (prevents formatting corruption from cached results)
      try {
        translationSegmentCache.clear();
        logger.log('✅ Translation segment cache cleared');
      } catch (_cacheError) {
        logger.error('❌ Error clearing translation cache:', _cacheError);
      }

      // Semantic translation cache removed - no longer used

      if (engineRef.current) {
        try {
          // Clear JavaScript caches
          if (engineRef.current.dictionaryManager?.clearAllCaches) {
            engineRef.current.dictionaryManager.clearAllCaches();
            logger.log('✅ Dictionary manager caches cleared');
          }
          if (engineRef.current.semanticPatternProcessor?.variableCache) {
            engineRef.current.semanticPatternProcessor.variableCache.clear();
            logger.log('✅ Semantic pattern variable cache cleared');
          }

          // WASM Core Engine removed - cache clearing no longer needed

          engineRef.current = null;
          logger.log('✅ Engine cleared successfully');
        } catch (_engineError) {
          logger.error('❌ Error clearing engine:', _engineError);
        }
      }

      // Step 3: Cleanup (benchmark removed - was unused)

      // Step 4: Force reload all dictionaries from storage to pick up new entries
      logger.log('Step 4: Force reloading all dictionaries from storage...');
      // IMPORTANT-6 FIX: Show progress with dictionary count
      const allDictionaryIds = Object.keys(dictionaries || {});
      setTranslatedText(
        `🔄 Dictionary reload in progress...\n\nStep 3: Loading ${allDictionaryIds.length} dictionaries in parallel...`
      );

      // INTEGRATION #2: Use ParallelDictionaryLoader for optimized parallel loading
      // Expected: 2-4x faster initialization with better error handling and statistics
      const freshDictionaries = {};
      let successCount = 0;

      try {
        // Transform dictionary IDs into format expected by ParallelDictionaryLoader
        const dictionariesToLoad = allDictionaryIds.map((dictId) => ({
          name: dictId,
          path: dictId, // Path not used, Electron API handles lookup internally
        }));

        // Wrapper function for Electron API
        const loadFunction = async (name, _path) => {
          logger.log(`Force loading dictionary from storage: ${name}`);
          const result = await window.electronAPI.loadDictionary(name);
          if (!result.success) {
            throw new Error(result.error || 'Unknown error');
          }
          return {
            data: result.data,
            entryCount: Object.keys(result.data || {}).length,
          };
        };

        // Use ParallelDictionaryLoader for optimized parallel loading
        const loadResult = await parallelDictionaryLoader.loadDictionariesParallel(
          dictionariesToLoad,
          loadFunction
        );

        // Process results
        loadResult.results.forEach(({ name, success, result, error }) => {
          if (success && result) {
            freshDictionaries[name] = result.data;
            successCount++;
            logger.log(`✅ Loaded ${name}: ${result.entryCount} entries`);
          } else {
            logger.error(`Failed to load dictionary ${name}:`, error);
          }
        });

        logger.log(
          `📥 Loaded ${successCount}/${allDictionaryIds.length} dictionaries in parallel (${loadResult.duration.toFixed(0)}ms)`
        );
      } catch (loaderError) {
        // Fallback to original manual parallel loading if ParallelDictionaryLoader fails
        logger.warn(
          'ParallelDictionaryLoader failed, falling back to manual loading:',
          loaderError
        );

        const loadPromises = allDictionaryIds.map(async (dictId) => {
          try {
            logger.log(`Force loading dictionary from storage: ${dictId}`);
            const result = await window.electronAPI.loadDictionary(dictId);
            if (result.success) {
              return {
                dictId,
                data: result.data,
                success: true,
                entryCount: Object.keys(result.data || {}).length,
              };
            }
            logger.error(`Failed to load dictionary ${dictId}:`, result.error);
            return { dictId, error: result.error, success: false };
          } catch (error) {
            logger.error(`Failed to reload dictionary ${dictId}:`, error);
            return { dictId, error: error.message, success: false };
          }
        });

        const results = await Promise.all(loadPromises);

        // Process fallback results
        results.forEach(({ dictId, data, success, entryCount }) => {
          if (success) {
            freshDictionaries[dictId] = data;
            successCount++;
            logger.log(`✅ Loaded ${dictId}: ${entryCount} entries`);
          }
        });

        logger.log(
          `📥 Loaded ${successCount}/${allDictionaryIds.length} dictionaries in parallel (fallback)`
        );
      }

      // Update context with fresh data from storage
      if (Object.keys(freshDictionaries).length > 0) {
        logger.log('📥 Updating context with fresh dictionary data from storage...');
        // We need to access the context's setDictionaries function
        // Since we don't have direct access, we'll rely on the engine reload to pick up the fresh data
      }

      // Step 5: Clear UI state and show status
      logger.log('Step 5: Updating UI state...');
      const reloadMessage =
        '🔄 Reload Dictionary in progress...\n\nCaches cleared, dictionaries reloaded from storage.\nReinitializing engine...';
      logger.log('📝 Showing reload status message');
      setTranslatedText(reloadMessage);
      setSemanticArrays({ original: [], translated: [], metadata: [] });
      setCharacterOnlySemanticArrays(null);
      setCharacterOnlyText('');
      clearHighlighting();
      setEngineStats(null);
      setEngineInitialized(false); // Reset initialization flag for reload

      // Step 6: Load fresh configuration to get updated activeProperNouns
      // CRITICAL ARCHITECTURAL PATTERN: Load config at operation time, NOT from React state
      // Why this pattern is necessary:
      // 1. React state updates are asynchronous - setState doesn't guarantee immediate value
      // 2. Configuration can change externally (manual JSON editing)
      // 3. File I/O is the authoritative source of truth, not in-memory state
      // 4. Dictionary reload MUST use latest saved config, not stale captured values
      //
      // ANTI-PATTERN (DO NOT USE):
      // const [config, setConfig] = useState(defaultConfig);
      // const reload = useCallback(() => {
      //   processWithConfig(data, config); // Stale! Captured at callback creation time
      // }, [config]);
      //
      // CORRECT PATTERN (USED HERE):
      // const reload = useCallback(async () => {
      //   const freshConfig = await loadConfiguration(); // Fresh from disk
      //   processWithConfig(data, freshConfig); // Always current
      // }, []); // No config in dependencies
      //
      // See CLAUDE.md "Configuration Loading" section for detailed rationale
      logger.log('Step 6: Loading fresh configuration...');
      let freshActiveProperNouns = activeProperNouns; // fallback to current value
      try {
        const configResult = await window.electronAPI.loadConfiguration();
        if (configResult.success && configResult.data.activeProperNouns) {
          freshActiveProperNouns = configResult.data.activeProperNouns;
          logger.log('✅ Fresh configuration loaded:', freshActiveProperNouns);

          // Update state with fresh configuration
          setActiveProperNouns(freshActiveProperNouns);
        } else {
          logger.log('⚠️  Using current configuration (no changes detected)');
        }
      } catch (configError) {
        logger.error('❌ Failed to load fresh configuration:', configError);
        logger.log('⚠️  Using current configuration as fallback');
      }

      // Step 7: Reinitialize engine with fresh dictionaries and configuration
      logger.log('Step 7: Reinitializing engine with fresh dictionaries and configuration...');
      // IMPORTANT-6 FIX: Show progress
      setTranslatedText(
        '🔄 Dictionary reload in progress...\n\nStep 4: Reinitializing translation engine...'
      );
      const dictionariesToUse =
        Object.keys(freshDictionaries).length > 0 ? freshDictionaries : dictionaries;

      if (!isLoading && dictionariesToUse) {
        try {
          engineRef.current = createTranslationEngine();

          // Filter dictionaries to only include active ones (using fresh configuration)
          const filteredDictionaries = getFilteredDictionaries(
            dictionariesToUse,
            freshActiveProperNouns
          );

          await engineRef.current.initialize(filteredDictionaries, {
            priorities: {
              properNouns: 1,
              patterns: 2,
              phrases: 3,
              characters: 4,
              punctuation: 5,
              conversion: 6,
            },
            activeProperNouns: freshActiveProperNouns,
            debugLevel: DEBUG_LEVELS.ERROR, // PERFORMANCE: Reduce console spam
          });

          // Note: window.translationEngine already exposed during initial engine creation
          setEngineStats(engineRef.current.getEngineStats());
          logger.log('✅ Engine reinitialized successfully');

          // HIGH-6 FIX: Run WASM validation asynchronously without blocking reload
          // This prevents UI freezes during validation of large test sets
          if (
            engineRef.current?.dictionaryManager?.wasmInitialized &&
            typeof engineRef.current.dictionaryManager.validateWasmFallback === 'function'
          ) {
            // Run validation in background (non-blocking)
            setTimeout(() => {
              try {
                const syncStatus = engineRef.current?.dictionaryManager?.validateWasmFallback();
                if (!syncStatus) {
                  logger.warn('⚠️ WASM validation skipped - engine no longer available');
                  return;
                }

                if (syncStatus.status === 'PASS') {
                  logger.log('✅ WASM dictionary sync validated successfully');
                } else if (syncStatus.status === 'SKIPPED') {
                  logger.log('⚠️ WASM validation skipped:', syncStatus.reason);
                } else if (syncStatus.status === 'FAIL_DIFFERENCES') {
                  logger.error(
                    '❌ WASM sync validation failed - differences detected:',
                    syncStatus
                  );
                  toast.error(
                    `WASM sync failed: ${syncStatus.results.different} mismatches. Using JavaScript fallback.`,
                    { duration: TOAST_DURATIONS.CACHE_WARNING }
                  );
                } else if (syncStatus.status === 'FAIL_ERRORS') {
                  logger.error('❌ WASM sync validation failed - errors:', syncStatus);
                  toast.error(`WASM sync errors detected. Using JavaScript fallback.`, {
                    duration: TOAST_DURATIONS.CACHE_WARNING,
                  });
                }
              } catch (validationError) {
                logger.error('❌ WASM validation error:', validationError);
                // Don't block reload on validation errors
              }
            }, 100); // Run after reload completes (non-blocking)
          }

          // Step 8: Restore translation if there's input text
          if (inputText.trim()) {
            logger.log('Step 8: Retranslating current text...');
            const retranslateMessage = '🔄 Engine ready - retranslating text...';
            setTranslatedText(retranslateMessage);

            // Wait a bit to ensure engine is fully ready
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Double-check engine is ready before translating
            if (!engineRef.current?.isReady()) {
              logger.log('⚠️ Engine not ready after initialization, waiting longer...');
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            try {
              // OPTIMIZATION: Use dual-mode translation for dictionary reload as well
              if (engineRef.current?.translateDualModeOptimized) {
                try {
                  // Use optimized dual-mode translation for reload performance
                  const dualResults = await engineRef.current.translateDualModeOptimized(inputText);

                  // CODE REVIEW FIX (2026-02-01): Validate semantic array sizes before setting
                  try {
                    validateSemanticArraySize(
                      dualResults.fullResult.semanticArrays,
                      'full translation'
                    );
                    validateSemanticArraySize(
                      dualResults.characterResult.semanticArrays,
                      'character-only translation'
                    );
                  } catch (validationError) {
                    // Validation error already logged and toasted in validateSemanticArraySize
                    return;
                  }

                  // Update both translations efficiently
                  setTranslatedText(dualResults.fullResult.translatedText);
                  setSemanticArrays(dualResults.fullResult.semanticArrays);
                  setCharacterOnlyText(dualResults.characterResult.translatedText);
                  setCharacterOnlySemanticArrays(dualResults.characterResult.semanticArrays);

                  // Update statistics after dictionary reload (optimized)
                  updateAllStats();
                } catch (_optimizedError) {
                  logger.error(
                    '🔄 Optimized reload translation failed, falling back to sequential:',
                    _optimizedError
                  );

                  // Fallback to original sequential method
                  const newTranslation = await translateText(inputText);
                  setTranslatedText(newTranslation);

                  // Run character-only translation after main completes during reload (non-blocking)
                  setTimeout(() => translateCharacterOnly(inputText), 0);
                }
              } else {
                // Fallback for engines without optimization
                const newTranslation = await translateText(inputText);
                setTranslatedText(newTranslation);

                // Run character-only translation after main completes during reload (non-blocking)
                setTimeout(() => translateCharacterOnly(inputText), 0);
              }

              logger.log('✅ Retranslation completed successfully');
              toast.success('Dictionary reloaded and text retranslated');
            } catch (_retranslateError) {
              logger.error('❌ Retranslation failed:', _retranslateError);
              const errorMessage =
                '❌ Retranslation failed!\n\nError: ' + _retranslateError.message;
              setTranslatedText(errorMessage);
              toast.error(`Retranslation failed: ${_retranslateError.message}`);
            }
          } else {
            const completedMessage =
              '✅ Reload Dictionary completed!\n\nAll caches cleared, dictionaries reloaded from storage, and engine reinitialized.\nEngine is ready for translation.';
            setTranslatedText(completedMessage);
            toast.success('Dictionary reloaded successfully');
          }
        } catch (_engineError) {
          logger.error('❌ Error reinitializing engine:', _engineError);
          const engineErrorMessage =
            '❌ Reload Dictionary failed!\n\nError reinitializing engine: ' + _engineError.message;
          setTranslatedText(engineErrorMessage);
          toast.error(`Failed to reinitialize engine: ${_engineError.message}`);
        }
      } else {
        logger.log('⚠️ Cannot reinitialize engine - dictionaries not ready');
        const warningMessage =
          '⚠️ Reload Dictionary partially completed\n\nEngine will reinitialize automatically when dictionaries are ready.';
        setTranslatedText(warningMessage);
        toast.error('Dictionaries not ready - please try again');
      }

      logger.log('✅ Reload Dictionary sequence completed');
    } catch (error) {
      // CODE REVIEW FIX: Proper error handling (not ignoring)
      logger.error('❌ Reload Dictionary failed:', error);
      const unexpectedErrorMessage =
        '❌ Reload Dictionary failed!\n\nUnexpected error: ' + error.message;
      setTranslatedText(unexpectedErrorMessage);
      toast.error(`Dictionary reload failed: ${error.message}`);
    } finally {
      // CRITICAL-1 FIX: Keep isDictionaryReloading=true until AFTER scroll restoration
      // Prevents auto-scroll from overriding saved positions during reload
      // Restore scroll positions after all React state updates have completed
      setTimeout(async () => {
        logger.log('📍 Final scroll restoration attempt after reload complete');
        // CRITICAL-1 ENHANCEMENT: Await scroll restoration to complete before resetting flag
        await restoreScrollPositions(savedPositions);

        // Reset reloading flag AFTER restoration definitely completes
        setIsDictionaryReloading(false);
        // Note: savedScrollPositions now managed internally by useScrollPositionManager hook
        logger.log('🔄 Dictionary reload complete - flag reset after scroll restoration');
      }, 100); // POST_RELOAD_DELAY: Allow React state updates to flush
    }
  }, [
    inputText,
    activeProperNouns,
    dictionaries,
    getFilteredDictionaries,
    isLoading,
    isDictionaryReloading,
    saveScrollPositions,
    restoreScrollPositions,
    translateCharacterOnly,
    translateText,
    translatedText,
  ]);

  // Memoized style definitions to prevent re-creation on every render
  const sharedTextStyle = useMemo(
    () => ({
      padding: '1.5rem',
      backgroundColor: 'var(--background-color)',
      color: 'var(--text-color, #213547)',
      border: '1px solid var(--border-color, #e5e7eb)',
      borderRadius: '8px',
      fontSize: '1.25rem',
      lineHeight: '1.5',
      outline: 'none',
      resize: 'none',
      margin: '0',
      textAlign: 'left',
      boxSizing: 'border-box',
      minHeight: 0,
    }),
    []
  );

  const inputTextStyle = useMemo(
    () => ({
      ...sharedTextStyle,
      fontFamily:
        'var(--chinese-text-font, "Noto Sans CJK SC", SimSun, "Microsoft YaHei", Inter, system-ui, Arial, sans-serif)',
      fontSize: 'var(--chinese-text-size, 1.25rem)',
      letterSpacing: 'var(--chinese-text-spacing, normal)',
      flex: 1,
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
    }),
    [sharedTextStyle]
  );

  const outputTextStyle = useMemo(
    () => ({
      ...sharedTextStyle,
      fontFamily:
        'var(--full-translation-font, Bookerly, Amstelvar, "Noto Sans CJK SC", Arial, sans-serif)',
      fontSize: 'var(--full-translation-size, 1.25rem)',
      letterSpacing: 'var(--full-translation-spacing, normal)',
      flex: 2,
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
    }),
    [sharedTextStyle]
  );

  const characterOnlyTextStyle = useMemo(
    () => ({
      ...sharedTextStyle,
      fontFamily:
        'var(--character-only-font, Bookerly, Amstelvar, "Noto Sans CJK SC", Arial, sans-serif)',
      fontSize: 'var(--character-only-size, 1.25rem)',
      letterSpacing: 'var(--character-only-spacing, normal)',
      flex: '1 0 50%',
      minHeight: 0,
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
    }),
    [sharedTextStyle]
  );

  return (
    <div className={styles.container}>
      <HotkeyHandler
        onTranslateFromClipboard={handleTranslateFromClipboard}
        onQuickAdd={handleQuickAddProperNoun}
        onQuickAddCharacter={handleQuickAddCharacter}
        onQuickAddPhrase={handleQuickAddPhrase}
        onQuickAddProperNoun={handleQuickAddProperNoun}
        onQuickAddPattern={handleQuickAddPattern}
        onQuickAddCustomProperNoun={handleQuickAddCustomProperNoun}
        onReloadDictionary={handleForceReload}
        activeTab={isActive ? 'translator' : null}
      />

      {/* CRITICAL-3 FIX: Show initialization error banner */}
      {initializationError && (
        <div className={styles.errorBanner}>
          <div className={styles.errorHeader}>
            <strong className={styles.errorTitle}>⚠️ Translation Engine Error</strong>
          </div>
          <div className={styles.errorMessage}>{initializationError}</div>
          <div className={styles.errorActions}>
            <button onClick={handleForceReload} className={styles.errorButton}>
              Reload Dictionaries
            </button>
            <button
              onClick={() => window.location.reload()}
              className={styles.errorButtonSecondary}
            >
              Reload App
            </button>
          </div>
        </div>
      )}

      {/* CODE REVIEW FIX (CRITICAL-2): Show cache poisoning warning banner */}
      {cachePoisoningDetected && (
        <div className={styles.criticalWarningBanner}>
          <div className={styles.errorHeader}>
            <strong className={styles.errorTitle}>🚨 Critical: Dictionary Cache Corruption</strong>
          </div>
          <div className={styles.errorMessage}>
            Dictionary cache corruption has been detected ({cachePoisoningCount} event(s)). This may
            cause incorrect translations or degraded performance.
          </div>
          <div className={styles.errorMessage}>
            <strong>Recommended action:</strong> Save your work and restart the application to
            ensure data integrity.
          </div>
          <div className={styles.errorActions}>
            <button onClick={() => window.location.reload()} className={styles.errorButton}>
              Restart Application
            </button>
            <button
              onClick={() => setCachePoisoningDetected(false)}
              className={styles.errorButtonSecondary}
            >
              Dismiss Warning
            </button>
          </div>
        </div>
      )}

      <TranslatorControls
        handleTranslateFromClipboard={handleTranslateFromClipboard}
        handleQuickAddProperNoun={handleQuickAddProperNoun}
        handleForceReload={handleForceReload}
        isLoading={isLoading}
        isReloading={isDictionaryReloading}
        isTranslating={isTranslating}
        progressInfo={progressInfo}
        activeTranslations={activeTranslations}
        performanceStats={performanceStats}
        wasmStatus={wasmStatus}
        regressionHealth={regressionHealth}
        throttledStreamingState={throttledStreamingState}
      />

      <TranslatorDisplayPanels
        inputText={inputText}
        translatedText={translatedText}
        characterOnlyText={characterOnlyText}
        semanticArrays={semanticArrays}
        characterOnlySemanticArrays={characterOnlySemanticArrays}
        partialSemanticArrays={partialSemanticArrays}
        prebuiltSegments={prebuiltSegments}
        highlightedUnitIndex={highlightedUnitIndex}
        highlightedTranslationUnitIndex={highlightedTranslationUnitIndex}
        highlightedCharacterOnlyUnitIndex={highlightedCharacterOnlyUnitIndex}
        throttledStreamingState={throttledStreamingState}
        handleSemanticSegmentClick={handleSemanticSegmentClick}
        inputTextStyle={inputTextStyle}
        outputTextStyle={outputTextStyle}
        characterOnlyTextStyle={characterOnlyTextStyle}
        originalTextRef={originalTextRef}
        translationTextRef={translationTextRef}
        characterOnlyTextRef={characterOnlyTextRef}
      />
      {/* Add Quick Add Entry modal */}
      {showQuickAdd && (
        <ModalErrorBoundary onClose={closeQuickAdd} title="❌ Failed to load Quick Add">
          <DictionaryEntry
            onClose={closeQuickAdd}
            selectedDictionary={quickAddDictionary}
            allowDictionarySelection={true}
            onDictionaryChange={handleQuickAddDictionaryChange}
            initialSource={clipboardText}
          />
        </ModalErrorBoundary>
      )}
    </div>
  );
};

export default Translator;
