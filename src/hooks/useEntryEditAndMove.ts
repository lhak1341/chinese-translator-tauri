import { useState, useCallback } from 'react';
import type { EditingEntryData, MoveEntryData, DictionaryData } from '../types/DictionaryTypes';
import type { ContextMenuEntry } from './useContextMenu';

interface UseEntryEditAndMoveParams {
  dictionaries: Record<string, DictionaryData>;
  updateEntry: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: any
  ) => Promise<void>;
  withScrollPreservation: (asyncFn: () => Promise<void>) => Promise<void>;
}

export interface UseEntryEditAndMoveResult {
  editingEntry: EditingEntryData | null;
  moveEntry: MoveEntryData | null;
  closeEdit: () => void;
  closeMove: () => void;
  updateEntryWithScrollPreservation: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: any
  ) => Promise<void>;
  onContextMenuEdit: (entry: ContextMenuEntry) => void;
  onContextMenuMove: (entry: ContextMenuEntry) => void;
  reset: () => void;
}

export function useEntryEditAndMove({
  dictionaries,
  updateEntry,
  withScrollPreservation,
}: UseEntryEditAndMoveParams): UseEntryEditAndMoveResult {
  const [editingEntry, setEditingEntry] = useState<EditingEntryData | null>(null);
  const [moveEntry, setMoveEntry] = useState<MoveEntryData | null>(null);

  const updateEntryWithScrollPreservation = useCallback(
    async (
      dictionaryId: string,
      oldSource: string,
      newSource: string,
      translation: string,
      metadata?: any
    ): Promise<void> => {
      await withScrollPreservation(() =>
        updateEntry(dictionaryId, oldSource, newSource, translation, metadata)
      );
    },
    [updateEntry, withScrollPreservation]
  );

  const onContextMenuEdit = useCallback(
    (entry: ContextMenuEntry): void => {
      const dictionary = dictionaries[entry.dictionaryId];
      if (!dictionary) return;
      const value = dictionary[entry.source];
      setEditingEntry({
        source: entry.source,
        translation: value,
        allowAsPatternVariable:
          typeof value === 'object' && value.allowAsPatternVariable ? true : false,
        dictionaryId: entry.dictionaryId,
      });
    },
    [dictionaries]
  );

  const onContextMenuMove = useCallback((entry: ContextMenuEntry): void => {
    setMoveEntry(entry);
  }, []);

  const closeEdit = useCallback((): void => {
    setEditingEntry(null);
  }, []);

  const closeMove = useCallback((): void => {
    setMoveEntry(null);
  }, []);

  const reset = useCallback((): void => {
    setEditingEntry(null);
    setMoveEntry(null);
  }, []);

  return {
    editingEntry,
    moveEntry,
    closeEdit,
    closeMove,
    updateEntryWithScrollPreservation,
    onContextMenuEdit,
    onContextMenuMove,
    reset,
  };
}
