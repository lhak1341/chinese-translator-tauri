import tauriAPI from '../../tauriAPI';
import { extractErrorMessage } from '../errorHelpers';
import { logger } from '../logger';
import { setChapterOutline, setManualChapterPattern } from './BookRecordsBackend';
import { patternInEffect } from './ChapterNavigation';
import type {
  ChapterHeader,
  ChapterOutlineSummary,
  ChapterPatternCandidate,
  ChapterPatternId,
} from '../../types/ReaderTypes';

/**
 * One open book's chapter outline: running (and caching) election on a book seen for the
 * first time, fetching headers for an already-known pattern on every later open, and
 * applying a manual override. No React: `useChapterOutline` adapts it.
 *
 * Election is the expensive path (a regex pass per candidate pattern over the whole book)
 * — it runs only when `cachedOutline` is `null`, i.e. this fingerprint has never been
 * elected before. Every other case fetches headers for one pattern only, which is cheap
 * enough to do on every open.
 *
 * Three orderings live here, because they are the module's whole reason to exist:
 * - **Headers: the newest request wins.** The mount fetch and an override's fetch share a
 *   fingerprint, so only the one that *started* last may apply its result, whichever
 *   resolves last.
 * - **Election's outcome always lands.** `candidates` and the elected pattern are not an
 *   override's to discard, so they have no counter. The headers that follow are fetched
 *   against the override as it is when election resolves, not as the book opened.
 * - **The override is written in the order it was chosen**, at the moment it is chosen,
 *   not after its headers arrive.
 *
 * One book per instance (`BookReader` is keyed by fingerprint, ADR-050): the cached values
 * are read once, at construction. After `close()` nothing is applied or written.
 */

export interface ChapterOutlineInputs {
  fingerprint: string;
  /** The book record's cached outline at the moment the book was opened, or `null` if
   * this fingerprint has never been elected before. */
  cachedOutline: ChapterOutlineSummary | null;
  /** The book record's persisted manual override at open time, or `null`. */
  cachedManualPattern: ChapterPatternId | null;
}

export interface ChapterOutlineSnapshot {
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
}

export class ChapterOutlineStore {
  private readonly fingerprint: string;
  private readonly cachedOutline: ChapterOutlineSummary | null;
  private readonly listeners = new Set<() => void>();

  private headers: ChapterHeader[] = [];
  private candidates: ChapterPatternCandidate[];
  private elected: ChapterPatternId | null;
  private manual: ChapterPatternId | null;
  private isLoading = true;
  private error: string | null = null;
  private snapshot: ChapterOutlineSnapshot;

  /** The newest headers request; `pattern` is `undefined` before any. */
  private request: { id: number; pattern: ChapterPatternId | null | undefined; settled: boolean } =
    { id: 0, pattern: undefined, settled: true };
  /** True from construction until the first election's result (or failure) arrives. */
  private electionPending: boolean;

  private opened = false;
  private closed = false;

  constructor({ fingerprint, cachedOutline, cachedManualPattern }: ChapterOutlineInputs) {
    this.fingerprint = fingerprint;
    this.cachedOutline = cachedOutline;
    this.candidates = cachedOutline?.candidates ?? [];
    this.elected = cachedOutline?.pattern ?? null;
    this.manual = cachedManualPattern;
    this.electionPending = cachedOutline === null;
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ChapterOutlineSnapshot => this.snapshot;

  /** Start the book's one resolve. Idempotent: a second call (a remount) only lifts a
   * `close()`. */
  open(): void {
    this.closed = false;
    if (this.opened) return;
    this.opened = true;
    void this.resolveOnOpen();
  }

  /** The book is closing: late results are dropped and nothing more is written. */
  close(): void {
    this.closed = true;
  }

  /** Switch to a different pattern, or `null` to go back to trusting election. */
  setOverride = (pattern: ChapterPatternId | null): void => {
    if (this.closed) return;
    this.manual = pattern;
    this.isLoading = true;
    this.error = null;
    this.publish();
    // Written now, in call order — not after the headers arrive, which two quick picks can
    // resolve in the other order.
    void setManualChapterPattern(this.fingerprint, pattern).catch((cause: unknown) => {
      logger.error('Failed to persist the chapter pattern override:', cause);
    });
    void this.resolveHeaders(patternInEffect(pattern, this.elected));
  };

  private buildSnapshot(): ChapterOutlineSnapshot {
    return {
      headers: this.headers,
      candidates: this.candidates,
      activePattern: patternInEffect(this.manual, this.elected),
      isOverridden: this.manual !== null,
      isLoading: this.isLoading,
      error: this.error,
    };
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  /** Load `pattern`'s headers (or use `known` ones) as the newest headers request. Loading
   * ends with the newest request, once no election is still running. */
  private async resolveHeaders(
    pattern: ChapterPatternCandidate['pattern'] | null,
    known?: ChapterHeader[]
  ): Promise<void> {
    const request = this.request;
    const id = (request.id += 1);
    request.pattern = pattern;
    request.settled = false;
    const isNewest = () => request.id === id && !this.closed;
    try {
      const next =
        known ??
        (pattern ? await tauriAPI.chapterHeadersForPattern(this.fingerprint, pattern) : []);
      if (!isNewest()) return;
      this.headers = next;
      this.publish();
    } catch (cause) {
      if (!isNewest()) return;
      logger.error('Failed to load chapter headers:', cause);
      this.error = extractErrorMessage(cause);
      this.publish();
    } finally {
      if (isNewest()) {
        request.settled = true;
        if (!this.electionPending) {
          this.isLoading = false;
          this.publish();
        }
      }
    }
  }

  private async resolveOnOpen(): Promise<void> {
    if (this.cachedOutline) {
      await this.resolveHeaders(patternInEffect(this.manual, this.cachedOutline.pattern));
      return;
    }
    try {
      const outline = await tauriAPI.detectChapterOutline(this.fingerprint);
      if (this.closed) return;
      // Election's outcome lands whatever was chosen meanwhile.
      this.elected = outline.elected;
      this.candidates = outline.candidates;
      this.publish();
      try {
        await setChapterOutline(this.fingerprint, {
          pattern: outline.elected,
          candidates: outline.candidates,
        });
      } catch (cause) {
        logger.error('Failed to cache the chapter outline:', cause);
      }
      if (this.closed) return;
      this.electionPending = false;

      // Against the override as it is now, not as the book opened: one chosen while
      // election ran has already fetched its own pattern's headers, and going back to Auto
      // meanwhile fetched none (nothing was elected yet to fetch).
      const effective = patternInEffect(this.manual, outline.elected);
      if (this.request.pattern === effective) {
        if (this.request.settled) {
          this.isLoading = false;
          this.publish();
        }
      } else {
        // The election call already returns the winner's headers — reuse them instead of
        // a second round trip when nothing points somewhere else.
        await this.resolveHeaders(
          effective,
          effective === outline.elected ? outline.headers : undefined
        );
      }
    } catch (cause) {
      if (this.closed) return;
      this.electionPending = false;
      logger.error('Failed to load the chapter outline:', cause);
      this.error = extractErrorMessage(cause);
      if (this.request.settled) this.isLoading = false;
      this.publish();
    }
  }
}
