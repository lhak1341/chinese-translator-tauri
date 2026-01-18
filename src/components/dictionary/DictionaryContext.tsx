import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import toast from '../../utils/toast';
import { validateDictionaryEntry, getDictionaryTypes } from './DictionaryTypes';
import { dictionarySorter } from '../../utils/IncrementalDictionarySorter.js';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';

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
 * History operation for undo/redo
 */
interface HistoryOperation {
  dictionaryId: string;
  oldData: DictionaryData;
  newData: DictionaryData;
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

        console.log(
          `📚 Parallel dictionary loading: ${batchResult.successful}/${batchResult.total} dictionaries loaded in ${loadTime}ms`
        );
        if (batchResult.failed > 0) {
          console.warn(`⚠️ ${batchResult.failed} dictionaries failed to load`);
        }

        // Process results and sort dictionaries
        batchResult.results.forEach((result: any) => {
          if (result.success && result.data) {
            loadedDictionaries[result.dictionary_id] = sortDictionaryEntries(
              result.data,
              result.dictionary_id
            );
          } else {
            console.error(`Failed to load dictionary ${result.dictionary_id}:`, result.error);
            // Initialize with empty dictionary if load fails
            loadedDictionaries[result.dictionary_id] = {};
          }
        });

        setDictionaries(loadedDictionaries);
      } catch (error) {
        console.error('Failed to load initial state:', error);
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
          console.error('Failed to save selected dictionary:', saveResult.error);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to save selected dictionary:', error);
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
      console.error(`Error loading dictionary ${dictionaryId}:`, error);
    }
  }, []);

  // Helper function to add operations to history
  const addToHistory = useCallback(
    (dictionaryId: string, oldData: DictionaryData, newData: DictionaryData): void => {
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, currentHistoryIndex + 1);
        newHistory.push({
          dictionaryId,
          oldData,
          newData,
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

      // Capture old data and update state atomically using functional update
      let oldData: Record<string, string | DictionaryEntryValue> | undefined;
      let sortedDictionary: Record<string, string | DictionaryEntryValue> | undefined;

      setDictionaries((prevDictionaries) => {
        // Validate dictionary exists before operations
        if (!prevDictionaries[dictionaryId]) {
          throw new Error(`Dictionary '${dictionaryId}' does not exist`);
        }

        oldData = { ...prevDictionaries[dictionaryId] };

        // Handle new format with metadata for phrases and patterns dictionaries
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

        const updatedDictionary = { ...oldData, [source]: targetValue };
        sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, source);

        return {
          ...prevDictionaries,
          [dictionaryId]: sortedDictionary,
        };
      });

      const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary!);

      if (result.success && result.data) {
        addToHistory(dictionaryId, oldData!, result.data);
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

      // Capture old data and update state atomically using functional update
      let oldData: Record<string, string | DictionaryEntryValue> | undefined;
      let sortedDictionary: Record<string, string | DictionaryEntryValue> | undefined;

      setDictionaries((prevDictionaries) => {
        // Validate dictionary exists before operations
        if (!prevDictionaries[dictionaryId]) {
          throw new Error(`Dictionary '${dictionaryId}' does not exist`);
        }

        oldData = { ...prevDictionaries[dictionaryId] };
        const updatedDictionary = { ...oldData };

        if (oldSource !== newSource) {
          delete updatedDictionary[oldSource];
        }

        // Handle new format with metadata for phrases and patterns dictionaries
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
        addToHistory(dictionaryId, oldData!, result.data);
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
      // Capture old data and update state atomically using functional update
      let oldData: Record<string, string | DictionaryEntryValue> | undefined;
      let sortedDictionary: Record<string, string | DictionaryEntryValue> | undefined;

      setDictionaries((prevDictionaries) => {
        // Validate dictionary exists before operations
        if (!prevDictionaries[dictionaryId]) {
          throw new Error(`Dictionary '${dictionaryId}' does not exist`);
        }

        oldData = { ...prevDictionaries[dictionaryId] };
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
        addToHistory(dictionaryId, oldData!, result.data);
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

  // Undo function
  const undo = useCallback(async (): Promise<boolean> => {
    if (currentHistoryIndex >= 0) {
      const operation = history[currentHistoryIndex];
      const result = await window.electronAPI.saveDictionary(
        operation.dictionaryId,
        operation.oldData
      );

      if (result.success) {
        setDictionaries((prev) => ({
          ...prev,
          [operation.dictionaryId]: operation.oldData,
        }));
        setCurrentHistoryIndex((prev) => prev - 1);
        return true;
      }
    }
    return false;
  }, [history, currentHistoryIndex]);

  // Redo function
  const redo = useCallback(async (): Promise<boolean> => {
    if (currentHistoryIndex < history.length - 1) {
      const operation = history[currentHistoryIndex + 1];
      const result = await window.electronAPI.saveDictionary(
        operation.dictionaryId,
        operation.newData
      );

      if (result.success) {
        setDictionaries((prev) => ({
          ...prev,
          [operation.dictionaryId]: operation.newData,
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
