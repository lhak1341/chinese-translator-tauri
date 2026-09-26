import { useCallback, useEffect, useMemo } from 'react';
import type React from 'react';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import { useReaderPanel } from './useReaderPanel';
import { usePanelSync } from './usePanelSync';

/**
 * How wide one source Chinese character renders in each panel, in em.
 *
 * The Chinese panel is 1 by definition. The other two are Latin text, at roughly half an
 * em a character: a Chinese character becomes about three Latin characters in running
 * Vietnamese prose, and about five in the character-only gloss, where every character is
 * spelled out and space-separated. Calibrated by eye against real chapters — they are the
 * estimate's only tuning knob, and being wrong costs scrollbar accuracy in unvisited
 * regions, nothing more.
 */
const EM_PER_CHAR_ORIGINAL = 1;
const EM_PER_CHAR_TRANSLATION = 1.5;
const EM_PER_CHAR_CHARACTER_ONLY = 2.5;

/** Space / Shift+Space move the master by this much of its viewport. */
const PAGE_FRACTION = 0.9;

/**
 * Lines requested beyond the master's rendered range in each direction.
 *
 * A row that mounts before its text arrives is one placeholder line tall and grows to its
 * real wrapped height when the page lands — a visible shift. Fetching well ahead of the
 * rendered range means that only happens on the very first paint of a region, not on
 * every row during ordinary scrolling.
 */
const PREFETCH_LINES = 600;

export interface UseReaderPanelsOptions {
  lineCount: number;
  /** The book's line, or `undefined` while its page is in flight. Must be stable. */
  getLine: (index: number) => string | undefined;
  /** Fetch the pages covering `[start, end)` — `useBookLines`'. The panels call it for
   * what they are about to paint. Must be stable. */
  requestRange: (start: number, end: number) => void;
}

/** What one `<ReaderPanel>` needs from the set — spread straight into it. */
export interface PanelGeometryProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** The rendered range, as a prop so the memoized panel re-renders on scroll. */
  rows: VirtualItem[];
  /** Likewise: changes exactly when one of this panel's rows is measured. */
  totalSize: number;
  onScroll: () => void;
}

export interface FollowerGeometryProps extends PanelGeometryProps {
  isFollower: true;
  /** A wheel over a follower scrolls the master instead. */
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
}

export interface ReaderPanels {
  /** The scroll master, for the reading anchor and the page prefetch. */
  master: {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    virtualizer: Virtualizer<HTMLDivElement, Element>;
  };
  /** The followers' virtualizers, for the reading anchor's relayout. */
  followers: readonly Virtualizer<HTMLDivElement, Element>[];
  panels: {
    translation: PanelGeometryProps;
    original: FollowerGeometryProps;
    characterOnly: FollowerGeometryProps;
  };
  /** Space / Shift+Space. */
  pageBy: (direction: 1 | -1) => void;
  /** Whether a line is one of the file's own paragraph breaks — the estimate's rule, which
   * a rendered row's `isBlank` must agree with or its height jumps when it mounts. */
  isBlankAt: (index: number) => boolean;
}

/**
 * The Reader's three panels — see CONTEXT.md's "Reader Panels".
 *
 * The same lines at three natural heights, each with its own virtualizer. The translation
 * panel is the scroll master; the Chinese source and the character-only gloss follow it,
 * line by line, and never drive.
 */
