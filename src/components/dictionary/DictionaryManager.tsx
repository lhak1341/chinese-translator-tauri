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
} from 'lucide-react';
import { DICTIONARY_TYPES, getDictionaryTypes } from './DictionaryTypes';
import { useDictionary } from './DictionaryContext';
import EnhancedVirtualizedDictionaryTable from './EnhancedVirtualizedDictionaryTable';
import DictionaryEntry from './DictionaryEntry';
import { useHotkeyHandler } from '../../hooks/useHotkeyHandler';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import styles from '../../styles/DictionaryManager.module.css';
import { logger } from '../../utils/logger';
import {
  isProperNounsDict,
  findConflictingEntries,
  toProperNounsId,
  isFictionPatternsId,
  getMoveFamily,
  type DuplicateRow,
} from '../../utils/dictionary';
import { toast } from '../ToastContext';
import { loadAppConfig } from '../../utils/appConfig';

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
    loadDictionary,
    selectedDictionary,
    setSelectedDictionary,
  } = useDictionary();

  // Local state management for UI controls and feedback
  const [dictionaryTypes, setDictionaryTypes] =
    useState<DictionaryTypesCollection>(DICTIONARY_TYPES);
  const [showAddEntry, setShowAddEntry] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTimestamp, setRefreshTimestamp] = useState<number>(Date.now());
  const [isLoadingDictionary, setIsLoadingDictionary] = useState<boolean>(false);
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);

  // Filter state for showing all dictionaries
  const [showAllDictionaries, setShowAllDictionaries] = useState<boolean>(false);
  const [activeDictionaries, setActiveDictionaries] = useState<string[]>([]);

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

  // Load dictionary types including active proper nouns dictionaries
  useEffect(() => {
    const loadDictionaryTypes = async (): Promise<void> => {
      try {
        const types = (await getDictionaryTypes()) as DictionaryTypesCollection;
        setDictionaryTypes(types);

        // Load active dictionaries from config
        const config = await loadAppConfig();
        setActiveDictionaries(config.engine.activeProperNouns);

        // If the currently selected dictionary is no longer available,
        // switch to the first available dictionary
        if (!types[selectedDictionary]) {
          setSelectedDictionary(Object.keys(types)[0]);
        }
      } catch (error) {
        logger.error('Failed to load dictionary types:', error);
        setError('Failed to load dictionary types. Please try again.');
      }
    };

    loadDictionaryTypes();
  }, [selectedDictionary, refreshTimestamp, setSelectedDictionary]);

  // Refresh effect when component mounts
  useEffect(() => {
    setRefreshTimestamp(Date.now());
  }, []);

  // Reload configuration and dictionary types when tab becomes active (to pick up changes from Configuration tab)
  useEffect(() => {
    if (isActive) {
      // Trigger full reload of dictionary types and configuration —
      // the refreshTimestamp bump re-runs the effect above, which reloads config too
      setRefreshTimestamp(Date.now());
    }
  }, [isActive]);

  // Load selected dictionary when it changes
  useEffect(() => {
    const loadSelectedDictionary = async (): Promise<void> => {
      if (selectedDictionary && !isLoading) {
        setIsLoadingDictionary(true);
        try {
          await loadDictionary(selectedDictionary);
        } catch (error) {
          logger.error('Failed to load dictionary:', error);
          setError('Failed to load dictionary. Please try again.');
        } finally {
          setIsLoadingDictionary(false);
        }
      }
    };

    loadSelectedDictionary();
  }, [selectedDictionary, isLoading, loadDictionary]);

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

        // Selective refresh: reload dictionary types and current dictionary
        // This preserves user context (no full page reload)
        setRefreshTimestamp(Date.now());

        // Reload the currently selected dictionary to pick up any changes
        try {
          await loadDictionary(selectedDictionary);
        } catch (reloadError) {
          logger.error('Failed to reload dictionary after import:', reloadError);
        }
      } else {
        setError(`Import failed: ${result.error}`);
      }
    } catch (error) {
      setError(`Import error: ${(error as Error).message}`);
      logger.error('Error importing dictionaries:', error);
    }
  };

  // Enter duplicate mode. Every dictionary must be in memory first — conflicts are found across
  // all of them, and delete/move from the duplicate view needs the owning dictionary loaded.
  const handleFindDuplicates = useCallback(async (): Promise<void> => {
    setIsLoadingDictionary(true);
    setError(null);
    try {
      // CRITICAL FIX: Load ALL available dictionaries before analyzing
      // This ensures deletion works for entries from any dictionary
      // CODE REVIEW FIX 2026-02-09 (CRITICAL): Load dictionaries in parallel for better performance
      const allTypes = await getDictionaryTypes();
      const allDictionaryIds = Object.keys(allTypes);

      // Load all dictionaries in parallel (much faster than sequential)
      await Promise.all(allDictionaryIds.map((dictId) => loadDictionary(dictId)));

      setShowDuplicatesMode(true);
    } catch (error) {
      setError(`Failed to analyze duplicates: ${(error as Error).message}`);
      logger.error('Error finding duplicates:', error);
    } finally {
      setIsLoadingDictionary(false);
    }
  }, [loadDictionary]);

  // Handle exiting duplicate mode
  const handleExitDuplicateMode = (): void => {
    setShowDuplicatesMode(false);
    setError(null);
  };

  // Filter dictionary types based on "Show all dictionaries" checkbox
  const filteredDictionaryTypes = React.useMemo(() => {
    if (showAllDictionaries) {
      // Show all dictionaries
      return dictionaryTypes;
    }

    // Filter: show base dictionaries + active proper nouns + active fiction patterns only
    const filtered: DictionaryTypesCollection = {};
    for (const [id, type] of Object.entries(dictionaryTypes)) {
      if (isProperNounsDict(id)) {
        // Include only active proper nouns dictionaries
        if (activeDictionaries.includes(id)) {
          filtered[id] = type;
        }
      } else if (isFictionPatternsId(id)) {
        // Include fiction pattern dict only if its paired properNouns is active
        const pairedProperNouns = toProperNounsId(id);
        if (activeDictionaries.includes(pairedProperNouns)) {
          filtered[id] = type;
        }
      } else {
        // Always include base dictionaries (patterns, phrases, characters, etc.)
        filtered[id] = type;
      }
    }
    return filtered;
  }, [dictionaryTypes, showAllDictionaries, activeDictionaries]);

  // Sort dictionary entries for dropdown: A-Z by ID
  const sortedDictionaryEntries = React.useMemo(() => {
    return Object.entries(filteredDictionaryTypes).sort(([idA], [idB]) => idA.localeCompare(idB));
  }, [filteredDictionaryTypes]);

  // String-only lookup tables (characters/conversion/punctuation) have no move targets.
  const canMoveFromSelected = getMoveFamily(selectedDictionary) !== null;

  useHotkeyHandler({
    onUndo: handleUndo,
    onRedo: handleRedo,
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
              {label}
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
