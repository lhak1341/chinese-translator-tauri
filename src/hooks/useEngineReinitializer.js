import { useCallback } from 'react';

/**
 * Reinitializes the translation engine with fresh dictionaries.
 *
 * @param {(dicts: Record<string, any>, opts: {forceConfigReload: boolean, debugLevel: string}) => Promise<void>} reinitialize
 * @param {{current: any}} engineRef
 * @returns {(dicts: Record<string, any>, opts: {forceConfigReload: boolean, debugLevel: string}) => Promise<boolean>}
 *   Resolves true once the engine is ready.
 */
export function useEngineReinitializer(reinitialize, engineRef) {
  return useCallback(
    async (dicts, opts) => {
      await reinitialize(dicts, opts);
      return !!engineRef.current?.isReady();
    },
    [reinitialize, engineRef]
  );
}
