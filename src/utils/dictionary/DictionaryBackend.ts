import { logger } from '../logger';
import { extractErrorMessage } from '../errorHelpers';
import type { DictionaryData } from '../../types/DictionaryTypes';
import type { BatchDictionaryResult } from '../../types/ElectronTypes';

export interface BatchLoadResult {
  /** Raw (unsorted) data per dictionary ID. Failed IDs are present as `{}`. */
  loadedDictionaries: Record<string, DictionaryData>;
  /** IDs that failed the parallel load AND the serial retry. */
  stillFailedIds: string[];
  /** Total IDs requested. */
  total: number;
}

/**
 * Parallel batch load with serial retry for cold-launch failures.
 *
 * Owns: loadDictionariesParallel → per-failure loadDictionary retry → classification.
 * Callers own: sorting, toasting, React state.
 */
export async function loadAllDictionaries(dictionaryIds: string[]): Promise<BatchLoadResult> {
  const loadedDictionaries: Record<string, DictionaryData> = {};
  const total = dictionaryIds.length;

  const startTime = performance.now();
  const batchResult = await window.electronAPI.loadDictionariesParallel(dictionaryIds);
  const loadTime = (performance.now() - startTime).toFixed(2);

  logger.log(
    `📚 Parallel dictionary loading: ${batchResult.successful}/${batchResult.total} dictionaries loaded in ${loadTime}ms`
  );

  const failedIds: string[] = [];
  batchResult.results.forEach((result: BatchDictionaryResult) => {
    if (result.success && result.data) {
      loadedDictionaries[result.dictionary_id] = result.data;
    } else {
      logger.error(`Failed to load dictionary ${result.dictionary_id}:`, result.error);
      failedIds.push(result.dictionary_id);
      loadedDictionaries[result.dictionary_id] = {};
    }
  });

  const stillFailedIds: string[] = [];
  if (failedIds.length > 0) {
    logger.warn(
      `⚠️ Initial parallel load failed for ${failedIds.length} dictionaries — retrying serially: ${failedIds.join(', ')}`
    );
    const retryResults = await Promise.all(
      failedIds.map(async (id) => {
        try {
          const r = await window.electronAPI.loadDictionary(id);
          if (r.success && r.data) return { id, data: r.data, success: true as const };
          return { id, success: false as const, error: r.error };
        } catch (e) {
          return { id, success: false as const, error: extractErrorMessage(e) };
        }
      })
    );
    for (const r of retryResults) {
      if (r.success) {
        loadedDictionaries[r.id] = r.data;
        logger.log(`✅ Retry succeeded for dictionary "${r.id}"`);
      } else {
        stillFailedIds.push(r.id);
        logger.error(`❌ Retry failed for dictionary "${r.id}":`, r.error);
      }
    }
  }

  return { loadedDictionaries, stillFailedIds, total };
}
