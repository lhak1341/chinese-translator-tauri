import { useState, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { sortDictionaryEntries } from '../../utils/dictionaryHelpers';
import { logger } from '../../utils/logger';
import type { DictionaryData, HistoryOperation } from '../../types/DictionaryTypes';

const MAX_HISTORY = 100;

/** Persists sorted entries to disk and updates React state. Returns true on success. */
type CommitMutation = (
  updates: Array<{ dictionaryId: string; entries: DictionaryData }>
) => Promise<boolean>;

/** Clears translation engine caches for a dictionary after mutation. */
type InvalidateEngine = (dictionaryId: string) => Promise<void>;

export interface DictionaryHistoryAPI {
  addToHistory: (op: Omit<HistoryOperation, 'timestamp'>) => void;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Manages dictionary operation history, undo, and redo.
 *
 * Owns: history array, cursor, MAX_HISTORY cap, and diff reversal for all 5 operation types.
 *
 * @param dictionariesRef - Ref-mirror of current dictionary state (owned by DictionaryProvider)
 * @param commitMutation - sort → save → setDictionaries; returns true on success
 * @param invalidateEngine - clears engine caches for a dictionary ID
 */
export function useDictionaryHistory(
  dictionariesRef: RefObject<Record<string, DictionaryData>>,
  commitMutation: CommitMutation,
  invalidateEngine: InvalidateEngine
): DictionaryHistoryAPI {
  const [history, setHistory] = useState<HistoryOperation[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1);
  // Ref-mirror so addToHistory reads the latest index without being recreated on every undo/redo
  const currentHistoryIndexRef = useRef(currentHistoryIndex);
  currentHistoryIndexRef.current = currentHistoryIndex;

  const addToHistory = useCallback(
    (operation: Omit<HistoryOperation, 'timestamp'>): void => {
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, currentHistoryIndexRef.current + 1);
        newHistory.push({ ...operation, timestamp: Date.now() });
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift();
        }
        return newHistory;
      });
      setCurrentHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
    },
    [] // stable — reads currentHistoryIndex via currentHistoryIndexRef.current
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- dictionariesRef is a stable ref; intentionally excluded
  const undo = useCallback(async (): Promise<boolean> => {
    if (currentHistoryIndex < 0) return false;
    const operation = history[currentHistoryIndex];

    if (
      (operation.operation === 'move' || operation.operation === 'bulk_move') &&
      operation.targetDictionaryId
    ) {
      const currentDicts = dictionariesRef.current;
      const sourceDict = currentDicts[operation.dictionaryId];
      const targetDict = currentDicts[operation.targetDictionaryId];
      if (!sourceDict || !targetDict) {
        logger.error(`Cannot undo move: dictionaries not found`);
        return false;
      }

      const newTargetDict = { ...targetDict };
      const newSourceDict = { ...sourceDict };

      const entries =
        operation.operation === 'move'
          ? operation.oldEntry
            ? [operation.oldEntry]
            : []
          : (operation.oldEntries ?? []);

      for (const e of entries) {
        delete newTargetDict[e.source];
        newSourceDict[e.source] = e.value;
      }

      const sortedSource = sortDictionaryEntries(newSourceDict, operation.dictionaryId);
      const sortedTarget = sortDictionaryEntries(newTargetDict, operation.targetDictionaryId);

      const ok = await commitMutation([
        { dictionaryId: operation.dictionaryId, entries: sortedSource },
        { dictionaryId: operation.targetDictionaryId, entries: sortedTarget },
      ]);
      if (ok) {
        setCurrentHistoryIndex((prev) => prev - 1);
        await invalidateEngine(operation.dictionaryId);
        await invalidateEngine(operation.targetDictionaryId);
        return true;
      }
      return false;
    }

    // Read from ref-mirror instead of setDictionaries side-effect (React Concurrent Mode safe)
    const currentDict = dictionariesRef.current[operation.dictionaryId];
    if (!currentDict) {
      logger.error(`Cannot undo: dictionary ${operation.dictionaryId} not found`);
      return false;
    }

    let newDict = { ...currentDict };

    if (operation.operation === 'add') {
      if (operation.entry) delete newDict[operation.entry.source];
    } else if (operation.operation === 'update') {
      if (operation.oldEntry) {
        if (operation.oldSource && operation.oldSource !== operation.entry?.source) {
          delete newDict[operation.entry!.source];
        }
        newDict[operation.oldEntry.source] = operation.oldEntry.value;
      }
    } else if (operation.operation === 'delete') {
      if (operation.oldEntry) newDict[operation.oldEntry.source] = operation.oldEntry.value;
    } else if (operation.operation === 'bulk_delete') {
      if (operation.oldEntries) {
        for (const oldEntry of operation.oldEntries) {
          newDict[oldEntry.source] = oldEntry.value;
        }
      }
    }

    const updatedDict = sortDictionaryEntries(newDict, operation.dictionaryId);
    const ok = await commitMutation([
      { dictionaryId: operation.dictionaryId, entries: updatedDict },
    ]);
    if (ok) {
      setCurrentHistoryIndex((prev) => prev - 1);
      await invalidateEngine(operation.dictionaryId);
      return true;
    }
    return false;
  }, [history, currentHistoryIndex, commitMutation, invalidateEngine]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- dictionariesRef is a stable ref; intentionally excluded
  const redo = useCallback(async (): Promise<boolean> => {
    if (currentHistoryIndex >= history.length - 1) return false;
    const operation = history[currentHistoryIndex + 1];

    if (
      (operation.operation === 'move' || operation.operation === 'bulk_move') &&
      operation.targetDictionaryId
    ) {
      const sourceDict = dictionariesRef.current[operation.dictionaryId];
      const targetDict = dictionariesRef.current[operation.targetDictionaryId];
      if (!sourceDict || !targetDict) {
        logger.error(`Cannot redo move: dictionaries not found`);
        return false;
      }

      const newSourceDict = { ...sourceDict };
      const newTargetDict = { ...targetDict };

      const entries =
        operation.operation === 'move'
          ? operation.oldEntry
            ? [operation.oldEntry]
            : []
          : (operation.oldEntries ?? []);

      for (const e of entries) {
        delete newSourceDict[e.source];
        newTargetDict[e.source] = e.value;
      }

      const sortedSource = sortDictionaryEntries(newSourceDict, operation.dictionaryId);
      const sortedTarget = sortDictionaryEntries(newTargetDict, operation.targetDictionaryId);

      const ok = await commitMutation([
        { dictionaryId: operation.dictionaryId, entries: sortedSource },
        { dictionaryId: operation.targetDictionaryId, entries: sortedTarget },
      ]);
      if (ok) {
        setCurrentHistoryIndex((prev) => prev + 1);
        await invalidateEngine(operation.dictionaryId);
        await invalidateEngine(operation.targetDictionaryId);
        return true;
      }
      return false;
    }

    // Read from ref-mirror instead of setDictionaries side-effect (React Concurrent Mode safe)
    const currentDict = dictionariesRef.current[operation.dictionaryId];
    if (!currentDict) {
      logger.error(`Cannot redo: dictionary ${operation.dictionaryId} not found`);
      return false;
    }

    let newDict = { ...currentDict };

    if (operation.operation === 'add') {
      if (operation.entry) newDict[operation.entry.source] = operation.entry.value;
    } else if (operation.operation === 'update') {
      if (operation.entry) {
        if (operation.oldSource && operation.oldSource !== operation.entry.source) {
          delete newDict[operation.oldSource];
        }
        newDict[operation.entry.source] = operation.entry.value;
      }
    } else if (operation.operation === 'delete') {
      if (operation.oldEntry) delete newDict[operation.oldEntry.source];
    } else if (operation.operation === 'bulk_delete') {
      if (operation.oldEntries) {
        for (const oldEntry of operation.oldEntries) {
          delete newDict[oldEntry.source];
        }
      }
    }

    const updatedDict = sortDictionaryEntries(newDict, operation.dictionaryId);
    const ok = await commitMutation([
      { dictionaryId: operation.dictionaryId, entries: updatedDict },
    ]);
    if (ok) {
      setCurrentHistoryIndex((prev) => prev + 1);
      await invalidateEngine(operation.dictionaryId);
      return true;
    }
    return false;
  }, [history, currentHistoryIndex, commitMutation, invalidateEngine]);

  return {
    addToHistory,
    undo,
    redo,
    canUndo: currentHistoryIndex >= 0,
    canRedo: currentHistoryIndex < history.length - 1,
  };
}
