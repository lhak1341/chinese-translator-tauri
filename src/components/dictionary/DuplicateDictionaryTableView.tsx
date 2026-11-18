import React from 'react';
import { Table, TableCell, TableHeader, TableHeaderCell } from '@lhak/style/react';
import { RowShell, CheckboxCell, SelectAllCheckboxHeaderCell } from './TableBuildingBlocks';
import { VirtualTableBody, type VirtualTableBodyProps } from './VirtualTableBody';
import { EntrySemanticCell } from './EntryCells';
import { DICTIONARY_SEMANTIC_COLUMN_WIDTH } from './VirtualRowComponent';
import { entryRefKey, type EntryRef } from '../../utils/dictionary/DictionaryEdit';
import { tierOf, type DictionaryTier } from '../../utils/dictionary/DictionaryIdClassifier';
import EntryContextMenu from './EntryContextMenu';
import type { OpenEntryMenu, useContextMenu } from '../../hooks/useContextMenu';
import type { DuplicateRow } from '../../utils/dictionary/DuplicateAnalyzer';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';

/** How the Dictionary column tells the tiers apart, the same tiers the filter's "Includes" chips
 * name: Base (root) bold, Generic italic, Fiction and Custom plain. */
const TIER_LABEL_STYLE: Record<DictionaryTier, React.CSSProperties> = {
  root: { fontWeight: 'bold' },
  generic: { fontStyle: 'italic' },
  fiction: {},
  custom: {},
};

/** The duplicate-mode table body (column header + virtualized rows). Search box, row count and
 * scroll buttons are rendered by `EnhancedVirtualizedDictionaryTable` for both modes, so the two
 * views cannot drift apart in their chrome. */
interface DuplicateDictionaryTableViewProps {
  /** The table's scroll state (`useVirtualScrollRange`), owned by `EnhancedVirtualizedDictionaryTable`. */
  scroll: VirtualTableBodyProps<DuplicateRow>['scroll'];
  /** Every row after the filters, not the rendered slice. */
  rows: DuplicateRow[];
  /** Each row's duplicate group, by global index. */
  duplicateGroupIndices: number[];
  isSelected: (ref: EntryRef) => boolean;
  onSelectEntry: (ref: EntryRef, selected: boolean) => void;
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

const entryOf = (row: DuplicateRow): EntryRef => ({
  dictionaryId: row.dictionaryId,
  key: row.source,
});

const DuplicateDictionaryTableView: React.FC<DuplicateDictionaryTableViewProps> = ({
  scroll,
  rows,
  duplicateGroupIndices,
  isSelected,
  onSelectEntry,
  allSelected,
  onSelectAll,
  onSetSemanticType,
  onContextMenu,
  menu,
}) => {
  const body = (
    <VirtualTableBody
      scroll={scroll}
      items={rows}
      getKey={(row) => entryRefKey(entryOf(row))}
      renderRow={(row, index) => {
        const ref = entryOf(row);
        const selected = isSelected(ref);
        // Pre-calculated group index: each duplicate group takes the next band (the row's `stripe`).
        const groupIndex = duplicateGroupIndices[index] || 0;

        return (
          <RowShell
            isSelected={selected}
            index={index}
            stripe={groupIndex % 2 === 1}
            onContextMenu={
              onContextMenu
                ? () => onContextMenu(row.source, row.translation, row.dictionaryId)
                : undefined
            }
          >
            <CheckboxCell
              checked={selected}
              onChange={() => onSelectEntry(ref, !selected)}
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
                color: 'var(--lk-text-muted)',
                ...TIER_LABEL_STYLE[tierOf(row.dictionaryId)],
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
        );
      }}
      style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
    />
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
      {menu ? <EntryContextMenu menu={menu} body={body} /> : body}
    </Table>
  );
};

export default DuplicateDictionaryTableView;
