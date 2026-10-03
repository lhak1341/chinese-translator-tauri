import { useCallback } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';

/**
 * Retranslates text after a dictionary reload: waits briefly for the engine to
 * settle, runs translateText, streams the result, then queues character-only
 * translation on the next tick (not awaited, so the success toast fires first).
 * Owns the success toast.
 *
 * @param {Object} deps
 * @param {{current: any}} deps.engineRef
 * @param {(text: string) => Promise<string>} deps.translateText
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
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!engineRef.current?.isReady()) {
        logger.log('⚠️ Engine not ready after initialization, waiting longer...');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const newTranslation = await translateText(text);
      setStreamingText(newTranslation);
      setTimeout(() => translateCharacterOnly(text), 0);
      toast.success('Dictionary reloaded and text retranslated');
    },
    [engineRef, translateText, translateCharacterOnly, setStreamingText]
  );
}
