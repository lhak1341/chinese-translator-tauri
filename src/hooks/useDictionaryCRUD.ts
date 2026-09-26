import { useCallback } from 'react';
import type { RefObject } from 'react';
import toast from '../utils/toast';
import { validatePersistEntry } from '../utils/dictionary/PersistTimeValidator';
import { logger } from '../utils/logger';
import { ValidationError, SaveError, isValidationError, isSaveError } from '../utils/errors';
import { extractErrorMessage } from '../utils/errorHelpers';
import {
  isLookupTableDict,
  sanitizeDictionaryEntry,
  sortDictionaryEntries,
  canMoveBetween,
} from '../utils/dictionary';
import type {
  DictionaryData,
  DictionaryEntryValue,
  DictionaryEntryMetadata,
  DictionaryContextInterface,
  HistoryOperation,
} from '../types/DictionaryTypes';

/** Persists sorted entries for a single dict: optimistic update → save → rollback on failure. */
type PersistDictionaryMutation = (
  dictionaryId: string,
  oldData: DictionaryData,
  sortedEntries: DictionaryData
) => Promise<boolean>;

/** Arguments for the two-dict move protocol in the provider. */
export interface MoveOpUpdates {
  sourceDictId: string;
  oldSource: DictionaryData;
  newSource: DictionaryData;
  targetDictId: string;
  oldTarget: DictionaryData;
  newTarget: DictionaryData;
}

/** Persists a cross-dict move: optimistic update → parallel save → partial revert on failure. */
type CommitMoveOp = (updates: MoveOpUpdates) => Promise<boolean>;

type InvalidateEngine = (dictionaryId: string) => Promise<void>;
type AddToHistory = (op: Omit<HistoryOperation, 'timestamp'>) => void;

export type DictionaryCRUDAPI = Pick<
  DictionaryContextInterface,
  'addEntry' | 'updateEntry' | 'deleteEntry' | 'bulkDeleteEntries' | 'moveEntry' | 'bulkMoveEntries'
>;

// Sanitizes, validates, and builds the typed entry value for addEntry/updateEntry.
// Throws ValidationError (no toast — caller's catch block handles UI feedback).
function prepareMutationEntry(
  dictionaryId: string,
  source: string,
  translation: string,
  metadata: DictionaryEntryMetadata
): { cleanSource: string; cleanTranslation: string; targetValue: string | DictionaryEntryValue } {
  const sanitized = sanitizeDictionaryEntry(source, translation);
  const cleanSource = sanitized.source;
  const cleanTranslation = sanitized.translation;

  const validationError = validatePersistEntry(dictionaryId, cleanSource, cleanTranslation);
  if (validationError) {
    throw new ValidationError(validationError);
  }

  // Complex-entry dicts (phrases, patterns, properNouns) use object format.
  // Pure lookup-table dicts (characters, conversion, punctuation) use string format.
  let targetValue: string | DictionaryEntryValue = cleanTranslation;
  if (!isLookupTableDict(dictionaryId)) {
    const entryValue: DictionaryEntryValue = {
      translation: cleanTranslation,
      allowAsPatternVariable: metadata.allowAsPatternVariable ?? false,
    };
    if (metadata.semanticType) entryValue.semanticType = metadata.semanticType;
    if (metadata.allowedVariableTypes)
      entryValue.allowedVariableTypes = metadata.allowedVariableTypes;
    targetValue = entryValue;
  }

  return { cleanSource, cleanTranslation, targetValue };
}

// Byte-identical guard hand-copied at the top of addEntry/updateEntry/deleteEntry/
// bulkDeleteEntries (architecture review 2026-09-09, candidate #4 grilling). Deliberately NOT
// used by moveEntry/bulkMoveEntries — their own not-found checks throw ValidationError with no
// toast at all (MoveDialog.tsx owns error display via its own inline banner), a different,
// deliberate contract this helper doesn't fit.
function requireDictionaryExists(
  dictionariesRef: RefObject<Record<string, DictionaryData>>,
  dictionaryId: string
): void {
  if (!dictionariesRef.current[dictionaryId]) {
    const msg = `Dictionary '${dictionaryId}' does not exist`;
    toast.error(msg);
    throw new ValidationError(msg);
  }
}

// Byte-identical shape (message text only differs) hand-copied in the same 4 methods' `else`
// branch after a failed persistDictionaryMutation call.
function failSave(msg: string): never {
  toast.error(msg);
  throw new SaveError(msg);
}

