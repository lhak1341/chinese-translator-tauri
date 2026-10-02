import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { BookBinding } from '../types/ReaderTypes';
import type { ProperNounsListResult } from '../types/ElectronTypes';
import { DEBUG_LEVELS } from '../utils/TranslationEngine.js';
import { createDictionary, renameDictionary } from '../utils/dictionary/DictionaryPairs';
import { listProperNounsDictionaryIds } from '../utils/dictionary/DictionaryBackend';
import { isFictionProperNounsId } from '../utils/dictionary/DictionaryIdClassifier';
import { dictionaryInUse } from '../utils/reader/BindingActivation';
import type { QuickAddView } from '../utils/dictionary/QuickAddTarget';
import {
  renameBoundDictionary,
  setBookBinding,
  unbindDictionary,
} from '../utils/reader/BookRecordsBackend';
import {
  createBookBindingStore,
  type DictionaryRenameResult,
  type OpenBookIdentity,
  type TierMoveResult,
} from './BookBindingStore';
import { useDictionary } from './dictionary/DictionaryContext';
import { useEngine } from './EngineContext';

export type { DictionaryRenameResult, OpenBookIdentity, TierMoveResult };

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
  /** Every `properNouns-f_*` dictionary that exists, sorted — the Dictionary Store's list,
   * filtered. */
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
  /** Create a proper-nouns dictionary (the pair, for a `properNouns-f_*` id) and load it,
   * binding nothing. The Configuration tab's create, for every kind. Runs on the binding
   * queue, behind any apply still in flight. */
  createDictionary: (dictionaryId: string) => Promise<ProperNounsListResult>;
  /**
   * The quick-add view every Add in the app decides over — Translator, Dictionary tab and
   * Reader alike. With a book open: config as its binding implies it
   * (`quickAddViewForBinding`), so no Add can reach a fiction dictionary config still names
   * after a failed apply. With no book open: config as loaded. `null` only when there is no
   * book and config failed to load. Reads the binding at call time, so an Add opened right
   * after a bind sees it. Stable.
   */
  loadQuickAddView: () => Promise<QuickAddView | null>;
  /** Rename a dictionary. A fiction pair's new name is also carried into every book bound
   * to it; if the book records could not be updated, those books open with their binding
   * reported missing. Any other dictionary has no records to update. */
  renameDictionary: (oldId: string, newId: string) => Promise<DictionaryRenameResult>;
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

/**
 * Hands the open book's dictionary binding to the whole app. The binding itself — the queue,
 * the state, every operation — is `BookBindingStore`; this is the adapter over it, and owns
 * only what is React's: the dictionary dialog's open flag and where the store's inputs come
 * from.
 *
 * It sits above the tab container rather than inside the Reader because the binding is not a
 * Reader-local preference: while a book is open it is **authoritative for the fiction slice
 * of `activeProperNouns`**, which the Configuration tab renders and the engine initializes
 * from. Putting it here is what lets Configuration reflect the binding read-only without the
 * two tabs writing the same config key from opposite directions.
 */
export function BookBindingProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { loadDictionary, applyRename, getDictionaries, dictionaryTypes } = useDictionary();
  const { reinitializeEngine } = useEngine();

  // The store is made once; what it needs from other contexts reaches it through this ref,
  // so a changed identity is picked up at the next call instead of needing a new store.
  const latest = useRef({ loadDictionary, applyRename, getDictionaries, reinitializeEngine });
  latest.current = { loadDictionary, applyRename, getDictionaries, reinitializeEngine };

  const [store] = useState(() => {
    const pairOps = {
      loadDictionary: (dictionaryId: string) => latest.current.loadDictionary(dictionaryId),
      applyRename: (renames: ReadonlyArray<readonly [string, string]>) =>
        latest.current.applyRename(renames),
    };
    return createBookBindingStore({
      listDictionaryIds: listProperNounsDictionaryIds,
      setBookBinding,
      renameBoundDictionary,
      unbindDictionary,
      createDictionary: (dictionaryId) => createDictionary(dictionaryId, pairOps),
      renameDictionary: (oldId, newId) => renameDictionary(oldId, newId, pairOps),
      // The store's map, read at call time: a pair just loaded or renamed is in it before
      // React re-renders.
      rebuildEngine: async () => {
        await latest.current.reinitializeEngine(latest.current.getDictionaries(), {
          forceConfigReload: true,
          debugLevel: DEBUG_LEVELS.ERROR,
        });
      },
    });
  });
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // The Dictionary Store already lists every dictionary that exists and re-lists it on each
  // create and rename, so this is a view of that list, not a second copy (ADR-062).
  const fictionDictionaries = useMemo(
    () =>
      Object.keys(dictionaryTypes)
        .filter(isFictionProperNounsId)
        .sort((a, b) => a.localeCompare(b)),
    [dictionaryTypes]
  );

  const announceOpenBook = useCallback(
    (book: OpenBookIdentity, nextBinding: BookBinding | null): void => {
      setIsDialogOpen(false);
      store.announceOpenBook(book, nextBinding);
    },
    [store]
  );

  const announceClosedBook = useCallback((): void => {
    setIsDialogOpen(false);
    store.announceClosedBook();
  }, [store]);

  // The dialog closes once an answer has landed, and stays open to show a failure.
  const bind = useCallback(
    async (fictionDictionary: string | null): Promise<void> => {
      if (await store.bind(fictionDictionary)) setIsDialogOpen(false);
    },
    [store]
  );

  const createAndBind = useCallback(
    async (rawName: string): Promise<void> => {
      if (await store.createAndBind(rawName)) setIsDialogOpen(false);
    },
    [store]
  );

  // Only meaningful with a book open: the dialog renders inside `BookReader`, so setting
  // the flag from the shelf (or from the Cmd/Ctrl+B shortcut, which is registered globally)
  // would leave a flag on with nothing to render it.
  const openDialog = useCallback((): void => {
    if (store.getSnapshot().openBook) setIsDialogOpen(true);
  }, [store]);
  const closeDialog = useCallback((): void => setIsDialogOpen(false), []);

  const value = useMemo<BookBindingContextValue>(
    () => ({
      openBook: snapshot.openBook,
      binding: snapshot.binding,
      boundFictionDictionary: dictionaryInUse(snapshot.binding, snapshot.missingFictionDictionary),
      missingFictionDictionary: snapshot.missingFictionDictionary,
      fictionDictionaries,
      isBookOpen: snapshot.openBook !== null,
      isDialogOpen,
      isApplying: snapshot.isApplying,
      error: snapshot.error,
      applyError: snapshot.applyError,
      openDialog,
      closeDialog,
      announceOpenBook,
      announceClosedBook,
      bind,
      createAndBind,
      createDictionary: store.createDictionary,
      renameDictionary: store.renameDictionary,
      moveDictionaryTier: store.moveDictionaryTier,
      loadQuickAddView: store.loadQuickAddView,
    }),
    [
      snapshot,
      fictionDictionaries,
      isDialogOpen,
      openDialog,
      closeDialog,
      announceOpenBook,
      announceClosedBook,
      bind,
      createAndBind,
      store,
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
