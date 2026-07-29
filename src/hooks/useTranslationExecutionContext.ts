import type { RefObject, MutableRefObject } from 'react';
import type { SemanticArrays } from '../utils/highlighting';
import type { TranslationExecutionContext } from './useAutoTranslateTrigger.js';

export type { TranslationExecutionContext };

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

const REQUIRED_REFS = [
  'isTranslatingRef',
  'isClipboardTranslationRef',
  'translationTextRef',
] as const;
const REQUIRED_FUNCTIONS = [
  'consumeReloadTransition',
  'clearHighlighting',
  'setIsTranslating',
  'setResultArrays',
  'setStreamingText',
  'resetClipboardFlag',
] as const;

function isRefLike(value: unknown): value is { current: unknown } {
  return !!value && typeof value === 'object' && 'current' in value;
}

/**
 * Dev-only input-shape guard — see useForceReloadContext.ts for why this
 * exists (Translator.jsx has no @ts-check, ADR-003). No-ops in production.
 */
function assertParamsShape(params: UseTranslationExecutionContextParams): void {
  if (process.env.NODE_ENV !== 'development') return;
  for (const key of REQUIRED_REFS) {
    if (!isRefLike(params[key])) {
      throw new Error(
        `useTranslationExecutionContext: "${key}" must be a ref object ({ current }).`
      );
    }
  }
  for (const key of REQUIRED_FUNCTIONS) {
    if (typeof params[key] !== 'function') {
      throw new Error(
        `useTranslationExecutionContext: "${key}" must be a function, got ${typeof params[key]}.`
      );
    }
  }
}

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
  assertParamsShape(params);
  return params;
}
