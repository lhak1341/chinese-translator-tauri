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
} from 'lucide-react';
import { DICTIONARY_TYPES, getDictionaryTypes } from './DictionaryTypes';
import { useDictionary } from './DictionaryContext';
import VirtualizedDictionaryTable from './VirtualizedDictionaryTable';
import EnhancedVirtualizedDictionaryTable from './EnhancedVirtualizedDictionaryTable';
import DictionaryEntry from './DictionaryEntry';
import HotkeyHandler from '../HotkeyHandler';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';

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
}

/**
 * Props for DictionaryManager component
 */
interface DictionaryManagerProps {
  /** Optional ref for search input (for keyboard shortcut focus) */
  searchRef?: React.RefObject<HTMLInputElement>;
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
const DictionaryManager: React.FC<DictionaryManagerProps> = ({ searchRef }) => {
  // Feature flag for enhanced virtualized table
  const useEnhancedVirtualization = process.env.NODE_ENV === 'development' || window?.location?.search?.includes('enhanced=true');

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
  const [dictionaryTypes, setDictionaryTypes] = useState<DictionaryTypesCollection>(DICTIONARY_TYPES);
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
        const types = await getDictionaryTypes() as DictionaryTypesCollection;
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
        console.error('Failed to load dictionary types:', error);
        setError('Failed to load dictionary types. Please try again.');
      }
    };

    loadDictionaryTypes();
  }, [selectedDictionary, refreshTimestamp, setSelectedDictionary]);

  // Refresh effect when component mounts
  useEffect(() => {
    setRefreshTimestamp(Date.now());
  }, []);

  // Load selected dictionary when it changes
  useEffect(() => {
    const loadSelectedDictionary = async (): Promise<void> => {
      if (selectedDictionary && !isLoading) {
        setIsLoadingDictionary(true);
        try {
          await loadDictionary(selectedDictionary);
        } catch (error) {
          console.error('Failed to load dictionary:', error);
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
      console.error('Undo error:', error);
    }
  };

  // Handle redo operation with error handling
  const handleRedo = async (): Promise<void> => {
    try {
      setError(null);
      await redo();
    } catch (error) {
      setError('Failed to redo change. Please try again.');
      console.error('Redo error:', error);
    }
  };

  // Handle opening dictionary folder
  const handleOpenFolder = async (): Promise<void> => {
    try {
      const result = await window.electronAPI.openDictionaryFolder();
      if (!result.success) {
        console.error('Failed to open folder:', result.error);
      }
    } catch (error) {
      console.error('Error opening dictionary folder:', error);
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
      console.error('Error exporting dictionaries:', error);
    }
  };

  // Handle import all dictionaries
  const handleImportDictionaries = async (): Promise<void> => {
    try {
      setError(null);
      const result = await window.electronAPI.importDictionaries();
      if (result.success) {
        // Show success message and reload
        setError(`✅ ${result.message}`);
        setTimeout(() => {
          setError(null);
          // Trigger reload of current dictionary
          setRefreshTimestamp(Date.now());
          window.location.reload(); // Force full reload to refresh all dictionaries
        }, 3000);
      } else {
        setError(`Import failed: ${result.error}`);
      }
    } catch (error) {
      setError(`Import error: ${(error as Error).message}`);
      console.error('Error importing dictionaries:', error);
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

  // Style definitions for consistent layout
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--background-color)',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    padding: '1rem 1.5rem',
    border: 'none',
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--background-color)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  };

  const selectStyle: React.CSSProperties = {
    padding: '0.5rem 2.5rem 0.5rem 1rem',
    borderRadius: '0.375rem',
    border: '1px solid var(--border-color)',
    fontSize: '0.875rem',
    background: 'var(--background-color)',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23e5e7eb' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.5rem center',
    minWidth: '200px',
    color: 'var(--text-color)',
  };

  const controlsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginLeft: 'auto',
  };

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 500,
  };

  const iconButtonStyle: React.CSSProperties = {
    padding: '0.5rem',
    borderRadius: '0.375rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const errorStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    background: 'var(--danger-button-bg)',
    color: 'var(--danger-button-text)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    marginBottom: '0.5rem',
  };

  // Show loading state while dictionaries are being loaded
  if (isLoading) {
    return (
      <div
        style={{
          ...containerStyle,
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <Loader size={24} className="animate-spin" />
        <span>Loading dictionary...</span>
      </div>
    );
  }

  // Main component render
  return (
    <div style={containerStyle}>
      {React.createElement(HotkeyHandler as any, {
        onUndo: handleUndo,
        onRedo: handleRedo,
        onAddEntry: () => setShowAddEntry(true),
        canUndo,
        canRedo,
        activeTab: 'dictionary'
      })}
      <div style={headerStyle}>
        <select
          style={selectStyle}
          value={selectedDictionary}
          onChange={(e) => setSelectedDictionary(e.target.value)}
          disabled={isLoadingDictionary}
        >
          {Object.entries(filteredDictionaryTypes).map(([id, { label }]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
          title="Show all proper nouns dictionaries, including inactive ones"
        >
          <input
            type="checkbox"
            checked={showAllDictionaries}
            onChange={(e) => setShowAllDictionaries(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Show all dictionaries</span>
        </label>

        <div style={controlsStyle}>
          <button
            onClick={handleUndo}
            style={iconButtonStyle}
            disabled={!canUndo || isLoadingDictionary}
            title="Undo last change"
            className="icon"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={handleRedo}
            style={iconButtonStyle}
            disabled={!canRedo || isLoadingDictionary}
            title="Redo last change"
            className="icon"
          >
            <Redo2 size={16} />
          </button>

          <button
            onClick={() => setShowAddEntry(true)}
            className="primary"
            style={buttonStyle}
            disabled={isLoadingDictionary}
            title="Add new entry"
          >
            <PlusCircle size={16} />
            <span>Add Entry</span>
          </button>

          {selectionState && selectionState.selectedCount > 0 && (
            <button
              onClick={() => {
                if (selectionState.showBulkDeleteConfirm) {
                  selectionState.onBulkDelete();
                } else {
                  selectionState.setShowBulkDeleteConfirm(true);
                }
              }}
              className="danger"
              style={buttonStyle}
              disabled={selectionState.isDeleting}
              title={selectionState.showBulkDeleteConfirm ?
                `Confirm delete ${selectionState.selectedCount} entries` :
                `Delete ${selectionState.selectedCount} selected entries`}
            >
              {selectionState.isDeleting ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
              <span>
                {selectionState.showBulkDeleteConfirm ? 'Confirm Delete' : `Delete (${selectionState.selectedCount})`}
              </span>
            </button>
          )}

          <button
            onClick={handleExportDictionaries}
            className="secondary"
            style={buttonStyle}
            title="Export all dictionaries to ZIP file"
            disabled={isLoadingDictionary}
          >
            <Download size={16} />
            <span>Export All</span>
          </button>

          <button
            onClick={handleImportDictionaries}
            className="secondary"
            style={buttonStyle}
            title="Import dictionaries from ZIP file"
            disabled={isLoadingDictionary}
          >
            <Upload size={16} />
            <span>Import All</span>
          </button>

          <button
            onClick={handleOpenFolder}
            className="secondary"
            style={buttonStyle}
            title="Show dictionaries folder in Finder"
          >
            <Folder size={16} />
            <span>Show in Finder</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={errorStyle}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {updateError && (
        <div style={errorStyle}>
          <AlertCircle size={16} />
          {updateError}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {useEnhancedVirtualization ? React.createElement(EnhancedVirtualizedDictionaryTable as any, {
          selectedDictionary,
          searchRef,
          onSelectionChange: setSelectionState
        }) : React.createElement(VirtualizedDictionaryTable as any, {
          selectedDictionary,
          searchRef
        })}
      </div>

      {showAddEntry && React.createElement(DictionaryEntry as any, {
        onClose: () => setShowAddEntry(false),
        selectedDictionary
      })}
    </div>
  );
};

export default DictionaryManager;
