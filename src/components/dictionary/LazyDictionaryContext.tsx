import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
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
 * Lazy Dictionary Context value
 */
interface LazyDictionaryContextValue {
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
  setSelectedDictionary: (dictionaryId: string) => Promise<void>;
  /** Get sorting statistics */
  getSortingStats: () => SortingStats;
  /** Reset sorting statistics */
  resetSortingStats: () => void;
  /** Set of loaded dictionary IDs (for debugging) */
  loadedDictionaries: Set<string>;
}

/**
 * Props for LazyDictionaryProvider
 */
interface LazyDictionaryProviderProps {
  children: React.ReactNode;
}

const LazyDictionaryContext = createContext<LazyDictionaryContextValue | undefined>(undefined);

const MAX_HISTORY = 100;
const PRELOAD_DELAY = 1000; // ms to wait before preloading other dictionaries

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
 * LazyDictionaryProvider Component
 *
 * Provides lazy-loaded dictionary context with:
 * - On-demand dictionary loading
 * - Background preloading of remaining dictionaries
 * - Undo/redo functionality
 * - Dictionary CRUD operations
 *
 * @param props - Component props
 * @returns Dictionary context provider
 */
export function LazyDictionaryProvider({
  children,
}: LazyDictionaryProviderProps): React.ReactElement {
  const [dictionaries, setDictionaries] = useState<{ [key: string]: DictionaryData }>({});
  const [loadedDictionaries, setLoadedDictionaries] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [history, setHistory] = useState<HistoryOperation[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1);
  const [selectedDictionary, setSelectedDictionary] = useState<string>('properNouns');
  const [dictionaryTypes, setDictionaryTypes] = useState<DictionaryTypesCollection>({});

  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load a dictionary immediately
  const loadDictionaryImmediate = useCallback(
    async (dictionaryId: string): Promise<void> => {
      if (loadedDictionaries.has(dictionaryId)) {
        return; // Already loaded
      }

      try {
        const result = await window.electronAPI.loadDictionary(dictionaryId);
        if (result.success && result.data) {
          const sortedDict = sortDictionaryEntries(result.data, dictionaryId);

          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: sortedDict,
          }));

          setLoadedDictionaries((prev) => new Set([...prev, dictionaryId]));
        } else {
          console.error(`Failed to load dictionary ${dictionaryId}:`, result.error);
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: {},
          }));
          setLoadedDictionaries((prev) => new Set([...prev, dictionaryId]));
        }
      } catch (error) {
        console.error(`Error loading dictionary ${dictionaryId}:`, error);
      }
    },
    [loadedDictionaries]
  );

  // Schedule preloading of remaining dictionaries
  const schedulePreload = useCallback(
    (currentDict: string, allDictionaries: string[]): void => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }

      preloadTimeoutRef.current = setTimeout(async () => {
        const remainingDicts = allDictionaries.filter(
          (id) => id !== currentDict && !loadedDictionaries.has(id)
        );

        // Load dictionaries one at a time to avoid blocking
        for (const dictId of remainingDicts) {
          try {
            await loadDictionaryImmediate(dictId);
            // Small delay between loads to keep UI responsive
            await new Promise<void>((resolve) => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Failed to preload dictionary ${dictId}:`, error);
          }
        }
      }, PRELOAD_DELAY);
    },
    [loadedDictionaries, loadDictionaryImmediate]
  );

  // Load dictionary types and configuration on mount
  useEffect(() => {
    const loadInitialState = async (): Promise<void> => {
      setIsLoading(true);
      try {
        // Load dictionary types first
        const types = (await getDictionaryTypes()) as DictionaryTypesCollection;
        setDictionaryTypes(types);

        // Load saved configuration
        const configResult = await window.electronAPI.loadConfiguration();
        if (configResult.success && configResult.data && configResult.data.lastSelectedDictionary) {
          if (types[configResult.data.lastSelectedDictionary]) {
            setSelectedDictionary(configResult.data.lastSelectedDictionary);
          }
        }

        // Load only the selected dictionary initially
        const initialDictionary =
          configResult.success && configResult.data && configResult.data.lastSelectedDictionary
            ? configResult.data.lastSelectedDictionary
            : 'properNouns';

        await loadDictionaryImmediate(initialDictionary);

        // Schedule preloading of other dictionaries
        schedulePreload(initialDictionary, Object.keys(types));
      } catch (error) {
        console.error('Failed to load initial state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, [loadDictionaryImmediate, schedulePreload]);

  // Public load dictionary function (triggers immediate load if not loaded)
  const loadDictionary = useCallback(
    async (dictionaryId: string): Promise<void> => {
      if (!loadedDictionaries.has(dictionaryId)) {
        await loadDictionaryImmediate(dictionaryId);
      }
    },
    [loadDictionaryImmediate, loadedDictionaries]
  );

  // Handle dictionary selection change
  const handleDictionaryChange = useCallback(
    async (newDictionaryId: string): Promise<void> => {
      setSelectedDictionary(newDictionaryId);

      // Load the selected dictionary immediately if not loaded
      if (!loadedDictionaries.has(newDictionaryId)) {
        await loadDictionaryImmediate(newDictionaryId);
      }

      // Reschedule preloading for remaining dictionaries
      const allDictionaries = Object.keys(dictionaryTypes);
      schedulePreload(newDictionaryId, allDictionaries);
    },
    [loadedDictionaries, loadDictionaryImmediate, schedulePreload, dictionaryTypes]
  );

  // Persist selected dictionary
  useEffect(() => {
    const saveSelectedDictionary = async (): Promise<void> => {
      try {
        const configResult = await window.electronAPI.loadConfiguration();
        const currentConfig = configResult.success && configResult.data ? configResult.data : {};

        const saveResult = await window.electronAPI.saveConfiguration({
          ...currentConfig,
          lastSelectedDictionary: selectedDictionary,
        } as any);

        if (!saveResult.success) {
          console.error('Failed to save selected dictionary:', saveResult.error);
        }
      } catch (error) {
        console.error('Failed to save selected dictionary:', error);
      }
    };

    if (selectedDictionary && !isLoading) {
      saveSelectedDictionary();
    }
  }, [selectedDictionary, isLoading]);

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

  // Dictionary operations (same as before but with lazy loading check)
  const addEntry = useCallback(
    async (
      dictionaryId: string,
      source: string,
      translation: string,
      metadata: DictionaryEntryMetadata = {}
    ): Promise<void> => {
      const validationError = validateDictionaryEntry(dictionaryId, source, translation);
      if (validationError) {
        throw new Error(validationError);
      }

      const oldData = { ...dictionaries[dictionaryId] };

      let targetValue: string | DictionaryEntryValue = translation;
      if (dictionaryId === 'phrases' && metadata.allowAsPatternVariable !== undefined) {
        targetValue = {
          translation: translation,
          allowAsPatternVariable: metadata.allowAsPatternVariable,
        };
      }

      const updatedDictionary = { ...oldData, [source]: targetValue };
      const sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, source);

      setDictionaries((prev) => ({
        ...prev,
        [dictionaryId]: sortedDictionary,
      }));

      const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary);

      if (result.success && result.data) {
        addToHistory(dictionaryId, oldData, result.data);
      } else {
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: oldData,
        }));
        throw new Error('Failed to save dictionary changes');
      }
    },
    [dictionaries, addToHistory]
  );

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
        throw new Error(validationError);
      }

      const oldData = { ...dictionaries[dictionaryId] };
      const updatedDictionary = { ...oldData };

      if (oldSource !== newSource) {
        delete updatedDictionary[oldSource];
      }

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

      const sortedDictionary = sortDictionaryEntries(
        updatedDictionary,
        dictionaryId,
        newSource,
        oldSource
      );
      setDictionaries((prev) => ({
        ...prev,
        [dictionaryId]: sortedDictionary,
      }));

      const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary);

      if (result.success && result.data) {
        addToHistory(dictionaryId, oldData, result.data);
      } else {
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: oldData,
        }));
        throw new Error('Failed to save dictionary changes');
      }
    },
    [dictionaries, addToHistory]
  );

  const deleteEntry = useCallback(
    async (dictionaryId: string, source: string): Promise<void> => {
      const oldData = { ...dictionaries[dictionaryId] };
      const updatedDictionary = { ...oldData };
      delete updatedDictionary[source];
      const sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, source);

      setDictionaries((prev) => ({
        ...prev,
        [dictionaryId]: sortedDictionary,
      }));

      const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary);

      if (result.success && result.data) {
        addToHistory(dictionaryId, oldData, result.data);
      } else {
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: oldData,
        }));
        throw new Error('Failed to delete dictionary entry');
      }
    },
    [dictionaries, addToHistory]
  );

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

  const getSortingStats = useCallback((): SortingStats => {
    return dictionarySorter.getStats() as SortingStats;
  }, []);

  const resetSortingStats = useCallback((): void => {
    dictionarySorter.resetStats();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }
    };
  }, []);

  const value: LazyDictionaryContextValue = {
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
    setSelectedDictionary: handleDictionaryChange,
    getSortingStats,
    resetSortingStats,
    loadedDictionaries, // Expose for debugging
  };

  return <LazyDictionaryContext.Provider value={value}>{children}</LazyDictionaryContext.Provider>;
}

/**
 * Hook to access lazy dictionary context
 *
 * @returns Lazy dictionary context value
 * @throws Error if used outside LazyDictionaryProvider
 */
export function useLazyDictionary(): LazyDictionaryContextValue {
  const context = useContext(LazyDictionaryContext);
  if (!context) {
    throw new Error('useLazyDictionary must be used within a LazyDictionaryProvider');
  }
  return context;
}
