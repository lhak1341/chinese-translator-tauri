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
import { DEBUG_LEVELS } from '../utils/TranslationEngine.js';
import { callRustConfigWrite, loadAppConfig, saveAppConfig } from '../utils/appConfig';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import { isFictionProperNounsId, toPatternsId } from '../utils/dictionary/DictionaryIdClassifier';
import { listProperNounsDictionaryIds } from '../utils/dictionary/DictionaryBackend';
import {
  activeProperNounsForBinding,
  quickAddTargetForBinding,
} from '../utils/reader/BindingActivation';
import { toFictionDictionaryId } from '../utils/reader/FictionDictionarySuggestion';
import { setBookBinding } from '../utils/reader/BookRecordsBackend';
import { useDictionary } from './dictionary/DictionaryContext';
import { useEngine } from './EngineContext';

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
  /** The fiction dictionary the open book is bound to; `null` when it is bound to none,
   * unanswered, or no book is open. */
  boundFictionDictionary: string | null;
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
  /** Persist and apply an answer: a fiction dictionary id, or `null` for "none". */
  bind: (fictionDictionary: string | null) => Promise<void>;
  /** Create a new fiction dictionary pair from a reader-typed name, then bind to it. */
  createAndBind: (rawName: string) => Promise<void>;
  /** Re-read the fiction dictionary list. The Configuration tab calls this after its own
   * create/rename, so the list this context hands out never lags behind disk. */
  refreshFictionDictionaries: () => Promise<void>;
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
  const { dictionaries, loadDictionary } = useDictionary();
  const { reinitializeEngine } = useEngine();

  const [openBook, setOpenBook] = useState<OpenBookIdentity | null>(null);
  const [binding, setBinding] = useState<BookBinding | null>(null);
  const [fictionDictionaries, setFictionDictionaries] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Read at call time, never closed over: `dictionaries` changes identity on every
  // dictionary edit, and re-creating `bind`/`announceOpenBook` on each of those would
  // re-run the Reader's announce effect for no reason.
  const dictionariesRef = useRef(dictionaries);
  dictionariesRef.current = dictionaries;
  const openBookRef = useRef<OpenBookIdentity | null>(null);
  openBookRef.current = openBook;

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

      await reinitializeEngine(dictionariesRef.current, {
        forceConfigReload: true,
        debugLevel: DEBUG_LEVELS.ERROR,
      });
    },
    [reinitializeEngine]
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
      setOpenBook(book);
      setBinding(nextBinding);
      setIsDialogOpen(false);
      void enqueue(async () => {
        setIsApplying(true);
        try {
          // An unanswered book applies `null` without persisting one: it reads right now
          // with global dictionaries only, and the offer stays on screen. Leaving the
          // previous book's fiction dictionary active instead is the silent
          // wrong-dictionary failure the whole feature exists to prevent.
          await applyAnswer(nextBinding?.fictionDictionary ?? null);
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
          // Reuses the existing creation command — fiction dictionaries and their paired
          // patterns-f_* file are created atomically (ADR-027), so this needs no new
          // backend work and cannot leave half a pair behind.
          const result = await callRustConfigWrite(() =>
            window.electronAPI.createFictionDictionaryPair(dictionaryId)
          );
          if (!result.success) throw new Error(result.error ?? 'Failed to create the dictionary');

          await loadDictionary(dictionaryId);
          await loadDictionary(toPatternsId(dictionaryId));
          await refreshFictionDictionaries();
          await persistAndApply(book, dictionaryId);
        } catch (cause) {
          logger.error('Failed to create and bind a fiction dictionary:', cause);
          setError(extractErrorMessage(cause));
        } finally {
          setIsApplying(false);
        }
      }),
    [enqueue, loadDictionary, persistAndApply, refreshFictionDictionaries]
  );

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
      boundFictionDictionary: binding?.fictionDictionary ?? null,
      fictionDictionaries,
      isBookOpen: openBook !== null,
      isDialogOpen,
      isApplying,
      error,
      applyError,
      openDialog,
      closeDialog,
      announceOpenBook,
      bind,
      createAndBind,
      refreshFictionDictionaries,
    }),
    [
      openBook,
      binding,
      fictionDictionaries,
      isDialogOpen,
      isApplying,
      error,
      applyError,
      openDialog,
      closeDialog,
      announceOpenBook,
      bind,
      createAndBind,
      refreshFictionDictionaries,
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
