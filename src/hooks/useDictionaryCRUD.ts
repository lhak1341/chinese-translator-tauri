import { useCallback } from 'react';
import toast from '../utils/toast';
import { logger } from '../utils/logger';
import { ValidationError, SaveError } from '../utils/errors';
import { entryFields, applyEntryPatch, buildEntryMetadata } from '../utils/dictionary';
import type { EntryFields, EntryPatch } from '../utils/dictionary';
import { planAdd, planUpdate, planDelete, planMove } from '../utils/dictionary/DictionaryEdit';
import type {
  Dictionaries,
  DictionaryEdit,
  EntryRef,
  PlanResult,
} from '../utils/dictionary/DictionaryEdit';
import type { EditCommitter } from '../components/dictionary/EditCommitter';
import {
  describeFreshFailure,
  describeOperationError,
} from '../components/dictionary/CommitFeedback';
import type { DictionaryEntryMetadata, DictionaryContextInterface } from '../types/DictionaryTypes';

type RecordEdit = (edit: DictionaryEdit) => void;

export type DictionaryCRUDAPI = Pick<
  DictionaryContextInterface,
  'addEntry' | 'updateEntry' | 'patchEntry' | 'renameEntry' | 'bulkDeleteEntries' | 'moveEntries'
>;

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

/** "1 entry", "3 entries". */
const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** An operation threw: log it, tell the user once, and rethrow for the caller. */
function fail(error: unknown, verb: string, logMessage: string): never {
  logger.error(logMessage, error);
  const feedback = describeOperationError(error, verb);
  if (feedback) toast[feedback.level](feedback.message);
  throw error;
}

/**
 * Owns all dictionary CRUD operations: add, update, patch, rename, delete and move
 * (the last two over a list of one or many entries). Each one plans a Dictionary Edit and commits it through the provider's
 * `EditCommitter` (GLOSSARY.md "Dictionary Edit"); this hook adds error typing
 * and the user-facing message. All returned callbacks are stable.
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
        const edit = await commitOrThrow(
          committer,
          record,
          (d) => planAdd(d, dictionaryId, source, translation, metadata),
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
        await commitOrThrow(
          committer,
          record,
          (d) => planUpdate(d, dictionaryId, oldSource, newSource, translation, metadata),
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
            return planUpdate(
              d,
              dictionaryId,
              source,
              source,
              next.translation,
              buildEntryMetadata(next)
            );
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
            return planUpdate(
              d,
              dictionaryId,
              oldSource,
              newSource,
              current.translation,
              buildEntryMetadata(current)
            );
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

  // One Dictionary Edit for the whole selection, however many dictionaries it spans, so one
  // undo restores it and a failed save rolls all of it back. Owns every message: the caller
  // toasts nothing.
  const bulkDeleteEntries = useCallback(
    async (targets: EntryRef[]): Promise<{ count: number; missing: EntryRef[] }> => {
      if (targets.length === 0) return { count: 0, missing: [] };
      try {
        const edit = await commitOrThrow(
          committer,
          record,
          (d) => planDelete(d, targets),
          'Failed to save dictionary after bulk delete'
        );
        const { count, missing } =
          edit.outcome.kind === 'deleted' ? edit.outcome : { count: 0, missing: [] };
        const total = count + missing.length;
        if (count === 0) {
          toast.warning(
            total === 1 ? 'The entry was not found' : `None of the ${total} entries were found`
          );
        } else if (missing.length > 0) {
          toast.warning(`Deleted ${count} of ${entries(total)}; ${missing.length} not found`);
        } else toast.success(`Deleted ${entries(count)}`);
        return { count, missing };
      } catch (error) {
        fail(error, 'bulk delete entries', 'Error bulk deleting entries:');
      }
    },
    [committer, record]
  );

  // One Dictionary Edit for one entry or many, so one undo restores it. Nothing found is an
  // invalid plan, which `MoveDialog`'s banner shows; some missing is a success with a warning
  // toast. A failure toasts nothing here (I4): the dialog owns that display.
  const moveEntries = useCallback(
    async (
      sourceDictId: string,
      targetDictId: string,
      sources: string[],
      targetDictLabel: string
    ): Promise<void> => {
      if (sources.length === 0) return;

      const edit = await commitOrThrow(
        committer,
        record,
        (d) => {
          const planned = planMove(d, sourceDictId, targetDictId, sources);
          if ('invalid' in planned || planned.outcome.kind !== 'moved') return planned;
          if (planned.outcome.count > 0) return planned;
          return {
            invalid:
              sources.length === 1
                ? `Entry '${sources[0]}' not found in source dictionary`
                : `None of the ${sources.length} entries were found in the source dictionary`,
          };
        },
        'Failed to save dictionaries during move',
        { quiet: true }
      );
      const { count, missing } =
        edit.outcome.kind === 'moved' ? edit.outcome : { count: 0, missing: [] };
      if (missing.length > 0) {
        toast.warning(
          `Moved ${count} of ${entries(count + missing.length)} to ${targetDictLabel}; ${missing.length} not found`
        );
      } else toast.success(`Moved ${entries(count)} to ${targetDictLabel}`);
    },
    [committer, record]
  );

  return {
    addEntry,
    updateEntry,
    patchEntry,
    renameEntry,
    bulkDeleteEntries,
    moveEntries,
  };
}
