import { useState, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { logger } from '../../utils/logger';
import {
  computeUndoMutation,
  computeRedoMutation,
} from '../../utils/dictionary/DictionaryOperationReverter';
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
 * Owns: history array, cursor, MAX_HISTORY cap.
 * Diff reversal delegated to computeUndoMutation / computeRedoMutation (pure, testable).
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

  const undo = useCallback(async (): Promise<boolean> => {
    if (currentHistoryIndex < 0) return false;
    const operation = history[currentHistoryIndex];

    const updates = computeUndoMutation(operation, dictionariesRef.current);
    if (!updates) {
      logger.error(`Cannot undo ${operation.operation}: required dictionaries not found`);
      return false;
    }

    const ok = await commitMutation(updates);
    if (ok) {
      setCurrentHistoryIndex((prev) => prev - 1);
      for (const { dictionaryId } of updates) {
        await invalidateEngine(dictionaryId);
      }
      return true;
    }
    return false;
  }, [history, currentHistoryIndex, commitMutation, invalidateEngine]);

  const redo = useCallback(async (): Promise<boolean> => {
    if (currentHistoryIndex >= history.length - 1) return false;
    const operation = history[currentHistoryIndex + 1];

    const updates = computeRedoMutation(operation, dictionariesRef.current);
    if (!updates) {
      logger.error(`Cannot redo ${operation.operation}: required dictionaries not found`);
      return false;
    }

    const ok = await commitMutation(updates);
    if (ok) {
      setCurrentHistoryIndex((prev) => prev + 1);
      for (const { dictionaryId } of updates) {
        await invalidateEngine(dictionaryId);
      }
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
