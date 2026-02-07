import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { DICTIONARY_TYPES, getDictionaryTypes } from './DictionaryTypes';
import { useDictionary } from './DictionaryContext';
import VirtualizedDictionaryTable from './VirtualizedDictionaryTable';
import EnhancedVirtualizedDictionaryTable from './EnhancedVirtualizedDictionaryTable';
import DictionaryEntry from './DictionaryEntry';
import HotkeyHandler from '../HotkeyHandler';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import styles from '../../styles/DictionaryManager.module.css';
import { logger } from '../../utils/logger';

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
  // Feature flag for enhanced virtualized table
  // Always use enhanced virtualization for better UX (direct editing)
  const useEnhancedVirtualization = true;

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
  const [updateError, _setUpdateError] = useState<string | null>(null);
  const [refreshTimestamp, setRefreshTimestamp] = useState<number>(Date.now());
  const [isLoadingDictionary, setIsLoadingDictionary] = useState<boolean>(false);
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);

  // Filter state for showing all dictionaries
  const [showAllDictionaries, setShowAllDictionaries] = useState<boolean>(false);
  const [activeDictionaries, setActiveDictionaries] = useState<string[]>([]);

  // Load dictionary types including active proper nouns dictionaries
  useEffect(() => {
    const loadDictionaryTypes = async (): Promise<void> => {
      try {
        const types = (await getDictionaryTypes()) as DictionaryTypesCollection;
        setDictionaryTypes(types);

        // Load active dictionaries from config
        const configResult = await window.electronAPI.loadConfiguration();
        if (configResult.success && configResult.data) {
          setActiveDictionaries(configResult.data.activeProperNouns || ['properNouns']);
        }

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
      // Trigger full reload of dictionary types and configuration
      setRefreshTimestamp(Date.now());

      // Also reload active dictionaries from configuration
      const reloadConfig = async (): Promise<void> => {
        try {
          const configResult = await window.electronAPI.loadConfiguration();
          if (configResult.success && configResult.data) {
            setActiveDictionaries(configResult.data.activeProperNouns || ['properNouns']);
          }
        } catch (error) {
          logger.error('Failed to reload configuration:', error);
        }
      };
      reloadConfig();
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
        // Show success message
        setError(`✅ ${result.message}`);
        setTimeout(() => setError(null), 5000);
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
        // Show success message
        setError(`✅ ${result.message}`);

        // Selective refresh: reload dictionary types and current dictionary
        // This preserves user context (no full page reload)
        setRefreshTimestamp(Date.now());

        // Reload the currently selected dictionary to pick up any changes
        try {
          await loadDictionary(selectedDictionary);
        } catch (reloadError) {
          logger.error('Failed to reload dictionary after import:', reloadError);
        }

        // Clear success message after 5 seconds
        setTimeout(() => setError(null), 5000);
      } else {
        setError(`Import failed: ${result.error}`);
      }
    } catch (error) {
      setError(`Import error: ${(error as Error).message}`);
      logger.error('Error importing dictionaries:', error);
    }
  };

  // Filter dictionary types based on "Show all dictionaries" checkbox
  const filteredDictionaryTypes = React.useMemo(() => {
    if (showAllDictionaries) {
      // Show all dictionaries
      return dictionaryTypes;
    }

    // Filter: show base dictionaries + active proper nouns only
    const filtered: DictionaryTypesCollection = {};
    for (const [id, type] of Object.entries(dictionaryTypes)) {
      // Always include base dictionaries (non-properNouns)
      if (!id.startsWith('properNouns')) {
        filtered[id] = type;
      }
      // Include proper nouns dictionaries that are active
      else if (activeDictionaries.includes(id)) {
        filtered[id] = type;
      }
    }
    return filtered;
  }, [dictionaryTypes, showAllDictionaries, activeDictionaries]);

  // Sort dictionary entries for dropdown: general 'properNouns' first, then alphabetical
  const sortedDictionaryEntries = React.useMemo(() => {
    return Object.entries(filteredDictionaryTypes).sort(([idA], [idB]) => {
      // Always put 'properNouns' first
      if (idA === 'properNouns') return -1;
      if (idB === 'properNouns') return 1;
      // Sort other dictionaries alphabetically
      return idA.localeCompare(idB);
    });
  }, [filteredDictionaryTypes]);

  // Style definitions for consistent layout
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
      {React.createElement(HotkeyHandler as any, {
        onUndo: handleUndo,
        onRedo: handleRedo,
        onAddEntry: () => setShowAddEntry(true),
        canUndo,
        canRedo,
        activeTab: 'dictionary',
      })}
      <div className={styles.header}>
        <select
          className={styles.select}
          value={selectedDictionary}
          onChange={(e) => setSelectedDictionary(e.target.value)}
          disabled={isLoadingDictionary}
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
        >
          <input
            type="checkbox"
            checked={showAllDictionaries}
            onChange={(e) => setShowAllDictionaries(e.target.checked)}
            className={styles.filterCheckbox}
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
            disabled={isLoadingDictionary}
            title="Add new entry"
          >
            <PlusCircle size={15} />
            Add Entry
          </button>

          {selectionState && selectionState.selectedCount > 0 && (
            <>
              <button
                onClick={() => {
                  if (selectionState.onBulkMove) {
                    selectionState.onBulkMove();
                  }
                }}
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
        <div className={styles.error}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}
      {updateError && (
        <div className={styles.error}>
          <AlertCircle size={15} />
          {updateError}
        </div>
      )}

      <div className={styles.tableContainer}>
        {useEnhancedVirtualization
          ? React.createElement(EnhancedVirtualizedDictionaryTable as any, {
              selectedDictionary,
              searchRef,
              onSelectionChange: setSelectionState,
              isActive,
            })
          : React.createElement(VirtualizedDictionaryTable as any, {
              selectedDictionary,
              searchRef,
              isActive,
            })}
      </div>

      {showAddEntry &&
        React.createElement(DictionaryEntry as any, {
          onClose: () => setShowAddEntry(false),
          selectedDictionary,
        })}
    </div>
  );
};

export default DictionaryManager;
