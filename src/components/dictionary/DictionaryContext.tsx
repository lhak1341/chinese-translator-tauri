/**
 * @file DictionaryContext.tsx
 * Eager-loading dictionary context. Loads all dictionaries on mount.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { usePersistSelectedDictionary } from '../../hooks/usePersistSelectedDictionary';
import toast from '../../utils/toast';
import { getDictionaryTypes } from './DictionaryTypes';
import {
  sortDictionaryEntries,
  getSortingStats,
  resetSortingStats,
} from '../../utils/dictionaryHelpers';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import { logger } from '../../utils/logger';
import { TOAST_DURATIONS, TOAST_IDS } from '../../constants/toastConfig';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { loadAppConfig } from '../../utils/appConfig';
import type { DictionaryData, DictionaryContextInterface } from '../../types/DictionaryTypes';
import { useDictionaryHistory } from './useDictionaryHistory';
import { useDictionaryCRUD } from './useDictionaryCRUD';
import type { MoveOpUpdates } from './useDictionaryCRUD';
import { loadAllDictionaries } from '../../utils/dictionary/DictionaryBackend';
import { classifyLoadResult } from '../../utils/dictionary/DictionaryLoadClassifier';

/**
 * Dictionary Context value.
 */
interface DictionaryContextValue extends DictionaryContextInterface {
  /** Change selected dictionary (sync — all dicts already loaded) */
  setSelectedDictionary: (dictionaryId: string) => void;
  /** Register the engine's cache invalidation function. Called by Translator.jsx when engine is ready; pass null to clear on teardown. */
  registerCacheInvalidator: (fn: ((dictionaryId: string) => Promise<void>) | null) => void;
}

/**
 * Props for DictionaryProvider
 */
interface DictionaryProviderProps {
  children: React.ReactNode;
}

// Create the context for dictionary management
const DictionaryContext = createContext<DictionaryContextValue | undefined>(undefined);

/**
 * Clears the in-memory translation engine caches after a dictionary mutation so
 * subsequent translations use the updated entries rather than stale cached results.
 * Calls the invalidator registered by Translator.jsx; no-op until the engine is ready.
 */
