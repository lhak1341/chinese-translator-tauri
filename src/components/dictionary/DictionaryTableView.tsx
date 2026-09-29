import React, { useCallback, useMemo } from 'react';
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
  entryCapabilities,
} from '../../utils/dictionary';
import type { DuplicateRow } from '../../utils/dictionary/DuplicateAnalyzer';
import type { DictionaryEntryValue } from '../../types/DictionaryTypes';
import { VirtualRowComponent, DICTIONARY_SEMANTIC_COLUMN_WIDTH } from './VirtualRowComponent';
import { ITEM_HEIGHT, SelectAllCheckboxHeaderCell } from './TableBuildingBlocks';
import { useEntrySelection, type SelectionState } from '../../hooks/useEntrySelection';
import { useContextMenu, type ContextMenuEntry } from '../../hooks/useContextMenu';
import type { UseVirtualScrollRangeResult } from '../../hooks/useVirtualScrollRange';
import { useEntryEditAndMove } from '../../hooks/useEntryEditAndMove';
import { logger } from '../../utils/logger';

export interface DictionaryTableViewProps {
  selectedDictionary: string;
  showDuplicatesMode: boolean;
  filteredEntries: [string, DictionaryEntryValue][];
  filteredDuplicateRows: DuplicateRow[];
  duplicateGroupIndices: number[];
  /** The table's scroll state. It outlives this view (the scroll buttons above the rows read
   * it) and resets itself on a new view through its `resetKey`. */
  scroll: UseVirtualScrollRangeResult;
  /** Shown in place of the rows when the normal view has none, or `null`. */
  emptyState: React.ReactNode;
  onSelectionChange?: (state: SelectionState) => void;
}

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
  const variableType = (v: 'X' | 'Y'): HeaderColumn => ({
    label: `${v} types`,
    widthClassName: styles.patternsTypeCol,
    title: `Type constraints for variable ${v}`,
  });
  // Which capability columns appear comes from the entry capabilities; each kind's column
  // classes and labels below are layout.
  const caps = entryCapabilities(dictionaryId);
  const capabilityColumns = (semanticTitle: string): HeaderColumn[] => [
    ...(caps.semantic !== 'none' ? [semantic(semanticTitle)] : []),
    ...(caps.variableTypes ? [variableType('X'), variableType('Y')] : []),
  ];
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
      ...capabilityColumns('Output semantic type (shown when pattern can be used as a variable)'),
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
      ...capabilityColumns('Semantic type'),
    ];
  }
  if (isProperNounsDict(dictionaryId)) {
    return [
      { label: 'Source', className: styles.properNounsSourceCol },
      { label: 'Translation', className: styles.properNounsTranslationCol },
      ...capabilityColumns('Semantic type'),
    ];
  }
  return [
    { label: 'Source Text', className: styles.simpleSourceCol },
    { label: 'Translation', className: styles.simpleTranslationCol },
    ...capabilityColumns('Semantic type'),
  ];
}

/**
 * One dictionary's view in the Dictionary table: its rows, and the state that belongs to
 * looking at that one dictionary — selection, the open edit or move, the context menu. See
 * CONTEXT.md "Dictionary table view".
 *
 * Rendered with `key={selectedDictionary}`, so switching dictionaries remounts it and that
 * state starts fresh. Nothing resets it by hand. What survives a switch (the search term, the
 * filters the new dictionary supports, the panel's open state) lives above it, in
 * `EnhancedVirtualizedDictionaryTable`; the scroll position resets through its own `resetKey`.
 */
const DictionaryTableView: React.FC<DictionaryTableViewProps> = ({
  selectedDictionary,
  showDuplicatesMode,
  filteredEntries,
  filteredDuplicateRows,
  duplicateGroupIndices,
  scroll,
  emptyState,
  onSelectionChange,
}) => {
  const { dictionaries, deleteEntry, bulkDeleteEntries, updateEntry, patchEntry } = useDictionary();

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

  const totalItems = showDuplicatesMode ? filteredDuplicateRows.length : filteredEntries.length;
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
    patchEntryWithScrollPreservation,
    onContextMenuEdit,
    onContextMenuMove,
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
  const { handleContextMenu } = contextMenuApi;

  // Duplicate view's Semantic column — keyed by the row's own dictionary.
  const handleSetDuplicateSemanticType = useCallback(
    (row: DuplicateRow, type: string): void => {
      patchEntryWithScrollPreservation(row.dictionaryId, row.source, { semanticType: type }).catch(
        (error: unknown) => logger.error('Failed to set semantic type:', error)
      );
    },
    [patchEntryWithScrollPreservation]
  );

  const headerColumns = useMemo(() => getHeaderColumns(selectedDictionary), [selectedDictionary]);

  return (
    <>
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
      ) : (
        (emptyState ?? (
          <>
            {/* Enhanced virtualized table container */}
            <div
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
                        onPatchEntry={patchEntryWithScrollPreservation}
                        onSelectEntry={handleSelectEntry}
                        onContextMenu={handleContextMenu}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ))
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
    </>
  );
};

export default DictionaryTableView;
