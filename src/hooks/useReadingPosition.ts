import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { ScrollPositionRecovery } from '../utils/ui/ScrollPositionRecovery';
import { setReadingPosition } from '../utils/reader/BookRecordsBackend';
import { registerPendingPositionFlush } from '../utils/reader/PendingPositionFlush';
import { logger } from '../utils/logger';
import type { ReadingPosition } from '../types/ReaderTypes';

/** How long an idle scroll must sit before the position is written to disk. Debounced
 * rather than written per scroll tick — a fast flick through a chapter would otherwise
 * fire dozens of writes a second. */
const POSITION_DEBOUNCE_MS = 1500;

interface VirtualItem {
  index: number;
  start: number;
  size: number;
}

export interface RestoreTarget {
  scrollToIndex: (index: number, options?: { align?: 'start' }) => void;
  getVirtualItems: () => VirtualItem[];
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
 * that row has a real measured size. Returns `false` (retry) only while the scroll
 * element itself has no layout yet — the case `ScrollPositionRecovery`'s `'raf'`
 * scheduler exists for ("waiting for a virtualized list to finish laying out after
 * remount"). Once the element is laid out, `scrollToIndex` is safe to call even before
 * every row is measured — the virtualizer re-measures and the position can only improve.
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

export interface UseReadingPositionOptions {
  fingerprint: string;
  /** `null` means the book was never opened before — nothing to restore. */
  initialPosition: ReadingPosition | null;
  scrollRef: React.RefObject<HTMLElement | null>;
  virtualizer: RestoreTarget;
  lineCount: number;
  /** Whether the Reader tab is the one currently visible. Every tab stays mounted across
   * a switch, so a `true -> false` transition is the only signal that reading stopped —
   * used to flush a pending write rather than let the debounce timer carry it. */
  isActive: boolean;
}

/**
 * Owns the reading-position lifecycle for one open book: restoring on open, tracking
 * scroll to a debounced write, and flushing on tab-switch-away or unmount (book close).
 * Flushing on app exit is a separate, app-level concern — see `App.jsx`.
 */
export function useReadingPosition({
  fingerprint,
  initialPosition,
  scrollRef,
  virtualizer,
  lineCount,
  isActive,
}: UseReadingPositionOptions): { onScroll: () => void } {
  const pendingRef = useRef<ReadingPosition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Latest ref" pattern: the restore effect only re-runs on a fingerprint change, but
  // must still see the current scroll element/virtualizer/line count when it fires.
  const liveRef = useRef({ scrollRef, virtualizer, lineCount });
  liveRef.current = { scrollRef, virtualizer, lineCount };

  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    try {
      await setReadingPosition(fingerprintRef.current, pending);
    } catch (cause) {
      logger.error('Failed to save reading position:', cause);
    }
  }, []);

  const onScroll = useCallback((): void => {
    const scrollEl = liveRef.current.scrollRef.current;
    if (!scrollEl) return;
    const anchor = computeAnchor(scrollEl.scrollTop, liveRef.current.virtualizer.getVirtualItems());
    if (!anchor) return;
    pendingRef.current = anchor;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, POSITION_DEBOUNCE_MS);
  }, [flush]);

  // A new book means a new debounce lifetime: a timer still pending for the previous
  // book must not fire a write tagged with the book that replaced it. The cleanup here
  // (not the effect body) is what runs with the *old* fingerprint still in scope, right
  // before the new one takes over — flush it there rather than discarding it.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        void setReadingPosition(fingerprint, pending).catch((cause) => {
          logger.error('Failed to save reading position:', cause);
        });
      }
    };
  }, [fingerprint]);

  // Restore once per book. The retry loop below is what makes this safe to fire before
  // the virtualized list has finished laying out.
  useEffect(() => {
    if (!initialPosition) return undefined;
    const recovery = new ScrollPositionRecovery<ReadingPosition>((position) =>
      tryRestorePosition(
        liveRef.current.scrollRef.current,
        liveRef.current.virtualizer,
        liveRef.current.lineCount,
        position
      )
    );
    void recovery.restore(initialPosition, { scheduler: 'raf' });
    return () => recovery.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint identifies the book; liveRef carries the rest
  }, [fingerprint]);

  // Flush whenever the Reader stops being the visible tab, and on unmount (book close).
  useEffect(() => {
    if (!isActive) void flush();
  }, [isActive, flush]);
  useEffect(() => {
    return () => void flush();
  }, [flush]);

  // Let App.jsx's window-close-requested handler reach this book's pending write.
  useEffect(() => {
    registerPendingPositionFlush(flush);
    return () => registerPendingPositionFlush(null);
  }, [flush]);

  return { onScroll };
}
