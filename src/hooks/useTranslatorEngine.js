import { useState, useRef, useEffect, useCallback } from 'react';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import { invalidateAppConfig, loadAppConfig } from '../utils/appConfig';
import { createTranslationEngine, DEBUG_LEVELS } from '../utils/TranslationEngine.js';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';

// Engine initialization priorities — shared between initial load and reinitialize
const ENGINE_PRIORITIES = {
  properNouns: 3,
  patterns: 2,
  phrases: 3,
  characters: 4,
  punctuation: 5,
  conversion: 6,
};

/**
 * Manages the translation engine lifecycle: config load → dict wait → init → ready.
 *
 * Replaces the 6-condition gate + loadInitialConfig effect + engine init effect in
 * Translator.jsx. Phase transitions: 'loading' → 'ready' | 'error'.
 *
 * Returns:
 *   enginePhase     — 'loading' | 'ready' | 'error'
 *   engineRef       — ref to current engine instance (or null)
 *   engineVersion   — increments once per constructed engine; the cache-invalidation signal
 *   initError       — error message string when phase === 'error', else null
 *   destroyEngine   — () => void — frees the idle engine; a no-op while an init runs
 *   reinitialize    — async (rawDictionaries, options) => EngineInitOutcome — config reload +
 *                     filtering internal; never rejects
 *
 * EngineInitOutcome is `{ ok: true } | { ok: false, error: string }`. Every init — the mount
 * one and each reinitialize — goes through one serializer: a request that arrives while an
 * init runs waits behind it, and requests that pile up collapse into one run with the
 * latest arguments (`forceConfigReload` is OR-ed). All their callers get that run's outcome.
 */
