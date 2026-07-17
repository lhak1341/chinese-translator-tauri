import { useCallback } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { TOAST_DURATIONS } from '../constants/toastConfig';

/**
 * Reinitializes the translation engine with fresh dictionaries, then kicks off
 * a fire-and-forget WASM dictionary-sync validation (non-blocking, prevents UI freeze).
 *
 * @param {(dicts: Record<string, any>, opts: {forceConfigReload: boolean, debugLevel: string}) => Promise<void>} reinitialize
 * @param {{current: any}} engineRef
 * @returns {(dicts: Record<string, any>, opts: {forceConfigReload: boolean, debugLevel: string}) => Promise<boolean>}
 *   Resolves true once the engine is ready (WASM validation runs after, non-blocking).
 */
export function useEngineReinitializer(reinitialize, engineRef) {
  return useCallback(
    async (dicts, opts) => {
      await reinitialize(dicts, opts);
      if (!engineRef.current?.isReady()) return false;

      // Fire-and-forget WASM validation — non-blocking, prevents UI freeze
      if (
        engineRef.current?.dictionaryManager?.wasmInitialized &&
        typeof engineRef.current.dictionaryManager.validateWasmFallback === 'function'
      ) {
        setTimeout(() => {
          try {
            const syncStatus = engineRef.current?.dictionaryManager?.validateWasmFallback();
            if (!syncStatus) {
              logger.warn('⚠️ WASM validation skipped - engine no longer available');
              return;
            }
            if (syncStatus.status === 'PASSED') {
              logger.log('✅ WASM dictionary sync validated successfully');
            } else if (syncStatus.status === 'SKIPPED') {
              logger.log('⚠️ WASM validation skipped:', syncStatus.reason);
            } else if (syncStatus.status === 'FAILED') {
              if (syncStatus.results.wasmErrors > 0 || syncStatus.results.jsErrors > 0) {
                logger.error('❌ WASM sync validation failed - errors:', syncStatus);
                toast.error(`WASM sync errors detected. Using JavaScript fallback.`, {
                  duration: TOAST_DURATIONS.CACHE_WARNING,
                });
              } else {
                logger.error('❌ WASM sync validation failed - differences detected:', syncStatus);
                toast.error(
                  `WASM sync failed: ${syncStatus.results.failed} mismatches. Using JavaScript fallback.`,
                  { duration: TOAST_DURATIONS.CACHE_WARNING }
                );
              }
            }
          } catch (validationError) {
            logger.error('❌ WASM validation error:', validationError);
          }
        }, 100);
      }
      return true;
    },
    [reinitialize, engineRef]
  );
}
