import { useCallback } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { DEBUG_LEVELS } from '../utils/TranslationEngine.js';
import { parallelDictionaryLoader } from '../utils/dictionary';

/**
 * @typedef {Object} NormalizedLoadResultItem
 * @property {string} id - Dictionary id/name.
 * @property {boolean} success
 * @property {Object} [data] - Raw dictionary data (present when success).
 * @property {number} [entryCount] - Present when success.
 * @property {unknown} [error] - Present when !success.
 */

/**
 * Shared accumulate-and-log step for both dictionary-load branches in handleForceReload
 * (parallelDictionaryLoader primary path and the manual Promise.all fallback). The two
 * branches source their results differently and normalize into this common item shape
 * before calling here — this function only owns turning that normalized list into
 * {freshDictionaries, successCount} plus the per-item ✅/❌ log line. Each branch keeps its
 * own final summary log (duration vs "(fallback)" differ genuinely, not worth unifying).
 *
 * @param {NormalizedLoadResultItem[]} items
 * @returns {{freshDictionaries: Record<string, any>, successCount: number}}
 */
function accumulateLoadResults(items) {
  const freshDictionaries = {};
  let successCount = 0;

  for (const item of items) {
    if (item.success) {
      freshDictionaries[item.id] = item.data;
      successCount++;
      logger.log(`✅ Loaded ${item.id}: ${item.entryCount} entries`);
    } else {
      logger.error(`Failed to load dictionary ${item.id}:`, item.error);
    }
  }

  return { freshDictionaries, successCount };
}

/**
 * @typedef {Object} ForceReloadContext
 * @property {() => Promise<void>} cancelTranslations   - Step 1: cancel in-flight translations,
 *   await cleanup, reset isTranslating + progressInfo.
 *   CRITICAL-3: this must fully resolve before destroyEngine() is called.
 * @property {() => void} destroyEngine                 - Step 2: destroy + null engineRef.
 * @property {(msg: string) => void} setStatus          - Progress status messages throughout reload.
 * @property {(msg: string) => void} setReloadError     - Error state (replaces setTranslationError).
 * @property {(active: boolean) => void} setReloading   - isDictionaryReloading flag.
 * @property {() => void} clearHighlighting             - Clear UI highlight state.
 * @property {(dicts: Record<string,any>, opts: {forceConfigReload: boolean, debugLevel: string}) => Promise<boolean>} reinitializeEngine
 *   - Steps 6-7: reinitialize engine, run async WASM validation, return true if engine is ready.
 * @property {(inputText: string) => Promise<void>} retranslate
 *   - Step 8: dual-mode optimized path with fallback to sequential; owns success toast.
 *   - Resolves silently on validation failure (validateSemanticArraySize already toasts).
 *   - Throws on engine errors (caller shows error toast).
 * @property {() => unknown} saveScrollPositions        - Snapshot scroll state before reload.
 * @property {(saved: unknown) => Promise<void>} restoreScrollPositions - Restore after reload.
 */

/**
 * Encapsulates the 5-step dictionary reload protocol.
 *
 * CRITICAL-3 invariant: ctx.cancelTranslations() MUST fully resolve before
 * ctx.destroyEngine() is called. Never reorder these two steps.
 *
 * CRITICAL-1 invariant: ctx.setReloading(false) fires only inside the finally
 * block, AFTER ctx.restoreScrollPositions(), so isDictionaryReloading stays true
 * until scroll is fully restored.
 *
 * @param {ForceReloadContext} ctx - Stable capability methods (excluded from dep array).
 * @param {boolean} isDictionaryReloading
 * @param {string} inputText
 * @param {boolean} isLoading
 * @param {Record<string, any>} dictionaries
 */
