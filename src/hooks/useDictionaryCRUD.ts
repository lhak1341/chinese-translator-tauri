import { useCallback } from 'react';
import toast from '../utils/toast';
import { validatePersistEntry } from '../utils/dictionary/PersistTimeValidator';
import { logger } from '../utils/logger';
import { ValidationError, SaveError } from '../utils/errors';
import {
  isLookupTableDict,
  sanitizeDictionaryEntry,
  entryFields,
  applyEntryPatch,
  buildEntryMetadata,
} from '../utils/dictionary';
import type { EntryFields, EntryPatch } from '../utils/dictionary';
import { planAdd, planUpdate, planDelete, planMove } from '../utils/dictionary/DictionaryEdit';
import type { Dictionaries, DictionaryEdit, PlanResult } from '../utils/dictionary/DictionaryEdit';
import type { EditCommitter } from '../components/dictionary/EditCommitter';
import {
  describeFreshFailure,
  describeOperationError,
} from '../components/dictionary/CommitFeedback';
import type {
  DictionaryEntryValue,
  DictionaryEntryMetadata,
  DictionaryContextInterface,
} from '../types/DictionaryTypes';

type RecordEdit = (edit: DictionaryEdit) => void;

export type DictionaryCRUDAPI = Pick<
  DictionaryContextInterface,
  | 'addEntry'
  | 'updateEntry'
  | 'patchEntry'
  | 'renameEntry'
  | 'deleteEntry'
  | 'bulkDeleteEntries'
  | 'moveEntry'
  | 'bulkMoveEntries'
>;

// Sanitizes, validates, and builds the typed entry value for addEntry/updateEntry/patchEntry.
// Throws ValidationError (no toast — caller's catch block handles UI feedback).
function prepareMutationEntry(
  dictionaryId: string,
  source: string,
  translation: string,
  metadata: DictionaryEntryMetadata
): { cleanSource: string; targetValue: string | DictionaryEntryValue } {
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

  return { cleanSource, targetValue };
}

/**
 * Commits a plan, recording it in history on success. Turns every other outcome into a typed
 * throw: an invalid plan is a `ValidationError` (never toasted here — the caller's `fail`
 * shows it), a failed save a `SaveError` (toasted here unless `quiet`, since `fail` skips it).
 * Move ops pass `quiet` — `MoveDialog` owns their error display.
 */
async function commitOrThrow(
  committer: EditCommitter,
  record: RecordEdit,
  plan: (dicts: Dictionaries) => PlanResult,
  failMessage: string,
  { quiet = false }: { quiet?: boolean } = {}
): Promise<DictionaryEdit> {
  const result = await committer.commit(plan, record);
  if (result.status === 'ok') return result.edit;
  if (result.status === 'invalid') throw new ValidationError(result.reason);
  // A `refused` outcome of a fresh plan is unreachable short of a bug (it reads the values it
  // replaces from the same dictionaries it is checked against); fail loudly, not silently.
  const { toast: feedback, errorMessage } = describeFreshFailure(result, failMessage);
  if (!quiet) toast.error(feedback.message);
  throw new SaveError(errorMessage);
}

/** An operation threw: log it, tell the user once, and rethrow for the caller. */
function fail(error: unknown, verb: string, logMessage: string): never {
  logger.error(logMessage, error);
  const feedback = describeOperationError(error, verb);
  if (feedback) toast[feedback.level](feedback.message);
  throw error;
}

/**
 * Owns all dictionary CRUD operations: add, update, patch, delete, bulk-delete, move,
 * bulk-move. Each one plans a Dictionary Edit and commits it through the provider's
 * `EditCommitter` (CONTEXT.md "Dictionary Edit"); this hook adds input clean-up, error
 * typing and the user-facing message. All returned callbacks are stable.
 *
 * @param committer - The provider's EditCommitter (stable)
 * @param record - Records a committed edit for undo (stable, from useDictionaryHistory)
 */
