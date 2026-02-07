import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import toast from '../../utils/toast';
import { validateDictionaryEntry, getDictionaryTypes } from './DictionaryTypes';
import { dictionarySorter } from '../../utils/IncrementalDictionarySorter.js';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import { logger } from '../../utils/logger';

/**
 * Dictionary data structure (key-value pairs)
 */
interface DictionaryData {
  [key: string]: string | DictionaryEntryValue;
}

/**
 * Dictionary entry value for patterns/phrases with metadata
 */
interface DictionaryEntryValue {
  translation: string;
  allowAsPatternVariable?: boolean;
  lowPriority?: boolean;
}

/**
 * Metadata for dictionary operations
 */
interface DictionaryEntryMetadata {
  allowAsPatternVariable?: boolean;
  lowPriority?: boolean;
}

/**
 * History operation type
 */
type HistoryOperationType = 'add' | 'update' | 'delete';

/**
 * Delta-based history operation for undo/redo
 * Stores only changed entries instead of entire dictionaries
 * Memory savings: ~98% reduction (5.4GB → 100MB for 100 operations)
 */
interface HistoryOperation {
  dictionaryId: string;
  operation: HistoryOperationType;
  /** For add/update: new entry data */
  entry?: { source: string; value: string | DictionaryEntryValue };
  /** For update/delete: original entry data for rollback */
  oldEntry?: { source: string; value: string | DictionaryEntryValue };
  /** For update: old source key if it changed */
  oldSource?: string;
  timestamp: number;
}

/**
 * Sorting statistics returned by IncrementalDictionarySorter
 */
interface SortingStats {
  fullSorts: number;
  incrementalSorts: number;
  timeSaved: number;
  averageFullSortTime: number;
  averageIncrementalSortTime: number;
  totalSorts: number;
  timeSavedSeconds: string;
  efficiencyGain: string;
  incrementalPercentage: string;
}

/**
 * Dictionary Context value
 */
interface DictionaryContextValue {
  /** All loaded dictionaries */
  dictionaries: { [key: string]: DictionaryData };
  /** Whether initial loading is in progress */
  isLoading: boolean;
  /** Add a new entry to dictionary */
  addEntry: (
    dictionaryId: string,
    source: string,
    translation: string,
    metadata?: DictionaryEntryMetadata
  ) => Promise<void>;
  /** Update an existing entry */
  updateEntry: (
    dictionaryId: string,
    oldSource: string,
    newSource: string,
    translation: string,
    metadata?: DictionaryEntryMetadata
  ) => Promise<void>;
  /** Delete an entry from dictionary */
  deleteEntry: (dictionaryId: string, source: string) => Promise<void>;
  /** Undo last operation */
  undo: () => Promise<boolean>;
  /** Redo previously undone operation */
  redo: () => Promise<boolean>;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Load a specific dictionary */
  loadDictionary: (dictionaryId: string) => Promise<void>;
  /** Currently selected dictionary */
  selectedDictionary: string;
  /** Change selected dictionary */
  setSelectedDictionary: (dictionaryId: string) => void;
  /** Get sorting statistics */
  getSortingStats: () => SortingStats;
  /** Reset sorting statistics */
  resetSortingStats: () => void;
}

/**
 * Props for DictionaryProvider
 */
interface DictionaryProviderProps {
  children: React.ReactNode;
}

// Create the context for dictionary management
const DictionaryContext = createContext<DictionaryContextValue | undefined>(undefined);

// Maximum number of operations to keep in history
const MAX_HISTORY = 100;

// Helper function to sort dictionary entries by length and then alphabetically
// Phase 6: Now uses incremental sorting for better performance
const sortDictionaryEntries = (
  dictionary: DictionaryData,
  dictionaryId: string = 'unknown',
  changedKey: string | null = null,
  oldKey: string | null = null
): DictionaryData => {
  return dictionarySorter.sortDictionary(
    dictionary,
    dictionaryId,
    changedKey ?? undefined,
    oldKey ?? undefined
  ) as DictionaryData;
};

