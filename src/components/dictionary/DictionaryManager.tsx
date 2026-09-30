import React, { useState, useEffect, useCallback } from 'react';
import {
  PlusCircle,
  Undo2,
  Redo2,
  Folder,
  AlertCircle,
  Loader,
  Download,
  Upload,
  Trash2,
  ArrowRightLeft,
  Search,
  X,
  RotateCw,
} from 'lucide-react';
import { dictionaryOptionLabel } from './DictionaryTypes';
import { useDictionary } from './DictionaryContext';
import EnhancedVirtualizedDictionaryTable from './EnhancedVirtualizedDictionaryTable';
import DictionaryEntry from './DictionaryEntry';
import { useHotkeyHandler } from '../../hooks/useHotkeyHandler';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import styles from '../../styles/DictionaryManager.module.css';
import { logger } from '../../utils/logger';
import { findConflictingEntries, getMoveFamily, type DuplicateRow } from '../../utils/dictionary';
import { quickAddChoices, type QuickAddView } from '../../utils/dictionary/QuickAddTarget';
import { toast } from '../ToastContext';
import { useBookBinding } from '../BookBindingContext';

/**
 * Selection state for bulk operations in Enhanced table
 */
interface SelectionState {
  /** Number of selected entries */
  selectedCount: number;
  /** Whether bulk delete confirmation is shown */
  showBulkDeleteConfirm: boolean;
  /** Callback to execute bulk delete */
  onBulkDelete: () => void;
  /** Callback to toggle bulk delete confirmation */
  setShowBulkDeleteConfirm: (show: boolean) => void;
  /** Whether bulk delete is in progress */
  isDeleting: boolean;
  /** Optional callback to execute bulk move */
  onBulkMove?: () => void;
  /** Optional flag indicating bulk move is in progress */
  isMoving?: boolean;
}

/**
 * Props for DictionaryManager component
 */
interface DictionaryManagerProps {
  /** Optional ref for search input (for keyboard shortcut focus) */
  searchRef?: React.RefObject<HTMLInputElement>;
  /** Whether this tab is currently active (for reloading when tab becomes visible) */
  isActive?: boolean;
}

/**
 * DictionaryManager Component
 *
 * Main dictionary management interface with:
 * - Dictionary selection dropdown
 * - Undo/redo controls
 * - Add entry functionality
 * - Bulk operations (in enhanced mode)
 * - Export/import all dictionaries
 * - Show in Finder functionality
 * - Virtualized table display (standard or enhanced)
 *
 * @param props - Component props
 * @returns Dictionary management interface
 */
