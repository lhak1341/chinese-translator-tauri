import { useCallback } from 'react';
import type { RefObject, MutableRefObject } from 'react';
import type { SemanticArrays } from '../utils/highlighting';
import type { TranslationExecutionContext } from './useAutoTranslateTrigger.js';
import { logger } from '../utils/logger.js';

/**
 * Dev-only input-shape guard shared by both assembly hooks below. Neither
 * `Translator.jsx` call site is type-checked (ADR-003 — intentionally JS,
 * never TypeScript), so nothing else verifies the object it builds actually
 * matches the hook's declared param type. Kind (ref vs function) is inferred
 * from the `*Ref` naming convention — both real param shapes here obey it
 * with zero exceptions. `expectedKeys` is still an explicit list (typed
 * `satisfies readonly (keyof Params)[]` at each call site for typo/drift
 * protection) because checking only `Object.keys(params)` would miss a
 * field dropped entirely from the call site — the actual failure mode this
 * guard exists to catch. No-ops entirely outside development.
 */
function createShapeGuard<Params extends object>(
  hookName: string,
  expectedKeys: readonly (keyof Params)[]
) {
  return function assertParamsShape(params: Params): void {
    if (process.env.NODE_ENV !== 'development') return;
    for (const key of expectedKeys) {
      const value = (params as Record<string, unknown>)[key as string];
      if (String(key).endsWith('Ref')) {
        if (!value || typeof value !== 'object' || !('current' in value)) {
          throw new Error(`${hookName}: "${String(key)}" must be a ref object ({ current }).`);
        }
      } else if (typeof value !== 'function') {
        throw new Error(`${hookName}: "${String(key)}" must be a function, got ${typeof value}.`);
      }
    }
  };
}

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

const FORCE_RELOAD_EXPECTED_KEYS = [
  'engineRef',
  'cancelAllTranslations',
  'isTranslatingRef',
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
] as const satisfies readonly (keyof UseForceReloadContextParams)[];

const assertForceReloadParamsShape = createShapeGuard<UseForceReloadContextParams>(
  'useForceReloadContext',
  FORCE_RELOAD_EXPECTED_KEYS
);

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
  assertForceReloadParamsShape(params);

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

export interface UseTranslationExecutionContextParams {
  consumeReloadTransition: () => boolean;
  clearHighlighting: () => void;
  setIsTranslating: (v: boolean) => void;
  isTranslatingRef: MutableRefObject<boolean>;
  setResultArrays: (arrays: SemanticArrays | null, segs?: unknown[]) => void;
  setStreamingText: (text: string) => void;
  isClipboardTranslationRef: RefObject<boolean>;
  resetClipboardFlag: () => void;
  translationTextRef: RefObject<HTMLElement | null>;
}

const TRANSLATION_EXECUTION_EXPECTED_KEYS = [
  'consumeReloadTransition',
  'clearHighlighting',
  'setIsTranslating',
  'isTranslatingRef',
  'setResultArrays',
  'setStreamingText',
  'isClipboardTranslationRef',
  'resetClipboardFlag',
  'translationTextRef',
] as const satisfies readonly (keyof UseTranslationExecutionContextParams)[];

const assertTranslationExecutionParamsShape =
  createShapeGuard<UseTranslationExecutionContextParams>(
    'useTranslationExecutionContext',
    TRANSLATION_EXECUTION_EXPECTED_KEYS
  );

/**
 * Assembles the typed TranslationExecutionContext consumed by
 * useAutoTranslateTrigger. Every field is already a ref/setter produced by
 * another hook (useDictionaryReloadGuard, useHighlightingState,
 * useTranslationResults, useClipboardTranslation) — this is assembly-only,
 * no logic relocation. The assembly itself was previously an untyped object
 * literal built directly in Translator.jsx.
 *
 * Replaces Translator.jsx's inline `executionCtx` object literal.
 * Entry point: architecture review 2026-07-29, candidate #3.
 */
export function useTranslationExecutionContext(
  params: UseTranslationExecutionContextParams
): TranslationExecutionContext {
  assertTranslationExecutionParamsShape(params);
  return params;
}
