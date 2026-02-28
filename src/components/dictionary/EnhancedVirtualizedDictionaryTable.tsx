import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Edit2,
  Trash2,
  Loader,
  ChevronsUp,
  ChevronsDown,
  X,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { useDictionary } from './DictionaryContext';
import { getDictionaryTypes } from './DictionaryTypes';
import DictionaryEntry from './DictionaryEntry';
import MoveEntryDialog from './MoveEntryDialog';
import { adaptiveBufferCalculator } from '../../utils/AdaptiveVirtualScrolling.js';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { logger } from '../../utils/logger';
import { createDuplicateKey, parseDuplicateKey } from '../../utils/DuplicateAnalyzer';
import { getDictionaryDropdownLabel, compareDictionaryOrder } from '../../utils/dictionaryHelpers';
import { toast } from '../ToastContext';
import type {
  DictionaryEntryValue,
  EditingEntryData,
  MoveEntryData,
} from '../../types/DictionaryTypes';
import { SEMANTIC_TYPE_COLORS, SEMANTIC_TYPES } from '../../constants/SemanticTypes';
import type { SemanticType } from '../../constants/SemanticTypes';

/**
 * Props for BulkMoveDialog extracted component
 */
interface BulkMoveDialogProps {
  selectedDictionary: string;
  selectedEntries: Set<string>;
  onClose: () => void;
  onMoveSuccess: () => void;
}

/**
 * Bulk Move Dialog — extracted to module scope to avoid re-creating
 * a component type (with hooks) on every parent render.
 */
