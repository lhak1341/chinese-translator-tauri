/**
 * Commits Dictionary Edits (CONTEXT.md "Dictionary Edit", ADR-052): the one save protocol for
 * every change to user dictionaries — CRUD, undo and redo alike.
 *
 * All commits run through one queue. A commit plans against the dictionaries as the previous
 * commit left them, refuses if any key it would replace has changed since the edit was
 * planned, applies to memory first, saves each touched dictionary, and on a failed save rolls
 * memory back and writes the old contents back to every dictionary that did save.
 *
 * No React: the provider supplies the dependencies, so tests run it against a fake disk.
 */

import { sortDictionaryEntries } from '../../utils/dictionary';
import {
  applyEdit,
  changedKeys,
  isInvalidPlan,
  touchedDictionaries,
} from '../../utils/dictionary/DictionaryEdit';
import type {
  Dictionaries,
  DictionaryEdit,
  EntryChange,
  PlanResult,
} from '../../utils/dictionary/DictionaryEdit';
import { logger } from '../../utils/logger';
import { unreadFileError } from '../../utils/appFile';
import type { DictionaryData } from '../../types/DictionaryTypes';

export type CommitResult =
  | { status: 'ok'; edit: DictionaryEdit }
  | { status: 'invalid'; reason: string }
  | { status: 'refused'; changedKeys: string[] }
  /** `rolledBack: false` = a write-back also failed, so disk may hold a half-applied edit. */
  | { status: 'saveFailed'; rolledBack: boolean };

export interface EditCommitterDeps {
  /** The latest dictionaries. Must reflect `write` immediately, not after a re-render. */
  read: () => Dictionaries;
  /** Replaces the given dictionaries in memory, leaving the others alone. */
  write: (updates: Dictionaries) => void;
  save: (dictionaryId: string, entries: DictionaryData) => Promise<{ success: boolean }>;
  invalidate: (dictionaryId: string) => Promise<void>;
  /** True for a dictionary whose file failed to load (CONTEXT.md "Unread dictionary"). It is
   * absent from `read()`, so plans already refuse it; this only names the reason. */
  isUnread?: (dictionaryId: string) => boolean;
}

export interface EditCommitter {
  /**
   * Plans against the current dictionaries at this commit's turn in the queue, then commits.
   * `onCommitted` runs inside the turn, after the save and before the next commit plans —
   * history uses it so its cursor never lags the dictionaries.
   */
  commit: (
    plan: (dicts: Dictionaries) => PlanResult,
    onCommitted?: (edit: DictionaryEdit) => void
  ) => Promise<CommitResult>;
}

/** The incremental sorter repositions one key (plus a renamed-away one); anything more gets a
 * full sort — a hint on a bulk change drops entries (dictionary/CLAUDE.md). */
function sortHint(changes: EntryChange[]): [string | null, string | null] {
  if (changes.length === 1) return [changes[0].key, null];
  if (changes.length === 2) {
    const removed = changes.find((c) => c.after === undefined);
    const written = changes.find((c) => c.after !== undefined);
    if (removed && written) return [written.key, removed.key];
  }
  return [null, null];
}

async function trySave(
  save: EditCommitterDeps['save'],
  dictionaryId: string,
  entries: DictionaryData
): Promise<boolean> {
  try {
    return (await save(dictionaryId, entries)).success;
  } catch (error) {
    logger.error(`Failed to save dictionary ${dictionaryId}:`, error);
    return false;
  }
}

export function createEditCommitter(deps: EditCommitterDeps): EditCommitter {
  let tail: Promise<unknown> = Promise.resolve();

  async function run(
    plan: (dicts: Dictionaries) => PlanResult,
    onCommitted?: (edit: DictionaryEdit) => void
  ): Promise<CommitResult> {
    const dicts = deps.read();
    const planned = plan(dicts);
    if (isInvalidPlan(planned)) {
      const id = planned.missingDictionaryId;
      const reason =
        id !== undefined && deps.isUnread?.(id)
          ? unreadFileError(`${id}.json`).message
          : planned.invalid;
      return { status: 'invalid', reason };
    }

    const changed = changedKeys(planned, dicts);
    if (changed.length > 0) return { status: 'refused', changedKeys: changed };
    if (planned.changes.length === 0) return { status: 'ok', edit: planned };

    const ids = touchedDictionaries(planned);
    const applied = applyEdit(dicts, planned);
    const next: Dictionaries = {};
    for (const id of ids) {
      const [changedKey, oldKey] = sortHint(planned.changes.filter((c) => c.dictionaryId === id));
      next[id] = sortDictionaryEntries(applied[id], id, changedKey, oldKey);
    }
    const previous: Dictionaries = Object.fromEntries(ids.map((id) => [id, dicts[id]]));

    deps.write(next);
    const saved = await Promise.all(ids.map((id) => trySave(deps.save, id, next[id])));

    if (saved.every(Boolean)) {
      onCommitted?.(planned);
      for (const id of ids) await deps.invalidate(id);
      return { status: 'ok', edit: planned };
    }

    deps.write(previous);
    const writtenBack = await Promise.all(
      ids.map((id, i) => (saved[i] ? trySave(deps.save, id, previous[id]) : true))
    );
    const rolledBack = writtenBack.every(Boolean);
    if (!rolledBack) {
      logger.error(
        `Dictionary edit half-applied on disk: could not restore ${ids
          .filter((_, i) => !writtenBack[i])
          .join(', ')}`
      );
    }
    return { status: 'saveFailed', rolledBack };
  }

  return {
    commit(plan, onCommitted) {
      const result = tail.then(() => run(plan, onCommitted));
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
