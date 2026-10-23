/**
 * The Dictionary Store (GLOSSARY.md "Dictionary Store", ADR-055): the user dictionaries in
 * memory, the ones whose file failed to load, and the list of dictionaries that exist — with
 * one queue for every write to them.
 *
 * Every write is an operation on that queue: the startup load, a commit (CRUD, undo, redo),
 * a reload of one dictionary, a rename, a reload of all of them (force reload), and an import
 * (the files are rewritten and then every dictionary is re-read, in one turn). An operation starts only after the one before
 * it finished, so a reload never lands in the middle of a commit's save, and a commit always
 * plans against what the previous operation left.
 *
 * Before this, edits went through a queue (ADR-052) but reloads, removes and import wrote
 * the same state around it, and import reloaded only the selected dictionary — the next edit
 * to any other one saved its stale copy over the imported file.
 *
 * No React: the provider reads it through `useSyncExternalStore`, and tests run it against a
 * fake disk.
 */

import { sortDictionaryEntries } from '../../utils/dictionary';
import type { BatchLoadResult } from '../../utils/dictionary/DictionaryBackend';
import type {
  Dictionaries,
  DictionaryEdit,
  PlanResult,
} from '../../utils/dictionary/DictionaryEdit';
import type { DictionaryTypesCollection } from '../../types/ComponentTypes';
import type { DictionaryData } from '../../types/DictionaryTypes';
import type { DictionaryOperationResult } from '../../types/ElectronTypes';
import { classifyLoadResult } from '../../utils/dictionary/DictionaryLoadClassifier';
import type { LoadOutcome } from '../../utils/dictionary/DictionaryLoadClassifier';
import { extractErrorMessage } from '../../utils/errorHelpers';
import { logger } from '../../utils/logger';
import { commitEdit } from './EditCommitter';
import type { CommitResult, EditCommitter } from './EditCommitter';

export interface DictionarySnapshot {
  /** Every dictionary that loaded, sorted. An unread one is absent, never `{}` (ADR-053). */
  dictionaries: Dictionaries;
  /** Dictionaries whose file failed to load (GLOSSARY.md "Unread dictionary"). */
  unreadDictionaryIds: string[];
  /** Every dictionary that exists, with its label — what the dropdowns list. */
  dictionaryTypes: DictionaryTypesCollection;
  /**
   * How the last full load went — startup, force reload or an import's re-read — or `null`
   * before the first. A load that threw is `critical`. Reloading or renaming one dictionary
   * leaves it alone: `unreadDictionaryIds` already says which one failed.
   */
  lastLoad: LoadOutcome | null;
}

export interface DictionaryStoreDeps {
  /** Every dictionary that exists (`getDictionaryTypes`). */
  listDictionaries: () => Promise<DictionaryTypesCollection>;
  /** The load protocol (`loadAllDictionaries`, ADR-014). */
  load: (dictionaryIds: string[]) => Promise<BatchLoadResult>;
  save: (dictionaryId: string, entries: DictionaryData) => Promise<{ success: boolean }>;
  /** Asks for a file and rewrites every dictionary file from it (`importDictionaries`). */
  importFiles: () => Promise<DictionaryOperationResult>;
}

export interface LoadAllOptions {
  /** Runs inside the operation's turn, after memory holds the result — import clears
   * history here, so no undo queued before it can run after it. */
  onApplied?: () => void;
}

/** What an import did. `reload-failed`: the files were rewritten but memory could not be re-read. */
export type ImportOutcome =
  | { status: 'imported'; message?: string }
  | { status: 'reload-failed'; message?: string }
  | { status: 'failed'; error?: string };

export interface LoadAllResult {
  /** Ids that failed to load; each is now unread. */
  stillFailedIds: string[];
  /** Ids the load asked for. */
  total: number;
  /** The dictionaries in memory once the operation finished. */
  dictionaries: Dictionaries;
  /** The load classified, as `lastLoad` now holds it. */
  outcome: LoadOutcome;
}

/** A proper-nouns dictionary renamed on disk: memory drops `from` and loads `to`. */
export type DictionaryRename = readonly [from: string, to: string];

export interface DictionaryStore extends EditCommitter {
  getSnapshot: () => DictionarySnapshot;
  subscribe: (listener: () => void) => () => void;
  /** Lists and loads every dictionary, replacing memory with what is on disk. */
  loadAll: (options?: LoadAllOptions) => Promise<LoadAllResult>;
  /**
   * Imports dictionary files and re-reads every dictionary, as one operation: no edit can save
   * between the files being rewritten and memory being replaced, so none saves a stale copy
   * over the import. `onApplied` runs inside the
   * turn once memory holds the result (import clears history there). Never rejects.
   */
  importAll: (onApplied?: () => void) => Promise<ImportOutcome>;
  /**
   * Reads one dictionary from disk. A clean read replaces memory and lifts an unread mark; a
   * failed one drops the in-memory copy and marks it unread, so nothing saves over the file
   * (ADR-053). A dictionary not listed yet — one just created — is listed. History is kept:
   * an undo whose keys the reload changed is refused like any other stale undo.
   */
  reload: (dictionaryId: string) => Promise<void>;
  /** Applies renames Rust already made on disk, in one turn: loads each new id, drops each
   * old one, and lists the result. */
  rename: (renames: readonly DictionaryRename[], onApplied?: () => void) => Promise<void>;
}

