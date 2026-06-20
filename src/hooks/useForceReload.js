import { useCallback } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { DEBUG_LEVELS } from '../utils/TranslationEngine.js';
import { TOAST_DURATIONS } from '../constants/toastConfig';
import { parallelDictionaryLoader } from '../utils/dictionary';

/**
 * Encapsulates the 5-step dictionary reload protocol.
 *
 * CRITICAL-3 invariant: ctx.cancelAllTranslations() + await cleanupComplete MUST
 * complete before ctx.engineRef.current is touched (nulled in Step 2). Never reorder
 * these two steps.
 *
 * @param {object} ctx - Stable refs and callbacks (all guaranteed stable across renders,
 *   so ctx is intentionally excluded from the useCallback dep array — same pattern as
 *   TranslationExecutionContext in useAutoTranslateTrigger).
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

    // Save current scroll positions before starting reload
    const savedPositions = ctx.saveScrollPositions();
    ctx.setDictionaryReloading(true);
    logger.log('📍 Saved scroll positions:', savedPositions);

    try {
      logger.log('🔄 Starting Reload Dictionary sequence...');
      ctx.setStatusMessage(
        '🔄 Starting dictionary reload...\n\nStep 1: Stopping active translations...'
      );

      // Step 1: Stop any ongoing translations and wait for them to finish
      // CRITICAL-3: await cleanupComplete before touching engineRef.current
      logger.log('Step 1: Stopping ongoing translations...');
      const { count: cancelledCount, cleanupComplete } = ctx.cancelAllTranslations();
      if (cancelledCount > 0) {
        logger.log(`🛑 Cancelled ${cancelledCount} active translation(s)`);
        await cleanupComplete;
        logger.log('✅ All translation cleanup(s) completed');
      }
      ctx.setIsTranslating(false);
      ctx.isTranslatingRef.current = false;
      ctx.setProgressInfo(null);

      // Step 2: Clear engine and caches
      logger.log('Step 2: Clearing engine and translation caches...');
      ctx.setStatusMessage('🔄 Dictionary reload in progress...\n\nStep 2: Clearing caches...');

      if (ctx.engineRef.current) {
        try {
          if (ctx.engineRef.current.dictionaryManager?.clearAllCaches) {
            ctx.engineRef.current.dictionaryManager.clearAllCaches();
            logger.log('✅ Dictionary manager caches cleared');
          }
          if (ctx.engineRef.current.semanticPatternProcessor?.variableCache) {
            ctx.engineRef.current.semanticPatternProcessor.variableCache.clear();
            logger.log('✅ Semantic pattern variable cache cleared');
          }
          ctx.engineRef.current = null;
          logger.log('✅ Engine cleared successfully');
        } catch (_engineError) {
          logger.error('❌ Error clearing engine:', _engineError);
        }
      }

      // Step 4: Force reload all dictionaries from storage
      logger.log('Step 4: Force reloading all dictionaries from storage...');
      const allDictionaryIds = Object.keys(dictionaries || {});
      ctx.setStatusMessage(
        `🔄 Dictionary reload in progress...\n\nStep 3: Loading ${allDictionaryIds.length} dictionaries in parallel...`
      );

      const freshDictionaries = {};
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

        loadResult.results.forEach(({ name, success, result, error }) => {
          if (success && result) {
            freshDictionaries[name] = result.data;
            successCount++;
            logger.log(`✅ Loaded ${name}: ${result.entryCount} entries`);
          } else {
            logger.error(`Failed to load dictionary ${name}:`, error);
          }
        });

        logger.log(
          `📥 Loaded ${successCount}/${allDictionaryIds.length} dictionaries in parallel (${loadResult.duration.toFixed(0)}ms)`
        );
      } catch (loaderError) {
        logger.warn(
          'ParallelDictionaryLoader failed, falling back to manual loading:',
          loaderError
        );

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
            logger.error(`Failed to load dictionary ${dictId}:`, result.error);
            return { dictId, error: result.error, success: false };
          } catch (error) {
            logger.error(`Failed to reload dictionary ${dictId}:`, error);
            return { dictId, error: error.message, success: false };
          }
        });

        const results = await Promise.all(loadPromises);
        results.forEach(({ dictId, data, success, entryCount }) => {
          if (success) {
            freshDictionaries[dictId] = data;
            successCount++;
            logger.log(`✅ Loaded ${dictId}: ${entryCount} entries`);
          }
        });

        logger.log(
          `📥 Loaded ${successCount}/${allDictionaryIds.length} dictionaries in parallel (fallback)`
        );
      }

      // Step 5: Clear UI state and show status
      logger.log('Step 5: Updating UI state...');
      ctx.setStatusMessage(
        '🔄 Reload Dictionary in progress...\n\nCaches cleared, dictionaries reloaded from storage.\nReinitializing engine...'
      );
      ctx.clearHighlighting();

      // Steps 6+7: Reinitialize engine with fresh config and dictionaries
      logger.log('Steps 6+7: Reinitializing engine with fresh configuration and dictionaries...');
      ctx.setStatusMessage(
        '🔄 Dictionary reload in progress...\n\nStep 4: Reinitializing translation engine...'
      );
      const dictionariesToUse =
        Object.keys(freshDictionaries).length > 0 ? freshDictionaries : dictionaries;

      if (!isLoading && dictionariesToUse) {
        await ctx.reinitialize(dictionariesToUse, {
          forceConfigReload: true,
          debugLevel: DEBUG_LEVELS.ERROR,
        });
        if (!ctx.engineRef.current?.isReady()) {
          ctx.setTranslationError(
            '❌ Reload Dictionary failed!\n\nError reinitializing engine. Check console for details.'
          );
          toast.error('Failed to reinitialize engine. Try reloading the app.');
          return;
        }
        logger.log('✅ Engine reinitialized successfully');

        // Run WASM validation asynchronously — non-blocking, prevents UI freeze
        if (
          ctx.engineRef.current?.dictionaryManager?.wasmInitialized &&
          typeof ctx.engineRef.current.dictionaryManager.validateWasmFallback === 'function'
        ) {
          setTimeout(() => {
            try {
              const syncStatus = ctx.engineRef.current?.dictionaryManager?.validateWasmFallback();
              if (!syncStatus) {
                logger.warn('⚠️ WASM validation skipped - engine no longer available');
                return;
              }

              if (syncStatus.status === 'PASS') {
                logger.log('✅ WASM dictionary sync validated successfully');
              } else if (syncStatus.status === 'SKIPPED') {
                logger.log('⚠️ WASM validation skipped:', syncStatus.reason);
              } else if (syncStatus.status === 'FAIL_DIFFERENCES') {
                logger.error('❌ WASM sync validation failed - differences detected:', syncStatus);
                toast.error(
                  `WASM sync failed: ${syncStatus.results.different} mismatches. Using JavaScript fallback.`,
                  { duration: TOAST_DURATIONS.CACHE_WARNING }
                );
              } else if (syncStatus.status === 'FAIL_ERRORS') {
                logger.error('❌ WASM sync validation failed - errors:', syncStatus);
                toast.error(`WASM sync errors detected. Using JavaScript fallback.`, {
                  duration: TOAST_DURATIONS.CACHE_WARNING,
                });
              }
            } catch (validationError) {
              logger.error('❌ WASM validation error:', validationError);
            }
          }, 100);
        }

        // Step 8: Retranslate if input exists
        if (inputText.trim()) {
          logger.log('Step 8: Retranslating current text...');
          ctx.setStatusMessage('🔄 Engine ready - retranslating text...');

          await new Promise((resolve) => setTimeout(resolve, 100));

          if (!ctx.engineRef.current?.isReady()) {
            logger.log('⚠️ Engine not ready after initialization, waiting longer...');
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          try {
            if (ctx.engineRef.current?.translateDualModeOptimized) {
              try {
                const dualResults =
                  await ctx.engineRef.current.translateDualModeOptimized(inputText);

                try {
                  ctx.validateSemanticArraySize(
                    dualResults.fullResult.semanticArrays,
                    'full translation'
                  );
                  ctx.validateSemanticArraySize(
                    dualResults.characterResult.semanticArrays,
                    'character-only translation'
                  );
                } catch (validationError) {
                  return;
                }

                ctx.setDualResults(dualResults.fullResult, dualResults.characterResult);
                ctx.refreshCacheStats();
              } catch (_optimizedError) {
                logger.error(
                  '🔄 Optimized reload translation failed, falling back to sequential:',
                  _optimizedError
                );
                const newTranslation = await ctx.translateText(inputText);
                ctx.setStreamingText(newTranslation);
                setTimeout(() => ctx.translateCharacterOnly(inputText), 0);
              }
            } else {
              const newTranslation = await ctx.translateText(inputText);
              ctx.setStreamingText(newTranslation);
              setTimeout(() => ctx.translateCharacterOnly(inputText), 0);
            }

            logger.log('✅ Retranslation completed successfully');
            toast.success('Dictionary reloaded and text retranslated');
          } catch (_retranslateError) {
            logger.error('❌ Retranslation failed:', _retranslateError);
            ctx.setTranslationError(
              '❌ Retranslation failed!\n\nError: ' + _retranslateError.message
            );
            toast.error(`Retranslation failed: ${_retranslateError.message}`);
          }
        } else {
          ctx.setStatusMessage(
            '✅ Reload Dictionary completed!\n\nAll caches cleared, dictionaries reloaded from storage, and engine reinitialized.\nEngine is ready for translation.'
          );
          toast.success('Dictionary reloaded successfully');
        }
      } else {
        logger.log('⚠️ Cannot reinitialize engine - dictionaries not ready');
        ctx.setStatusMessage(
          '⚠️ Reload Dictionary partially completed\n\nEngine will reinitialize automatically when dictionaries are ready.'
        );
        toast.error('Dictionaries not ready - please try again');
      }

      logger.log('✅ Reload Dictionary sequence completed');
    } catch (error) {
      logger.error('❌ Reload Dictionary failed:', error);
      ctx.setTranslationError('❌ Reload Dictionary failed!\n\nUnexpected error: ' + error.message);
      toast.error(`Dictionary reload failed: ${error.message}`);
    } finally {
      // CRITICAL-1: Keep isDictionaryReloading=true until AFTER scroll restoration to
      // prevent auto-scroll from overriding saved positions during reload.
      setTimeout(async () => {
        logger.log('📍 Final scroll restoration attempt after reload complete');
        await ctx.restoreScrollPositions(savedPositions);
        ctx.setDictionaryReloading(false);
        logger.log('🔄 Dictionary reload complete - flag reset after scroll restoration');
      }, 100);
    }
  }, [isDictionaryReloading, inputText, isLoading, dictionaries]); // ctx excluded — all stable

  return handleForceReload;
}