export function useTranslatorEngine() {
  const { dictionaries, isLoading, loadError } = useDictionary();

  const [enginePhase, setEnginePhase] = useState('loading');
  const [initError, setInitError] = useState(null);
  // Bumped once per successfully constructed engine. Consumers that cache translated
  // output keyed by dictionary state — the Reader's chunk cache — invalidate on a change:
  // nothing survives reinitialization, so a cached translation from the previous engine is
  // a translation against dictionaries that no longer exist.
  const [engineVersion, setEngineVersion] = useState(0);
  const [activeProperNounsFromConfig, setActiveProperNounsFromConfig] = useState(null);

  const engineRef = useRef(null);
  // True from a request's claim until the queue is drained; the gate effect reads it too.
  const isInitializingRef = useRef(false);
  // The request waiting behind the running init: { rawDictionaries, options, waiters }.
  const queuedRequestRef = useRef(null);
  // Mirror of activeProperNounsFromConfig (the init gate's state), so a queued run never reads a
  // stale closure. Not exposed: it is the list the engine is built with, and the saved config
  // can move ahead of it until the next reload.
  const activeProperNounsRef = useRef(null);

  const adoptActiveProperNouns = useCallback((activeProperNouns) => {
    activeProperNounsRef.current = activeProperNouns;
    setActiveProperNounsFromConfig(activeProperNouns);
  }, []);

  /**
   * One init attempt: destroy outgoing engine (if any) → construct engine → initialize →
   * set phase/error. Resolves to the outcome and never rejects. Called only by the
   * serializer below, which owns the re-entrancy lock.
   *
   * Only one engine may exist at a time — the WASM pattern/number processors
   * are module-scope singletons, so a second live engine would silently share
   * state with the first. Destroying the outgoing engine before constructing
   * the replacement is what enforces that, not caller discipline.
   */
  const runEngineInit = useCallback(async (dictionaries, activeProperNouns, options = {}) => {
    const { priorities = ENGINE_PRIORITIES, debugLevel = DEBUG_LEVELS.ERROR } = options;
    try {
      if (engineRef.current) {
        try {
          engineRef.current.destroy();
        } catch (destroyError) {
          logger.error('Failed to destroy outgoing engine:', destroyError);
        }
      }
      engineRef.current = createTranslationEngine();
      await engineRef.current.initialize(dictionaries, {
        priorities,
        activeProperNouns,
        debugLevel,
      });
      setInitError(null);
      setEngineVersion((version) => version + 1);
      setEnginePhase('ready');
      return { ok: true };
    } catch (error) {
      logger.error('Failed to initialize engine:', error);
      const message = extractErrorMessage(error);
      setInitError(message);
      setEnginePhase('error');
      return { ok: false, error: message };
    }
    // engineRef is a ref (stable identity); setInitError/setEnginePhase are stable
    // setState functions — this closes over no reactive values.
  }, []);

  /** One queued request: the optional config reload, then the init. Never rejects. */
  const runRequest = useCallback(
    async ({ rawDictionaries, options }) => {
      const { forceConfigReload = false, priorities = ENGINE_PRIORITIES, debugLevel } = options;
      try {
        if (forceConfigReload) {
          invalidateAppConfig();
          const freshConfig = await loadAppConfig();
          adoptActiveProperNouns(freshConfig.engine.activeProperNouns);
        }
        return await runEngineInit(
          rawDictionaries,
          activeProperNounsRef.current ?? ['properNouns'],
          { priorities, debugLevel }
        );
      } catch (error) {
        // Only the config reload can land here (runEngineInit reports its own failures):
        // a forceConfigReload failure still lands in initError/enginePhase, never throws.
        logger.error('Failed to reinitialize engine:', error);
        const message = extractErrorMessage(error);
        setInitError(message);
        setEnginePhase('error');
        return { ok: false, error: message };
      }
    },
    [runEngineInit, adoptActiveProperNouns]
  );

  /**
   * Initializes — or reinitializes — the engine. The one entry for every init, mount included.
   * Accepts raw (unfiltered) dictionaries. Handles config reload and proper-noun
   * filtering internally when forceConfigReload is true.
   *
   * Serialized: a call that arrives while an init runs waits behind it, and calls that pile
   * up collapse into one run with the latest dictionaries and options (forceConfigReload is
   * OR-ed, so a forced reload is never downgraded). Every waiting caller resolves with
   * that run's outcome. Never rejects.
   *
   * @param {Object} rawDictionaries
   * @param {Object} [options]
   * @param {boolean} [options.forceConfigReload=false] - Re-read config from disk; updates activeProperNounsFromConfig state
   * @param {string} [options.debugLevel] - Engine debug level
   * @returns {Promise<{ok: true} | {ok: false, error: string}>}
   */
  const reinitialize = useCallback(
    (rawDictionaries, options = {}) =>
      new Promise((resolve) => {
        if (isInitializingRef.current) {
          const queued = queuedRequestRef.current;
          queuedRequestRef.current = {
            rawDictionaries,
            options: {
              ...options,
              forceConfigReload:
                Boolean(options.forceConfigReload) || Boolean(queued?.options.forceConfigReload),
            },
            waiters: [...(queued?.waiters ?? []), resolve],
          };
          return;
        }
        // Claimed synchronously, so two calls in one tick cannot both start a run.
        isInitializingRef.current = true;
        (async () => {
          let request = { rawDictionaries, options, waiters: [resolve] };
          while (request) {
            setEnginePhase('loading');
            const outcome = await runRequest(request);
            request.waiters.forEach((waiter) => waiter(outcome));
            request = queuedRequestRef.current;
            queuedRequestRef.current = null;
          }
          isInitializingRef.current = false;
        })();
      }),
    [runRequest]
  );

  /**
   * Frees the live engine early — a reload calls this before it loads a second copy of
   * every dictionary. Does nothing while an init runs: the engine in `engineRef` is then
   * half-built, and disposing it mid-`initialize` strands the init on a dead engine and
   * leaves `enginePhase` 'ready' over a null ref. Whatever requested that init, the reload
   * that called this has queued its own rebuild behind it, and `runEngineInit` destroys
   * the outgoing engine before constructing the replacement.
   */
  const destroyEngine = useCallback(() => {
    if (isInitializingRef.current || !engineRef.current) return;
    try {
      engineRef.current.destroy();
      engineRef.current = null;
      logger.log('✅ Engine destroyed and cleared successfully');
    } catch (engineError) {
      logger.error('❌ Error clearing engine:', engineError);
    }
  }, []);

  // Load config once on mount — replaces loadInitialConfig effect in Translator.jsx
  useEffect(() => {
    loadAppConfig()
      .then((config) => adoptActiveProperNouns(config.engine.activeProperNouns))
      .catch((err) => {
        logger.error('Failed to load initial configuration:', err);
        adoptActiveProperNouns(['properNouns']);
      });
  }, [adoptActiveProperNouns]);

  // Engine init state machine — replaces the 6-condition gate effect in Translator.jsx
  useEffect(() => {
    if (
      !isLoading &&
      !loadError &&
      activeProperNounsFromConfig !== null &&
      dictionaries &&
      enginePhase === 'loading' &&
      !isInitializingRef.current
    ) {
      reinitialize(dictionaries);
    }
  }, [isLoading, loadError, activeProperNounsFromConfig, dictionaries, enginePhase, reinitialize]);

  return {
    enginePhase,
    engineRef,
    engineVersion,
    initError,
    reinitialize,
    destroyEngine,
  };
}
