import { logger } from '../logger';
import { extractErrorMessage } from '../errorHelpers';
import type { DictionaryData } from '../../types/DictionaryTypes';
import type { BatchDictionaryResult } from '../../types/ElectronTypes';

/**
 * The ids a list command returned, or a throw if it failed.
 *
 * The commands return plain id strings at runtime while `ElectronTypes.d.ts` declares
 * `DictionaryInfo[]`; absorbing that in one place keeps the `typeof entry === 'string'`
 * shrug from being hand-copied at each call site, which is how the copies that existed
 * before this got the chance to drift. A failed list throws rather than reading as an empty
 * one: "the listing failed" says nothing about what exists, and callers that treated it as
 * "none exist" hid dictionaries or re-created ones that were there.
 */
async function listIds(
  list: () => Promise<{
    success: boolean;
    error?: string;
    dictionaries?: readonly (string | { id: string })[];
  }>,
  failure: string
): Promise<string[]> {
  const result = await list();
  if (!result.success || !result.dictionaries) {
    throw new Error(result.error ?? failure);
  }
  return result.dictionaries.map((entry) => (typeof entry === 'string' ? entry : entry.id));
}

/** Every proper-nouns dictionary id that exists on disk. */
export function listProperNounsDictionaryIds(): Promise<string[]> {
  return listIds(
    () => window.electronAPI.listProperNounsDictionaries(),
    'Failed to list proper-nouns dictionaries'
  );
}

/** Every structural-patterns dictionary id (`patterns-f_X`, `patterns-_X`) that exists on disk. */
export function listFictionPatternDictionaryIds(): Promise<string[]> {
  return listIds(
    () => window.electronAPI.listFictionPatternDictionaries(),
    'Failed to list fiction pattern dictionaries'
  );
}

export interface BatchLoadResult {
  /** Raw (unsorted) data per dictionary ID. A failed ID is absent, never `{}`: an empty
   * placeholder reads as a real empty dictionary, and the next edit's save would write it over
   * the file that failed to load (GLOSSARY.md "Unread dictionary", ADR-053). A file that does
   * not exist yet is not a failure — Rust loads it as `{}`. */
  loadedDictionaries: Record<string, DictionaryData>;
  /** IDs that failed the parallel load AND the serial retry — the unread dictionaries. */
  stillFailedIds: string[];
  /** Total IDs requested. */
  total: number;
}

/**
 * Parallel batch load with one batched retry for cold-launch failures.
 *
 * Owns: loadDictionariesParallel → one retry of the failed ids → classification.
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
    }
  });

  const stillFailedIds: string[] = [];
  if (failedIds.length > 0) {
    logger.warn(
      `⚠️ Initial parallel load failed for ${failedIds.length} dictionaries — retrying: ${failedIds.join(', ')}`
    );
    let retryResults: BatchDictionaryResult[];
    try {
      retryResults = (await window.electronAPI.loadDictionariesParallel(failedIds)).results;
    } catch (e) {
      logger.error('❌ Retry failed:', extractErrorMessage(e));
      retryResults = [];
    }
    const retried = new Map(retryResults.map((r) => [r.dictionary_id, r]));
    for (const id of failedIds) {
      const r = retried.get(id);
      if (r?.success && r.data) {
        loadedDictionaries[id] = r.data;
        logger.log(`✅ Retry succeeded for dictionary "${id}"`);
      } else {
        stillFailedIds.push(id);
        logger.error(`❌ Retry failed for dictionary "${id}":`, r?.error);
      }
    }
  }

  return { loadedDictionaries, stillFailedIds, total };
}
