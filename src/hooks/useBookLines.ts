import { useCallback, useRef, useState } from 'react';
import tauriAPI from '../tauriAPI';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';

/**
 * Lines fetched per IPC round trip. Large enough that a fast scroll does not issue a
 * request per row, small enough that a page is cheap to decode and hold.
 */
export const LINES_PER_PAGE = 500;

/**
 * Pages kept on each side of the requested range. Everything further out is dropped.
 *
 * Without this the frontend accumulates every page it ever touched, so reading a
 * 75,000-line novel straight through ends with the whole document resident — the exact
 * thing windowing exists to avoid. Eight pages either side is 4,000 lines of slack, far
 * more than any viewport plus overscan, so ordinary scrolling never re-fetches.
 */
export const PAGE_KEEP_RADIUS = 8;

export interface BookLineWindow {
  /** The line's text, or `undefined` while its page is still in flight. */
  getLine: (index: number) => string | undefined;
  /**
   * Bumped every time a page lands.
   *
   * `getLine` is referentially stable and reads through a ref, so nothing downstream can
   * tell from its identity that new lines exist. Anything that plans work over line text —
   * the translation window, whose chunk plan stops at the first unfetched line — depends on
   * this instead.
   */
  linesVersion: number;
  /** Ask for every page covering `[start, end)`. Already-loaded pages are free. */
  requestRange: (start: number, end: number) => void;
  /** Set when a fetch failed; the reading view surfaces it rather than showing blanks. */
  error: string | null;
}

/**
 * Windowed access to an open book's lines.
 *
 * The whole document never enters the frontend: pages are fetched around the viewport,
 * held in a plain `Map`, and dropped once the reader is far enough away. Line numbers are
 * the file's own, blank lines included — the backend deliberately does not compact them,
 * so index N here is line N there.
 *
 * One book per instance: `BookReader` is keyed by fingerprint, so a different book is a
 * fresh hook with empty pages, and a response from the previous book lands in an
 * unmounted one.
 */
export function useBookLines(fingerprint: string | null, lineCount: number): BookLineWindow {
  const pagesRef = useRef<Map<number, string[]>>(new Map());
  const inFlightRef = useRef<Set<number>>(new Set());
  const [linesVersion, setLinesVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (page: number): Promise<void> => {
      if (!fingerprint) return;
      if (pagesRef.current.has(page) || inFlightRef.current.has(page)) return;
      inFlightRef.current.add(page);
      const start = page * LINES_PER_PAGE;
      const end = Math.min(start + LINES_PER_PAGE, lineCount);
      try {
        const result = await tauriAPI.readBookLines(fingerprint, start, end);
        pagesRef.current.set(page, result.lines);
        setError(null);
        setLinesVersion((n) => n + 1);
      } catch (cause) {
        logger.error('Failed to read book lines:', cause);
        setError(extractErrorMessage(cause));
      } finally {
        inFlightRef.current.delete(page);
      }
    },
    [fingerprint, lineCount]
  );

  const requestRange = useCallback(
    (start: number, end: number): void => {
      if (!fingerprint || lineCount === 0) return;
      const firstPage = Math.max(0, Math.floor(start / LINES_PER_PAGE));
      const lastPage = Math.floor(Math.max(0, Math.min(end, lineCount) - 1) / LINES_PER_PAGE);

      for (let page = firstPage; page <= lastPage; page += 1) {
        void fetchPage(page);
      }

      // Drop what the reader has scrolled away from, so memory tracks the window rather
      // than the distance read.
      const keepFrom = firstPage - PAGE_KEEP_RADIUS;
      const keepTo = lastPage + PAGE_KEEP_RADIUS;
      for (const page of pagesRef.current.keys()) {
        if (page < keepFrom || page > keepTo) {
          pagesRef.current.delete(page);
        }
      }
    },
    [fetchPage, fingerprint, lineCount]
  );

  const getLine = useCallback((index: number): string | undefined => {
    const page = pagesRef.current.get(Math.floor(index / LINES_PER_PAGE));
    return page?.[index % LINES_PER_PAGE];
  }, []);

  return { getLine, linesVersion, requestRange, error };
}
