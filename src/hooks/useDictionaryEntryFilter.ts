import { useMemo } from 'react';
import type { DictionaryData, DictionaryEntryValue } from '../types/DictionaryTypes';
import type { DuplicateRow } from '../utils/dictionary/DuplicateAnalyzer';

export interface DictionaryEntryFilters {
  debouncedSearchTerm: string;
  showDuplicatesMode: boolean;
  filterVariable: 'all' | 'allowed' | 'not-allowed';
  filterSemanticTypes: Set<string>;
  filterPatternType: Set<string>;
  filterAllowAsVariable: boolean;
  filterLowPriority: boolean;
}

export function useDictionaryEntryFilter(
  dictionaries: Record<string, DictionaryData>,
  selectedDictionary: string,
  duplicateRows: DuplicateRow[],
  filters: DictionaryEntryFilters
): {
  filteredEntries: [string, DictionaryEntryValue][];
  filteredDuplicateRows: DuplicateRow[];
  duplicateGroupIndices: number[];
} {
  const {
    debouncedSearchTerm,
    showDuplicatesMode,
    filterVariable,
    filterSemanticTypes,
    filterPatternType,
    filterAllowAsVariable,
    filterLowPriority,
  } = filters;

  const filteredEntries = useMemo((): [string, DictionaryEntryValue][] => {
    if (showDuplicatesMode) return [];

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

  const filteredDuplicateRows = useMemo(() => {
    if (!showDuplicatesMode) return [];
    if (!debouncedSearchTerm) return duplicateRows;

    const searchLower = debouncedSearchTerm.toLowerCase();
    return duplicateRows.filter(
      (row) =>
        row.source.toLowerCase().includes(searchLower) ||
        row.translation.toLowerCase().includes(searchLower) ||
        row.dictionaryLabel.toLowerCase().includes(searchLower)
    );
  }, [duplicateRows, debouncedSearchTerm, showDuplicatesMode]);

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

  return { filteredEntries, filteredDuplicateRows, duplicateGroupIndices };
}
