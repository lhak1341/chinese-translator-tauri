import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { Loader, ChevronsUp, ChevronsDown } from 'lucide-react';
import { useDictionary } from './DictionaryContext';
import DictionaryEntry from './DictionaryEntry';
import MoveDialog from './MoveDialog';
import EntryContextMenu from './EntryContextMenu';
import DuplicateDictionaryTableView from './DuplicateDictionaryTableView';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import {
  isPatternsDict,
  isPhrasesDict,
  isProperNounsDict,
  isLookupTableDict,
  buildEntryMetadata,
} from '../../utils/dictionary';
import type { DuplicateRow } from '../../utils/dictionary/DuplicateAnalyzer';
import { VirtualRowComponent, DICTIONARY_SEMANTIC_COLUMN_WIDTH } from './VirtualRowComponent';
import {
  ITEM_HEIGHT,
  SemanticTypeFilterChips,
  FilterChipButton,
  SelectAllCheckboxHeaderCell,
} from './TableBuildingBlocks';
import { SearchFilterHeader, FilterPanel, FilterDimensionRow } from '../SearchFilterHeader';
import { useDictionaryEntryFilter } from '../../hooks/useDictionaryEntryFilter';
import { useEntrySelection, type SelectionState } from '../../hooks/useEntrySelection';
import { useContextMenu, type ContextMenuEntry } from '../../hooks/useContextMenu';
import { useVirtualScrollRange } from '../../hooks/useVirtualScrollRange';
import { useEntryEditAndMove } from '../../hooks/useEntryEditAndMove';
import { logger } from '../../utils/logger';

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
  /** Duplicate rows to display when in duplicate mode. Derived live from dictionary state by
   * the parent, so an edit/move/delete updates the view in place — no refresh, no remount. */
  duplicateRows?: import('../../utils/dictionary/DuplicateAnalyzer').DuplicateRow[];
}

const numberFormat = new Intl.NumberFormat();

/** One header cell. `className` columns are left-aligned text columns whose width class is
 * shared with the matching row cell; the rest are centered badge columns (fixed `width`, or a
 * `widthClassName` for the X/Y type columns). Order must match `VirtualRowComponent`'s cells. */
interface HeaderColumn {
  label: string;
  title?: string;
  className?: string;
  widthClassName?: string;
  width?: string;
}

