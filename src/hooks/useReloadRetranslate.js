import { useCallback } from 'react';
import toast from '../utils/toast';

/**
 * Retranslates text after a dictionary reload: runs translateText, streams the result, then
 * queues character-only translation on the next tick (not awaited, so the success toast fires
 * first). Owns the success toast.
 *
 * The engine must already be ready: a reload's `reinitializeEngine` outcome is `ok` only after
 * the engine finished initializing, and a deferred retranslate runs with no init in flight. A
 * missing or unready engine throws instead of translating. A skipped run (`translateText` already
 * told the user why) throws too, so the reload reports a failed retranslate instead of streaming
 * nothing under a success toast.
 *
 * @param {Object} deps
 * @param {{current: any}} deps.engineRef
 * @param {(text: string) => Promise<import('../types/UITypes').TranslateTextOutcome>} deps.translateText
 * @param {(text: string) => Promise<void>} deps.translateCharacterOnly
 * @param {(text: string) => void} deps.setStreamingText
 * @returns {(text: string) => Promise<void>}
 */
export function useReloadRetranslate({
  engineRef,
  translateText,
  translateCharacterOnly,
  setStreamingText,
}) {
  return useCallback(
    async (text) => {
      if (!engineRef.current?.isReady()) {
        throw new Error('Engine not ready');
      }
      const outcome = await translateText(text);
      if (outcome.status === 'skipped') {
        throw new Error(`Translation skipped: ${outcome.reason}`);
      }
      setStreamingText(outcome.text);
      setTimeout(() => translateCharacterOnly(text), 0);
      toast.success('Dictionary reloaded and text retranslated');
    },
    [engineRef, translateText, translateCharacterOnly, setStreamingText]
  );
}
