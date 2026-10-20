import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  DictionaryContextInterface,
  DictionaryData,
  DictionaryEntryValue,
} from '../types/DictionaryTypes';
import { parseDuplicateKey, createDuplicateKey } from '../utils/dictionary';
import type { DuplicateRow } from '../utils/dictionary/DuplicateAnalyzer';
import type { EntryRef } from '../utils/dictionary/DictionaryEdit';
import toast from '../utils/toast';
import { logger } from '../utils/logger';

export interface SelectionState {
  selectedEntries: Set<string>;
  selectedCount: number;
  onBulkDelete: () => Promise<void>;
  isDeleting: boolean;
  showBulkDeleteConfirm: boolean;
  setShowBulkDeleteConfirm: (show: boolean) => void;
  onBulkMove?: () => void;
}

interface UseEntrySelectionDeps {
  selectedDictionary: string;
  filteredEntries: [string, DictionaryEntryValue][];
  filteredDuplicateRows: DuplicateRow[];
  dictionaries: Record<string, DictionaryData>;
  showDuplicatesMode: boolean;
  withScrollPreservation: (asyncFn: () => Promise<void>) => Promise<void>;
  bulkDeleteEntries: DictionaryContextInterface['bulkDeleteEntries'];
  onSelectionChange?: (state: SelectionState) => void;
}

export function useEntrySelection({
  selectedDictionary,
  filteredEntries,
  filteredDuplicateRows,
  dictionaries,
  showDuplicatesMode,
  withScrollPreservation,
  bulkDeleteEntries,
  onSelectionChange,
}: UseEntrySelectionDeps) {
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const selectedEntriesRef = useRef<Set<string>>(new Set());
  selectedEntriesRef.current = selectedEntries;

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const resetSelection = useCallback(() => {
    setSelectedEntries(new Set());
    setShowBulkDeleteConfirm(false);
    setShowBulkMoveDialog(false);
    setIsDeleting(false);
  }, []);

  // Drop selected keys whose entry no longer exists (deleted or moved from the context menu,
  // undone, edited to a new source). Without this the toolbar count stays too high and a bulk
  // delete reports the ghosts as "not found" failures. Keys merely hidden by the search/filter
  // are kept — only a key with no entry behind it is removed.
  useEffect(() => {
    setSelectedEntries((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const key of prev) {
        let dictionaryId = selectedDictionary;
        let source = key;
        if (showDuplicatesMode) {
          try {
            ({ source, dictionaryId } = parseDuplicateKey(key));
          } catch {
            continue;
          }
        }
        if (dictionaries[dictionaryId]?.[source] !== undefined) next.add(key);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [dictionaries, selectedDictionary, showDuplicatesMode]);

  const handleSelectEntry = useCallback(
    (source: string, isSelected: boolean): void => {
      void withScrollPreservation(async () => {
        setSelectedEntries((prev) => {
          const newSet = new Set(prev);
          if (isSelected) {
            newSet.add(source);
          } else {
            newSet.delete(source);
          }
          return newSet;
        });
      });
    },
    [withScrollPreservation]
  );

  const handleSelectAll = useCallback(
    (isSelected: boolean): void => {
      void withScrollPreservation(async () => {
        if (isSelected) {
          const allKeys = showDuplicatesMode
            ? filteredDuplicateRows.map((row) => createDuplicateKey(row.source, row.dictionaryId))
            : filteredEntries.map(([source]) => source);
          setSelectedEntries(new Set(allKeys));
        } else {
          setSelectedEntries(new Set());
        }
      });
    },
    [filteredEntries, filteredDuplicateRows, showDuplicatesMode, withScrollPreservation]
  );

  // The selection becomes one list of entries and one `bulkDeleteEntries` call, which commits
  // it as one Dictionary Edit and owns every message. This hook toasts only a selection it
  // cannot read: a malformed duplicate-view key is a bug, so nothing is deleted.
  const handleBulkDelete = useCallback(async (): Promise<void> => {
    const entries = selectedEntriesRef.current;
    if (entries.size === 0) return;

    let targets: EntryRef[];
    try {
      targets = Array.from(entries, (key) => {
        if (!showDuplicatesMode) return { dictionaryId: selectedDictionary, key };
        const { source, dictionaryId } = parseDuplicateKey(key);
        return { dictionaryId, key: source };
      });
    } catch (error) {
      logger.error('Bulk delete: unreadable selection key', error);
      toast.error('Could not delete: the selection could not be read. Nothing was deleted.');
      return;
    }

    setIsDeleting(true);
    try {
      const { count } = await bulkDeleteEntries(targets);
      if (count > 0) {
        setSelectedEntries(new Set());
        setShowBulkDeleteConfirm(false);
      }
    } catch {
      // Already logged and toasted by `bulkDeleteEntries`; the selection stays for a retry.
    } finally {
      setIsDeleting(false);
    }
  }, [selectedDictionary, bulkDeleteEntries, showDuplicatesMode]);

  const handleBulkMove = useCallback((): void => {
    if (selectedEntriesRef.current.size === 0) return;
    setShowBulkMoveDialog(true);
  }, []);

  // Notify parent about selection changes — placed after handleBulkDelete /
  // handleBulkMove so the dep array can reference their stable useCallback values.
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange({
        selectedEntries,
        selectedCount: selectedEntries.size,
        onBulkDelete: handleBulkDelete,
        isDeleting,
        showBulkDeleteConfirm,
        setShowBulkDeleteConfirm,
        // Duplicate-mode selections span several dictionaries (composite keys) — one move
        // dialog has one source dictionary, so bulk move is offered only in the normal view.
        // Single rows still move from the duplicate view's context menu.
        onBulkMove: showDuplicatesMode ? undefined : handleBulkMove,
      });
    }
  }, [
    showDuplicatesMode,
    selectedEntries,
    isDeleting,
    showBulkDeleteConfirm,
    onSelectionChange,
    handleBulkDelete,
    handleBulkMove,
  ]);

  return {
    selectedEntries,
    selectedEntriesRef,
    isDeleting,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    showBulkMoveDialog,
    setShowBulkMoveDialog,
    handleSelectEntry,
    handleSelectAll,
    handleBulkDelete,
    handleBulkMove,
    resetSelection,
  };
}