function getHeaderColumns(dictionaryId: string): HeaderColumn[] {
  const semantic = (title: string): HeaderColumn => ({
    label: 'Semantic',
    title,
    width: DICTIONARY_SEMANTIC_COLUMN_WIDTH,
  });
  if (isPatternsDict(dictionaryId)) {
    return [
      {
        label: 'Source',
        className: styles.patternsSourceCol,
        title: 'Pattern with highlighted variables',
      },
      {
        label: 'Translation',
        className: styles.patternsTranslationCol,
        title: 'Translation with metadata badges (VAR = Allow as variable, LP = Low priority)',
      },
      semantic('Output semantic type (shown when pattern can be used as a variable)'),
      {
        label: 'X types',
        widthClassName: styles.patternsTypeCol,
        title: 'Type constraints for variable X',
      },
      {
        label: 'Y types',
        widthClassName: styles.patternsTypeCol,
        title: 'Type constraints for variable Y',
      },
    ];
  }
  if (isPhrasesDict(dictionaryId)) {
    return [
      { label: 'Source', className: styles.phrasesSourceCol },
      {
        label: 'Translation',
        className: styles.phrasesTranslationCol,
        title: 'Translation with metadata badge (VAR = Allow as variable)',
      },
      semantic('Semantic type'),
    ];
  }
  if (isProperNounsDict(dictionaryId)) {
    return [
      { label: 'Source', className: styles.properNounsSourceCol },
      { label: 'Translation', className: styles.properNounsTranslationCol },
      semantic('Semantic type'),
    ];
  }
  return [
    { label: 'Source Text', className: styles.simpleSourceCol },
    { label: 'Translation', className: styles.simpleTranslationCol },
  ];
}

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
}) => {
  const { dictionaries, deleteEntry, bulkDeleteEntries, updateEntry, patchEntry, isLoading } =
    useDictionary();

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Clear selections when switching between duplicate and normal modes
  // BUGFIX: Prevents composite keys from persisting when exiting duplicate mode
  useEffect(() => {
    resetSelection();
  }, [showDuplicatesMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    filteredEntries,
    filteredDuplicateRows,
    duplicateGroupIndices,
    hasActiveFilter,
    searchTerm,
    setSearchTerm,
    debouncedSearchTerm,
    showFilterPanel,
    setShowFilterPanel,
    filterVariable,
    filterSemanticTypes,
    filterPatternType,
    filterAllowAsVariable,
    toggleSemanticType,
    togglePatternType,
    toggleFlag,
    setVariable,
    clearFilters,
    resetFilters,
  } = useDictionaryEntryFilter(dictionaries, selectedDictionary, duplicateRows, showDuplicatesMode);

  const totalItems = showDuplicatesMode ? filteredDuplicateRows.length : filteredEntries.length;

  const scroll = useVirtualScrollRange(totalItems, {
    itemHeight: ITEM_HEIGHT,
    isActive,
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
    filteredDuplicateRows,
    dictionaries,
    showDuplicatesMode,
    withScrollPreservation: scroll.withScrollPreservation,
    bulkDeleteEntries,
    onSelectionChange,
  });

  // Reset scroll + transient state when search term changes.
  // Without the scroll reset, a stale scrollTop can push startIndex past the filtered
  // list end, leaving the spacer background visible ("alternating shading stopped").
  useEffect(() => {
    scroll.resetScroll();
  }, [debouncedSearchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  const { startIndex, endIndex } = scroll.visibleRange;

  // Use different data source based on mode
  const visibleEntries = showDuplicatesMode
    ? [] // Not used in duplicate mode
    : filteredEntries.slice(startIndex, endIndex);

  const visibleDuplicateRows = showDuplicatesMode
    ? filteredDuplicateRows.slice(startIndex, endIndex)
    : [];

  const totalHeight = totalItems * ITEM_HEIGHT;

  const {
    editingEntry,
    moveEntry,
    closeEdit,
    closeMove,
    updateEntryWithScrollPreservation,
    onContextMenuEdit,
    onContextMenuMove,
    reset: resetEditAndMove,
  } = useEntryEditAndMove({
    dictionaries,
    updateEntry,
    patchEntry,
    withScrollPreservation: scroll.withScrollPreservation,
  });

  // Acts on the entry's own dictionary, not `selectedDictionary` — in the duplicate view every
  // row can belong to a different one.
  const withScrollPreservation = scroll.withScrollPreservation;
  const onContextMenuDelete = useCallback(
    async (entry: ContextMenuEntry): Promise<void> => {
      await withScrollPreservation(() => deleteEntry(entry.dictionaryId, entry.source));
    },
    [deleteEntry, withScrollPreservation]
  );

  const contextMenuApi = useContextMenu({
    onEdit: onContextMenuEdit,
    onMove: onContextMenuMove,
    onDelete: onContextMenuDelete,
  });
  const { closeContextMenu, handleContextMenu } = contextMenuApi;

  // Reset all per-dictionary transient state when the selected dictionary changes.
  // Filter state is only reset for dictionary types where a filter doesn't apply:
  //   filterSemanticTypes  → phrases + proper nouns
  //   filterVariable       → phrases only
  //   filterPatternType / filterAllowAsVariable → patterns only
  useEffect(() => {
    resetFilters(selectedDictionary);
    resetEditAndMove();
    resetSelection();
    closeContextMenu();
    scroll.resetScroll();
  }, [selectedDictionary]); // eslint-disable-line react-hooks/exhaustive-deps

  // Determine which filter options are relevant for the selected dictionary
  const showPatternFilter = isPatternsDict(selectedDictionary);
  const showVariableFilter = isPhrasesDict(selectedDictionary); // phrases only; patterns use showPatternFilter
  const showSemanticTypeFilter = !isLookupTableDict(selectedDictionary);
  // Duplicate view's Semantic column: same metadata rebuild as useEntryMetadataEdit's
  // handleSetSemanticType, but keyed by the row's own dictionary.
  const handleSetDuplicateSemanticType = useCallback(
    (row: DuplicateRow, type: string): void => {
      const value = dictionaries[row.dictionaryId]?.[row.source];
      if (value === undefined || typeof value === 'string') return;
      const metadata: Record<string, unknown> = {
        ...buildEntryMetadata({
          allowAsPatternVariable: value.allowAsPatternVariable === true,
          semanticType: value.semanticType ?? '',
          allowedVariableTypes: value.allowedVariableTypes ?? {},
        }),
      };
      if (type) metadata.semanticType = type;
      else delete metadata.semanticType;
      void updateEntryWithScrollPreservation(
        row.dictionaryId,
        row.source,
        row.source,
        value.translation,
        metadata
      ).catch((error: unknown) => logger.error('Failed to set semantic type:', error));
    },
    [dictionaries, updateEntryWithScrollPreservation]
  );

  const headerColumns = useMemo(() => getHeaderColumns(selectedDictionary), [selectedDictionary]);

  const hasFilterOptions =
    !showDuplicatesMode && (showPatternFilter || showVariableFilter || showSemanticTypeFilter);

  // "Rows 1,201–1,220 of 40,512" — where the viewport is in the whole list. The old
  // "Showing <rendered slice size> of N" counted the virtualization buffer, not what's on screen.
  const positionLabel = useMemo(() => {
    const noun = showDuplicatesMode ? 'duplicate rows' : 'entries';
    if (totalItems === 0) return `0 ${noun}`;
    const first = Math.min(scroll.visibleRange.firstVisibleIndex + 1, totalItems);
    const last = Math.min(first + scroll.visibleRange.visibleCount - 1, totalItems);
    return `Rows ${numberFormat.format(first)}–${numberFormat.format(last)} of ${numberFormat.format(totalItems)} ${noun}`;
  }, [
    showDuplicatesMode,
    totalItems,
    scroll.visibleRange.firstVisibleIndex,
    scroll.visibleRange.visibleCount,
  ]);

  if (isLoading) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}
      >
        <Loader className="animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search controls */}
      <SearchFilterHeader
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={
          showDuplicatesMode ? 'Search duplicates...' : 'Search dictionary entries...'
        }
        searchRef={searchRef}
        showFilterButton={hasFilterOptions}
        filterOpen={showFilterPanel}
        filterActive={hasActiveFilter}
        onToggleFilter={() => setShowFilterPanel((v) => !v)}
        filterButtonLabel="Filter entries"
        trailingActions={
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              onClick={scroll.scrollToTop}
              className="icon"
              title="Scroll to top"
              aria-label="Scroll to top"
              style={{ padding: '0.5rem' }}
            >
              <ChevronsUp size={16} />
            </button>
            <button
              onClick={scroll.scrollToBottom}
              className="icon"
              title="Scroll to bottom"
              aria-label="Scroll to bottom"
              style={{ padding: '0.5rem' }}
            >
              <ChevronsDown size={16} />
            </button>
          </div>
        }
      />

      {/* Filter panel */}
      <FilterPanel open={showFilterPanel && hasFilterOptions}>
        {showPatternFilter && (
          <>
            <FilterDimensionRow label="Pattern:">
              {(
                [
                  ['x-only', 'X only'],
                  ['x-y', 'X–Y'],
                  ['no-variable', 'No variable'],
                ] as const
              ).map(([key, label]) => (
                <FilterChipButton
                  key={key}
                  active={filterPatternType.has(key)}
                  activeColor="var(--accent-color)"
                  label={label}
                  onClick={() => togglePatternType(key)}
                />
              ))}
            </FilterDimensionRow>
            <FilterDimensionRow label="Flags:">
              {(
                [
                  [filterAllowAsVariable, 'allowAsVariable', 'Allow as Variable', '#059669'],
                ] as const
              ).map(([isActive, flag, label, color]) => (
                <FilterChipButton
                  key={label}
                  active={isActive}
                  activeColor={color}
                  label={label}
                  onClick={() => toggleFlag(flag)}
                />
              ))}
            </FilterDimensionRow>
          </>
        )}
        {showVariableFilter && (
          <FilterDimensionRow label="Variable:">
            {(['all', 'allowed', 'not-allowed'] as const).map((opt) => (
              <FilterChipButton
                key={opt}
                active={filterVariable === opt}
                activeColor="var(--accent-color)"
                label={opt === 'all' ? 'All' : opt === 'allowed' ? 'Allowed' : 'Not Allowed'}
                onClick={() => setVariable(opt)}
              />
            ))}
          </FilterDimensionRow>
        )}
        {showSemanticTypeFilter && (
          <FilterDimensionRow label="Type:">
            <SemanticTypeFilterChips
              activeTypes={filterSemanticTypes}
              onToggle={toggleSemanticType}
            />
            <FilterChipButton
              active={filterSemanticTypes.has('none')}
              activeColor="var(--accent-color)"
              label="No Type"
              onClick={() => toggleSemanticType('none')}
            />
          </FilterDimensionRow>
        )}
        {hasActiveFilter && (
          <FilterChipButton
            active={false}
            activeColor="var(--accent-color)"
            inactiveColor="var(--muted-text)"
            label="Clear filters"
            onClick={clearFilters}
            style={{ marginLeft: 'auto' }}
          />
        )}
      </FilterPanel>

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
        <span>{positionLabel}</span>
      </div>

      {showDuplicatesMode ? (
        <DuplicateDictionaryTableView
          scrollRefCallback={scroll.scrollRefCallback}
          onScroll={scroll.handleScroll}
          totalHeight={totalHeight}
          visibleDuplicateRows={visibleDuplicateRows}
          startIndex={startIndex}
          duplicateGroupIndices={duplicateGroupIndices}
          selectedEntries={selectedEntries}
          onSelectEntry={handleSelectEntry}
          allSelected={
            selectedEntries.size > 0 && selectedEntries.size === filteredDuplicateRows.length
          }
          onSelectAll={handleSelectAll}
          onSetSemanticType={handleSetDuplicateSemanticType}
          onContextMenu={handleContextMenu}
        />
      ) : filteredEntries.length === 0 ? (
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
                  Use Add Entry above, or select text in the
                  <br />
                  Translator or Reader tab and press Cmd/Ctrl+1–6
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
              <SelectAllCheckboxHeaderCell
                checked={
                  selectedEntries.size > 0 && selectedEntries.size === filteredEntries.length
                }
                onChange={handleSelectAll}
              />
              {headerColumns.map((col) =>
                col.className ? (
                  <div
                    key={col.label}
                    className={`${col.className} ${styles.headerCell}`}
                    title={col.title}
                  >
                    {col.label}
                  </div>
                ) : (
                  <div
                    key={col.label}
                    className={col.widthClassName}
                    style={{
                      width: col.width,
                      padding: '0.5rem 0.25rem',
                      fontWeight: 'bold',
                      textAlign: 'center',
                    }}
                    title={col.title}
                  >
                    {col.label}
                  </div>
                )
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
                overflowAnchor: 'none',
                position: 'relative',
              }}
            >
              {/* Virtual spacer for total height. Each row is absolutely positioned at its own
                  global index — nothing shifts in layout when rows enter or leave the rendered
                  window. The earlier translateY'd slice shifted every row up 40px in layout
                  whenever the top buffer row was dropped; WebKit's scroll anchoring "corrected"
                  that by pulling scrollTop back, which re-added the row: flicker, then stuck.
                  The stripe gradient sits on the spacer, in global coordinates, so a row's stripe
                  parity is its real index with no phase bookkeeping. */}
              <div
                style={{
                  height: totalHeight,
                  position: 'relative',
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--background-color) 0px, var(--background-color) ${ITEM_HEIGHT}px, color-mix(in srgb, var(--text-color) 4%, transparent) ${ITEM_HEIGHT}px, color-mix(in srgb, var(--text-color) 4%, transparent) ${ITEM_HEIGHT * 2}px)`,
                }}
              >
                {visibleEntries.map(([source, translation], index) => (
                  // Keyed by source alone (unique within a dictionary): an index in the key
                  // remounted every row below an insert/delete, dropping inline-edit state.
                  <div
                    key={`${selectedDictionary}\u0000${source}`}
                    style={{
                      position: 'absolute',
                      top: (startIndex + index) * ITEM_HEIGHT,
                      left: 0,
                      right: 0,
                      height: ITEM_HEIGHT,
                    }}
                  >
                    <VirtualRowComponent
                      source={source}
                      translation={translation}
                      isSelected={selectedEntries.has(source)}
                      selectedDictionary={selectedDictionary}
                      onUpdateEntry={updateEntryWithScrollPreservation}
                      onSelectEntry={handleSelectEntry}
                      onContextMenu={handleContextMenu}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Entry editing modal */}
      {editingEntry && (
        <DictionaryEntry
          onClose={closeEdit}
          entry={editingEntry}
          selectedDictionary={editingEntry.dictionaryId ?? selectedDictionary}
        />
      )}

      <EntryContextMenu menu={contextMenuApi} />

      {/* Move dialog — single entry (context menu) or bulk (multi-select) */}
      {(moveEntry || showBulkMoveDialog) && (
        <MoveDialog
          entries={moveEntry ? [moveEntry.source] : Array.from(selectedEntries)}
          currentDictionary={moveEntry ? moveEntry.dictionaryId : selectedDictionary}
          onClose={() => {
            closeMove();
            setShowBulkMoveDialog(false);
          }}
          onSuccess={() => resetSelection()}
        />
      )}
    </div>
  );
};

export default EnhancedVirtualizedDictionaryTable;
