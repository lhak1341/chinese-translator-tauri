import { useRef, useCallback, RefObject } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';

interface UseClipboardTranslationOptions {
  setInputText: (t: string) => void;
  isDictionaryReloading: boolean;
  clearHighlighting: () => void;
  originalTextRef: RefObject<HTMLTextAreaElement | null>;
}

export interface UseClipboardTranslationResult {
  isClipboardTranslationRef: RefObject<boolean>;
  resetClipboardFlag: () => void;
  handleTranslateFromClipboard: () => Promise<void>;
}

export function useClipboardTranslation({
  setInputText,
  isDictionaryReloading,
  clearHighlighting,
  originalTextRef,
}: UseClipboardTranslationOptions): UseClipboardTranslationResult {
  const isClipboardBusy = useRef(false);

  // Ref (not state) — never drives JSX rendering; ref mutation avoids a wasted re-render on reset.
  const isClipboardTranslationRef = useRef(false);

  // Stable ref-fn — same pattern as consumeReloadTransition in useDictionaryReloadGuard.
  const resetClipboardFlag = useRef(() => {
    isClipboardTranslationRef.current = false;
  }).current;

  const handleTranslateFromClipboard = useCallback(async () => {
    if (isClipboardBusy.current) {
      logger.log('Clipboard translation already in progress - ignoring duplicate call');
      return;
    }

    if (isDictionaryReloading) {
      toast.warning('Dictionary reload in progress. Please wait.', { duration: 3000 });
      logger.warn('Clipboard translation rejected: dictionary reload in progress');
      return;
    }

    isClipboardBusy.current = true;
    try {
      const rawText = await window.electronAPI.readClipboard();
      // Collapse 2+ consecutive line breaks into single line break
      const text = rawText.replace(/\n{2,}/g, '\n');

      // Set ref synchronously before setInputText — loadAndTranslate effect reads .current
      // after inputText change triggers it; no React 18 batching dependency needed.
      isClipboardTranslationRef.current = true;
      setInputText(text);
      clearHighlighting();

      setTimeout(() => {
        if (originalTextRef.current) {
          originalTextRef.current.scrollTop = 0;
          originalTextRef.current.scrollLeft = 0;
        }
      }, 50);
    } catch (error) {
      logger.error('Failed to read clipboard:', error);
    } finally {
      setTimeout(() => {
        isClipboardBusy.current = false;
      }, 500);
    }
  }, [isDictionaryReloading, setInputText, clearHighlighting, originalTextRef]);

  return { isClipboardTranslationRef, resetClipboardFlag, handleTranslateFromClipboard };
}
