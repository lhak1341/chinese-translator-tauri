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
import { sortDictionaryEntries, getSortingStats, resetSortingStats } from '../../utils/dictionary';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import { logger } from '../../utils/logger';
import { TOAST_DURATIONS, TOAST_IDS } from '../../constants/toastConfig';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { loadAppConfig } from '../../utils/appConfig';
import type { DictionaryData, DictionaryContextInterface } from '../../types/DictionaryTypes';
import { useDictionaryHistory } from './useDictionaryHistory';
import { useDictionaryCRUD } from '../../hooks/useDictionaryCRUD';
import { createEditCommitter } from './EditCommitter';
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
 *
 * `hasRegisteredOnceRef` distinguishes two cases where `invalidatorRef.current` is null:
 * before the engine's first `'ready'` (nothing was ever cached, safe to stay silent) vs.
 * a reinit window after the engine was previously ready (a stale cache genuinely exists,
 * and dropping the invalidation here silently would leave it stale with no signal).
 */
async function invokeEngineInvalidator(
  invalidatorRef: React.RefObject<((dictionaryId: string) => Promise<void>) | null>,
  hasRegisteredOnceRef: React.RefObject<boolean>,
  dictionaryId: string
): Promise<void> {
  if (!invalidatorRef.current) {
    if (hasRegisteredOnceRef.current) {
      toast.warning(
        'Dictionary saved, but the engine is still starting — translations may use stale results until it finishes.',
        {
          duration: TOAST_DURATIONS.CACHE_WARNING,
          id: TOAST_IDS.CACHE_INVALIDATION_SKIPPED,
        }
      );
      logger.warn('Cache invalidation skipped: engine not ready (reinit window)');
    }
    return;
  }
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
  // True from the first non-null registration onward — distinguishes "never ready yet"
  // (silent, nothing cached) from "was ready, now mid-reinit" (real stale cache, warn).
  const hasRegisteredOnceRef = useRef<boolean>(false);
  const registerCacheInvalidator = useCallback(
    (fn: ((dictionaryId: string) => Promise<void>) | null) => {
      engineInvalidatorRef.current = fn;
      if (fn) hasRegisteredOnceRef.current = true;
    },
    []
  );
  // Ref-mirror the committer reads from. Its own writes land here immediately, ahead of the
  // re-render, so a queued commit plans against the previous commit's result.
  const dictionariesRef = useRef(dictionaries);
  dictionariesRef.current = dictionaries;

  // The one save protocol for every dictionary edit, CRUD and undo/redo alike (ADR-052).
  const [committer] = useState(() =>
    createEditCommitter({
      read: () => dictionariesRef.current,
      write: (updates) => {
        dictionariesRef.current = { ...dictionariesRef.current, ...updates };
        setDictionaries((prev) => ({ ...prev, ...updates }));
      },
      save: (dictionaryId, entries) => window.electronAPI.saveDictionary(dictionaryId, entries),
      invalidate: (dictionaryId) =>
        invokeEngineInvalidator(engineInvalidatorRef, hasRegisteredOnceRef, dictionaryId),
    })
  );

  const {
    record,
    undo,
    redo,
    clear: clearHistory,
    canUndo,
    canRedo,
  } = useDictionaryHistory(committer);

  const {
    addEntry,
    updateEntry,
    patchEntry,
    deleteEntry,
    bulkDeleteEntries,
    moveEntry,
    bulkMoveEntries,
  } = useDictionaryCRUD(committer, record);

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

  // Reload a single dictionary — same protocol as loadInitialState (parallel+retry via DictionaryBackend).
  const loadDictionary = useCallback(async (dictionaryId: string): Promise<void> => {
    try {
      const { loadedDictionaries, stillFailedIds, total } = await loadAllDictionaries([
        dictionaryId,
      ]);
      const outcome = classifyLoadResult(stillFailedIds, total);
      if (outcome.severity === 'critical') {
        logger.error(`Failed to reload dictionary ${dictionaryId}`);
        return;
      }
      const data = loadedDictionaries[dictionaryId];
      if (data) {
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]:
            Object.keys(data).length > 0 ? sortDictionaryEntries(data, dictionaryId) : data,
        }));
      }
    } catch (error) {
      logger.error(`Error loading dictionary ${dictionaryId}:`, error);
    }
  }, []);

  // Removes one key from in-memory state without touching disk. Used after an external rename
  // (DictionaryPairs) once the new ID has already been loaded via loadDictionary, so the old
  // ID doesn't linger as a stale duplicate entry. History is cleared with it: its edits name
  // the old ID, so none of them could be undone.
  const removeDictionaryKey = useCallback(
    (dictionaryId: string): void => {
      setDictionaries((prev) => {
        if (!(dictionaryId in prev)) return prev;
        const next = { ...prev };
        delete next[dictionaryId];
        return next;
      });
      clearHistory();
    },
    [clearHistory]
  );

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
      patchEntry,
      deleteEntry,
      bulkDeleteEntries,
      moveEntry,
      bulkMoveEntries,
      undo,
      redo,
      canUndo,
      canRedo,
      clearHistory,
      loadDictionary,
      removeDictionaryKey,
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
      patchEntry,
      deleteEntry,
      bulkDeleteEntries,
      moveEntry,
      bulkMoveEntries,
      undo,
      redo,
      canUndo,
      canRedo,
      clearHistory,
      loadDictionary,
      removeDictionaryKey,
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
