import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { BookBinding } from '../types/ReaderTypes';
import type { ProperNounsListResult } from '../types/ElectronTypes';
import { DEBUG_LEVELS } from '../utils/TranslationEngine.js';
import { loadAppConfig, saveAppConfig } from '../utils/appConfig';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import {
  isFictionProperNounsId,
  otherPairedTierId,
} from '../utils/dictionary/DictionaryIdClassifier';
import { createDictionary, renameDictionary } from '../utils/dictionary/DictionaryPairs';
import { listProperNounsDictionaryIds } from '../utils/dictionary/DictionaryBackend';
import {
  activeProperNounsForBinding,
  quickAddTargetForBinding,
  quickAddViewForBinding,
} from '../utils/reader/BindingActivation';
import { toFictionDictionaryId } from '../utils/reader/FictionDictionarySuggestion';
import { loadQuickAddConfig, type QuickAddView } from '../utils/dictionary/QuickAddTarget';
import {
  renameBoundDictionary,
  setBookBinding,
  unbindDictionary,
} from '../utils/reader/BookRecordsBackend';
import { useDictionary } from './dictionary/DictionaryContext';
import { useEngine } from './EngineContext';

/** What renaming a fiction dictionary did. `filesMoved` with `success: false` means the
 * pair was renamed but the book records could not be updated to match. */
export interface FictionRenameResult {
  success: boolean;
  error?: string;
  filesMoved: boolean;
}

/** What moving a dictionary between the fiction and generic tiers did. `newId` is the
 * dictionary's id after the move; `null` when the id has no other tier. */
export interface TierMoveResult extends FictionRenameResult {
  newId: string | null;
}

/** Whether a bound dictionary is still on disk. A failed listing trusts the record: it
 * says nothing about the dictionary, and blocking the apply on it would leave the previous
 * book's fiction dictionary active. */
async function boundDictionaryExists(dictionaryId: string): Promise<boolean> {
  try {
    return (await listProperNounsDictionaryIds()).includes(dictionaryId);
  } catch (cause) {
    logger.warn('Could not list dictionaries to check a binding; applying it as recorded:', cause);
    return true;
  }
}

/** The book the reader currently has open, as far as binding is concerned. */
export interface OpenBookIdentity {
  fingerprint: string;
  fileName: string;
  title: string;
}

export interface BookBindingContextValue {
  openBook: OpenBookIdentity | null;
  /** The open book's answer to the binding question. `null` means never answered — which
   * is what puts the offer on screen. See `BookBinding`. */
  binding: BookBinding | null;
  /** The fiction dictionary in use for the open book; `null` when it is bound to none,
   * unanswered, bound to one that no longer exists, or no book is open. What anything
   * filing or reading "this book's names" should read — not `binding`, which is the
   * recorded answer. */
  boundFictionDictionary: string | null;
  /** The dictionary the open book's record names but that no longer exists on disk
   * (renamed outside the app, or lost to a reset or import). The book reads with no
   * fiction dictionary until the reader answers again; the record is left as it is. */
  missingFictionDictionary: string | null;
  /** Every `properNouns-f_*` dictionary that exists, sorted. */
  fictionDictionaries: string[];
  /** True once the Reader has a book open. While it is, the open book owns the fiction
   * slice of `activeProperNouns` and the Configuration tab only reflects it. */
  isBookOpen: boolean;
  isDialogOpen: boolean;
  isApplying: boolean;
  /** The last binding operation's failure, for the dialog: a refused name, a failed save,
   * or a failed apply. */
  error: string | null;
  /** Set only when *applying* an answer failed — the config write or the engine rebuild —
   * so the engine may still hold another book's fiction dictionary. Cleared by the next
   * successful apply. Narrower than `error` on purpose: this one is safe to show outside
   * the dialog, because whenever it is set the dictionaries really did not switch. */
  applyError: string | null;
  openDialog: () => void;
  closeDialog: () => void;
  /** Called by the Reader once a book is open and its record has been read. Applies the
   * book's answer (or, for a book with no answer yet, "global dictionaries only"). */
  announceOpenBook: (book: OpenBookIdentity, binding: BookBinding | null) => void;
  /** Called by the Reader whenever it stops showing a book (Back to the shelf, or a new
   * book waiting on an encoding choice). The book gives up authority over the fiction
   * slice: `isBookOpen` goes false and the Configuration tab unlocks. Writes no config and
   * rebuilds nothing — the last book's dictionary stays active (CONTEXT.md "Dictionary
   * Binding"). Reopening a book announces it again. */
  announceClosedBook: () => void;
  /** Persist and apply an answer: a fiction dictionary id, or `null` for "none". */
  bind: (fictionDictionary: string | null) => Promise<void>;
  /** Create a new fiction dictionary pair from a reader-typed name, then bind to it. */
  createAndBind: (rawName: string) => Promise<void>;
  /** Create a fiction dictionary pair and load it, binding nothing. The Configuration
   * tab's create, for a `properNouns-f_*` id. */
  createFictionDictionary: (dictionaryId: string) => Promise<ProperNounsListResult>;
  /**
   * The quick-add view every Add in the app decides over — Translator, Dictionary tab and
   * Reader alike. With a book open: config as its binding implies it
   * (`quickAddViewForBinding`), so no Add can reach a fiction dictionary config still names
   * after a failed apply. With no book open: config as loaded. `null` only when there is no
   * book and config failed to load. Reads the binding at call time, so an Add opened right
   * after a bind sees it. Stable.
   */
  loadQuickAddView: () => Promise<QuickAddView | null>;
  /** Rename a fiction dictionary pair and carry the new name into every book bound to it.
   * If the book records could not be updated, those books open with their binding
   * reported missing. */
  renameFictionDictionary: (oldId: string, newId: string) => Promise<FictionRenameResult>;
  /**
   * Move a fiction pair to the generic tier (`properNouns-f_X` → `properNouns-_X`, promote)
   * or a generic pair to fiction (demote), patterns half included. Promoting unbinds every
   * book bound to it — a book binds only to fiction, and every book reads a generic one —
   * and activates it, so those books keep its names. Demoting leaves the fiction slice to
   * the open book's binding. Rebuilds the engine whenever the dictionary is in use: its trie
   * priority follows its tier.
   */
  moveDictionaryTier: (dictionaryId: string) => Promise<TierMoveResult>;
}

