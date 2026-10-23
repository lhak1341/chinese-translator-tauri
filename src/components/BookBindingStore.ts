import type { BookBinding } from '../types/ReaderTypes';
import type { DictionaryCreateResult } from '../types/ElectronTypes';
import type { EngineInitOutcome } from './EngineContext';
import { loadAppConfig, transformAppConfig, type AppConfig } from '../utils/appConfig';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import {
  isFictionProperNounsId,
  otherPairedTierId,
  tierOf,
} from '../utils/dictionary/DictionaryIdClassifier';
import {
  activeListChange,
  bindingConfigChange,
  dictionaryInUse,
  quickAddViewForBinding,
  type BindingConfigChange,
} from '../utils/reader/BindingActivation';
import { toFictionDictionaryId } from '../utils/reader/FictionDictionarySuggestion';
import { loadQuickAddConfig, type QuickAddView } from '../utils/dictionary/QuickAddTarget';

/** What renaming a dictionary did. `filesMoved` with `success: false` means a fiction pair
 * was renamed but the book records could not be updated to match. */
export interface DictionaryRenameResult {
  success: boolean;
  error?: string;
  filesMoved: boolean;
}

/** What moving a dictionary between the fiction and generic tiers did. `newId` is the
 * dictionary's id after the move; `null` when the id has no other tier. */
export interface TierMoveResult extends DictionaryRenameResult {
  newId: string | null;
}

/** The book the reader currently has open, as far as binding is concerned. */
export interface OpenBookIdentity {
  fingerprint: string;
  fileName: string;
  title: string;
}

/** Replaced, never mutated, on every change. */
export interface BookBindingSnapshot {
  openBook: OpenBookIdentity | null;
  /** The open book's recorded answer. `null` means never answered, which is what puts the
   * offer on screen. See `BookBinding`. */
  binding: BookBinding | null;
  /** The dictionary the open book's record names but that no longer exists on disk. */
  missingFictionDictionary: string | null;
  isApplying: boolean;
  /** The last operation's failure, for the dialog. */
  error: string | null;
  /** Set only when *applying* an answer failed — the config write or the engine rebuild. */
  applyError: string | null;
}

/** Everything the store reaches outside itself except config, which it reads and writes
 * through `appConfig` (tests fake its IPC with `installFakeConfigDisk`). */
export interface BookBindingDeps {
  /** Every proper-nouns dictionary id on disk. Read only to check that a bound dictionary
   * still exists; the list the rest of the app shows is the Dictionary Store's. */
  listDictionaryIds: () => Promise<string[]>;
  setBookBinding: (fingerprint: string, binding: BookBinding) => Promise<void>;
  renameBoundDictionary: (oldId: string, newId: string) => Promise<void>;
  unbindDictionary: (dictionaryId: string) => Promise<void>;
  /** Create a proper-nouns dictionary (the pair, for fiction) and load every half. Creates
   * files only; activating it is the caller's (`bind` does for `createAndBind`). */
  createDictionaryFiles: (dictionaryId: string) => Promise<DictionaryCreateResult>;
  /** Rename a pair on disk and swap its halves in memory. */
  renameDictionary: (oldId: string, newId: string) => Promise<{ success: boolean; error?: string }>;
  /** The engine's `reinitializeEngine`: never rejects, reports a failed build as `ok: false`. */
  reinitializeEngine: (
    rawDictionaries: Record<string, unknown>,
    options: { forceConfigReload: boolean }
  ) => Promise<EngineInitOutcome>;
  /** The Dictionary Store's current map. */
  getDictionaries: () => Record<string, unknown>;
}

export interface BookBindingStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => BookBindingSnapshot;
  /** Applies the book's answer, or for a book with no answer yet "global dictionaries only". */
  announceOpenBook: (book: OpenBookIdentity, binding: BookBinding | null) => void;
  /** The book gives up authority over the fiction slice. Writes no config, rebuilds nothing. */
  announceClosedBook: () => void;
  /** Persist and apply an answer. Resolves `true` once both landed; on failure the reason is
   * in `error` and it resolves `false`. `false` also for no book open. */
  bind: (fictionDictionary: string | null) => Promise<boolean>;
  /** Create a fiction pair from a reader-typed name, then bind to it. Same result as `bind`. */
  createAndBind: (rawName: string) => Promise<boolean>;
  /** Create a proper-nouns dictionary (the pair, for fiction), load it and activate it,
   * binding nothing. With a book open the fiction slice stays the book's: an unbound fiction
   * dictionary is created but not activated. `warning` when it exists but could not be
   * activated. */
  createDictionary: (dictionaryId: string) => Promise<DictionaryCreateResult>;
  /** Rename a dictionary. A fiction pair's new name is also carried into every book bound to it. */
  renameDictionary: (oldId: string, newId: string) => Promise<DictionaryRenameResult>;
  moveDictionaryTier: (dictionaryId: string) => Promise<TierMoveResult>;
  /** The quick-add view every Add decides over. With a book open: config as its binding
   * implies it. With none: config as loaded. Reads the binding at call time. */
  loadQuickAddView: () => Promise<QuickAddView | null>;
}

