import React from 'react';
import type { RefCallback } from 'react';
import { RowShell, CheckboxCell, SelectAllCheckboxHeaderCell } from './TableBuildingBlocks';
import { createDuplicateKey } from '../../utils/dictionary';
import type { DuplicateRow } from '../../utils/dictionary/DuplicateAnalyzer';
import styles from '../../styles/EnhancedVirtualizedDictionaryTable.module.css';

interface DuplicateDictionaryTableViewProps {
  searchRef?: React.RefObject<HTMLInputElement>;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  scrollRefCallback: RefCallback<HTMLDivElement>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  totalHeight: number;
  offsetY: number;
  visibleDuplicateRows: DuplicateRow[];
  startIndex: number;
  duplicateGroupIndices: number[];
  selectedEntries: Set<string>;
  onSelectEntry: (key: string, selected: boolean) => void;
  allSelected: boolean;
  onSelectAll: (selected: boolean) => void;
}

const DuplicateDictionaryTableView: React.FC<DuplicateDictionaryTableViewProps> = ({
  searchRef,
  searchTerm,
  onSearchChange,
  scrollRefCallback,
  onScroll,
  totalHeight,
  offsetY,
  visibleDuplicateRows,
  startIndex,
  duplicateGroupIndices,
  selectedEntries,
  onSelectEntry,
  allSelected,
  onSelectAll,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search controls */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search duplicates..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
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
          <SelectAllCheckboxHeaderCell checked={allSelected} onChange={onSelectAll} />
          <div className={`${styles.duplicateSourceCol} ${styles.headerCell}`}>Source Text</div>
          <div className={`${styles.duplicateTranslationCol} ${styles.headerCell}`}>
            Translation
          </div>
          <div className={`${styles.duplicateDictionaryCol} ${styles.headerCell}`}>Dictionary</div>
        </div>

        {/* Rows */}
        <div
          ref={scrollRefCallback}
          onScroll={onScroll}
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
                const backgroundColor = isSelected ? 'var(--accent-light, #e0f2fe)' : groupBgColor;

                return (
                  <RowShell key={key} backgroundColor={backgroundColor}>
                    <CheckboxCell
                      checked={isSelected}
                      onChange={() => onSelectEntry(key, !isSelected)}
                      ariaLabel={`Select ${row.source} from ${row.dictionaryLabel}`}
                    />
                    <div className={`${styles.cell} ${styles.duplicateSourceCol}`}>
                      {row.source}
                    </div>
                    <div className={`${styles.cell} ${styles.duplicateTranslationCol}`}>
                      {row.translation}
                    </div>
                    <div
                      className={`${styles.cell} ${styles.duplicateDictionaryCol}`}
                      style={{
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
                  </RowShell>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuplicateDictionaryTableView;
