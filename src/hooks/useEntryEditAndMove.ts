import { useState, useCallback } from 'react';
import type { EditingEntryData, MoveEntryData, DictionaryData } from '../types/DictionaryTypes';

interface UseEntryEditAndMoveParams {
  dictionaries: Record<string, DictionaryData>;
  selectedDictionary: string;
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
  setEditingEntry: React.Dispatch<React.SetStateAction<EditingEntryData | null>>;
  moveEntry: MoveEntryData | null;
  setMoveEntry: React.Dispatch<React.SetStateAction<MoveEntryData | null>>;
  updateEntryWithScrollPreservation: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: any
  ) => Promise<void>;
  onContextMenuEdit: (entry: { source: string; translation: string }) => void;
  onContextMenuMove: (entry: { source: string; translation: string }) => void;
  reset: () => void;
}

export function useEntryEditAndMove({
  dictionaries,
  selectedDictionary,
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
    (entry: { source: string; translation: string }): void => {
      const dictionary = dictionaries[selectedDictionary];
      if (!dictionary) return;
      const value = dictionary[entry.source];
      setEditingEntry({
        source: entry.source,
        translation: value,
        allowAsPatternVariable:
          typeof value === 'object' && value.allowAsPatternVariable ? true : false,
        lowPriority: typeof value === 'object' && value.lowPriority ? true : false,
      });
    },
    [dictionaries, selectedDictionary]
  );

  const onContextMenuMove = useCallback((entry: { source: string; translation: string }): void => {
    setMoveEntry(entry);
  }, []);

  const reset = useCallback((): void => {
    setEditingEntry(null);
    setMoveEntry(null);
  }, []);

  return {
    editingEntry,
    setEditingEntry,
    moveEntry,
    setMoveEntry,
    updateEntryWithScrollPreservation,
    onContextMenuEdit,
    onContextMenuMove,
    reset,
  };
}