const BookBindingContext = createContext<BookBindingContextValue | undefined>(undefined);

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Owns the open book's dictionary binding for the whole app.
 *
 * It sits above the tab container rather than inside the Reader because the binding is
 * not a Reader-local preference: while a book is open it is **authoritative for the
 * fiction slice of `activeProperNouns`**, which the Configuration tab renders and the
 * engine initializes from. Putting it here is what lets Configuration reflect the binding
 * read-only without the two tabs writing the same config key from opposite directions.
 *
 * Applying a binding is the same operation as Engine Reinitialization, triggered
 * differently: write the active dictionaries, then reinitialize. Nothing inside the engine
 * survives that, which is fine — every piece of Reader state that matters (scroll anchor,
 * position, outline) lives outside it by construction.
 */
export function BookBindingProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { loadDictionary, applyRename, getDictionaries } = useDictionary();
  const { reinitializeEngine } = useEngine();

  const [openBook, setOpenBook] = useState<OpenBookIdentity | null>(null);
  const [binding, setBinding] = useState<BookBinding | null>(null);
  const [missingFictionDictionary, setMissingFictionDictionary] = useState<string | null>(null);
  const [fictionDictionaries, setFictionDictionaries] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const openBookRef = useRef<OpenBookIdentity | null>(null);
  openBookRef.current = openBook;
  const bindingRef = useRef<BookBinding | null>(null);
  bindingRef.current = binding;
  const missingRef = useRef<string | null>(null);
  missingRef.current = missingFictionDictionary;

  // Serializes every apply. Opening a book and answering the dialog both do a
  // read-modify-write of `activeProperNouns` followed by an engine reinitialization;
  // overlapping them would reinitialize against a half-written config.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const result = queueRef.current.then(fn, fn);
    queueRef.current = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }, []);

  const refreshFictionDictionaries = useCallback(async (): Promise<void> => {
    const ids = await listProperNounsDictionaryIds();
    setFictionDictionaries(ids.filter(isFictionProperNounsId).sort((a, b) => a.localeCompare(b)));
  }, []);

  useEffect(() => {
    refreshFictionDictionaries().catch((cause) => {
      logger.error('Failed to list fiction dictionaries:', cause);
    });
  }, [refreshFictionDictionaries]);

  /**
   * Write the config a binding implies and, when the engine's dictionary set actually
   * changed, reinitialize.
   *
   * Both early returns matter. Reopening the book already open recomputes the same list,
   * and a reinitialization there would throw away every cached translation on screen for
   * no change at all. A quick-add default that moved on its own is a config write with no
   * engine consequence — the engine never reads that key.
   */
  const writeAnswer = useCallback(
    async (bound: string | null): Promise<void> => {
      const config = await loadAppConfig();
      const nextActive = activeProperNounsForBinding(config.engine.activeProperNouns, bound);
      const nextQuickAdd = quickAddTargetForBinding(bound, config.ui.defaultQuickAddDictionary);
      const activeChanged = !sameList(config.engine.activeProperNouns, nextActive);
      const quickAddChanged = nextQuickAdd !== config.ui.defaultQuickAddDictionary;
      if (!activeChanged && !quickAddChanged) return;

      await saveAppConfig({
        engine: { activeProperNouns: nextActive },
        ui: { defaultQuickAddDictionary: nextQuickAdd },
      });
      if (!activeChanged) return;

      // The store's map, read at call time: `createAndBind` rebuilds right after loading a
      // new pair, and the render's `dictionaries` has it only once React re-renders. Also
      // stable, so `bind`/`announceOpenBook` do not change identity on every edit.
      await reinitializeEngine(getDictionaries(), {
        forceConfigReload: true,
        debugLevel: DEBUG_LEVELS.ERROR,
      });
    },
    [getDictionaries, reinitializeEngine]
  );

  /** `writeAnswer`, recording whether the dictionaries actually switched — see
   * `applyError`. Rethrows, so each caller still reports the failure its own way. */
  const applyAnswer = useCallback(
    async (bound: string | null): Promise<void> => {
      try {
        await writeAnswer(bound);
        setApplyError(null);
      } catch (cause) {
        setApplyError(extractErrorMessage(cause));
        throw cause;
      }
    },
    [writeAnswer]
  );

  const announceOpenBook = useCallback(
    (book: OpenBookIdentity, nextBinding: BookBinding | null): void => {
      // The refs too, not just state: queued work and `loadQuickAddView` read them before
      // the next render. The previous book's missing dictionary is not this one's; until
      // the existence check below answers, the binding is trusted as recorded.
      openBookRef.current = book;
      bindingRef.current = nextBinding;
      missingRef.current = null;
      setOpenBook(book);
      setBinding(nextBinding);
      setMissingFictionDictionary(null);
      setIsDialogOpen(false);
      void enqueue(async () => {
        setIsApplying(true);
        try {
          // An unanswered book applies `null` without persisting one: it reads right now
          // with global dictionaries only, and the offer stays on screen. Leaving the
          // previous book's fiction dictionary active instead is the silent
          // wrong-dictionary failure the whole feature exists to prevent.
          //
          // A bound dictionary that no longer exists is applied the same way, and named.
          // Checked against disk rather than `fictionDictionaries`, which may not have
          // loaded yet on the first open after launch.
          const bound = nextBinding?.fictionDictionary ?? null;
          const exists = bound === null || (await boundDictionaryExists(bound));
          setMissingFictionDictionary(exists ? null : bound);
          await applyAnswer(exists ? bound : null);
          setError(null);
        } catch (cause) {
          logger.error('Failed to apply the book binding on open:', cause);
          setError(extractErrorMessage(cause));
        } finally {
          setIsApplying(false);
        }
      });
    },
    [applyAnswer, enqueue]
  );

  const announceClosedBook = useCallback((): void => {
    openBookRef.current = null;
    bindingRef.current = null;
    setOpenBook(null);
    setBinding(null);
    setIsDialogOpen(false);
    // After any apply still queued for the closed book, so its outcome cannot land on a
    // shelf with no book to show it.
    void enqueue(async () => {
      if (openBookRef.current) return; // a book was announced since; its state stands
      setMissingFictionDictionary(null);
      setError(null);
      setApplyError(null);
    });
  }, [enqueue]);

  /**
   * The tail every answer shares, in the order that matters: persist first, so a failed
   * write never leaves the engine applying an answer the record doesn't hold; then apply;
   * and only once both landed, clear the error and close the dialog.
   */
  const persistAndApply = useCallback(
    async (book: OpenBookIdentity, fictionDictionary: string | null): Promise<void> => {
      const next: BookBinding = { fictionDictionary };
      await setBookBinding(book.fingerprint, next);
      setBinding(next);
      setMissingFictionDictionary(null);
      await applyAnswer(fictionDictionary);
      setError(null);
      setIsDialogOpen(false);
    },
    [applyAnswer]
  );

  const bind = useCallback(
    (fictionDictionary: string | null): Promise<void> =>
      enqueue(async () => {
        const book = openBookRef.current;
        if (!book) return;
        setIsApplying(true);
        try {
          await persistAndApply(book, fictionDictionary);
        } catch (cause) {
          logger.error('Failed to bind dictionaries to the book:', cause);
          setError(extractErrorMessage(cause));
        } finally {
          setIsApplying(false);
        }
      }),
    [enqueue, persistAndApply]
  );

  /**
   * Create a fiction pair, load it (`DictionaryPairs`), and refresh the fiction list. Not
   * queued itself — both callers already run inside the queue, and queueing from within it
   * would wait on itself. The pair is created atomically (ADR-027), so this cannot leave half
   * a pair behind.
   */
  const createPair = useCallback(
    async (dictionaryId: string): Promise<ProperNounsListResult> => {
      const result = await createDictionary(dictionaryId, { loadDictionary, applyRename });
      if (!result.success) return result;
      await refreshFictionDictionaries();
      return result;
    },
    [loadDictionary, refreshFictionDictionaries, applyRename]
  );

  const createAndBind = useCallback(
    (rawName: string): Promise<void> =>
      enqueue(async () => {
        const book = openBookRef.current;
        if (!book) return;
        // A name of only diacritics-stripped-to-nothing (e.g. Chinese characters) trims
        // non-empty but yields no slug — reject it here rather than letting Rust name a
        // file after it.
        const dictionaryId = toFictionDictionaryId(rawName);
        if (!dictionaryId) {
          setError(`"${rawName.trim()}" has no letters to name a dictionary after.`);
          return;
        }
        setIsApplying(true);
        try {
          const result = await createPair(dictionaryId);
          if (!result.success) throw new Error(result.error ?? 'Failed to create the dictionary');
          await persistAndApply(book, dictionaryId);
        } catch (cause) {
          logger.error('Failed to create and bind a fiction dictionary:', cause);
          setError(extractErrorMessage(cause));
        } finally {
          setIsApplying(false);
        }
      }),
    [createPair, enqueue, persistAndApply]
  );

  const createFictionDictionary = useCallback(
    (dictionaryId: string): Promise<ProperNounsListResult> =>
      enqueue(() => createPair(dictionaryId)),
    [createPair, enqueue]
  );

  const renameFictionDictionary = useCallback(
    (oldId: string, newId: string): Promise<FictionRenameResult> =>
      enqueue(async () => {
        // Moves both files and brings `dictionaries` along (`DictionaryPairs`).
        const result = await renameDictionary(oldId, newId, {
          loadDictionary,
          applyRename,
        });
        if (!result.success) return { success: false, error: result.error, filesMoved: false };

        // Rust has moved both files and rewritten config; the records are ours. A failure
        // here is reported, not rolled back: the files did move, and the open-time
        // existence check catches every record left naming the old id.
        let recordsError: string | null = null;
        try {
          await renameBoundDictionary(oldId, newId);
        } catch (cause) {
          logger.error('Failed to carry a dictionary rename into book records:', cause);
          recordsError = extractErrorMessage(cause);
        }

        await refreshFictionDictionaries();

        // No engine rebuild: config already names the new id, and the data is unchanged.
        if (bindingRef.current?.fictionDictionary === oldId) {
          if (recordsError) setMissingFictionDictionary(oldId);
          else setBinding({ fictionDictionary: newId });
        }
        return recordsError
          ? {
              success: false,
              error: `Renamed, but books bound to it still name the old dictionary: ${recordsError}`,
              filesMoved: true,
            }
          : { success: true, filesMoved: true };
      }),
    [enqueue, loadDictionary, refreshFictionDictionaries, applyRename]
  );

  const moveDictionaryTier = useCallback(
    (dictionaryId: string): Promise<TierMoveResult> =>
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
        const result = await renameDictionary(dictionaryId, newId, { loadDictionary, applyRename });
        if (!result.success)
          return { success: false, error: result.error, filesMoved: false, newId };

        // Both failures below are reported, not rolled back: the files did move.
        const failures: string[] = [];
        if (promoting) {
          try {
            await unbindDictionary(dictionaryId);
          } catch (cause) {
            logger.error('Failed to unbind books from a promoted dictionary:', cause);
            failures.push(`books bound to it still name it: ${extractErrorMessage(cause)}`);
          }
          if (bindingRef.current?.fictionDictionary === dictionaryId) {
            if (failures.length > 0) {
              missingRef.current = dictionaryId;
              setMissingFictionDictionary(dictionaryId);
            } else {
              const next: BookBinding = { fictionDictionary: null };
              bindingRef.current = next;
              setBinding(next);
            }
          }
        }
        await refreshFictionDictionaries();

        try {
          const config = await loadAppConfig();
          let nextActive = config.engine.activeProperNouns;
          let nextQuickAdd = config.ui.defaultQuickAddDictionary;
          if (promoting && !nextActive.includes(newId)) nextActive = [...nextActive, newId];
          // With a book open the fiction slice is its binding's: a demoted dictionary the
          // book is not bound to leaves the active list rather than join it as a second
          // fiction dictionary.
          if (openBookRef.current) {
            const bound = missingRef.current
              ? null
              : (bindingRef.current?.fictionDictionary ?? null);
            nextActive = activeProperNounsForBinding(nextActive, bound);
            nextQuickAdd = quickAddTargetForBinding(bound, nextQuickAdd);
          }
          const activeChanged = !sameList(config.engine.activeProperNouns, nextActive);
          if (activeChanged || nextQuickAdd !== config.ui.defaultQuickAddDictionary) {
            await saveAppConfig({
              engine: { activeProperNouns: nextActive },
              ui: { defaultQuickAddDictionary: nextQuickAdd },
            });
          }
          // Read from the store, not the last render: the rename just landed there.
          if (wasActive || activeChanged) {
            await reinitializeEngine(getDictionaries(), {
              forceConfigReload: true,
              debugLevel: DEBUG_LEVELS.ERROR,
            });
          }
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
    [
      enqueue,
      loadDictionary,
      applyRename,
      getDictionaries,
      refreshFictionDictionaries,
      reinitializeEngine,
    ]
  );

  const loadQuickAddView = useCallback(async (): Promise<QuickAddView | null> => {
    const config = await loadQuickAddConfig();
    if (!openBookRef.current) return config;
    // The dictionary in use, not the recorded answer: a bound dictionary that no longer
    // exists files nothing (see `boundFictionDictionary`).
    const bound = missingRef.current ? null : (bindingRef.current?.fictionDictionary ?? null);
    return quickAddViewForBinding(config, bound);
  }, []);

  // Only meaningful with a book open: the dialog renders inside `BookReader`, so setting
  // the flag from the shelf (or from the Cmd/Ctrl+B shortcut, which is registered globally)
  // would leave a flag on with nothing to render it.
  const openDialog = useCallback((): void => {
    if (openBookRef.current) setIsDialogOpen(true);
  }, []);
  const closeDialog = useCallback((): void => setIsDialogOpen(false), []);

  const value = useMemo<BookBindingContextValue>(
    () => ({
      openBook,
      binding,
      boundFictionDictionary: missingFictionDictionary
        ? null
        : (binding?.fictionDictionary ?? null),
      missingFictionDictionary,
      fictionDictionaries,
      isBookOpen: openBook !== null,
      isDialogOpen,
      isApplying,
      error,
      applyError,
      openDialog,
      closeDialog,
      announceOpenBook,
      announceClosedBook,
      bind,
      createAndBind,
      createFictionDictionary,
      renameFictionDictionary,
      moveDictionaryTier,
      loadQuickAddView,
    }),
    [
      openBook,
      binding,
      missingFictionDictionary,
      fictionDictionaries,
      isDialogOpen,
      isApplying,
      error,
      applyError,
      openDialog,
      closeDialog,
      announceOpenBook,
      announceClosedBook,
      bind,
      createAndBind,
      createFictionDictionary,
      renameFictionDictionary,
      moveDictionaryTier,
      loadQuickAddView,
    ]
  );

  return <BookBindingContext.Provider value={value}>{children}</BookBindingContext.Provider>;
}

/** @throws when used outside a `BookBindingProvider`. */
export function useBookBinding(): BookBindingContextValue {
  const context = useContext(BookBindingContext);
  if (!context) {
    throw new Error('useBookBinding must be used within a BookBindingProvider');
  }
  return context;
}
