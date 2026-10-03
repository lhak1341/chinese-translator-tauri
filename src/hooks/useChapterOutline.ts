import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ChapterOutlineStore,
  type ChapterOutlineInputs,
  type ChapterOutlineSnapshot,
} from '../utils/reader/ChapterOutlineStore';
import type { ChapterPatternId } from '../types/ReaderTypes';

export type UseChapterOutlineOptions = ChapterOutlineInputs;

export interface ChapterOutlineState extends ChapterOutlineSnapshot {
  /** Switch to a different pattern, or `null` to go back to trusting election. Persists
   * to the book record. */
  setOverride: (pattern: ChapterPatternId | null) => void;
}

/**
 * One open book's chapter outline, adapted to React from `ChapterOutlineStore`, which owns
 * election, the override and the ordering between their fetches.
 *
 * One book per instance: `BookReader` is keyed by fingerprint (ADR-050), so the store is
 * made once and the options are read once, at mount.
 */
export function useChapterOutline(options: UseChapterOutlineOptions): ChapterOutlineState {
  const [store] = useState(() => new ChapterOutlineStore(options));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    store.open();
    return () => store.close();
  }, [store]);

  return { ...snapshot, setOverride: store.setOverride };
}
