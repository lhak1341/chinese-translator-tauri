import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useDictionary } from '../components/dictionary/DictionaryContext';
import { useBookBinding } from '../components/BookBindingContext';
import { useTransformRules } from './useTransformRules';
import { initialEntryGuess } from '../utils/dictionary/TransformRuleEngine';
import type { QuickAddView } from '../utils/dictionary/QuickAddTarget';
import {
  candidateAddChoices,
  isCandidateAdded,
  type CandidateAdder,
} from '../utils/reader/CandidateAdd';
import { snapshotFinderDictionaries } from '../utils/reader/CandidateDictionaries';
import {
  CandidateFinderStore,
  type CandidateFinderSnapshot,
} from '../utils/reader/CandidateFinderStore';

export interface CandidateFinder {
  snapshot: CandidateFinderSnapshot;
  /** What a row's Add reads and writes; follows the Dictionary Store. */
  adder: CandidateAdder;
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
  const { dictionaries, unreadDictionaryIds, addEntry } = useDictionary();
  const { rules } = useTransformRules();
  // The book's quick-add view as of the last run: it says which dictionaries are active.
  const [view, setView] = useState<QuickAddView | null>(null);
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
          setView(view);
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

  const adder = useMemo((): CandidateAdder => {
    const { opened, choices } = candidateAddChoices(view, dictionaries);
    // The guess is the Add form's: Transform Rules for a proper-noun target, else the rough gloss.
    const guess = (text: string, dictionaryId: string) =>
      initialEntryGuess(rules, dictionaries, text, dictionaryId);
    return {
      opened,
      choices,
      isAdded: (text) => isCandidateAdded(text, dictionaries, choices),
      guess: (text, dictionaryId) => guess(text, dictionaryId).translation,
      add: (text, dictionaryId, translation) =>
        addEntry(dictionaryId, text, translation.trim(), {
          allowAsPatternVariable: false,
          semanticType: guess(text, dictionaryId).semanticType || undefined,
        }),
    };
  }, [view, dictionaries, rules, addEntry]);

  return {
    snapshot,
    adder,
    run: () => void store.run(),
    cancel: store.cancel,
  };
}
