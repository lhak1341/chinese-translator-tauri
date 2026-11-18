import React, { useCallback, useMemo } from 'react';
import { Table, TableHeader, TableHeaderCell } from '@lhak/style/react';
import { useDictionary } from './DictionaryContext';
import DictionaryEntry from './DictionaryEntry';
import MoveDialog from './MoveDialog';
import EntryContextMenu from './EntryContextMenu';
import DuplicateDictionaryTableView from './DuplicateDictionaryTableView';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';
import { entryCapabilities } from '../../utils/dictionary';
import { tableColumns } from './TableColumns';
import type { DuplicateRow } from '../../utils/dictionary/DuplicateAnalyzer';
import type { DictionaryEntryValue } from '../../types/DictionaryTypes';
import type { EntryRef } from '../../utils/dictionary/DictionaryEdit';
import { VirtualRowComponent, DICTIONARY_SEMANTIC_COLUMN_WIDTH } from './VirtualRowComponent';
import { SelectAllCheckboxHeaderCell } from './TableBuildingBlocks';
import { VirtualTableBody } from './VirtualTableBody';
import { useEntrySelection, type SelectionState } from '../../hooks/useEntrySelection';
import { useContextMenu, type ContextMenuEntry } from '../../hooks/useContextMenu';
import type { UseVirtualScrollRangeResult } from '../../hooks/useVirtualScrollRange';
import { useEntryEditAndMove } from '../../hooks/useEntryEditAndMove';
import { entryPatcher } from './EntryCells';

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
  // Which capability columns appear comes from the entry capabilities; the Source and
  // Translation columns — classes, labels, titles — from `tableColumns`, which every row reads too.
  const caps = entryCapabilities(dictionaryId);
  const { source, translation, semanticTitle } = tableColumns(dictionaryId);
  return [
    source,
    translation,
    ...(caps.semantic !== 'none' ? [semantic(semanticTitle)] : []),
    ...(caps.variableTypes ? [variableType('X'), variableType('Y')] : []),
  ];
}

