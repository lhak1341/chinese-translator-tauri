import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useReducer,
  startTransition,
} from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { TOAST_DURATIONS, TOAST_IDS } from '../constants/toastConfig';
import { validateElectronResult, validateDictionary } from '../utils/configValidation';
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

  // LOW-2 FIX: Extract shared function for clearing highlights to eliminate code duplication
  const clearHighlighting = useCallback(() => {
    dispatchHighlighting({ type: 'CLEAR_ALL' });
  }, []);

  // IMPORTANT-4 FIX: Clear stale highlight state when semantic arrays change
  // Prevents highlighting indices from previous translation causing errors or wrong highlighting
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

  // State for preserving scroll positions during dictionary reload
  const [isDictionaryReloading, setIsDictionaryReloading] = useState(false);
  const [savedScrollPositions, setSavedScrollPositions] = useState(null);

  // HIGH-1 FIX: Protect against concurrent dictionary reloads
  const [isReloading, setIsReloading] = useState(false);

  // MEDIUM-8 FIX: Timing constants for scroll restoration (eliminates magic numbers)
  const SCROLL_RESTORATION_DELAYS = {
    INITIAL_ATTEMPT: 50, // Single DOM update cycle (16.67ms frame time)
    MAX_RETRY_DELAY: 1000, // Increased from 500ms for large texts (IMPORTANT-4)
    MAX_RETRY_ATTEMPTS: 10, // Increased from 5 for large texts (IMPORTANT-4)
    POST_RELOAD_DELAY: 100, // Allow React state updates to flush
    CLEANUP_DELAY: 200, // Ensure scroll restoration completed before clearing state
  };

  // ISSUE-4 FIX: Timing constant for highlight scroll delay (eliminates magic number)
  // Wait for React state update to complete before scrolling to highlighted element
  const HIGHLIGHT_SCROLL_DELAY_MS = 10;

  // MEDIUM-7 FIX: Shared cleanup function to eliminate duplication
  const cleanupScrollRestoration = useCallback(() => {
    if (scrollRestorationTimeoutRef.current !== null) {
      clearTimeout(scrollRestorationTimeoutRef.current);
      scrollRestorationTimeoutRef.current = null;
    }
    if (scrollRestorationRafRef.current !== null) {
      cancelAnimationFrame(scrollRestorationRafRef.current);
      scrollRestorationRafRef.current = null;
    }
  }, []);

  // CRITICAL FIX: Cleanup timers on component unmount to prevent memory leaks
  // Pattern from CLAUDE.md: "All setInterval/setTimeout must have corresponding clear* in cleanup"
  // Impact: Prevents 50MB+ memory accumulation from timer leaks (documented pattern)
  useEffect(() => {
    return () => {
      cleanupScrollRestoration();
    };
  }, [cleanupScrollRestoration]);

  // Functions to save and restore scroll positions
  const saveScrollPositions = useCallback(() => {
    const positions = {
      original: {
        scrollTop: originalTextRef.current?.scrollTop || 0,
        scrollLeft: originalTextRef.current?.scrollLeft || 0,
      },
      translation: {
        scrollTop: translationTextRef.current?.scrollTop || 0,
        scrollLeft: translationTextRef.current?.scrollLeft || 0,
      },
      characterOnly: {
        scrollTop: characterOnlyTextRef.current?.scrollTop || 0,
        scrollLeft: characterOnlyTextRef.current?.scrollLeft || 0,
      },
    };
    setSavedScrollPositions(positions);
    return positions;
  }, []);

  const restoreScrollPositions = useCallback(
    (positions) => {
      // CRITICAL-2 FIX: Positions parameter is now required (no default to stale state)
      if (!positions) {
        logger.warn('📍 restoreScrollPositions called without positions');
        return Promise.resolve(); // Return resolved promise for consistency
      }

      logger.log('📍 Attempting to restore positions:', positions);

      // MEDIUM-7 FIX: Use shared cleanup function
      cleanupScrollRestoration();

      // Return a Promise that resolves when restoration completes
      return new Promise((resolve) => {
        // Recursive retry with early termination on success
        // IMPORTANT-4 FIX: Increased max attempts (5→10) and delay (500ms→1000ms) for large texts
        const attemptRestore = (
          attemptsLeft = SCROLL_RESTORATION_DELAYS.MAX_RETRY_ATTEMPTS,
          delay = 0
        ) => {
          // Check if all refs are ready with content
          const allRefsReady =
            (!positions.original ||
              (originalTextRef.current && originalTextRef.current.scrollHeight > 0)) &&
            (!positions.translation ||
              (translationTextRef.current && translationTextRef.current.scrollHeight > 0)) &&
            (!positions.characterOnly ||
              (characterOnlyTextRef.current && characterOnlyTextRef.current.scrollHeight > 0));

          if (allRefsReady) {
            // CRITICAL-3 FIX: Wrap DOM manipulation in try-catch
            // IMPORTANT-5 FIX: Clamp scroll positions to valid bounds
            try {
              if (originalTextRef.current && positions.original) {
                const maxScrollTop = Math.max(
                  0,
                  originalTextRef.current.scrollHeight - originalTextRef.current.clientHeight
                );
                const maxScrollLeft = Math.max(
                  0,
                  originalTextRef.current.scrollWidth - originalTextRef.current.clientWidth
                );
                originalTextRef.current.scrollTop = Math.min(
                  positions.original.scrollTop,
                  maxScrollTop
                );
                originalTextRef.current.scrollLeft = Math.min(
                  positions.original.scrollLeft,
                  maxScrollLeft
                );
              }
              if (translationTextRef.current && positions.translation) {
                const maxScrollTop = Math.max(
                  0,
                  translationTextRef.current.scrollHeight - translationTextRef.current.clientHeight
                );
                const maxScrollLeft = Math.max(
                  0,
                  translationTextRef.current.scrollWidth - translationTextRef.current.clientWidth
                );
                translationTextRef.current.scrollTop = Math.min(
                  positions.translation.scrollTop,
                  maxScrollTop
                );
                translationTextRef.current.scrollLeft = Math.min(
                  positions.translation.scrollLeft,
                  maxScrollLeft
                );
              }
              if (characterOnlyTextRef.current && positions.characterOnly) {
                const maxScrollTop = Math.max(
                  0,
                  characterOnlyTextRef.current.scrollHeight -
                    characterOnlyTextRef.current.clientHeight
                );
                const maxScrollLeft = Math.max(
                  0,
                  characterOnlyTextRef.current.scrollWidth -
                    characterOnlyTextRef.current.clientWidth
                );
                characterOnlyTextRef.current.scrollTop = Math.min(
                  positions.characterOnly.scrollTop,
                  maxScrollTop
                );
                characterOnlyTextRef.current.scrollLeft = Math.min(
                  positions.characterOnly.scrollLeft,
                  maxScrollLeft
                );
              }
              logger.log('📍 Scroll positions restored successfully');
            } catch (error) {
              logger.error('❌ Failed to restore scroll positions:', error);
            }
            scrollRestorationTimeoutRef.current = null;
            resolve(); // Resolve promise when restoration completes
          } else if (attemptsLeft > 0) {
            // Retry with exponential backoff (using named constants)
            const nextDelay =
              delay === 0
                ? SCROLL_RESTORATION_DELAYS.INITIAL_ATTEMPT
                : Math.min(delay * 2, SCROLL_RESTORATION_DELAYS.MAX_RETRY_DELAY);
            scrollRestorationTimeoutRef.current = setTimeout(
              () => attemptRestore(attemptsLeft - 1, nextDelay),
              nextDelay
            );
          } else {
            logger.warn(
              `📍 Failed to restore scroll positions after ${SCROLL_RESTORATION_DELAYS.MAX_RETRY_ATTEMPTS} attempts`
            );
            scrollRestorationTimeoutRef.current = null;
            resolve(); // Resolve promise even if restoration failed (don't block cleanup)
          }
        };

        // Start restoration with requestAnimationFrame for immediate attempt
        // Store rAF ID to allow cancellation (MEDIUM-1 FIX)
        scrollRestorationRafRef.current = requestAnimationFrame(() => {
          scrollRestorationRafRef.current = null; // Clear after execution
          attemptRestore();
        });
      });
    },
    [cleanupScrollRestoration, SCROLL_RESTORATION_DELAYS]
  );

  // New optimized engine
  const engineRef = useRef(null);
  // Track in-flight initialization to prevent duplicate engine creation (MEDIUM-1 FIX)
  const isInitializingEngineRef = useRef(false);

  // Refs for auto-scrolling to highlighted elements
  const originalTextRef = useRef(null);
  const translationTextRef = useRef(null);
  const characterOnlyTextRef = useRef(null);

  // Track scroll restoration timeout and rAF for cleanup (MEDIUM-1 FIX)
  const scrollRestorationTimeoutRef = useRef(null);
  const scrollRestorationRafRef = useRef(null);

  // Track previous isDictionaryReloading value to detect reload completion (CRITICAL-1 FIX)
  const prevIsDictionaryReloadingRef = useRef(isDictionaryReloading);

  // Helper function to filter dictionaries based on active configuration
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

  // Load initial configuration on component mount
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

  // Cleanup timers on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // MEDIUM-7 FIX: Use shared cleanup function (eliminates duplication)
      cleanupScrollRestoration();

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

  // Initialize engine once when dictionaries are first loaded
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

  // Monitor WASM status changes
  useEffect(() => {
    if (engineInitialized && engineRef.current?.wasmManager) {
      const checkWasmStatus = () => {
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
      const interval = setInterval(checkWasmStatus, 1000);

      return () => clearInterval(interval);
    }
  }, [engineInitialized, wasmStatus]);

  // Regression health monitoring now handled by usePerformanceMonitoring hook

  // Note: Configuration changes are now handled only during manual reload
  // to prevent constant reinitializations during normal operation

  // Quick Add handlers now provided by useDictionaryConfig hook

  // Handler for semantic array-based segment clicks with auto-scroll
  // Memoized handler for semantic array-based segment clicks with auto-scroll
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
        setTimeout(() => {
          scrollToHighlightedElement(originalTextRef, segmentInfo.unitIndex);
        }, HIGHLIGHT_SCROLL_DELAY_MS);
      } else if (segmentInfo.direction === 'original-to-translation') {
        // Clicked original text, highlight translation text
        dispatchHighlighting({ type: 'HIGHLIGHT_TRANSLATION', unitIndex: segmentInfo.unitIndex });

        // Auto-scroll to highlighted element in translation text after state update
        setTimeout(() => {
          scrollToHighlightedElement(translationTextRef, segmentInfo.unitIndex);
        }, HIGHLIGHT_SCROLL_DELAY_MS);
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
            setTimeout(() => {
              scrollToHighlightedElement(originalTextRef, bestMatch.index);
              scrollToHighlightedElement(translationTextRef, bestMatch.index);
            }, HIGHLIGHT_SCROLL_DELAY_MS);
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
            setTimeout(() => {
              scrollToHighlightedElement(originalTextRef, clampedIndex);
              scrollToHighlightedElement(translationTextRef, clampedIndex);
            }, HIGHLIGHT_SCROLL_DELAY_MS);
          }
        }
      }
    },
    [semanticArrays, characterOnlySemanticArrays]
  ); // Added dependencies for character-only handling

  // Helper function to scroll to a highlighted element
  const scrollToHighlightedElement = (containerRef, unitIndex) => {
    if (!containerRef.current) return;

    // Find the highlighted element within the container
    const highlightedElement = containerRef.current.querySelector(
      '[data-unit-index="' + unitIndex + '"]'
    );

    if (highlightedElement) {
      highlightedElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center', // Center the element in the viewport
        inline: 'nearest',
      });
    }
  };

  // handleQuickAddDictionaryChange now provided by useDictionaryConfig hook

  // Streaming state now managed by useStreamingTranslation hook

  // UI responsiveness optimizations
  // Increased from 100ms to 300ms to reduce GPU rendering pressure
  const debouncedProgressHandler = useRef(new DebouncedProgressHandler(300));
  const smoothLoadingManager = useRef(new SmoothLoadingManager());

  // Bridge: Map between any highlighted text and Character Only
  useEffect(() => {
    // HIGH-1 FIX: Add cleanup function to cancel in-flight operations
    // Prevents race conditions when dependencies change during scoring algorithm
    let cancelled = false;

    if (!semanticArrays || !characterOnlySemanticArrays) return;

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
    return () => {
      cancelled = true;
    };
  }, [
    highlightedUnitIndex,
    highlightedTranslationUnitIndex,
    semanticArrays,
    characterOnlySemanticArrays,
    isCharacterOnlyClick,
  ]);

  // Auto-scroll Character Only text when highlighting changes
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

  // MEDIUM-4 FIX: Monitor cache degradation and alert user
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
    const interval = setInterval(checkCacheHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Track active translation controllers for cancellation
  const activeTranslationControllers = useRef(new Map());

  // CRITICAL-1 FIX: Translation timeout to prevent stuck controllers
  // Each translation gets a timeout that cleans up Map if translation hangs
  const TRANSLATION_TIMEOUT_MS = 60000; // 1 minute max per translation

  // MEDIUM-1 FIX: Clipboard translation debouncing to prevent double-clicks
  const isClipboardBusy = useRef(false);

  // Optimized performance monitoring with reduced overhead
  // updatePerformanceStats now provided by usePerformanceMonitoring hook

  // Update all statistics (optimized - only when advanced stats are visible or when significant changes occur)
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

  // Update semantic array optimization statistics
  const _updateSemanticStats = useCallback(() => {
    if (engineRef.current && engineRef.current.useOptimizedSemanticBuilder) {
      const debugInfo = engineRef.current.semanticArrayBuilder.getDebugInfo();
      const memoryStats = engineRef.current.semanticArrayBuilder.getMemoryStats();

      setSemanticStats({
        enabled: true,
        totalUnits: debugInfo.totalUnits,
        memoryEfficiency: parseFloat(debugInfo.memoryEfficiency),
        regexHitRate: parseFloat(debugInfo.performance.regexHitRate),
        capacityResizes: debugInfo.stats.capacityResizes,
        wastedMemory: Math.round(memoryStats.wastedCapacity / 1024), // KB
      });
    }
  }, []);

  // Define setSemanticStats if needed for advanced stats
  const setSemanticStats = () => {
    // This function exists for compatibility but is not used in the optimized version
  };

  // Clear translation cache
  const _clearCache = useCallback(() => {
    translationSegmentCache.clear();
    updateAllStats();
  }, [updateAllStats]);

  // Character-only translation function - optimized for concurrent execution
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

    try {
      if (engineRef.current && engineRef.current.isReady()) {
        const result = await engineRef.current.translateWithCharactersOnly(text);
        if (result) {
          logger.log(
            `🎯 CHARACTER ONLY TRANSLATION END: ${charOnlyId} - Arrays length: ${result.semanticArrays.original?.length || 0}`
          );
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

  // Main translation function - now with progressive support and streaming
  const translateText = useCallback(
    async (text) => {
      // CRITICAL FIX: Validate input text to prevent memory exhaustion and security issues
      const MAX_TEXT_LENGTH = 500000; // 500KB reasonable limit for translation

      // Validation #1: Check text length
      if (text.length > MAX_TEXT_LENGTH) {
        const sizeKB = (text.length / 1024).toFixed(1);
        const maxKB = (MAX_TEXT_LENGTH / 1024).toFixed(0);
        toast.error(`Text too large: ${sizeKB}KB. Maximum allowed: ${maxKB}KB`, {
          duration: 5000,
        });
        logger.warn(`Translation rejected: text size ${sizeKB}KB exceeds ${maxKB}KB limit`);
        return;
      }

      // Validation #2: Check for control characters (security)
      // Allow: \n (0x0A), \t (0x09), \r (0x0D)
      // Reject: Other control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F)
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
        toast.error('Text contains invalid control characters', {
          duration: 5000,
        });
        logger.warn('Translation rejected: text contains invalid control characters');
        return;
      }

      const translationId = Date.now();
      const translationStartTime = performance.now();
      const abortController = new AbortController();

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

      // Translation tracking for development
      // Register this translation for potential cancellation
      activeTranslationControllers.current.set(translationId, abortController);

      // CRITICAL-1 FIX: Add timeout to prevent stuck controllers
      // If translation hangs (WASM crash, network issue, infinite loop), clean up after timeout
      const controllerTimeoutId = setTimeout(() => {
        if (activeTranslationControllers.current.has(translationId)) {
          logger.warn(
            `⏰ Translation ${translationId} timed out after ${TRANSLATION_TIMEOUT_MS}ms - cleaning up controller`
          );
          abortController.abort();
          activeTranslationControllers.current.delete(translationId);
          setActiveTranslations((prev) => Math.max(0, prev - 1));
        }
      }, TRANSLATION_TIMEOUT_MS);

      setActiveTranslations((prev) => {
        const newCount = prev + 1;
        if (newCount > 3) {
          throw new Error('Too many translations running - please wait');
        }
        return newCount;
      });

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
          let timeoutId;
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

              // Clear timeout since translation completed successfully
              if (timeoutId) {
                clearTimeout(timeoutId);
              }

              // Final update with complete result - flush any pending debounced updates
              debouncedProgressHandler.current.flushUpdates();

              if (segmentResult && segmentResult.semanticArrays) {
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
                  if (!abortController.signal.aborted) {
                    logger.error(`⏰ Optimized engine timeout for translation ${translationId}`);
                    setProgressInfo(null);
                    reject(new Error('Optimized engine timeout'));
                  }
                },
                Math.max(30000, text.length * 100)
              ); // Dynamic timeout: minimum 30s, +100ms per character

              // Cancel timeout if translation is aborted
              abortController.signal.addEventListener('abort', () => {
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
        // CRITICAL-1 FIX: Clear controller timeout
        clearTimeout(controllerTimeoutId);

        // Clean up translation controller
        activeTranslationControllers.current.delete(translationId);

        // Clean up debounced progress handler
        debouncedProgressHandler.current.cleanup();

        // NEW: Always reset streaming state on completion/error
        updateStreaming({
          isStreaming: false,
        });

        setActiveTranslations((prev) => {
          const newCount = prev - 1;
          logger.log(`🏁 Translation ${translationId} finished - Active: ${newCount}`);
          return newCount;
        });
      }
    },
    [isLoading, isDictionaryReloading]
  );

  const _convertTraditionalToSimplified = (_text) => {
    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    let result = _text;
    Object.entries(dictionaries.conversion || {}).forEach(([traditional, simplified]) => {
      const regex = new RegExp(escapeRegExp(traditional), 'g');
      result = result.replace(regex, simplified);
    });
    return result;
  };

  const _convertChineseNumbers = (_text, _enabledSteps = null) => {
    // Add initial debug log
    logger.log('Input text:', _text);

    // Configuration objects
    const numberMap = {
      零: 0,
      一: 1,
      两: 2,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      百: 100,
      千: 1000,
      万: 10000,
      亿: 100000000,
    };

    const preservedUnits = {
      万: 'vạn',
      亿: 'ức',
      千: 'ngàn',
      百: 'trăm',
    };

    const measureWords = new Set([
      '个',
      '條',
      '张',
      '位',
      '件',
      '支',
      '枚',
      '双',
      '州',
      '处',
      '座',
      '层',
      '地',
      '章',
      '节',
      '期',
      '篇',
      '页',
      '口',
      '身',
      '头',
      '面',
      '份',
      '队',
      '对',
      '套',
      '户',
      '家',
      '棵',
      '粒',
      '颗',
      '辆',
      '趟',
      '次',
      '度',
      '遍',
      '回',
      '下',
      '名',
      '道',
      '种',
      '项',
      '级',
    ]);

    const exceptionalCompounds = new Set(['合一', '统一', '唯一', '一致']);

    const nounIndicators = new Set([
      '神',
      '灵',
      '兽',
      '人',
      '主',
      '君',
      '王',
      '后',
      '殿',
      '宫',
      '楼',
      '堂',
      '室',
      '洞',
      '岁',
      '年',
      '月',
      '日',
      '时',
      '分',
      '秒',
    ]);

    const poeticTranslations = {
      千千万万: 'ngàn ngàn vạn vạn',
      千千: 'ngàn ngàn',
      万万: 'vạn vạn',
    };

    const processPercentages = (text) => {
      // Handle 百分之[number] pattern
      return text.replace(
        /(百分之)([一二三四五六七八九十百千万亿]+|[\d,]+)/g,
        (match, prefix, number) => {
          // If the number is already in Arabic numerals, just extract it
          if (/[\d,]+/.test(number)) {
            return `${number.replace(/,/g, '')}%`;
          }

          // Convert Chinese numerals to Arabic
          const value = convertSimpleNumber(number);
          return `${value}%`;
        }
      );
    };

    // Helper functions
    const formatNumber = (num) => {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const convertSimpleNumber = (str) => {
      if (str.includes('零')) {
        const parts = str.split('零');
        let base = convertSimpleNumber(parts[0]) || 0;
        let remainder = parseInt(convertSimpleNumber(parts[1]) || 0);

        if (base >= 100) {
          const magnitude = Math.pow(10, Math.floor(Math.log10(base)));
          return Math.floor(base / magnitude) * magnitude + remainder;
        }
        return parseInt(`${base}${remainder}`);
      }

      let total = 0;
      let section = 0;
      let number = 0;
      let lastNum = 0;

      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const value = numberMap[char];

        if (char === '万' || char === '亿') {
          section = section + number + lastNum;
          if (section === 0) section = 1;
          total += section * value;
          section = number = lastNum = 0;
        } else if (char === '十') {
          if (lastNum === 0) number += 10;
          else number += lastNum * 10;
          lastNum = 0;
        } else if (char === '百' || char === '千') {
          if (lastNum === 0 && char === '百') lastNum = 1;
          number += lastNum * value;
          lastNum = 0;
        } else {
          lastNum = value;
        }
      }

      return total + section + number + lastNum;
    };

    // Processing steps
    const steps = {
      protectCompounds: (text) => {
        let result = text;

        // First protect percentage expressions
        result = processPercentages(result);

        // Then continue with existing compound protection
        exceptionalCompounds.forEach((compound) => {
          if (result.includes(compound)) {
            result = result.replace(
              new RegExp(escapeRegExp(compound), 'g'),
              `__COMPOUND_${compound}__`
            );
          }
        });

        // Protect poetic patterns using keys from poeticTranslations
        Object.keys(poeticTranslations)
          .sort((a, b) => b.length - a.length)
          .forEach((pattern) => {
            if (result.includes(pattern)) {
              // Use index as unique identifier instead of pattern itself
              const marker = `__POETIC${Object.keys(poeticTranslations).indexOf(pattern)}__`;
              result = result.replace(new RegExp(escapeRegExp(pattern), 'g'), marker);
            }
          });

        return result;
      },

      processNumberRanges: (text) => {
        // First handle the specific case of number+number+十 pattern (e.g. 三四十)
        let result = text.replace(
          /([一二三四五六七八九])([一二三四五六七八九])十(?![一二三四五六七八九])/g,
          (match, firstNum, secondNum, offset, string) => {
            // Don't convert if it's part of a larger number
            const prevChar = offset > 0 ? string[offset - 1] : '';
            if (/[一二三四五六七八九十百千万亿]/.test(prevChar)) {
              return match;
            }

            // Convert to range
            const firstNumber = convertSimpleNumber(firstNum + '十'); // e.g., 三十
            const secondNumber = convertSimpleNumber(secondNum + '十'); // e.g., 四十

            if (secondNumber > firstNumber) {
              return `${firstNumber}-${secondNumber}`;
            }
            return match;
          }
        );

        result = result.replace(
          /([十]?[一二三四五六七八九]?十?[一二三四五六七八九]?)([一二三四五六七八九](?!十)|十)(?![一二三四五六七八九])/g,
          (match, firstNum, secondDigit, offset, string) => {
            // Skip if it's part of a larger number or has special context
            const prevChar = offset > 0 ? string[offset - 1] : '';
            const nextChar = string[offset + match.length];

            // Skip if previous character indicates this isn't a range
            if (/[一二三四五六七八九十百千万亿]/.test(prevChar)) {
              return match;
            }

            // Skip if next character indicates this isn't a range
            if (/[一二三四五六七八九十百千万亿]/.test(nextChar)) {
              return match;
            }

            // Check if this is a compound number (like 二十四)
            const isCompoundNumber =
              /^[一二三四五六七八九]?十[一二三四五六七八九]$/.test(match) &&
              !/十[一二三四五六七八九][一二三四五六七八九]$/.test(match);
            if (isCompoundNumber) {
              return match; // Let compound processor handle it
            }

            // Convert the first complete number
            const firstNumber = convertSimpleNumber(firstNum);

            // Special handling for teen numbers (十五六 -> 15-16)
            if (firstNum.startsWith('十')) {
              const baseNumber = 10;
              const secondNumber =
                secondDigit === '十' ? 20 : baseNumber + convertSimpleNumber(secondDigit);

              if (secondNumber > firstNumber && secondNumber <= firstNumber + 10) {
                return `${firstNumber}-${secondNumber}`;
              }
            }

            // Handle cases like 二三 -> 2-3 (simple digit range)
            const isSimpleRange =
              /^[一二三四五六七八九]$/.test(firstNum) && /^[一二三四五六七八九]$/.test(secondDigit);

            // Handle cases starting with compounds (二十五六 -> 25-26)
            const baseNumber = Math.floor(firstNumber / 10) * 10;
            const secondNumber =
              secondDigit === '十'
                ? baseNumber + 10
                : baseNumber + convertSimpleNumber(secondDigit);

            // Check if this is a valid range pattern
            if (
              (isSimpleRange || firstNum.includes('十')) &&
              secondNumber > firstNumber &&
              secondNumber <= firstNumber + 10
            ) {
              return `${firstNumber}-${secondNumber}`;
            }

            // Not a range, leave as is for other processors to handle
            return match;
          }
        );

        return result;
      },

      processCompoundNumbers: (text) => {
        // First, handle complete numbers before 万/亿
        let result = text.replace(
          /([一二三四五六七八九两零]+[千百十]*[一二三四五六七八九两零]*[百十]*[一二三四五六七八九两零]*)[万亿]/g,
          (match, numberPart, _offset, _string) => {
            const unit = match[match.length - 1];
            const value = convertSimpleNumber(numberPart);
            return `${value}${unit}`;
          }
        );

        // Then handle other compound numbers
        return result.replace(
          /[一二三四五六七八九两零]+[千百][一二三四五六七八九两零]*[百]*[一二三四五六七八九两零]*[十]*[一二三四五六七八九两零]*|[一二三四五六七八九两零]*[百][一二三四五六七八九两零十]*|[一二三四五六七八九两零]*[十][一二三四五六七八九两零]*/g,
          (match, offset, string) => {
            const nextChar = string[offset + match.length];
            // Special handling for numbers followed by 万 or 亿
            if (nextChar === '万' || nextChar === '亿') return match;

            // Check what comes before the match
            const prevChar = offset > 0 ? string[offset - 1] : '';
            const needsSpace = prevChar && !/[\s，。？！；：""《》、]/.test(prevChar);

            const number = formatNumber(convertSimpleNumber(match));
            return needsSpace ? ` ${number}` : number;
          }
        );
      },

      processDoubleUnit: (text) => {
        return text.replace(/两[百千万亿]/g, (match, offset, string) => {
          const unit = match[match.length - 1];
          const value = 2 * numberMap[unit];

          if (unit === '万' || unit === '亿') {
            const formattedNumber = formatNumber(value / numberMap[unit]);
            const nextChar = string[offset + match.length];
            // Add extra space if next character is a number
            const needsExtraSpace = nextChar && /[0-9两一二三四五六七八九]/.test(nextChar);
            return `${formattedNumber} ${preservedUnits[unit]}${needsExtraSpace ? ' ' : ''}`;
          }

          return formatNumber(value);
        });
      },

      processLargeNumbers: (text) => {
        // First handle special combinations like 千万
        let _result = text.replace(/(千万)(?![一二三四五六七八九十百千万亿])/g, 'ngàn vạn');

        // Then handle the remaining patterns
        return text.replace(
          /([一二三四五六七八九十百千]+)亿([一二三四五六七八九十百千]+)万|([一二三四五六七八九十百千]+)[万亿]/g,
          (match, billionPart, millionPart, singlePart) => {
            if (match === '百万') return 'trăm vạn';
            if (match === '千万') return 'ngàn vạn';

            if (billionPart && millionPart) {
              // Case: X亿Y万
              const billionNum = convertSimpleNumber(billionPart);
              const millionNum = convertSimpleNumber(millionPart);
              return `${billionNum} ${preservedUnits['亿']} ${formatNumber(
                millionNum
              )} ${preservedUnits['万']}`;
            } else {
              // Case: X万 or X亿
              const unit = match[match.length - 1];
              const value = convertSimpleNumber(singlePart || billionPart);
              return `${value} ${preservedUnits[unit]}`;
            }
          }
        );
      },

      processSimpleCompounds: (text) => {
        // First handle numbers like 三十五 (35)
        let result = text.replace(/[一二三四五六七八九]?十[一二三四五六七八九]/g, (match) =>
          convertSimpleNumber(match).toString()
        );

        // Then handle numbers like 三十 (30)
        result = result.replace(/[一二三四五六七八九]十(?![一二三四五六七八九])/g, (match) =>
          convertSimpleNumber(match).toString()
        );

        // Handle lone 十 as 10 when appropriate
        result = result.replace(/(?<![一二三四五六七八九])十(?![一二三四五六七八九])/g, '10');

        return result;
      },

      processRemainingNumbers: (text) => {
        return text.replace(/[一二三四五六七八九十百千万亿零]+/g, (match, offset, string) => {
          // Skip if next character is a numeral in a range pattern
          const nextChar = string[offset + match.length];
          if (nextChar && /[一二三四五六七八九]/.test(nextChar)) {
            const _possibleRange = match + nextChar;
            // Check if it could be a valid range
            const firstNum = convertSimpleNumber(match);
            const baseNumber = Math.floor(firstNum / 10) * 10;
            const secondNum = baseNumber + convertSimpleNumber(nextChar);
            if (secondNum > firstNum && secondNum <= firstNum + 10) {
              return match;
            }
          }

          if (match === '一') return '一';

          const hasProperNumberStructure =
            /^[二三四五六七八九]/.test(match) ||
            match === '十' ||
            /^十[一二三四五六七八九]/.test(match);

          if (!hasProperNumberStructure) return match;

          const prevChar = offset > 0 ? string[offset - 1] : '';

          if (
            !nextChar ||
            /[\s，。？！；：“”《》、]/.test(nextChar) ||
            measureWords.has(nextChar) ||
            nounIndicators.has(nextChar) ||
            /[的是了在与和与或为到]/.test(nextChar)
          ) {
            const needSpaceBefore = prevChar && !/[\s，。？！；：“”《》、]/.test(prevChar);
            const prefix = needSpaceBefore ? ' ' : '';
            return `${prefix}${convertSimpleNumber(match).toString()}`;
          }
          return match;
        });
      },

      restoreCompounds: (text) => {
        let result = text;

        // Restore exceptional compounds
        exceptionalCompounds.forEach((compound) => {
          result = result.replace(
            new RegExp(`__COMPOUND_${escapeRegExp(compound)}__`, 'g'),
            compound
          );
        });

        // Restore poetic patterns using entries from poeticTranslations
        Object.entries(poeticTranslations)
          .sort(([a], [b]) => b.length - a.length)
          .forEach(([_pattern, translation], index) => {
            const marker = `__POETIC${index}__`;
            result = result.replace(new RegExp(marker, 'g'), translation);
          });

        return result;
      },

      cleanupSpaces: (text) => {
        return text.replace(/ +/g, ' ');
      },
    };

    // Default processing order
    const defaultSteps = [
      'protectCompounds',
      'processNumberRanges',
      'processCompoundNumbers',
      'processSimpleCompounds',
      'processDoubleUnit',
      'processLargeNumbers',
      'processRemainingNumbers',
      'restoreCompounds',
      'cleanupSpaces',
    ];

    // Process text through enabled steps
    const activeSteps = _enabledSteps || defaultSteps;
    let result = _text;

    for (const step of activeSteps) {
      if (steps[step]) {
        const before = result;
        result = steps[step](result);
        logger.log(`After ${step}:`, result);
        // Log if any change occurred
        if (before !== result) {
          logger.log(`${step} made changes`);
        }
      }
    }

    return result;
  };

  // CRITICAL FIX: Cache for merged dictionaries with LRU eviction
  // Prevents unbounded memory growth from dictionary switching
  const dictionaryCache = new Map();
  const MAX_DICTIONARY_CACHE_SIZE = 10; // Limit recent combinations

  const _translateProperNouns = async (_text) => {
    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    let result = _text;
    try {
      // Create cache key from sorted active dictionaries
      const cacheKey = activeProperNouns.sort().join(',');

      // Try to get cached merged dictionary
      let mergedDict = dictionaryCache.get(cacheKey);

      if (!mergedDict) {
        // CRITICAL FIX: LRU eviction to prevent unbounded Map growth
        // Scenario: User has 20 dictionaries, switches between all combinations
        // Possible combinations: 2^20 = 1M+ cache keys × 1MB each = unbounded memory
        // Fix: Limit to 10 most recent combinations using LRU eviction
        if (dictionaryCache.size >= MAX_DICTIONARY_CACHE_SIZE) {
          const firstKey = dictionaryCache.keys().next().value;
          dictionaryCache.delete(firstKey);
          logger.log(
            `🧹 Dictionary cache evicted LRU entry (size: ${dictionaryCache.size}/${MAX_DICTIONARY_CACHE_SIZE})`
          );
        }
        // Sort dictionaries: general properNouns last, others alphabetically
        const sortedDictIds = activeProperNouns.sort((a, b) => {
          if (a === 'properNouns') return 1; // properNouns goes last
          if (b === 'properNouns') return -1; // properNouns goes last
          return a.localeCompare(b); // alphabetical order for others
        });

        logger.log('Dictionary loading order:', sortedDictIds);

        // Load dictionaries in order and merge (SECURITY: validate untrusted file data)
        mergedDict = {};
        for (const dictId of sortedDictIds) {
          let dict;
          if (dictId === 'properNouns') {
            // Validate in-memory dictionary
            dict = validateDictionary(dictionaries.properNouns || {}, dictId);
          } else {
            // Load from file and validate
            try {
              const rawResult = await window.electronAPI.loadDictionary(dictId);
              const loadResult = validateElectronResult(rawResult, `loadDictionary(${dictId})`);

              if (loadResult.success && loadResult.data) {
                dict = validateDictionary(loadResult.data, dictId);
              } else {
                logger.warn(
                  `Failed to load dictionary "${dictId}": ${loadResult.error || 'Unknown error'}, skipping`
                );
                dict = {};
              }
            } catch (error) {
              logger.error(`Error loading dictionary "${dictId}":`, error);
              dict = {};
            }
          }

          // Only add entries that don't already exist
          for (const [key, value] of Object.entries(dict)) {
            if (!Object.prototype.hasOwnProperty.call(mergedDict, key)) {
              mergedDict[key] = value;
            }
          }
        }

        // Cache the result
        dictionaryCache.set(cacheKey, mergedDict);
        logger.log('Created and cached merged dictionary');
      } else {
        logger.log('Using cached merged dictionary');
      }

      // Sort entries by length (longest first) for overlapping handling
      const sortedEntries = Object.entries(mergedDict).sort(([a], [b]) => b.length - a.length);

      // Apply translations with space handling
      for (const [chinese, vietnamese] of sortedEntries) {
        const regex = new RegExp(escapeRegExp(chinese), 'g');
        result = result.replace(regex, (match, offset, string) => {
          // Check if we need space before
          const needSpaceBefore = offset > 0 && !/[\s\p{P}]$/u.test(string.slice(0, offset));

          // Check if we need space after
          const needSpaceAfter =
            offset + match.length < string.length &&
            !/^[\s\p{P}]/u.test(string.slice(offset + match.length));

          return `${needSpaceBefore ? ' ' : ''}${vietnamese}${needSpaceAfter ? ' ' : ''}`;
        });
      }
    } catch (_error) {
      logger.error('Error in translateProperNouns:', _error);
    }
    return result;
  };

  const _translatePhrases = (_text) => {
    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    };

    let result = _text;

    // Sort phrases by length (longest first)
    const sortedPhrases = Object.entries(dictionaries.phrases || {}).sort(
      ([a], [b]) => b.length - a.length
    );

    for (const [chinese, vietnamese] of sortedPhrases) {
      // Remove Latin character check since translateProperNouns handles it
      const regex = new RegExp(escapeRegExp(chinese), 'g');

      // Context-aware space handling
      result = result.replace(regex, (match, offset, string) => {
        // Check if we need space before (if previous char isn't space or punctuation)
        const needSpaceBefore = offset > 0 && !/[\s\p{P}]$/u.test(string.slice(0, offset));

        // Check if we need space after (if next char isn't space or punctuation)
        const needSpaceAfter =
          offset + match.length < string.length &&
          !/^[\s\p{P}]/u.test(string.slice(offset + match.length));

        // Use the translation exactly as it appears in the dictionary
        return `${needSpaceBefore ? ' ' : ''}${vietnamese}${needSpaceAfter ? ' ' : ''}`;
      });
    }

    return result;
  };

  const _translateCharacters = (_text) => {
    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    };

    let result = _text;
    Object.entries(dictionaries.characters || {}).forEach(([chinese, vietnamese]) => {
      // Create a regex that handles potential spaces around the Chinese text
      const regex = new RegExp(`${escapeRegExp(chinese)}`, 'g');

      // For text containing Latin characters, preserve exactly
      if (/[A-Za-z]+/.test(chinese)) {
        result = result.replace(regex, chinese);
        return;
      }

      // Replace with spaces only if needed for word separation
      result = result.replace(regex, ` ${vietnamese.toLowerCase()} `);
    });
    return result;
  };

  const _convertPunctuation = (_text) => {
    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    };

    logger.log('Initial text:', _text);

    let result = _text;

    // Handle fullwidth ellipsis (……) first and more specifically
    result = result.replace(/……/g, '...');

    // Then handle other punctuation
    Object.entries(dictionaries.punctuation || {}).forEach(([chinese, latin]) => {
      if (chinese !== '……') {
        // Skip ellipsis since we already handled it
        const regex = new RegExp(escapeRegExp(chinese), 'g');
        result = result.replace(regex, latin);
      }
    });

    logger.log('After all punctuation:', result);
    return result;
  };

  const _cleanupFormatting = (_text) => {
    logger.log('Starting cleanupFormatting with:', _text);

    // Split the text into lines while preserving empty lines for formatting
    const lines = _text.split(/\r?\n/);

    return lines
      .map((line) => {
        // Preserve empty lines by returning an empty string
        if (!line.trim()) return '';

        let processedLine = line;
        logger.log('Processing line:', processedLine);

        // STEP 1: Protect decimal numbers first
        // This prevents decimal numbers like "3.14" from being affected by punctuation handling
        const numberMatches = [];
        processedLine = processedLine.replace(/\d+\s*\.\s*\d+/g, (match) => {
          const cleanNumber = match.replace(/\s+/g, '');
          numberMatches.push(cleanNumber);
          return `__NUMBER${numberMatches.length - 1}__`;
        });

        // STEP 2: Protect ellipsis from being broken up or having spaces added
        // Convert to a marker that won't be affected by other formatting steps
        processedLine = processedLine.replace(/\.\.\./g, '__ELLIPSIS__');

        // STEP 3: Clean up general spacing
        // This normalizes all multiple spaces into single spaces
        processedLine = processedLine.replace(/\s+/g, ' ').trim();

        // Step 4: Fix spaces around quotes
        processedLine = processedLine.replace(/“ +/g, '“');
        processedLine = processedLine.replace(/‘ +/g, '‘');
        processedLine = processedLine.replace(/ +”/g, '”');
        processedLine = processedLine.replace(/ +’/g, '’');
        processedLine = processedLine.replace(/(["”’])(["“‘])/g, '$1 $2');

        // Handle curly quotes using Unicode escapes (Claude Code cannot output them directly)
        processedLine = processedLine.replace(/\u201c +/g, '\u201c'); // Left curly quote
        processedLine = processedLine.replace(/\u201d +/g, '\u201d'); // Right curly quote
        processedLine = processedLine.replace(/ +\u201c/g, '\u201c'); // Left curly quote
        processedLine = processedLine.replace(/ +\u201d/g, '\u201d'); // Right curly quote

        // Special case: Add space between colon and opening curly quote
        processedLine = processedLine.replace(/:\u201c/g, ': \u201c');

        // STEP 5: Fix spaces around punctuation including parentheses
        processedLine = processedLine
          // Protect numbers with commas first (like 1,000)
          .replace(/(\d+)\s*,\s*(\d+)/g, '$1,$2')
          // Handle opening/closing brackets/parentheses
          .replace(/\s*([([])\s*/g, ' $1')
          .replace(/\s*([)\]])\s*/g, '$1 ')
          // Handle commas not in numbers
          .replace(/(?<!\d)\s*,\s*/g, ', ')
          // Handle other punctuation marks
          .replace(/\s+([.!?:;])(?!\.)/g, '$1')
          .replace(/([.!?:;])(?!\.)(\S)/g, '$1 $2');

        // STEP 6: Clean up any double spaces that might have been created
        processedLine = processedLine.replace(/\s{2,}/g, ' ').trim();

        // STEP 7: Restore protected numbers
        numberMatches.forEach((number, index) => {
          processedLine = processedLine.replace(`__NUMBER${index}__`, number);
        });

        // STEP 8: Restore ellipsis and ensure no spaces around it
        processedLine = processedLine
          .replace(/__ELLIPSIS__/g, '...')
          // Remove any spaces that might have gotten between text and ellipsis
          .replace(/\s*\.\.\.\s*/g, '...');
        logger.log('After ellipsis:', processedLine);

        // STEP 9: Capitalize first word of each sentence
        // Split the line into sentences, handling both spaced and non-spaced punctuation
        const sentences = processedLine.split(/(?<=[.!?])\s*/);
        logger.log('Split sentences:', sentences);

        processedLine = sentences
          .map((sentence) => {
            if (!sentence.trim()) return sentence;
            logger.log('Processing sentence:', sentence);

            // Only capitalize if the sentence doesn't start with a number
            if (!/^\d/.test(sentence.trim())) {
              const preservedUnits = new Set(['ức', 'vạn', 'ngàn', 'trăm']);
              return sentence.replace(
                /^(-?\s*)([^a-zà-ỹ\s]*)([a-zà-ỹ]+)/i,
                (match, hyphen, prefix, word) => {
                  logger.log('Capitalization match:', {
                    match,
                    hyphen,
                    prefix,
                    word,
                  });
                  // Don't capitalize if the word is a preserved unit or follows a number
                  const startsWithNumber = /\d/.test(prefix);
                  if (startsWithNumber && preservedUnits.has(word.toLowerCase())) {
                    return `${hyphen || ''}${prefix}${word.toLowerCase()}`;
                  }
                  // Ensure proper spacing after hyphen
                  const spacing = hyphen ? (hyphen.endsWith(' ') ? '' : ' ') : '';
                  return `${
                    hyphen || ''
                  }${spacing}${prefix}${word[0].toUpperCase()}${word.slice(1)}`;
                }
              );
            }
            return sentence;
          })
          .join(' ');
        logger.log('Final processed line:', processedLine);

        return processedLine;
      })
      .join('\n');
  };

  // Combined effect for configuration loading and translation
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

            // Show success notification for large translations (>1000 chars input)
            if (inputText.length > 1000) {
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
      } catch (_error) {
        logger.error('Failed to load configuration:', _error);
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

  // Memoized clipboard translation handler
  const handleTranslateFromClipboard = useCallback(async () => {
    // MEDIUM-1 FIX: Prevent concurrent clipboard translations
    if (isClipboardBusy.current) {
      logger.log('Clipboard translation already in progress - ignoring duplicate call');
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
    } catch (_err) {
      logger.error('Failed to read clipboard:', _err);
    } finally {
      // Reset busy flag after short delay to allow translation to start
      setTimeout(() => {
        isClipboardBusy.current = false;
      }, 500);
    }
  }, []); // No dependencies - only uses setters which are stable

  // Reload Dictionary handler to clear all caches, reload dictionaries from storage, and reinitialize engine
  const handleForceReload = useCallback(async () => {
    // HIGH-1 FIX: Prevent concurrent dictionary reloads
    if (isReloading) {
      logger.warn('🛑 Reload already in progress - ignoring duplicate call');
      toast.warning('Dictionary reload already in progress');
      return;
    }

    setIsReloading(true);
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
      const activeControllers = Array.from(activeTranslationControllers.current.values());
      if (activeControllers.length > 0) {
        logger.log(`🛑 Cancelling ${activeControllers.length} active translations...`);
        activeControllers.forEach((controller) => controller.abort());

        // CRITICAL: Wait for translations to actually finish before destroying engine
        // Why: Abort signal doesn't immediately stop async operations
        // Race condition: Translation's finally block may try to access engineRef.current.getEngineStats()
        // Fix: Wait up to 5 seconds for translations to complete cleanup
        const maxWaitMs = 5000;
        const startWait = Date.now();
        while (
          activeTranslationControllers.current.size > 0 &&
          Date.now() - startWait < maxWaitMs
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (activeTranslationControllers.current.size > 0) {
          logger.warn(
            `⚠️ ${activeTranslationControllers.current.size} translations did not complete in time - proceeding with reload`
          );
          activeTranslationControllers.current.clear();
        } else {
          logger.log('✅ All translations completed cleanup successfully');
        }
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

      // HIGH-3 FIX: Parallelize dictionary loading for 8x speedup
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

      // Process results
      const freshDictionaries = {};
      let successCount = 0;
      results.forEach(({ dictId, data, success, entryCount }) => {
        if (success) {
          freshDictionaries[dictId] = data;
          successCount++;
          logger.log(`✅ Loaded ${dictId}: ${entryCount} entries`);
        }
      });

      logger.log(`📥 Loaded ${successCount}/${allDictionaryIds.length} dictionaries in parallel`);

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
    } catch (_error) {
      logger.error('❌ Reload Dictionary failed:', _error);
      const unexpectedErrorMessage =
        '❌ Reload Dictionary failed!\n\nUnexpected error: ' + _error.message;
      setTranslatedText(unexpectedErrorMessage);
      toast.error(`Dictionary reload failed: ${_error.message}`);
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
        setSavedScrollPositions(null);
        logger.log('🔄 Dictionary reload complete - flag reset after scroll restoration');

        // HIGH-1 FIX: Reset concurrent reload protection after complete
        setIsReloading(false);
      }, SCROLL_RESTORATION_DELAYS.POST_RELOAD_DELAY);
    }
  }, [
    inputText,
    activeProperNouns,
    dictionaries,
    getFilteredDictionaries,
    isLoading,
    isReloading,
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

  const _processInputText = (text) => {
    if (!text) return <div>Chinese text</div>;

    // Split text into paragraphs using one or more blank lines as separator
    const paragraphs = text.split(/\n\n+/);

    return paragraphs.map((paragraph, index) => (
      <div key={index} className={styles.paragraph}>
        {/* Split each paragraph into lines and preserve single line breaks */}
        {paragraph.split('\n').map((line, lineIndex) => (
          <div key={`${index}-${lineIndex}`} className={styles.textLine}>
            {line || '\u00A0'} {/* Use non-breaking space for empty lines */}
          </div>
        ))}
      </div>
    ));
  };

  const _processTranslatedText = (text) => {
    if (!text) return <div>Translation</div>;

    const paragraphs = text.split(/\n\n+/); // Split by one or more blank lines

    return paragraphs.map((paragraph, index) => (
      <div key={index} className={styles.translatedParagraph}>
        {paragraph.split('\n').map((line, lineIndex) => (
          <div key={`${index}-${lineIndex}`} className={styles.textLine}>
            {line || '\u00A0'} {/* Use non-breaking space for empty lines */}
          </div>
        ))}
      </div>
    ));
  };

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

      <TranslatorControls
        handleTranslateFromClipboard={handleTranslateFromClipboard}
        handleQuickAddProperNoun={handleQuickAddProperNoun}
        handleForceReload={handleForceReload}
        isLoading={isLoading}
        isReloading={isReloading}
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
        <ModalErrorBoundary onClose={closeQuickAdd}>
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
