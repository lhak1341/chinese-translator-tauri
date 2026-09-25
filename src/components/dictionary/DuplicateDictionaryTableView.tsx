import React from 'react';
import type { RefCallback } from 'react';
import {
  RowShell,
  CheckboxCell,
  SelectAllCheckboxHeaderCell,
  SemanticTypeToggleCell,
  ITEM_HEIGHT,
} from './TableBuildingBlocks';
import { DICTIONARY_SEMANTIC_COLUMN_WIDTH } from './VirtualRowComponent';
import {
  createDuplicateKey,
  classifyDictionaryId,
  hasSemanticTypeColumn,
} from '../../utils/dictionary';
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
  onContextMenu?: (
    e: React.MouseEvent,
    source: string,
    translation: string,
    dictionaryId: string
  ) => void;
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
}) => {
  return (
    <div
      style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
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
        <SelectAllCheckboxHeaderCell checked={allSelected} onChange={onSelectAll} />
        <div className={`${styles.duplicateSourceCol} ${styles.headerCell}`}>Source Text</div>
        <div className={`${styles.duplicateTranslationCol} ${styles.headerCell}`}>Translation</div>
        <div className={`${styles.duplicateDictionaryCol} ${styles.headerCell}`}>Dictionary</div>
        <div
          style={{
            width: DICTIONARY_SEMANTIC_COLUMN_WIDTH,
            padding: '0.5rem 0.25rem',
            textAlign: 'center',
          }}
          title="Semantic type — shown for proper nouns, and for phrases/patterns allowed as a variable"
        >
          Semantic
        </div>
      </div>

      {/* Rows */}
      <div
        ref={scrollRefCallback}
        onScroll={onScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          overflowAnchor: 'none',
          position: 'relative',
        }}
      >
        {/* Rows absolutely positioned at their global index — same reason as the normal view
            (EnhancedVirtualizedDictionaryTable): no layout shift for scroll anchoring to fight. */}
        <div style={{ height: totalHeight, position: 'relative' }}>
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
            const backgroundColor = isSelected ? 'var(--accent-light, #e0f2fe)' : groupBgColor;

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
                  backgroundColor={backgroundColor}
                  onContextMenu={
                    onContextMenu
                      ? (e) => onContextMenu(e, row.source, row.translation, row.dictionaryId)
                      : undefined
                  }
                >
                  <CheckboxCell
                    checked={isSelected}
                    onChange={() => onSelectEntry(key, !isSelected)}
                    ariaLabel={`Select ${row.source} from ${row.dictionaryLabel}`}
                  />
                  <div className={`${styles.cell} ${styles.duplicateSourceCol}`}>{row.source}</div>
                  <div className={`${styles.cell} ${styles.duplicateTranslationCol}`}>
                    {row.translation}
                  </div>
                  <div
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
                  </div>
                  {hasSemanticTypeColumn(
                    row.dictionaryId,
                    row.metadata?.allowAsPatternVariable === true
                  ) ? (
                    <SemanticTypeToggleCell
                      activeType={row.metadata?.semanticType ?? ''}
                      onSelect={(type) => onSetSemanticType?.(row, type)}
                      width={DICTIONARY_SEMANTIC_COLUMN_WIDTH}
                      patternSource={
                        classifyDictionaryId(row.dictionaryId).isPatterns ? row.source : undefined
                      }
                      rowLabel={`${row.source} in ${row.dictionaryLabel}`}
                    />
                  ) : (
                    <div
                      style={{
                        width: DICTIONARY_SEMANTIC_COLUMN_WIDTH,
                        minWidth: DICTIONARY_SEMANTIC_COLUMN_WIDTH,
                      }}
                    />
                  )}
                </RowShell>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DuplicateDictionaryTableView;
