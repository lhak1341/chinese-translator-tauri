import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import { useBookBinding } from '../components/BookBindingContext';
import { snapshotFinderDictionaries } from '../utils/reader/CandidateDictionaries';
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
 * dictionaries are read from the Dictionary Store's memory when a run starts, never before,
 * so opening the panel costs nothing; the active proper-noun list is the open book's
 * (`loadQuickAddView`, the same view the Add form uses).
 */
export function useCandidateFinder(fingerprint: string): CandidateFinder {
  const { dictionaries, unreadDictionaryIds } = useDictionary();
  const { loadQuickAddView } = useBookBinding();
  const dictionariesRef = useRef({ dictionaries, unreadDictionaryIds });
  dictionariesRef.current = { dictionaries, unreadDictionaryIds };

  const [store] = useState(
    () =>
      new CandidateFinderStore({
        fingerprint,
        getDictionaries: async () => {
          const view = await loadQuickAddView();
          if (!view) {
            return { ok: false, message: "Can't run: the configuration couldn't be read." };
          }
          const { dictionaries, unreadDictionaryIds } = dictionariesRef.current;
          return snapshotFinderDictionaries(
            dictionaries,
            unreadDictionaryIds,
            view.activeProperNouns
          );
        },
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
