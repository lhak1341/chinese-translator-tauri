import { useCallback } from 'react';
import { logger } from '../utils/logger.js';
import type { EngineInitOutcome } from '../components/EngineContext';

export interface ForceReloadContext {
  cancelTranslations: () => Promise<void>;
  destroyEngine: () => void;
  setStatus: (msg: string) => void;
  setReloadError: (msg: string) => void;
  setReloading: (active: boolean) => void;
  clearHighlighting: () => void;
  reinitializeEngine: (
    dicts: Record<string, unknown>,
    opts: { forceConfigReload: boolean }
  ) => Promise<EngineInitOutcome>;
  retranslate: (inputText: string) => Promise<void>;
  saveScrollPositions: () => unknown;
  restoreScrollPositions: (saved: unknown) => Promise<void>;
}

export interface UseForceReloadContextParams {
  destroyEngine: () => void;
  cancelAllTranslations: () => { count: number; cleanupComplete: Promise<void> };
  setIsTranslating: (v: boolean) => void;
  setStatusMessage: (msg: string) => void;
  setTranslationError: (msg: string) => void;
  setDictionaryReloading: (active: boolean) => void;
  clearHighlighting: () => void;
  reinitializeEngine: ForceReloadContext['reinitializeEngine'];
  retranslate: ForceReloadContext['retranslate'];
  saveScrollPositions: () => unknown;
  restoreScrollPositions: (saved: unknown) => Promise<void>;
}

/**
 * Assembles the typed ForceReloadContext consumed by useForceReload. Builds
 * cancelTranslations internally — the one field that was previously a
 * hand-written inline closure directly in Translator.jsx — and
 * wraps the already-composed pieces (reinitializeEngine and destroyEngine from useEngine(),
 * retranslate from useReloadRetranslate, and the plain setters) into the exact shape useForceReload expects.
 *
 * Replaces Translator.jsx's inline `forceReloadCtx` object literal.
 * Entry point: architecture review 2026-07-29, candidate #3.
 */
export function useForceReloadContext(params: UseForceReloadContextParams): ForceReloadContext {
  const {
    destroyEngine,
    cancelAllTranslations,
    setIsTranslating,
    setStatusMessage,
    setTranslationError,
    setDictionaryReloading,
    clearHighlighting,
    reinitializeEngine,
    retranslate,
    saveScrollPositions,
    restoreScrollPositions,
  } = params;

  const cancelTranslations = useCallback(async () => {
    const { count, cleanupComplete } = cancelAllTranslations();
    if (count > 0) {
      logger.log(`🛑 Cancelled ${count} active translation(s)`);
      await cleanupComplete;
      logger.log('✅ All translation cleanup(s) completed');
    }
    setIsTranslating(false);
  }, [cancelAllTranslations, setIsTranslating]);

  return {
    cancelTranslations,
    destroyEngine,
    setStatus: setStatusMessage,
    setReloadError: setTranslationError,
    setReloading: setDictionaryReloading,
    clearHighlighting,
    reinitializeEngine,
    retranslate,
    saveScrollPositions,
    restoreScrollPositions,
  };
}
