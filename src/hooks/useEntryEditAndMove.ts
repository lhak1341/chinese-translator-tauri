import { useState, useEffect, useCallback } from 'react';
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
  scrollRef: React.RefObject<HTMLElement>;
  setScrollTop: (top: number) => void;
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

/**
 * Owns the inline-edit and move-dialog lifecycle for a dictionary table row.
 *
 * Encapsulates the scroll-preservation invariant:
 *   1. Capture scrollTop before any async entry update.
 *   2. Set isUpdating=true (blocks re-scroll triggers).
 *   3. Await the update.
 *   4. When isUpdating flips false with a captured position, restore via RAF.
 *
 * The eslint-disable on the restore effect is intentional — scrollRef and setScrollTop
 * are stable refs/callbacks from useVirtualScrollRange; adding them to deps would cause
 * the RAF to fire on every scroll event.
 */
export function useEntryEditAndMove({
  dictionaries,
  selectedDictionary,
  updateEntry,
  scrollRef,
  setScrollTop,
}: UseEntryEditAndMoveParams): UseEntryEditAndMoveResult {
  const [editingEntry, setEditingEntry] = useState<EditingEntryData | null>(null);
  const [moveEntry, setMoveEntry] = useState<MoveEntryData | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [preservedScrollTop, setPreservedScrollTop] = useState<number | null>(null);

  useEffect(() => {
    if (!isUpdating && preservedScrollTop !== null && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = preservedScrollTop;
          setScrollTop(preservedScrollTop);
        }
        setPreservedScrollTop(null);
      });
    }
  }, [isUpdating, preservedScrollTop]); // eslint-disable-line react-hooks/exhaustive-deps

  // preservedScrollTop MUST be set before isUpdating=true.
  // BUGFIX: Read scrollRef.current directly — including scrollTop in deps causes
  // callback recreation on every scroll → cascade of updates.
  const updateEntryWithScrollPreservation = useCallback(
    async (
      dictionaryId: string,
      oldSource: string,
      newSource: string,
      translation: string,
      metadata?: any
    ): Promise<void> => {
      const currentScrollTop = scrollRef.current?.scrollTop ?? 0;
      setPreservedScrollTop(currentScrollTop);
      setIsUpdating(true);
      try {
        await updateEntry(dictionaryId, oldSource, newSource, translation, metadata);
      } finally {
        setIsUpdating(false);
      }
    },
    [updateEntry]
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
    setIsUpdating(false);
    setPreservedScrollTop(null);
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
