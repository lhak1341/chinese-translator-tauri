import { useCallback, useEffect, useRef, useState } from 'react';
import tauriAPI from '../tauriAPI';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';
import { setChapterOutline, setManualChapterPattern } from '../utils/reader/BookRecordsBackend';
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

  // "Latest ref" pattern: `setOverride` is a stable callback (empty dep array) but must
  // always act against the current book and its current elected pattern.
  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;
  const electedPatternRef = useRef(electedPattern);
  electedPatternRef.current = electedPattern;

  // Guards every async resolution in this hook, including across the mount effect and
  // `setOverride`: whichever fetch *started* last is the only one allowed to apply its
  // result, regardless of which one *resolves* last. A same-fingerprint check alone
  // doesn't cover this — the mount effect's own fetch and an override's fetch share the
  // same fingerprint, so neither trips on the other.
  const requestIdRef = useRef(0);

  // One resolve per book: run election if this fingerprint has never been elected, else
  // fetch headers for whichever pattern (override or election) already applies to it.
  useEffect(() => {
    const requestId = (requestIdRef.current += 1);
    setIsLoading(true);
    setError(null);
    setHeaders([]);
    setCandidates(cachedOutline?.candidates ?? []);
    setElectedPattern(cachedOutline?.pattern ?? null);
    setManualPatternState(cachedManualPattern);

    void (async () => {
      try {
        let nextCandidates = cachedOutline?.candidates ?? [];
        let nextElected = cachedOutline?.pattern ?? null;
        // `null` means "not yet resolved" — distinct from a pattern that legitimately
        // has zero headers, which is a valid resolved answer.
        let nextHeaders: ChapterHeader[] | null = null;

        if (!cachedOutline) {
          const outline = await tauriAPI.detectChapterOutline(fingerprint);
          nextCandidates = outline.candidates;
          nextElected = outline.elected;
          // The election call already returns the winner's headers — reuse them instead
          // of a second round trip when there's no override pointing somewhere else.
          if ((cachedManualPattern ?? outline.elected) === outline.elected) {
            nextHeaders = outline.headers;
          }
          try {
            await setChapterOutline(fingerprint, {
              pattern: outline.elected,
              candidates: outline.candidates,
            });
          } catch (cause) {
            logger.error('Failed to cache the chapter outline:', cause);
          }
        }

        const effectivePattern = cachedManualPattern ?? nextElected;
        nextHeaders ??= effectivePattern
          ? await tauriAPI.chapterHeadersForPattern(fingerprint, effectivePattern)
          : [];

        if (requestIdRef.current !== requestId) return;
        setCandidates(nextCandidates);
        setElectedPattern(nextElected);
        setHeaders(nextHeaders);
      } catch (cause) {
        if (requestIdRef.current !== requestId) return;
        logger.error('Failed to load the chapter outline:', cause);
        setError(extractErrorMessage(cause));
      } finally {
        if (requestIdRef.current === requestId) setIsLoading(false);
      }
    })();

    // cachedOutline/cachedManualPattern are read only at the moment a book opens — the
    // effect re-runs on a new book (fingerprint change), never because the cache values
    // themselves changed identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const setOverride = useCallback((pattern: ChapterPatternId | null): void => {
    const targetFingerprint = fingerprintRef.current;
    const requestId = (requestIdRef.current += 1);
    setManualPatternState(pattern);
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const effectivePattern = pattern ?? electedPatternRef.current;
        const nextHeaders = effectivePattern
          ? await tauriAPI.chapterHeadersForPattern(targetFingerprint, effectivePattern)
          : [];
        if (requestIdRef.current !== requestId) return;
        setHeaders(nextHeaders);
      } catch (cause) {
        if (requestIdRef.current !== requestId) return;
        logger.error('Failed to load headers for the chosen pattern:', cause);
        setError(extractErrorMessage(cause));
      } finally {
        if (requestIdRef.current === requestId) setIsLoading(false);
      }
      try {
        await setManualChapterPattern(targetFingerprint, pattern);
      } catch (cause) {
        logger.error('Failed to persist the chapter pattern override:', cause);
      }
    })();
  }, []);

  return {
    headers,
    candidates,
    activePattern: manualPattern ?? electedPattern,
    isOverridden: manualPattern !== null,
    isLoading,
    error,
    setOverride,
  };
}
