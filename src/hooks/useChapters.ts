import { useCallback } from 'react';
import type {
  ChapterHeader,
  ChapterOutlineSummary,
  ChapterPatternCandidate,
  ChapterPatternId,
} from '../types/ReaderTypes';
import type { EngineCall } from '../utils/reader/ReaderEngine';
import { currentChapterIndex, stepChapter } from '../utils/reader/ChapterNavigation';
import { useChapterOutline } from './useChapterOutline';
import { useOutlineTranslations } from './useOutlineTranslations';
import type { UseReadingAnchorResult } from './useReadingAnchor';

export interface UseChaptersOptions {
  fingerprint: string;
  /** The book record's cached outline at open time — see `useChapterOutline`. */
  cachedOutline: ChapterOutlineSummary | null;
  /** The book record's persisted manual override at open time, or `null`. */
  cachedManualPattern: ChapterPatternId | null;
  /** Where the reader is. `anchorLine` places the current chapter; `readLine()` is what a
   * step reads, because a key-repeated `]` can run before React re-renders; `scrollToLine`
   * is how a step lands. */
  anchor: Pick<UseReadingAnchorResult, 'anchorLine' | 'readLine' | 'scrollToLine'>;
  /** The Reader queue's title-batch call — see `useOutlineTranslations`. */
  translateBatch: EngineCall<string>;
  /** Bumped on every engine reinitialization. */
  dictionaryVersion: number;
  /** Whether title translation may run now. The caller composes it (tab visible, engine
   * ready, the viewport fill idle) — this module does not know the viewport fill exists. */
  isEnabled: boolean;
}

/** The chapter-structure choice: every pattern's election stats and which one drives the
 * outline. The slice the binding dialog needs, without the rest of the chapters. */
export interface ChapterOverride {
  candidates: ChapterPatternCandidate[];
  /** The manual override when one is set, else the elected pattern, else `null`. */
  activePattern: ChapterPatternId | null;
  isOverridden: boolean;
  /** Pick a pattern, or `null` to go back to trusting election. Persists to the record. */
  set: (pattern: ChapterPatternId | null) => void;
}

export interface Chapters {
  /** In ascending line order. Empty while loading, on error, or with no structure. */
  headers: ChapterHeader[];
  /** Index into `headers` of the chapter the anchor is in, or `-1` before the first. */
  currentIndex: number;
  current: ChapterHeader | null;
  /** Whether `step(direction)` would go anywhere from where the reader is now. */
  canStep: (direction: -1 | 1) => boolean;
  /** Jump to the next chapter, or back — see `stepChapter` for the previous-track rule. */
  step: (direction: -1 | 1) => void;
  /** What to show for a header: its Vietnamese once translated (stale titles included),
   * else the original, else a placeholder for a header line with no text. */
  displayTitle: (header: ChapterHeader) => string;
  isTranslatingTitles: boolean;
  error: string | null;
  override: ChapterOverride;
}

/**
 * Everything the Reader knows about chapters, behind one interface: the elected (or
 * overridden) outline, which chapter the anchor is in, stepping between chapters, and the
 * titles' background translation.
 *
 * Owns the one wiring rule that used to live in `BookReader` and went wrong there: title
 * translation is prioritized by the *current chapter's* line, not the anchor line, so
 * scrolling within a chapter never re-plans it.
 */
export function useChapters({
  fingerprint,
  cachedOutline,
  cachedManualPattern,
  anchor,
  translateBatch,
  dictionaryVersion,
  isEnabled,
}: UseChaptersOptions): Chapters {
  const { anchorLine, readLine, scrollToLine } = anchor;
  const outline = useChapterOutline({ fingerprint, cachedOutline, cachedManualPattern });
  const { headers } = outline;

  // `anchorLine`, not the virtualizer's first rendered row: that range includes the
  // overscan above the viewport, so a chapter derived from it lagged a real chapter
  // boundary by up to that many lines — "next" then read the reader as still in the
  // chapter before and jumped back to a start already scrolled past. `anchorLine` is the
  // topmost line actually touching the viewport.
  const currentIndex = currentChapterIndex(headers, anchorLine);
  const current = currentIndex >= 0 ? headers[currentIndex] : null;

  const { getTranslatedTitle, isTranslating: isTranslatingTitles } = useOutlineTranslations({
    fingerprint,
    headers,
    priorityLine: current?.line ?? -1,
    translateBatch,
    dictionaryVersion,
    isEnabled,
  });

  const canStep = useCallback(
    (direction: -1 | 1): boolean => stepChapter(headers, anchorLine, direction) !== null,
    [headers, anchorLine]
  );

  const step = useCallback(
    (direction: -1 | 1): void => {
      // `readLine()`, not `anchorLine`: a rapid second `]` can fire before React has
      // re-rendered after the first, and the hotkey listener would then run this exact
      // closure still bound to the pre-jump `anchorLine`, recomputing the target it just
      // jumped to. `scrollToLine` sets the anchor synchronously, so `readLine()` is right
      // whichever render's closure runs.
      const target = stepChapter(headers, readLine(), direction);
      if (target) scrollToLine(target.line);
    },
    [headers, readLine, scrollToLine]
  );

  const displayTitle = useCallback(
    (header: ChapterHeader): string =>
      (getTranslatedTitle(header.line) ?? header.title) || '(untitled)',
    [getTranslatedTitle]
  );

  return {
    headers,
    currentIndex,
    current,
    canStep,
    step,
    displayTitle,
    isTranslatingTitles,
    error: outline.error,
    override: {
      candidates: outline.candidates,
      activePattern: outline.activePattern,
      isOverridden: outline.isOverridden,
      set: outline.setOverride,
    },
  };
}
