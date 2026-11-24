import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
import {
  bookRecordsFile,
  dismissCandidate,
  dismissCandidates,
  getBookRecordsSnapshot,
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
 * book switch, Back, or the encoding prompt — cancels the run and drops the list. The store
 * decides what a run reads (the open book's quick-add view, then the Dictionary Store's own
 * snapshot, then the background); this hook only hands it the two sources React owns.
 */
export function useCandidateFinder(fingerprint: string): CandidateFinder {
  const { dictionaries, getDictionarySnapshot, addEntry, addEntries } = useDictionary();
  const { rules } = useTransformRules();
  const { loadQuickAddView } = useBookBinding();

  // Both sources are stable (the Dictionary Store's and the binding store's own methods).
  const [store] = useState(
    () =>
      new CandidateFinderStore({
        fingerprint,
        loadQuickAddView,
        readDictionaries: getDictionarySnapshot,
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
