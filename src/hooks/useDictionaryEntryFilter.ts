import { useState, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useThrottledValue } from './useThrottledValue';
import type { DictionaryData, DictionaryEntryValue } from '../types/DictionaryTypes';
import type { DuplicateRow } from '../utils/dictionary/DuplicateAnalyzer';
import { entryCapabilities, entryFields } from '../utils/dictionary';

const SEARCH_DEBOUNCE_MS = 150;

/** Which filter dimensions apply to a dictionary — derived from its entry capabilities, so the
 * filter panel and the reset on a dictionary switch read the same fact. */
export interface AvailableFilters {
  /** X only / X–Y / no variable: pattern templates. */
  patternType: boolean;
  /** All / allowed / not allowed: kinds whose VAR flag is a per-entry toggle. */
  variable: boolean;
  /** Semantic types: kinds whose entries can carry one. */
  semantic: boolean;
}

export function availableFiltersFor(id: string): AvailableFilters {
  const caps = entryCapabilities(id);
  return {
    patternType: caps.variableTypes,
    variable: caps.variableFlag === 'toggle',
    semantic: caps.semantic !== 'none',
  };
}

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
  filterSemanticTypes: Set<string>;
  filterPatternType: Set<string>;
  availableFilters: AvailableFilters;
  toggleSemanticType: (type: string) => void;
  togglePatternType: (type: 'x-only' | 'x-y' | 'no-variable') => void;
  setVariable: (v: 'all' | 'allowed' | 'not-allowed') => void;
  clearFilters: () => void;
  resetFilters: (newSelectedDictionary: string) => void;
} {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterVariable, setFilterVariable] = useState<'all' | 'allowed' | 'not-allowed'>('all');
  const [filterSemanticTypes, setFilterSemanticTypes] = useState<Set<string>>(new Set());
  const [filterPatternType, setFilterPatternType] = useState<Set<string>>(new Set());

  const debouncedSearchTerm = useThrottledValue(searchTerm, SEARCH_DEBOUNCE_MS);

  // Resets only the filters that don't apply to the new dictionary type.
  // Called from EVDT's selectedDictionary coordinator effect alongside other hook resets.
  const resetFilters = useCallback((newSelectedDictionary: string): void => {
    const available = availableFiltersFor(newSelectedDictionary);
    if (!available.patternType) setFilterPatternType(new Set());
    if (!available.variable) setFilterVariable('all');
    if (!available.semantic) setFilterSemanticTypes(new Set());
    if (!available.patternType && !available.variable && !available.semantic) {
      setShowFilterPanel(false);
    }
  }, []);

  const hasActiveFilter =
    filterVariable !== 'all' || filterSemanticTypes.size > 0 || filterPatternType.size > 0;

  const filteredEntries = useMemo((): [string, DictionaryEntryValue][] => {
    if (showDuplicatesMode) return [];

    const dictionary = dictionaries[selectedDictionary];
    if (!dictionary) return [];

    let entries = Object.entries(dictionary) as [string, DictionaryEntryValue][];

    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase();
      entries = entries.filter(([source, translation]) => {
        const translationText = entryFields(translation).translation;
        return (
          source.toLowerCase().includes(searchLower) ||
          translationText.toLowerCase().includes(searchLower)
        );
      });
    }

    if (filterVariable !== 'all') {
      entries = entries.filter(([, translation]) => {
        const allowed = entryFields(translation).allowAsPatternVariable;
        return filterVariable === 'allowed' ? allowed : !allowed;
      });
    }

    if (filterPatternType.size > 0) {
      entries = entries.filter(([source]) => {
        const hasX = source.includes('X');
        const hasY = source.includes('Y');
        const matchXOnly = filterPatternType.has('x-only') && hasX && !hasY;
        const matchXY = filterPatternType.has('x-y') && hasX && hasY;
        const matchNoVariable = filterPatternType.has('no-variable') && !hasX && !hasY;
        return matchXOnly || matchXY || matchNoVariable;
      });
    }

    if (filterSemanticTypes.size > 0) {
      entries = entries.filter(([, translation]) => {
        const semType = entryFields(translation).semanticType;
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
  ]);

  const availableFilters = useMemo(
    () => availableFiltersFor(selectedDictionary),
    [selectedDictionary]
  );

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

  const toggleSemanticType = useCallback((type: string): void => {
    setFilterSemanticTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const togglePatternType = useCallback((type: 'x-only' | 'x-y' | 'no-variable'): void => {
    setFilterPatternType((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const setVariable = useCallback((v: 'all' | 'allowed' | 'not-allowed'): void => {
    setFilterVariable(v);
  }, []);

  const clearFilters = useCallback((): void => {
    setFilterVariable('all');
    setFilterSemanticTypes(new Set());
    setFilterPatternType(new Set());
  }, []);

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
    filterSemanticTypes,
    filterPatternType,
    availableFilters,
    toggleSemanticType,
    togglePatternType,
    setVariable,
    clearFilters,
    resetFilters,
  };
}
