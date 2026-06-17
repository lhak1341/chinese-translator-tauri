import { useState, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useThrottledValue } from './useThrottledValue';
import type { DictionaryData, DictionaryEntryValue } from '../types/DictionaryTypes';
import type { DuplicateRow } from '../utils/dictionary/DuplicateAnalyzer';
import { classifyDictionaryId } from '../utils/dictionary';

const SEARCH_DEBOUNCE_MS = 150;

export function useDictionaryEntryFilter(
  dictionaries: Record<string, DictionaryData>,
  selectedDictionary: string,
  duplicateRows: DuplicateRow[],
  showDuplicatesMode: boolean
): {
  filteredEntries: [string, DictionaryEntryValue][];
  filteredDuplicateRows: DuplicateRow[];
  duplicateGroupIndices: number[];
  hasActiveFilter: boolean;
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  debouncedSearchTerm: string;
  showFilterPanel: boolean;
  setShowFilterPanel: Dispatch<SetStateAction<boolean>>;
  filterVariable: 'all' | 'allowed' | 'not-allowed';
  setFilterVariable: Dispatch<SetStateAction<'all' | 'allowed' | 'not-allowed'>>;
  filterSemanticTypes: Set<string>;
  setFilterSemanticTypes: Dispatch<SetStateAction<Set<string>>>;
  filterPatternType: Set<string>;
  setFilterPatternType: Dispatch<SetStateAction<Set<string>>>;
  filterAllowAsVariable: boolean;
  setFilterAllowAsVariable: Dispatch<SetStateAction<boolean>>;
  filterLowPriority: boolean;
  setFilterLowPriority: Dispatch<SetStateAction<boolean>>;
  resetFilters: (newSelectedDictionary: string) => void;
} {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterVariable, setFilterVariable] = useState<'all' | 'allowed' | 'not-allowed'>('all');
  const [filterSemanticTypes, setFilterSemanticTypes] = useState<Set<string>>(new Set());
  const [filterPatternType, setFilterPatternType] = useState<Set<string>>(new Set());
  const [filterAllowAsVariable, setFilterAllowAsVariable] = useState(false);
  const [filterLowPriority, setFilterLowPriority] = useState(false);

  const debouncedSearchTerm = useThrottledValue(searchTerm, SEARCH_DEBOUNCE_MS);

  // Resets only the filters that don't apply to the new dictionary type.
  // Called from EVDT's selectedDictionary coordinator effect alongside other hook resets.
  const resetFilters = useCallback((newSelectedDictionary: string): void => {
    const {
      isPatterns: newIsPatterns,
      isPhrases: newIsPhrases,
      isProperNouns: newIsProperNouns,
    } = classifyDictionaryId(newSelectedDictionary);

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
    if (!newIsPatterns && !newIsPhrases && !newIsProperNouns) {
      setShowFilterPanel(false);
    }
  }, []);

  const hasActiveFilter =
    filterVariable !== 'all' ||
    filterSemanticTypes.size > 0 ||
    filterPatternType.size > 0 ||
    filterAllowAsVariable ||
    filterLowPriority;

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

  return {
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
    setFilterVariable,
    filterSemanticTypes,
    setFilterSemanticTypes,
    filterPatternType,
    setFilterPatternType,
    filterAllowAsVariable,
    setFilterAllowAsVariable,
    filterLowPriority,
    setFilterLowPriority,
    resetFilters,
  };
}
