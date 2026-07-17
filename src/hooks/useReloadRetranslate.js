import { useCallback } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';

/**
 * Retranslates text after a dictionary reload: waits briefly for the engine to
 * settle, prefers the dual-mode-optimized path (validates semantic array sizes),
 * falls back to sequential translateText + translateCharacterOnly on any
 * optimized-path failure or when translateDualModeOptimized isn't available.
 * Resolves silently on validation failure (validateSemanticArraySize already
 * logs + toasts). Owns the success toast.
 *
 * @param {Object} deps
 * @param {{current: any}} deps.engineRef
 * @param {(semanticArrays: any, label: string) => void} deps.validateSemanticArraySize
 * @param {(fullResult: any, characterResult: any) => void} deps.setDualResults
 * @param {() => void} deps.refreshReport
 * @param {(text: string) => Promise<string>} deps.translateText
 * @param {(text: string) => Promise<void>} deps.translateCharacterOnly
 * @param {(text: string) => void} deps.setStreamingText
 * @returns {(text: string) => Promise<void>}
 */
export function useReloadRetranslate({
  engineRef,
  validateSemanticArraySize,
  setDualResults,
  refreshReport,
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
      if (engineRef.current?.translateDualModeOptimized) {
        try {
          const dualResults = await engineRef.current.translateDualModeOptimized(text);
          try {
            validateSemanticArraySize(dualResults.fullResult.semanticArrays, 'full translation');
            validateSemanticArraySize(
              dualResults.characterResult.semanticArrays,
              'character-only translation'
            );
          } catch (_validationError) {
            return; // validateSemanticArraySize already logged + toasted
          }
          setDualResults(dualResults.fullResult, dualResults.characterResult);
          refreshReport();
        } catch (_optimizedError) {
          logger.error(
            '🔄 Optimized reload translation failed, falling back to sequential:',
            _optimizedError
          );
          const newTranslation = await translateText(text);
          setStreamingText(newTranslation);
          setTimeout(() => translateCharacterOnly(text), 0);
        }
      } else {
        const newTranslation = await translateText(text);
        setStreamingText(newTranslation);
        setTimeout(() => translateCharacterOnly(text), 0);
      }
      toast.success('Dictionary reloaded and text retranslated');
    },
    [
      engineRef,
      validateSemanticArraySize,
      setDualResults,
      refreshReport,
      translateText,
      translateCharacterOnly,
      setStreamingText,
    ]
  );
}