/**
 * One dictionary's view in the Dictionary table: its rows, and the state that belongs to
 * looking at that one dictionary — selection, the open edit or move, the context menu. See
 * GLOSSARY.md "Dictionary table view".
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
  const { dictionaries, bulkDeleteEntries, renameEntry, patchEntry } = useDictionary();

  // The rows this view shows, as entries: select-all selects these.
  const viewEntries = useMemo(
    (): EntryRef[] =>
      showDuplicatesMode
        ? filteredDuplicateRows.map((row) => ({ dictionaryId: row.dictionaryId, key: row.source }))
        : filteredEntries.map(([source]) => ({ dictionaryId: selectedDictionary, key: source })),
    [showDuplicatesMode, filteredDuplicateRows, filteredEntries, selectedDictionary]
  );

  const {
    isSelected,
    selectedRefs,
    selectedCount,
    showBulkMoveDialog,
    setShowBulkMoveDialog,
    setSelected,
    handleSelectAll,
    resetSelection,
  } = useEntrySelection({
    entries: viewEntries,
    dictionaries,
    canBulkMove: !showDuplicatesMode,
    withScrollPreservation: scroll.withScrollPreservation,
    bulkDeleteEntries,
    onSelectionChange,
  });

  const {
    editingEntry,
    moveEntry,
    closeEdit,
    closeMove,
    renameEntryWithScrollPreservation,
    patchEntryWithScrollPreservation,
    onContextMenuEdit,
    onContextMenuMove,
  } = useEntryEditAndMove({
    dictionaries,
    renameEntry,
    patchEntry,
    withScrollPreservation: scroll.withScrollPreservation,
  });

  // Acts on the entry's own dictionary, not `selectedDictionary` — in the duplicate view every
  // row can belong to a different one.
  const withScrollPreservation = scroll.withScrollPreservation;
  const onContextMenuDelete = useCallback(
    async (entry: ContextMenuEntry): Promise<void> => {
      await withScrollPreservation(async () => {
        await bulkDeleteEntries([{ dictionaryId: entry.dictionaryId, key: entry.source }]);
      });
    },
    [bulkDeleteEntries, withScrollPreservation]
  );

  const contextMenuApi = useContextMenu({
    onEdit: onContextMenuEdit,
    onMove: onContextMenuMove,
    onDelete: onContextMenuDelete,
  });
  const { handleContextMenu } = contextMenuApi;

  // Duplicate view's Semantic column — keyed by the row's own dictionary.
  const handleSetDuplicateSemanticType = useCallback(
    (row: DuplicateRow, type: string): void =>
      entryPatcher(
        patchEntryWithScrollPreservation,
        row.dictionaryId,
        row.source
      )({
        semanticType: type,
      }),
    [patchEntryWithScrollPreservation]
  );

  // A normal-view row names its entry by source; the entry is in the selected dictionary.
  const selectSource = useCallback(
    (source: string, on: boolean): void =>
      setSelected({ dictionaryId: selectedDictionary, key: source }, on),
    [setSelected, selectedDictionary]
  );

  const headerColumns = useMemo(() => getHeaderColumns(selectedDictionary), [selectedDictionary]);

  return (
    <>
      {showDuplicatesMode
        ? (emptyState ?? (
            <DuplicateDictionaryTableView
              scroll={scroll}
              rows={filteredDuplicateRows}
              duplicateGroupIndices={duplicateGroupIndices}
              isSelected={isSelected}
              onSelectEntry={setSelected}
              allSelected={selectedCount > 0 && selectedCount === filteredDuplicateRows.length}
              onSelectAll={handleSelectAll}
              onSetSemanticType={handleSetDuplicateSemanticType}
              onContextMenu={handleContextMenu}
              menu={contextMenuApi}
            />
          ))
        : (emptyState ?? (
            <Table
              aria-label="Dictionary entries"
              rowCount={filteredEntries.length + 1}
              style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}
            >
              {/* Fixed table header */}
              <TableHeader>
                <SelectAllCheckboxHeaderCell
                  checked={selectedCount > 0 && selectedCount === filteredEntries.length}
                  onChange={handleSelectAll}
                />
                {headerColumns.map((col) =>
                  col.className ? (
                    <TableHeaderCell
                      key={col.label}
                      className={`${col.className} ${styles.headerCell}`}
                      title={col.title}
                    >
                      {col.label}
                    </TableHeaderCell>
                  ) : (
                    <TableHeaderCell
                      key={col.label}
                      align="center"
                      className={col.widthClassName}
                      style={col.width ? { width: col.width } : undefined}
                      title={col.title}
                    >
                      {col.label}
                    </TableHeaderCell>
                  )
                )}
              </TableHeader>

              {/* Scrollable rows, under one entry menu (one per table, not per row) */}
              <EntryContextMenu
                menu={contextMenuApi}
                body={
                  <VirtualTableBody
                    scroll={scroll}
                    items={filteredEntries}
                    // Source alone is unique within a dictionary.
                    getKey={([source]) => source}
                    renderRow={([source, translation], index) => (
                      <VirtualRowComponent
                        source={source}
                        translation={translation}
                        isSelected={isSelected({ dictionaryId: selectedDictionary, key: source })}
                        index={index}
                        selectedDictionary={selectedDictionary}
                        onRenameEntry={renameEntryWithScrollPreservation}
                        onPatchEntry={patchEntryWithScrollPreservation}
                        onSelectEntry={selectSource}
                        onContextMenu={handleContextMenu}
                      />
                    )}
                    style={{ flex: 1, minHeight: 0, maxHeight: '100%', overflow: 'auto' }}
                  />
                }
              />
            </Table>
          ))}

      {/* Entry editing modal */}
      {editingEntry && (
        <DictionaryEntry
          onClose={closeEdit}
          entry={editingEntry}
          selectedDictionary={editingEntry.dictionaryId ?? selectedDictionary}
        />
      )}

      {/* Move dialog — single entry (context menu) or bulk (multi-select) */}
      {(moveEntry !== null || showBulkMoveDialog) && (
        <MoveDialog
          // Bulk move is normal-view only, so every selected entry is in the selected dictionary.
          entries={moveEntry ? [moveEntry.source] : selectedRefs.map((ref) => ref.key)}
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