export function useDictionaryCRUD(committer: EditCommitter, record: RecordEdit): DictionaryCRUDAPI {
  const addEntry = useCallback(
    async (
      dictionaryId: string,
      source: string,
      translation: string,
      metadata: DictionaryEntryMetadata = {}
    ): Promise<void> => {
      try {
        const { cleanSource, targetValue } = prepareMutationEntry(
          dictionaryId,
          source,
          translation,
          metadata
        );
        const edit = await commitOrThrow(
          committer,
          record,
          (d) => planAdd(d, dictionaryId, cleanSource, targetValue),
          'Failed to save dictionary changes'
        );
        if (edit.outcome.kind === 'overwritten') {
          toast.warning('Existing entry overwritten');
        } else {
          toast.success('Entry added successfully');
        }
      } catch (error) {
        fail(error, 'add entry', 'Error adding dictionary entry:');
      }
    },
    [committer, record]
  );

  const updateEntry = useCallback(
    async (
      dictionaryId: string,
      oldSource: string,
      newSource: string,
      translation: string,
      metadata: DictionaryEntryMetadata = {}
    ): Promise<void> => {
      try {
        const { cleanSource, targetValue } = prepareMutationEntry(
          dictionaryId,
          newSource,
          translation,
          metadata
        );
        await commitOrThrow(
          committer,
          record,
          (d) => planUpdate(d, dictionaryId, oldSource, cleanSource, targetValue),
          'Failed to save dictionary changes'
        );
        toast.success('Entry updated successfully');
      } catch (error) {
        fail(error, 'update entry', 'Error updating dictionary entry:');
      }
    },
    [committer, record]
  );

  // The value every field edit starts from is read inside the commit's turn, from the
  // dictionaries as they are then — not from the caller's props, which may lag the store.
  const patchEntry = useCallback(
    async (
      dictionaryId: string,
      source: string,
      patch: EntryPatch | ((current: EntryFields) => EntryPatch)
    ): Promise<void> => {
      try {
        await commitOrThrow(
          committer,
          record,
          (d) => {
            const value = d[dictionaryId]?.[source];
            if (value === undefined) {
              return { invalid: `Entry '${source}' does not exist in '${dictionaryId}'` };
            }
            const current = entryFields(value);
            const next = applyEntryPatch(
              current,
              typeof patch === 'function' ? patch(current) : patch
            );
            const { targetValue } = prepareMutationEntry(
              dictionaryId,
              source,
              next.translation,
              buildEntryMetadata(next)
            );
            return planUpdate(d, dictionaryId, source, source, targetValue);
          },
          'Failed to save dictionary changes'
        );
        toast.success('Entry updated successfully');
      } catch (error) {
        fail(error, 'update entry', 'Error updating dictionary entry:');
      }
    },
    [committer, record]
  );

  // A source rename keeps every other field as it is stored when the commit runs — like
  // patchEntry, and unlike updateEntry, whose caller supplies the value. A row that built the
  // value from its props could write back a field a patch queued just before had changed.
  const renameEntry = useCallback(
    async (dictionaryId: string, oldSource: string, newSource: string): Promise<void> => {
      try {
        await commitOrThrow(
          committer,
          record,
          (d) => {
            const value = d[dictionaryId]?.[oldSource];
            if (value === undefined) {
              return { invalid: `Entry '${oldSource}' does not exist in '${dictionaryId}'` };
            }
            const current = entryFields(value);
            const { cleanSource, targetValue } = prepareMutationEntry(
              dictionaryId,
              newSource,
              current.translation,
              buildEntryMetadata(current)
            );
            return planUpdate(d, dictionaryId, oldSource, cleanSource, targetValue);
          },
          'Failed to save dictionary changes'
        );
        toast.success('Entry updated successfully');
      } catch (error) {
        fail(error, 'rename entry', 'Error renaming dictionary entry:');
      }
    },
    [committer, record]
  );

  const deleteEntry = useCallback(
    async (dictionaryId: string, source: string): Promise<void> => {
      try {
        const edit = await commitOrThrow(
          committer,
          record,
          (d) => planDelete(d, dictionaryId, [source]),
          'Failed to delete dictionary entry'
        );
        if (edit.outcome.kind === 'deleted' && edit.outcome.count === 0) {
          throw new ValidationError(
            `Entry '${source}' not found in dictionary`,
            undefined,
            undefined,
            'warning'
          );
        }
        toast.success('Entry deleted successfully');
      } catch (error) {
        fail(error, 'delete entry', 'Error deleting dictionary entry:');
      }
    },
    [committer, record]
  );

  const bulkDeleteEntries = useCallback(
    async (
      dictionaryId: string,
      sources: string[]
    ): Promise<{ successCount: number; errors: string[] }> => {
      if (sources.length === 0) {
        return { successCount: 0, errors: [] };
      }
      try {
        const edit = await commitOrThrow(
          committer,
          record,
          (d) => planDelete(d, dictionaryId, sources),
          'Failed to save dictionary after bulk delete'
        );
        const { count, missing } =
          edit.outcome.kind === 'deleted' ? edit.outcome : { count: 0, missing: [] };
        return {
          successCount: count,
          errors: missing.map((s) => `Entry "${s}" not found in dictionary`),
        };
      } catch (error) {
        fail(error, 'bulk delete entries', 'Error bulk deleting entries:');
      }
    },
    [committer, record]
  );

  const moveEntry = useCallback(
    async (
      sourceDictId: string,
      targetDictId: string,
      source: string,
      targetDictLabel: string
    ): Promise<void> => {
      const edit = await commitOrThrow(
        committer,
        record,
        (d) => {
          const planned = planMove(d, sourceDictId, targetDictId, [source]);
          if ('invalid' in planned || planned.outcome.kind !== 'moved') return planned;
          return planned.outcome.count === 0
            ? { invalid: `Entry '${source}' not found in source dictionary` }
            : planned;
        },
        'Failed to save dictionaries during move',
        { quiet: true }
      );
      if (edit.changes.length > 0) toast.success(`Entry moved to ${targetDictLabel}`);
    },
    [committer, record]
  );

  const bulkMoveEntries = useCallback(
    async (
      sourceDictId: string,
      targetDictId: string,
      sources: string[],
      targetDictLabel: string
    ): Promise<{ movedCount: number; errors: string[] }> => {
      if (sources.length === 0) return { movedCount: 0, errors: [] };

      const edit = await commitOrThrow(
        committer,
        record,
        (d) => planMove(d, sourceDictId, targetDictId, sources),
        'Failed to save dictionaries during bulk move',
        { quiet: true }
      );
      const { count, missing } =
        edit.outcome.kind === 'moved' ? edit.outcome : { count: 0, missing: [] };
      toast.success(`Moved ${count} ${count === 1 ? 'entry' : 'entries'} to ${targetDictLabel}`);
      return { movedCount: count, errors: missing.map((s) => `Entry "${s}" not found`) };
    },
    [committer, record]
  );

  return {
    addEntry,
    updateEntry,
    patchEntry,
    renameEntry,
    deleteEntry,
    bulkDeleteEntries,
    moveEntry,
    bulkMoveEntries,
  };
}
