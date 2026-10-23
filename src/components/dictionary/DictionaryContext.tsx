/**
 * @file DictionaryContext.tsx
 * Eager-loading dictionary context over the Dictionary Store. Loads all dictionaries on mount.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { usePersistSelectedDictionary } from '../../hooks/usePersistSelectedDictionary';
import toast from '../../utils/toast';
import { getDictionaryTypes } from './DictionaryTypes';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import { logger } from '../../utils/logger';
import { TOAST_DURATIONS, TOAST_IDS } from '../../constants/toastConfig';
import { loadAppConfig } from '../../utils/appConfig';
import type { DictionaryContextInterface } from '../../types/DictionaryTypes';
import { useDictionaryHistory } from './useDictionaryHistory';
import { useDictionaryCRUD } from '../../hooks/useDictionaryCRUD';
import { createDictionaryStore } from './DictionaryStore';
import type { ImportOutcome } from './DictionaryStore';
import { loadAllDictionaries } from '../../utils/dictionary/DictionaryBackend';

/**
 * Dictionary Context value.
 */
interface DictionaryContextValue extends DictionaryContextInterface {
  /** Change selected dictionary (sync — all dicts already loaded) */
  setSelectedDictionary: (dictionaryId: string) => void;
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
 * DictionaryProvider Component
 *
 * Exposes the Dictionary Store (GLOSSARY.md "Dictionary Store", ADR-055) to React: every
 * dictionary is loaded at startup (ADR-005), and every write to them — edits, undo/redo,
 * reloads, renames, import — is an operation on the store's one queue. This provider owns
 * only what is React's: the loading flag, the load-failure toast and banner (rendered from the
 * store's `lastLoad`), the selection, history.
 *
 * @param props - Component props
 * @returns Dictionary context provider
 */
export function DictionaryProvider({ children }: DictionaryProviderProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // The one writer of the in-memory dictionaries; its queue orders every write (ADR-055).
  // The running engine never sees a write: an edit reaches translations only when the engine
  // is rebuilt from the store's dictionaries (ADR-106).
  const [store] = useState(() =>
    createDictionaryStore({
      listDictionaries: () => getDictionaryTypes() as Promise<DictionaryTypesCollection>,
      load: loadAllDictionaries,
      save: (dictionaryId, entries) => window.electronAPI.saveDictionary(dictionaryId, entries),
      importFiles: () => window.electronAPI.importDictionaries(),
    })
  );
  const { dictionaries, unreadDictionaryIds, dictionaryTypes, lastLoad } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot
  );
  // The banner follows the last full load, whichever operation ran it.
  const loadError = lastLoad?.severity === 'critical' ? lastLoad.message : null;

  // Each full load's outcome is new, so a failed read is reported once per load.
  useEffect(() => {
    if (lastLoad?.severity === 'critical') {
      toast.error(lastLoad.message, {
        duration: TOAST_DURATIONS.CRITICAL,
        id: TOAST_IDS.DICT_LOAD_FAILED,
      });
    } else if (lastLoad?.severity === 'warning') {
      logger.warn(
        `⚠️ ${lastLoad.failedIds.length}/${lastLoad.total} dictionaries failed after retry: ${lastLoad.failedIds.join(', ')}`
      );
      toast.warning(lastLoad.message, {
        duration: TOAST_DURATIONS.LOAD_FAILURE,
        id: TOAST_IDS.DICT_LOAD_FAILED,
      });
    }
  }, [lastLoad]);

  const { record, undo, redo, clear: clearHistory, canUndo, canRedo } = useDictionaryHistory(store);

  const {
    addEntry,
    updateEntry,
    patchEntry,
    renameEntry,
    deleteEntry,
    bulkDeleteEntries,
    moveEntry,
    bulkMoveEntries,
  } = useDictionaryCRUD(store, record);

  const [selectedDictionary, setSelectedDictionary] = useState<string>('properNouns');

  // Load initial dictionaries and configuration — the store's first operation, so an edit
  // made before it finishes waits behind it. The store records how it went (`lastLoad`).
  useEffect(() => {
    const loadInitialState = async (): Promise<void> => {
      setIsLoading(true);

      try {
        await store.loadAll();

        // Restore saved dictionary selection if it still exists
        const config = await loadAppConfig();
        const saved = config.session.lastSelectedDictionary;
        if (saved && store.getSnapshot().dictionaryTypes[saved]) {
          setSelectedDictionary(saved);
        }
      } catch (error) {
        logger.error('Failed to load initial state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialState();
  }, [store]);

  // Persist selected dictionary to configuration
  usePersistSelectedDictionary(selectedDictionary, isLoading);

  // A Reload trusts the disk: a failed read drops the in-memory copy and makes the dictionary
  // unread, or the next edit would save that copy over the file (ADR-053).
  const loadDictionary = useCallback(
    (dictionaryId: string): Promise<void> => store.reload(dictionaryId),
    [store]
  );

  // History is cleared inside the rename's turn: its edits name the old ids.
  const applyRename = useCallback(
    (renames: ReadonlyArray<readonly [string, string]>): Promise<void> =>
      store.rename(renames, clearHistory),
    [store, clearHistory]
  );

  const getDictionaries = useCallback(() => store.getSnapshot().dictionaries, [store]);

  const reloadAllDictionaries = useCallback(async () => {
    const { dictionaries: fresh, outcome } = await store.loadAll();
    return { dictionaries: fresh, outcome };
  }, [store]);

  // Import rewrites the files outside history, so no edit in it can be undone.
  const importDictionaries = useCallback(
    (): Promise<ImportOutcome> => store.importAll(clearHistory),
    [store, clearHistory]
  );

  // Create the context value object
  // Memoized to prevent unnecessary re-renders of all consumers when Provider re-renders
  const value = useMemo(
    (): DictionaryContextValue => ({
      dictionaries,
      unreadDictionaryIds,
      dictionaryTypes,
      isLoading,
      loadError,
      addEntry,
      updateEntry,
      patchEntry,
      renameEntry,
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
      applyRename,
      getDictionaries,
      reloadAllDictionaries,
      importDictionaries,
      selectedDictionary,
      setSelectedDictionary,
    }),
    [
      dictionaries,
      unreadDictionaryIds,
      dictionaryTypes,
      isLoading,
      loadError,
      addEntry,
      updateEntry,
      patchEntry,
      renameEntry,
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
      applyRename,
      getDictionaries,
      reloadAllDictionaries,
      importDictionaries,
      selectedDictionary,
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