export function useForceReload(ctx, isDictionaryReloading, inputText, isLoading, dictionaries) {
  const handleForceReload = useCallback(async () => {
    if (isDictionaryReloading) {
      logger.warn('🛑 Reload already in progress - ignoring duplicate call');
      toast.warning('Dictionary reload already in progress');
      return;
    }
    logger.log('🔄 Reload Dictionary initiated - clearing all caches and reloading from storage');

    const savedPositions = ctx.saveScrollPositions();
    ctx.setReloading(true);
    logger.log('📍 Saved scroll positions:', savedPositions);

    try {
      logger.log('🔄 Starting Reload Dictionary sequence...');
      ctx.setStatus('🔄 Starting dictionary reload...\n\nStep 1: Stopping active translations...');

      // Step 1 — CRITICAL-3: cancelTranslations() must fully resolve before destroyEngine()
      logger.log('Step 1: Stopping ongoing translations...');
      await ctx.cancelTranslations();

      // Step 2: Clear engine and caches
      logger.log('Step 2: Clearing engine and translation caches...');
      ctx.setStatus('🔄 Dictionary reload in progress...\n\nStep 2: Clearing caches...');
      ctx.destroyEngine();

      // Steps 3-4: Force reload all dictionaries from storage (direct IPC — not on protocol)
      logger.log('Step 4: Force reloading all dictionaries from storage...');
      const allDictionaryIds = Object.keys(dictionaries || {});
      ctx.setStatus(
        `🔄 Dictionary reload in progress...\n\nStep 3: Loading ${allDictionaryIds.length} dictionaries in parallel...`
      );

      let freshDictionaries = {};
      let successCount = 0;

      try {
        const dictionariesToLoad = allDictionaryIds.map((dictId) => ({
          name: dictId,
          path: dictId,
        }));

        const loadFunction = async (name, _path) => {
          logger.log(`Force loading dictionary from storage: ${name}`);
          const result = await window.electronAPI.loadDictionary(name);
          if (!result.success) {
            throw new Error(result.error || 'Unknown error');
          }
          return {
            data: result.data,
            entryCount: Object.keys(result.data || {}).length,
          };
        };

        const loadResult = await parallelDictionaryLoader.loadDictionariesParallel(
          dictionariesToLoad,
          loadFunction
        );

        const normalizedItems = loadResult.results.map(({ name, success, result, error }) => ({
          id: name,
          success: success && !!result,
          data: result?.data,
          entryCount: result?.entryCount,
          error,
        }));
        ({ freshDictionaries, successCount } = accumulateLoadResults(normalizedItems));

        logger.log(
          `📥 Loaded ${successCount}/${allDictionaryIds.length} dictionaries in parallel (${loadResult.duration.toFixed(0)}ms)`
        );
      } catch (loaderError) {
        logger.warn(
          'ParallelDictionaryLoader failed, falling back to manual loading:',
          loaderError
        );

        // Per-item failure logging happens once, in accumulateLoadResults below — do not
        // log here too (this branch used to double-log before that was unified).
        const loadPromises = allDictionaryIds.map(async (dictId) => {
          try {
            logger.log(`Force loading dictionary from storage: ${dictId}`);
            const result = await window.electronAPI.loadDictionary(dictId);
            if (result.success) {
              return {
                dictId,
                data: result.data,
                success: true,
                entryCount: Object.keys(result.data || {}).length,
              };
            }
            return { dictId, error: result.error, success: false };
          } catch (error) {
            return { dictId, error: error.message, success: false };
          }
        });

        const results = await Promise.all(loadPromises);
        const normalizedItems = results.map(({ dictId, data, success, entryCount, error }) => ({
          id: dictId,
          success,
          data,
          entryCount,
          error,
        }));
        ({ freshDictionaries, successCount } = accumulateLoadResults(normalizedItems));

        logger.log(
          `📥 Loaded ${successCount}/${allDictionaryIds.length} dictionaries in parallel (fallback)`
        );
      }

      // Step 5: UI state
      logger.log('Step 5: Updating UI state...');
      ctx.setStatus(
        '🔄 Reload Dictionary in progress...\n\nCaches cleared, dictionaries reloaded from storage.\nReinitializing engine...'
      );
      ctx.clearHighlighting();

      // Steps 6-7: Reinitialize engine (protocol handles isReady check + async WASM validation)
      logger.log('Steps 6+7: Reinitializing engine with fresh configuration and dictionaries...');
      ctx.setStatus(
        '🔄 Dictionary reload in progress...\n\nStep 4: Reinitializing translation engine...'
      );
      const dictionariesToUse =
        Object.keys(freshDictionaries).length > 0 ? freshDictionaries : dictionaries;

      if (!isLoading && dictionariesToUse) {
        const engineReady = await ctx.reinitializeEngine(dictionariesToUse, {
          forceConfigReload: true,
          debugLevel: DEBUG_LEVELS.ERROR,
        });

        if (!engineReady) {
          ctx.setReloadError(
            '❌ Reload Dictionary failed!\n\nError reinitializing engine. Check console for details.'
          );
          toast.error('Failed to reinitialize engine. Try reloading the app.');
          return;
        }
        logger.log('✅ Engine reinitialized successfully');

        // Step 8: Retranslate if input exists (protocol owns dual/fallback logic + success toast)
        if (inputText.trim()) {
          logger.log('Step 8: Retranslating current text...');
          ctx.setStatus('🔄 Engine ready - retranslating text...');
          try {
            await ctx.retranslate(inputText);
            logger.log('✅ Retranslation completed successfully');
          } catch (_retranslateError) {
            logger.error('❌ Retranslation failed:', _retranslateError);
            ctx.setReloadError('❌ Retranslation failed!\n\nError: ' + _retranslateError.message);
            toast.error(`Retranslation failed: ${_retranslateError.message}`);
          }
        } else {
          ctx.setStatus(
            '✅ Reload Dictionary completed!\n\nAll caches cleared, dictionaries reloaded from storage, and engine reinitialized.\nEngine is ready for translation.'
          );
          toast.success('Dictionary reloaded successfully');
        }
      } else {
        logger.log('⚠️ Cannot reinitialize engine - dictionaries not ready');
        ctx.setStatus(
          '⚠️ Reload Dictionary partially completed\n\nEngine will reinitialize automatically when dictionaries are ready.'
        );
        toast.error('Dictionaries not ready - please try again');
      }

      logger.log('✅ Reload Dictionary sequence completed');
    } catch (error) {
      logger.error('❌ Reload Dictionary failed:', error);
      ctx.setReloadError('❌ Reload Dictionary failed!\n\nUnexpected error: ' + error.message);
      toast.error(`Dictionary reload failed: ${error.message}`);
    } finally {
      // CRITICAL-1: restore scroll BEFORE clearing isDictionaryReloading so auto-scroll
      // cannot override saved positions during the reload window.
      setTimeout(async () => {
        logger.log('📍 Final scroll restoration attempt after reload complete');
        await ctx.restoreScrollPositions(savedPositions);
        ctx.setReloading(false);
        logger.log('🔄 Dictionary reload complete - flag reset after scroll restoration');
      }, 100);
    }
  }, [isDictionaryReloading, inputText, isLoading, dictionaries]); // ctx excluded — all stable

  return handleForceReload;
}
