import type { ReadingPosition } from '../../types/ReaderTypes';
import { logger } from '../logger';
import { countVisibleLines, nextViewportLines } from './TranslationWindow';

/**
 * The Reader's one answer to "where is the reader" — see GLOSSARY.md's "Reading Anchor".
 *
 * Owns the anchor (line plus sub-line fraction), the viewport line count measured in the
 * same pass, jumps, the debounced write to `books.json`, restoring on open, re-anchoring
 * across a dictionary reload, and relayout after an Appearance change — including either
 * of those two happening while the Reader was a hidden tab. No React: `useReadingAnchor`
 * adapts it, and time, frames and storage are injected so every timing rule here is
 * testable with a hand-driven clock.
 */

/** How long an idle scroll must sit before the position is written to disk. Debounced
 * rather than written per scroll tick — a fast flick through a chapter would otherwise
 * fire dozens of writes a second. */
const POSITION_DEBOUNCE_MS = 1500;

/**
 * Frames a restore on open keeps retrying while the panel has no layout yet — one on the
 * next frame plus this many more.
 */
const RESTORE_RETRY_FRAMES = 10;

/**
 * How long the refill must stay quiet before a reload's re-anchor leaves the reader alone.
 *
 * One restore is not enough: the refill replaces a chunk's text at a time, and each swap
 * changes the offset of every row below it, so the line under the reader keeps moving for
 * as long as the band takes to come back. The loop therefore runs until the thing that
 * moves rows has stopped.
 *
 * `isTranslating` alone is not that signal — it goes false and true again each time the
 * fill is re-planned, so a bare `!isTranslating` would end the window in the gap between
 * two chunks. Continuously false for this long is: re-planning turns it back on within a
 * frame or two, well inside the interval.
 */
const REFILL_SETTLE_MS = 250;

/**
 * How long a reload is given to start refilling before quiet counts as finished.
 *
 * The anchor is captured when the reload lands, which is before the fill has re-planned
 * anything — so for the first frames the refill is idle simply because nothing has started
 * yet. Without this, that gap reads as "settled" and the window closes before the refill
 * that moves the rows even begins.
 */
const REFILL_GRACE_MS = 1500;

/**
 * The hard ceiling on a re-anchor, whatever the refill is doing.
 *
 * A fill that never settles — an engine erroring on every chunk, a band that keeps being
 * re-planned — must not leave a loop fighting the reader forever. Generous, because the
 * cheaper protection is the reader's own first wheel or keypress, which ends it instantly.
 */
const REANCHOR_CEILING_MS = 15000;

/**
 * How close the sub-line fraction has to be to count as already in place.
 *
 * A row is tens of pixels tall, so a hundredth of one is well under a pixel — far below
 * anything the reader could see, and far above the rounding a fractional `scrollTop`
 * produces.
 */
const FRACTION_EPSILON = 0.01;

/** Modifier presses on their own are not navigation, so they must not end a re-anchor —
 * holding Shift before typing would otherwise abandon it. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/**
 * Lines the viewport is assumed to hold before it has been measured once. Only the very
 * first fill uses it; every later one is driven by the measured count.
 */
export const DEFAULT_VIEWPORT_LINES = 30;

interface VirtualItem {
  index: number;
  start: number;
  size: number;
}

export interface RestoreTarget {
  scrollToIndex: (index: number, options?: { align?: 'start' }) => void;
  getVirtualItems: () => VirtualItem[];
}

/** The master panel's virtualizer, as far as the anchor uses it. */
export type AnchorVirtualizer = RestoreTarget & { measure: () => void };

/** What the anchor reads live from the Reader on every call — never a stale copy. */
export interface ReadingAnchorInputs {
  /** The scroll master: the panel the anchor is measured on and restored to. */
  master: {
    scrollRef: { readonly current: HTMLElement | null };
    virtualizer: AnchorVirtualizer;
  };
  /** The other panels. They follow the master through the panel sync, so the anchor only
   * ever has to throw away their measurement caches on a relayout. */
  followers: readonly { measure: () => void }[];
  lineCount: number;
  /** Whether the windowed refill is translating — the thing that moves rows after a
   * reload. A function because it is read each frame of the re-anchor loop. */
  isRefilling: () => boolean;
}

