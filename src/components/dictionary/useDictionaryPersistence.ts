import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DictionaryData } from '../../types/DictionaryTypes';
import type { MoveOpUpdates } from '../../hooks/useDictionaryCRUD';

export type PersistDictionaryMutation = (
  dictionaryId: string,
  oldData: DictionaryData,
  sortedEntries: DictionaryData
) => Promise<boolean>;

export type CommitMoveOp = (updates: MoveOpUpdates) => Promise<boolean>;

export interface DictionaryPersistenceAPI {
  persistDictionaryMutation: PersistDictionaryMutation;
  commitMoveOp: CommitMoveOp;
}

/**
 * Owns the two write-to-disk protocols used by dictionary CRUD ops.
 *
 * persistDictionaryMutation — single-dict: optimistic setDictionaries → saveDictionary → rollback on failure.
 * commitMoveOp             — two-dict:   optimistic setDictionaries → parallel save → partial revert on failure.
 *
 * Callers (useDictionaryCRUD) own: diff computation, sort, addToHistory, toast, invalidateEngine.
 *
 * Both returned callbacks are stable ([] dep arrays).
 */
export function useDictionaryPersistence(
  setDictionaries: Dispatch<SetStateAction<Record<string, DictionaryData>>>
): DictionaryPersistenceAPI {
  const persistDictionaryMutation = useCallback<PersistDictionaryMutation>(
    async (dictionaryId, oldData, sortedEntries) => {
      setDictionaries((prev) => ({ ...prev, [dictionaryId]: sortedEntries }));
      const result = await window.electronAPI.saveDictionary(dictionaryId, sortedEntries);
      if (result.success && result.data) return true;
      setDictionaries((prev) => ({ ...prev, [dictionaryId]: oldData }));
      return false;
    },
    [setDictionaries] // stable — setDictionaries from useState is stable
  );

  const commitMoveOp = useCallback<CommitMoveOp>(
    async ({ sourceDictId, oldSource, newSource, targetDictId, oldTarget, newTarget }) => {
      setDictionaries((prev) => ({
        ...prev,
        [sourceDictId]: newSource,
        [targetDictId]: newTarget,
      }));
      const [sr, tr] = await Promise.all([
        window.electronAPI.saveDictionary(sourceDictId, newSource),
        window.electronAPI.saveDictionary(targetDictId, newTarget),
      ]);
      if (sr.success && tr.success) return true;
      setDictionaries((prev) => ({
        ...prev,
        [sourceDictId]: oldSource,
        [targetDictId]: oldTarget,
      }));
      if (sr.success && !tr.success)
        await window.electronAPI.saveDictionary(sourceDictId, oldSource).catch(() => {});
      else if (!sr.success && tr.success)
        await window.electronAPI.saveDictionary(targetDictId, oldTarget).catch(() => {});
      return false;
    },
    [setDictionaries] // stable — setDictionaries from useState is stable
  );

  return { persistDictionaryMutation, commitMoveOp };
}
