import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { anchorAtOffset, clampOffset, offsetForAnchor } from '../utils/reader/PanelSync';
import type { RowMetrics } from '../utils/reader/PanelSync';

/**
 * Pixels of disagreement tolerated before a follower is written.
 *
 * Scroll offsets are fractional, and a write that lands a hundredth of a pixel away from
 * the target is indistinguishable from no write at all — except that it costs a scroll
 * event. Half a pixel is below what any display can show and well above the rounding the
 * browser does on the way in.
 */
const OFFSET_EPSILON_PX = 0.5;

export interface SyncPanel<Id extends string = string> {
  /** Stable identity for this panel, as `handleScroll` names it. */
  id: Id;
  scrollRef: React.RefObject<HTMLElement | null>;
  /** This panel's own measurement cache — see `RowMetrics`. */
  metrics: RowMetrics;
}

export interface UsePanelSyncOptions<Id extends string> {
  /** Every panel taking part, master included. */
  panels: Array<SyncPanel<Id>>;
  lineCount: number;
  /** The panel whose position a `resync()` is taken from — the scroll master. */
  masterId: Id;
}

export interface PanelSyncHandle<Id extends string> {
  /** Wire to each panel's `onScroll`, with that panel's own id. */
  handleScroll: (id: Id) => void;
  /**
   * Re-align the followers to the master without a scroll event — for when a row's
   * measurement changes underneath them, which moves every row below it in one panel and
   * not in the others.
   */
  resync: () => void;
}

/**
 * Keeps the line being read level across panels of different natural heights.
 *
 * Two things make this work, and both are easy to leave out:
 *
 * **The write is animation-frame throttled.** A scroll event can fire many times per
 * frame, and each follower write is a layout read plus a layout write on two other
 * elements. Coalescing to one frame is the difference between a smooth drag and a
 * stuttering one. It also has to be the *scroll handler* driving this, not an
 * intersection observer: observer callbacks arrive a frame or more later, which is
 * visible as the left panels lagging behind the right one during a drag.
 *
 * **A "who is driving" latch.** Writing a follower's `scrollTop` makes that follower fire
 * its own scroll event, which would drive the driver right back. Offsets are fractional
 * and the round trip is lossy, so the two panels would not merely oscillate — they would
 * walk. The latch names the panel currently driving and is cleared on the *next* frame,
 * because that is when the echo arrives; clearing it synchronously after the writes
 * catches nothing.
 */
export function usePanelSync<Id extends string>({
  panels,
  lineCount,
  masterId,
}: UsePanelSyncOptions<Id>): PanelSyncHandle<Id> {
  // "Latest ref" pattern: the callbacks below are referentially stable (they go straight
  // onto DOM handlers) but must see this render's panels and line count.
  const liveRef = useRef({ panels, lineCount, masterId });
  liveRef.current = { panels, lineCount, masterId };

  const drivingRef = useRef<Id | null>(null);
  const frameRef = useRef<number | null>(null);
  const releaseFrameRef = useRef<number | null>(null);
  const pendingRef = useRef<Id | null>(null);

  const writeFollowers = useCallback((driverId: Id): void => {
    const { panels: current, lineCount: count } = liveRef.current;
    const driver = current.find((panel) => panel.id === driverId);
    const driverEl = driver?.scrollRef.current;
    if (!driver || !driverEl) return;

    const anchor = anchorAtOffset(driverEl.scrollTop, driver.metrics, count);
    if (!anchor) return;

    // Latch before the first write: every follower write below lands a scroll event on
    // that follower, and those events must not come back through as a new drive.
    let wrote = false;
    for (const panel of current) {
      if (panel.id === driverId) continue;
      const element = panel.scrollRef.current;
      if (!element) continue;
      const target = clampOffset(
        offsetForAnchor(anchor, panel.metrics),
        element.scrollHeight,
        element.clientHeight
      );
      if (Math.abs(element.scrollTop - target) < OFFSET_EPSILON_PX) continue;
      if (!wrote) {
        // Latched only once a write is actually going to happen: a frame that changes
        // nothing produces no echo to swallow, and latching anyway would throw away a
        // frame of whatever scroll came next.
        drivingRef.current = driverId;
        wrote = true;
      }
      element.scrollTop = target;
    }
    if (!wrote) return;

    if (releaseFrameRef.current !== null) cancelAnimationFrame(releaseFrameRef.current);
    releaseFrameRef.current = requestAnimationFrame(() => {
      releaseFrameRef.current = null;
      drivingRef.current = null;
    });
  }, []);

  const schedule = useCallback(
    (driverId: Id): void => {
      pendingRef.current = driverId;
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) writeFollowers(pending);
      });
    },
    [writeFollowers]
  );

  const handleScroll = useCallback(
    (id: Id): void => {
      // An echo of our own write: the panel that is driving keeps driving, and a follower
      // moved by that drive says nothing.
      if (drivingRef.current !== null && drivingRef.current !== id) return;
      schedule(id);
    },
    [schedule]
  );

  const resync = useCallback((): void => {
    schedule(liveRef.current.masterId);
  }, [schedule]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (releaseFrameRef.current !== null) cancelAnimationFrame(releaseFrameRef.current);
      frameRef.current = null;
      releaseFrameRef.current = null;
      drivingRef.current = null;
    };
  }, []);

  return { handleScroll, resync };
}