export interface ReadingAnchorSnapshot {
  /** The anchor's line: what the chapter strip shows and the translation window centres on. */
  anchorLine: number;
  /** How many lines the master's viewport holds, as last measured. */
  viewportLines: number;
}

export interface ReadingAnchorDeps {
  persist: (fingerprint: string, position: ReadingPosition) => Promise<void>;
  now?: () => number;
  timers?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
  frames?: {
    request: (fn: () => void) => number;
    cancel: (id: number) => void;
  };
}

/**
 * The topmost line touching the viewport, plus how far scrolled into it (0..1) —
 * the anchor persisted as a reading position. A raw pixel `scrollTop` is not persisted:
 * total document height is an estimate that shifts as rows get measured, so a pixel
 * offset from one session means nothing in the next.
 */
export function computeAnchor(
  scrollTop: number,
  virtualItems: VirtualItem[]
): ReadingPosition | null {
  let anchor: VirtualItem | null = null;
  for (const item of virtualItems) {
    if (item.start <= scrollTop && (!anchor || item.start > anchor.start)) {
      anchor = item;
    }
  }
  if (!anchor) {
    return virtualItems.length > 0 ? { line: virtualItems[0].index, fraction: 0 } : null;
  }
  const fraction =
    anchor.size > 0 ? Math.max(0, Math.min(1, (scrollTop - anchor.start) / anchor.size)) : 0;
  return { line: anchor.index, fraction };
}

/**
 * One restore attempt: scroll to the anchor line, then nudge by its stored fraction once
 * that row has a real measured size. Returns `false` (retry) only while the scroll element
 * itself has no layout yet. Once it is laid out, `scrollToIndex` is safe to call even
 * before every row is measured — the virtualizer re-measures and the position can only
 * improve.
 */
export function tryRestorePosition(
  scrollEl: HTMLElement | null,
  virtualizer: RestoreTarget,
  lineCount: number,
  position: ReadingPosition
): boolean {
  if (!scrollEl || scrollEl.clientHeight === 0) return false;
  if (lineCount === 0) return true;

  const line = Math.max(0, Math.min(position.line, lineCount - 1));
  virtualizer.scrollToIndex(line, { align: 'start' });

  if (position.fraction > 0) {
    const item = virtualizer.getVirtualItems().find((candidate) => candidate.index === line);
    if (item) {
      scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop + position.fraction * item.size);
    }
  }
  return true;
}

/**
 * Whether the reader is already where the re-anchor wants them.
 *
 * The loop runs every frame for as long as the refill does — which can be seconds — and
 * most of those frames change nothing. Restoring anyway is not free: `scrollToIndex` writes
 * `scrollTop`, the write fires a `scroll` event, the Reader re-measures and re-renders
 * three virtualized panels, once per frame. Checking first turns that into a read of the
 * rendered range.
 */
function isAnchorInPlace(
  scrollEl: HTMLElement | null,
  virtualizer: RestoreTarget,
  captured: ReadingPosition
): boolean {
  if (!scrollEl) return false;
  const rows = virtualizer.getVirtualItems();

  // `computeAnchor` answers even when no row starts at or before the scroll offset: it
  // falls back to the first row at fraction 0, which is the right answer for "where is the
  // reader" and the wrong one here. That fallback can equal the captured anchor while the
  // row in question sits hundreds of pixels away, and believing it would stop the loop
  // correcting exactly when it is most needed. Only a resolved anchor may settle this.
  const scrollTop = scrollEl.scrollTop;
  if (!rows.some((row) => row.start <= scrollTop)) return false;

  const current = computeAnchor(scrollTop, rows);
  if (!current) return false;
  return (
    current.line === captured.line &&
    Math.abs(current.fraction - captured.fraction) < FRACTION_EPSILON
  );
}

const DETACHED_INPUTS: ReadingAnchorInputs = {
  master: {
    scrollRef: { current: null },
    virtualizer: { scrollToIndex: () => {}, getVirtualItems: () => [], measure: () => {} },
  },
  followers: [],
  lineCount: 0,
  isRefilling: () => false,
};

