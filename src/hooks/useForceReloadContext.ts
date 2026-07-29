import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { logger } from '../utils/logger.js';

export interface ForceReloadContext {
  cancelTranslations: () => Promise<void>;
  destroyEngine: () => void;
  setStatus: (msg: string) => void;
  setReloadError: (msg: string) => void;
  setReloading: (active: boolean) => void;
  clearHighlighting: () => void;
  reinitializeEngine: (
    dicts: Record<string, unknown>,
    opts: { forceConfigReload: boolean; debugLevel: string }
  ) => Promise<boolean>;
  retranslate: (inputText: string) => Promise<void>;
  saveScrollPositions: () => unknown;
  restoreScrollPositions: (saved: unknown) => Promise<void>;
}

export interface UseForceReloadContextParams {
  engineRef: MutableRefObject<any>;
  cancelAllTranslations: () => { count: number; cleanupComplete: Promise<void> };
  isTranslatingRef: MutableRefObject<boolean>;
  setIsTranslating: (v: boolean) => void;
  setProgressInfo: (v: unknown) => void;
  setStatusMessage: (msg: string) => void;
  setTranslationError: (msg: string) => void;
  setDictionaryReloading: (active: boolean) => void;
  clearHighlighting: () => void;
  reinitializeEngine: ForceReloadContext['reinitializeEngine'];
  retranslate: ForceReloadContext['retranslate'];
  saveScrollPositions: () => unknown;
  restoreScrollPositions: (saved: unknown) => Promise<void>;
}

const REQUIRED_REFS = ['engineRef', 'isTranslatingRef'] as const;
const REQUIRED_FUNCTIONS = [
  'cancelAllTranslations',
  'setIsTranslating',
  'setProgressInfo',
  'setStatusMessage',
  'setTranslationError',
  'setDictionaryReloading',
  'clearHighlighting',
  'reinitializeEngine',
  'retranslate',
  'saveScrollPositions',
  'restoreScrollPositions',
] as const;

function isRefLike(value: unknown): value is { current: unknown } {
  return !!value && typeof value === 'object' && 'current' in value;
}

/**
 * Dev-only input-shape guard. Translator.jsx (the sole caller) has no @ts-check
 * (ADR-003 — intentionally JS, never TypeScript), so nothing checks that its
 * call site actually passes the shape this hook's own parameter type declares.
 * Throws in development on a wrong-shaped input instead of silently building a
 * partially-broken ForceReloadContext (architecture review 2026-07-29,
 * candidate #3). No-ops entirely in production.
 */
function assertParamsShape(params: UseForceReloadContextParams): void {
  if (process.env.NODE_ENV !== 'development') return;
  for (const key of REQUIRED_REFS) {
    if (!isRefLike(params[key])) {
      throw new Error(`useForceReloadContext: "${key}" must be a ref object ({ current }).`);
    }
  }
  for (const key of REQUIRED_FUNCTIONS) {
    if (typeof params[key] !== 'function') {
      throw new Error(
        `useForceReloadContext: "${key}" must be a function, got ${typeof params[key]}.`
      );
    }
  }
}

/**
 * Assembles the typed ForceReloadContext consumed by useForceReload. Builds
 * cancelTranslations/destroyEngine internally — the only 2 fields that were
 * previously hand-written inline closures directly in Translator.jsx — and
 * wraps the already-composed pieces (reinitializeEngine from
 * useEngineReinitializer, retranslate from useReloadRetranslate, and the
 * plain setters) into the exact shape useForceReload expects.
 *
 * Replaces Translator.jsx's inline `forceReloadCtx` object literal.
 * Entry point: architecture review 2026-07-29, candidate #3.
 */
export function useForceReloadContext(params: UseForceReloadContextParams): ForceReloadContext {
  assertParamsShape(params);

  const {
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
  } = params;

  const cancelTranslations = useCallback(async () => {
    const { count, cleanupComplete } = cancelAllTranslations();
    if (count > 0) {
      logger.log(`🛑 Cancelled ${count} active translation(s)`);
      await cleanupComplete;
      logger.log('✅ All translation cleanup(s) completed');
    }
    isTranslatingRef.current = false;
    setIsTranslating(false);
    setProgressInfo(null);
  }, [cancelAllTranslations, isTranslatingRef, setIsTranslating, setProgressInfo]);

  const destroyEngine = useCallback(() => {
    if (engineRef.current) {
      try {
        engineRef.current.destroy();
        engineRef.current = null;
        logger.log('✅ Engine destroyed and cleared successfully');
      } catch (engineError) {
        logger.error('❌ Error clearing engine:', engineError);
      }
    }
  }, [engineRef]);

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
