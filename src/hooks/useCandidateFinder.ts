import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import {
  CandidateFinderStore,
  type CandidateFinderSnapshot,
} from '../utils/reader/CandidateFinderStore';

export interface CandidateFinder {
  snapshot: CandidateFinderSnapshot;
  run: () => void;
  /** Stops a running run; a finished list stays. */
  cancel: () => void;
}

/**
 * One open book's Candidate finder run, adapted to React from `CandidateFinderStore`.
 *
 * One book per instance (`BookReader` is keyed by fingerprint, ADR-050): unmounting — a
 * book switch, Back, or the encoding prompt — cancels the run and drops the list. The
 * `phrases` keys are read from the Dictionary Store's memory when a run starts, never
 * before, so opening the panel costs nothing.
 */
export function useCandidateFinder(fingerprint: string): CandidateFinder {
  const { dictionaries } = useDictionary();
  const dictionariesRef = useRef(dictionaries);
  dictionariesRef.current = dictionaries;

  const [store] = useState(
    () =>
      new CandidateFinderStore({
        fingerprint,
        getPhrases: () => Object.keys(dictionariesRef.current.phrases ?? {}),
      })
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    store.open();
    return () => store.dispose();
  }, [store]);

  return {
    snapshot,
    run: () => void store.run(),
    cancel: store.cancel,
  };
}
