import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { TranslationInputValidator } from '../utils/TranslationInputValidator';
import { useScrollPositionManager } from '../hooks/useScrollPositionManager';
import { useTranslationController } from '../hooks/useTranslationController';
import { TOAST_DURATIONS, TOAST_IDS } from '../constants/toastConfig';
import { UI_TIMEOUTS } from '../constants/TranslationConstants';
import { useDictionary } from './dictionary/DictionaryContext';
import { registerDictionaryReload } from '../utils/dictionary';
import HotkeyHandler from './HotkeyHandler';
import TranslatorControls from './translator/TranslatorControls';
import TranslatorDisplayPanels from './translator/TranslatorDisplayPanels';
import { useEngine } from './EngineContext';
import AppReadinessOverlay from './AppReadinessOverlay';
import {
  scheduleHighlightScroll,
  findCharacterOnlyMatch,
  HIGHLIGHT_SCROLL_DELAY_MS,
} from '../utils/highlighting';
import { DebouncedProgressHandler } from '../utils/ui';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { useStreamingTranslation } from '../hooks/useStreamingTranslation';
import styles from '../styles/Translator.module.css';
import { useDictionaryModals } from '../hooks/useDictionaryModals';
import { useSelectionMapper } from '../hooks/useSelectionMapper';
import { mapTranslatorSelection } from '../utils/highlighting/SelectionMapping';
import { useCachePoisoningGuard } from '../hooks/useCachePoisoningGuard';
import { useDictionaryReloadGuard } from '../hooks/useDictionaryReloadGuard';
import { useCharacterOnlyBridge } from '../hooks/useCharacterOnlyBridge';
import { useClipboardTranslation } from '../hooks/useClipboardTranslation';
import { useTranslationResults } from '../hooks/useTranslationResults';
import { useHighlightingState } from '../hooks/useHighlightingState';
import { useAutoTranslateTrigger } from '../hooks/useAutoTranslateTrigger';
import { useForceReload } from '../hooks/useForceReload';
import { useDeferredRetranslate } from '../hooks/useDeferredRetranslate';
import { useReloadRetranslate } from '../hooks/useReloadRetranslate';
import { useForceReloadContext } from '../hooks/useReloadExecutionContexts';
import { installDevConsole } from '../utils/__devtools__/DevConsole.js';

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
 *   ScrollPosition,
 *   SavedScrollPositions,
 *   StreamingTranslationState,
 *   ProgressInfo,
 *   PerformanceStats,
 *   RegressionHealthStatus,
 *   AdvancedPerformanceStats
 * } from '../types/TranslationEngineTypes'
 */

/**
 * @import { SegmentClickPayload } from '../types/ClickableTypes'
 */

// ============================================================================
// SECTION 1: STATE MANAGEMENT UTILITIES
// ============================================================================
// Purpose: Reducers and pure state transformation functions
// Extraction Status: ✅ ALL EXTRACTED
// - highlightingReducer → src/reducers/highlightingReducer.js (68 lines)
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
//
// Hook Call-Order Dependencies (why reordering hook calls below can silently break things):
//   - useHighlightingState(semanticArrays) requires useTranslationResults to run first
//   - useCharacterOnlyBridge requires useTranslationResults + useHighlightingState (both
//     several hooks earlier) — consumes their destructured fields directly
//   - useClipboardTranslation requires useDictionaryReloadGuard + useHighlightingState
//   - executionCtx (plain object literal — see useAutoTranslateTrigger.ts's own dev-only
//     shape guard) fans in from 5 earlier hooks:
//     useDictionaryReloadGuard, useHighlightingState, useTranslationResults,
//     useClipboardTranslation, plus 2 raw refs — then useAutoTranslateTrigger consumes it
//   - useReloadRetranslate requires useEngine()'s engineRef
//   - forceReloadCtx (useForceReloadContext) is the biggest fan-in: useEngine(),
//     useTranslationController, useStreamingTranslation, useTranslationResults,
//     useDictionaryReloadGuard, useHighlightingState, useReloadRetranslate,
//     useScrollPositionManager — then useForceReload consumes it
//   Net effect: nearly every hook above exists to eventually feed forceReloadCtx/
//   useForceReload at the end of the setup section.
// ============================================================================

