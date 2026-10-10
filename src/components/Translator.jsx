import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { validateTranslationInput } from '../utils/TranslationInputValidator';
import { useScrollPositionManager } from '../hooks/useScrollPositionManager';
import { createTranslationRunner, translationTimeoutMs } from '../utils/TranslationRunner';
import { EngineAccessRefusedError } from '../utils/EngineAccess';
import { TOAST_DURATIONS } from '../constants/toastConfig';
import { UI_TIMEOUTS } from '../constants/TranslationConstants';
import { useDictionary } from './dictionary/DictionaryContext';
import { registerDictionaryReload } from '../utils/dictionary';
import HotkeyHandler from './HotkeyHandler';
import TranslatorControls from './translator/TranslatorControls';
import TranslatorDisplayPanels from './translator/TranslatorDisplayPanels';
import { useEngine } from './EngineContext';
import AppReadinessOverlay from './AppReadinessOverlay';
import { DebouncedProgressHandler } from '../utils/ui';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';
import { useStreamingTranslation } from '../hooks/useStreamingTranslation';
import styles from '../styles/Translator.module.css';
import { useDictionaryModals } from '../hooks/useDictionaryModals';
import { useSelectionMapper } from '../hooks/useSelectionMapper';
import { mapTranslatorSelection } from '../utils/highlighting/SelectionMapping';
import { useCachePoisoningGuard } from '../hooks/useCachePoisoningGuard';
import { useDictionaryReloadGuard } from '../hooks/useDictionaryReloadGuard';
import { useClipboardTranslation } from '../hooks/useClipboardTranslation';
import { useTranslationResults } from '../hooks/useTranslationResults';
import { useHighlightInteraction } from '../hooks/useHighlightInteraction';
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
//   - useHighlightInteraction (owns useHighlightingState) requires useTranslationResults to
//     run first, and the three panel refs declared above it
//   - useClipboardTranslation requires useDictionaryReloadGuard + useHighlightInteraction
//   - executionCtx (plain object literal — see useAutoTranslateTrigger.ts's own dev-only
//     shape guard) fans in from 5 earlier hooks:
//     useDictionaryReloadGuard, useHighlightInteraction, useTranslationResults,
//     useClipboardTranslation, plus 2 raw refs — then useAutoTranslateTrigger consumes it
//   - useReloadRetranslate requires useEngine()'s engineRef
//   - forceReloadCtx (useForceReloadContext) is the biggest fan-in: useEngine(),
//     useStreamingTranslation, useTranslationResults,
//     useDictionaryReloadGuard, useHighlightInteraction, useReloadRetranslate,
//     useScrollPositionManager — then useForceReload consumes it
//   Net effect: nearly every hook above exists to eventually feed forceReloadCtx/
//   useForceReload at the end of the setup section.
// ============================================================================

