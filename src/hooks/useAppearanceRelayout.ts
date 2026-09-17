import { useEffect, useRef } from 'react';
import type React from 'react';
import { tryRestorePosition, type RestoreTarget } from './useReadingPosition';
import { useAppearanceVersion } from './useAppearanceVersion';
import type { ReadingPosition } from '../types/ReaderTypes';

/** A panel that must be re-measured, and the element it scrolls in. */
export interface RelayoutPanel {
  virtualizer: RestoreTarget & { measure: () => void };
  scrollRef: React.RefObject<HTMLElement | null>;
}

export interface UseAppearanceRelayoutOptions {
  /** Only relayouts while the Reader is the visible tab — measuring a hidden panel reads
   * every row as zero-height and would throw away a correct cache for an empty one. */
  isEnabled: boolean;
  /** The reader's place, kept live by the caller: the line to come back to. */
  anchorRef: React.RefObject<ReadingPosition | null>;
  /** Every panel, master first — the master is the one the anchor is restored on. */
  panels: readonly RelayoutPanel[];
  lineCount: number;
}

/**
 * Keeps the reader's place when the Appearance settings change under them.
 *
 * A change of font, size or letter spacing changes the height of every row in the book,
 * including the thousands the virtualizer has already measured and cached. Those cached
 * heights are what the scroll offset means, so leaving them in place would put the reader
 * somewhere else in the book — further off the further they had read. `measure()` throws
 * the cache away, and the anchor is then re-applied as a line plus a fraction, the same
 * representation the persisted reading position uses.
 *
 * One restore on the next frame, not a window of them like the reload re-anchor: the new
 * heights land in a single layout pass, with nothing arriving afterwards to move them
 * again.
 */
export function useAppearanceRelayout({
  isEnabled,
  anchorRef,
  panels,
  lineCount,
}: UseAppearanceRelayoutOptions): void {
  const appearanceVersion = useAppearanceVersion();

  // "Latest ref": the effect keys on the appearance change alone, but must act on the
  // panels and line count as they are at that moment.
  const liveRef = useRef({ panels, lineCount, isEnabled });
  liveRef.current = { panels, lineCount, isEnabled };

  useEffect(() => {
    // Version 0 is the initial render, not a change: nothing has been measured yet.
    if (appearanceVersion === 0) return undefined;
    const { panels: live, lineCount: lines, isEnabled: enabled } = liveRef.current;
    if (!enabled) return undefined;
    const captured = anchorRef.current;

    for (const panel of live) panel.virtualizer.measure();

    const master = live[0];
    if (!master || !captured) return undefined;
    // Next frame: the rows re-measure themselves on the layout that follows `measure()`,
    // and restoring before that would aim at the heights that were just discarded.
    const frame = requestAnimationFrame(() => {
      tryRestorePosition(master.scrollRef.current, master.virtualizer, lines, captured);
    });
    return () => cancelAnimationFrame(frame);
  }, [appearanceVersion, anchorRef]);
}
