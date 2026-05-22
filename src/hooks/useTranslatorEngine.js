import { useState, useRef, useEffect } from 'react';
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

function filterDictionariesForEngine(dictionaries, activeProperNouns) {
  const filtered = {};
  for (const [name, dict] of Object.entries(dictionaries)) {
    if (!name.startsWith('properNouns') || activeProperNouns.includes(name)) {
      filtered[name] = dict;
    }
  }
  return filtered;
}

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
      isInitializingRef.current = true;

      (async () => {
        try {
          engineRef.current = createTranslationEngine();
          const filtered = filterDictionariesForEngine(dictionaries, activeProperNounsFromConfig);
          await engineRef.current.initialize(filtered, {
            priorities: ENGINE_PRIORITIES,
            activeProperNouns: activeProperNounsFromConfig,
            debugLevel: DEBUG_LEVELS.ERROR,
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
      })();
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
   * @param {Object} [options.priorities] - Dictionary loading priorities
   * @param {string} [options.debugLevel] - Engine debug level
   */
  async function reinitialize(rawDictionaries, options = {}) {
    const { forceConfigReload = false, priorities, debugLevel } = options;
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
      const filtered = filterDictionariesForEngine(rawDictionaries, activeProperNouns);
      engineRef.current = createTranslationEngine();
      await engineRef.current.initialize(filtered, { priorities, activeProperNouns, debugLevel });
      setInitError(null);
      setEnginePhase('ready');
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

export { ENGINE_PRIORITIES };
