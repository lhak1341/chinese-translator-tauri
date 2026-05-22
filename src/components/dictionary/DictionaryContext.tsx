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
import { validateDictionaryEntry, getDictionaryTypes } from './DictionaryTypes';
import { sanitizeDictionaryEntry } from '../../utils/text';
import {
  sortDictionaryEntries,
  getSortingStats,
  resetSortingStats,
} from '../../utils/dictionaryHelpers';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import { logger } from '../../utils/logger';
import { ValidationError, SaveError, isValidationError, isSaveError } from '../../utils/errors';
import { TOAST_DURATIONS, TOAST_IDS } from '../../constants/toastConfig';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { loadAppConfig } from '../../utils/appConfig';
import type {
  DictionaryData,
  DictionaryEntryValue,
  DictionaryEntryMetadata,
  DictionaryContextInterface,
} from '../../types/DictionaryTypes';
import { useDictionaryHistory } from './useDictionaryHistory';
import type { BatchDictionaryResult } from '../../types/ElectronTypes';

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

        // Process results and sort dictionaries
        const failedIds: string[] = [];
        batchResult.results.forEach((result: BatchDictionaryResult) => {
          if (result.success && result.data) {
            loadedDictionaries[result.dictionary_id] = sortDictionaryEntries(
              result.data,
              result.dictionary_id
            );
          } else {
            logger.error(`Failed to load dictionary ${result.dictionary_id}:`, result.error);
            failedIds.push(result.dictionary_id);
            // Initialize with empty dictionary if load fails
            loadedDictionaries[result.dictionary_id] = {};
          }
        });

        // Auto-retry failed dictionaries once via the single-dict serial path
        // before declaring partial failure. Cold-launch flakiness (file lock,
        // Rayon thread pool warmup, OS read pressure) sometimes drops a
        // dictionary on the parallel path; the same file loads cleanly on a
        // retry, which is exactly what the manual "Reload" button does. We
        // do this here so users do not have to click reload to recover.
        const stillFailedIds: string[] = [];
        if (failedIds.length > 0) {
          logger.warn(
            `⚠️ Initial parallel load failed for ${failedIds.length} dictionaries — retrying serially: ${failedIds.join(', ')}`
          );
          const retryResults = await Promise.all(
            failedIds.map(async (id) => {
              try {
                const r = await window.electronAPI.loadDictionary(id);
                if (r.success && r.data) return { id, data: r.data, success: true as const };
                return { id, success: false as const, error: r.error };
              } catch (e) {
                return { id, success: false as const, error: extractErrorMessage(e) };
              }
            })
          );
          for (const r of retryResults) {
            if (r.success) {
              loadedDictionaries[r.id] = sortDictionaryEntries(r.data, r.id);
              logger.log(`✅ Retry succeeded for dictionary "${r.id}"`);
            } else {
              stillFailedIds.push(r.id);
              logger.error(`❌ Retry failed for dictionary "${r.id}":`, r.error);
            }
          }
        }

        const totalSuccessful = batchResult.total - stillFailedIds.length;

        // Surface a load error to consumers if ALL dictionaries failed (engine
        // would initialize with empty tries → garbage translations). Partial
        // failures still allow translation to proceed with degraded coverage.
        if (totalSuccessful === 0 && batchResult.total > 0) {
          const msg = `All ${batchResult.total} dictionaries failed to load. Translation unavailable.`;
          setLoadError(msg);
          toast.error(msg, {
            duration: TOAST_DURATIONS.CRITICAL,
            id: TOAST_IDS.DICT_LOAD_FAILED,
          });
        } else if (stillFailedIds.length > 0) {
          logger.warn(
            `⚠️ ${stillFailedIds.length}/${batchResult.total} dictionaries failed after retry: ${stillFailedIds.join(', ')}`
          );
          toast.warning(
            `${stillFailedIds.length} of ${batchResult.total} dictionaries failed to load. Use the Reload button if proper nouns are missing.`,
            { duration: TOAST_DURATIONS.LOAD_FAILURE, id: TOAST_IDS.DICT_LOAD_FAILED }
          );
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

  // Add a new entry to a dictionary
  const addEntry = useCallback(
    async (
      dictionaryId: string,
      source: string,
      translation: string,
      metadata: DictionaryEntryMetadata = {}
    ): Promise<void> => {
      if (!dictionaries[dictionaryId]) {
        const msg = `Dictionary '${dictionaryId}' does not exist`;
        toast.error(msg);
        throw new ValidationError(msg);
      }

      try {
        // SECURITY: Sanitize input to prevent JSON corruption from null bytes, surrogates, control chars
        const sanitized = sanitizeDictionaryEntry(source, translation);
        const cleanSource = sanitized.source;
        const cleanTranslation = sanitized.translation;

        const validationError = validateDictionaryEntry(
          dictionaryId,
          cleanSource,
          cleanTranslation
        );
        if (validationError) {
          toast.error(validationError);
          throw new ValidationError(validationError);
        }

        // Prepare target value with metadata.
        // Complex-entry dicts (phrases, patterns, properNouns) always use object format.
        // Pure lookup-table dicts (characters, conversion, punctuation) use string format.
        let targetValue: string | DictionaryEntryValue = cleanTranslation;
        if (
          dictionaryId === 'phrases' ||
          dictionaryId === 'patterns' ||
          dictionaryId.startsWith('properNouns')
        ) {
          const entryValue: DictionaryEntryValue = {
            translation: cleanTranslation,
            allowAsPatternVariable: metadata.allowAsPatternVariable ?? false,
            lowPriority: metadata.lowPriority,
          };
          if (metadata.semanticType) entryValue.semanticType = metadata.semanticType;
          if (metadata.allowedVariableTypes)
            entryValue.allowedVariableTypes = metadata.allowedVariableTypes;
          targetValue = entryValue;
        }

        // Compute from closed-over snapshot before setDictionaries (React Concurrent Mode safe)
        const oldData = { ...dictionaries[dictionaryId] };
        const isOverwrite = oldData[cleanSource] !== undefined;
        const updatedDictionary = { ...oldData, [cleanSource]: targetValue };
        const sortedDictionary = sortDictionaryEntries(
          updatedDictionary,
          dictionaryId,
          cleanSource
        );

        const ok = await persistDictionaryMutation(dictionaryId, oldData, sortedDictionary);
        if (ok) {
          addToHistory({
            dictionaryId,
            operation: 'add',
            entry: { source: cleanSource, value: targetValue },
          });
          if (isOverwrite) {
            toast.warning('Existing entry overwritten');
          } else {
            toast.success('Entry added successfully');
          }
          await invokeEngineInvalidator(engineInvalidatorRef, dictionaryId);
        } else {
          toast.error('Failed to save dictionary changes');
          throw new SaveError('Failed to save dictionary changes');
        }
      } catch (error) {
        logger.error('Error adding dictionary entry:', error);
        if (!isValidationError(error) && !isSaveError(error)) {
          toast.error(`Could not add entry: ${extractErrorMessage(error)}`);
        }
        throw error;
      }
    },
    [dictionaries, addToHistory, persistDictionaryMutation]
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
      if (!dictionaries[dictionaryId]) {
        const msg = `Dictionary '${dictionaryId}' does not exist`;
        toast.error(msg);
        throw new ValidationError(msg);
      }

      try {
        // SECURITY: Sanitize input to prevent JSON corruption from null bytes, surrogates, control chars
        const sanitized = sanitizeDictionaryEntry(newSource, translation);
        const cleanNewSource = sanitized.source;
        const cleanTranslation = sanitized.translation;

        const validationError = validateDictionaryEntry(
          dictionaryId,
          cleanNewSource,
          cleanTranslation
        );
        if (validationError) {
          toast.error(validationError);
          throw new ValidationError(validationError);
        }

        // Prepare target value with metadata.
        // Complex-entry dicts (phrases, patterns, properNouns) always use object format.
        // Pure lookup-table dicts (characters, conversion, punctuation) use string format.
        let targetValue: string | DictionaryEntryValue = cleanTranslation;
        if (
          dictionaryId === 'phrases' ||
          dictionaryId === 'patterns' ||
          dictionaryId.startsWith('properNouns')
        ) {
          const entryValue: DictionaryEntryValue = {
            translation: cleanTranslation,
            allowAsPatternVariable: metadata.allowAsPatternVariable ?? false,
            lowPriority: metadata.lowPriority,
          };
          if (metadata.semanticType) entryValue.semanticType = metadata.semanticType;
          if (metadata.allowedVariableTypes)
            entryValue.allowedVariableTypes = metadata.allowedVariableTypes;
          targetValue = entryValue;
        }

        // Compute from closed-over snapshot before setDictionaries (React Concurrent Mode safe)
        const oldData = { ...dictionaries[dictionaryId] };
        // Capture old entry for delta-based undo
        const oldEntryValue = oldData[oldSource];
        const updatedDictionary = { ...oldData };

        if (oldSource !== cleanNewSource) {
          delete updatedDictionary[oldSource];
        }

        updatedDictionary[cleanNewSource] = targetValue;

        const sortedDictionary = sortDictionaryEntries(
          updatedDictionary,
          dictionaryId,
          cleanNewSource,
          oldSource
        );

        const ok = await persistDictionaryMutation(dictionaryId, oldData, sortedDictionary);
        if (ok) {
          addToHistory({
            dictionaryId,
            operation: 'update',
            entry: { source: cleanNewSource, value: targetValue },
            oldEntry: oldEntryValue ? { source: oldSource, value: oldEntryValue } : undefined,
            oldSource: oldSource !== cleanNewSource ? oldSource : undefined,
          });
          toast.success('Entry updated successfully');
          await invokeEngineInvalidator(engineInvalidatorRef, dictionaryId);
        } else {
          toast.error('Failed to save dictionary changes');
          throw new SaveError('Failed to save dictionary changes');
        }
      } catch (error) {
        logger.error('Error updating dictionary entry:', error);
        if (!isValidationError(error) && !isSaveError(error)) {
          toast.error(`Could not update entry: ${extractErrorMessage(error)}`);
        }
        throw error;
      }
    },
    [dictionaries, addToHistory, persistDictionaryMutation]
  );

  // Delete an entry
  const deleteEntry = useCallback(
    async (dictionaryId: string, source: string): Promise<void> => {
      if (!dictionaries[dictionaryId]) {
        const msg = `Dictionary '${dictionaryId}' does not exist`;
        toast.error(msg);
        throw new ValidationError(msg);
      }

      try {
        // Compute from closed-over snapshot before setDictionaries (React Concurrent Mode safe)
        const oldData = { ...dictionaries[dictionaryId] };
        // Capture old entry for delta-based undo
        const oldEntryValue = oldData[source];
        if (oldEntryValue === undefined) {
          const msg = `Entry '${source}' not found in dictionary`;
          toast.warning(msg);
          throw new ValidationError(msg);
        }
        const updatedDictionary = { ...oldData };
        delete updatedDictionary[source];
        const sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, source);

        const ok = await persistDictionaryMutation(dictionaryId, oldData, sortedDictionary);
        if (ok) {
          addToHistory({
            dictionaryId,
            operation: 'delete',
            oldEntry: { source, value: oldEntryValue },
          });
          toast.success('Entry deleted successfully');
          await invokeEngineInvalidator(engineInvalidatorRef, dictionaryId);
        } else {
          toast.error('Failed to delete dictionary entry');
          throw new SaveError('Failed to delete dictionary entry');
        }
      } catch (error) {
        logger.error('Error deleting dictionary entry:', error);
        if (!isValidationError(error) && !isSaveError(error)) {
          toast.error(`Could not delete entry: ${extractErrorMessage(error)}`);
        }
        throw error;
      }
    },
    [dictionaries, addToHistory, persistDictionaryMutation]
  );

  // Bulk delete multiple entries from a dictionary in one operation
  // More efficient than calling deleteEntry multiple times - saves dictionary only once
  const bulkDeleteEntries = useCallback(
    async (
      dictionaryId: string,
      sources: string[]
    ): Promise<{ successCount: number; errors: string[] }> => {
      if (sources.length === 0) {
        return { successCount: 0, errors: [] };
      }

      // Check existence on closed-over snapshot BEFORE setDictionaries.
      // React 18 Concurrent Mode calls updaters multiple times; `let` variables assigned
      // inside the updater and read outside reflect whichever invocation ran last —
      // breaking the rollback oldData and the save payload.
      if (!dictionaries[dictionaryId]) {
        const msg = `Dictionary '${dictionaryId}' does not exist`;
        toast.error(msg);
        throw new ValidationError(msg);
      }

      try {
        const oldData = { ...dictionaries[dictionaryId] };
        const updatedDictionary = { ...oldData };
        const deletedEntries: Array<{ source: string; value: string | DictionaryEntryValue }> = [];
        const errors: string[] = [];

        // Delete all specified entries
        for (const source of sources) {
          if (updatedDictionary[source] !== undefined) {
            deletedEntries.push({ source, value: updatedDictionary[source] });
            delete updatedDictionary[source];
          } else {
            errors.push(`Entry "${source}" not found in dictionary`);
          }
        }

        const sortAnchor = deletedEntries[0]?.source ?? sources[0];
        const sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, sortAnchor);

        const ok = await persistDictionaryMutation(dictionaryId, oldData, sortedDictionary);
        if (ok) {
          // CODE REVIEW FIX 2026-02-09 (CRITICAL): Store all deleted entries for proper undo
          if (deletedEntries.length > 0) {
            if (deletedEntries.length === 1) {
              addToHistory({ dictionaryId, operation: 'delete', oldEntry: deletedEntries[0] });
            } else {
              addToHistory({ dictionaryId, operation: 'bulk_delete', oldEntries: deletedEntries });
            }
          }
          await invokeEngineInvalidator(engineInvalidatorRef, dictionaryId);
        } else {
          toast.error('Failed to save dictionary after bulk delete');
          throw new SaveError('Failed to save dictionary after bulk delete');
        }

        return { successCount: deletedEntries.length, errors };
      } catch (error) {
        logger.error('Error bulk deleting entries:', error);
        if (!isValidationError(error) && !isSaveError(error)) {
          toast.error(`Could not bulk delete entries: ${extractErrorMessage(error)}`);
        }
        throw error;
      }
    },
    [dictionaries, addToHistory, persistDictionaryMutation]
  );

  // Move a single entry between dictionaries atomically
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

      // Optimistic update
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
        addToHistory({
          dictionaryId: sourceDictId,
          targetDictionaryId: targetDictId,
          operation: 'move',
          oldEntry: { source, value: entryValue as DictionaryEntryValue },
        });
        toast.success(`Entry moved to ${targetDictLabel}`);
        await invokeEngineInvalidator(engineInvalidatorRef, sourceDictId);
        await invokeEngineInvalidator(engineInvalidatorRef, targetDictId);
      } else {
        // Rollback React state
        setDictionaries((prev) => ({
          ...prev,
          [sourceDictId]: currentSourceDict,
          [targetDictId]: currentTargetDict,
        }));
        // Revert whichever save succeeded
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

  // Move multiple entries between dictionaries atomically
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

      const movedEntries: Array<{ source: string; value: DictionaryEntryValue }> = [];
      const errors: string[] = [];
      const updatedSourceDict = { ...currentSourceDict };
      const updatedTargetDict = { ...currentTargetDict };

      for (const source of sources) {
        const value = updatedSourceDict[source];
        if (value !== undefined) {
          movedEntries.push({ source, value: value as DictionaryEntryValue });
          updatedTargetDict[source] = value;
          delete updatedSourceDict[source];
        } else {
          errors.push(`Entry "${source}" not found`);
        }
      }

      const sortAnchor = movedEntries[0]?.source ?? sources[0];
      const sortedSourceDict = sortDictionaryEntries(updatedSourceDict, sourceDictId, sortAnchor);
      const sortedTargetDict = sortDictionaryEntries(updatedTargetDict, targetDictId, sortAnchor);

      // Optimistic update
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
        if (movedEntries.length > 0) {
          addToHistory({
            dictionaryId: sourceDictId,
            targetDictionaryId: targetDictId,
            operation: 'bulk_move',
            oldEntries: movedEntries,
          });
        }
        const count = movedEntries.length;
        toast.success(`Moved ${count} ${count === 1 ? 'entry' : 'entries'} to ${targetDictLabel}`);
        await invokeEngineInvalidator(engineInvalidatorRef, sourceDictId);
        await invokeEngineInvalidator(engineInvalidatorRef, targetDictId);
      } else {
        // Rollback React state
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

      return { movedCount: movedEntries.length, errors };
    },
    [dictionaries, addToHistory]
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