const Translator = ({ isActive }) => {
  const { isLoading, loadError, reloadAllDictionaries, registerCacheInvalidator } = useDictionary();

  // Performance monitoring hook (extracted)
  const { avgTime, recordTranslation } = usePerformanceMonitoring();

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
    setCharOnlyResult,
    setStatusMessage,
    setError: setTranslationError,
    clearFullResult,
  } = useTranslationResults();

  const originalTextRef = useRef(null);
  const translationTextRef = useRef(null);
  const characterOnlyTextRef = useRef(null);
  const { highlighting, handleSemanticSegmentClick, clearHighlighting, validateSemanticArraySize } =
    useHighlightInteraction({
      semanticArrays,
      characterOnlySemanticArrays,
      originalTextRef,
      translationTextRef,
      characterOnlyTextRef,
    });

  // Destructure for easier access (maintains backward compatibility with existing code)
  const {
    unitIndex: highlightedUnitIndex,
    translationUnitIndex: highlightedTranslationUnitIndex,
    characterOnlyUnitIndex: highlightedCharacterOnlyUnitIndex,
  } = highlighting;
  const [isTranslating, setIsTranslating] = useState(false);
  const isTranslatingRef = useRef(false);
  const {
    enginePhase,
    engineRef,
    engineAccess,
    initError: initializationError,
    reinitializeEngine,
    destroyEngine,
  } = useEngine();
  const [activeTranslations, setActiveTranslations] = useState(0);
  const { poisoning, dismiss: dismissCachePoisoning } = useCachePoisoningGuard();

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

  /**
   * Cleanup effect - prevents memory leaks on component unmount
   *
   * Lifecycle: Runs cleanup on unmount
   *
   * Cleanup operations:
   * - Clears scroll restoration timers
   * - Destroys translation segment cache timer
   * - Resets engine initialization flag
   *
   * Critical for preventing memory leaks from timers, intervals, and async operations.
   */
  useEffect(() => {
    return () => {
      // MEDIUM-7 FIX: Use shared cleanup function (eliminates duplication)
      cleanupScrollRestoration();
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

  // Note: Configuration changes are now handled only during manual reload
  // to prevent constant reinitializations during normal operation

  // Streaming state now managed by useStreamingTranslation hook

  // UI responsiveness optimizations
  // Increased from 100ms to 300ms to reduce GPU rendering pressure
  const debouncedProgressHandler = useRef(new DebouncedProgressHandler(300));

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
  // One cancellable, timed translation at a time; also what a dictionary reload cancels and awaits
  const translationRunner = useMemo(() => createTranslationRunner(), []);
  const cancelAllTranslations = translationRunner.cancelAll;
  useEffect(() => () => void translationRunner.cancelAll(), [translationRunner]);

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

    // No reload guard here, on purpose: useReloadRetranslate calls this inside the reload window,
    // before the flag clears. User-driven callers guard themselves (see components/CLAUDE.md).
    try {
      if (engineRef.current && engineRef.current.isReady()) {
        // One call, no `onPreempt`: it is short, so the Reader waits for it.
        const result = await engineAccess.run('translator', (engine) =>
          engine.translateWithCharactersOnly(text)
        );
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
      if (error instanceof EngineAccessRefusedError) {
        // Not the visible tab: nothing is wrong, the Translator redoes it when shown.
        logger.warn('Character-only translation skipped:', error.message);
      } else {
        logger.error('Character-only translation failed:', error);
      }
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
   * @returns {Promise<import('../types/UITypes').TranslateTextOutcome>} `done` with the
   *   Vietnamese text, or `skipped` with a reason when nothing ran (invalid input, reload in
   *   progress, already loading, engine not ready, preempted by the Reader, refused, overflow).
   *   A skip has already toasted or logged; a caller must not show it as a translation.
   *
   * @throws {Error} If translation timeout exceeded, or a newer run cancelled this one
   * @throws {Error} If the engine call itself fails
   *
   * @example
   * // Triggered by input text change
   * const outcome = await translateText("你好世界");
   * if (outcome.status === 'done') setTranslatedText(outcome.text);
   */
  const translateText = useCallback(
    async (text) => {
      // CRITICAL FIX: Validate input text to prevent memory exhaustion and security issues
      const validationResult = validateTranslationInput(text);
      if (!validationResult.valid) {
        toast.error(validationResult.error, { duration: UI_TIMEOUTS.TOAST_DURATION_ERROR });
        logger.warn(`Translation rejected: ${validationResult.error}`);
        return { status: 'skipped', reason: 'invalid' };
      }

      // CODE REVIEW FIX: Prevent translation during dictionary reload (race condition)
      if (isDictionaryReloading) {
        toast.warning('Dictionary reload in progress. Please wait.', {
          duration: 3000,
        });
        logger.warn('Translation rejected: dictionary reload in progress');
        return { status: 'skipped', reason: 'reloading' };
      }

      if (isLoading) {
        return { status: 'skipped', reason: 'loading' };
      }

      if (!engineRef.current || !engineRef.current.isReady()) {
        logger.error('❌ Translation failed: Engine not ready');
        return { status: 'skipped', reason: 'not-ready' };
      }

      const translationStartTime = performance.now();

      // Scroll to beginning immediately when translation starts
      setTimeout(() => {
        if (translationTextRef.current) {
          translationTextRef.current.scrollTop = 0;
          translationTextRef.current.scrollLeft = 0;
        }
      }, 10); // Small delay to ensure any previous content has been cleared

      // Set when the Reader needs the engine and `EngineAccess` cancels this run: the run then
      // ends with a notice instead of an error (Stop and a newer run still cancel silently).
      let preemptedByReader = false;

      // The runner cancels any previous run, owns the timeout and abort, and makes this run's
      // callbacks no-ops once it is cancelled, so a superseded run cannot write over its successor.
      let result;
      try {
        result = await translationRunner.run(
          async ({ signal, guard }) => {
            updateStreaming({
              partialText: '',
              progress: 0,
              isStreaming: true,
              completedChunks: 0,
              totalChunks: 0,
              batchNumber: 0,
              avgTimePerChunk: 0,
            });
            setActiveTranslations(1);

            // A document run is long, so it is preemptible: when the Reader calls the engine,
            // `EngineAccess` cancels this run through the runner and starts the Reader's call
            // once the engine has stopped. The partial text stays on screen.
            const segmentResult = await engineAccess.run(
              'translator',
              (engine) =>
                engine.translateWithSegments(text, {
                  debug: false,
                  progressive: true,
                  abortSignal: signal,
                  onProgress: guard((progressData) => {
                    // Wrap in startTransition to deprioritize rendering updates
                    // This prevents GPU buffer corruption during rapid updates
                    startTransition(() => {
                      // Use debounced progress handler for smoother UI
                      debouncedProgressHandler.current.handleProgress(progressData);
                    });
                  }),
                  onBatchComplete: guard((batchData) => {
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
                  }),
                }),
              {
                onPreempt: () => {
                  preemptedByReader = true;
                  translationRunner.cancelAll();
                },
              }
            );

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
                return { status: 'skipped', reason: 'overflow' };
              }

              setResultArrays(segmentResult.semanticArrays, segmentResult.prebuiltSegments || []);
            }

            // Clear progress info when done
            setProgressInfo(null);

            // Complete streaming and reset state
            updateStreaming({
              isStreaming: false,
              progress: 100,
              partialText: segmentResult.translatedText,
            });

            // Clear partial semantic arrays since we have final ones
            setPartialSemanticArrays(null);

            return { status: 'done', text: segmentResult.translatedText };
          },
          {
            timeoutMs: translationTimeoutMs(text.length),
            // CODE REVIEW FIX (CRITICAL-3): a reload awaits this through cancelAllTranslations()
            cleanup: async ({ superseded }) => {
              // A newer run owns the streaming flags and the progress handler now
              if (!superseded) {
                debouncedProgressHandler.current.cleanup();
                updateStreaming({ isStreaming: false });
                setActiveTranslations(0);
                logger.log('🏁 Translation finished');
              }
              // Small delay to ensure state updates are processed
              await new Promise((resolve) => setTimeout(resolve, 0));
            },
          }
        );
      } catch (error) {
        if (preemptedByReader) {
          toast.warning(
            'Translation paused: the Reader needed the engine. Translate again to finish.',
            {
              duration: UI_TIMEOUTS.TOAST_DURATION_ERROR,
            }
          );
          logger.warn('Translation preempted by the Reader');
          return { status: 'skipped', reason: 'preempted' };
        }
        if (error instanceof EngineAccessRefusedError) {
          logger.warn('Translation skipped:', error.message);
          return { status: 'skipped', reason: 'refused' };
        }
        throw error;
      }

      // Update performance stats
      if (result.status === 'done') recordTranslation(performance.now() - translationStartTime);

      return result;
    },
    // isLoading and isDictionaryReloading are read from this render's closure on purpose, not
    // through a ref: useForceReload retranslates inside the reload window through a callback
    // captured before the flag was set, and a live flag would refuse it (see components/CLAUDE.md).
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
    translateText,
    translateCharacterOnly,
    setStreamingText,
  });

  const forceReloadCtx = useForceReloadContext({
    destroyEngine,
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
  // Reader-triggered reload used to do. It no longer corrupts the Reader's chunk (the call
  // would queue behind it, or cancel it when preemptible), but a whole hidden document is
  // still time the Reader would spend waiting for an engine it wanted for its own text.
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
        avgTime={avgTime}
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
