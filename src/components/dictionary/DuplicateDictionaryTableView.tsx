import React from 'react';
import type { RefCallback } from 'react';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell } from '@lhak/style/react';
import {
  RowShell,
  CheckboxCell,
  SelectAllCheckboxHeaderCell,
  ITEM_HEIGHT,
} from './TableBuildingBlocks';
import { EntrySemanticCell } from './EntryCells';
import { DICTIONARY_SEMANTIC_COLUMN_WIDTH } from './VirtualRowComponent';
import { createDuplicateKey } from '../../utils/dictionary';
import EntryContextMenu from './EntryContextMenu';
import type { OpenEntryMenu, useContextMenu } from '../../hooks/useContextMenu';
import type { DuplicateRow } from '../../utils/dictionary/DuplicateAnalyzer';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';

/** The duplicate-mode table body (column header + virtualized rows). Search box, row count and
 * scroll buttons are rendered by `EnhancedVirtualizedDictionaryTable` for both modes, so the two
 * views cannot drift apart in their chrome. */
interface DuplicateDictionaryTableViewProps {
  scrollRefCallback: RefCallback<HTMLDivElement>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  totalHeight: number;
  visibleDuplicateRows: DuplicateRow[];
  startIndex: number;
  duplicateGroupIndices: number[];
  selectedEntries: Set<string>;
  onSelectEntry: (key: string, selected: boolean) => void;
  allSelected: boolean;
  onSelectAll: (selected: boolean) => void;
  /** Right-click on a row — same Edit / Move / Delete menu as the normal view, acting on the
   * row's own dictionary. */
  /** Sets (or clears, with `''`) the semantic type of one row's entry in its own dictionary.
   * Without it the Semantic column is read-only. */
  onSetSemanticType?: (row: DuplicateRow, type: string) => void;
  onContextMenu?: OpenEntryMenu;
  /** The entry menu `onContextMenu` opens, wrapped around the rows (`EntryContextMenu`). */
  menu?: ReturnType<typeof useContextMenu>;
}

const DuplicateDictionaryTableView: React.FC<DuplicateDictionaryTableViewProps> = ({
  scrollRefCallback,
  onScroll,
  totalHeight,
  visibleDuplicateRows,
  startIndex,
  duplicateGroupIndices,
  selectedEntries,
  onSelectEntry,
  allSelected,
  onSelectAll,
  onSetSemanticType,
  onContextMenu,
  menu,
}) => {
  const body = (
    <TableBody
      ref={scrollRefCallback}
      onScroll={onScroll}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        overflowAnchor: 'none',
      }}
    />
  );
  const rows = (
    <>
      {/* Rows absolutely positioned at their global index — same reason as the normal view
            (EnhancedVirtualizedDictionaryTable): no layout shift for scroll anchoring to fight. */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleDuplicateRows.map((row, index) => {
          const key = createDuplicateKey(row.source, row.dictionaryId);
          const isSelected = selectedEntries.has(key);

          // Pre-calculated group index: each duplicate group takes the next band (the row's `stripe`).
          const actualIndex = startIndex + index;
          const groupIndex = duplicateGroupIndices[actualIndex] || 0;

          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                top: actualIndex * ITEM_HEIGHT,
                left: 0,
                right: 0,
                height: ITEM_HEIGHT,
              }}
            >
              <RowShell
                isSelected={isSelected}
                index={actualIndex}
                stripe={groupIndex % 2 === 1}
                onContextMenu={
                  onContextMenu
                    ? () => onContextMenu(row.source, row.translation, row.dictionaryId)
                    : undefined
                }
              >
                <CheckboxCell
                  checked={isSelected}
                  onChange={() => onSelectEntry(key, !isSelected)}
                  ariaLabel={`Select ${row.source} from ${row.dictionaryLabel}`}
                />
                <TableCell
                  lang="zh"
                  className={`${styles.cell} ${styles.duplicateSourceCol} lk-face-chinese`}
                >
                  {row.source}
                </TableCell>
                <TableCell className={`${styles.cell} ${styles.duplicateTranslationCol}`}>
                  {row.translation}
                </TableCell>
                <TableCell
                  className={`${styles.cell} ${styles.duplicateDictionaryCol}`}
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--text-secondary, #6b7280)',
                    fontWeight:
                      row.dictionaryLabel === 'Phrases' || row.dictionaryLabel === 'Proper Nouns'
                        ? 'bold'
                        : 'normal',
                  }}
                >
                  {row.dictionaryLabel}
                </TableCell>
                <EntrySemanticCell
                  dictionaryId={row.dictionaryId}
                  source={row.source}
                  allowAsPatternVariable={row.metadata?.allowAsPatternVariable === true}
                  semanticType={row.metadata?.semanticType ?? ''}
                  onSelect={(type) => onSetSemanticType?.(row, type)}
                  width={DICTIONARY_SEMANTIC_COLUMN_WIDTH}
                  rowLabel={`${row.source} in ${row.dictionaryLabel}`}
                />
              </RowShell>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <Table
      aria-label="Duplicate entries"
      rowCount={duplicateGroupIndices.length + 1}
      style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}
    >
      <TableHeader>
        <SelectAllCheckboxHeaderCell checked={allSelected} onChange={onSelectAll} />
        <TableHeaderCell className={`${styles.duplicateSourceCol} ${styles.headerCell}`}>
          Source Text
        </TableHeaderCell>
        <TableHeaderCell className={`${styles.duplicateTranslationCol} ${styles.headerCell}`}>
          Translation
        </TableHeaderCell>
        <TableHeaderCell className={`${styles.duplicateDictionaryCol} ${styles.headerCell}`}>
          Dictionary
        </TableHeaderCell>
        <TableHeaderCell
          align="center"
          style={{ width: DICTIONARY_SEMANTIC_COLUMN_WIDTH }}
          title="Semantic type — shown for proper nouns, and for phrases/patterns allowed as a variable"
        >
          Semantic
        </TableHeaderCell>
      </TableHeader>
      {menu ? (
        <EntryContextMenu menu={menu} body={body}>
          {rows}
        </EntryContextMenu>
      ) : (
        React.cloneElement(body, undefined, rows)
      )}
    </Table>
  );
};

export default DuplicateDictionaryTableView;
