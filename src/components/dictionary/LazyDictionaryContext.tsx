/**
 * @file LazyDictionaryContext.tsx
 * Lazy-loading dictionary context. Defers dictionary loading with preloading.
 * Undo/redo uses snapshot-based history (single-dict; cross-dict move undo not supported).
 *
 * === SIBLING: ./DictionaryContext.tsx — must stay in sync ===
 * Fixes to CRUD operations (addEntry, updateEntry, deleteEntry, bulkDeleteEntries,
 * moveEntry, bulkMoveEntries) and addToHistory must be mirrored in the sibling.
 * See CLAUDE.md audit checklist for the 6-point sync requirement.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import toast from '../../utils/toast';
import { validateDictionaryEntry, getDictionaryTypes } from './DictionaryTypes';
import { sanitizeDictionaryEntry } from '../../utils/text/TextSanitization';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import { logger } from '../../utils/logger';
import { TOAST_DURATIONS, TOAST_IDS } from '../../constants/toastConfig';
import { ValidationError, SaveError, isValidationError, isSaveError } from '../../utils/errors';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { usePersistSelectedDictionary } from '../../hooks/usePersistSelectedDictionary';
import {
  sortDictionaryEntries,
  getSortingStats,
  resetSortingStats,
} from '../../utils/dictionaryHelpers';
import type {
  DictionaryData,
  DictionaryEntryValue,
  DictionaryEntryMetadata,
  DictionaryContextInterface,
} from '../../types/DictionaryTypes';

/**
 * Snapshot-based history operation for undo/redo used exclusively by LazyDictionaryContext.
 * Architecturally incompatible with the delta-based HistoryOperation in DictionaryTypes.ts —
 * keep local. Renamed from HistoryOperation to prevent shadowing the exported type.
 */
interface SnapshotHistoryOperation {
  dictionaryId: string;
  oldData: DictionaryData;
  newData: DictionaryData;
  timestamp: number;
}

/**
 * Lazy Dictionary Context value.
 * Extends DictionaryContextInterface for compile-time sync with DictionaryContext.
 */
