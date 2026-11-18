import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { DictionaryContextInterface, DictionaryData } from '../types/DictionaryTypes';
import { entryRefKey, type EntryRef } from '../utils/dictionary/DictionaryEdit';

export interface SelectionState {
  selectedCount: number;
  onBulkDelete: () => Promise<void>;
  isDeleting: boolean;
  showBulkDeleteConfirm: boolean;
  setShowBulkDeleteConfirm: (show: boolean) => void;
  onBulkMove?: () => void;
}

interface UseEntrySelectionDeps {
  /** Every row the view shows after its filters, which select-all selects. */
  entries: EntryRef[];
  dictionaries: Record<string, DictionaryData>;
  /** Whether a selection can move as a whole. The duplicate view's spans several dictionaries
   * and one move dialog has one source, so it passes false; single rows still move from the
   * context menu. */
  canBulkMove: boolean;
  withScrollPreservation: (asyncFn: () => Promise<void>) => Promise<void>;
  bulkDeleteEntries: DictionaryContextInterface['bulkDeleteEntries'];
  onSelectionChange?: (state: SelectionState) => void;
}

/** A selection, by entry. Keyed by `entryRefKey`, which is never parsed back: the entries
 * themselves are the values, so nothing here can be unreadable. */
type Selection = Map<string, EntryRef>;

/**
 * The Dictionary table's multi-select, bulk delete and bulk move. It speaks entries (`EntryRef`)
 * in both views: a normal-view row names the selected dictionary, a duplicate-view row its own.
 */
export function useEntrySelection({
  entries,
  dictionaries,
  canBulkMove,
  withScrollPreservation,
  bulkDeleteEntries,
  onSelectionChange,
}: UseEntrySelectionDeps) {
  const [selection, setSelection] = useState<Selection>(new Map());
  const selectionRef = useRef<Selection>(selection);
  selectionRef.current = selection;

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const resetSelection = useCallback(() => {
    setSelection(new Map());
    setShowBulkDeleteConfirm(false);
    setShowBulkMoveDialog(false);
    setIsDeleting(false);
  }, []);

  // Drop selected keys whose entry no longer exists (deleted or moved from the context menu,
  // undone, edited to a new source). Without this the toolbar count stays too high and a bulk
  // delete reports the ghosts as "not found" failures. Keys merely hidden by the search/filter
  // are kept — only a key with no entry behind it is removed.
  useEffect(() => {
    setSelection((prev) => {
      if (prev.size === 0) return prev;
      const next: Selection = new Map();
      for (const [k, ref] of prev) {
        if (dictionaries[ref.dictionaryId]?.[ref.key] !== undefined) next.set(k, ref);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [dictionaries]);

  const isSelected = useCallback(
    (ref: EntryRef): boolean => selection.has(entryRefKey(ref)),
    [selection]
  );

  const setSelected = useCallback(
    (ref: EntryRef, on: boolean): void => {
      void withScrollPreservation(async () => {
        setSelection((prev) => {
          const next = new Map(prev);
          if (on) next.set(entryRefKey(ref), ref);
          else next.delete(entryRefKey(ref));
          return next;
        });
      });
    },
    [withScrollPreservation]
  );

  const handleSelectAll = useCallback(
    (on: boolean): void => {
      void withScrollPreservation(async () => {
        setSelection(on ? new Map(entries.map((ref) => [entryRefKey(ref), ref])) : new Map());
      });
    },
    [entries, withScrollPreservation]
  );

  // The selection becomes one list of entries and one `bulkDeleteEntries` call, which commits
  // it as one Dictionary Edit and owns every message.
  const handleBulkDelete = useCallback(async (): Promise<void> => {
    const current = selectionRef.current;
    if (current.size === 0) return;

    setIsDeleting(true);
    try {
      const { count } = await bulkDeleteEntries([...current.values()]);
      if (count > 0) {
        setSelection(new Map());
        setShowBulkDeleteConfirm(false);
      }
    } catch {
      // Already logged and toasted by `bulkDeleteEntries`; the selection stays for a retry.
    } finally {
      setIsDeleting(false);
    }
  }, [bulkDeleteEntries]);

  const handleBulkMove = useCallback((): void => {
    if (selectionRef.current.size === 0) return;
    setShowBulkMoveDialog(true);
  }, []);

  // Notify parent about selection changes — placed after handleBulkDelete /
  // handleBulkMove so the dep array can reference their stable useCallback values.
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange({
        selectedCount: selection.size,
        onBulkDelete: handleBulkDelete,
        isDeleting,
        showBulkDeleteConfirm,
        setShowBulkDeleteConfirm,
        onBulkMove: canBulkMove ? handleBulkMove : undefined,
      });
    }
  }, [
    canBulkMove,
    selection,
    isDeleting,
    showBulkDeleteConfirm,
    onSelectionChange,
    handleBulkDelete,
    handleBulkMove,
  ]);

  const selectedRefs = useMemo(() => [...selection.values()], [selection]);

  return {
    isSelected,
    selectedRefs,
    selectedCount: selection.size,
    isDeleting,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    showBulkMoveDialog,
    setShowBulkMoveDialog,
    setSelected,
    handleSelectAll,
    handleBulkDelete,
    handleBulkMove,
    resetSelection,
  };
}
