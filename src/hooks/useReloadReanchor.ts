import { useEffect, useRef } from 'react';
import type React from 'react';
import { computeAnchor, tryRestorePosition, type RestoreTarget } from './useReadingPosition';
import type { ReadingPosition } from '../types/ReaderTypes';

/**
 * How long the refill must stay quiet before the anchor is left alone.
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
 * The anchor is captured when `engineVersion` bumps, which is before the fill effect has
 * re-planned anything — so for the first frames `isTranslating` is false simply because
 * nothing has started yet. Without this, that gap reads as "settled" and the window closes
 * before the refill that moves the rows even begins.
 */
const REFILL_GRACE_MS = 1500;

/**
 * The hard ceiling, whatever the refill is doing.
 *
 * A fill that never settles — an engine erroring on every chunk, a band that keeps being
 * re-planned — must not leave a loop fighting the reader forever. Generous, because the
 * cheaper protection is the reader's own first wheel or keypress, which ends it instantly.
 */
const REANCHOR_CEILING_MS = 15000;

/** Modifier presses on their own are not navigation, so they must not end the window —
 * holding Shift before typing would otherwise abandon the re-anchor. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

/**
 * How close the sub-line fraction has to be to count as already in place.
 *
 * A row is tens of pixels tall, so a hundredth of one is well under a pixel — far below
 * anything the reader could see, and far above the rounding a fractional `scrollTop`
 * produces.
 */
const FRACTION_EPSILON = 0.01;

/**
 * Whether the reader is already where the re-anchor wants them.
 *
 * The loop runs every frame for as long as the refill does — which can be seconds — and
 * most of those frames change nothing: no chunk landed, so no row moved, so the anchor is
 * exactly where the previous frame put it. Restoring anyway is not free. `scrollToIndex`
 * writes `scrollTop`, the write fires a `scroll` event, the handler re-measures the
 * viewport and sets `anchorLine`, and that re-renders the whole reader — three virtualized
 * panels — once per frame for the length of the refill, on top of whatever the refill
 * itself is costing. Checking first turns that into a read of the rendered range.
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

export interface UseReloadReanchorOptions {
  /** Increments once per constructed engine — the reload having actually landed. */
  engineVersion: number;
  /**
   * Whether the windowed refill is currently translating — the thing that moves rows.
   *
   * Read live each frame, never closed over: the loop ends when this has been false
   * continuously for {@link REFILL_SETTLE_MS}, not on a fixed timer, so a slow refill keeps
   * its anchor and a fast one releases it early.
   */
  isRefilling: boolean;
  /** Only re-anchors while the Reader is the visible tab. A reload triggered from the
   * Translator moves nothing the reader can see, and re-anchoring a background panel
   * would fight whatever they do first on coming back. */
  isEnabled: boolean;
  /** The current anchor, kept live by the caller. Read at reload time, never closed over. */
  anchorRef: React.RefObject<ReadingPosition | null>;
  scrollRef: React.RefObject<HTMLElement | null>;
  virtualizer: RestoreTarget;
  lineCount: number;
}

/**
 * Keeps the reader's place across a dictionary reload.
 *
 * Nothing inside the engine survives a reload, which is fine: every piece of Reader state
 * that matters lives outside it. The one thing that does not survive is the *pixel*
 * offset, because the rows change height underneath it — so the anchor is re-applied as a
 * line index plus a sub-line fraction, the same representation the persisted reading
 * position uses, once a frame until the refill has stopped moving things around.
 *
 * Re-applying every frame is what makes rows *above* the anchor free: `scrollToIndex`
 * recomputes from the virtualizer's current geometry, so a row that grew a line somewhere
 * up the document costs nothing. What the loop cannot undo is the anchor row's own height
 * changing, which moves the sub-line fraction by at most one row.
 *
 * The reader gets the window back the moment they use it: a wheel, a pointer press or a
 * non-modifier key disarms, so a re-anchor can never yank a deliberate scroll back.
 */
export function useReloadReanchor({
  engineVersion,
  isRefilling,
  isEnabled,
  anchorRef,
  scrollRef,
  virtualizer,
  lineCount,
}: UseReloadReanchorOptions): void {
  // "Latest ref": the effect below keys on the reload alone, but each frame of the loop it
  // starts must see the live scroll element, virtualizer, line count and refill state.
  const liveRef = useRef({ scrollRef, virtualizer, lineCount, isEnabled, isRefilling });
  liveRef.current = { scrollRef, virtualizer, lineCount, isEnabled, isRefilling };

  const frameRef = useRef<number | null>(null);
  const previousVersionRef = useRef(engineVersion);

  // Arm on the reload landing. `engineVersion` is the signal rather than the keypress
  // because the reload is asynchronous, and the anchor only starts moving once the new
  // engine is in place and the chunk cache it invalidates has been cleared.
  useEffect(() => {
    if (previousVersionRef.current === engineVersion) return undefined;
    previousVersionRef.current = engineVersion;
    if (!liveRef.current.isEnabled) return undefined;
    const captured = anchorRef.current;
    if (!captured) return undefined;

    const armedAt = Date.now();
    const ceiling = armedAt + REANCHOR_CEILING_MS;
    /** When the refill last went quiet, or `null` while it is working. */
    let quietSince: number | null = null;
    /** Whether a refill was ever seen — until then, quiet only means "not started". */
    let sawRefill = false;

    const stop = (): void => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
    const step = (): void => {
      frameRef.current = null;
      const now = Date.now();
      if (now > ceiling) return;

      const { scrollRef: live, virtualizer: target, lineCount: lines } = liveRef.current;
      if (liveRef.current.isRefilling) {
        sawRefill = true;
        quietSince = null;
      } else {
        quietSince ??= now;
      }
      // A refill that has run and then gone quiet is finished. One that has not started yet
      // gets the grace period before its quiet is believed.
      const quietLongEnough = quietSince !== null && now - quietSince >= REFILL_SETTLE_MS;
      const believable = sawRefill || now - armedAt >= REFILL_GRACE_MS;
      if (quietLongEnough && believable) return;

      // Only write when the anchor has actually drifted. A frame in which nothing landed
      // needs no correction, and correcting anyway costs a scroll event and a full reader
      // re-render — see `isAnchorInPlace`.
      if (!isAnchorInPlace(live.current, target, captured)) {
        tryRestorePosition(live.current, target, lines, captured);
      }
      frameRef.current = requestAnimationFrame(step);
    };
    step();

    const handleInput = (event: Event): void => {
      if (event.type === 'keydown' && MODIFIER_KEYS.has((event as KeyboardEvent).key)) return;
      stop();
    };
    window.addEventListener('wheel', handleInput, { passive: true });
    window.addEventListener('keydown', handleInput);
    window.addEventListener('pointerdown', handleInput);
    return () => {
      stop();
      window.removeEventListener('wheel', handleInput);
      window.removeEventListener('keydown', handleInput);
      window.removeEventListener('pointerdown', handleInput);
    };
  }, [engineVersion, anchorRef]);
}
