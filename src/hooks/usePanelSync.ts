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

/**
 * Pixels a follower's own scroll event may differ from what the sync last wrote it and
 * still count as that write coming back. Wider than {@link OFFSET_EPSILON_PX}: the browser
 * rounds a written `scrollTop` to device pixels on the way in.
 */
const ECHO_EPSILON_PX = 1;

export interface SyncPanel {
  scrollRef: React.RefObject<HTMLElement | null>;
  /** This panel's own measurement cache — see `RowMetrics`. */
  metrics: RowMetrics;
}

export interface UsePanelSyncOptions {
  /** The panel every other one is aligned to. Only it ever drives. */
  master: SyncPanel;
  /** The panels aligned to the master. Never written back to it. */
  followers: readonly SyncPanel[];
  lineCount: number;
}

export interface PanelSyncHandle {
  /** Wire to the master's `onScroll`. */
  onMasterScroll: () => void;
  /** Wire to follower `index`'s `onScroll`. */
  onFollowerScroll: (index: number) => void;
  /**
   * Re-align the followers to the master without a scroll event — for when a row's
   * measurement changes underneath them, which moves every row below it in one panel and
   * not in the others.
   */
  resync: () => void;
}

/**
 * Keeps the line being read level across panels of different natural heights, one way:
 * the master drives, the followers are written.
 *
 * **The write is animation-frame throttled.** A scroll event can fire many times per
 * frame, and each follower write is a layout read plus a layout write. Coalescing to one
 * frame is the difference between a smooth drag and a stuttering one. It also has to be
 * the *scroll handler* driving this, not an intersection observer: observer callbacks
 * arrive a frame or more later, which is visible as the followers lagging during a drag.
 *
 * **A follower never drives.** Writing a follower's `scrollTop` fires its own scroll
 * event. That echo is recognized by its offset — the one the sync last wrote — and
 * ignored. Any other follower scroll (Tab focus into a row, a selection drag, the browser
 * clamping an offset after the content shrank) re-aligns that follower from the master.
 * Nothing ever writes the master, so there is no round trip to be lossy.
 */
export function usePanelSync({
  master,
  followers,
  lineCount,
}: UsePanelSyncOptions): PanelSyncHandle {
  // "Latest ref" pattern: the callbacks below are referentially stable (they go straight
  // onto DOM handlers) but must see this render's panels and line count.
  const liveRef = useRef({ master, followers, lineCount });
  liveRef.current = { master, followers, lineCount };

  const frameRef = useRef<number | null>(null);
  /** Per follower, the offset the sync last wrote it — what its echo will report. */
  const writtenRef = useRef<Array<number | undefined>>([]);

  const writeFollowers = useCallback((): void => {
    const { master: driver, followers: current, lineCount: count } = liveRef.current;
    const driverEl = driver.scrollRef.current;
    if (!driverEl) return;

    const anchor = anchorAtOffset(driverEl.scrollTop, driver.metrics, count);
    if (!anchor) return;

    current.forEach((panel, index) => {
      const element = panel.scrollRef.current;
      if (!element) return;
      const target = clampOffset(
        offsetForAnchor(anchor, panel.metrics),
        element.scrollHeight,
        element.clientHeight
      );
      if (Math.abs(element.scrollTop - target) < OFFSET_EPSILON_PX) return;
      element.scrollTop = target;
      // Read back rather than remembering `target`: what the echo reports is the offset
      // the browser actually settled on.
      writtenRef.current[index] = element.scrollTop;
    });
  }, []);

  const schedule = useCallback((): void => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      writeFollowers();
    });
  }, [writeFollowers]);

  const onFollowerScroll = useCallback(
    (index: number): void => {
      const element = liveRef.current.followers[index]?.scrollRef.current;
      if (!element) return;
      const written = writtenRef.current[index];
      if (written !== undefined && Math.abs(element.scrollTop - written) < ECHO_EPSILON_PX) {
        return;
      }
      schedule();
    },
    [schedule]
  );

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, []);

  return { onMasterScroll: schedule, onFollowerScroll, resync: schedule };
}
