import { extractErrorMessage } from '../errorHelpers';
import { logger } from '../logger';

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

export interface BookLinesInputs {
  fingerprint: string;
  lineCount: number;
}

export interface BookLinesSnapshot {
  /**
   * Bumped every time a page lands in the window.
   *
   * `getLine` is referentially stable and reads the live pages, so nothing downstream can
   * tell from its identity that new lines exist. Anything that plans work over line text —
   * the translation window, whose chunk plan stops at the first unfetched line — depends on
   * this instead. Eviction does not bump it: it only runs inside `requestRange`, whose
   * caller is reading lines near the same viewport.
   */
  linesVersion: number;
  /**
   * The message of the oldest failed page still inside the window, else `null`. Another
   * page landing does not clear it — the failed page is still blank — only that page
   * landing on a retry, or the reader scrolling out of its reach, does.
   */
  error: string | null;
}

/**
 * Windowed access to one open book's lines.
 *
 * The whole document never enters the frontend: pages are fetched around the viewport,
 * held in a plain `Map`, and dropped once the reader is far enough away. Line numbers are
 * the file's own, blank lines included — the backend deliberately does not compact them,
 * so index N here is line N there.
 *
 * One book per instance: `BookReader` is keyed by fingerprint (ADR-050), so the inputs are
 * read once, at construction. The store starts open; `close()` drops every result still in
 * flight, and `open()` lifts a `close()` so a remount can reuse the instance. `subscribe`
 * and `getSnapshot` follow `useSyncExternalStore`.
 */
export class BookLinesStore {
  private readonly fingerprint: string;
  private readonly lineCount: number;

  private readonly pages = new Map<number, string[]>();
  private readonly inFlight = new Set<number>();
  /** Page → message, in failure order. Only pages inside the window are kept. */
  private readonly failed = new Map<number, string>();
  /** The pages covered by the latest `requestRange`; the keep window is this ± the radius. */
  private firstPage = 0;
  private lastPage = -1;

  private closed = false;
  private snapshot: BookLinesSnapshot = { linesVersion: 0, error: null };
  private readonly listeners = new Set<() => void>();

  constructor({ fingerprint, lineCount }: BookLinesInputs) {
    this.fingerprint = fingerprint;
    this.lineCount = lineCount;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): BookLinesSnapshot => this.snapshot;

  /** Idempotent. Lifts a `close()`; a store that was never closed is already open. */
  open(): void {
    this.closed = false;
  }

  /** Results still in flight are dropped when they land. */
  close(): void {
    this.closed = true;
  }

  /** The line's text, or `undefined` while its page is not loaded. A real blank line is `''`. */
  getLine = (index: number): string | undefined => {
    const page = this.pages.get(Math.floor(index / LINES_PER_PAGE));
    return page?.[index % LINES_PER_PAGE];
  };

  /** Ask for every page covering `[start, end)`. Already-loaded pages are free. */
  requestRange = (start: number, end: number): void => {
    if (this.closed || this.lineCount === 0) return;
    this.firstPage = Math.max(0, Math.floor(start / LINES_PER_PAGE));
    this.lastPage = Math.floor(Math.max(0, Math.min(end, this.lineCount) - 1) / LINES_PER_PAGE);

    for (let page = this.firstPage; page <= this.lastPage; page += 1) {
      void this.fetchPage(page);
    }

    // Drop what the reader has scrolled away from, so memory tracks the window rather
    // than the distance read.
    let failureCleared = false;
    for (const page of this.pages.keys()) {
      if (!this.inWindow(page)) this.pages.delete(page);
    }
    for (const page of this.failed.keys()) {
      if (!this.inWindow(page)) failureCleared = this.failed.delete(page) || failureCleared;
    }
    if (failureCleared) this.publish(false);
  };

  private inWindow(page: number): boolean {
    return page >= this.firstPage - PAGE_KEEP_RADIUS && page <= this.lastPage + PAGE_KEEP_RADIUS;
  }

  private async fetchPage(page: number): Promise<void> {
    if (this.pages.has(page) || this.inFlight.has(page)) return;
    this.inFlight.add(page);
    const start = page * LINES_PER_PAGE;
    const end = Math.min(start + LINES_PER_PAGE, this.lineCount);
    try {
      const result = await window.electronAPI.readBookLines(this.fingerprint, start, end);
      if (this.closed || !this.inWindow(page)) return;
      this.pages.set(page, result.lines);
      this.failed.delete(page);
      this.publish(true);
    } catch (cause) {
      if (this.closed) return;
      logger.error('Failed to read book lines:', cause);
      if (!this.inWindow(page)) return;
      this.failed.set(page, extractErrorMessage(cause));
      this.publish(false);
    } finally {
      this.inFlight.delete(page);
    }
  }

  /** Replace the snapshot when something a subscriber can see changed, then notify. */
  private publish(pageLanded: boolean): void {
    const error = this.failed.values().next().value ?? null;
    if (!pageLanded && error === this.snapshot.error) return;
    this.snapshot = {
      linesVersion: this.snapshot.linesVersion + (pageLanded ? 1 : 0),
      error,
    };
    for (const listener of this.listeners) listener();
  }
}