/**
 * Owns all dictionary CRUD operations: add, update, delete, bulk-delete, move, bulk-move.
 *
 * Uses dictionariesRef.current for closed-over snapshots (React Concurrent Mode safe,
 * same pattern as useDictionaryHistory). All returned callbacks are stable.
 *
 * @param dictionariesRef - Ref-mirror of current dictionary state (owned by DictionaryProvider)
 * @param persistDictionaryMutation - Single-dict protocol: optimistic update → save → rollback
 * @param commitMoveOp - Two-dict protocol: optimistic update → parallel save → partial revert
 * @param addToHistory - Records operation for undo/redo (stable, from useDictionaryHistory)
 * @param invalidateEngine - Clears translation engine caches for a dictionary ID
 */
export function useDictionaryCRUD(
  dictionariesRef: RefObject<Record<string, DictionaryData>>,
  persistDictionaryMutation: PersistDictionaryMutation,
  commitMoveOp: CommitMoveOp,
  addToHistory: AddToHistory,
  invalidateEngine: InvalidateEngine
): DictionaryCRUDAPI {
  const addEntry = useCallback(
    async (
      dictionaryId: string,
      source: string,
      translation: string,
      metadata: DictionaryEntryMetadata = {}
    ): Promise<void> => {
      requireDictionaryExists(dictionariesRef, dictionaryId);

      try {
        const { cleanSource, targetValue } = prepareMutationEntry(
          dictionaryId,
          source,
          translation,
          metadata
        );

        // Compute from closed-over snapshot before setDictionaries (React Concurrent Mode safe)
        const oldData = { ...dictionariesRef.current[dictionaryId] };
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
          await invalidateEngine(dictionaryId);
        } else {
          failSave('Failed to save dictionary changes');
        }
      } catch (error) {
        logger.error('Error adding dictionary entry:', error);
        if (isValidationError(error)) {
          toast.error(error.message);
        } else if (!isSaveError(error)) {
          toast.error(`Could not add entry: ${extractErrorMessage(error)}`);
        }
        throw error;
      }
    },
    [addToHistory, persistDictionaryMutation, invalidateEngine]
  );

  const updateEntry = useCallback(
    async (
      dictionaryId: string,
      oldSource: string,
      newSource: string,
      translation: string,
      metadata: DictionaryEntryMetadata = {}
    ): Promise<void> => {
      requireDictionaryExists(dictionariesRef, dictionaryId);

      try {
        const { cleanSource: cleanNewSource, targetValue } = prepareMutationEntry(
          dictionaryId,
          newSource,
          translation,
          metadata
        );

        // Compute from closed-over snapshot before setDictionaries (React Concurrent Mode safe)
        const oldData = { ...dictionariesRef.current[dictionaryId] };
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
          await invalidateEngine(dictionaryId);
        } else {
          failSave('Failed to save dictionary changes');
        }
      } catch (error) {
        logger.error('Error updating dictionary entry:', error);
        if (isValidationError(error)) {
          toast.error(error.message);
        } else if (!isSaveError(error)) {
          toast.error(`Could not update entry: ${extractErrorMessage(error)}`);
        }
        throw error;
      }
    },
    [addToHistory, persistDictionaryMutation, invalidateEngine]
  );

  const deleteEntry = useCallback(
    async (dictionaryId: string, source: string): Promise<void> => {
      requireDictionaryExists(dictionariesRef, dictionaryId);

      try {
        // Compute from closed-over snapshot before setDictionaries (React Concurrent Mode safe)
        const oldData = { ...dictionariesRef.current[dictionaryId] };
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
          await invalidateEngine(dictionaryId);
        } else {
          failSave('Failed to delete dictionary entry');
        }
      } catch (error) {
        logger.error('Error deleting dictionary entry:', error);
        if (!isValidationError(error) && !isSaveError(error)) {
          toast.error(`Could not delete entry: ${extractErrorMessage(error)}`);
        }
        throw error;
      }
    },
    [addToHistory, persistDictionaryMutation, invalidateEngine]
  );

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
      requireDictionaryExists(dictionariesRef, dictionaryId);

      try {
        const oldData = { ...dictionariesRef.current[dictionaryId] };
        const updatedDictionary = { ...oldData };
        const deletedEntries: Array<{ source: string; value: string | DictionaryEntryValue }> = [];
        const errors: string[] = [];

        for (const source of sources) {
          if (updatedDictionary[source] !== undefined) {
            deletedEntries.push({ source, value: updatedDictionary[source] });
            delete updatedDictionary[source];
          } else {
            errors.push(`Entry "${source}" not found in dictionary`);
          }
        }

        // Incremental sort only handles one key at a time — use full sort for bulk (>1 entry).
        const sortAnchor =
          deletedEntries.length === 1 ? (deletedEntries[0]?.source ?? sources[0]) : null;
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
          await invalidateEngine(dictionaryId);
        } else {
          failSave('Failed to save dictionary after bulk delete');
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
    [addToHistory, persistDictionaryMutation, invalidateEngine]
  );

  const moveEntry = useCallback(
    async (
      sourceDictId: string,
      targetDictId: string,
      source: string,
      targetDictLabel: string
    ): Promise<void> => {
      const currentSourceDict = dictionariesRef.current[sourceDictId];
      const currentTargetDict = dictionariesRef.current[targetDictId];

      if (!currentSourceDict)
        throw new ValidationError(`Source dictionary '${sourceDictId}' does not exist`);
      if (!currentTargetDict)
        throw new ValidationError(`Target dictionary '${targetDictId}' does not exist`);
      if (!canMoveBetween(sourceDictId, targetDictId))
        throw new ValidationError(
          `Cannot move entries from '${sourceDictId}' to '${targetDictId}' — incompatible dictionary types`
        );

      const entryValue = currentSourceDict[source];
      if (entryValue === undefined)
        throw new ValidationError(`Entry '${source}' not found in source dictionary`);

      const updatedSourceDict = { ...currentSourceDict };
      delete updatedSourceDict[source];
      const sortedSourceDict = sortDictionaryEntries(updatedSourceDict, sourceDictId, source);
      const updatedTargetDict = { ...currentTargetDict, [source]: entryValue };
      const sortedTargetDict = sortDictionaryEntries(updatedTargetDict, targetDictId, source);

      const ok = await commitMoveOp({
        sourceDictId,
        oldSource: currentSourceDict,
        newSource: sortedSourceDict,
        targetDictId,
        oldTarget: currentTargetDict,
        newTarget: sortedTargetDict,
      });

      if (ok) {
        addToHistory({
          dictionaryId: sourceDictId,
          targetDictionaryId: targetDictId,
          operation: 'move',
          oldEntry: { source, value: entryValue as DictionaryEntryValue },
        });
        toast.success(`Entry moved to ${targetDictLabel}`);
        await invalidateEngine(sourceDictId);
        await invalidateEngine(targetDictId);
      } else {
        throw new SaveError('Failed to save dictionaries during move');
      }
    },
    [addToHistory, commitMoveOp, invalidateEngine]
  );

  const bulkMoveEntries = useCallback(
    async (
      sourceDictId: string,
      targetDictId: string,
      sources: string[],
      targetDictLabel: string
    ): Promise<{ movedCount: number; errors: string[] }> => {
      if (sources.length === 0) return { movedCount: 0, errors: [] };

      const currentSourceDict = dictionariesRef.current[sourceDictId];
      const currentTargetDict = dictionariesRef.current[targetDictId];

      if (!currentSourceDict)
        throw new ValidationError(`Source dictionary '${sourceDictId}' does not exist`);
      if (!currentTargetDict)
        throw new ValidationError(`Target dictionary '${targetDictId}' does not exist`);
      if (!canMoveBetween(sourceDictId, targetDictId))
        throw new ValidationError(
          `Cannot move entries from '${sourceDictId}' to '${targetDictId}' — incompatible dictionary types`
        );

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

      // Incremental sort only handles one key at a time — use full sort for bulk (>1 entry).
      const changedKey = movedEntries.length === 1 ? (movedEntries[0]?.source ?? sources[0]) : null;
      const sortedSourceDict = sortDictionaryEntries(updatedSourceDict, sourceDictId, changedKey);
      const sortedTargetDict = sortDictionaryEntries(updatedTargetDict, targetDictId, changedKey);

      const ok = await commitMoveOp({
        sourceDictId,
        oldSource: currentSourceDict,
        newSource: sortedSourceDict,
        targetDictId,
        oldTarget: currentTargetDict,
        newTarget: sortedTargetDict,
      });

      if (ok) {
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
        await invalidateEngine(sourceDictId);
        await invalidateEngine(targetDictId);
      } else {
        throw new SaveError('Failed to save dictionaries during bulk move');
      }

      return { movedCount: movedEntries.length, errors };
    },
    [addToHistory, commitMoveOp, invalidateEngine]
  );

  return { addEntry, updateEntry, deleteEntry, bulkDeleteEntries, moveEntry, bulkMoveEntries };
}