interface LazyDictionaryContextValue extends DictionaryContextInterface {
  /** Change selected dictionary (async — triggers lazy load) */
  setSelectedDictionary: (dictionaryId: string) => Promise<void>;
  /** Set of loaded dictionary IDs (for debugging) */
  loadedDictionaries: Set<string>;
  /** Refresh dictionary type metadata */
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

async function invalidateTranslationEngineCache(dictionaryId: string): Promise<void> {
  if (!window.translationEngine) return;
  try {
    if (typeof window.translationEngine.invalidateDictionaryCaches === 'function') {
      await window.translationEngine.invalidateDictionaryCaches(dictionaryId);
      logger.log('✅ Dictionary caches cleared');
    } else if (typeof window.translationEngine.invalidateAllCaches === 'function') {
      await window.translationEngine.invalidateAllCaches(dictionaryId);
      logger.log('✅ All caches cleared');
    }
  } catch (cacheError) {
    toast.warning('Cache invalidation failed. Use Cmd/Ctrl-R to reload.', {
      duration: TOAST_DURATIONS.LOAD_FAILURE,
      id: TOAST_IDS.CACHE_INVALIDATION_FAILED,
    });
    logger.warn('Cache invalidation failed (non-critical):', cacheError);
  }
}
// MEDIUM-1 FIX: Dynamic preload delay calculation
// Default delay used as fallback if measurement fails
const DEFAULT_PRELOAD_DELAY = 1000; // ms to wait before preloading other dictionaries

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<SnapshotHistoryOperation[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>(-1);
  const currentHistoryIndexRef = useRef(currentHistoryIndex);
  currentHistoryIndexRef.current = currentHistoryIndex;
  const [selectedDictionary, setSelectedDictionary] = useState<string>('properNouns');
  const [dictionaryTypes, setDictionaryTypes] = useState<DictionaryTypesCollection>({});

  const preloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track in-flight dictionary loads to prevent race conditions
  const loadingDictionariesRef = useRef<Set<string>>(new Set());
  // Track loading promises to share between concurrent calls (prevents duplicate fetches)
  const loadingPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  // MEDIUM-1 FIX: Track first dictionary load time for dynamic delay calculation
  const firstLoadTimeRef = useRef<number | null>(null);
  // Ref-mirror of loadedDictionaries so loadDictionaryImmediate can read the current
  // set without being recreated on every load (avoids dep-array churn per CLAUDE.md).
  const loadedDictionariesRef = useRef(loadedDictionaries);
  loadedDictionariesRef.current = loadedDictionaries;
  // Ref-mirror of dictionaryTypes so handleDictionaryChange can read Object.keys()
  // without closing over state that changes on every refreshDictionaryTypes() call.
  const dictionaryTypesRef = useRef(dictionaryTypes);
  dictionaryTypesRef.current = dictionaryTypes;

  // Load a dictionary immediately
  const loadDictionaryImmediate = useCallback(
    async (dictionaryId: string): Promise<void> => {
      if (loadedDictionariesRef.current.has(dictionaryId)) {
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

      // CRITICAL FIX: Mark as loading BEFORE creating promise to make check-and-set atomic
      // This prevents race condition where two threads both pass the check above
      loadingDictionariesRef.current.add(dictionaryId);

      // Create promise AFTER marking as loading (ensures atomicity)
      const loadPromise = (async () => {
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

            // HIGH-1 FIX: Notify user of load failure instead of silent failure
            toast.warning(
              `Failed to load ${dictionaryId} dictionary: ${result.error || 'Unknown error'}. Translation quality may be affected.`,
              {
                duration: TOAST_DURATIONS.MOVE_ERROR,
                id: TOAST_IDS.DICT_LOAD_FAILED,
              }
            );

            setDictionaries((prev) => ({
              ...prev,
              [dictionaryId]: {},
            }));
            setLoadedDictionaries((prev) => new Set([...prev, dictionaryId]));
          }
        } catch (error) {
          logger.error(`Error loading dictionary ${dictionaryId}:`, error);

          // HIGH-1 FIX: Notify user of load error
          const errorMsg = extractErrorMessage(error);
          toast.error(
            `Error loading ${dictionaryId} dictionary: ${errorMsg}. Please try reloading.`,
            {
              duration: TOAST_DURATIONS.MOVE_ERROR,
              id: TOAST_IDS.DICT_LOAD_FAILED,
            }
          );
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
    [] // stable — reads loadedDictionaries via loadedDictionariesRef.current
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
          (id) => id !== currentDict && !loadedDictionariesRef.current.has(id)
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
    [loadDictionaryImmediate]
  );

  // Load dictionary types and configuration on mount
  useEffect(() => {
    const loadInitialState = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError(null);
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
    // ESLint disable: This effect should run exactly once on mount for initial dictionary load.
    // Including schedulePreload would cause re-runs when loadedDictionaries changes, which is incorrect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Public load dictionary function (triggers immediate load if not loaded)
  const loadDictionary = useCallback(
    async (dictionaryId: string): Promise<void> => {
      if (!loadedDictionariesRef.current.has(dictionaryId)) {
        await loadDictionaryImmediate(dictionaryId);
      }
    },
    [loadDictionaryImmediate] // stable — reads loadedDictionaries via loadedDictionariesRef.current
  );

  // Handle dictionary selection change
  const handleDictionaryChange = useCallback(
    async (newDictionaryId: string): Promise<void> => {
      setSelectedDictionary(newDictionaryId);

      // Load the selected dictionary immediately if not loaded
      if (!loadedDictionariesRef.current.has(newDictionaryId)) {
        await loadDictionaryImmediate(newDictionaryId);
      }

      // Reschedule preloading for remaining dictionaries.
      // Read via ref so this callback is not recreated on every refreshDictionaryTypes() call.
      const allDictionaries = Object.keys(dictionaryTypesRef.current);
      schedulePreload(newDictionaryId, allDictionaries);
    },
    [loadDictionaryImmediate, schedulePreload] // stable — reads dictionaryTypes via dictionaryTypesRef.current
  );

  // Persist selected dictionary
  usePersistSelectedDictionary(selectedDictionary, isLoading);

  // Helper function to add operations to history
  // HIGH-1 FIX: Deep copy dictionary data to prevent history corruption
  // structuredClone creates deep copies, preventing mutations to history entries
  const addToHistory = useCallback(
    (dictionaryId: string, oldData: DictionaryData, newData: DictionaryData): void => {
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, currentHistoryIndexRef.current + 1);
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
    [] // stable — reads currentHistoryIndex via ref to avoid stale closure on rapid operations
  );

  // Dictionary operations (same as before but with lazy loading check)
  const addEntry = useCallback(
    async (
      dictionaryId: string,
      source: string,
      translation: string,
      metadata: DictionaryEntryMetadata = {}
    ): Promise<void> => {
      // Dictionary existence is a precondition, not a user-input validation error.
      // Check before the try block so the outer catch doesn't show a second toast.
      // Mirrors DictionaryContext.tsx which also checks existence before try.
      if (!dictionaries[dictionaryId]) {
        const msg = `Dictionary '${dictionaryId}' does not exist`;
        toast.error(msg);
        throw new ValidationError(msg);
      }

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
          throw new ValidationError(validationError);
        }

        const oldData = { ...dictionaries[dictionaryId] };

        let targetValue: string | DictionaryEntryValue = cleanTranslation;
        if (
          (dictionaryId === 'phrases' ||
            dictionaryId === 'patterns' ||
            dictionaryId.startsWith('properNouns')) &&
          (metadata.allowAsPatternVariable !== undefined ||
            metadata.lowPriority !== undefined ||
            metadata.semanticType !== undefined ||
            metadata.allowedVariableTypes !== undefined)
        ) {
          const entryValue: Extract<DictionaryEntryValue, { translation: string }> = {
            translation: cleanTranslation,
            allowAsPatternVariable: metadata.allowAsPatternVariable,
            lowPriority: metadata.lowPriority,
          };
          if (metadata.semanticType) entryValue.semanticType = metadata.semanticType;
          if (metadata.allowedVariableTypes)
            entryValue.allowedVariableTypes = metadata.allowedVariableTypes;
          targetValue = entryValue;
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

          await invalidateTranslationEngineCache(dictionaryId);
        } else {
          // Rollback optimistic update
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
          const errorMsg = result.error || 'Failed to save dictionary changes';
          toast.error(`Save failed: ${errorMsg}. Changes reverted.`);
          throw new SaveError(errorMsg);
        }
      } catch (error) {
        logger.error('Error adding dictionary entry:', error);
        // Only show toast if not a validation error (already toasted) or save error (already toasted above)
        if (!isValidationError(error) && !isSaveError(error)) {
          toast.error(`Could not add entry: ${extractErrorMessage(error)}`);
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
      // Dictionary existence is a precondition, not a user-input validation error.
      // Check before the try block so the outer catch doesn't show a second toast,
      // and so validation doesn't run against a non-existent dictionary.
      // Mirrors addEntry and DictionaryContext.tsx::updateEntry which both check before try.
      if (!dictionaries[dictionaryId]) {
        const msg = `Dictionary '${dictionaryId}' does not exist`;
        toast.error(msg);
        throw new ValidationError(msg);
      }

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
          throw new ValidationError(validationError);
        }

        const oldData = { ...dictionaries[dictionaryId] };
        const updatedDictionary = { ...oldData };

        if (oldSource !== cleanNewSource) {
          delete updatedDictionary[oldSource];
        }

        let targetValue: string | DictionaryEntryValue = cleanTranslation;
        if (
          (dictionaryId === 'phrases' ||
            dictionaryId === 'patterns' ||
            dictionaryId.startsWith('properNouns')) &&
          (metadata.allowAsPatternVariable !== undefined ||
            metadata.lowPriority !== undefined ||
            metadata.semanticType !== undefined ||
            metadata.allowedVariableTypes !== undefined)
        ) {
          const entryValue: Extract<DictionaryEntryValue, { translation: string }> = {
            translation: cleanTranslation,
            allowAsPatternVariable: metadata.allowAsPatternVariable,
            lowPriority: metadata.lowPriority,
          };
          if (metadata.semanticType) entryValue.semanticType = metadata.semanticType;
          if (metadata.allowedVariableTypes)
            entryValue.allowedVariableTypes = metadata.allowedVariableTypes;
          targetValue = entryValue;
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

          await invalidateTranslationEngineCache(dictionaryId);
        } else {
          // Rollback optimistic update
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
          const errorMsg = result.error || 'Failed to save dictionary changes';
          toast.error(`Save failed: ${errorMsg}. Changes reverted.`);
          throw new SaveError(errorMsg);
        }
      } catch (error) {
        logger.error('Error updating dictionary entry:', error);
        // Only show toast if not a validation error (already toasted) or save error (already toasted above)
        if (!isValidationError(error) && !isSaveError(error)) {
          toast.error(`Could not update entry: ${extractErrorMessage(error)}`);
        }
        throw error; // Re-throw for caller handling
      }
    },
    [dictionaries, addToHistory]
  );

  const deleteEntry = useCallback(
    async (dictionaryId: string, source: string): Promise<void> => {
      // Existence check before try — mirrors addEntry/updateEntry/bulkDeleteEntries pattern.
      if (!dictionaries[dictionaryId]) {
        const msg = `Dictionary '${dictionaryId}' does not exist`;
        toast.error(msg);
        throw new ValidationError(msg);
      }

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

          await invalidateTranslationEngineCache(dictionaryId);
        } else {
          // Rollback optimistic update
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
          const errorMsg = result.error || 'Failed to delete dictionary entry';
          toast.error(`Delete failed: ${errorMsg}. Changes reverted.`);
          throw new SaveError(errorMsg);
        }
      } catch (error) {
        logger.error('Error deleting dictionary entry:', error);
        // Guard against double toast: SaveError already showed a toast before throwing;
        // ValidationError shows its own toast at the throw site (though deleteEntry has none,
        // added here for consistency with addEntry/updateEntry).
        if (!isValidationError(error) && !isSaveError(error)) {
          toast.error(`Could not delete entry: ${extractErrorMessage(error)}`);
        }
        throw error; // Re-throw for caller handling
      }
    },
    [dictionaries, addToHistory]
  );

  // Bulk delete multiple entries in one save operation.
  // Uses snapshot-based history (same as addEntry/updateEntry/deleteEntry in this context).
  // Note: undo restores the full pre-bulk-delete snapshot of the dictionary.
  const bulkDeleteEntries = useCallback(
    async (
      dictionaryId: string,
      sources: string[]
    ): Promise<{ successCount: number; errors: string[] }> => {
      if (sources.length === 0) {
        return { successCount: 0, errors: [] };
      }

      // Existence check before try — mirrors addEntry/updateEntry pattern.
      if (!dictionaries[dictionaryId]) {
        const msg = `Dictionary '${dictionaryId}' does not exist`;
        toast.error(msg);
        throw new ValidationError(msg);
      }

      try {
        const oldData = { ...dictionaries[dictionaryId] };
        const updatedDictionary = { ...oldData };
        const errors: string[] = [];
        let successCount = 0;

        for (const source of sources) {
          if (updatedDictionary[source] !== undefined) {
            delete updatedDictionary[source];
            successCount++;
          } else {
            errors.push(`Entry "${source}" not found in dictionary`);
          }
        }

        const sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, sources[0]);

        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: sortedDictionary,
        }));

        const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary);

