import { useCallback } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';

/**
 * @typedef {import('./useReloadExecutionContexts.js').ForceReloadContext} ForceReloadContext
 *
 * CRITICAL-3: ctx.cancelTranslations() must fully resolve before ctx.destroyEngine() runs.
 * See useReloadExecutionContexts.ts for the full field-by-field contract and the dev-only
 * input-shape guard that enforces it's actually built with this shape.
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
 * @param {() => Promise<Record<string, any>>} reloadAllDictionaries - The provider's: re-reads
 *   every dictionary through the Dictionary Store, unread ones included, and resolves to what
 *   memory then holds — so the new engine and the dictionaries the next edit saves are the
 *   same copy (ADR-055).
 * @returns {(options?: {retranslateInput?: boolean}) => Promise<void>}
 */
export function useForceReload(
  ctx,
  isDictionaryReloading,
  inputText,
  isLoading,
  reloadAllDictionaries
) {
  const handleForceReload = useCallback(
    async (options = {}) => {
      // Step 8 re-translates the Translator's own input. That is right when the reload was
      // triggered from the Translator, and pure waste when it was triggered from the Reader:
      // every tab stays mounted, so the Translator is holding whatever was last pasted into
      // it, and re-translating a whole hidden document is work nobody is waiting to see.
      //
      // It is also a document-length call from a tab nobody is looking at. `EngineAccess`
      // (`src/utils/EngineAccess.ts`) now keeps it from corrupting a Reader chunk, but
      // that Translator call would be refused as a hidden tab's, or queued behind the
      // Reader's own work.
      //
      // The caller that skips it owns telling the Translator its output is now stale — see
      // `useDeferredRetranslate`.
      const { retranslateInput = true } = options;
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
        ctx.setStatus(
          '🔄 Starting dictionary reload...\n\nStep 1: Stopping active translations...'
        );

        // Step 1 — CRITICAL-3: cancelTranslations() must fully resolve before destroyEngine()
        logger.log('Step 1: Stopping ongoing translations...');
        await ctx.cancelTranslations();

        // Step 2: Clear engine and caches
        logger.log('Step 2: Clearing engine and translation caches...');
        ctx.setStatus('🔄 Dictionary reload in progress...\n\nStep 2: Clearing caches...');
        ctx.destroyEngine();

        // Steps 3-4: Force reload all dictionaries from storage, through the store, so memory
        // and the new engine hold the same copy. Unread dictionaries are retried with the rest.
        logger.log('Step 4: Force reloading all dictionaries from storage...');
        ctx.setStatus(
          '🔄 Dictionary reload in progress...\n\nStep 3: Loading dictionaries in parallel...'
        );
        const freshDictionaries = await reloadAllDictionaries();
        logger.log(`📥 Loaded ${Object.keys(freshDictionaries).length} dictionaries`);

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
        if (!isLoading) {
          const outcome = await ctx.reinitializeEngine(freshDictionaries, {
            forceConfigReload: true,
          });

          if (!outcome.ok) {
            ctx.setReloadError(
              `❌ Reload Dictionary failed!\n\nError reinitializing engine: ${outcome.error}`
            );
            toast.error('Failed to reinitialize engine. Try reloading the app.');
            return;
          }
          logger.log('✅ Engine reinitialized successfully');

          // Step 8: Retranslate if input exists (protocol owns dual/fallback logic + success toast)
          if (retranslateInput && inputText.trim()) {
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
          } else if (!retranslateInput && inputText.trim()) {
            // Deliberately not retranslated here — the caller defers it. Say so, rather than
            // claiming completion over output that no longer matches the dictionaries.
            ctx.setStatus(
              '✅ Reload Dictionary completed!\n\nAll caches cleared, dictionaries reloaded from storage, and engine reinitialized.\nThe translation below is from the previous dictionaries and will be redone when you return to this tab.'
            );
            toast.success('Dictionary reloaded successfully');
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
    },
    [isDictionaryReloading, inputText, isLoading, reloadAllDictionaries]
  ); // ctx excluded — all stable

  return handleForceReload;
}
