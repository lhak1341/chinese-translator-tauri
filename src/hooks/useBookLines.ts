import { useEffect, useState, useSyncExternalStore } from 'react';
import { BookLinesStore } from '../utils/reader/BookLinesStore';

export interface BookLineWindow {
  /** The line's text, or `undefined` while its page is still in flight. */
  getLine: (index: number) => string | undefined;
  /**
   * Bumped every time a page lands.
   *
   * `getLine` is referentially stable and reads the live pages, so nothing downstream can
   * tell from its identity that new lines exist. Anything that plans work over line text —
   * the translation window, whose chunk plan stops at the first unfetched line — depends on
   * this instead.
   */
  linesVersion: number;
  /** Ask for every page covering `[start, end)`. Already-loaded pages are free. */
  requestRange: (start: number, end: number) => void;
  /** Set while a page inside the window failed to load; the reading view surfaces it rather than showing blanks. */
  error: string | null;
}

/**
 * Windowed access to an open book's lines, adapted to React from `BookLinesStore`, which
 * owns the pages, the in-flight set, eviction and the failed-page rule.
 *
 * One book per instance: `BookReader` is keyed by fingerprint (ADR-050), so the store is
 * made once and its inputs are read once, at mount — the Omissions too: `ReaderTab`
 * remounts the reader when they change.
 */
export function useBookLines(
  fingerprint: string,
  lineCount: number,
  omissions: readonly string[] = []
): BookLineWindow {
  const [store] = useState(() => new BookLinesStore({ fingerprint, lineCount, omissions }));
  const { linesVersion, error } = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    store.open();
    return () => store.close();
  }, [store]);

  return { getLine: store.getLine, linesVersion, requestRange: store.requestRange, error };
}
