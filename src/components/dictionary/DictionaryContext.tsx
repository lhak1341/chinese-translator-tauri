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
import { sanitizeDictionaryEntry } from '../../utils/TextSanitization';
import {
  sortDictionaryEntries,
  getSortingStats,
  resetSortingStats,
} from '../../utils/dictionaryHelpers';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import { logger } from '../../utils/logger';
import { ValidationError, SaveError, isValidationError, isSaveError } from '../../utils/errors';
import { extractErrorMessage } from '../../utils/errorHelpers';
import type {
  DictionaryData,
  DictionaryEntryValue,
  DictionaryEntryMetadata,
  HistoryOperation,
  SortingStats,
} from '../../types/DictionaryTypes';

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
  /** Delete multiple entries from a dictionary in one operation (more efficient than multiple deleteEntry calls) */
  bulkDeleteEntries: (
    dictionaryId: string,
    sources: string[]
  ) => Promise<{ successCount: number; errors: string[] }>;
  /** Move a single entry between dictionaries atomically with rollback and undo support */
  moveEntry: (
    sourceDictId: string,
    targetDictId: string,
    source: string,
    targetDictLabel: string
  ) => Promise<void>;
  /** Move multiple entries between dictionaries atomically with rollback and undo support */
  bulkMoveEntries: (
    sourceDictId: string,
    targetDictId: string,
    sources: string[],
    targetDictLabel: string
  ) => Promise<{ movedCount: number; errors: string[] }>;
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
  // Ref-mirror so addToHistory reads the latest index without being recreated on every undo/redo
  const currentHistoryIndexRef = useRef(currentHistoryIndex);
  currentHistoryIndexRef.current = currentHistoryIndex;
  // Ref-mirror so undo/redo move branches read latest dicts without closing over state
  const dictionariesRef = useRef(dictionaries);
  dictionariesRef.current = dictionaries;
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

  // Helper function to add delta-based operations to history
  // Memory-optimized: stores only changed entries instead of full dictionaries
  const addToHistory = useCallback(
    (operation: Omit<HistoryOperation, 'timestamp'>): void => {
      setHistory((prevHistory) => {
        const newHistory = prevHistory.slice(0, currentHistoryIndexRef.current + 1);
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
    [] // stable — reads currentHistoryIndex via currentHistoryIndexRef.current
  );

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

        // Prepare target value with metadata
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
          targetValue = {
            translation: cleanTranslation,
            allowAsPatternVariable: metadata.allowAsPatternVariable,
            lowPriority: metadata.lowPriority,
            ...(metadata.semanticType && { semanticType: metadata.semanticType }),
            ...(metadata.allowedVariableTypes && {
              allowedVariableTypes: metadata.allowedVariableTypes,
            }),
          };
        }

        // Compute from closed-over snapshot before setDictionaries (React Concurrent Mode safe)
        const oldData = { ...dictionaries[dictionaryId] };
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
          // Delta-based history: store only the added entry
          addToHistory({
            dictionaryId,
            operation: 'add',
            entry: {
              source: cleanSource,
              value: targetValue,
            },
          });
          toast.success('Entry added successfully');
        } else {
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
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
    [dictionaries, addToHistory]
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

        // Prepare target value with metadata
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
          targetValue = {
            translation: cleanTranslation,
            allowAsPatternVariable: metadata.allowAsPatternVariable,
            lowPriority: metadata.lowPriority,
            ...(metadata.semanticType && { semanticType: metadata.semanticType }),
            ...(metadata.allowedVariableTypes && {
              allowedVariableTypes: metadata.allowedVariableTypes,
            }),
          };
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

        // Optimistic update
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: sortedDictionary,
        }));

        const result = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary);

        if (result.success && result.data) {
          // Delta-based history: store only the changed entry
          addToHistory({
            dictionaryId,
            operation: 'update',
            entry: {
              source: cleanNewSource,
              value: targetValue,
            },
            oldEntry: oldEntryValue
              ? {
                  source: oldSource,
                  value: oldEntryValue,
                }
              : undefined,
            oldSource: oldSource !== cleanNewSource ? oldSource : undefined,
          });
          toast.success('Entry updated successfully');
        } else {
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
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
    [dictionaries, addToHistory]
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
            [dictionaryId]: oldData,
          }));
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
    [dictionaries, addToHistory]
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

        const sortedDictionary = sortDictionaryEntries(updatedDictionary, dictionaryId, sources[0]);

        // Pure functional update — no side effects inside updater
        setDictionaries((prev) => ({
          ...prev,
          [dictionaryId]: sortedDictionary,
        }));

        // Save dictionary to backend
        const saveResult = await window.electronAPI.saveDictionary(dictionaryId, sortedDictionary);

        if (saveResult.success && saveResult.data) {
          // Add to history - use bulk_delete operation for multiple entries
          // CODE REVIEW FIX 2026-02-09 (CRITICAL): Store all deleted entries for proper undo
          if (deletedEntries.length > 0) {
            if (deletedEntries.length === 1) {
              // Single entry - use regular delete for backward compatibility
              addToHistory({
                dictionaryId,
                operation: 'delete',
                oldEntry: deletedEntries[0],
              });
            } else {
              // Multiple entries - use bulk_delete operation
              addToHistory({
                dictionaryId,
                operation: 'bulk_delete',
                oldEntries: deletedEntries,
              });
            }
          }
        } else {
          // Rollback on failure
          setDictionaries((prev) => ({
            ...prev,
            [dictionaryId]: oldData,
          }));
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
    [dictionaries, addToHistory]
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

      if (!currentSourceDict) throw new Error(`Source dictionary '${sourceDictId}' does not exist`);
      if (!currentTargetDict) throw new Error(`Target dictionary '${targetDictId}' does not exist`);

      const entryValue = currentSourceDict[source];
      if (entryValue === undefined)
        throw new Error(`Entry '${source}' not found in source dictionary`);

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
          oldEntry: { source, value: entryValue },
        });
        toast.success(`Entry moved to ${targetDictLabel}`);
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
        throw new Error('Failed to save dictionaries during move');
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

      if (!currentSourceDict) throw new Error(`Source dictionary '${sourceDictId}' does not exist`);
      if (!currentTargetDict) throw new Error(`Target dictionary '${targetDictId}' does not exist`);

      const movedEntries: Array<{ source: string; value: DictionaryEntryValue }> = [];
      const errors: string[] = [];
      const updatedSourceDict = { ...currentSourceDict };
      const updatedTargetDict = { ...currentTargetDict };

      for (const source of sources) {
        const value = updatedSourceDict[source];
        if (value !== undefined) {
          movedEntries.push({ source, value });
          updatedTargetDict[source] = value;
          delete updatedSourceDict[source];
        } else {
          errors.push(`Entry "${source}" not found`);
        }
      }

      const sortedSourceDict = sortDictionaryEntries(updatedSourceDict, sourceDictId, sources[0]);
      const sortedTargetDict = sortDictionaryEntries(updatedTargetDict, targetDictId, sources[0]);

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
        throw new Error('Failed to save dictionaries during bulk move');
      }

      return { movedCount: movedEntries.length, errors };
    },
    [dictionaries, addToHistory]
  );

  // Undo function - applies delta-based operations in reverse
  // CODE REVIEW FIX 2026-02-08 (CRITICAL): Use functional updates to prevent race conditions
  const undo = useCallback(async (): Promise<boolean> => {
    if (currentHistoryIndex >= 0) {
      const operation = history[currentHistoryIndex];

      // Handle cross-dictionary move operations
      if (
        (operation.operation === 'move' || operation.operation === 'bulk_move') &&
        operation.targetDictionaryId
      ) {
        const currentDicts = dictionariesRef.current;
        const sourceDict = currentDicts[operation.dictionaryId];
        const targetDict = currentDicts[operation.targetDictionaryId];
        if (!sourceDict || !targetDict) {
          logger.error(`Cannot undo move: dictionaries not found`);
          return false;
        }

        const newTargetDict = { ...targetDict };
        const newSourceDict = { ...sourceDict };

        const entries =
          operation.operation === 'move'
            ? operation.oldEntry
              ? [operation.oldEntry]
              : []
            : (operation.oldEntries ?? []);

        for (const e of entries) {
          delete newTargetDict[e.source];
          newSourceDict[e.source] = e.value;
        }

        const sortedSource = sortDictionaryEntries(newSourceDict, operation.dictionaryId);
        const sortedTarget = sortDictionaryEntries(newTargetDict, operation.targetDictionaryId);

        const [sourceResult, targetResult] = await Promise.all([
          window.electronAPI.saveDictionary(operation.dictionaryId, sortedSource),
          window.electronAPI.saveDictionary(operation.targetDictionaryId, sortedTarget),
        ]);

        if (sourceResult.success && targetResult.success) {
          setDictionaries((prev) => ({
            ...prev,
            [operation.dictionaryId]: sortedSource,
            [operation.targetDictionaryId!]: sortedTarget,
          }));
          setCurrentHistoryIndex((prev) => prev - 1);
          return true;
        }
        return false;
      }

      // Read from ref-mirror instead of setDictionaries side-effect (React Concurrent Mode safe)
      const currentDict = dictionariesRef.current[operation.dictionaryId];
      if (!currentDict) {
        logger.error(`Cannot undo: dictionary ${operation.dictionaryId} not found`);
        return false;
      }

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
      } else if (operation.operation === 'bulk_delete') {
        // Reverse bulk_delete: restore all entries
        if (operation.oldEntries) {
          for (const oldEntry of operation.oldEntries) {
            newDict[oldEntry.source] = oldEntry.value;
          }
        }
      }

      // Re-sort dictionary after applying delta
      const updatedDict = sortDictionaryEntries(newDict, operation.dictionaryId);

      const result = await window.electronAPI.saveDictionary(operation.dictionaryId, updatedDict);

      if (result.success) {
        setDictionaries((prev) => ({
          ...prev,
          [operation.dictionaryId]: updatedDict,
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

      // Handle cross-dictionary move operations
      if (
        (operation.operation === 'move' || operation.operation === 'bulk_move') &&
        operation.targetDictionaryId
      ) {
        const sourceDict = dictionariesRef.current[operation.dictionaryId];
        const targetDict = dictionariesRef.current[operation.targetDictionaryId];
        if (!sourceDict || !targetDict) {
          logger.error(`Cannot redo move: dictionaries not found`);
          return false;
        }

        const newSourceDict = { ...sourceDict };
        const newTargetDict = { ...targetDict };

        const entries =
          operation.operation === 'move'
            ? operation.oldEntry
              ? [operation.oldEntry]
              : []
            : (operation.oldEntries ?? []);

        for (const e of entries) {
          delete newSourceDict[e.source];
          newTargetDict[e.source] = e.value;
        }

        const sortedSource = sortDictionaryEntries(newSourceDict, operation.dictionaryId);
        const sortedTarget = sortDictionaryEntries(newTargetDict, operation.targetDictionaryId);

        const [sourceResult, targetResult] = await Promise.all([
          window.electronAPI.saveDictionary(operation.dictionaryId, sortedSource),
          window.electronAPI.saveDictionary(operation.targetDictionaryId, sortedTarget),
        ]);

        if (sourceResult.success && targetResult.success) {
          setDictionaries((prev) => ({
            ...prev,
            [operation.dictionaryId]: sortedSource,
            [operation.targetDictionaryId!]: sortedTarget,
          }));
          setCurrentHistoryIndex((prev) => prev + 1);
          return true;
        }
        return false;
      }

      // Read from ref-mirror instead of setDictionaries side-effect (React Concurrent Mode safe)
      const currentDict = dictionariesRef.current[operation.dictionaryId];
      if (!currentDict) {
        logger.error(`Cannot redo: dictionary ${operation.dictionaryId} not found`);
        return false;
      }

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
      } else if (operation.operation === 'bulk_delete') {
        // Redo bulk_delete: delete all entries
        if (operation.oldEntries) {
          for (const oldEntry of operation.oldEntries) {
            delete newDict[oldEntry.source];
          }
        }
      }

      // Re-sort dictionary after applying delta
      const updatedDict = sortDictionaryEntries(newDict, operation.dictionaryId);

      const result = await window.electronAPI.saveDictionary(operation.dictionaryId, updatedDict);

      if (result.success) {
        setDictionaries((prev) => ({
          ...prev,
          [operation.dictionaryId]: updatedDict,
        }));
        setCurrentHistoryIndex((prev) => prev + 1);
        return true;
      }
    }
    return false;
  }, [history, currentHistoryIndex]);

  // getSortingStats and resetSortingStats are stable module-level helpers from dictionaryHelpers —
  // no useCallback wrapper needed; pass them directly in the value object below.

  // Create the context value object
  // Memoized to prevent unnecessary re-renders of all consumers when Provider re-renders
  const value = useMemo(
    (): DictionaryContextValue => ({
      dictionaries,
      isLoading,
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
      bulkDeleteEntries,
      moveEntry,
      bulkMoveEntries,
      undo,
      redo,
      currentHistoryIndex,
      history.length,
      loadDictionary,
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