/** `config` with a binding's change written in; `config` itself when nothing changed, which
 * a transform reads as "save nothing". */
function withBindingConfig(config: AppConfig, change: BindingConfigChange): AppConfig {
  if (!change.changed) return config;
  return {
    ...config,
    engine: { ...config.engine, activeProperNouns: change.activeProperNouns },
    ui: { ...config.ui, defaultQuickAddDictionary: change.defaultQuickAddDictionary },
  };
}

function bindingConfigFields(config: AppConfig) {
  return {
    activeProperNouns: config.engine.activeProperNouns,
    defaultQuickAddDictionary: config.ui.defaultQuickAddDictionary,
  };
}

/**
 * The open book's dictionary binding for the whole app (GLOSSARY.md "Dictionary Binding").
 *
 * It is not a Reader-local preference: while a book is open it is **authoritative for the
 * fiction slice of `activeProperNouns`**, which the Configuration tab renders and the
 * engine initializes from. A plain module for the same reason `DictionaryStore` is: its
 * correctness is ordering across async work — one queue for every operation, state that
 * several exits clear — and in a component that ordering is reachable only through a mounted
 * provider and timers. `BookBindingProvider` is the adapter over `useSyncExternalStore`.
 *
 * Applying a binding is the same operation as Engine Reinitialization, triggered
 * differently: write the active dictionaries, then rebuild. Nothing inside the engine
 * survives that, which is fine — every piece of Reader state that matters (scroll anchor,
 * position, outline) lives outside it by construction.
 */