const BulkMoveDialog: React.FC<BulkMoveDialogProps> = ({
  selectedDictionary,
  selectedEntries,
  onClose,
  onMoveSuccess,
}) => {
  const { bulkMoveEntries, dictionaries } = useDictionary();
  const [selectedTargetDict, setSelectedTargetDict] = useState<string>('');
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [overwriteWarning, setOverwriteWarning] = useState<string | null>(null);
  const [availableDictionaries, setAvailableDictionaries] = useState<
    Array<{ id: string; label: string }>
  >([]);

  // Load fresh dictionary list with full labels on mount
  useEffect(() => {
    const loadDictionaries = async (): Promise<void> => {
      try {
        const types = await getDictionaryTypes();
        const dictionaryList = Object.keys(types)
          .filter((id) => id !== selectedDictionary)
          .map((id) => ({ id, label: getDictionaryDropdownLabel(id) }))
          .sort(compareDictionaryOrder);
        setAvailableDictionaries(dictionaryList);
      } catch (err) {
        logger.error('Failed to load dictionaries:', err);
        setError('Failed to load available dictionaries');
      }
    };

    loadDictionaries();
  }, [selectedDictionary]);

  // Check for entries that would be overwritten in the selected target
  useEffect(() => {
    if (!selectedTargetDict || !dictionaries?.[selectedTargetDict]) {
      setOverwriteWarning(null);
      return;
    }
    const targetDict = dictionaries[selectedTargetDict];
    const sources = Array.from(selectedEntries);
    const willOverwrite = sources.filter((s) => targetDict[s] !== undefined);
    if (willOverwrite.length > 0) {
      setOverwriteWarning(
        `${willOverwrite.length} ${willOverwrite.length === 1 ? 'entry' : 'entries'} already exist in target and will be overwritten.`
      );
    } else {
      setOverwriteWarning(null);
    }
  }, [selectedTargetDict, dictionaries, selectedEntries]);

  const getTargetLabel = (): string =>
    availableDictionaries.find((d) => d.id === selectedTargetDict)?.label ?? selectedTargetDict;

  const getSourceDictLabel = (): string => {
    if (selectedDictionary === 'properNouns') return 'Proper Nouns (Base)';
    if (selectedDictionary.startsWith('properNouns-'))
      return `Proper Nouns - ${selectedDictionary.replace('properNouns-', '')}`;
    return selectedDictionary.charAt(0).toUpperCase() + selectedDictionary.slice(1);
  };

  const handleBulkMoveExecute = async (): Promise<void> => {
    if (!selectedTargetDict) {
      setError('Please select a target dictionary');
      return;
    }

    setIsMoving(true);
    setError(null);

    try {
      await bulkMoveEntries(
        selectedDictionary,
        selectedTargetDict,
        Array.from(selectedEntries),
        getTargetLabel()
      );
      onMoveSuccess();
    } catch (err) {
      setError(`Failed to move entries: ${(err as Error).message}`);
      logger.error('Bulk move error:', err);
      setIsMoving(false);
    }
  };

  // Get preview entries (first 3)
  const previewEntries = Array.from(selectedEntries).slice(0, 3);
  const hasMore = selectedEntries.size > 3;
  const currentDict = dictionaries[selectedDictionary];

  return (
    <div className={styles.bulkMoveOverlay} onClick={isMoving ? undefined : onClose}>
      <div className={styles.bulkMoveModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.bulkMoveHeader}>
          <h2 className={styles.bulkMoveTitle}>
            Move {selectedEntries.size} {selectedEntries.size === 1 ? 'Entry' : 'Entries'}
          </h2>
          <button
            onClick={onClose}
            disabled={isMoving}
            className={styles.bulkMoveCloseButton}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.bulkMoveContent}>
          {/* Entry Preview */}
          <div className={styles.bulkMovePreview}>
            <div className={styles.bulkMovePreviewLabel}>Moving:</div>
            <div className={styles.bulkMovePreviewList}>
              {previewEntries.map((source) => {
                const entry = currentDict?.[source];
                const translation = typeof entry === 'string' ? entry : entry?.translation || '';
                return (
                  <div key={source} className={styles.bulkMovePreviewItem}>
                    <span className={styles.bulkMovePreviewSource}>"{source}"</span>
                    <span className={styles.bulkMovePreviewArrow}>→</span>
                    <span className={styles.bulkMovePreviewTranslation}>"{translation}"</span>
                  </div>
                );
              })}
            </div>
            {hasMore && (
              <div className={styles.bulkMovePreviewMore}>
                ...and {selectedEntries.size - 3} more{' '}
                {selectedEntries.size - 3 === 1 ? 'entry' : 'entries'}
              </div>
            )}
          </div>

          {/* Source Dictionary */}
          <div className={styles.bulkMoveFormGroup}>
            <label className={styles.bulkMoveLabel}>From:</label>
            <div className={styles.bulkMoveReadOnlyField}>{getSourceDictLabel()}</div>
          </div>

          {/* Destination Dictionary */}
          <div className={styles.bulkMoveFormGroup}>
            <label className={styles.bulkMoveLabel}>To:</label>
            {availableDictionaries.length === 0 ? (
              <div className={styles.bulkMoveEmptyState}>
                No other dictionaries available. Create another dictionary first.
              </div>
            ) : (
              <select
                value={selectedTargetDict}
                onChange={(e) => setSelectedTargetDict(e.target.value)}
                disabled={isMoving}
                className={`${styles.bulkMoveSelect} ${error ? styles.bulkMoveSelectWithError : ''}`}
                autoFocus
              >
                <option value="">Choose destination dictionary...</option>
                {availableDictionaries.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Overwrite warning */}
          {overwriteWarning && (
            <div className={styles.bulkMoveWarning}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span>{overwriteWarning}</span>
            </div>
          )}

          {error && <div className={styles.bulkMoveError}>{error}</div>}
        </div>

        <div className={styles.bulkMoveActions}>
          <button onClick={onClose} disabled={isMoving}>
            Cancel
          </button>
          <button
            onClick={handleBulkMoveExecute}
            className="primary"
            disabled={isMoving || !selectedTargetDict || availableDictionaries.length === 0}
          >
            {isMoving ? (
              <>
                <Loader size={16} className="animate-spin" />
                <span>Moving...</span>
              </>
            ) : (
              `Move ${selectedEntries.size} ${selectedEntries.size === 1 ? 'Entry' : 'Entries'}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Selection state passed to parent component
 */
interface SelectionState {
  selectedEntries: Set<string>;
  selectedCount: number;
  onBulkDelete: () => Promise<void>;
  isDeleting: boolean;
  showBulkDeleteConfirm: boolean;
  setShowBulkDeleteConfirm: (show: boolean) => void;
  onBulkMove?: () => void;
  isMoving?: boolean;
}

/**
 * Context menu state
 */
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  entry: { source: string; translation: string } | null;
}

/**
 * Props for EnhancedVirtualizedDictionaryTable component
 */
interface EnhancedVirtualizedDictionaryTableProps {
  /** Currently selected dictionary ID */
  selectedDictionary: string;
  /** Optional ref for search input (for keyboard shortcut focus) */
  searchRef?: React.RefObject<HTMLInputElement>;
  /** Callback when selection state changes */
  onSelectionChange?: (state: SelectionState) => void;
  /** Whether the parent tab is active (for remeasuring on visibility) */
  isActive?: boolean;
  /** Whether to show duplicate mode (4-column layout) */
  showDuplicatesMode?: boolean;
  /** Duplicate rows to display when in duplicate mode */
  duplicateRows?: import('../../utils/DuplicateAnalyzer').DuplicateRow[];
  /** Callback to refresh duplicate view after deletion */
  onRefreshDuplicates?: (reloadFromBackend?: boolean) => Promise<void>;
  /** Scroll position to restore (managed by parent to survive unmount/remount) */
  scrollRestore?: number | null;
  /** Callback to save scroll position before refresh (pass null to clear) */
  onScrollSave?: (position: number | null) => void;
}

// Optimized constants for better performance
const ITEM_HEIGHT = 40; // Height of each table row in pixels
// OPTIMIZATION: Dynamic buffer sizing replaced fixed BUFFER_SIZE = 10
// Now calculated based on device performance, viewport, and memory pressure
const SEARCH_DEBOUNCE_MS = 150; // Debounce search input
const LARGE_LIST_THRESHOLD = 1000; // When to apply additional optimizations

/**
 * Helper function to highlight pattern variables (X, Y, Z, etc.) in source text
 * Each variable gets a different color for clarity
 */
const highlightPatternVariables = (text: string): React.ReactNode => {
  // Pattern variables are single uppercase letters (X, Y, Z, A, B, C, etc.)
  const parts = text.split(/([A-Z])/);

  // Color palette for different variables
  const variableColors: Record<string, string> = {
    X: '#dc2626', // red-600
    Y: '#16a34a', // green-600
    Z: '#0891b2', // cyan-600
    A: '#ea580c', // orange-600
    B: '#7c3aed', // violet-600
    C: '#0d9488', // teal-600
    D: '#db2777', // pink-600
    E: '#2563eb', // blue-600
  };

  return parts.map((part, index) => {
    // Check if this is a single uppercase letter
    if (part.length === 1 && /[A-Z]/.test(part)) {
      const color = variableColors[part] || '#059669'; // Default to green if not in palette
      return (
        <span key={index} className={styles.patternVariable} style={{ color: color }}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

/**
 * Clickable badge component for metadata (Variable, Low Priority)
 */
interface BadgeProps {
  type: 'variable' | 'lowPriority';
  active: boolean;
  onClick: () => void;
}

const MetadataBadge: React.FC<BadgeProps> = ({ type, active, onClick }) => {
  const config =
    type === 'variable'
      ? {
          label: 'VAR',
          title: active ? 'Click to disallow as variable' : 'Click to allow as variable',
          activeColor: '#059669',
          inactiveColor: '#6b7280',
        }
      : {
          label: 'LP',
          title: active ? 'Click to remove low priority' : 'Click to set low priority',
          activeColor: '#dc2626',
          inactiveColor: '#6b7280',
        };

  return (
    <span
      onClick={(e) => {
        e.stopPropagation(); // Prevent triggering translation edit
        onClick();
      }}
      title={config.title}
      className={styles.metadataBadge}
      style={{
        background: active ? config.activeColor : 'transparent',
        color: active ? 'white' : config.inactiveColor,
        border: active ? 'none' : `1px solid ${config.inactiveColor}`,
      }}
    >
      {active && (type === 'variable' ? '✓ ' : '⬇ ')}
      {config.label}
    </span>
  );
};

const SEMANTIC_TYPE_SHORT_LABELS: Record<string, string> = {
  [SEMANTIC_TYPES.PERSON]: 'PER',
  [SEMANTIC_TYPES.PLACE]: 'PLA',
  [SEMANTIC_TYPES.CONCEPT]: 'CON',
  [SEMANTIC_TYPES.OBJECT]: 'OBJ',
};

const SEMANTIC_TYPE_CYCLE_LIST = ['person', 'place', 'concept', 'object'];

/**
 * Cell with 4 toggleable type chips (PER/PLA/CON/OBJ) for a pattern variable column.
 */
const TypeToggleCell: React.FC<{
  varName: string;
  hasVariable: boolean;
  activeTypes: string[];
  onToggle: (varName: string, type: string) => void;
}> = ({ varName, hasVariable, activeTypes, onToggle }) => {
  if (!hasVariable) {
    return (
      <div
        style={{
          width: '10%',
          padding: '0 0.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>--</span>
      </div>
    );
  }
  return (
    <div
      style={{
        width: '10%',
        padding: '0 0.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        flexWrap: 'nowrap',
      }}
    >
      {SEMANTIC_TYPE_CYCLE_LIST.map((type) => {
        const isActive = activeTypes.includes(type);
        const label = SEMANTIC_TYPE_SHORT_LABELS[type];
        const color = SEMANTIC_TYPE_COLORS[type as SemanticType];
        return (
          <span
            key={type}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(varName, type);
            }}
            className={styles.metadataBadge}
            title={`${isActive ? 'Remove' : 'Add'} ${type} for ${varName}`}
            style={{
              background: isActive ? color : 'transparent',
              color: isActive ? 'white' : '#9ca3af',
              border: isActive ? 'none' : '1px solid #d1d5db',
              fontSize: '0.6rem',
              cursor: 'pointer',
              padding: '1px 3px',
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Cell with 4 toggleable type chips for a single semantic type (radio-style: one active at a time).
 * Click active type to deselect; click inactive type to select (deselects others).
 */
const SemanticTypeToggleCell: React.FC<{
  activeType: string;
  onSelect: (type: string) => void;
  width?: string;
}> = ({ activeType, onSelect, width = '12%' }) => {
  return (
    <div
      style={{
        width,
        padding: '0 0.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        flexWrap: 'nowrap',
      }}
    >
      {SEMANTIC_TYPE_CYCLE_LIST.map((type) => {
        const isActive = activeType === type;
        const label = SEMANTIC_TYPE_SHORT_LABELS[type];
        const color = SEMANTIC_TYPE_COLORS[type as SemanticType];
        return (
          <span
            key={type}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(isActive ? '' : type);
            }}
            className={styles.metadataBadge}
            title={isActive ? `${type} (click to remove)` : `Set as ${type}`}
            style={{
              background: isActive ? color : 'transparent',
              color: isActive ? 'white' : '#9ca3af',
              border: isActive ? 'none' : '1px solid #d1d5db',
              fontSize: '0.6rem',
              cursor: 'pointer',
              padding: '1px 3px',
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
};

interface VirtualRowProps {
  source: string;
  translation: DictionaryEntryValue;
  _index: number;
  isScrolling: boolean;
  isSelected: boolean;
  selectedDictionary: string;
  onUpdateEntry: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: any
  ) => Promise<void>;
  onSelectEntry: (source: string, isSelected: boolean) => void;
  onContextMenu: (e: React.MouseEvent, source: string, translation: string) => void;
}

const VirtualRowComponent = React.memo<VirtualRowProps>(
  ({
    source,
    translation,
    _index,
    isScrolling,
    isSelected,
    selectedDictionary,
    onUpdateEntry,
    onSelectEntry,
    onContextMenu,
  }) => {
    const translationText = typeof translation === 'string' ? translation : translation.translation;
    const allowAsPatternVariable =
      typeof translation === 'object' && translation.allowAsPatternVariable === true;
    const lowPriority = typeof translation === 'object' && translation.lowPriority === true;
    const semanticType = (typeof translation === 'object' && translation.semanticType) || '';
    const allowedVariableTypes =
      (typeof translation === 'object' && translation.allowedVariableTypes) || {};

    // State for inline editing
    const [editingSource, setEditingSource] = React.useState(false);
    const [editingTranslation, setEditingTranslation] = React.useState(false);
    const [tempSource, setTempSource] = React.useState(source);
    const [tempTranslation, setTempTranslation] = React.useState(translationText);

    // Update temp values when props change (after save)
    React.useEffect(() => {
      if (!editingSource) setTempSource(source);
    }, [source, editingSource]);

    React.useEffect(() => {
      if (!editingTranslation) setTempTranslation(translationText);
    }, [translationText, editingTranslation]);

    // Builds the base metadata object shared across all metadata-update handlers
    const buildBaseMetadata = (): any => {
      const m: any = { allowAsPatternVariable, lowPriority };
      if (semanticType) m.semanticType = semanticType;
      if (Object.keys(allowedVariableTypes).length > 0)
        m.allowedVariableTypes = allowedVariableTypes;
      return m;
    };

    // Handle checkbox changes for patterns - preserve scroll position
    const handleCheckboxChange = async (field: string, value: boolean): Promise<void> => {
      try {
        const metadata = buildBaseMetadata();
        metadata[field] = value;

        // Use scroll-preserving update function
        await onUpdateEntry(selectedDictionary, source, source, translationText, metadata);
      } catch (error) {
        logger.error(`Failed to update ${field}:`, error);
      }
    };

    // Toggle a specific type on/off for a variable
    const handleToggleVariableType = async (varName: string, type: string): Promise<void> => {
      try {
        const current = allowedVariableTypes[varName] || [];
        const newAllowedTypes = { ...allowedVariableTypes };
        const isActive = current.includes(type);

        if (isActive) {
          // Remove type
          const filtered = current.filter((t) => t !== type);
          if (filtered.length > 0) {
            newAllowedTypes[varName] = filtered;
          } else {
            delete newAllowedTypes[varName];
          }
        } else {
          // Add type
          newAllowedTypes[varName] = [...current, type];
        }

        const metadata = buildBaseMetadata();
        if (Object.keys(newAllowedTypes).length > 0)
          metadata.allowedVariableTypes = newAllowedTypes;
        else delete metadata.allowedVariableTypes;

        await onUpdateEntry(selectedDictionary, source, source, translationText, metadata);
      } catch (error) {
        logger.error(`Failed to toggle variable ${varName} type ${type}:`, error);
      }
    };

    // Set semantic type directly (single-select for phrases/proper nouns)
    const handleSetSemanticType = async (newType: string): Promise<void> => {
      try {
        const metadata = buildBaseMetadata();
        if (newType) metadata.semanticType = newType;
        else delete metadata.semanticType;

        await onUpdateEntry(selectedDictionary, source, source, translationText, metadata);
      } catch (error) {
        logger.error('Failed to set semantic type:', error);
      }
    };

    // Handle text field changes
    const handleTextSave = async (field: 'source' | 'translation'): Promise<void> => {
      try {
        // Only pass metadata for dictionaries that support it
        const metadata =
          selectedDictionary === 'patterns' ||
          selectedDictionary === 'phrases' ||
          selectedDictionary.startsWith('properNouns')
            ? {
                allowAsPatternVariable,
                lowPriority,
                ...(semanticType && { semanticType }),
                ...(Object.keys(allowedVariableTypes).length > 0 && { allowedVariableTypes }),
              }
            : {};

        if (field === 'source') {
          if (tempSource !== source && tempSource.trim()) {
            await onUpdateEntry(
              selectedDictionary,
              source,
              tempSource.trim(),
              translationText,
              metadata
            );
          }
          setEditingSource(false);
        } else if (field === 'translation') {
          if (tempTranslation !== translationText && tempTranslation.trim()) {
            await onUpdateEntry(
              selectedDictionary,
              source,
              source,
              tempTranslation.trim(),
              metadata
            );
          }
          setEditingTranslation(false);
        }
      } catch (error) {
        logger.error(`Failed to update ${field}:`, error);
        // Reset to original value on error
        if (field === 'source') {
          setTempSource(source);
          setEditingSource(false);
        } else {
          setTempTranslation(translationText);
          setEditingTranslation(false);
        }
      }
    };

    // Handle text field cancellation
    const handleTextCancel = (field: 'source' | 'translation'): void => {
      if (field === 'source') {
        setTempSource(source);
        setEditingSource(false);
      } else {
        setTempTranslation(translationText);
        setEditingTranslation(false);
      }
    };

    // Handle keyboard events for text editing
    const handleKeyDown = (
      e: React.KeyboardEvent<HTMLInputElement>,
      field: 'source' | 'translation'
    ): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleTextSave(field);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleTextCancel(field);
      }
    };

    // Render pattern row: checkbox | source (25%) | translation+badges (43%) | semantic (12%) | X types (10%) | Y types (10%)
    if (selectedDictionary === 'patterns') {
      const hasX = source.includes('X');
      const hasY = source.includes('Y');
      return (
        <div
          onContextMenu={(e) => onContextMenu(e, source, translationText)}
          style={{
            height: ITEM_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
            willChange: isScrolling ? 'transform' : 'auto',
          }}
        >
          {/* Selection Checkbox - 40px */}
          <div className={styles.checkboxCell}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelectEntry(source, e.target.checked)}
              className={styles.checkboxInput}
              title="Select for deletion"
            />
          </div>

          {/* Source Text - calc(25% - 20px) with variable highlighting */}
          <div className={styles.cell} style={{ width: 'calc(25% - 20px)' }}>
            {editingSource ? (
              <input
                type="text"
                value={tempSource}
                onChange={(e) => setTempSource(e.target.value)}
                onBlur={() => handleTextSave('source')}
                onKeyDown={(e) => handleKeyDown(e, 'source')}
                autoFocus
                className={styles.inlineEditInput}
              />
            ) : (
              <span
                onClick={() => setEditingSource(true)}
                className={styles.clickableText}
                title="Click to edit"
              >
                {highlightPatternVariables(source)}
              </span>
            )}
          </div>

          {/* Translation - 43% with VAR/LP badges */}
          <div className={styles.cellEditable} style={{ width: '43%' }}>
            {editingTranslation ? (
              <input
                type="text"
                value={tempTranslation}
                onChange={(e) => setTempTranslation(e.target.value)}
                onBlur={() => handleTextSave('translation')}
                onKeyDown={(e) => handleKeyDown(e, 'translation')}
                autoFocus
                className={styles.inlineEditInput}
              />
            ) : (
              <>
                <span
                  onClick={() => setEditingTranslation(true)}
                  className={styles.clickableText}
                  title="Click to edit"
                >
                  {translationText}
                </span>
                <div className={styles.badgeContainer}>
                  <MetadataBadge
                    type="variable"
                    active={allowAsPatternVariable}
                    onClick={() =>
                      handleCheckboxChange('allowAsPatternVariable', !allowAsPatternVariable)
                    }
                  />
                  <MetadataBadge
                    type="lowPriority"
                    active={lowPriority}
                    onClick={() => handleCheckboxChange('lowPriority', !lowPriority)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Semantic type - 12% (only shown when pattern can be used as a variable) */}
          {allowAsPatternVariable ? (
            <SemanticTypeToggleCell
              activeType={semanticType}
              onSelect={handleSetSemanticType}
              width="12%"
            />
          ) : (
            <div style={{ width: '12%', minWidth: '12%' }} />
          )}

          {/* X type constraints - 10% */}
          <TypeToggleCell
            varName="X"
            hasVariable={hasX}
            activeTypes={allowedVariableTypes['X'] || []}
            onToggle={handleToggleVariableType}
          />

          {/* Y type constraints - 10% */}
          <TypeToggleCell
            varName="Y"
            hasVariable={hasY}
            activeTypes={allowedVariableTypes['Y'] || []}
            onToggle={handleToggleVariableType}
          />
        </div>
      );
    }

    // 3-column layout for phrases (with selection + Variable badge)
    if (selectedDictionary === 'phrases') {
      return (
        <div
          onContextMenu={(e) => onContextMenu(e, source, translationText)}
          style={{
            height: ITEM_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
            willChange: isScrolling ? 'transform' : 'auto',
          }}
        >
          {/* Selection Checkbox - 40px */}
          <div className={styles.checkboxCell}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelectEntry(source, e.target.checked)}
              className={styles.checkboxInput}
              title="Select for deletion"
            />
          </div>

          {/* Source Text - calc(25% - 20px) */}
          <div
            style={{
              width: 'calc(25% - 20px)',
              padding: '0.25rem 0.75rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {editingSource ? (
              <input
                type="text"
                value={tempSource}
                onChange={(e) => setTempSource(e.target.value)}
                onBlur={() => handleTextSave('source')}
                onKeyDown={(e) => handleKeyDown(e, 'source')}
                autoFocus
                className={styles.inlineEditInput}
              />
            ) : (
              <span
                onClick={() => setEditingSource(true)}
                className={styles.clickableText}
                title="Click to edit"
              >
                {source}
              </span>
            )}
          </div>

          {/* Translation - calc(63% - 20px) with VAR badge */}
          <div
            style={{
              width: 'calc(63% - 20px)',
              padding: '0.25rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              overflow: 'hidden',
            }}
          >
            {editingTranslation ? (
              <input
                type="text"
                value={tempTranslation}
                onChange={(e) => setTempTranslation(e.target.value)}
                onBlur={() => handleTextSave('translation')}
                onKeyDown={(e) => handleKeyDown(e, 'translation')}
                autoFocus
                className={styles.inlineEditInput}
              />
            ) : (
              <>
                <span
                  onClick={() => setEditingTranslation(true)}
                  className={styles.clickableText}
                  title="Click to edit"
                >
                  {translationText}
                </span>
                <div className={styles.badgeContainer}>
                  <MetadataBadge
                    type="variable"
                    active={allowAsPatternVariable}
                    onClick={() =>
                      handleCheckboxChange('allowAsPatternVariable', !allowAsPatternVariable)
                    }
                  />
                </div>
              </>
            )}
          </div>

          {/* Semantic type - 12% (only shown when entry is allowed as pattern variable) */}
          {allowAsPatternVariable ? (
            <SemanticTypeToggleCell
              activeType={semanticType}
              onSelect={handleSetSemanticType}
              width="12%"
            />
          ) : (
            <div style={{ width: '12%', minWidth: '12%' }} />
          )}
        </div>
      );
    }

    // Layout for simple dictionaries (with selection checkbox)
    const isProperNoun = selectedDictionary.startsWith('properNouns');
    const sourceWidth = isProperNoun ? 'calc(25% - 20px)' : 'calc(35% - 20px)';
    const translationWidth = isProperNoun ? 'calc(63% - 20px)' : 'calc(65% - 20px)';

    return (
      <div
        onContextMenu={(e) => onContextMenu(e, source, translationText)}
        style={{
          height: ITEM_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
          willChange: isScrolling ? 'transform' : 'auto',
        }}
      >
        {/* Selection Checkbox - 40px */}
        <div
          style={{
            width: '40px',
            minWidth: '40px',
            maxWidth: '40px',
            padding: '0.25rem 0.75rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelectEntry(source, e.target.checked)}
            style={{ cursor: 'pointer' }}
            title="Select for deletion"
          />
        </div>

        {/* Source Text */}
        <div className={styles.cell} style={{ width: sourceWidth }}>
          {editingSource ? (
            <input
              type="text"
              value={tempSource}
              onChange={(e) => setTempSource(e.target.value)}
              onBlur={() => handleTextSave('source')}
              onKeyDown={(e) => handleKeyDown(e, 'source')}
              autoFocus
              style={{
                width: '100%',
                border: '1px solid var(--accent-color)',
                borderRadius: '2px',
                padding: '2px 4px',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                backgroundColor: 'var(--background-color)',
                color: 'var(--text-color)',
              }}
            />
          ) : (
            <span
              onClick={() => setEditingSource(true)}
              style={{
                cursor: 'pointer',
                display: 'block',
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title="Click to edit"
            >
              {source}
            </span>
          )}
        </div>

        {/* Translation */}
        <div
          className={styles.cell}
          style={{
            width: translationWidth,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            overflow: 'hidden',
          }}
        >
          {editingTranslation ? (
            <input
              type="text"
              value={tempTranslation}
              onChange={(e) => setTempTranslation(e.target.value)}
              onBlur={() => handleTextSave('translation')}
              onKeyDown={(e) => handleKeyDown(e, 'translation')}
              autoFocus
              style={{
                width: '100%',
                border: '1px solid var(--accent-color)',
                borderRadius: '2px',
                padding: '2px 4px',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                backgroundColor: 'var(--background-color)',
                color: 'var(--text-color)',
              }}
            />
          ) : (
            <span
              onClick={() => setEditingTranslation(true)}
              style={{
                cursor: 'pointer',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title="Click to edit"
            >
              {translationText}
            </span>
          )}
        </div>

        {/* Semantic type column - only for proper nouns */}
        {isProperNoun && (
          <SemanticTypeToggleCell
            activeType={semanticType}
            onSelect={handleSetSemanticType}
            width="12%"
          />
        )}
      </div>
    );
  }
);

VirtualRowComponent.displayName = 'VirtualRowComponent';

/**
 * Enhanced Virtualized Dictionary Table
 * Optimized for handling 10,000+ dictionary entries with smooth performance
 *
 * Key optimizations:
 * - Throttled scroll events for 60fps performance
 * - Debounced search for reduced computation
 * - Memoized row rendering with React.memo
 * - Optimized filtering with early termination
 * - Dynamic buffer sizing based on list size
 * - Intersection Observer for visibility detection
 *
 * @param props - Component props
 * @returns Enhanced virtualized dictionary table with inline editing
 */
const EnhancedVirtualizedDictionaryTable: React.FC<EnhancedVirtualizedDictionaryTableProps> = ({
  selectedDictionary,
  searchRef,
  onSelectionChange,
  isActive,
  showDuplicatesMode = false,
  duplicateRows = [],
  onRefreshDuplicates,
  scrollRestore,
  onScrollSave,
}) => {
  const { dictionaries, deleteEntry, bulkDeleteEntries, updateEntry, isLoading } = useDictionary();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [editingEntry, setEditingEntry] = useState<EditingEntryData | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [moveEntry, setMoveEntry] = useState<MoveEntryData | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState<boolean>(false);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    entry: null,
  });
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState<boolean>(false);
  const [containerHeight, setContainerHeight] = useState<number>(600);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [preservedScrollTop, setPreservedScrollTop] = useState<number | null>(null);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);

  // OPTIMIZATION: Adaptive buffer sizing state
  const [bufferSize, setBufferSize] = useState<number>(10); // Start with default, will be optimized
  const [scrollVelocity, setScrollVelocity] = useState<number>(0);

  // Filter panel state
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);
  const [filterVariable, setFilterVariable] = useState<'all' | 'allowed' | 'not-allowed'>('all');
  const [filterSemanticTypes, setFilterSemanticTypes] = useState<Set<string>>(new Set());
  // Pattern-specific filters
  const [filterPatternType, setFilterPatternType] = useState<Set<string>>(new Set()); // 'x-only' | 'x-y'
  const [filterAllowAsVariable, setFilterAllowAsVariable] = useState<boolean>(false);
  const [filterLowPriority, setFilterLowPriority] = useState<boolean>(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTop = useRef<number>(0);
  const lastScrollTime = useRef<number>(Date.now());

  // Reset transient states when dictionary changes; search/filter state is global and
  // only reset when switching to a dictionary type where a filter doesn't apply:
  //   filterSemanticTypes  → phrases + proper nouns
  //   filterVariable       → phrases only
  //   filterPatternType / filterAllowAsVariable / filterLowPriority → patterns only
  useEffect(() => {
    const newIsPatterns = selectedDictionary === 'patterns';
    const newIsPhrases = selectedDictionary === 'phrases';
    const newIsProperNouns = selectedDictionary.startsWith('properNouns');

    if (!newIsPatterns) {
      setFilterPatternType(new Set());
      setFilterAllowAsVariable(false);
      setFilterLowPriority(false);
    }
    if (!newIsPhrases) {
      setFilterVariable('all');
    }
    if (!newIsPhrases && !newIsProperNouns) {
      setFilterSemanticTypes(new Set());
    }
    // Close filter panel when switching to a dictionary with no filter options
    if (!newIsPatterns && !newIsPhrases && !newIsProperNouns) {
      setShowFilterPanel(false);
    }

    // Always reset transient UI state
    setEditingEntry(null);
    setMoveEntry(null);
    setSelectedEntries(new Set());
    setShowBulkDeleteConfirm(false);
    setShowBulkMoveDialog(false);
    setContextMenu({ visible: false, x: 0, y: 0, entry: null });
    setIsDeleting(false);
    setIsUpdating(false);
    // Reset DOM scroll position as well as React state.
    // Without the DOM reset, a stale browser scrollTop (from the previous
    // dictionary) can persist even after scrollTop state is zeroed.  The
    // browser only auto-constrains scrollTop when the new totalHeight is
    // SMALLER than the old scroll position; when the new list is long enough
    // to contain the old position the DOM stays put but React renders as
    // though scrollTop=0 — mismatching offsetY leaves the viewport empty.
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    setScrollTop(0);
    setPreservedScrollTop(null);
    setIsScrolling(false);
    setScrollVelocity(0);
    lastScrollTop.current = 0;
  }, [selectedDictionary]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear selections when switching between duplicate and normal modes
  // BUGFIX: Prevents composite keys from persisting when exiting duplicate mode
  useEffect(() => {
    setSelectedEntries(new Set());
    setShowBulkDeleteConfirm(false);
  }, [showDuplicatesMode]);

  // Debounced search term
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchTerm]);

  // Reset scroll position when search term changes.
  // Without this, a stale `scrollTop` state can cause `startIndex` to exceed
  // `filteredEntries.length`, rendering no rows — the spacer background colour
  // then looks like "alternating shading stopped".
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    setScrollTop(0);
    lastScrollTop.current = 0;
  }, [debouncedSearchTerm]);

  // Remeasure container height when tab becomes active (fixes virtualization on tab switch)
  useEffect(() => {
    if (isActive && scrollRef.current) {
      // Use requestAnimationFrame to ensure DOM has fully rendered
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          const height = scrollRef.current.clientHeight;
          if (height > 0) {
            setContainerHeight(height);
          }
        }
      });
    }
  }, [isActive]);

  // Track ResizeObserver instance for cleanup
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Callback ref to set up ResizeObserver when scroll element is ready
  const scrollRefCallback = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    // Store ref for other code that uses scrollRef.current
    scrollRef.current = node;

    if (node) {
      // Set up ResizeObserver to measure viewport height
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          const height = entry.contentRect.height;
          setContainerHeight(height);
        }
      });

      resizeObserver.observe(node);
      resizeObserverRef.current = resizeObserver;
    }
  }, []);

  // Optimized filtered entries with early termination for large datasets
  const filteredEntries = useMemo((): [string, DictionaryEntryValue][] => {
    // In duplicate mode, return empty array (use filteredDuplicateRows instead)
    if (showDuplicatesMode) {
      return [];
    }

    const dictionary = dictionaries[selectedDictionary];
    if (!dictionary) return [];

    let entries = Object.entries(dictionary) as [string, DictionaryEntryValue][];

    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase();
      entries = entries.filter(([source, translation]) => {
        const translationText =
          typeof translation === 'string' ? translation : translation.translation;
        return (
          source.toLowerCase().includes(searchLower) ||
          translationText.toLowerCase().includes(searchLower)
        );
      });
    }

    if (filterVariable !== 'all') {
      entries = entries.filter(([, translation]) => {
        const allowed =
          typeof translation === 'object' && translation.allowAsPatternVariable === true;
        return filterVariable === 'allowed' ? allowed : !allowed;
      });
    }

    if (filterPatternType.size > 0) {
      entries = entries.filter(([source]) => {
        const hasX = source.includes('X');
        const hasY = source.includes('Y');
        const matchXOnly = filterPatternType.has('x-only') && hasX && !hasY;
        const matchXY = filterPatternType.has('x-y') && hasX && hasY;
        return matchXOnly || matchXY;
      });
    }

    if (filterAllowAsVariable) {
      entries = entries.filter(
        ([, translation]) =>
          typeof translation === 'object' && translation.allowAsPatternVariable === true
      );
    }

    if (filterLowPriority) {
      entries = entries.filter(
        ([, translation]) => typeof translation === 'object' && translation.lowPriority === true
      );
    }

    if (filterSemanticTypes.size > 0) {
      entries = entries.filter(([, translation]) => {
        const semType = (typeof translation === 'object' && translation.semanticType) || '';
        if (filterSemanticTypes.has('none')) {
          const specificTypes = new Set([...filterSemanticTypes].filter((t) => t !== 'none'));
          return semType === '' || specificTypes.has(semType);
        }
        return filterSemanticTypes.has(semType);
      });
    }

    return entries;
  }, [
    dictionaries,
    selectedDictionary,
    debouncedSearchTerm,
    showDuplicatesMode,
    filterVariable,
    filterSemanticTypes,
    filterPatternType,
    filterAllowAsVariable,
    filterLowPriority,
  ]);

  // Filtered duplicate rows for duplicate mode
  const filteredDuplicateRows = useMemo(() => {
    if (!showDuplicatesMode) return [];

    if (!debouncedSearchTerm) return duplicateRows;

    const searchLower = debouncedSearchTerm.toLowerCase();
    return duplicateRows.filter((row) => {
      return (
        row.source.toLowerCase().includes(searchLower) ||
        row.translation.toLowerCase().includes(searchLower) ||
        row.dictionaryLabel.toLowerCase().includes(searchLower)
      );
    });
  }, [duplicateRows, debouncedSearchTerm, showDuplicatesMode]);

  // Pre-calculate group indices for alternating backgrounds (memoized for performance)
  const duplicateGroupIndices = useMemo(() => {
    if (!showDuplicatesMode || filteredDuplicateRows.length === 0) return [];

    const indices: number[] = [];
    let groupIndex = 0;
    let lastSource = '';

    for (const row of filteredDuplicateRows) {
      if (row.source !== lastSource) {
        if (lastSource !== '') groupIndex++;
        lastSource = row.source;
      }
      indices.push(groupIndex);
    }

    return indices;
  }, [filteredDuplicateRows, showDuplicatesMode]);

  // Dynamic buffer sizing based on list size
  // OPTIMIZATION: Adaptive buffer size calculation
  useEffect(() => {
    const calculateOptimalBuffer = async () => {
      try {
        const optimalSize = await adaptiveBufferCalculator.calculateOptimalBufferSize({
          containerHeight,
          itemHeight: ITEM_HEIGHT,
          totalItems: filteredEntries.length,
          scrollVelocity,
          isScrolling,
        });

        if (optimalSize !== bufferSize) {
          setBufferSize(optimalSize);
        }
      } catch (error) {
        logger.warn('Buffer size calculation failed:', error);
        // Keep current buffer size on error
      }
    };

    // Calculate on significant changes
    const debounceTimer = setTimeout(calculateOptimalBuffer, 100);
    return () => clearTimeout(debounceTimer);
  }, [
    containerHeight,
    filteredEntries.length,
    filteredDuplicateRows.length,
    scrollVelocity,
    isScrolling,
    bufferSize,
  ]);

  // Optimized visible range calculation with adaptive buffer
  const visibleRange = useMemo(() => {
    const totalItems = showDuplicatesMode ? filteredDuplicateRows.length : filteredEntries.length;
    // bufferSize can be a non-integer (e.g. 22.5 from the 'medium' tier 1.5× multiplier).
    // Floor it here so that startIndex, offsetY, and backgroundPositionY are all integers —
    // a fractional startIndex produces sub-pixel row positioning and a wrong gradient phase.
    const buffer = Math.floor(bufferSize);
    // Clamp startIndex to [0, totalItems) so that a stale scrollTop (from before a
    // search that shrank filteredEntries) never pushes startIndex beyond the list end,
    // which would make visibleEntries empty and leave the spacer background visible.
    const rawStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - buffer);
    const startIndex = Math.min(rawStart, Math.max(0, totalItems - 1));
    const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT);
    const endIndex = Math.min(totalItems, startIndex + visibleCount + buffer * 2);

    return { startIndex, endIndex, visibleCount };
  }, [
    scrollTop,
    containerHeight,
    filteredEntries.length,
    filteredDuplicateRows.length,
    showDuplicatesMode,
    bufferSize,
  ]);

  const { startIndex, endIndex } = visibleRange;

  // Use different data source based on mode
  const visibleEntries = showDuplicatesMode
    ? [] // Not used in duplicate mode
    : filteredEntries.slice(startIndex, endIndex);

  const visibleDuplicateRows = showDuplicatesMode
    ? filteredDuplicateRows.slice(startIndex, endIndex)
    : [];

  // Calculate virtual scrolling properties based on mode
  const totalHeight = showDuplicatesMode
    ? filteredDuplicateRows.length * ITEM_HEIGHT
    : filteredEntries.length * ITEM_HEIGHT;
  const offsetY = startIndex * ITEM_HEIGHT;

  // OPTIMIZATION: Enhanced scroll handler with velocity tracking and performance monitoring
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>): void => {
      const frameStartTime = performance.now();
      const newScrollTop = e.currentTarget.scrollTop;
      const currentTime = Date.now();

      // Calculate scroll velocity
      const timeDelta = currentTime - lastScrollTime.current;
      const scrollDelta = newScrollTop - lastScrollTop.current;
      const velocity = timeDelta > 0 ? scrollDelta / timeDelta : 0;

      // Update scroll state
      lastScrollTop.current = newScrollTop;
      setScrollTop(newScrollTop);
      setScrollVelocity(velocity);
      setIsScrolling(true);

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Set scrolling to false after scroll ends
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        setScrollVelocity(0);
      }, 150);

      // Track performance metrics
      const frameEndTime = performance.now();
      const frameTime = frameEndTime - frameStartTime;

      adaptiveBufferCalculator.trackScrollingMetrics({
        frameTime,
        scrollVelocity: velocity,
        scrollTop: newScrollTop,
        isScrolling: true,
        bufferSize: bufferSize,
        visibleItems: Math.ceil(containerHeight / ITEM_HEIGHT),
        totalItems: filteredEntries.length,
      });

      // Update refs for next calculation
      lastScrollTime.current = currentTime;
    },
    [bufferSize, containerHeight, filteredEntries.length]
  );

  // Optimized scroll utilities
  const scrollToTop = useCallback((): void => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const scrollToBottom = useCallback((): void => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: totalHeight,
        behavior: 'smooth',
      });
    }
  }, [totalHeight]);

  // Wrapped updateEntry function that preserves scroll position
  const updateEntryWithScrollPreservation = useCallback(
    async (
      dictionaryId: string,
      oldSource: string,
      newSource: string,
      translation: string,
      metadata?: any
    ): Promise<void> => {
      // Capture scroll position before update
      // BUGFIX: Use scrollRef.current directly to avoid infinite loop
      // scrollTop in deps would cause callback recreation on every scroll → cascade of updates
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

  // Restore scroll position after dictionary updates
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
  }, [isUpdating, preservedScrollTop]);

  // Restore scroll position after duplicate rows refresh
  // CODE REVIEW FIX 2026-02-09 (CRITICAL): Add timeout cleanup and replace hardcoded delay with RAF
  useEffect(() => {
    // Track RAF ID for cleanup
    let rafId: number | null = null;

    if (
      scrollRestore !== null &&
      scrollRestore !== undefined &&
      scrollRef.current &&
      onScrollSave
    ) {
      const position = scrollRestore;
      let attempts = 0;
      const maxAttempts = 60; // Max 1 second at 60fps

      // Use RAF to wait for virtualized list to finish rendering
      // More reliable than fixed 300ms delay - adapts to device performance
      const waitForRender = () => {
        attempts++;

        if (scrollRef.current && onScrollSave) {
          // Check if we can safely restore scroll
          // The virtualized list is ready when the container has proper height
          const container = scrollRef.current;
          const isReady = container.scrollHeight > 0 && attempts > 3; // Wait at least 3 frames

          if (isReady || attempts >= maxAttempts) {
            container.scrollTop = position;
            setScrollTop(position);
            onScrollSave(null); // Clear the restore position
          } else {
            // Try again next frame
            rafId = requestAnimationFrame(waitForRender);
          }
        }
      };

      rafId = requestAnimationFrame(waitForRender);
    }

    // Cleanup RAF on unmount or when dependencies change
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [scrollRestore, onScrollSave]);

  // Selection handlers with scroll preservation
  const handleSelectEntry = useCallback((source: string, isSelected: boolean): void => {
    // Capture scroll position before selection state change
    // BUGFIX: Use scrollRef.current directly to avoid infinite loop
    const currentScrollTop = scrollRef.current?.scrollTop ?? 0;

    setSelectedEntries((prev) => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(source);
      } else {
        newSet.delete(source);
      }
      return newSet;
    });

    // Restore scroll position after state update
    requestAnimationFrame(() => {
      if (scrollRef.current && scrollRef.current.scrollTop !== currentScrollTop) {
        scrollRef.current.scrollTop = currentScrollTop;
        setScrollTop(currentScrollTop);
      }
    });
  }, []);

  const handleSelectAll = useCallback(
    (isSelected: boolean): void => {
      // Capture scroll position before bulk selection change
      // BUGFIX: Use scrollRef.current directly to avoid infinite loop
      const currentScrollTop = scrollRef.current?.scrollTop ?? 0;

      if (isSelected) {
        const allSources = filteredEntries.map(([source]) => source);
        setSelectedEntries(new Set(allSources));
      } else {
        setSelectedEntries(new Set());
      }

      // Restore scroll position after state update
      requestAnimationFrame(() => {
        if (scrollRef.current && scrollRef.current.scrollTop !== currentScrollTop) {
          scrollRef.current.scrollTop = currentScrollTop;
          setScrollTop(currentScrollTop);
        }
      });
    },
    [filteredEntries]
  );

  const handleBulkDelete = useCallback(async (): Promise<void> => {
    if (selectedEntries.size === 0) return;

    setIsDeleting(true);

    const errors: string[] = [];
    let successCount = 0;

    try {
      if (showDuplicatesMode) {
        // Duplicate mode: selectedEntries contains composite keys (source::dictionaryId)
        // Group deletions by dictionary, handling malformed keys gracefully
        const deletionsByDict = new Map<string, string[]>();

        // Parse all keys first, collecting errors
        for (const key of selectedEntries) {
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
        // CODE REVIEW FIX 2026-02-09 (MEDIUM): Add dictionary existence check and parallelize deletions
        const deletionPromises = Array.from(deletionsByDict.entries()).map(
          async ([dictionaryId, sources]) => {
            try {
              // Check if dictionary still exists before attempting deletion
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

        // Wait for all deletions to complete in parallel
        const results = await Promise.all(deletionPromises);

        // Aggregate results
        for (const result of results) {
          successCount += result.successCount;
          errors.push(...result.errors);
        }
      } else {
        // Normal mode: selectedEntries contains source strings, all from same dictionary
        const entriesToDelete = Array.from(selectedEntries);
        try {
          const result = await bulkDeleteEntries(selectedDictionary, entriesToDelete);
          successCount = result.successCount;
          errors.push(...result.errors);
        } catch (deleteError) {
          errors.push(`Failed to delete entries: ${(deleteError as Error).message}`);
          logger.error('Bulk delete error:', deleteError);
        }
      }

      // Report results to user using toast
      if (errors.length > 0) {
        if (successCount > 0) {
          // Partial success
          toast.warning(
            `Deleted ${successCount} of ${selectedEntries.size} entries. ${errors.length} failed.`,
            6000
          );
        } else {
          // All failed
          toast.error(
            `Failed to delete ${selectedEntries.size} ${selectedEntries.size === 1 ? 'entry' : 'entries'}.`,
            6000
          );
        }
      } else {
        // All succeeded
        toast.success(
          `Deleted ${successCount} ${successCount === 1 ? 'entry' : 'entries'} successfully`,
          3000
        );
        setSelectedEntries(new Set());
        setShowBulkDeleteConfirm(false);
      }

      // Refresh duplicate view if in duplicate mode (to show updated state)
      if (showDuplicatesMode && onRefreshDuplicates && onScrollSave) {
        // Save scroll position for restoration after duplicateRows updates
        const currentScroll = scrollRef.current?.scrollTop ?? 0;
        await onRefreshDuplicates();
        onScrollSave(currentScroll);
      }
    } catch (error) {
      toast.error(`Critical error during deletion: ${(error as Error).message}`, 6000);
      logger.error('Bulk delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [
    selectedEntries,
    selectedDictionary,
    bulkDeleteEntries,
    dictionaries,
    showDuplicatesMode,
    onRefreshDuplicates,
  ]);

  const handleBulkMove = useCallback((): void => {
    if (selectedEntries.size === 0) return;
    setShowBulkMoveDialog(true);
  }, [selectedEntries]);

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

  // Context menu handlers
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, source: string, translation: string): void => {
      e.preventDefault();
      setContextMenu({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        entry: { source, translation },
      });
    },
    []
  );

  const closeContextMenu = useCallback((): void => {
    setContextMenu({ visible: false, x: 0, y: 0, entry: null });
  }, []);

  const handleContextMenuEdit = (): void => {
    if (!contextMenu.entry) return;
    const dictionary = dictionaries[selectedDictionary];
    if (!dictionary) return;

    const value = dictionary[contextMenu.entry.source];
    setEditingEntry({
      source: contextMenu.entry.source,
      translation: value,
      allowAsPatternVariable:
        typeof value === 'object' && value.allowAsPatternVariable ? true : false,
      lowPriority: typeof value === 'object' && value.lowPriority ? true : false,
    });
    closeContextMenu();
  };

  const handleContextMenuMove = (): void => {
    if (!contextMenu.entry) return;
    setMoveEntry(contextMenu.entry);
    closeContextMenu();
  };

  const handleContextMenuDelete = async (): Promise<void> => {
    if (!contextMenu.entry) return;
    try {
      await deleteEntry(selectedDictionary, contextMenu.entry.source);
      closeContextMenu();
    } catch (error) {
      toast.error(`Failed to delete entry: ${(error as Error).message}`, 6000);
      closeContextMenu();
    }
  };

  // Close context menu when clicking outside
  useEffect(() => {
    if (contextMenu.visible) {
      const handleClickOutside = () => closeContextMenu();
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return undefined;
  }, [contextMenu.visible, closeContextMenu]);

  // Context menu keyboard navigation ref
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Auto-focus first menu item when context menu opens
  useEffect(() => {
    if (contextMenu.visible && contextMenuRef.current) {
      const firstButton =
        contextMenuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstButton?.focus();
    }
  }, [contextMenu.visible]);

  // Handle keyboard navigation inside context menu
  const handleContextMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (!contextMenuRef.current) return;
      const items = Array.from(
        contextMenuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
      );
      const focused = document.activeElement as HTMLButtonElement;
      const currentIndex = items.indexOf(focused);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(currentIndex + 1) % items.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length]?.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeContextMenu();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        closeContextMenu();
      }
    },
    [closeContextMenu]
  );

  // Optimized row component with React.memo (defined at module scope to prevent type churn)
  const VirtualRow = VirtualRowComponent;

  // Determine which filter options are relevant for the selected dictionary
  const isPatternsDictionary = selectedDictionary === 'patterns';
  const isPhrasesDictionary = selectedDictionary === 'phrases';
  const isProperNounsDictionary = selectedDictionary.startsWith('properNouns');
  const showPatternFilter = isPatternsDictionary;
  const showVariableFilter = isPhrasesDictionary; // phrases only; patterns use showPatternFilter
  const showSemanticTypeFilter = isPhrasesDictionary || isProperNounsDictionary;
  const hasFilterOptions = showPatternFilter || showVariableFilter || showSemanticTypeFilter;
  const hasActiveFilter =
    filterVariable !== 'all' ||
    filterSemanticTypes.size > 0 ||
    filterPatternType.size > 0 ||
    filterAllowAsVariable ||
    filterLowPriority;

  // Performance monitoring for large lists
  const performanceMetrics = useMemo(() => {
    const listSize = filteredEntries.length;
    const renderedCount = visibleEntries.length;
    const renderRatio = listSize > 0 ? (renderedCount / listSize) * 100 : 0;

    return {
      totalEntries: listSize,
      renderedEntries: renderedCount,
      renderEfficiency: renderRatio.toFixed(1),
      isLargeDataset: listSize > LARGE_LIST_THRESHOLD,
    };
  }, [filteredEntries.length, visibleEntries.length]);

  if (isLoading) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}
      >
        <Loader className="animate-spin" size={24} />
      </div>
    );
  }

  // Duplicate mode rendering (4-column layout)
  if (showDuplicatesMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Search controls */}
        <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search duplicates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '0.875rem',
              border: '1px solid var(--border-color)',
              borderRadius: '0.25rem',
              backgroundColor: 'var(--input-background)',
              color: 'var(--text-color)',
            }}
          />
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--background-color)',
              fontWeight: 'bold',
              fontSize: '0.875rem',
            }}
          >
            <div style={{ width: '40px', padding: '0.5rem 0.75rem', textAlign: 'center' }}>☐</div>
            <div style={{ width: '20%', padding: '0.5rem 0.75rem' }}>Source Text</div>
            <div style={{ width: '50%', padding: '0.5rem 0.75rem' }}>Translation</div>
            <div style={{ width: 'calc(30% - 40px)', padding: '0.5rem 0.75rem' }}>Dictionary</div>
          </div>

          {/* Rows */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{ flex: 1, overflow: 'auto', position: 'relative' }}
          >
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ transform: `translateY(${offsetY}px)` }}>
                {visibleDuplicateRows.map((row, index) => {
                  const key = createDuplicateKey(row.source, row.dictionaryId);
                  const isSelected = selectedEntries.has(key);

                  // Get pre-calculated group index for alternating backgrounds
                  const actualIndex = startIndex + index;
                  const groupIndex = duplicateGroupIndices[actualIndex] || 0;

                  // Alternating group background colors
                  // Light mode: slightly darker, Dark mode: slightly lighter
                  // Using opacity-based approach for consistency across themes
                  const groupBgColor =
                    groupIndex % 2 === 0
                      ? 'transparent'
                      : 'color-mix(in srgb, var(--text-color) 4%, transparent)';
                  const backgroundColor = isSelected
                    ? 'var(--accent-light, #e0f2fe)'
                    : groupBgColor;

                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        borderBottom: '1px solid var(--border-color)',
                        height: `${ITEM_HEIGHT}px`,
                        alignItems: 'center',
                        backgroundColor,
                      }}
                    >
                      <div style={{ width: '40px', padding: '0 0.75rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const newSet = new Set(selectedEntries);
                            if (isSelected) {
                              newSet.delete(key);
                            } else {
                              newSet.add(key);
                            }
                            setSelectedEntries(newSet);
                          }}
                          style={{ cursor: 'pointer' }}
                          aria-label={`Select ${row.source} from ${row.dictionaryLabel}`}
                        />
                      </div>
                      <div
                        style={{
                          width: '20%',
                          padding: '0 0.75rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.source}
                      </div>
                      <div
                        style={{
                          width: '50%',
                          padding: '0 0.75rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.translation}
                      </div>
                      <div
                        style={{
                          width: 'calc(30% - 40px)',
                          padding: '0 0.75rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary, #6b7280)',
                          fontWeight:
                            row.dictionaryLabel === 'Phrases' ||
                            row.dictionaryLabel === 'Proper Nouns'
                              ? 'bold'
                              : 'normal',
                        }}
                      >
                        {row.dictionaryLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search controls */}
      <div
        style={{
          display: 'flex',
          padding: '1rem',
          gap: '1rem',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <input
          type="text"
          placeholder="Search dictionary entries..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          ref={searchRef}
          style={{
            flex: 1,
            padding: '0.5rem',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            backgroundColor: 'var(--background-color)',
            color: 'var(--text-color)',
            fontSize: '0.875rem',
          }}
        />
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={scrollToTop}
            className="icon"
            title="Scroll to top"
            style={{ padding: '0.5rem' }}
          >
            <ChevronsUp size={16} />
          </button>
          <button
            onClick={scrollToBottom}
            className="icon"
            title="Scroll to bottom"
            style={{ padding: '0.5rem' }}
          >
            <ChevronsDown size={16} />
          </button>
          {hasFilterOptions && (
            <button
              onClick={() => setShowFilterPanel((v) => !v)}
              className="icon"
              title={showFilterPanel ? 'Hide filters' : 'Filter entries'}
              style={{
                padding: '0.5rem',
                backgroundColor: hasActiveFilter
                  ? 'var(--accent-color)'
                  : showFilterPanel
                    ? 'color-mix(in srgb, var(--accent-color) 15%, transparent)'
                    : undefined,
                color: hasActiveFilter ? 'white' : undefined,
                borderRadius: '4px',
              }}
            >
              <Filter size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilterPanel && hasFilterOptions && (
        <div
          style={{
            padding: '0.5rem 1rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            backgroundColor: 'color-mix(in srgb, var(--accent-color) 5%, var(--background-color))',
          }}
        >
          {showPatternFilter && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted-text)', fontWeight: 600 }}>
                  Pattern:
                </span>
                {(
                  [
                    ['x-only', 'X only'],
                    ['x-y', 'X–Y'],
                  ] as const
                ).map(([key, label]) => {
                  const isActive = filterPatternType.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setFilterPatternType((prev) => {
                          const next = new Set(prev);
                          if (isActive) next.delete(key);
                          else next.add(key);
                          return next;
                        });
                      }}
                      style={{
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        border: `1px solid ${isActive ? 'var(--accent-color)' : 'var(--border-color)'}`,
                        cursor: 'pointer',
                        backgroundColor: isActive ? 'var(--accent-color)' : 'transparent',
                        color: isActive ? 'white' : 'var(--text-color)',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted-text)', fontWeight: 600 }}>
                  Flags:
                </span>
                {(
                  [
                    [
                      filterAllowAsVariable,
                      setFilterAllowAsVariable,
                      'Allow as Variable',
                      '#059669',
                    ],
                    [filterLowPriority, setFilterLowPriority, 'Low Priority', '#dc2626'],
                  ] as const
                ).map(([isActive, setter, label, color]) => (
                  <button
                    key={label}
                    onClick={() => setter((v: boolean) => !v)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      border: `1px solid ${isActive ? color : 'var(--border-color)'}`,
                      cursor: 'pointer',
                      backgroundColor: isActive ? color : 'transparent',
                      color: isActive ? 'white' : 'var(--text-color)',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {showVariableFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted-text)', fontWeight: 600 }}>
                Variable:
              </span>
              {(['all', 'allowed', 'not-allowed'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setFilterVariable(opt)}
                  style={{
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    border: `1px solid ${filterVariable === opt ? 'var(--accent-color)' : 'var(--border-color)'}`,
                    cursor: 'pointer',
                    backgroundColor: filterVariable === opt ? 'var(--accent-color)' : 'transparent',
                    color: filterVariable === opt ? 'white' : 'var(--text-color)',
                    fontWeight: filterVariable === opt ? 600 : 400,
                  }}
                >
                  {opt === 'all' ? 'All' : opt === 'allowed' ? 'Allowed' : 'Not Allowed'}
                </button>
              ))}
            </div>
          )}
          {showSemanticTypeFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted-text)', fontWeight: 600 }}>
                Type:
              </span>
              {(Object.values(SEMANTIC_TYPES) as SemanticType[]).map((type) => {
                const isActive = filterSemanticTypes.has(type);
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setFilterSemanticTypes((prev) => {
                        const next = new Set(prev);
                        if (isActive) next.delete(type);
                        else next.add(type);
                        return next;
                      });
                    }}
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      borderRadius: '4px',
                      border: `1px solid ${isActive ? SEMANTIC_TYPE_COLORS[type] : 'var(--border-color)'}`,
                      cursor: 'pointer',
                      backgroundColor: isActive ? SEMANTIC_TYPE_COLORS[type] : 'transparent',
                      color: isActive ? 'white' : 'var(--text-color)',
                      fontWeight: 600,
                    }}
                  >
                    {SEMANTIC_TYPE_SHORT_LABELS[type]}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  setFilterSemanticTypes((prev) => {
                    const next = new Set(prev);
                    if (next.has('none')) next.delete('none');
                    else next.add('none');
                    return next;
                  });
                }}
                style={{
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  border: `1px solid ${filterSemanticTypes.has('none') ? 'var(--accent-color)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  backgroundColor: filterSemanticTypes.has('none')
                    ? 'var(--accent-color)'
                    : 'transparent',
                  color: filterSemanticTypes.has('none') ? 'white' : 'var(--text-color)',
                }}
              >
                No Type
              </button>
            </div>
          )}
          {hasActiveFilter && (
            <button
              onClick={() => {
                setFilterVariable('all');
                setFilterSemanticTypes(new Set());
                setFilterPatternType(new Set());
                setFilterAllowAsVariable(false);
                setFilterLowPriority(false);
              }}
              style={{
                padding: '0.2rem 0.5rem',
                fontSize: '0.75rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: 'var(--muted-text)',
                marginLeft: 'auto',
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Enhanced entry count indicator with performance metrics */}
      <div
        style={{
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',
          color: 'var(--muted-text)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          Showing {visibleEntries.length} of {filteredEntries.length} entries
        </span>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            fontSize: '0.75rem',
            color: 'var(--accent-color)',
          }}
        >
          {process.env.NODE_ENV === 'development' && performanceMetrics.isLargeDataset && (
            <span>
              Render efficiency: {performanceMetrics.renderEfficiency}%
              {isScrolling && ' (scrolling)'}
            </span>
          )}
          {/* OPTIMIZATION: Adaptive buffer indicator */}
          {process.env.NODE_ENV === 'development' && (
            <span style={{ color: 'var(--muted-text)' }}>Buffer: {bufferSize} (adaptive)</span>
          )}
        </div>
      </div>

      {/* Empty state when no entries */}
      {filteredEntries.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem',
          }}
        >
          <div
            style={{
              color: 'var(--text-color)',
              opacity: 0.4,
              textAlign: 'center',
              fontSize: '1rem',
              lineHeight: '1.8',
            }}
          >
            {searchTerm || hasActiveFilter ? (
              <>
                <div style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>
                  {searchTerm
                    ? `No entries matching "${searchTerm}"`
                    : 'No entries match the active filters'}
                </div>
                <div style={{ fontSize: '0.95rem', opacity: 0.8 }}>
                  {searchTerm && hasActiveFilter
                    ? 'Try a different search term or adjust the filters'
                    : searchTerm
                      ? 'Try a different search term'
                      : 'Try adjusting or clearing the filters'}
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>
                  Dictionary is empty
                </div>
                <div style={{ fontSize: '0.95rem', opacity: 0.8 }}>
                  Add entries using Quick Add
                  <br />
                  shortcuts (Cmd/Ctrl+1-5)
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Enhanced virtualized table container */}
          <div
            ref={tableContainerRef}
            style={{
              flex: 1,
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {/* Fixed table header */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: 'var(--background-color)',
                flexShrink: 0,
                zIndex: 1,
              }}
            >
              {selectedDictionary === 'patterns' ? (
                <>
                  <div
                    style={{
                      width: '40px',
                      minWidth: '40px',
                      maxWidth: '40px',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedEntries.size > 0 && selectedEntries.size === filteredEntries.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                      title="Select all"
                      aria-label="Select all entries"
                    />
                  </div>
                  <div
                    style={{
                      width: 'calc(25% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                    title="Pattern with highlighted variables"
                  >
                    Source
                  </div>
                  <div
                    style={{
                      width: '43%',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                    title="Translation with metadata badges (VAR = Allow as variable, LP = Low priority)"
                  >
                    Translation
                  </div>
                  <div
                    style={{
                      width: '12%',
                      padding: '0.5rem 0.25rem',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      textAlign: 'center',
                    }}
                    title="Output semantic type (shown when pattern can be used as a variable)"
                  >
                    Semantic
                  </div>
                  <div
                    style={{
                      width: '10%',
                      padding: '0.5rem 0.25rem',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      textAlign: 'center',
                    }}
                    title="Type constraints for variable X"
                  >
                    X types
                  </div>
                  <div
                    style={{
                      width: '10%',
                      padding: '0.5rem 0.25rem',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      textAlign: 'center',
                    }}
                    title="Type constraints for variable Y"
                  >
                    Y types
                  </div>
                </>
              ) : selectedDictionary === 'phrases' ? (
                <>
                  <div
                    style={{
                      width: '40px',
                      minWidth: '40px',
                      maxWidth: '40px',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedEntries.size > 0 && selectedEntries.size === filteredEntries.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                      title="Select all"
                      aria-label="Select all entries"
                    />
                  </div>
                  <div
                    style={{
                      width: 'calc(25% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    Source
                  </div>
                  <div
                    style={{
                      width: 'calc(63% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                    title="Translation with metadata badge (VAR = Allow as variable)"
                  >
                    Translation
                  </div>
                  <div
                    style={{
                      width: '12%',
                      padding: '0.5rem 0.25rem',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      textAlign: 'center',
                    }}
                    title="Semantic type"
                  >
                    Semantic
                  </div>
                </>
              ) : selectedDictionary.startsWith('properNouns') ? (
                <>
                  <div
                    style={{
                      width: '40px',
                      minWidth: '40px',
                      maxWidth: '40px',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedEntries.size > 0 && selectedEntries.size === filteredEntries.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                      title="Select all"
                      aria-label="Select all entries"
                    />
                  </div>
                  <div
                    style={{
                      width: 'calc(25% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    Source
                  </div>
                  <div
                    style={{
                      width: 'calc(63% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    Translation
                  </div>
                  <div
                    style={{
                      width: '12%',
                      padding: '0.5rem 0.25rem',
                      fontWeight: 'bold',
                      fontSize: '0.75rem',
                      textAlign: 'center',
                    }}
                    title="Semantic type"
                  >
                    Semantic
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      width: '40px',
                      minWidth: '40px',
                      maxWidth: '40px',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedEntries.size > 0 && selectedEntries.size === filteredEntries.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                      title="Select all"
                      aria-label="Select all entries"
                    />
                  </div>
                  <div
                    style={{
                      width: 'calc(35% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    Source Text
                  </div>
                  <div
                    style={{
                      width: 'calc(65% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    Translation
                  </div>
                </>
              )}
            </div>

            {/* Scrollable content with enhanced performance */}
            <div
              ref={scrollRefCallback}
              onScroll={handleScroll}
              style={{
                flex: 1,
                minHeight: 0,
                maxHeight: '100%',
                overflow: 'auto',
                position: 'relative',
              }}
            >
              {/* Virtual spacer for total height */}
              <div
                style={{
                  height: totalHeight,
                  position: 'relative',
                  // Hint to browser about content changes
                  willChange: 'transform',
                }}
              >
                {/* Visible entries container with transform optimization.
                    The repeating gradient lives here (not on the spacer) so that
                    transparent rows look through to their DIRECT parent and see the
                    correct stripe at their slice-local y-coordinate.
                    backgroundPositionY shifts the gradient phase so that slice-index 0
                    matches the global parity of startIndex: if startIndex is odd the
                    first row of the rendered slice should show the odd stripe. */}
                <div
                  style={{
                    transform: `translateY(${offsetY}px)`,
                    willChange: isScrolling ? 'transform' : 'auto',
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--background-color) 0px, var(--background-color) ${ITEM_HEIGHT}px, color-mix(in srgb, var(--text-color) 4%, transparent) ${ITEM_HEIGHT}px, color-mix(in srgb, var(--text-color) 4%, transparent) ${ITEM_HEIGHT * 2}px)`,
                    backgroundPositionY: `${(startIndex % 2) * ITEM_HEIGHT}px`,
                  }}
                >
                  {visibleEntries.map(([source, translation], index) => {
                    const actualIndex = startIndex + index;
                    return (
                      <VirtualRow
                        key={`${selectedDictionary}-${source}-${actualIndex}`}
                        source={source}
                        translation={translation}
                        _index={index}
                        isScrolling={isScrolling}
                        isSelected={selectedEntries.has(source)}
                        selectedDictionary={selectedDictionary}
                        onUpdateEntry={updateEntryWithScrollPreservation}
                        onSelectEntry={handleSelectEntry}
                        onContextMenu={handleContextMenu}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Entry editing modal */}
      {editingEntry && (
        <DictionaryEntry
          onClose={() => setEditingEntry(null)}
          entry={editingEntry}
          selectedDictionary={selectedDictionary}
        />
      )}

      {/* Move entry dialog */}
      {moveEntry && (
        <MoveEntryDialog
          onClose={() => setMoveEntry(null)}
          entry={moveEntry}
          currentDictionary={selectedDictionary}
        />
      )}

      {/* Context menu */}
      {contextMenu.visible && contextMenu.entry && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label="Entry actions"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: 'var(--background-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 2000,
            minWidth: '180px',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleContextMenuKeyDown}
        >
          <button
            role="menuitem"
            onClick={handleContextMenuEdit}
            className={styles.contextMenuItem}
          >
            <Edit2 size={14} />
            <span>Edit Entry</span>
          </button>

          <button
            role="menuitem"
            onClick={handleContextMenuMove}
            className={styles.contextMenuItem}
          >
            <ChevronsUp size={14} />
            <span>Move to...</span>
          </button>

          <div
            style={{
              height: '1px',
              backgroundColor: 'var(--border-color)',
              margin: '0.25rem 0',
            }}
          />

          <button
            role="menuitem"
            onClick={handleContextMenuDelete}
            className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
          >
            <Trash2 size={14} />
            <span>Delete Entry</span>
          </button>
        </div>
      )}

      {/* Bulk move dialog */}
      {showBulkMoveDialog && (
        <BulkMoveDialog
          selectedDictionary={selectedDictionary}
          selectedEntries={selectedEntries}
          onClose={() => setShowBulkMoveDialog(false)}
          onMoveSuccess={() => {
            setSelectedEntries(new Set());
            setShowBulkMoveDialog(false);
          }}
        />
      )}
    </div>
  );
};

export default EnhancedVirtualizedDictionaryTable;