function sorted(data: DictionaryData): DictionaryData {
  return Object.keys(data).length > 0 ? sortDictionaryEntries(data) : data;
}

function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  if (!(id in record)) return record;
  const next = { ...record };
  delete next[id];
  return next;
}

export function createDictionaryStore(deps: DictionaryStoreDeps): DictionaryStore {
  let snapshot: DictionarySnapshot = {
    dictionaries: {},
    unreadDictionaryIds: [],
    dictionaryTypes: {},
    lastLoad: null,
  };
  const listeners = new Set<() => void>();
  let tail: Promise<unknown> = Promise.resolve();

  function set(next: Partial<DictionarySnapshot>): void {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }

  /** Runs `op` after every operation queued before it has finished. */
  function enqueue<T>(op: () => Promise<T>): Promise<T> {
    const result = tail.then(op);
    tail = result.catch(() => undefined);
    return result;
  }

  /** Puts one load's outcome for `id` into memory. */
  function applyLoad(id: string, { loadedDictionaries, stillFailedIds }: BatchLoadResult): void {
    const data = loadedDictionaries[id];
    if (stillFailedIds.includes(id) || !data) {
      logger.error(`Failed to reload dictionary ${id}; it is unread until it loads`);
      const unread = snapshot.unreadDictionaryIds;
      set({
        dictionaries: without(snapshot.dictionaries, id),
        unreadDictionaryIds: unread.includes(id) ? unread : [...unread, id],
      });
      return;
    }
    set({
      dictionaries: { ...snapshot.dictionaries, [id]: sorted(data) },
      unreadDictionaryIds: snapshot.unreadDictionaryIds.filter((u) => u !== id),
    });
  }

  const commitDeps = {
    read: () => snapshot.dictionaries,
    write: (updates: Dictionaries) =>
      set({ dictionaries: { ...snapshot.dictionaries, ...updates } }),
    save: deps.save,
    isUnread: (id: string) => snapshot.unreadDictionaryIds.includes(id),
  };

  /** The body of `loadAll`, for an operation that is already in its turn. */
  async function loadAllNow({ onApplied }: LoadAllOptions = {}): Promise<LoadAllResult> {
    let dictionaryTypes: DictionaryTypesCollection;
    let batch: BatchLoadResult;
    try {
      dictionaryTypes = await deps.listDictionaries();
      batch = await deps.load(Object.keys(dictionaryTypes));
    } catch (error) {
      set({
        lastLoad: {
          severity: 'critical',
          message: `Failed to load dictionaries: ${extractErrorMessage(error)}`,
        },
      });
      throw error;
    }
    const { loadedDictionaries, stillFailedIds, total } = batch;
    const dictionaries: Dictionaries = {};
    for (const [id, data] of Object.entries(loadedDictionaries)) {
      if (!stillFailedIds.includes(id)) dictionaries[id] = sorted(data);
    }
    const outcome = classifyLoadResult(stillFailedIds, total);
    set({ dictionaries, unreadDictionaryIds: stillFailedIds, dictionaryTypes, lastLoad: outcome });
    onApplied?.();
    return { stillFailedIds, total, dictionaries, outcome };
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    commit(
      plan: (dicts: Dictionaries) => PlanResult,
      onCommitted?: (edit: DictionaryEdit) => void
    ): Promise<CommitResult> {
      return enqueue(() => commitEdit(commitDeps, plan, onCommitted));
    },

    loadAll(options) {
      return enqueue(() => loadAllNow(options));
    },

    importAll(onApplied) {
      return enqueue(async (): Promise<ImportOutcome> => {
        let result: DictionaryOperationResult;
        try {
          result = await deps.importFiles();
        } catch (error) {
          logger.error('Error importing dictionaries:', error);
          return { status: 'failed', error: (error as Error).message };
        }
        if (!result.success) return { status: 'failed', error: result.error };
        try {
          await loadAllNow({ onApplied });
        } catch (error) {
          logger.error('Failed to reload dictionaries after import:', error);
          return { status: 'reload-failed', message: result.message };
        }
        return { status: 'imported', message: result.message };
      });
    },

    reload(dictionaryId) {
      return enqueue(async () => {
        try {
          applyLoad(dictionaryId, await deps.load([dictionaryId]));
          if (!(dictionaryId in snapshot.dictionaryTypes)) {
            set({ dictionaryTypes: await deps.listDictionaries() });
          }
        } catch (error) {
          logger.error(`Error loading dictionary ${dictionaryId}:`, error);
        }
      });
    },

    rename(renames, onApplied) {
      return enqueue(async () => {
        for (const [from, to] of renames) {
          try {
            applyLoad(to, await deps.load([to]));
          } catch (error) {
            logger.error(`Error loading renamed dictionary ${to}:`, error);
          }
          set({
            dictionaries: without(snapshot.dictionaries, from),
            unreadDictionaryIds: snapshot.unreadDictionaryIds.filter((u) => u !== from),
          });
        }
        set({ dictionaryTypes: await deps.listDictionaries() });
        onApplied?.();
      });
    },
  };
}
