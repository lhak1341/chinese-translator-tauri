import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import toast from '../../utils/toast';
import { validateDictionaryEntry, getDictionaryTypes } from './DictionaryTypes';
import { dictionarySorter } from '../../utils/IncrementalDictionarySorter.js';
import { sanitizeDictionaryEntry } from '../../utils/TextSanitization';
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
  /** Refresh dictionary type metadata (MEDIUM-2 FIX) */
  refreshDictionaryTypes: () => Promise<void>;
}

/**
 * Props for LazyDictionaryProvider
 */
interface LazyDictionaryProviderProps {
  children: React.ReactNode;
}

const LazyDictionaryContext = createContext<LazyDictionaryContextValue | undefined>(undefined);

const MAX_HISTORY = 100;
// MEDIUM-1 FIX: Dynamic preload delay calculation
// Default delay used as fallback if measurement fails
const DEFAULT_PRELOAD_DELAY = 1000; // ms to wait before preloading other dictionaries

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
  // Track in-flight dictionary loads to prevent race conditions
  const loadingDictionariesRef = useRef<Set<string>>(new Set());
  // Track loading promises to share between concurrent calls (prevents duplicate fetches)
  const loadingPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  // MEDIUM-1 FIX: Track first dictionary load time for dynamic delay calculation
  const firstLoadTimeRef = useRef<number | null>(null);

  // Load a dictionary immediately
  const loadDictionaryImmediate = useCallback(
    async (dictionaryId: string): Promise<void> => {
      if (loadedDictionaries.has(dictionaryId)) {
        return; // Already loaded
      }

      // CRITICAL: Atomic check-and-set to prevent race conditions
      // If already loading, wait for existing promise instead of creating duplicate load
      if (loadingDictionariesRef.current.has(dictionaryId)) {
        const existingPromise = loadingPromisesRef.current.get(dictionaryId);
        if (existingPromise) {
          // Wait for existing load to complete
          return existingPromise;
        }
        // Shouldn't happen (promise should exist if loading), but safe fallback
        return;
      }

      // Create promise BEFORE async work (ensures atomicity)
      const loadPromise = (async () => {
        // Mark as loading synchronously
        loadingDictionariesRef.current.add(dictionaryId);

        // MEDIUM-1 FIX: Track first dictionary load time
        const isFirstLoad = firstLoadTimeRef.current === null;
        const startTime = isFirstLoad ? performance.now() : 0;

        try {
          const result = await window.electronAPI.loadDictionary(dictionaryId);
          if (result.success && result.data) {
            const sortedDict = sortDictionaryEntries(result.data, dictionaryId);

            setDictionaries((prev) => ({
              ...prev,
              [dictionaryId]: sortedDict,
            }));

            setLoadedDictionaries((prev) => new Set([...prev, dictionaryId]));

            // MEDIUM-1 FIX: Record first load time for dynamic delay calculation
            if (isFirstLoad) {
              const loadTime = performance.now() - startTime;
              firstLoadTimeRef.current = loadTime;
            }
          } else {
            logger.error(`Failed to load dictionary ${dictionaryId}:`, result.error);
            setDictionaries((prev) => ({
              ...prev,
              [dictionaryId]: {},
            }));
            setLoadedDictionaries((prev) => new Set([...prev, dictionaryId]));
          }
        } catch (error) {
          logger.error(`Error loading dictionary ${dictionaryId}:`, error);
        } finally {
          // Always remove from loading set and promise map when done
          loadingDictionariesRef.current.delete(dictionaryId);
          loadingPromisesRef.current.delete(dictionaryId);
        }
      })();

      // Store promise synchronously before async work
      loadingPromisesRef.current.set(dictionaryId, loadPromise);

      return loadPromise;
    },
    [loadedDictionaries]
  );

  // Schedule preloading of remaining dictionaries
  const schedulePreload = useCallback(
    (currentDict: string, allDictionaries: string[]): void => {
      if (preloadTimeoutRef.current) {
        clearTimeout(preloadTimeoutRef.current);
      }

      // MEDIUM-1 FIX: Calculate dynamic delay based on first dictionary load time
      // Use 2x the first load time, or default if not yet measured
      const dynamicDelay =
        firstLoadTimeRef.current !== null
          ? Math.max(firstLoadTimeRef.current * 2, 500) // At least 500ms, typically 2x load time
          : DEFAULT_PRELOAD_DELAY; // Fallback to default if not yet measured

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
            logger.error(`Failed to preload dictionary ${dictId}:`, error);
          }
        }
      }, dynamicDelay);
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
        logger.error('Failed to load initial state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialState();
    // ESLint disable: This effect should run exactly once on mount for initial dictionary load.
    // Including schedulePreload would cause re-runs when loadedDictionaries changes, which is incorrect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          logger.error('Failed to save selected dictionary:', saveResult.error);
        }
      } catch (error) {
        logger.error('Failed to save selected dictionary:', error);
      }
    };

    if (selectedDictionary && !isLoading) {
      saveSelectedDictionary();
    }
  }, [selectedDictionary, isLoading]);

  // Helper function to add operations to history
  // HIGH-1 FIX: Deep copy dictionary data to prevent history corruption
  // structuredClone creates deep copies, preventing mutations to history entries
  const addToHistory = useCallback(
    (dictionaryId: string, oldData: DictionaryData, newData: DictionaryData): void => {
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, currentHistoryIndex + 1);
        newHistory.push({
          dictionaryId,
          oldData: structuredClone(oldData), // Deep copy prevents mutation
          newData: structuredClone(newData), // Deep copy prevents mutation
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
      // CRITICAL-1 FIX: Wrap async operation in try-catch with toast notifications
      try {
        // SECURITY FIX: Sanitize input to prevent JSON corruption from null bytes, surrogates, control chars
        const sanitized = sanitizeDictionaryEntry(source, translation);
        const cleanSource = sanitized.source;
        const cleanTranslation = sanitized.translation;

        const validationError = validateDictionaryEntry(
          dictionaryId,
          cleanSource,
          cleanTranslation
        );
        if (validationError) {
          toast.error(`Invalid entry: ${validationError}`);
          throw new Error(validationError);
        }

        const oldData = { ...dictionaries[dictionaryId] };

        let targetValue: string | DictionaryEntryValue = cleanTranslation;
        if (dictionaryId === 'phrases' && metadata.allowAsPatternVariable !== undefined) {
          targetValue = {
            translation: cleanTranslation,
            allowAsPatternVariable: metadata.allowAsPatternVariable,
          };
        }

        const updatedDictionary = { ...oldData, [cleanSource]: targetValue };
        const sortedDictionary = sortDictionaryEntries(
          updatedDictionary,
          dictionaryId,
          cleanSource
        );

        // Optimistic update
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: sortedDictionary,
        }));

        const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary);

        if (result.success && result.data) {
          addToHistory(dictionaryId, oldData, result.data);
          toast.success('Entry added successfully');

          // ARCHITECTURAL FIX: Invalidate all caches when dictionary changes
          // Prevents stale translations from being served after dictionary updates
          if (
            window.translationEngine &&
            typeof window.translationEngine.invalidateAllCaches === 'function'
          ) {
            try {
              await window.translationEngine.invalidateAllCaches(dictionaryId);
            } catch (cacheError) {
              // Don't fail the operation if cache invalidation fails
              // Dictionary was saved successfully - cache will be invalidated on reload
              logger.warn('Cache invalidation failed (non-critical):', cacheError);
            }
          }
        } else {
          // Rollback optimistic update
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
          const errorMsg = result.error || 'Failed to save dictionary changes';
          toast.error(`Save failed: ${errorMsg}. Changes reverted.`);
          throw new Error(errorMsg);
        }
      } catch (error) {
        logger.error('Error adding dictionary entry:', error);
        // Only show toast if not already shown above
        if (error instanceof Error && !error.message.includes('Invalid entry')) {
          toast.error(`Could not add entry: ${error.message}`);
        }
        throw error; // Re-throw for caller handling
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
      // CRITICAL-1 FIX: Wrap async operation in try-catch with toast notifications
      try {
        // SECURITY FIX: Sanitize input to prevent JSON corruption from null bytes, surrogates, control chars
        const sanitized = sanitizeDictionaryEntry(newSource, translation);
        const cleanNewSource = sanitized.source;
        const cleanTranslation = sanitized.translation;

        const validationError = validateDictionaryEntry(
          dictionaryId,
          cleanNewSource,
          cleanTranslation
        );
        if (validationError) {
          toast.error(`Invalid entry: ${validationError}`);
          throw new Error(validationError);
        }

        const oldData = { ...dictionaries[dictionaryId] };
        const updatedDictionary = { ...oldData };

        if (oldSource !== cleanNewSource) {
          delete updatedDictionary[oldSource];
        }

        let targetValue: string | DictionaryEntryValue = cleanTranslation;
        if (
          (dictionaryId === 'phrases' || dictionaryId === 'patterns') &&
          (metadata.allowAsPatternVariable !== undefined || metadata.lowPriority !== undefined)
        ) {
          targetValue = {
            translation: cleanTranslation,
            allowAsPatternVariable: metadata.allowAsPatternVariable,
            lowPriority: metadata.lowPriority,
          };
        }

        updatedDictionary[cleanNewSource] = targetValue;

        const sortedDictionary = sortDictionaryEntries(
          updatedDictionary,
          dictionaryId,
          cleanNewSource,
          oldSource
        );

        // Optimistic update
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: sortedDictionary,
        }));

        const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary);

        if (result.success && result.data) {
          addToHistory(dictionaryId, oldData, result.data);
          toast.success('Entry updated successfully');

          // ARCHITECTURAL FIX: Invalidate all caches when dictionary changes
          // Prevents stale translations from being served after dictionary updates
          if (
            window.translationEngine &&
            typeof window.translationEngine.invalidateAllCaches === 'function'
          ) {
            try {
              await window.translationEngine.invalidateAllCaches(dictionaryId);
            } catch (cacheError) {
              // Don't fail the operation if cache invalidation fails
              // Dictionary was saved successfully - cache will be invalidated on reload
              logger.warn('Cache invalidation failed (non-critical):', cacheError);
            }
          }
        } else {
          // Rollback optimistic update
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
          const errorMsg = result.error || 'Failed to save dictionary changes';
          toast.error(`Save failed: ${errorMsg}. Changes reverted.`);
          throw new Error(errorMsg);
        }
      } catch (error) {
        logger.error('Error updating dictionary entry:', error);
        // Only show toast if not already shown above
        if (error instanceof Error && !error.message.includes('Invalid entry')) {
          toast.error(`Could not update entry: ${error.message}`);
        }
        throw error; // Re-throw for caller handling
      }
    },
    [dictionaries, addToHistory]
  );

  const deleteEntry = useCallback(
    async (dictionaryId: string, source: string): Promise<void> => {
      // CRITICAL-1 FIX: Wrap async operation in try-catch with toast notifications
      try {
        const oldData = { ...dictionaries[dictionaryId] };
        const updatedDictionary = { ...oldData };
        delete updatedDictionary[source];
        const sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, source);

        // Optimistic update
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: sortedDictionary,
        }));

        const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary);

        if (result.success && result.data) {
          addToHistory(dictionaryId, oldData, result.data);
          toast.success('Entry deleted successfully');

          // ARCHITECTURAL FIX: Invalidate all caches when dictionary changes
          // Prevents stale translations from being served after dictionary updates
          if (
            window.translationEngine &&
            typeof window.translationEngine.invalidateAllCaches === 'function'
          ) {
            try {
              await window.translationEngine.invalidateAllCaches(dictionaryId);
            } catch (cacheError) {
              // Don't fail the operation if cache invalidation fails
              // Dictionary was saved successfully - cache will be invalidated on reload
              logger.warn('Cache invalidation failed (non-critical):', cacheError);
            }
          }
        } else {
          // Rollback optimistic update
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
          const errorMsg = result.error || 'Failed to delete dictionary entry';
          toast.error(`Delete failed: ${errorMsg}. Changes reverted.`);
          throw new Error(errorMsg);
        }
      } catch (error) {
        logger.error('Error deleting dictionary entry:', error);
        toast.error(
          `Could not delete entry: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        throw error; // Re-throw for caller handling
      }
    },
    [dictionaries, addToHistory]
  );

  const undo = useCallback(async (): Promise<boolean> => {
    // MEDIUM-3 FIX: Add user feedback for undo/redo operations
    if (currentHistoryIndex >= 0) {
      try {
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
          toast.success('Change undone');

          // ARCHITECTURAL FIX: Invalidate all caches when dictionary changes
          // Prevents stale translations from being served after undo
          if (
            window.translationEngine &&
            typeof window.translationEngine.invalidateAllCaches === 'function'
          ) {
            try {
              await window.translationEngine.invalidateAllCaches(operation.dictionaryId);
            } catch (cacheError) {
              // Don't fail the operation if cache invalidation fails
              // Dictionary was saved successfully - cache will be invalidated on reload
              logger.warn('Cache invalidation failed (non-critical):', cacheError);
            }
          }

          return true;
        } else {
          toast.error(`Could not undo: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        logger.error('Error during undo:', error);
        toast.error(`Undo failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    // Note: No toast for "nothing to undo" - button should be disabled in this state
    return false;
  }, [history, currentHistoryIndex]);

  const redo = useCallback(async (): Promise<boolean> => {
    // MEDIUM-3 FIX: Add user feedback for undo/redo operations
    if (currentHistoryIndex < history.length - 1) {
      try {
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
          toast.success('Change redone');

          // ARCHITECTURAL FIX: Invalidate all caches when dictionary changes
          // Prevents stale translations from being served after redo
          if (
            window.translationEngine &&
            typeof window.translationEngine.invalidateAllCaches === 'function'
          ) {
            try {
              await window.translationEngine.invalidateAllCaches(operation.dictionaryId);
            } catch (cacheError) {
              // Don't fail the operation if cache invalidation fails
              // Dictionary was saved successfully - cache will be invalidated on reload
              logger.warn('Cache invalidation failed (non-critical):', cacheError);
            }
          }

          return true;
        } else {
          toast.error(`Could not redo: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        logger.error('Error during redo:', error);
        toast.error(`Redo failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    // Note: No toast for "nothing to redo" - button should be disabled in this state
    return false;
  }, [history, currentHistoryIndex]);

  const getSortingStats = useCallback((): SortingStats => {
    return dictionarySorter.getStats() as SortingStats;
  }, []);

  const resetSortingStats = useCallback((): void => {
    dictionarySorter.resetStats();
  }, []);

  // MEDIUM-2 FIX: Refresh dictionary type metadata
  // Call this after creating new dictionaries to update available types
  const refreshDictionaryTypes = useCallback(async (): Promise<void> => {
    try {
      const types = (await getDictionaryTypes()) as DictionaryTypesCollection;
      setDictionaryTypes(types);
    } catch (error) {
      logger.error('Failed to refresh dictionary types:', error);
    }
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
    refreshDictionaryTypes, // MEDIUM-2 FIX: Expose dictionary type refresh
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
