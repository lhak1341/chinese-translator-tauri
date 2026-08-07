import { useState, useRef, useEffect, useCallback } from 'react';
import type { DictionaryData, DictionaryEntryValue } from '../types/DictionaryTypes';
import { parseDuplicateKey } from '../utils/dictionary';
import { toast } from '../components/ToastContext';
import { logger } from '../utils/logger';

export interface SelectionState {
  selectedEntries: Set<string>;
  selectedCount: number;
  onBulkDelete: () => Promise<void>;
  isDeleting: boolean;
  showBulkDeleteConfirm: boolean;
  setShowBulkDeleteConfirm: (show: boolean) => void;
  onBulkMove?: () => void;
  isMoving?: boolean;
}

type BulkDeleteResult = { successCount: number; errors: string[] };

interface UseEntrySelectionDeps {
  selectedDictionary: string;
  filteredEntries: [string, DictionaryEntryValue][];
  dictionaries: Record<string, DictionaryData>;
  showDuplicatesMode: boolean;
  withScrollPreservation: (asyncFn: () => Promise<void>) => Promise<void>;
  bulkDeleteEntries: (dictId: string, sources: string[]) => Promise<BulkDeleteResult>;
  /** Refreshes the duplicate list after a delete, preserving scroll across the resulting remount. */
  refreshDuplicatesPreservingScroll?: () => Promise<void>;
  onSelectionChange?: (state: SelectionState) => void;
}

export function useEntrySelection({
  selectedDictionary,
  filteredEntries,
  dictionaries,
  showDuplicatesMode,
  withScrollPreservation,
  bulkDeleteEntries,
  refreshDuplicatesPreservingScroll,
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
          const allSources = filteredEntries.map(([source]) => source);
          setSelectedEntries(new Set(allSources));
        } else {
          setSelectedEntries(new Set());
        }
      });
    },
    [filteredEntries, withScrollPreservation]
  );

  const handleBulkDelete = useCallback(async (): Promise<void> => {
    const entries = selectedEntriesRef.current;
    if (entries.size === 0) return;

    setIsDeleting(true);

    const errors: string[] = [];
    let successCount = 0;

    try {
      if (showDuplicatesMode) {
        // Duplicate mode: entries contains composite keys (source::dictionaryId)
        // Group deletions by dictionary, handling malformed keys gracefully
        const deletionsByDict = new Map<string, string[]>();

        for (const key of entries) {
          try {
            const { source, dictionaryId } = parseDuplicateKey(key);
            if (!deletionsByDict.has(dictionaryId)) {
              deletionsByDict.set(dictionaryId, []);
            }
            deletionsByDict.get(dictionaryId)!.push(source);
          } catch (parseError) {
            errors.push(`Invalid key format: ${key}`);
            logger.error('Key parsing error:', parseError);
          }
        }

        // Delete from each dictionary using bulkDeleteEntries (more efficient - one save per dictionary)
        const deletionPromises = Array.from(deletionsByDict.entries()).map(
          async ([dictionaryId, sources]) => {
            try {
              if (!dictionaries[dictionaryId]) {
                return {
                  successCount: 0,
                  errors: [`Dictionary '${dictionaryId}' no longer exists`],
                };
              }
              const result = await bulkDeleteEntries(dictionaryId, sources);
              return result;
            } catch (deleteError) {
              const errorMsg = `Failed to delete entries from ${dictionaryId}: ${(deleteError as Error).message}`;
              logger.error('Bulk delete error:', deleteError);
              return { successCount: 0, errors: [errorMsg] };
            }
          }
        );

        const results = await Promise.all(deletionPromises);
        for (const result of results) {
          successCount += result.successCount;
          errors.push(...result.errors);
        }
      } else {
        // Normal mode: entries contains source strings, all from same dictionary
        const entriesToDelete = Array.from(entries);
        try {
          const result = await bulkDeleteEntries(selectedDictionary, entriesToDelete);
          successCount = result.successCount;
          errors.push(...result.errors);
        } catch (deleteError) {
          errors.push(`Failed to delete entries: ${(deleteError as Error).message}`);
          logger.error('Bulk delete error:', deleteError);
        }
      }

      if (errors.length > 0) {
        if (successCount > 0) {
          toast.warning(
            `Deleted ${successCount} of ${entries.size} entries. ${errors.length} failed.`,
            6000
          );
        } else {
          toast.error(
            `Failed to delete ${entries.size} ${entries.size === 1 ? 'entry' : 'entries'}.`,
            6000
          );
        }
      } else {
        toast.success(
          `Deleted ${successCount} ${successCount === 1 ? 'entry' : 'entries'} successfully`,
          3000
        );
      }

      if (successCount > 0) {
        setSelectedEntries(new Set());
        setShowBulkDeleteConfirm(false);
      }

      if (showDuplicatesMode && refreshDuplicatesPreservingScroll) {
        await refreshDuplicatesPreservingScroll();
      }
    } catch (error) {
      toast.error(`Critical error during deletion: ${(error as Error).message}`, 6000);
      logger.error('Bulk delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [
    selectedDictionary,
    bulkDeleteEntries,
    dictionaries,
    showDuplicatesMode,
    refreshDuplicatesPreservingScroll,
  ]);

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
        onBulkMove: handleBulkMove,
        isMoving: false,
      });
    }
  }, [
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