async function invokeEngineInvalidator(
  invalidatorRef: React.RefObject<((dictionaryId: string) => Promise<void>) | null>,
  dictionaryId: string
): Promise<void> {
  if (!invalidatorRef.current) return;
  try {
    await invalidatorRef.current(dictionaryId);
    logger.log('✅ Dictionary caches cleared');
  } catch (cacheError) {
    toast.warning('Cache invalidation failed. Use Cmd/Ctrl-R to reload.', {
      duration: TOAST_DURATIONS.LOAD_FAILURE,
      id: TOAST_IDS.CACHE_INVALIDATION_FAILED,
    });
    logger.warn('Cache invalidation failed (non-critical):', cacheError);
  }
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  // Registered by Translator.jsx when engine is ready; cleared on engine teardown
  const engineInvalidatorRef = useRef<((dictionaryId: string) => Promise<void>) | null>(null);
  const registerCacheInvalidator = useCallback(
    (fn: ((dictionaryId: string) => Promise<void>) | null) => {
      engineInvalidatorRef.current = fn;
    },
    []
  );
  // Ref-mirror so undo/redo move branches read latest dicts without closing over state
  const dictionariesRef = useRef(dictionaries);
  dictionariesRef.current = dictionaries;

  // Stable callback: sort → save → update state. Used by useDictionaryHistory for undo/redo.
  const commitMutation = useCallback(
    async (updates: Array<{ dictionaryId: string; entries: DictionaryData }>): Promise<boolean> => {
      const results = await Promise.all(
        updates.map(({ dictionaryId, entries }) =>
          window.electronAPI.saveDictionary(dictionaryId, entries)
        )
      );
      if (results.every((r) => r.success)) {
        setDictionaries((prev) => {
          const next = { ...prev };
          for (const { dictionaryId, entries } of updates) {
            next[dictionaryId] = entries;
          }
          return next;
        });
        return true;
      }
      return false;
    },
    [] // stable — setDictionaries is stable, window.electronAPI is a module global
  );

  // Stable wrapper so useDictionaryHistory doesn't import invokeEngineInvalidator directly
  const invalidateEngine = useCallback(
    (dictionaryId: string) => invokeEngineInvalidator(engineInvalidatorRef, dictionaryId),
    [] // stable — reads engineInvalidatorRef.current
  );

  const { addToHistory, undo, redo, canUndo, canRedo } = useDictionaryHistory(
    dictionariesRef,
    commitMutation,
    invalidateEngine
  );

  // Shared mutation protocol for single-dictionary CRUD ops.
  // Owns: optimistic setDictionaries → saveDictionary → rollback on failure.
  // Callers own: diff computation, sort, addToHistory, toast, invalidateEngine.
  const persistDictionaryMutation = useCallback(
    async (
      dictionaryId: string,
      oldData: DictionaryData,
      sortedEntries: DictionaryData
    ): Promise<boolean> => {
      setDictionaries((prev) => ({ ...prev, [dictionaryId]: sortedEntries }));
      const result = await window.electronAPI.saveDictionary(dictionaryId, sortedEntries);
      if (result.success && result.data) return true;
      setDictionaries((prev) => ({ ...prev, [dictionaryId]: oldData }));
      return false;
    },
    [] // stable — setDictionaries is stable, window.electronAPI is a module global
  );

  // Two-dict move protocol: optimistic update → parallel save → partial revert on failure.
  const commitMoveOp = useCallback(
    async ({
      sourceDictId,
      oldSource,
      newSource,
      targetDictId,
      oldTarget,
      newTarget,
    }: MoveOpUpdates): Promise<boolean> => {
      setDictionaries((prev) => ({
        ...prev,
        [sourceDictId]: newSource,
        [targetDictId]: newTarget,
      }));
      const [sr, tr] = await Promise.all([
        window.electronAPI.saveDictionary(sourceDictId, newSource),
        window.electronAPI.saveDictionary(targetDictId, newTarget),
      ]);
      if (sr.success && tr.success) return true;
      setDictionaries((prev) => ({
        ...prev,
        [sourceDictId]: oldSource,
        [targetDictId]: oldTarget,
      }));
      if (sr.success && !tr.success)
        await window.electronAPI.saveDictionary(sourceDictId, oldSource).catch(() => {});
      else if (!sr.success && tr.success)
        await window.electronAPI.saveDictionary(targetDictId, oldTarget).catch(() => {});
      return false;
    },
    []
  ); // stable — setDictionaries is stable, window.electronAPI is a module global

  const { addEntry, updateEntry, deleteEntry, bulkDeleteEntries, moveEntry, bulkMoveEntries } =
    useDictionaryCRUD(
      dictionariesRef,
      persistDictionaryMutation,
      commitMoveOp,
      addToHistory,
      invalidateEngine
    );

  const [selectedDictionary, setSelectedDictionary] = useState<string>('properNouns');

  // Load initial dictionaries and configuration
  useEffect(() => {
    const loadInitialState = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError(null);
      const loadedDictionaries: { [key: string]: DictionaryData } = {};

      try {
        // First, load all available dictionary types
        const types = (await getDictionaryTypes()) as DictionaryTypesCollection;

        // Restore saved dictionary selection if it still exists
        const config = await loadAppConfig();
        if (config.session.lastSelectedDictionary && types[config.session.lastSelectedDictionary]) {
          setSelectedDictionary(config.session.lastSelectedDictionary);
        }

        // Use Rust's parallel batch loading with automatic serial retry for cold-launch failures.
        const dictionaryIds = Object.keys(types);
        const {
          loadedDictionaries: rawDictionaries,
          stillFailedIds,
          total,
        } = await loadAllDictionaries(dictionaryIds);

        // Apply sort to each loaded dictionary
        for (const [id, data] of Object.entries(rawDictionaries)) {
          loadedDictionaries[id] =
            Object.keys(data).length > 0 ? sortDictionaryEntries(data, id) : data;
        }

        const outcome = classifyLoadResult(stillFailedIds, total);
        if (outcome.severity === 'critical') {
          setLoadError(outcome.message);
          toast.error(outcome.message, {
            duration: TOAST_DURATIONS.CRITICAL,
            id: TOAST_IDS.DICT_LOAD_FAILED,
          });
        } else if (outcome.severity === 'warning') {
          logger.warn(
            `⚠️ ${outcome.failedIds.length}/${outcome.total} dictionaries failed after retry: ${outcome.failedIds.join(', ')}`
          );
          toast.warning(outcome.message, {
            duration: TOAST_DURATIONS.LOAD_FAILURE,
            id: TOAST_IDS.DICT_LOAD_FAILED,
          });
        }

        setDictionaries(loadedDictionaries);
      } catch (error) {
        const msg = `Failed to load dictionaries: ${extractErrorMessage(error)}`;
        logger.error('Failed to load initial state:', error);
        setLoadError(msg);
        toast.error(msg, {
          duration: TOAST_DURATIONS.CRITICAL,
          id: TOAST_IDS.DICT_LOAD_FAILED,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, []);

  // Persist selected dictionary to configuration
  usePersistSelectedDictionary(selectedDictionary, isLoading);

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

  // getSortingStats and resetSortingStats are stable module-level helpers from dictionaryHelpers —
  // no useCallback wrapper needed; pass them directly in the value object below.

  // Create the context value object
  // Memoized to prevent unnecessary re-renders of all consumers when Provider re-renders
  const value = useMemo(
    (): DictionaryContextValue => ({
      dictionaries,
      isLoading,
      loadError,
      addEntry,
      updateEntry,
      deleteEntry,
      bulkDeleteEntries,
      moveEntry,
      bulkMoveEntries,
      undo,
      redo,
      canUndo,
      canRedo,
      loadDictionary,
      selectedDictionary,
      setSelectedDictionary,
      getSortingStats,
      resetSortingStats,
      registerCacheInvalidator,
    }),
    [
      dictionaries,
      isLoading,
      loadError,
      addEntry,
      updateEntry,
      deleteEntry,
      bulkDeleteEntries,
      moveEntry,
      bulkMoveEntries,
      undo,
      redo,
      canUndo,
      canRedo,
      loadDictionary,
      selectedDictionary,
      registerCacheInvalidator,
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