        if (result.success && result.data) {
          addToHistory(dictionaryId, oldData, result.data);
          const count = successCount;
          toast.success(`Deleted ${count} ${count === 1 ? 'entry' : 'entries'}`);
          await invalidateTranslationEngineCache(dictionaryId);
        } else {
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
          const errorMsg = result.error || 'Failed to save dictionary after bulk delete';
          toast.error(`Bulk delete failed: ${errorMsg}. Changes reverted.`);
          throw new SaveError(errorMsg);
        }

        return { successCount, errors };
      } catch (error) {
        logger.error('Error bulk deleting entries:', error);
        if (!isValidationError(error) && !isSaveError(error)) {
          toast.error(`Could not bulk delete entries: ${extractErrorMessage(error)}`);
        }
        throw error;
      }
    },
    [dictionaries, addToHistory]
  );

  // Move a single entry between dictionaries atomically.
  // Note: LazyDictionaryContext uses snapshot-based single-dict history, so undo is not
  // supported for cross-dictionary moves. Both dictionaries are saved, but history records
  // only the source removal. Full bidirectional undo would require extending HistoryOperation.
  const moveEntry = useCallback(
    async (
      sourceDictId: string,
      targetDictId: string,
      source: string,
      targetDictLabel: string
    ): Promise<void> => {
      const currentSourceDict = dictionaries[sourceDictId];
      const currentTargetDict = dictionaries[targetDictId];

      if (!currentSourceDict)
        throw new ValidationError(`Source dictionary '${sourceDictId}' does not exist`);
      if (!currentTargetDict)
        throw new ValidationError(`Target dictionary '${targetDictId}' does not exist`);

      const entryValue = currentSourceDict[source];
      if (entryValue === undefined)
        throw new ValidationError(`Entry '${source}' not found in source dictionary`);

      const updatedSourceDict = { ...currentSourceDict };
      delete updatedSourceDict[source];
      const sortedSourceDict = sortDictionaryEntries(updatedSourceDict, sourceDictId, source);
      const updatedTargetDict = { ...currentTargetDict, [source]: entryValue };
      const sortedTargetDict = sortDictionaryEntries(updatedTargetDict, targetDictId, source);

      setDictionaries((prev) => ({
        ...prev,
        [sourceDictId]: sortedSourceDict,
        [targetDictId]: sortedTargetDict,
      }));

      const [sourceResult, targetResult] = await Promise.all([
        window.electronAPI.saveDictionary(sourceDictId, sortedSourceDict),
        window.electronAPI.saveDictionary(targetDictId, sortedTargetDict),
      ]);

      if (sourceResult.success && targetResult.success) {
        addToHistory(sourceDictId, currentSourceDict, sourceResult.data);
        toast.success(`Entry moved to ${targetDictLabel}`);
        await invalidateTranslationEngineCache(sourceDictId);
        await invalidateTranslationEngineCache(targetDictId);
      } else {
        setDictionaries((prev) => ({
          ...prev,
          [sourceDictId]: currentSourceDict,
          [targetDictId]: currentTargetDict,
        }));
        if (sourceResult.success && !targetResult.success) {
          await window.electronAPI.saveDictionary(sourceDictId, currentSourceDict).catch(() => {});
        } else if (!sourceResult.success && targetResult.success) {
          await window.electronAPI.saveDictionary(targetDictId, currentTargetDict).catch(() => {});
        }
        throw new SaveError('Failed to save dictionaries during move');
      }
    },
    [dictionaries, addToHistory]
  );

  // Move multiple entries between dictionaries atomically.
  // Same undo caveat as moveEntry — snapshot history is single-dict only.
  const bulkMoveEntries = useCallback(
    async (
      sourceDictId: string,
      targetDictId: string,
      sources: string[],
      targetDictLabel: string
    ): Promise<{ movedCount: number; errors: string[] }> => {
      if (sources.length === 0) return { movedCount: 0, errors: [] };

      const currentSourceDict = dictionaries[sourceDictId];
      const currentTargetDict = dictionaries[targetDictId];

      if (!currentSourceDict)
        throw new ValidationError(`Source dictionary '${sourceDictId}' does not exist`);
      if (!currentTargetDict)
        throw new ValidationError(`Target dictionary '${targetDictId}' does not exist`);

      const errors: string[] = [];
      const updatedSourceDict = { ...currentSourceDict };
      const updatedTargetDict = { ...currentTargetDict };

      for (const source of sources) {
        const value = updatedSourceDict[source];
        if (value !== undefined) {
          updatedTargetDict[source] = value;
          delete updatedSourceDict[source];
        } else {
          errors.push(`Entry "${source}" not found`);
        }
      }

      const movedCount = sources.length - errors.length;
      const sortedSourceDict = sortDictionaryEntries(updatedSourceDict, sourceDictId, sources[0]);
      const sortedTargetDict = sortDictionaryEntries(updatedTargetDict, targetDictId, sources[0]);

      setDictionaries((prev) => ({
        ...prev,
        [sourceDictId]: sortedSourceDict,
        [targetDictId]: sortedTargetDict,
      }));

      const [sourceResult, targetResult] = await Promise.all([
        window.electronAPI.saveDictionary(sourceDictId, sortedSourceDict),
        window.electronAPI.saveDictionary(targetDictId, sortedTargetDict),
      ]);

      if (sourceResult.success && targetResult.success) {
        addToHistory(sourceDictId, currentSourceDict, sourceResult.data);
        toast.success(
          `Moved ${movedCount} ${movedCount === 1 ? 'entry' : 'entries'} to ${targetDictLabel}`
        );
        await invalidateTranslationEngineCache(sourceDictId);
        await invalidateTranslationEngineCache(targetDictId);
      } else {
        setDictionaries((prev) => ({
          ...prev,
          [sourceDictId]: currentSourceDict,
          [targetDictId]: currentTargetDict,
        }));
        if (sourceResult.success && !targetResult.success) {
          await window.electronAPI.saveDictionary(sourceDictId, currentSourceDict).catch(() => {});
        } else if (!sourceResult.success && targetResult.success) {
          await window.electronAPI.saveDictionary(targetDictId, currentTargetDict).catch(() => {});
        }
        throw new SaveError('Failed to save dictionaries during bulk move');
      }

      return { movedCount, errors };
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

          await invalidateTranslationEngineCache(operation.dictionaryId);

          return true;
        } else {
          toast.error(`Could not undo: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        logger.error('Error during undo:', error);
        toast.error(`Undo failed: ${extractErrorMessage(error)}`);
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

          await invalidateTranslationEngineCache(operation.dictionaryId);

          return true;
        } else {
          toast.error(`Could not redo: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        logger.error('Error during redo:', error);
        toast.error(`Redo failed: ${extractErrorMessage(error)}`);
      }
    }
    // Note: No toast for "nothing to redo" - button should be disabled in this state
    return false;
  }, [history, currentHistoryIndex]);

  // getSortingStats and resetSortingStats are stable module-level helpers from dictionaryHelpers —
  // no useCallback wrapper needed; pass them directly in the value object below.

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

  const value = useMemo<LazyDictionaryContextValue>(
    () => ({
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
      canUndo: currentHistoryIndex >= 0,
      canRedo: currentHistoryIndex < history.length - 1,
      loadDictionary,
      selectedDictionary,
      setSelectedDictionary: handleDictionaryChange,
      getSortingStats,
      resetSortingStats,
      loadedDictionaries,
      refreshDictionaryTypes,
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
      currentHistoryIndex,
      history.length,
      loadDictionary,
      selectedDictionary,
      handleDictionaryChange,
      loadedDictionaries,
      refreshDictionaryTypes,
    ]
  );

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
