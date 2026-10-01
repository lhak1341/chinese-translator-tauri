import { useCallback, useEffect, useRef, useState } from 'react';
import tauriAPI from '../tauriAPI';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import { setChapterOutline, setManualChapterPattern } from '../utils/reader/BookRecordsBackend';
import { patternInEffect } from '../utils/reader/ChapterNavigation';
import type {
  ChapterHeader,
  ChapterOutlineSummary,
  ChapterPatternCandidate,
  ChapterPatternId,
} from '../types/ReaderTypes';

export interface UseChapterOutlineOptions {
  fingerprint: string;
  /** The book record's cached outline at the moment the book was opened, or `null` if
   * this fingerprint has never been elected before. Read once per book — later changes
   * to the record from elsewhere are not reflected back into this hook. */
  cachedOutline: ChapterOutlineSummary | null;
  /** The book record's persisted manual override at open time, or `null`. */
  cachedManualPattern: ChapterPatternId | null;
}

export interface ChapterOutlineState {
  /** Headers for the active pattern, in ascending line order. Empty while loading, on
   * error, or when nothing is elected and no override is set. */
  headers: ChapterHeader[];
  /** Every pattern's election stats, for the override control. */
  candidates: ChapterPatternCandidate[];
  /** The pattern actually driving `headers`: the manual override when one is set,
   * otherwise the elected pattern, otherwise `null`. */
  activePattern: ChapterPatternId | null;
  isOverridden: boolean;
  isLoading: boolean;
  error: string | null;
  /** Switch to a different pattern, or `null` to go back to trusting election. Persists
   * to the book record. */
  setOverride: (pattern: ChapterPatternId | null) => void;
}

/**
 * Owns the chapter-outline lifecycle for one open book: running (and caching) election on
 * a book seen for the first time, fetching headers for an already-known pattern on every
 * later open, and applying a manual override.
 *
 * Election is the expensive path (a regex pass per candidate pattern over the whole
 * book) — it runs only when `cachedOutline` is `null`, i.e. this fingerprint has never
 * been elected before. Every other case fetches headers for one pattern only, which is
 * cheap enough to do on every open.
 *
 * One book per instance: `BookReader` is keyed by fingerprint, so the resolve below runs
 * once, on mount, and `fingerprint` never changes under it.
 */
export function useChapterOutline({
  fingerprint,
  cachedOutline,
  cachedManualPattern,
}: UseChapterOutlineOptions): ChapterOutlineState {
  const [headers, setHeaders] = useState<ChapterHeader[]>([]);
  const [candidates, setCandidates] = useState<ChapterPatternCandidate[]>(
    cachedOutline?.candidates ?? []
  );
  const [electedPattern, setElectedPattern] = useState<ChapterPatternId | null>(
    cachedOutline?.pattern ?? null
  );
  const [manualPattern, setManualPatternState] = useState<ChapterPatternId | null>(
    cachedManualPattern
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // "Latest ref" pattern: `setOverride` is a stable callback but must always act against
  // the current elected pattern and override. Both are also written where they change,
  // not only at render, because the election resolves after an `await` and must see an
  // override chosen while it ran.
  const electedPatternRef = useRef(electedPattern);
  electedPatternRef.current = electedPattern;
  const manualPatternRef = useRef(manualPattern);

  /**
   * The newest headers request. Whichever fetch *started* last is the only one allowed to
   * apply its result, regardless of which one *resolves* last — a same-fingerprint check
   * alone doesn't cover that, since the mount fetch and an override's fetch share the
   * fingerprint. It guards headers only: election's own outcome (`candidates` and the
   * elected pattern) is not an override's to discard, so it has no counter and always lands.
   */
  const headersRequestRef = useRef<{
    id: number;
    /** The pattern the newest request fetched for; `undefined` before any. */
    pattern: ChapterPatternId | null | undefined;
    settled: boolean;
  }>({ id: 0, pattern: undefined, settled: true });
  /** True from mount until the first election's result (or failure) arrives. */
  const electionPendingRef = useRef(cachedOutline === null);

  /** Load `pattern`'s headers (or use `known` ones) as the newest headers request. Loading
   * ends with the newest request, once no election is still running. */
  const resolveHeaders = useCallback(
    async (pattern: ChapterPatternId | null, known?: ChapterHeader[]): Promise<void> => {
      const request = headersRequestRef.current;
      const id = (request.id += 1);
      request.pattern = pattern;
      request.settled = false;
      const isNewest = () => request.id === id;
      try {
        const next =
          known ?? (pattern ? await tauriAPI.chapterHeadersForPattern(fingerprint, pattern) : []);
        if (!isNewest()) return;
        setHeaders(next);
      } catch (cause) {
        if (!isNewest()) return;
        logger.error('Failed to load chapter headers:', cause);
        setError(extractErrorMessage(cause));
      } finally {
        if (isNewest()) {
          request.settled = true;
          if (!electionPendingRef.current) setIsLoading(false);
        }
      }
    },
    [fingerprint]
  );

  // One resolve per book: run election if this fingerprint has never been elected, else
  // fetch headers for whichever pattern (override or election) already applies to it.
  useEffect(() => {
    void (async () => {
      if (cachedOutline) {
        await resolveHeaders(patternInEffect(manualPatternRef.current, cachedOutline.pattern));
        return;
      }
      try {
        const outline = await tauriAPI.detectChapterOutline(fingerprint);
        // Election's outcome lands whatever was chosen meanwhile.
        electedPatternRef.current = outline.elected;
        setCandidates(outline.candidates);
        setElectedPattern(outline.elected);
        try {
          await setChapterOutline(fingerprint, {
            pattern: outline.elected,
            candidates: outline.candidates,
          });
        } catch (cause) {
          logger.error('Failed to cache the chapter outline:', cause);
        }
        electionPendingRef.current = false;

        // Against the override as it is now, not as the book opened: one chosen while
        // election ran has already fetched its own pattern's headers, and going back to Auto
        // meanwhile fetched none (nothing was elected yet to fetch).
        const effective = patternInEffect(manualPatternRef.current, outline.elected);
        if (headersRequestRef.current.pattern === effective) {
          if (headersRequestRef.current.settled) setIsLoading(false);
        } else {
          // The election call already returns the winner's headers — reuse them instead of
          // a second round trip when nothing points somewhere else.
          await resolveHeaders(
            effective,
            effective === outline.elected ? outline.headers : undefined
          );
        }
      } catch (cause) {
        electionPendingRef.current = false;
        logger.error('Failed to load the chapter outline:', cause);
        setError(extractErrorMessage(cause));
        if (headersRequestRef.current.settled) setIsLoading(false);
      }
    })();

    // cachedOutline is read only at the moment a book opens, and `fingerprint` is fixed for
    // this instance — the effect never re-runs because the cache values themselves changed
    // identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const setOverride = useCallback(
    (pattern: ChapterPatternId | null): void => {
      manualPatternRef.current = pattern;
      setManualPatternState(pattern);
      setIsLoading(true);
      setError(null);
      void (async () => {
        await resolveHeaders(patternInEffect(pattern, electedPatternRef.current));
        try {
          await setManualChapterPattern(fingerprint, pattern);
        } catch (cause) {
          logger.error('Failed to persist the chapter pattern override:', cause);
        }
      })();
    },
    [fingerprint, resolveHeaders]
  );

  return {
    headers,
    candidates,
    activePattern: patternInEffect(manualPattern, electedPattern),
    isOverridden: manualPattern !== null,
    isLoading,
    error,
    setOverride,
  };
}