export class ReadingAnchor {
  readonly #persist: ReadingAnchorDeps['persist'];
  readonly #now: () => number;
  readonly #timers: NonNullable<ReadingAnchorDeps['timers']>;
  readonly #frames: NonNullable<ReadingAnchorDeps['frames']>;

  #inputs: ReadingAnchorInputs = DETACHED_INPUTS;
  #fingerprint: string | null = null;
  #isActive = false;

  /** At full precision. `null` until the first measurement or jump. */
  #anchor: ReadingPosition | null = null;
  #snapshot: ReadingAnchorSnapshot = { anchorLine: 0, viewportLines: DEFAULT_VIEWPORT_LINES };
  readonly #listeners = new Set<() => void>();

  /** Set by a jump, consumed by the very next measurement — see `scrollToLine`. */
  #skipNextMeasure = false;

  #pending: ReadingPosition | null = null;
  #debounce: unknown = null;

  #restoreFrame: number | null = null;
  #reanchorFrame: number | null = null;
  #relayoutFrame: number | null = null;

  /** Row heights changed while the Reader was hidden; fix them when it is shown. */
  #relayoutOnReturn = false;
  #reanchorOnReturn = false;

  constructor(deps: ReadingAnchorDeps) {
    this.#persist = deps.persist;
    this.#now = deps.now ?? Date.now;
    this.#timers = deps.timers ?? {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    this.#frames = deps.frames ?? {
      request: (fn) => requestAnimationFrame(fn),
      cancel: (id) => cancelAnimationFrame(id),
    };
  }

  // ── Wiring ────────────────────────────────────────────────────────────────

  /** Called on every render with whatever the Reader has now. */
  setInputs(inputs: ReadingAnchorInputs): void {
    this.#inputs = inputs;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): ReadingAnchorSnapshot => this.#snapshot;

  // ── Book lifecycle ────────────────────────────────────────────────────────

  /** A book opened: restore where it was left, if it was ever opened before. */
  open(fingerprint: string, initialPosition: ReadingPosition | null): void {
    this.#fingerprint = fingerprint;
    if (initialPosition) this.#restoreOnOpen(initialPosition);
  }

  /** The book closed (Back to the shelf, or another book replacing it): write what is
   * pending under this book's fingerprint and drop everything still scheduled for it. */
  close(): void {
    void this.flush();
    this.#cancelFrame(this.#restoreFrame);
    this.#restoreFrame = null;
    this.#stopReanchor();
    this.#cancelFrame(this.#relayoutFrame);
    this.#relayoutFrame = null;
    this.#relayoutOnReturn = false;
    this.#reanchorOnReturn = false;
    this.#anchor = null;
    this.#skipNextMeasure = false;
    this.#fingerprint = null;
  }

  /**
   * Whether the Reader is the visible tab. Every tab stays mounted across a switch, so this
   * is the only signal that reading stopped (flush the pending write) or resumed (apply
   * whatever changed row heights while it was hidden).
   */
  setActive(isActive: boolean): void {
    if (isActive === this.#isActive) return;
    this.#isActive = isActive;
    if (!isActive) {
      void this.flush();
      return;
    }
    const relayout = this.#relayoutOnReturn;
    const reanchor = this.#reanchorOnReturn;
    this.#relayoutOnReturn = false;
    this.#reanchorOnReturn = false;
    if (relayout) this.#measureAllPanels();
    // The re-anchor loop restores on its first step and every frame after, which covers
    // the relayout's single restore too.
    if (reanchor) this.#startReanchor();
    else if (relayout) this.#scheduleRelayoutRestore();
  }

  /** Write the pending position now — the tab-away, close and app-exit path. Never rejects. */
  flush(): Promise<void> {
    if (this.#debounce !== null) {
      this.#timers.clear(this.#debounce);
      this.#debounce = null;
    }
    const pending = this.#pending;
    const fingerprint = this.#fingerprint;
    this.#pending = null;
    if (!pending || fingerprint === null) return Promise.resolve();
    return this.#persist(fingerprint, pending).catch((cause: unknown) => {
      logger.error('Failed to save reading position:', cause);
    });
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  /** The master scrolled: measure, publish, and queue the position for writing. */
  onScroll(): void {
    // Until the restore on open has landed, the reader is wherever the first layout left them
    // (the top), not where they were: measuring that would queue it over the saved position.
    const anchor = this.#measure(this.#restoreFrame === null);
    if (anchor) this.#queueWrite(anchor);
  }

  /**
   * The rendered range moved without a scroll of the reader's own — the first paint, a
   * window resize, a row growing as its translation lands. Measured and published, not
   * written: nothing the reader did moved them.
   */
  onRangeChange(): void {
    this.#measure();
  }

  /**
   * Every programmatic jump goes through here rather than a bare `scrollToIndex` call.
   *
   * The anchor is set here, synchronously, rather than left to the next measurement: the
   * scroll event this jump fires races the virtualizer's own range recalculation, so a
   * measurement landing first reads the *pre*-jump range and leaves the anchor one jump
   * behind — and a key-repeated `]` then recomputes the same chapter it just jumped to.
   *
   * The measurement after a jump is thrown away, published and written alike. The line
   * jumped to has only ever been estimated, and translated Vietnamese routinely wraps
   * taller than the estimate, so once it and the rows above it render and measure, the
   * settling shifts which line a given `scrollTop` falls on — backward, enough right after
   * a chapter jump to land before the header just jumped to. One skip is enough: by the
   * measurement after that one the settling has already happened.
   *
   * `align: 'start'` puts the line at the very top of the viewport, so fraction 0 needs no
   * measurement to be correct — and is what gets written, even if the reader then stays put.
   */
  scrollToLine(line: number): void {
    this.#inputs.master.virtualizer.scrollToIndex(line, { align: 'start' });
    const anchor = { line, fraction: 0 };
    this.#anchor = anchor;
    this.#publish({ anchorLine: line });
    this.#skipNextMeasure = true;
    this.#queueWrite(anchor);
  }

  /** The anchor's line as of right now, not as of the last render — for a key-repeated
   * `]` that fires before React has re-rendered from the previous press. */
  readLine(): number {
    return this.#anchor?.line ?? this.#snapshot.anchorLine;
  }

  // ── Things that change row heights ────────────────────────────────────────

  /** A dictionary reload landed: every row is about to be re-translated at a new height. */
  engineReloaded(): void {
    if (!this.#isActive) {
      this.#reanchorOnReturn = true;
      return;
    }
    this.#startReanchor();
  }

  /** The Appearance settings changed: every row's measured height is now wrong. */
  appearanceChanged(): void {
    if (!this.#isActive) {
      // A hidden panel measures every row as zero-height, so measuring now would throw away
      // a stale cache for an empty one.
      this.#relayoutOnReturn = true;
      return;
    }
    this.#measureAllPanels();
    this.#scheduleRelayoutRestore();
  }

  /** The reader touched the controls: a re-anchor in progress hands the view back. */
  userInput(event: { type: string; key?: string }): void {
    if (event.type === 'keydown' && event.key !== undefined && MODIFIER_KEYS.has(event.key)) {
      return;
    }
    this.#stopReanchor();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * One geometry read of the master, two outputs: the viewport line count, and — unless a
   * jump just claimed this measurement — the anchor.
   */
  #measure(trackAnchor = true): ReadingPosition | null {
    const scrollEl = this.#inputs.master.scrollRef.current;
    if (!scrollEl) return null;
    const rows = this.#inputs.master.virtualizer.getVirtualItems();
    const visible = countVisibleLines(rows, scrollEl.scrollTop, scrollEl.clientHeight);
    const viewportLines = nextViewportLines(this.#snapshot.viewportLines, visible);

    const skip = this.#skipNextMeasure;
    this.#skipNextMeasure = false;
    const anchor = skip || !trackAnchor ? null : computeAnchor(scrollEl.scrollTop, rows);
    if (anchor) this.#anchor = anchor;
    this.#publish(anchor ? { viewportLines, anchorLine: anchor.line } : { viewportLines });
    return anchor;
  }

  #publish(change: Partial<ReadingAnchorSnapshot>): void {
    const next = { ...this.#snapshot, ...change };
    if (
      next.anchorLine === this.#snapshot.anchorLine &&
      next.viewportLines === this.#snapshot.viewportLines
    ) {
      return;
    }
    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
  }

  #queueWrite(position: ReadingPosition): void {
    this.#pending = position;
    if (this.#debounce !== null) this.#timers.clear(this.#debounce);
    this.#debounce = this.#timers.set(() => {
      this.#debounce = null;
      void this.flush();
    }, POSITION_DEBOUNCE_MS);
  }

  #restoreOnOpen(position: ReadingPosition): void {
    this.#cancelFrame(this.#restoreFrame);
    const attempt = (attemptsLeft: number): void => {
      this.#restoreFrame = this.#frames.request(() => {
        this.#restoreFrame = null;
        const { master, lineCount } = this.#inputs;
        const done = tryRestorePosition(
          master.scrollRef.current,
          master.virtualizer,
          lineCount,
          position
        );
        if (!done && attemptsLeft > 0) attempt(attemptsLeft - 1);
        if (done && lineCount > 0) this.#adoptRestored(position, lineCount);
      });
    };
    attempt(RESTORE_RETRY_FRAMES);
  }

  /**
   * The restore is a programmatic jump like `scrollToLine`, and its own scroll event has the
   * same flaw: the line it lands on is only estimated, so measuring it reads some other line and
   * would queue that over the saved position. The saved position is already on disk, so adopt it
   * as the anchor without queueing a write, and discard the next measurement.
   */
  #adoptRestored(position: ReadingPosition, lineCount: number): void {
    const line = Math.max(0, Math.min(position.line, lineCount - 1));
    this.#anchor = { line, fraction: position.fraction };
    this.#publish({ anchorLine: line });
    this.#skipNextMeasure = true;
  }

  #measureAllPanels(): void {
    this.#inputs.master.virtualizer.measure();
    for (const follower of this.#inputs.followers) follower.measure();
  }

  /** Next frame: rows re-measure on the layout that follows `measure()`, and restoring
   * before that would aim at the heights just discarded. One restore, not a window of
   * them — the new heights land in a single layout pass. */
  #scheduleRelayoutRestore(): void {
    const captured = this.#anchor;
    if (!captured) return;
    this.#cancelFrame(this.#relayoutFrame);
    this.#relayoutFrame = this.#frames.request(() => {
      this.#relayoutFrame = null;
      const { master, lineCount } = this.#inputs;
      tryRestorePosition(master.scrollRef.current, master.virtualizer, lineCount, captured);
    });
  }

  /**
   * Re-apply the captured anchor once a frame until the refill has stopped moving rows.
   *
   * Re-applying every frame is what makes rows *above* the anchor free: `scrollToIndex`
   * recomputes from the virtualizer's current geometry, so a row that grew a line
   * somewhere up the document costs nothing. What the loop cannot undo is the anchor row's
   * own height changing, which moves the sub-line fraction by at most one row.
   */
  #startReanchor(): void {
    this.#stopReanchor();
    const captured = this.#anchor;
    if (!captured) return;

    const armedAt = this.#now();
    const ceiling = armedAt + REANCHOR_CEILING_MS;
    /** When the refill last went quiet, or `null` while it is working. */
    let quietSince: number | null = null;
    /** Whether a refill was ever seen — until then, quiet only means "not started". */
    let sawRefill = false;

    const step = (): void => {
      this.#reanchorFrame = null;
      const now = this.#now();
      if (now > ceiling) return;

      const { master, lineCount, isRefilling } = this.#inputs;
      if (isRefilling()) {
        sawRefill = true;
        quietSince = null;
      } else {
        quietSince ??= now;
      }
      // A refill that has run and then gone quiet is finished. One that has not started
      // yet gets the grace period before its quiet is believed.
      const quietLongEnough = quietSince !== null && now - quietSince >= REFILL_SETTLE_MS;
      const believable = sawRefill || now - armedAt >= REFILL_GRACE_MS;
      if (quietLongEnough && believable) return;

      const scrollEl = master.scrollRef.current;
      if (!isAnchorInPlace(scrollEl, master.virtualizer, captured)) {
        tryRestorePosition(scrollEl, master.virtualizer, lineCount, captured);
      }
      this.#reanchorFrame = this.#frames.request(step);
    };
    step();
  }

  #stopReanchor(): void {
    this.#cancelFrame(this.#reanchorFrame);
    this.#reanchorFrame = null;
  }

  #cancelFrame(id: number | null): void {
    if (id !== null) this.#frames.cancel(id);
  }
}
