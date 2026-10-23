import { useEffect } from 'react';
import type { RefObject } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { TOAST_DURATIONS, TOAST_IDS } from '../constants/toastConfig';
import { UI_TIMEOUTS } from '../constants/TranslationConstants';
import { extractErrorMessage } from '../utils/errorHelpers';
import type { SemanticArrays } from '../utils/highlighting';
import type { TranslateTextOutcome } from '../types/UITypes';
import { createShapeGuard } from './useReloadExecutionContexts.js';

export interface TranslationExecutionContext {
  consumeReloadTransition: () => boolean;
  clearHighlighting: () => void;
  setIsTranslating: (v: boolean) => void;
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
  'setResultArrays',
  'setStreamingText',
  'isClipboardTranslationRef',
  'resetClipboardFlag',
  'translationTextRef',
] as const satisfies readonly (keyof TranslationExecutionContext)[];

// Dev-only: proves `ctx` (assembled untyped in Translator.jsx) actually matches
// TranslationExecutionContext at the one point that consumes it. See createShapeGuard's
// doc comment in useReloadExecutionContexts.ts — was its own useTranslationExecutionContext
// assembly hook before architecture review 2026-08-12 candidate #1 deleted it (interface was
// identical to its implementation: assert shape, return params unchanged — nothing behind
// the seam). This hook already owns the typed interface being checked; no wrapper needed.
const assertTranslationExecutionCtxShape = createShapeGuard<TranslationExecutionContext>(
  'useAutoTranslateTrigger',
  TRANSLATION_EXECUTION_EXPECTED_KEYS
);

interface UseAutoTranslateTriggerOptions {
  // Trigger signals — effect deps
  inputText: string;
  isLoading: boolean;
  isDictionaryReloading: boolean;
  translateText: (text: string) => Promise<TranslateTextOutcome>;
  translateCharacterOnly: (text: string) => void;
  // Stable execution context — assembled once by the caller, excluded from deps
  ctx: TranslationExecutionContext;
}

/**
 * Owns the "when to re-translate" policy:
 * - guards (reload-in-progress, reload-just-finished)
 * - ordering (charOnly after main, clipboard scroll 100ms post-render)
 * - isTranslating lifecycle
 *
 * Dep array is intentionally narrow: only the 5 trigger signals.
 * All other params are stable refs/callbacks and excluded from deps.
 */
export function useAutoTranslateTrigger({
  inputText,
  isLoading,
  isDictionaryReloading,
  translateText,
  translateCharacterOnly,
  ctx,
}: UseAutoTranslateTriggerOptions): void {
  assertTranslationExecutionCtxShape(ctx);

  const {
    consumeReloadTransition,
    clearHighlighting,
    setIsTranslating,
    setResultArrays,
    setStreamingText,
    isClipboardTranslationRef,
    resetClipboardFlag,
    translationTextRef,
  } = ctx;
  useEffect(() => {
    const run = async () => {
      try {
        if (consumeReloadTransition()) {
          logger.log(
            '⏭️ Skipping translation - dictionary reload just completed (already retranslated)'
          );
          return;
        }

        if (isDictionaryReloading) {
          logger.log('⏭️ Skipping translation - dictionary reload in progress');
          return;
        }

        clearHighlighting();

        if (inputText && !isLoading) {
          setIsTranslating(true);
          clearHighlighting();
          setResultArrays(null, []);

          try {
            const outcome = await translateText(inputText);
            if (outcome.status === 'skipped') {
              // translateText already told the user why. The attempt is over, so the clipboard
              // flag must not leak into the next edit.
              logger.log(`⏭️ Translation skipped: ${outcome.reason}`);
              if (isClipboardTranslationRef.current) resetClipboardFlag();
              return;
            }
            const newTranslation = outcome.text;
            logger.log(`📝 Translation completed: ${newTranslation.length} chars`);
            setStreamingText(newTranslation);

            if (inputText.length > UI_TIMEOUTS.LARGE_TRANSLATION_THRESHOLD) {
              toast.success(`Translation completed: ${inputText.length} characters processed`, {
                duration: TOAST_DURATIONS.SUCCESS,
                id: TOAST_IDS.TRANSLATION_COMPLETED,
              });
            }

            // charOnly after main — avoids engine interference
            setTimeout(() => translateCharacterOnly(inputText), 0);

            if (isClipboardTranslationRef.current && !isDictionaryReloading) {
              setTimeout(() => {
                if (translationTextRef.current) {
                  translationTextRef.current.scrollTop = 0;
                  translationTextRef.current.scrollLeft = 0;
                }
              }, 100); // wait for translation content to render
            }
            if (isClipboardTranslationRef.current) {
              resetClipboardFlag();
            }
          } finally {
            setIsTranslating(false);
          }
        }
      } catch (error) {
        logger.error('Translation effect failed unexpectedly:', error);
        toast.error(`Translation error: ${extractErrorMessage(error)}`, {
          duration: TOAST_DURATIONS.CRITICAL,
        });
      }
    };

    run();
    // ctx holds stable refs/callbacks — excluded from deps; safe to read at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, isLoading, isDictionaryReloading, translateCharacterOnly, translateText]);
}