/**
 * DictionaryProvider Component
 *
 * Provides dictionary context with:
 * - Upfront loading of all dictionaries in parallel
 * - Undo/redo functionality
 * - Dictionary CRUD operations
 *
 * Note: This loads ALL dictionaries at startup, unlike LazyDictionaryProvider
 * which loads on-demand. Use this for better UX when all dictionaries are needed.
 *
 * @param props - Component props
 * @returns Dictionary context provider
 */
export function DictionaryProvider({ children }: DictionaryProviderProps): React.ReactElement {
  // State management for dictionaries and UI
  const [dictionaries, setDictionaries] = useState<{ [key: string]: DictionaryData }>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [history, setHistory] = useState<HistoryOperation[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1);
  const [selectedDictionary, setSelectedDictionary] = useState<string>('properNouns');

  // Load initial dictionaries and configuration
  useEffect(() => {
    const loadInitialState = async (): Promise<void> => {
      setIsLoading(true);
      const loadedDictionaries: { [key: string]: DictionaryData } = {};

      try {
        // First, load all available dictionary types
        const types = (await getDictionaryTypes()) as DictionaryTypesCollection;

        // Load and validate saved dictionary selection
        const configResult = await window.electronAPI.loadConfiguration();
        if (configResult.success && configResult.data && configResult.data.lastSelectedDictionary) {
          // Only restore saved selection if the dictionary still exists
          if (types[configResult.data.lastSelectedDictionary]) {
            setSelectedDictionary(configResult.data.lastSelectedDictionary);
          }
        }

        // Use Rust's parallel batch loading for multi-core performance
        // This distributes dictionary loading across all CPU cores via Rayon
        const dictionaryIds = Object.keys(types);
        const startTime = performance.now();

        const batchResult = await window.electronAPI.loadDictionariesParallel(dictionaryIds);

        const endTime = performance.now();
        const loadTime = (endTime - startTime).toFixed(2);

        logger.log(
          `📚 Parallel dictionary loading: ${batchResult.successful}/${batchResult.total} dictionaries loaded in ${loadTime}ms`
        );
        if (batchResult.failed > 0) {
          logger.warn(`⚠️ ${batchResult.failed} dictionaries failed to load`);
        }

        // Process results and sort dictionaries
        batchResult.results.forEach((result: any) => {
          if (result.success && result.data) {
            loadedDictionaries[result.dictionary_id] = sortDictionaryEntries(
              result.data,
              result.dictionary_id
            );
          } else {
            logger.error(`Failed to load dictionary ${result.dictionary_id}:`, result.error);
            // Initialize with empty dictionary if load fails
            loadedDictionaries[result.dictionary_id] = {};
          }
        });

        setDictionaries(loadedDictionaries);
      } catch (error) {
        logger.error('Failed to load initial state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, []);

  // Persist selected dictionary to configuration
  useEffect(() => {
    let isMounted = true;

    const saveSelectedDictionary = async (): Promise<void> => {
      try {
        const configResult = await window.electronAPI.loadConfiguration();
        if (!isMounted) return;

        const currentConfig = configResult.success && configResult.data ? configResult.data : {};

        const saveResult = await window.electronAPI.saveConfiguration({
          ...currentConfig,
          lastSelectedDictionary: selectedDictionary,
        } as any);
        if (!isMounted) return;

        if (!saveResult.success) {
          logger.error('Failed to save selected dictionary:', saveResult.error);
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Failed to save selected dictionary:', error);
        }
      }
    };

    // Only save if we have a selected dictionary and aren't in initial loading
    if (selectedDictionary && !isLoading) {
      saveSelectedDictionary();
    }

    return () => {
      isMounted = false;
    };
  }, [selectedDictionary, isLoading]);

  // Function to load a specific dictionary
  const loadDictionary = useCallback(async (dictionaryId: string): Promise<void> => {
    try {
      const result = await window.electronAPI.loadDictionary(dictionaryId);
      if (result.success && result.data) {
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: sortDictionaryEntries(result.data, dictionaryId),
        }));
      }
    } catch (error) {
      logger.error(`Error loading dictionary ${dictionaryId}:`, error);
    }
  }, []);

  // Helper function to add delta-based operations to history
  // Memory-optimized: stores only changed entries instead of full dictionaries
  const addToHistory = useCallback(
    (operation: Omit<HistoryOperation, 'timestamp'>): void => {
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, currentHistoryIndex + 1);
        newHistory.push({
          ...operation,
          timestamp: Date.now(),
        });
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift();
        }
        return newHistory;
      });
      setCurrentHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
    },
    [currentHistoryIndex]
  );

  // Add a new entry to a dictionary
  const addEntry = useCallback(
    async (
      dictionaryId: string,
      source: string,
      translation: string,
      metadata: DictionaryEntryMetadata = {}
    ): Promise<void> => {
      const validationError = validateDictionaryEntry(dictionaryId, source, translation);
      if (validationError) {
        toast.error(validationError);
        throw new Error(validationError);
      }

      // Prepare target value with metadata
      let targetValue: string | DictionaryEntryValue = translation;
      if (
        (dictionaryId === 'phrases' || dictionaryId === 'patterns') &&
        (metadata.allowAsPatternVariable !== undefined || metadata.lowPriority !== undefined)
      ) {
        targetValue = {
          translation: translation,
          allowAsPatternVariable: metadata.allowAsPatternVariable,
          lowPriority: metadata.lowPriority,
        };
      }

      // Capture old data and update state atomically using functional update
      let oldData: Record<string, string | DictionaryEntryValue> | undefined;
      let sortedDictionary: Record<string, string | DictionaryEntryValue> | undefined;

      setDictionaries((prevDictionaries) => {
        // Validate dictionary exists before operations
        if (!prevDictionaries[dictionaryId]) {
          throw new Error(`Dictionary '${dictionaryId}' does not exist`);
        }

        oldData = { ...prevDictionaries[dictionaryId] };

        const updatedDictionary = { ...oldData, [source]: targetValue };
        sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, source);

        return {
          ...prevDictionaries,
          [dictionaryId]: sortedDictionary,
        };
      });

      const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary!);

      if (result.success && result.data) {
        // Delta-based history: store only the added entry
        addToHistory({
          dictionaryId,
          operation: 'add',
          entry: {
            source,
            value: targetValue,
          },
        });
        toast.success('Entry added successfully');
      } else {
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: oldData!,
        }));
        toast.error('Failed to save dictionary changes');
        throw new Error('Failed to save dictionary changes');
      }
    },
    [addToHistory]
  );

  // Update an existing entry
  const updateEntry = useCallback(
    async (
      dictionaryId: string,
      oldSource: string,
      newSource: string,
      translation: string,
      metadata: DictionaryEntryMetadata = {}
    ): Promise<void> => {
      const validationError = validateDictionaryEntry(dictionaryId, newSource, translation);
      if (validationError) {
        toast.error(validationError);
        throw new Error(validationError);
      }

      // Prepare target value with metadata
      let targetValue: string | DictionaryEntryValue = translation;
      if (
        (dictionaryId === 'phrases' || dictionaryId === 'patterns') &&
        (metadata.allowAsPatternVariable !== undefined || metadata.lowPriority !== undefined)
      ) {
        targetValue = {
          translation: translation,
          allowAsPatternVariable: metadata.allowAsPatternVariable,
          lowPriority: metadata.lowPriority,
        };
      }

      // Capture old entry and update state atomically using functional update
      let oldData: Record<string, string | DictionaryEntryValue> | undefined;
      let oldEntryValue: string | DictionaryEntryValue | undefined;
      let sortedDictionary: Record<string, string | DictionaryEntryValue> | undefined;

      setDictionaries((prevDictionaries) => {
        // Validate dictionary exists before operations
        if (!prevDictionaries[dictionaryId]) {
          throw new Error(`Dictionary '${dictionaryId}' does not exist`);
        }

        oldData = { ...prevDictionaries[dictionaryId] };
        // Capture old entry for delta-based undo
        oldEntryValue = oldData[oldSource];
        const updatedDictionary = { ...oldData };

        if (oldSource !== newSource) {
          delete updatedDictionary[oldSource];
        }

        updatedDictionary[newSource] = targetValue;

        sortedDictionary = sortDictionaryEntries(
          updatedDictionary,
          dictionaryId,
          newSource,
          oldSource
        );

        return {
          ...prevDictionaries,
          [dictionaryId]: sortedDictionary,
        };
      });

      const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary!);

      if (result.success && result.data) {
        // Delta-based history: store only the changed entry
        addToHistory({
          dictionaryId,
          operation: 'update',
          entry: {
            source: newSource,
            value: targetValue,
          },
          oldEntry: oldEntryValue
            ? {
                source: oldSource,
                value: oldEntryValue,
              }
            : undefined,
          oldSource: oldSource !== newSource ? oldSource : undefined,
        });
        toast.success('Entry updated successfully');
      } else {
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: oldData!,
        }));
        toast.error('Failed to save dictionary changes');
        throw new Error('Failed to save dictionary changes');
      }
    },
    [addToHistory]
  );

  // Delete an entry
  const deleteEntry = useCallback(
    async (dictionaryId: string, source: string): Promise<void> => {
      // Capture old entry and update state atomically using functional update
      let oldData: Record<string, string | DictionaryEntryValue> | undefined;
      let oldEntryValue: string | DictionaryEntryValue | undefined;
      let sortedDictionary: Record<string, string | DictionaryEntryValue> | undefined;

      setDictionaries((prevDictionaries) => {
        // Validate dictionary exists before operations
        if (!prevDictionaries[dictionaryId]) {
          throw new Error(`Dictionary '${dictionaryId}' does not exist`);
        }

        oldData = { ...prevDictionaries[dictionaryId] };
        // Capture old entry for delta-based undo
        oldEntryValue = oldData[source];
        const updatedDictionary = { ...oldData };
        delete updatedDictionary[source];
        sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, source);

        return {
          ...prevDictionaries,
          [dictionaryId]: sortedDictionary,
        };
      });

      const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary!);

      if (result.success && result.data) {
        // Delta-based history: store only the deleted entry
        addToHistory({
          dictionaryId,
          operation: 'delete',
          oldEntry: oldEntryValue
            ? {
                source,
                value: oldEntryValue,
              }
            : undefined,
        });
        toast.success('Entry deleted successfully');
      } else {
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: oldData!,
        }));
        toast.error('Failed to delete dictionary entry');
        throw new Error('Failed to delete dictionary entry');
      }
    },
    [addToHistory]
  );

  // Undo function - applies delta-based operations in reverse
  // CODE REVIEW FIX 2026-02-08 (CRITICAL): Use functional updates to prevent race conditions
  const undo = useCallback(async (): Promise<boolean> => {
    if (currentHistoryIndex >= 0) {
      const operation = history[currentHistoryIndex];

      // Use functional update to get current dictionary state
      let updatedDict: Record<string, string | DictionaryEntryValue> | null = null;
      let dictionaryExists = false;

      setDictionaries((prevDictionaries) => {
        // CODE REVIEW FIX 2026-02-08 (HIGH): Add existence check before operations
        const currentDict = prevDictionaries[operation.dictionaryId];
        if (!currentDict) {
          logger.error(`Cannot undo: dictionary ${operation.dictionaryId} not found`);
          return prevDictionaries; // Return unchanged state
        }

        dictionaryExists = true;

        // Apply reverse operation based on type
        let newDict = { ...currentDict };

        if (operation.operation === 'add') {
          // Reverse add: delete the entry
          if (operation.entry) {
            delete newDict[operation.entry.source];
          }
        } else if (operation.operation === 'update') {
          // Reverse update: restore old entry
          if (operation.oldEntry) {
            // If source changed, remove new source
            if (operation.oldSource && operation.oldSource !== operation.entry?.source) {
              delete newDict[operation.entry!.source];
            }
            // Restore old entry
            newDict[operation.oldEntry.source] = operation.oldEntry.value;
          }
        } else if (operation.operation === 'delete') {
          // Reverse delete: restore the entry
          if (operation.oldEntry) {
            newDict[operation.oldEntry.source] = operation.oldEntry.value;
          }
        }

        // Re-sort dictionary after applying delta
        updatedDict = sortDictionaryEntries(newDict, operation.dictionaryId);

        // Return unchanged state - we'll update after successful save
        return prevDictionaries;
      });

      if (!dictionaryExists || !updatedDict) {
        return false;
      }

      const result = await window.electronAPI.saveDictionary(operation.dictionaryId, updatedDict);

      if (result.success) {
        setDictionaries((prev) => ({
          ...prev,
          [operation.dictionaryId]: updatedDict!,
        }));
        setCurrentHistoryIndex((prev) => prev - 1);
        return true;
      }
    }
    return false;
  }, [history, currentHistoryIndex]);

  // Redo function - re-applies delta-based operations
  // CODE REVIEW FIX 2026-02-08 (CRITICAL): Use functional updates to prevent race conditions
  const redo = useCallback(async (): Promise<boolean> => {
    if (currentHistoryIndex < history.length - 1) {
      const operation = history[currentHistoryIndex + 1];

      // Use functional update to get current dictionary state
      let updatedDict: Record<string, string | DictionaryEntryValue> | null = null;
      let dictionaryExists = false;

      setDictionaries((prevDictionaries) => {
        // CODE REVIEW FIX 2026-02-08 (HIGH): Add existence check before operations
        const currentDict = prevDictionaries[operation.dictionaryId];
        if (!currentDict) {
          logger.error(`Cannot redo: dictionary ${operation.dictionaryId} not found`);
          return prevDictionaries; // Return unchanged state
        }

        dictionaryExists = true;

        // Apply forward operation based on type
        let newDict = { ...currentDict };

        if (operation.operation === 'add') {
          // Redo add: add the entry
          if (operation.entry) {
            newDict[operation.entry.source] = operation.entry.value;
          }
        } else if (operation.operation === 'update') {
          // Redo update: apply new entry
          if (operation.entry) {
            // If source changed, remove old source
            if (operation.oldSource && operation.oldSource !== operation.entry.source) {
              delete newDict[operation.oldSource];
            }
            // Apply new entry
            newDict[operation.entry.source] = operation.entry.value;
          }
        } else if (operation.operation === 'delete') {
          // Redo delete: delete the entry
          if (operation.oldEntry) {
            delete newDict[operation.oldEntry.source];
          }
        }

        // Re-sort dictionary after applying delta
        updatedDict = sortDictionaryEntries(newDict, operation.dictionaryId);

        // Return unchanged state - we'll update after successful save
        return prevDictionaries;
      });

      if (!dictionaryExists || !updatedDict) {
        return false;
      }

      const result = await window.electronAPI.saveDictionary(operation.dictionaryId, updatedDict);

      if (result.success) {
        setDictionaries((prev) => ({
          ...prev,
          [operation.dictionaryId]: updatedDict!,
        }));
        setCurrentHistoryIndex((prev) => prev + 1);
        return true;
      }
    }
    return false;
  }, [history, currentHistoryIndex]);

  // Get sorting performance statistics (Phase 6)
  const getSortingStats = useCallback((): SortingStats => {
    return dictionarySorter.getStats() as SortingStats;
  }, []);

  // Reset sorting performance statistics (Phase 6)
  const resetSortingStats = useCallback((): void => {
    dictionarySorter.resetStats();
  }, []);

  // Create the context value object
  // Memoized to prevent unnecessary re-renders of all consumers when Provider re-renders
  const value = useMemo(
    (): DictionaryContextValue => ({
      dictionaries,
      isLoading,
      addEntry,
      updateEntry,
      deleteEntry,
      undo,
      redo,
      canUndo: currentHistoryIndex >= 0,
      canRedo: currentHistoryIndex < history.length - 1,
      loadDictionary,
      selectedDictionary,
      setSelectedDictionary,
      getSortingStats,
      resetSortingStats,
    }),
    [
      dictionaries,
      isLoading,
      addEntry,
      updateEntry,
      deleteEntry,
      undo,
      redo,
      currentHistoryIndex,
      history.length,
      loadDictionary,
      selectedDictionary,
      getSortingStats,
      resetSortingStats,
    ]
  );

  return <DictionaryContext.Provider value={value}>{children}</DictionaryContext.Provider>;
}

/**
 * Hook to access dictionary context
 *
 * @returns Dictionary context value
 * @throws Error if used outside DictionaryProvider
 */
export function useDictionary(): DictionaryContextValue {
  const context = useContext(DictionaryContext);
  if (!context) {
    throw new Error('useDictionary must be used within a DictionaryProvider');
  }
  return context;
}
