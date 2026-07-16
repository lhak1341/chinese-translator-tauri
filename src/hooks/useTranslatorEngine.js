import { useState, useRef, useEffect } from 'react';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import { invalidateAppConfig, loadAppConfig } from '../utils/appConfig';
import { createTranslationEngine, DEBUG_LEVELS } from '../utils/TranslationEngine.js';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import { filterDictionariesForEngine } from '../utils/dictionary';

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
 *   initError       — error message string when phase === 'error', else null
 *   activeProperNounsFromConfig — loaded from disk; use directly in Translator.jsx
 *   reinitialize    — async (rawDictionaries, options) => void — config reload + filtering internal
 */
export function useTranslatorEngine() {
  const { dictionaries, isLoading, loadError } = useDictionary();

  const [enginePhase, setEnginePhase] = useState('loading');
  const [initError, setInitError] = useState(null);
  const [activeProperNounsFromConfig, setActiveProperNounsFromConfig] = useState(null);

  const engineRef = useRef(null);
  const isInitializingRef = useRef(false);

  /**
   * Shared init sequence: construct engine → filter dictionaries → initialize →
   * set phase/error. Used by both the mount effect and reinitialize(); callers
   * own their own pre-guards (re-entrancy check, forcing 'loading', config reload).
   */
  async function runEngineInit(dictionaries, activeProperNouns, options = {}) {
    const { priorities = ENGINE_PRIORITIES, debugLevel = DEBUG_LEVELS.ERROR } = options;
    isInitializingRef.current = true;
    try {
      const filtered = filterDictionariesForEngine(dictionaries, activeProperNouns);
      engineRef.current = createTranslationEngine();
      await engineRef.current.initialize(filtered, {
        priorities,
        activeProperNouns,
        debugLevel,
      });
      setInitError(null);
      setEnginePhase('ready');
    } catch (error) {
      logger.error('Failed to initialize engine:', error);
      setInitError(extractErrorMessage(error));
      setEnginePhase('error');
    } finally {
      isInitializingRef.current = false;
    }
  }

  // Load config once on mount — replaces loadInitialConfig effect in Translator.jsx
  useEffect(() => {
    loadAppConfig()
      .then((config) => setActiveProperNounsFromConfig(config.engine.activeProperNouns))
      .catch((err) => {
        logger.error('Failed to load initial configuration:', err);
        setActiveProperNounsFromConfig(['properNouns']);
      });
  }, []);

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
      runEngineInit(dictionaries, activeProperNounsFromConfig);
    }
  }, [isLoading, loadError, activeProperNounsFromConfig, dictionaries, enginePhase]);

  /**
   * Reinitializes the engine — called by handleForceReload.
   * Accepts raw (unfiltered) dictionaries. Handles config reload and proper-noun
   * filtering internally when forceConfigReload is true.
   * Never rejects: errors are captured in initError / enginePhase === 'error'.
   *
   * @param {Object} rawDictionaries - All available dictionaries (unfiltered)
   * @param {Object} [options]
   * @param {boolean} [options.forceConfigReload=false] - Re-read config from disk; updates activeProperNounsFromConfig state
   * @param {string} [options.debugLevel] - Engine debug level
   */
  async function reinitialize(rawDictionaries, options = {}) {
    const { forceConfigReload = false, priorities = ENGINE_PRIORITIES, debugLevel } = options;
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;
    setEnginePhase('loading');
    try {
      let activeProperNouns = activeProperNounsFromConfig ?? ['properNouns'];
      if (forceConfigReload) {
        invalidateAppConfig();
        const freshConfig = await loadAppConfig();
        activeProperNouns = freshConfig.engine.activeProperNouns;
        setActiveProperNounsFromConfig(activeProperNouns);
      }
      // runEngineInit owns its own isInitializingRef/try-catch for the init step itself;
      // this try/catch only needs to cover the config-reload step above, so a
      // forceConfigReload failure still lands in initError/enginePhase, never throws.
      await runEngineInit(rawDictionaries, activeProperNouns, { priorities, debugLevel });
    } catch (error) {
      logger.error('Failed to reinitialize engine:', error);
      setInitError(extractErrorMessage(error));
      setEnginePhase('error');
    } finally {
      isInitializingRef.current = false;
    }
  }

  return {
    enginePhase,
    engineRef,
    initError,
    activeProperNounsFromConfig,
    reinitialize,
  };
}