const Translator = ({ isActive = true }) => {
  const { isLoading, loadError, reloadAllDictionaries, registerCacheInvalidator } = useDictionary();

  // Performance monitoring hook (extracted)
  const { report, recordTranslation, refreshReport } = usePerformanceMonitoring();

  // Streaming translation hook (extracted)
  const {
    progressInfo,
    partialSemanticArrays,
    throttledStreamingState,
    updateStreaming,
    setProgressInfo,
    setPartialSemanticArrays,
  } = useStreamingTranslation(100); // 100ms throttle

  // Quick Add modal hook. The view comes from the binding provider, so while a Reader book is
  // open the Translator's Adds file its fiction entries under that book's dictionary too.
  const { handlers: quickAddHandlers, dialog: quickAddDialog } = useDictionaryModals();

  const [inputText, setInputText] = useState('');
  const {
    translatedText,
    characterOnlyText,
    semanticArrays,
    characterOnlySemanticArrays,
    prebuiltSegments,
    setStreamingText,
    setResultArrays,
    setDualResults,
    setCharOnlyResult,
    setStatusMessage,
    setError: setTranslationError,
    clearFullResult,
  } = useTranslationResults();

  const {
    highlighting,
    highlightOriginal: _highlightOriginal,
    highlightTranslation,
    highlightBoth,
    highlightFromCharacterOnly,
    setCharacterOnlyIndex,
    clearHighlighting,
    validateSemanticArraySize,
  } = useHighlightingState(semanticArrays);

  // Destructure for easier access (maintains backward compatibility with existing code)
  const {
    unitIndex: highlightedUnitIndex,
    translationUnitIndex: highlightedTranslationUnitIndex,
    characterOnlyUnitIndex: highlightedCharacterOnlyUnitIndex,
    isCharacterOnlyClick,
  } = highlighting;
  const [isTranslating, setIsTranslating] = useState(false);
  const isTranslatingRef = useRef(false);
  const {
    enginePhase,
    engineRef,
    initError: initializationError,
    reinitializeEngine,
  } = useEngine();
  const [activeTranslations, setActiveTranslations] = useState(0);
  const { poisoning, dismiss: dismissCachePoisoning } = useCachePoisoningGuard();

  // Refs for auto-scrolling to highlighted elements
  const originalTextRef = useRef(null);
  const translationTextRef = useRef(null);
  const characterOnlyTextRef = useRef(null);

  // Cmd-1..7 over a Full Translation selection add the Chinese it came from.
  useSelectionMapper((range) =>
    mapTranslatorSelection(range, translationTextRef.current, inputText, semanticArrays)
  );

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

  const { isDictionaryReloading, setDictionaryReloading, consumeReloadTransition } =
    useDictionaryReloadGuard();

  // Track highlight scroll timeout for cleanup (CODE REVIEW FIX: prevent memory leak)
  const highlightScrollTimeoutRef = useRef(null);

  // CODE REVIEW FIX: Track component mount status to prevent state updates after unmount
  const isMountedRef = useRef(true);

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
    };
  }, [cleanupScrollRestoration]);

  useEffect(() => {
    if (enginePhase !== 'ready' || !engineRef.current) {
      registerCacheInvalidator(null);
      return;
    }
    debouncedProgressHandler.current.setCallbacks({
      onProgressUpdate: setProgressInfo,
      onTranslationUpdate: setStreamingText,
    });
    registerCacheInvalidator((id) => engineRef.current?.invalidateDictionaryCaches(id));
    if (process.env.NODE_ENV === 'development') {
      installDevConsole(engineRef.current);
    }
  }, [enginePhase, registerCacheInvalidator]);

  useEffect(() => {
    if (enginePhase !== 'error' || !initializationError) return;
    toast.error(
      `Engine initialization failed: ${initializationError}. Try reloading dictionaries.`,
      {
        duration: TOAST_DURATIONS.CRITICAL,
      }
    );
  }, [enginePhase, initializationError]);

  // Regression health monitoring now handled by usePerformanceMonitoring hook

  // Note: Configuration changes are now handled only during manual reload
  // to prevent constant reinitializations during normal operation

  /**
   * Handles clickable highlighting - bidirectional mapping between translation panels
   *
   * User action: Click any segment in Original, Full Translation, or Character Only panels
   *
   * This is one of TWO triggers into the highlighting reducer — see CONTEXT.md's
   * "Click-to-Highlight Lifecycle" entry for the full 7-file story, including the second,
   * independent effect-driven trigger (useCharacterOnlyBridge) that fires on ANY change to
   * unitIndex/translationUnitIndex, not just clicks routed through this handler.
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
   *   unitIndex: 10
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
        highlightBoth(segmentInfo.unitIndex);

        // Auto-scroll to highlighted element in original text after state update
        scheduleHighlightScroll(
          highlightScrollTimeoutRef,
          isMountedRef,
          [originalTextRef],
          segmentInfo.unitIndex,
          HIGHLIGHT_SCROLL_DELAY_MS
        );
      } else if (segmentInfo.direction === 'original-to-translation') {
        // Clicked original text, highlight translation text
        highlightTranslation(segmentInfo.unitIndex);

        // Auto-scroll to highlighted element in translation text after state update
        scheduleHighlightScroll(
          highlightScrollTimeoutRef,
          isMountedRef,
          [translationTextRef],
          segmentInfo.unitIndex,
          HIGHLIGHT_SCROLL_DELAY_MS
        );
      } else if (segmentInfo.direction === 'character-only-to-original') {
        // Clicked character-only text, highlight original text and full translation.
        // Reverse direction of the Full Translation/Original → Character Only bridge
        // (useCharacterOnlyBridge.ts) — findCharacterOnlyMatch is already symmetric in
        // its (sourceIndex, sourceArrays, targetArrays) params, so the same scored
        // occurrence-matching algorithm (with its MAX_MATCHES cap) applies here with
        // source/target simply swapped.
        if (semanticArrays && semanticArrays.original && characterOnlySemanticArrays) {
          const matchIndices = findCharacterOnlyMatch(
            segmentInfo.unitIndex,
            characterOnlySemanticArrays,
            semanticArrays
          );

          if (matchIndices) {
            const targetIndex = matchIndices[0];

            // Set highlighting for both Chinese Text and Full Translation (from character-only click)
            highlightFromCharacterOnly(targetIndex);

            // Auto-scroll to highlighted elements
            scheduleHighlightScroll(
              highlightScrollTimeoutRef,
              isMountedRef,
              [originalTextRef, translationTextRef],
              targetIndex,
              HIGHLIGHT_SCROLL_DELAY_MS
            );
          } else {
            logger.warn(
              `⚠️ No match found for character-only unit ${segmentInfo.unitIndex} in Chinese Text — clearing highlight`
            );
            highlightFromCharacterOnly(-1);
          }
        }
      }
    },
    [semanticArrays, characterOnlySemanticArrays]
  ); // Added dependencies for character-only handling

  // Helper function to scroll to a highlighted element

  // Streaming state now managed by useStreamingTranslation hook

  // UI responsiveness optimizations
  // Increased from 100ms to 300ms to reduce GPU rendering pressure
  const debouncedProgressHandler = useRef(new DebouncedProgressHandler(300));

  useCharacterOnlyBridge({
    unitIndex: highlightedUnitIndex,
    translationUnitIndex: highlightedTranslationUnitIndex,
    characterOnlyUnitIndex: highlightedCharacterOnlyUnitIndex,
    isCharacterOnlyClick,
    semanticArrays,
    characterOnlySemanticArrays,
    setCharacterOnlyIndex,
    characterOnlyTextRef,
  });

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

  const { isClipboardTranslationRef, resetClipboardFlag, handleTranslateFromClipboard } =
    useClipboardTranslation({
      setInputText,
      isDictionaryReloading,
      clearHighlighting,
      originalTextRef,
    });

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
    logger.debug(
      '[char-translation]',
      `CHARACTER ONLY TRANSLATION START: ${charOnlyId} (${text.length} chars)`
    );

    if (!text || !text.trim()) {
      setCharOnlyResult('', null);
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
          } catch {
            // Validation error already logged and toasted in validateSemanticArraySize
            return;
          }
          // Use requestAnimationFrame for smooth UI updates during parallel processing
          requestAnimationFrame(() => {
            setCharOnlyResult(result.translatedText, result.semanticArrays);
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
      const { controller: abortController, timeoutId: controllerTimeoutId } =
        createTranslationController();

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
                } catch {
                  // Validation error already logged and toasted in validateSemanticArraySize
                  // Clear translation state on overflow
                  clearFullResult();
                  return;
                }

                setResultArrays(segmentResult.semanticArrays, segmentResult.prebuiltSegments || []);
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
                    logger.error('⏰ Optimized engine timeout');
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

          // Update performance stats
          const translationTimeMs = performance.now() - translationStartTime;
          recordTranslation(translationTimeMs);

          return result;
        } else {
          // Engine not ready - return original text with message
          logger.error('❌ Translation failed: Engine not ready');
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
            logger.log(`🏁 Translation finished - Active: ${newCount}`);
            return newCount;
          });

          // Small delay to ensure state updates are processed
          await new Promise((resolve) => setTimeout(resolve, 0));
        })();

        // Clean up translation controller and pass cleanup promise for tracking
        cleanupTranslationController(controllerTimeoutId, cleanupWork);
      }
    },
    [isLoading, isDictionaryReloading]
  );

  const executionCtx = {
    consumeReloadTransition,
    clearHighlighting,
    setIsTranslating,
    isTranslatingRef,
    setResultArrays,
    setStreamingText,
    isClipboardTranslationRef,
    resetClipboardFlag,
    translationTextRef,
  };

  useAutoTranslateTrigger({
    inputText,
    isLoading,
    isDictionaryReloading,
    translateText,
    translateCharacterOnly,
    ctx: executionCtx,
  });

  const retranslate = useReloadRetranslate({
    engineRef,
    validateSemanticArraySize,
    setDualResults,
    refreshReport,
    translateText,
    translateCharacterOnly,
    setStreamingText,
  });

  const forceReloadCtx = useForceReloadContext({
    engineRef,
    cancelAllTranslations,
    isTranslatingRef,
    setIsTranslating,
    setProgressInfo,
    setStatusMessage,
    setTranslationError,
    setDictionaryReloading,
    clearHighlighting,
    reinitializeEngine,
    retranslate,
    saveScrollPositions,
    restoreScrollPositions,
  });

  const handleForceReload = useForceReload(
    forceReloadCtx,
    isDictionaryReloading,
    inputText,
    isLoading,
    reloadAllDictionaries
  );

  // Redo this tab's own translation when it is next shown, rather than during a reload
  // triggered from the Reader — see the hook for why the work is moved and not dropped.
  const { defer: deferRetranslate } = useDeferredRetranslate({
    isActive,
    inputText,
    retranslate,
  });

  // The Reader's version of the reload: the same action, minus the step that re-translates
  // *this* tab's hidden input. That step is the single most expensive thing a
  // Reader-triggered reload used to do, and it also put a second caller on the engine while
  // the Reader's own chunk fill was running — which `BookReader`'s engine queue is
  // explicitly documented as assuming cannot happen.
  const handleReaderReload = useCallback(async () => {
    deferRetranslate();
    await handleForceReload({ retranslateInput: false });
  }, [deferRetranslate, handleForceReload]);

  // Publish the reload so the Reader's Cmd/Ctrl+R triggers *this* action rather than a
  // second implementation of it — see DictionaryReloadRegistry for why it's a registry
  // and not a context.
  useEffect(() => {
    registerDictionaryReload(handleReaderReload);
    return () => registerDictionaryReload(null);
  }, [handleReaderReload]);

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

  // App-readiness overlay visible until dictionaries + engine are ready.
  // Stays visible on initializationError so users can't interact with a broken engine.
  const showReadinessOverlay = !loadError && (isLoading || enginePhase !== 'ready');

  return (
    <div className={styles.container}>
      <HotkeyHandler
        handlers={{
          translateFromClipboard: handleTranslateFromClipboard,
          ...quickAddHandlers,
          reloadDictionary: handleForceReload,
        }}
        ownTab="translator"
      />

      {showReadinessOverlay && (
        <AppReadinessOverlay
          dictLoading={isLoading}
          engineInitializing={!isLoading && enginePhase !== 'ready'}
        />
      )}

      {/* Surface dictionary load failure when the engine cannot initialize.
          DictionaryContext's loadInitialState fires once on mount (deps `[]`), so
          a partial reload (handleForceReload) cannot re-trigger it — recovery
          requires a full app reload to remount the provider. */}
      {loadError && (
        <div className={styles.errorBanner} role="alert">
          <div className={styles.errorHeader}>
            <strong className={styles.errorTitle}>⚠️ Dictionary Load Failed</strong>
          </div>
          <div className={styles.errorMessage}>{loadError}</div>
          <div className={styles.errorActions}>
            <button onClick={() => window.location.reload()} className={styles.errorButton}>
              Reload App
            </button>
          </div>
        </div>
      )}

      {/* CRITICAL-3 FIX: Show initialization error banner */}
      {initializationError && (
        <div className={styles.errorBanner} role="alert">
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

      {poisoning !== null && (
        <div className={styles.criticalWarningBanner} role="alert">
          <div className={styles.errorHeader}>
            <strong className={styles.errorTitle}>🚨 Critical: Dictionary Cache Corruption</strong>
          </div>
          <div className={styles.errorMessage}>
            Dictionary cache corruption has been detected ({poisoning.count} event(s)). This may
            cause incorrect translations or degraded performance.
          </div>
          <div className={styles.errorMessage}>
            <strong>Recommended action:</strong>{' '}
            {poisoning.recommendation ||
              'Save your work and restart the application to ensure data integrity.'}
          </div>
          <div className={styles.errorActions}>
            <button onClick={() => window.location.reload()} className={styles.errorButton}>
              Restart Application
            </button>
            <button onClick={dismissCachePoisoning} className={styles.errorButtonSecondary}>
              Dismiss Warning
            </button>
          </div>
        </div>
      )}

      <TranslatorControls
        handleTranslateFromClipboard={handleTranslateFromClipboard}
        handleQuickAddProperNoun={() => quickAddHandlers.quickAddProperNoun()}
        handleForceReload={handleForceReload}
        isLoading={isLoading}
        isReloading={isDictionaryReloading}
        isTranslating={isTranslating}
        progressInfo={progressInfo}
        activeTranslations={activeTranslations}
        performanceStats={report}
        regressionHealth={report}
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
      {quickAddDialog}
    </div>
  );
};

export default Translator;