const DictionaryManager: React.FC<DictionaryManagerProps> = ({ searchRef, isActive }) => {
  // Get dictionary operations and state from context
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    isLoading,
    dictionaries: _dictionaries,
    unreadDictionaryIds,
    dictionaryTypes,
    loadDictionary,
    reloadAfterImport,
    selectedDictionary,
    setSelectedDictionary,
  } = useDictionary();

  // Local state management for UI controls and feedback
  const [showAddEntry, setShowAddEntry] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTimestamp, setRefreshTimestamp] = useState<number>(Date.now());
  const [isLoadingDictionary, setIsLoadingDictionary] = useState<boolean>(false);
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);

  // Filter state for showing all dictionaries
  const [showAllDictionaries, setShowAllDictionaries] = useState<boolean>(false);
  // What is active, as every Add sees it: config as the open book's binding implies it
  // (`loadQuickAddView`). `null` is a config that could not be read.
  const { loadQuickAddView } = useBookBinding();
  const [activeView, setActiveView] = useState<QuickAddView | null>(null);

  // Duplicate detection mode. The rows are derived from live dictionary state rather than
  // snapshotted, so an edit / move / delete made from the duplicate view shows up immediately
  // (a resolved conflict simply disappears) without reloading every dictionary from disk or
  // remounting the table — which is what used to lose the scroll position.
  const [showDuplicatesMode, setShowDuplicatesMode] = useState<boolean>(false);
  const duplicateRows = React.useMemo<DuplicateRow[]>(
    () => (showDuplicatesMode ? findConflictingEntries(_dictionaries) : []),
    [showDuplicatesMode, _dictionaries]
  );

  useEffect(() => {
    if (showDuplicatesMode && duplicateRows.length === 0) {
      toast.success('No duplicate entries found! All entries are unique across dictionaries.');
    }
  }, [showDuplicatesMode, duplicateRows.length]);

  // Which dictionaries are active — the list itself comes from the store. Reloaded each time
  // the tab is shown: bindings, renames and activation all happen on other tabs.
  useEffect(() => {
    let cancelled = false;
    const loadActiveView = async (): Promise<void> => {
      try {
        const view = await loadQuickAddView();
        if (!cancelled) setActiveView(view);
      } catch (error) {
        logger.error('Failed to load active dictionaries:', error);
        if (!cancelled) {
          setActiveView(null);
          setError('Failed to load dictionary settings. Please try again.');
        }
      }
    };

    loadActiveView();
    return () => {
      cancelled = true;
    };
  }, [refreshTimestamp, loadQuickAddView]);

  // If the selected dictionary no longer exists (renamed), switch to the first one that does.
  useEffect(() => {
    const ids = Object.keys(dictionaryTypes);
    if (ids.length > 0 && !dictionaryTypes[selectedDictionary]) {
      setSelectedDictionary(ids[0]);
    }
  }, [dictionaryTypes, selectedDictionary, setSelectedDictionary]);

  // Refresh effect when component mounts
  useEffect(() => {
    setRefreshTimestamp(Date.now());
  }, []);

  // Reload the active view when the tab becomes active (to pick up changes from other tabs)
  useEffect(() => {
    if (isActive) {
      // The refreshTimestamp bump re-runs the effect above, which reloads the view
      setRefreshTimestamp(Date.now());
    }
  }, [isActive]);

  // Handle undo operation with error handling
  const handleUndo = async (): Promise<void> => {
    try {
      setError(null);
      await undo();
    } catch (error) {
      setError('Failed to undo last change. Please try again.');
      logger.error('Undo error:', error);
    }
  };

  // Handle redo operation with error handling
  const handleRedo = async (): Promise<void> => {
    try {
      setError(null);
      await redo();
    } catch (error) {
      setError('Failed to redo change. Please try again.');
      logger.error('Redo error:', error);
    }
  };

  // Handle opening dictionary folder
  const handleOpenFolder = async (): Promise<void> => {
    try {
      const result = await window.electronAPI.openDictionaryFolder();
      if (!result.success) {
        logger.error('Failed to open folder:', result.error);
      }
    } catch (error) {
      logger.error('Error opening dictionary folder:', error);
    }
  };

  // Handle export all dictionaries
  const handleExportDictionaries = async (): Promise<void> => {
    try {
      setError(null);
      const result = await window.electronAPI.exportDictionaries();
      if (result.success) {
        toast.success(result.message ?? 'Export complete');
      } else {
        setError(`Export failed: ${result.error}`);
      }
    } catch (error) {
      setError(`Export error: ${(error as Error).message}`);
      logger.error('Error exporting dictionaries:', error);
    }
  };

  // Handle import all dictionaries
  const handleImportDictionaries = async (): Promise<void> => {
    try {
      setError(null);
      const result = await window.electronAPI.importDictionaries();
      if (result.success) {
        toast.success(result.message ?? 'Import complete');
        // Import rewrote files outside the app: every dictionary is re-read, not only the
        // selected one, or the next edit to another would save its stale copy over the
        // imported file. The store also clears history, in the same turn.
        setIsLoadingDictionary(true);
        try {
          await reloadAfterImport();
        } catch (reloadError) {
          logger.error('Failed to reload dictionaries after import:', reloadError);
          setError('Imported, but the dictionaries could not be reloaded. Use Reload Dictionary.');
        } finally {
          setIsLoadingDictionary(false);
        }
      } else {
        setError(`Import failed: ${result.error}`);
      }
    } catch (error) {
      setError(`Import error: ${(error as Error).message}`);
      logger.error('Error importing dictionaries:', error);
    }
  };

  // Enter duplicate mode. Every dictionary is already in memory (ADR-005), and the rows are
  // derived from it, so there is nothing to load.
  const handleFindDuplicates = useCallback((): void => {
    setError(null);
    setShowDuplicatesMode(true);
  }, []);

  // Handle exiting duplicate mode
  const handleExitDuplicateMode = (): void => {
    setShowDuplicatesMode(false);
    setError(null);
  };

  // The dropdown lists what the Add form would offer (`quickAddChoices`, one rule for both),
  // always including the selected dictionary, so the <select> never shows a different one
  // from the table. A view that could not be loaded shows everything: this is the tab a user
  // comes to when something is wrong.
  const filteredDictionaryTypes = React.useMemo((): DictionaryTypesCollection => {
    if (showAllDictionaries || activeView === null) return dictionaryTypes;
    const visible = quickAddChoices(activeView, Object.keys(dictionaryTypes), selectedDictionary);
    return Object.fromEntries(visible.map((id) => [id, dictionaryTypes[id]]));
  }, [dictionaryTypes, showAllDictionaries, activeView, selectedDictionary]);

  // Sort dictionary entries for dropdown: A-Z by ID
  const sortedDictionaryEntries = React.useMemo(() => {
    return Object.entries(filteredDictionaryTypes).sort(([idA], [idB]) => idA.localeCompare(idB));
  }, [filteredDictionaryTypes]);

  // String-only lookup tables (characters/conversion/punctuation) have no move targets.
  const canMoveFromSelected = getMoveFamily(selectedDictionary) !== null;

  useHotkeyHandler({
    handlers: { undo: handleUndo, redo: handleRedo },
    canUndo,
    canRedo,
    ownTab: 'dictionary',
  });

  // Show loading state while dictionaries are being loaded
  if (isLoading) {
    return (
      <div className={`${styles.container} ${styles.loadingContainer}`}>
        <Loader size={20} className={`animate-spin ${styles.loadingSpinner}`} />
        <span className={styles.loadingText}>Loading dictionary...</span>
      </div>
    );
  }

  // Main component render
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <select
          className={styles.select}
          value={selectedDictionary}
          onChange={(e) => setSelectedDictionary(e.target.value)}
          disabled={isLoadingDictionary || showDuplicatesMode}
          style={showDuplicatesMode ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
        >
          {sortedDictionaryEntries.map(([id, { label }]) => (
            <option key={id} value={id}>
              {dictionaryOptionLabel(id, label, unreadDictionaryIds)}
            </option>
          ))}
        </select>

        <label
          className={styles.filterLabel}
          title="Show all proper nouns dictionaries, including inactive ones"
          style={showDuplicatesMode ? { opacity: 0.5, pointerEvents: 'none' } : {}}
          aria-disabled={showDuplicatesMode}
        >
          <input
            type="checkbox"
            checked={showAllDictionaries}
            onChange={(e) => setShowAllDictionaries(e.target.checked)}
            className={styles.filterCheckbox}
            disabled={showDuplicatesMode}
          />
          Show all
        </label>

        <div className={styles.controls}>
          <button
            onClick={handleUndo}
            className={styles.iconButton}
            disabled={!canUndo || isLoadingDictionary}
            title="Undo last change"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={handleRedo}
            className={styles.iconButton}
            disabled={!canRedo || isLoadingDictionary}
            title="Redo last change"
          >
            <Redo2 size={15} />
          </button>

          <button
            onClick={() => setShowAddEntry(true)}
            className={`primary ${styles.button}`}
            disabled={isLoadingDictionary || showDuplicatesMode}
            title="Add new entry"
          >
            <PlusCircle size={15} />
            Add Entry
          </button>

          {!showDuplicatesMode ? (
            <button
              onClick={() => handleFindDuplicates()}
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={isLoadingDictionary}
              title="Find entries with same source but different translations across all dictionaries"
            >
              <Search size={15} />
              Find Duplicates
            </button>
          ) : (
            <button
              onClick={handleExitDuplicateMode}
              className={`secondary ${styles.button}`}
              title="Return to normal dictionary view"
            >
              <X size={15} />
              Exit Duplicate View
            </button>
          )}

          {selectionState && selectionState.selectedCount > 0 && (
            <>
              {selectionState.onBulkMove && canMoveFromSelected && (
                <button
                  onClick={selectionState.onBulkMove}
                  className={`secondary ${styles.button}`}
                  disabled={selectionState.isMoving}
                  title={`Move ${selectionState.selectedCount} selected entries to another dictionary`}
                >
                  {selectionState.isMoving ? (
                    <Loader size={15} className="animate-spin" />
                  ) : (
                    <ArrowRightLeft size={15} />
                  )}
                  Move ({selectionState.selectedCount})
                </button>
              )}

              {selectionState.showBulkDeleteConfirm ? (
                <>
                  <button
                    onClick={() => selectionState.setShowBulkDeleteConfirm(false)}
                    className={`secondary ${styles.button}`}
                    disabled={selectionState.isDeleting}
                    title="Cancel deletion"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => selectionState.onBulkDelete()}
                    className={`danger ${styles.button}`}
                    disabled={selectionState.isDeleting}
                    title={`Confirm delete ${selectionState.selectedCount} entries`}
                  >
                    {selectionState.isDeleting ? (
                      <Loader size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}
                    Yes, Delete {selectionState.selectedCount}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => selectionState.setShowBulkDeleteConfirm(true)}
                  className={`danger ${styles.button}`}
                  disabled={selectionState.isDeleting}
                  title={`Delete ${selectionState.selectedCount} selected entries`}
                >
                  <Trash2 size={15} />
                  Delete ({selectionState.selectedCount})
                </button>
              )}
            </>
          )}

          <button
            onClick={handleExportDictionaries}
            className={`secondary ${styles.button}`}
            title="Export all dictionaries to ZIP file"
            disabled={isLoadingDictionary}
          >
            <Download size={15} />
            Export All
          </button>

          <button
            onClick={handleImportDictionaries}
            className={`secondary ${styles.button}`}
            title="Import dictionaries from ZIP file"
            disabled={isLoadingDictionary}
          >
            <Upload size={15} />
            Import All
          </button>

          <button
            onClick={handleOpenFolder}
            className={`secondary ${styles.button}`}
            title="Show dictionaries folder in Finder"
          >
            <Folder size={15} />
            Show in Finder
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {!showDuplicatesMode && unreadDictionaryIds.includes(selectedDictionary) && (
        <div className={styles.error} role="alert">
          <AlertCircle size={15} />
          <span>
            Couldn&apos;t read {selectedDictionary}.json, so it shows no entries and edits to it are
            refused rather than saved over the file. Fix the file, then Reload.
          </span>
          <button
            type="button"
            className={`secondary ${styles.button}`}
            onClick={() => void loadDictionary(selectedDictionary)}
            tabIndex={0}
          >
            <RotateCw size={15} />
            Reload
          </button>
        </div>
      )}

      {showDuplicatesMode && duplicateRows.length > 0 && (
        <div className={styles.duplicateInfoBanner}>
          <Search size={16} />
          <span>
            Showing <strong>{duplicateRows.length}</strong> duplicate entries from{' '}
            <strong>{new Set(duplicateRows.map((r) => r.dictionaryId)).size}</strong> dictionaries
          </span>
        </div>
      )}

      <div className={styles.tableContainer}>
        {/* Keyed by mode: switching modes remounts the table, which is what clears a selection
            of composite `source::dictionaryId` keys when the duplicate view closes. */}
        <EnhancedVirtualizedDictionaryTable
          key={showDuplicatesMode ? 'duplicates' : 'dictionary-table'}
          selectedDictionary={selectedDictionary}
          searchRef={searchRef}
          onSelectionChange={setSelectionState}
          isActive={isActive}
          showDuplicatesMode={showDuplicatesMode}
          duplicateRows={duplicateRows}
        />
      </div>

      {showAddEntry && (
        <DictionaryEntry
          onClose={() => setShowAddEntry(false)}
          selectedDictionary={selectedDictionary}
        />
      )}
    </div>
  );
};

export default DictionaryManager;
