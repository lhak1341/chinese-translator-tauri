import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Edit2, Trash2, Loader, ChevronsUp, ChevronsDown, Filter } from 'lucide-react';
import { useDictionary } from './DictionaryContext';
import DictionaryEntry from './DictionaryEntry';
import MoveEntryDialog from './MoveEntryDialog';
import BulkMoveDialog from './BulkMoveDialog';
import { adaptiveBufferCalculator } from '../../utils/ui';
import { createDuplicateKey } from '../../utils/dictionary';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { logger } from '../../utils/logger';
import type { EditingEntryData, MoveEntryData } from '../../types/DictionaryTypes';
import {
  SEMANTIC_TYPE_COLORS,
  SEMANTIC_TYPE_ABBREVIATIONS,
  SEMANTIC_TYPES,
} from '../../constants/SemanticTypes';
import type { SemanticType } from '../../constants/SemanticTypes';
import { VirtualRowComponent, ITEM_HEIGHT } from './VirtualRowComponent';
import { useDictionaryEntryFilter } from '../../hooks/useDictionaryEntryFilter';
import { useEntrySelection, type SelectionState } from '../../hooks/useEntrySelection';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useVirtualScrollRange } from '../../hooks/useVirtualScrollRange';

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
  duplicateRows?: import('../../utils/dictionary/DuplicateAnalyzer').DuplicateRow[];
  /** Callback to refresh duplicate view after deletion */
  onRefreshDuplicates?: (reloadFromBackend?: boolean) => Promise<void>;
  /** Scroll position to restore (managed by parent to survive unmount/remount) */
  scrollRestore?: number | null;
  /** Callback to save scroll position before refresh (pass null to clear) */
  onScrollSave?: (position: number | null) => void;
}