export function useReaderPanels({
  lineCount,
  getLine,
  requestRange,
}: UseReaderPanelsOptions): ReaderPanels {
  // `getLine` is referentially stable and reads through a ref, so these are too — which is
  // what lets every panel's `estimateSize` stay stable across renders.
  const charCountAt = useCallback(
    (index: number): number => getLine(index)?.length ?? 0,
    [getLine]
  );

  /**
   * Whether this line is one of the file's own paragraph breaks — rendered at zero height,
   * see `PanelRow.isBlank`.
   *
   * Distinct from `charCountAt(index) === 0`, which is also true of a line whose page has
   * not been fetched: an unfetched row keeps its full estimated height, so the scrollbar
   * does not shrink and then grow again as pages land.
   */
  const isBlankAt = useCallback(
    (index: number): boolean => getLine(index)?.trim() === '',
    [getLine]
  );

  const translation = useReaderPanel({
    lineCount,
    emPerChar: EM_PER_CHAR_TRANSLATION,
    charCountAt,
    isBlankAt,
  });
  const original = useReaderPanel({
    lineCount,
    emPerChar: EM_PER_CHAR_ORIGINAL,
    charCountAt,
    isBlankAt,
  });
  const characterOnly = useReaderPanel({
    lineCount,
    emPerChar: EM_PER_CHAR_CHARACTER_ONLY,
    charCountAt,
    isBlankAt,
  });

  const masterScrollRef = translation.scrollRef;

  // Fetch the pages covering what the master is about to paint — the followers render the
  // same lines, so its range is everyone's. Running after render (rather than inside it)
  // keeps the fetch out of the render pass; the rows it fills in arrive as a state update
  // on the next tick. The deps are the two indices, not the row array: the virtualizer
  // returns a fresh array every render, so depending on it would re-run this on every
  // render including the ones the fetched pages themselves cause.
  const masterRows = translation.virtualizer.getVirtualItems();
  const firstIndex = masterRows.length > 0 ? masterRows[0].index : 0;
  const lastIndex = masterRows.length > 0 ? masterRows[masterRows.length - 1].index : 0;
  useEffect(() => {
    requestRange(firstIndex - PREFETCH_LINES, lastIndex + 1 + PREFETCH_LINES);
  }, [firstIndex, lastIndex, requestRange]);

  const { onMasterScroll, onFollowerScroll, resync } = usePanelSync({
    master: translation,
    followers: [original, characterOnly],
    lineCount,
  });

  // A row that gets measured moves every row below it in *that* panel and in no other, so
  // the panels drift apart with no scroll event to notice it. Each panel's total size is
  // the signal: it changes exactly when a measurement does.
  const translationTotalSize = translation.virtualizer.getTotalSize();
  const originalTotalSize = original.virtualizer.getTotalSize();
  const characterOnlyTotalSize = characterOnly.virtualizer.getTotalSize();
  useEffect(() => {
    resync();
  }, [translationTotalSize, originalTotalSize, characterOnlyTotalSize, resync]);

  /**
   * A wheel over a follower scrolls the master, which then drives every panel including
   * the one under the pointer.
   *
   * The followers are `overflow: hidden` and only ever moved by a write from the sync.
   * Forwarding the wheel is what keeps them usable anyway: the reader can point anywhere
   * and scroll, and the master stays the only thing driving.
   */
  const forwardWheelToMaster = useCallback(
    (event: React.WheelEvent<HTMLDivElement>): void => {
      const scrollEl = masterScrollRef.current;
      if (!scrollEl) return;
      scrollEl.scrollTop += event.deltaY;
    },
    [masterScrollRef]
  );

  /**
   * Space / Shift+Space, dispatched by the same window-level hotkey handler as every
   * other reader shortcut — not the browser's native "scroll the focused element"
   * behavior, which is what broke: a virtualized row can leave the DOM (recycled out of
   * view) while it holds focus, and nothing is focused for the browser to scroll until
   * the panel is clicked again. This needs no focus at all, so it can't be lost that way.
   */
  const pageBy = useCallback(
    (direction: 1 | -1): void => {
      const scrollEl = masterScrollRef.current;
      if (!scrollEl) return;
      scrollEl.scrollTop += direction * scrollEl.clientHeight * PAGE_FRACTION;
    },
    [masterScrollRef]
  );

  // Stable rather than inline arrows: both panels are memoized, and a fresh closure per
  // render would make every render a prop change and the memo a no-op.
  const onOriginalScroll = useCallback((): void => onFollowerScroll(0), [onFollowerScroll]);
  const onCharacterOnlyScroll = useCallback((): void => onFollowerScroll(1), [onFollowerScroll]);

  const followers = useMemo(
    () => [original.virtualizer, characterOnly.virtualizer] as const,
    [original.virtualizer, characterOnly.virtualizer]
  );

  return {
    master: { scrollRef: masterScrollRef, virtualizer: translation.virtualizer },
    followers,
    panels: {
      translation: {
        scrollRef: masterScrollRef,
        virtualizer: translation.virtualizer,
        rows: masterRows,
        totalSize: translationTotalSize,
        onScroll: onMasterScroll,
      },
      original: {
        scrollRef: original.scrollRef,
        virtualizer: original.virtualizer,
        rows: original.virtualizer.getVirtualItems(),
        totalSize: originalTotalSize,
        onScroll: onOriginalScroll,
        isFollower: true,
        onWheel: forwardWheelToMaster,
      },
      characterOnly: {
        scrollRef: characterOnly.scrollRef,
        virtualizer: characterOnly.virtualizer,
        rows: characterOnly.virtualizer.getVirtualItems(),
        totalSize: characterOnlyTotalSize,
        onScroll: onCharacterOnlyScroll,
        isFollower: true,
        onWheel: forwardWheelToMaster,
      },
    },
    pageBy,
    isBlankAt,
  };
}
