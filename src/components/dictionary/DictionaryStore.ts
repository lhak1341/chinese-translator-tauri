/**
 * The Dictionary Store (CONTEXT.md "Dictionary Store", ADR-055): the user dictionaries in
 * memory, the ones whose file failed to load, and the list of dictionaries that exist — with
 * one queue for every write to them.
 *
 * Every write is an operation on that queue: the startup load, a commit (CRUD, undo, redo),
 * a reload of one dictionary, a rename, a reload of all of them (force reload), and a reload
 * after files changed outside the app (import). An operation starts only after the one before
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
import { logger } from '../../utils/logger';
import { commitEdit } from './EditCommitter';
import type { CommitResult, EditCommitter } from './EditCommitter';

export interface DictionarySnapshot {
  /** Every dictionary that loaded, sorted. An unread one is absent, never `{}` (ADR-053). */
  dictionaries: Dictionaries;
  /** Dictionaries whose file failed to load (CONTEXT.md "Unread dictionary"). */
  unreadDictionaryIds: string[];
  /** Every dictionary that exists, with its label — what the dropdowns list. */
  dictionaryTypes: DictionaryTypesCollection;
}

export interface DictionaryStoreDeps {
  /** Every dictionary that exists (`getDictionaryTypes`). */
  listDictionaries: () => Promise<DictionaryTypesCollection>;
  /** The load protocol (`loadAllDictionaries`, ADR-014). */
  load: (dictionaryIds: string[]) => Promise<BatchLoadResult>;
  save: (dictionaryId: string, entries: DictionaryData) => Promise<{ success: boolean }>;
  /** Clears the engine's caches for one dictionary. */
  invalidate: (dictionaryId: string) => Promise<void>;
}

export interface LoadAllOptions {
  /** Invalidate the engine for every dictionary. Off for the startup load and force reload,
   * which build a new engine from the result instead. */
  invalidate?: boolean;
  /** Runs inside the operation's turn, after memory holds the result — import clears
   * history here, so no undo queued before it can run after it. */
  onApplied?: () => void;
}

export interface LoadAllResult {
  /** Ids that failed to load; each is now unread. */
  stillFailedIds: string[];
  /** Ids the load asked for. */
  total: number;
  /** The dictionaries in memory once the operation finished. */
  dictionaries: Dictionaries;
}

/** A proper-nouns dictionary renamed on disk: memory drops `from` and loads `to`. */
export type DictionaryRename = readonly [from: string, to: string];

export interface DictionaryStore extends EditCommitter {
  getSnapshot: () => DictionarySnapshot;
  subscribe: (listener: () => void) => () => void;
  /** Lists and loads every dictionary, replacing memory with what is on disk. */
  loadAll: (options?: LoadAllOptions) => Promise<LoadAllResult>;
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

function sorted(dictionaryId: string, data: DictionaryData): DictionaryData {
  return Object.keys(data).length > 0 ? sortDictionaryEntries(data, dictionaryId) : data;
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

  /** Puts one load's outcome for `id` into memory. Returns whether it read cleanly. */
  function applyLoad(id: string, { loadedDictionaries, stillFailedIds }: BatchLoadResult): boolean {
    const data = loadedDictionaries[id];
    if (stillFailedIds.includes(id) || !data) {
      logger.error(`Failed to reload dictionary ${id}; it is unread until it loads`);
      const unread = snapshot.unreadDictionaryIds;
      set({
        dictionaries: without(snapshot.dictionaries, id),
        unreadDictionaryIds: unread.includes(id) ? unread : [...unread, id],
      });
      return false;
    }
    set({
      dictionaries: { ...snapshot.dictionaries, [id]: sorted(id, data) },
      unreadDictionaryIds: snapshot.unreadDictionaryIds.filter((u) => u !== id),
    });
    return true;
  }

  const commitDeps = {
    read: () => snapshot.dictionaries,
    write: (updates: Dictionaries) =>
      set({ dictionaries: { ...snapshot.dictionaries, ...updates } }),
    save: deps.save,
    invalidate: deps.invalidate,
    isUnread: (id: string) => snapshot.unreadDictionaryIds.includes(id),
  };

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

    loadAll({ invalidate = false, onApplied }: LoadAllOptions = {}) {
      return enqueue(async () => {
        const dictionaryTypes = await deps.listDictionaries();
        const ids = Object.keys(dictionaryTypes);
        const { loadedDictionaries, stillFailedIds, total } = await deps.load(ids);
        const dictionaries: Dictionaries = {};
        for (const [id, data] of Object.entries(loadedDictionaries)) {
          if (!stillFailedIds.includes(id)) dictionaries[id] = sorted(id, data);
        }
        set({ dictionaries, unreadDictionaryIds: stillFailedIds, dictionaryTypes });
        onApplied?.();
        if (invalidate) for (const id of Object.keys(dictionaries)) await deps.invalidate(id);
        return { stillFailedIds, total, dictionaries };
      });
    },

    reload(dictionaryId) {
      return enqueue(async () => {
        try {
          const readCleanly = applyLoad(dictionaryId, await deps.load([dictionaryId]));
          if (!(dictionaryId in snapshot.dictionaryTypes)) {
            set({ dictionaryTypes: await deps.listDictionaries() });
          }
          if (readCleanly) await deps.invalidate(dictionaryId);
        } catch (error) {
          logger.error(`Error loading dictionary ${dictionaryId}:`, error);
        }
      });
    },

    rename(renames, onApplied) {
      return enqueue(async () => {
        const loaded: string[] = [];
        for (const [from, to] of renames) {
          try {
            if (applyLoad(to, await deps.load([to]))) loaded.push(to);
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
        for (const id of loaded) await deps.invalidate(id);
      });
    },
  };
}