// OPTIMIZATION: Dynamic buffer sizing replaced fixed BUFFER_SIZE = 10
// Now calculated based on device performance, viewport, and memory pressure
const SEARCH_DEBOUNCE_MS = 150; // Debounce search input
const LARGE_LIST_THRESHOLD = 1000; // When to apply additional optimizations

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
  const [moveEntry, setMoveEntry] = useState<MoveEntryData | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [preservedScrollTop, setPreservedScrollTop] = useState<number | null>(null);

  // OPTIMIZATION: Adaptive buffer sizing state
  const [bufferSize, setBufferSize] = useState<number>(10); // Start with default, will be optimized

  // Filter panel state
  const [showFilterPanel, setShowFilterPanel] = useState<boolean>(false);
  const [filterVariable, setFilterVariable] = useState<'all' | 'allowed' | 'not-allowed'>('all');
  const [filterSemanticTypes, setFilterSemanticTypes] = useState<Set<string>>(new Set());
  // Pattern-specific filters
  const [filterPatternType, setFilterPatternType] = useState<Set<string>>(new Set()); // 'x-only' | 'x-y'
  const [filterAllowAsVariable, setFilterAllowAsVariable] = useState<boolean>(false);
  const [filterLowPriority, setFilterLowPriority] = useState<boolean>(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

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
    resetSelection();
    closeContextMenu();
    setIsUpdating(false);
    setPreservedScrollTop(null);
    // scroll is declared after this effect but the closure runs post-render, so it's initialized
    scroll.resetScroll();
  }, [selectedDictionary]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear selections when switching between duplicate and normal modes
  // BUGFIX: Prevents composite keys from persisting when exiting duplicate mode
  useEffect(() => {
    resetSelection();
  }, [showDuplicatesMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const { filteredEntries, filteredDuplicateRows, duplicateGroupIndices } =
    useDictionaryEntryFilter(dictionaries, selectedDictionary, duplicateRows, {
      debouncedSearchTerm,
      showDuplicatesMode,
      filterVariable,
      filterSemanticTypes,
      filterPatternType,
      filterAllowAsVariable,
      filterLowPriority,
    });

  const totalItems = showDuplicatesMode ? filteredDuplicateRows.length : filteredEntries.length;

  const scroll = useVirtualScrollRange(totalItems, {
    itemHeight: ITEM_HEIGHT,
    bufferSize,
    isActive,
    scrollRestore,
    onScrollSave,
  });

  const {
    selectedEntries,
    showBulkMoveDialog,
    setShowBulkMoveDialog,
    handleSelectEntry,
    handleSelectAll,
    resetSelection,
  } = useEntrySelection({
    selectedDictionary,
    filteredEntries,
    dictionaries,
    showDuplicatesMode,
    scrollRef: scroll.scrollRef,
    setScrollTop: scroll.setScrollTop,
    bulkDeleteEntries,
    onRefreshDuplicates,
    onScrollSave,
    onSelectionChange,
  });

  // Reset scroll + transient state when search term changes.
  // Without the scroll reset, a stale scrollTop can push startIndex past the filtered
  // list end, leaving the spacer background visible ("alternating shading stopped").
  useEffect(() => {
    scroll.resetScroll();
  }, [debouncedSearchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamic buffer sizing based on list size
  // OPTIMIZATION: Adaptive buffer size calculation
  useEffect(() => {
    const calculateOptimalBuffer = async () => {
      try {
        const optimalSize = await adaptiveBufferCalculator.calculateOptimalBufferSize({
          containerHeight: scroll.containerHeight,
          itemHeight: ITEM_HEIGHT,
          totalItems: filteredEntries.length,
          scrollVelocity: scroll.scrollVelocity,
          isScrolling: scroll.isScrolling,
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
    scroll.containerHeight,
    filteredEntries.length,
    filteredDuplicateRows.length,
    scroll.scrollVelocity,
    scroll.isScrolling,
    bufferSize,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const { startIndex, endIndex } = scroll.visibleRange;

  // Use different data source based on mode
  const visibleEntries = showDuplicatesMode
    ? [] // Not used in duplicate mode
    : filteredEntries.slice(startIndex, endIndex);

  const visibleDuplicateRows = showDuplicatesMode
    ? filteredDuplicateRows.slice(startIndex, endIndex)
    : [];

  const totalHeight = totalItems * ITEM_HEIGHT;
  const offsetY = startIndex * ITEM_HEIGHT;

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
      const currentScrollTop = scroll.scrollRef.current?.scrollTop ?? 0;
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
    if (!isUpdating && preservedScrollTop !== null && scroll.scrollRef.current) {
      requestAnimationFrame(() => {
        if (scroll.scrollRef.current) {
          scroll.scrollRef.current.scrollTop = preservedScrollTop;
          scroll.setScrollTop(preservedScrollTop);
        }
        setPreservedScrollTop(null);
      });
    }
  }, [isUpdating, preservedScrollTop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Context menu — action callbacks (EVDT-owned state side effects)
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

  const onContextMenuDelete = useCallback(
    async (source: string): Promise<void> => {
      await deleteEntry(selectedDictionary, source);
    },
    [deleteEntry, selectedDictionary]
  );

  const {
    contextMenu,
    contextMenuRef,
    closeContextMenu,
    handleContextMenu,
    handleContextMenuEdit,
    handleContextMenuMove,
    handleContextMenuDelete,
    handleContextMenuKeyDown,
  } = useContextMenu({
    onEdit: onContextMenuEdit,
    onMove: onContextMenuMove,
    onDelete: onContextMenuDelete,
  });

  // Optimized row component with React.memo (defined at module scope to prevent type churn)
  const VirtualRow = VirtualRowComponent;

  // Determine which filter options are relevant for the selected dictionary
  const isPatternsDictionary = selectedDictionary === 'patterns';
  const isPhrasesDictionary = selectedDictionary === 'phrases';
  const isProperNounsDictionary = selectedDictionary.startsWith('properNouns');
  const showPatternFilter = isPatternsDictionary;
  const showVariableFilter = isPhrasesDictionary; // phrases only; patterns use showPatternFilter
  const showSemanticTypeFilter =
    isPhrasesDictionary || isProperNounsDictionary || isPatternsDictionary;
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
            ref={scroll.scrollRefCallback}
            onScroll={scroll.handleScroll}
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
                          onChange={() => handleSelectEntry(key, !isSelected)}
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
            onClick={scroll.scrollToTop}
            className="icon"
            title="Scroll to top"
            style={{ padding: '0.5rem' }}
          >
            <ChevronsUp size={16} />
          </button>
          <button
            onClick={scroll.scrollToBottom}
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
                    {SEMANTIC_TYPE_ABBREVIATIONS[type]}
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
              {scroll.isScrolling && ' (scrolling)'}
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
                      width: '34%',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                    title="Translation with metadata badges (VAR = Allow as variable, LP = Low priority)"
                  >
                    Translation
                  </div>
                  <div
                    style={{
                      width: '15%',
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
                      width: '13%',
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
                      width: '13%',
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
                      width: 'calc(60% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                    title="Translation with metadata badge (VAR = Allow as variable)"
                  >
                    Translation
                  </div>
                  <div
                    style={{
                      width: '15%',
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
                      width: 'calc(60% - 20px)',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    Translation
                  </div>
                  <div
                    style={{
                      width: '15%',
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
              ref={scroll.scrollRefCallback}
              onScroll={scroll.handleScroll}
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
                    willChange: scroll.isScrolling ? 'transform' : 'auto',
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
                        isScrolling={scroll.isScrolling}
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
          onMoveSuccess={() => resetSelection()}
        />
      )}
    </div>
  );
};

export default EnhancedVirtualizedDictionaryTable;
