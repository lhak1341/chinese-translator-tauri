import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAppFile } from './useAppFile';
import type { AppFileState } from '../utils/appFile';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import { useBookBinding } from '../components/BookBindingContext';
import { useTransformRules } from './useTransformRules';
import type { Candidate } from '../types/ReaderTypes';
import {
  candidateAddChoices,
  createCandidateAdder,
  type CandidateAdder,
} from '../utils/reader/CandidateAdd';
import { rankCandidates } from '../utils/reader/CandidateRanking';
import { snapshotFinderDictionaries } from '../utils/reader/CandidateDictionaries';
import { loadAppConfig } from '../utils/appConfig';
import { backgroundBooks } from '../utils/reader/CandidateBackground';
import {
  bookRecordsFile,
  dismissCandidate,
  dismissCandidates,
  getBookRecordsSnapshot,
  loadBookRecords,
  restoreCandidate,
} from '../utils/reader/BookRecordsBackend';
import type { BookRecords } from '../types/ReaderTypes';
import {
  CandidateFinderStore,
  type CandidateFinderSnapshot,
} from '../utils/reader/CandidateFinderStore';

/** The names this book's reader dismissed, and the two ways to change them. */
export interface CandidateDismissals {
  names: string[];
  /** Why the book's records can't be saved, or `null`; a run works either way. */
  unreadable: string | null;
  /** False until the records have loaded, and for good when they could not. */
  canDismiss: boolean;
  dismiss: (text: string) => Promise<void>;
  /** Several names in one records write. */
  dismissAll: (texts: string[]) => Promise<void>;
  restore: (text: string) => Promise<void>;
}

export interface CandidateFinder {
  snapshot: CandidateFinderSnapshot;
  dismissals: CandidateDismissals;
  /** What a row's Add reads and writes; follows the Dictionary Store. */
  adder: CandidateAdder;
  run: () => void;
  /** Stops a running run; a finished list stays. */
  cancel: () => void;
}

/** A stable empty list, so a book with none dismissed does not re-render on every records write. */
const NONE_DISMISSED: string[] = [];

const selectStatus = (state: AppFileState<BookRecords>) => state.status;
const selectReason = (state: AppFileState<BookRecords>) => state.reason;

/**
 * One open book's Candidate finder run, adapted to React from `CandidateFinderStore`.
 *
 * One book per instance (`BookReader` is keyed by fingerprint, ADR-050): unmounting — a
 * book switch, Back, or the encoding prompt — cancels the run and drops the list. The
 * dictionaries are read from the Dictionary Store's memory when a run starts, never before,
 * so opening the panel costs nothing; the active proper-noun list is the open book's
 * (`loadQuickAddView`, the same view the Add form uses).
 */
export function useCandidateFinder(fingerprint: string): CandidateFinder {
  const { dictionaries, unreadDictionaryIds, addEntry, addEntries } = useDictionary();
  const { rules } = useTransformRules();
  const { loadQuickAddView } = useBookBinding();
  const dictionariesRef = useRef({ dictionaries, unreadDictionaryIds });
  dictionariesRef.current = { dictionaries, unreadDictionaryIds };

  const [store] = useState(
    () =>
      new CandidateFinderStore({
        fingerprint,
        getBackground: async () => {
          // A failed read of either leaves the finder with fewer background books (or the
          // default library folder), so the gate skips or the sidecars rebuild; the run goes on.
          const [config, records] = await Promise.all([
            loadAppConfig().catch(() => null),
            loadBookRecords().catch(() => null),
          ]);
          return {
            libraryPath: config?.reader.libraryPath ?? null,
            books: records ? backgroundBooks(records.records, fingerprint) : [],
          };
        },
        getDictionaries: async () => {
          const view = await loadQuickAddView();
          if (!view) {
            return { ok: false, message: "Can't run: the configuration couldn't be read." };
          }
          const { dictionaries, unreadDictionaryIds } = dictionariesRef.current;
          const finder = snapshotFinderDictionaries(
            dictionaries,
            unreadDictionaryIds,
            view.activeProperNouns
          );
          return finder.ok ? { ...finder, view } : finder;
        },
      })
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    store.open();
    return () => store.dispose();
  }, [store]);

  // Only this book's list is read, so the position writes that land while reading (each a new
  // record, the same list) do not re-render the reading view.
  // The load these start is not a spare read: a success is cached, so `getBackground`'s read
  // costs no IPC.
  const names = useAppFile(
    bookRecordsFile,
    useCallback(
      () => getBookRecordsSnapshot()[fingerprint]?.dismissedCandidates ?? NONE_DISMISSED,
      [fingerprint]
    )
  );
  const recordsStatus = useAppFile(bookRecordsFile, selectStatus);
  const unreadable = useAppFile(bookRecordsFile, selectReason);
  const dismissals = useMemo(
    (): CandidateDismissals => ({
      names,
      unreadable,
      canDismiss: recordsStatus === 'loaded',
      dismiss: (text) => dismissCandidate(fingerprint, text),
      dismissAll: (texts) => dismissCandidates(fingerprint, texts),
      restore: (text) => restoreCandidate(fingerprint, text),
    }),
    [names, unreadable, recordsStatus, fingerprint]
  );

  // The quick-add view of the run whose list is shown: it says which dictionaries are active.
  const view = snapshot.status === 'done' ? snapshot.view : null;
  const addChoices = useMemo(() => candidateAddChoices(view, dictionaries), [view, dictionaries]);
  const { opened } = addChoices;
  // Apart from the adder so adding an entry (new dictionaries) does not re-rank the list: it
  // reads no dictionary, since pattern coverage was applied when the run landed.
  const rank = useCallback(
    (candidates: readonly Candidate[]) => rankCandidates(candidates, rules, opened),
    [rules, opened]
  );

  const adder = useMemo(
    (): CandidateAdder =>
      createCandidateAdder({
        addChoices,
        dictionaries,
        rules,
        rank,
        writers: { addEntry, addEntries },
      }),
    [addChoices, dictionaries, rules, rank, addEntry, addEntries]
  );

  return {
    snapshot,
    dismissals,
    adder,
    run: () => void store.run(),
    cancel: store.cancel,
  };
}