export function createBookBindingStore(deps: BookBindingDeps): BookBindingStore {
  let snapshot: BookBindingSnapshot = {
    openBook: null,
    binding: null,
    missingFictionDictionary: null,
    isApplying: false,
    error: null,
    applyError: null,
  };
  const listeners = new Set<() => void>();

  function set(patch: Partial<BookBindingSnapshot>): void {
    const keys = Object.keys(patch) as (keyof BookBindingSnapshot)[];
    if (keys.every((key) => Object.is(snapshot[key], patch[key]))) return;
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  }

  /**
   * Rebuilds the engine after a config write. `forceConfigReload`, because the engine's
   * `activeProperNouns` comes from the config this store just wrote. The map is read now,
   * not captured earlier: a pair just loaded or renamed is in it before React re-renders.
   * Rejects when the build failed, which is how `applyError` and a tier move's failure learn.
   */
  async function rebuildEngine(): Promise<void> {
    const outcome = await deps.reinitializeEngine(deps.getDictionaries(), {
      forceConfigReload: true,
    });
    if (!outcome.ok) throw new Error(outcome.error);
  }

  // Serializes every operation. Opening a book and answering the dialog both do a
  // read-modify-write of `activeProperNouns` followed by an engine rebuild; overlapping them
  // would rebuild against a half-written config. Creating, renaming and moving a dictionary
  // pair rewrite the same config key on the Rust side, so they take the same queue — fiction
  // or not (ADR-062).
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  /** Whether a bound dictionary is still on disk. A failed listing trusts the record: it
   * says nothing about the dictionary, and blocking the apply on it would leave the previous
   * book's fiction dictionary active. */
  async function boundDictionaryExists(dictionaryId: string): Promise<boolean> {
    try {
      return (await deps.listDictionaryIds()).includes(dictionaryId);
    } catch (cause) {
      logger.warn(
        'Could not list dictionaries to check a binding; applying it as recorded:',
        cause
      );
      return true;
    }
  }

  /**
   * Write the config a binding implies and, when the engine's dictionary set actually
   * changed, rebuild.
   *
   * Both early returns matter. Reopening the book already open recomputes the same list,
   * and a rebuild there would throw away every cached translation on screen for no change at
   * all. A quick-add default that moved on its own is a config write with no engine
   * consequence — the engine never reads that key.
   */
  async function writeAnswer(bound: string | null): Promise<void> {
    // Decided against the config as it is when the write's turn comes, not as it was when
    // the open began: a toggle saved in between is otherwise overwritten.
    const activeChanged = await transformAppConfig((config) => {
      const change = bindingConfigChange(bindingConfigFields(config), { binding: { bound } });
      return { value: withBindingConfig(config, change), result: change.activeChanged };
    });
    if (!activeChanged) return;
    await rebuildEngine();
  }

  /** `writeAnswer`, recording whether the dictionaries actually switched — see
   * `applyError`. Rethrows, so each caller still reports the failure its own way. */
  async function applyAnswer(bound: string | null): Promise<void> {
    try {
      await writeAnswer(bound);
      set({ applyError: null });
    } catch (cause) {
      set({ applyError: extractErrorMessage(cause) });
      throw cause;
    }
  }

  /**
   * The tail every answer shares, in the order that matters: persist first, so a failed
   * write never leaves the engine applying an answer the record doesn't hold; then apply;
   * and only once both landed, clear the error.
   */
  async function persistAndApply(
    book: OpenBookIdentity,
    fictionDictionary: string | null
  ): Promise<void> {
    const next: BookBinding = { fictionDictionary };
    await deps.setBookBinding(book.fingerprint, next);
    set({ binding: next, missingFictionDictionary: null });
    await applyAnswer(fictionDictionary);
    set({ error: null });
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,

    announceOpenBook: (book, nextBinding) => {
      // The previous book's missing dictionary is not this one's; until the existence check
      // below answers, the binding is trusted as recorded.
      set({ openBook: book, binding: nextBinding, missingFictionDictionary: null });
      void enqueue(async () => {
        set({ isApplying: true });
        try {
          // An unanswered book applies `null` without persisting one: it reads right now
          // with global dictionaries only, and the offer stays on screen. Leaving the
          // previous book's fiction dictionary active instead is the silent
          // wrong-dictionary failure the whole feature exists to prevent.
          //
          // A bound dictionary that no longer exists is applied the same way, and named.
          // Checked against disk rather than the Dictionary Store's list, which may not
          // have loaded yet on the first open after launch.
          const bound = nextBinding?.fictionDictionary ?? null;
          const exists = bound === null || (await boundDictionaryExists(bound));
          set({ missingFictionDictionary: exists ? null : bound });
          await applyAnswer(exists ? bound : null);
          set({ error: null });
        } catch (cause) {
          logger.error('Failed to apply the book binding on open:', cause);
          set({ error: extractErrorMessage(cause) });
        } finally {
          set({ isApplying: false });
        }
      });
    },

    announceClosedBook: () => {
      set({ openBook: null, binding: null });
      // After any apply still queued for the closed book, so its outcome cannot land on a
      // shelf with no book to show it.
      void enqueue(async () => {
        if (snapshot.openBook) return; // a book was announced since; its state stands
        set({ missingFictionDictionary: null, error: null, applyError: null });
      });
    },

    bind: (fictionDictionary) =>
      enqueue(async () => {
        const book = snapshot.openBook;
        if (!book) return false;
        set({ isApplying: true });
        try {
          await persistAndApply(book, fictionDictionary);
          return true;
        } catch (cause) {
          logger.error('Failed to bind dictionaries to the book:', cause);
          set({ error: extractErrorMessage(cause) });
          return false;
        } finally {
          set({ isApplying: false });
        }
      }),

    createAndBind: (rawName) =>
      enqueue(async () => {
        const book = snapshot.openBook;
        if (!book) return false;
        // A name of only diacritics-stripped-to-nothing (e.g. Chinese characters) trims
        // non-empty but yields no slug — reject it here rather than letting Rust name a
        // file after it.
        const dictionaryId = toFictionDictionaryId(rawName);
        if (!dictionaryId) {
          set({ error: `"${rawName.trim()}" has no letters to name a dictionary after.` });
          return false;
        }
        set({ isApplying: true });
        try {
          const result = await deps.createDictionaryFiles(dictionaryId);
          if (!result.success) throw new Error(result.error ?? 'Failed to create the dictionary');
          await persistAndApply(book, dictionaryId);
          return true;
        } catch (cause) {
          logger.error('Failed to create and bind a fiction dictionary:', cause);
          set({ error: extractErrorMessage(cause) });
          return false;
        } finally {
          set({ isApplying: false });
        }
      }),

    createDictionary: (dictionaryId) =>
      enqueue(async () => {
        const result = await deps.createDictionaryFiles(dictionaryId);
        if (!result.success) return result;
        try {
          // Activating is a config write like a toggle's: decided against the config as it
          // is at its turn, and only the list changes (a quick-add default the reader set is
          // not this operation's to move). With a book open the fiction slice is its
          // binding's, so an unbound fiction dictionary does not join the list.
          await transformAppConfig((config) => {
            const { activeProperNouns, changed } = activeListChange(
              config.engine.activeProperNouns,
              {
                activate: dictionaryId,
                binding: snapshot.openBook
                  ? { bound: dictionaryInUse(snapshot.binding, snapshot.missingFictionDictionary) }
                  : undefined,
              }
            );
            return {
              value: changed
                ? { ...config, engine: { ...config.engine, activeProperNouns } }
                : config,
              result: undefined,
            };
          });
          return result;
        } catch (cause) {
          logger.error('Failed to activate a new dictionary:', cause);
          return {
            ...result,
            warning: `Created ${dictionaryId}, but it was not activated: ${extractErrorMessage(cause)}`,
          };
        }
      }),

    renameDictionary: (oldId, newId) =>
      enqueue(async () => {
        // The tier is part of the typed name, so a rename could otherwise promote a fiction
        // dictionary with its books still bound and no rebuild. Moving tiers is
        // `moveDictionaryTier`'s, which calls `deps.renameDictionary` directly.
        if (tierOf(oldId) !== tierOf(newId)) {
          return {
            success: false,
            error:
              "A rename keeps the dictionary's tier (fiction f_, generic _, custom no prefix). " +
              'To move between fiction and generic, right-click the row.',
            filesMoved: false,
          };
        }
        // Moves both files and brings the in-memory dictionaries along.
        const result = await deps.renameDictionary(oldId, newId);
        if (!result.success) return { success: false, error: result.error, filesMoved: false };
        // Only a fiction dictionary is bound to books; nothing else names it.
        if (!isFictionProperNounsId(oldId)) return { success: true, filesMoved: true };

        // Rust has moved both files and rewritten config; the records are ours. A failure
        // here is reported, not rolled back: the files did move, and the open-time
        // existence check catches every record left naming the old id.
        let recordsError: string | null = null;
        try {
          await deps.renameBoundDictionary(oldId, newId);
        } catch (cause) {
          logger.error('Failed to carry a dictionary rename into book records:', cause);
          recordsError = extractErrorMessage(cause);
        }

        // No engine rebuild: config already names the new id, and the data is unchanged.
        if (snapshot.binding?.fictionDictionary === oldId) {
          if (recordsError) set({ missingFictionDictionary: oldId });
          else set({ binding: { fictionDictionary: newId } });
        }
        return recordsError
          ? {
              success: false,
              error: `Renamed, but books bound to it still name the old dictionary: ${recordsError}`,
              filesMoved: true,
            }
          : { success: true, filesMoved: true };
      }),

    moveDictionaryTier: (dictionaryId) =>
      enqueue(async () => {
        const newId = otherPairedTierId(dictionaryId);
        if (!newId) {
          return {
            success: false,
            error: `"${dictionaryId}" is neither a fiction nor a generic dictionary`,
            filesMoved: false,
            newId: null,
          };
        }
        const promoting = isFictionProperNounsId(dictionaryId);
        const wasActive = (await loadAppConfig()).engine.activeProperNouns.includes(dictionaryId);

        // Rust moves both halves and substitutes the id in config; a name already taken in
        // the target tier is refused there, before anything moves.
        const result = await deps.renameDictionary(dictionaryId, newId);
        if (!result.success)
          return { success: false, error: result.error, filesMoved: false, newId };

        // Both failures below are reported, not rolled back: the files did move.
        const failures: string[] = [];
        if (promoting) {
          try {
            await deps.unbindDictionary(dictionaryId);
          } catch (cause) {
            logger.error('Failed to unbind books from a promoted dictionary:', cause);
            failures.push(`books bound to it still name it: ${extractErrorMessage(cause)}`);
          }
          if (snapshot.binding?.fictionDictionary === dictionaryId) {
            if (failures.length > 0) set({ missingFictionDictionary: dictionaryId });
            else set({ binding: { fictionDictionary: null } });
          }
        }

        try {
          // Rust's rename has already written config; the transform reads what it left.
          const activeChanged = await transformAppConfig((config) => {
            // With a book open the fiction slice is its binding's: a demoted dictionary the
            // book is not bound to leaves the active list rather than join it as a second
            // fiction dictionary.
            const change = bindingConfigChange(bindingConfigFields(config), {
              activate: promoting ? newId : undefined,
              binding: snapshot.openBook
                ? { bound: dictionaryInUse(snapshot.binding, snapshot.missingFictionDictionary) }
                : undefined,
            });
            return { value: withBindingConfig(config, change), result: change.activeChanged };
          });
          if (wasActive || activeChanged) await rebuildEngine();
        } catch (cause) {
          logger.error('Failed to apply a dictionary tier move:', cause);
          failures.push(`the dictionaries in use were not updated: ${extractErrorMessage(cause)}`);
        }

        return failures.length > 0
          ? {
              success: false,
              error: `Moved to ${newId}, but ${failures.join('; ')}`,
              filesMoved: true,
              newId,
            }
          : { success: true, filesMoved: true, newId };
      }),

    loadQuickAddView: async () => {
      const config = await loadQuickAddConfig();
      if (!snapshot.openBook) return config;
      // The dictionary in use, not the recorded answer: a bound dictionary that no longer
      // exists files nothing (see `dictionaryInUse`).
      return quickAddViewForBinding(
        config,
        dictionaryInUse(snapshot.binding, snapshot.missingFictionDictionary)
      );
    },
  };
}
