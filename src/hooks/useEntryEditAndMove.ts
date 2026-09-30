import { useState, useCallback } from 'react';
import type {
  EditingEntryData,
  MoveEntryData,
  DictionaryData,
  DictionaryContextInterface,
} from '../types/DictionaryTypes';
import type { ContextMenuEntry } from './useContextMenu';
import { entryFields } from '../utils/dictionary';

interface UseEntryEditAndMoveParams {
  dictionaries: Record<string, DictionaryData>;
  renameEntry: DictionaryContextInterface['renameEntry'];
  patchEntry: DictionaryContextInterface['patchEntry'];
  withScrollPreservation: (asyncFn: () => Promise<void>) => Promise<void>;
}

export interface UseEntryEditAndMoveResult {
  editingEntry: EditingEntryData | null;
  moveEntry: MoveEntryData | null;
  closeEdit: () => void;
  closeMove: () => void;
  renameEntryWithScrollPreservation: DictionaryContextInterface['renameEntry'];
  patchEntryWithScrollPreservation: DictionaryContextInterface['patchEntry'];
  onContextMenuEdit: (entry: ContextMenuEntry) => void;
  onContextMenuMove: (entry: ContextMenuEntry) => void;
}

export function useEntryEditAndMove({
  dictionaries,
  renameEntry,
  patchEntry,
  withScrollPreservation,
}: UseEntryEditAndMoveParams): UseEntryEditAndMoveResult {
  const [editingEntry, setEditingEntry] = useState<EditingEntryData | null>(null);
  const [moveEntry, setMoveEntry] = useState<MoveEntryData | null>(null);

  const renameEntryWithScrollPreservation = useCallback<DictionaryContextInterface['renameEntry']>(
    async (dictionaryId, oldSource, newSource) => {
      await withScrollPreservation(() => renameEntry(dictionaryId, oldSource, newSource));
    },
    [renameEntry, withScrollPreservation]
  );

  const patchEntryWithScrollPreservation = useCallback<DictionaryContextInterface['patchEntry']>(
    async (dictionaryId, source, patch) => {
      await withScrollPreservation(() => patchEntry(dictionaryId, source, patch));
    },
    [patchEntry, withScrollPreservation]
  );

  const onContextMenuEdit = useCallback(
    (entry: ContextMenuEntry): void => {
      const dictionary = dictionaries[entry.dictionaryId];
      if (!dictionary) return;
      const value = dictionary[entry.source];
      setEditingEntry({
        source: entry.source,
        translation: value,
        allowAsPatternVariable: entryFields(value).allowAsPatternVariable,
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

  return {
    editingEntry,
    moveEntry,
    closeEdit,
    closeMove,
    renameEntryWithScrollPreservation,
    patchEntryWithScrollPreservation,
    onContextMenuEdit,
    onContextMenuMove,
  };
}
