import React, { useMemo } from 'react';
import { Loader, ChevronsUp, ChevronsDown } from 'lucide-react';
import { useDictionary } from './DictionaryContext';
import DictionaryTableView from './DictionaryTableView';
import { ITEM_HEIGHT, SemanticTypeFilterChips, FilterChipButton } from './TableBuildingBlocks';
import { SearchFilterHeader, FilterPanel, FilterDimensionRow } from '../SearchFilterHeader';
import { useDictionaryEntryFilter } from '../../hooks/useDictionaryEntryFilter';
import type { SelectionState } from '../../hooks/useEntrySelection';
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
  /** Duplicate rows to display when in duplicate mode. Derived live from dictionary state by
   * the parent, so an edit/move/delete updates the view in place — no refresh, no remount. */
  duplicateRows?: import('../../utils/dictionary/DuplicateAnalyzer').DuplicateRow[];
}

const numberFormat = new Intl.NumberFormat();

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
 * Holds what survives a dictionary switch: the search term, the filters, and the scroll state
 * (which returns to the top on its own `resetKey`). One dictionary's rows, selection, edit/move
 * and context menu are `DictionaryTableView`, keyed by the dictionary, so a switch remounts
 * them fresh — see GLOSSARY.md "Dictionary table view".
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
  const { dictionaries, isLoading } = useDictionary();

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
    availableFilters,
    toggleSemanticType,
    togglePatternType,
    setVariable,
    clearFilters,
  } = useDictionaryEntryFilter(dictionaries, selectedDictionary, duplicateRows, showDuplicatesMode);

  const totalItems = showDuplicatesMode ? filteredDuplicateRows.length : filteredEntries.length;

  // Back to the top whenever the list is a different list: another dictionary, a new search,
  // a changed filter. A stale scrollTop can push startIndex past the new list's end, leaving
  // the spacer background visible ("alternating shading stopped").
  const scroll = useVirtualScrollRange(totalItems, {
    itemHeight: ITEM_HEIGHT,
    isActive,
    resetKey: [
      selectedDictionary,
      debouncedSearchTerm,
      filterVariable,
      [...filterSemanticTypes].sort().join(','),
      [...filterPatternType].sort().join(','),
    ].join('\u0000'),
  });

  const {
    patternType: showPatternFilter,
    variable: showVariableFilter,
    semantic: showSemanticTypeFilter,
  } = availableFilters;

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

  const emptyState =
    !showDuplicatesMode && filteredEntries.length === 0 ? (
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
              <div style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>Dictionary is empty</div>
              <div style={{ fontSize: '0.95rem', opacity: 0.8 }}>
                Use Add Entry above, or select text in the
                <br />
                Translator or Reader tab and press Cmd/Ctrl+1–6
              </div>
            </>
          )}
        </div>
      </div>
    ) : null;

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

      <DictionaryTableView
        key={selectedDictionary}
        selectedDictionary={selectedDictionary}
        showDuplicatesMode={showDuplicatesMode}
        filteredEntries={filteredEntries}
        filteredDuplicateRows={filteredDuplicateRows}
        duplicateGroupIndices={duplicateGroupIndices}
        scroll={scroll}
        emptyState={emptyState}
        onSelectionChange={onSelectionChange}
      />
    </div>
  );
};

export default EnhancedVirtualizedDictionaryTable;
