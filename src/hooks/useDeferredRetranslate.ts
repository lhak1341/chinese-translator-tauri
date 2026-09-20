import { useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

export interface UseDeferredRetranslateOptions {
  /** Whether the Translator is the visible tab. */
  isActive: boolean;
  /** The Translator's current input. Empty means there is nothing to redo. */
  inputText: string;
  /** The Translator's own retranslate, as `useReloadRetranslate` builds it. */
  retranslate: (inputText: string) => Promise<void>;
}

export interface DeferredRetranslate {
  /**
   * Mark the Translator's output stale, to be redone when that tab is next shown.
   *
   * Call instead of retranslating, never as well as.
   */
  defer: () => void;
}

/**
 * Redo the Translator's translation on its next appearance, rather than during a reload
 * the reader triggered from somewhere else.
 *
 * A dictionary reload is one action with one owner (`DictionaryReloadRegistry`), and the
 * Reader triggers that same action. Its last step re-translates the Translator's input —
 * correct when the reader is looking at the Translator, and pure cost when they are not:
 * every tab stays mounted, so the Translator is still holding whatever was last pasted
 * into it, and re-translating a whole document nobody can see is time the Reader spends
 * waiting for an engine it wanted for its own text.
 *
 * Skipping it outright would be wrong in a different way — the reader would come back to
 * a translation quietly produced by dictionaries that no longer exist. So the work is
 * moved rather than dropped: the reload marks the output stale, and it is redone the
 * moment that tab becomes visible, which is the first moment it matters.
 *
 * Deliberately keyed on the visible transition rather than a timer or an idle callback: it
 * is the only moment the answer is needed, and the only one at which the engine is
 * reliably free of the Reader's own calls.
 */
export function useDeferredRetranslate({
  isActive,
  inputText,
  retranslate,
}: UseDeferredRetranslateOptions): DeferredRetranslate {
  const isPendingRef = useRef(false);

  // "Latest ref": the effect fires on the visible transition, and must use the input and
  // the retranslate current at that moment rather than whichever render armed the flag.
  const liveRef = useRef({ inputText, retranslate });
  liveRef.current = { inputText, retranslate };

  useEffect(() => {
    if (!isActive || !isPendingRef.current) return;
    // Cleared before the await, not after: a second activation while this one is still
    // running must not start the same work twice.
    isPendingRef.current = false;

    const { inputText: text, retranslate: run } = liveRef.current;
    if (!text.trim()) return;

    void run(text).catch((cause: unknown) => {
      logger.error('Deferred retranslation after a dictionary reload failed:', cause);
    });
  }, [isActive]);

  const deferRef = useRef<DeferredRetranslate>({
    defer: () => {
      isPendingRef.current = true;
    },
  });

  return deferRef.current;
}
