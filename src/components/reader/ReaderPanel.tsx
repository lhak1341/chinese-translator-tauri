import React from 'react';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import type { ReaderSegment } from '../../utils/reader/LineSegments';
import type { PanelRow } from '../../utils/reader/PanelRows';
import { sanitizeString } from '../../utils/configValidation';
import styles from '../../styles/Reader.module.css';

/**
 * Which semantic unit is lit, as a chunk key plus an index into that chunk's own arrays.
 *
 * Never a bare index: the Reader translates a book in ~600-character chunks, each with
 * semantic arrays numbered from zero, so unit 4 means something different in every chunk on
 * screen and an index alone would light up one word per chunk.
 */
export interface ReaderHighlight {
  chunkKey: string;
  unitIndex: number;
}

function isLit(segment: ReaderSegment, highlight: ReaderHighlight | null): boolean {
  if (highlight === null || segment.chunkKey === '') return false;
  return segment.chunkKey === highlight.chunkKey && segment.unitIndex === highlight.unitIndex;
}

/**
 * The hover tooltip for a run, built once per run rather than once per render.
 *
 * `sanitizeString` is a regex pass, and the tooltip needs two of them. Inline in the JSX
 * that was thousands of regex passes per render across three panels of fifty-odd rows,
 * paid on every render, for a string only ever read if the pointer comes to rest on that
 * exact span. Runs are replaced wholesale by a rebuild, so keying on a run's own identity
 * is exact rather than a heuristic, and a `WeakMap` needs no eviction rule.
 */
const titleCache = new WeakMap<ReaderSegment, string>();

function segmentTitle(segment: ReaderSegment): string {
  const cached = titleCache.get(segment);
  if (cached !== undefined) return cached;
  const title = `"${sanitizeString(segment.originalText ?? '', 100)}" → "${sanitizeString(
    segment.translatedText ?? '',
    100
  )}" (${segment.source ?? 'unknown'})`;
  titleCache.set(segment, title);
  return title;
}

/** Which Appearance section's font this panel renders in. */
export type PanelVariant = 'original' | 'translation' | 'characterOnly';

const VARIANT_CLASS: Record<PanelVariant, string> = {
  original: styles.paneOriginal,
  translation: styles.paneTranslation,
  characterOnly: styles.paneCharacterOnly,
};

export interface ReaderPanelProps {
  title: string;
  /**
   * The Appearance section this panel follows — Chinese text, full translation, or the
   * character-only gloss. It sets the font on the scroll element, which is also the
   * element `useColumnMetrics` measures, so the estimates and the rendering agree.
   */
  variant: PanelVariant;
  /**
   * A follower panel: moved only by a write from the cross-panel sync, never scrolled on
   * its own. It is `overflow: hidden` rather than `auto`, which is what makes it a
   * follower — a wheel over it is forwarded to the master by `onWheel`.
   */
  isFollower?: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /**
   * This panel's virtualizer, for `measureElement` alone — the rendered range and the
   * canvas height arrive as `rows` and `totalSize` instead.
   *
   * Reading them off the virtualizer in here would make this component's output depend on
   * state none of its props describe, and it is memoized: a scroll would move the range
   * with every prop identical, and the panel would not re-render. Passing them in is what
   * keeps "the props changed" and "the output changed" the same question.
   */
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** The rendered range. `getVirtualItems()` is itself memoized on the virtualizer's
   * indexes and measurements, so this identity changes exactly when the range does. */
  rows: readonly VirtualItem[];
  /** The scroll canvas height, `virtualizer.getTotalSize()`. */
  totalSize: number;
  /**
   * Changes whenever what `getRow` would return has changed.
   *
   * `getRow` is built from getters that read through refs and never change identity, so it
   * cannot itself signal that a chunk landed or a page was fetched. This component is
   * memoized, so without an explicit signal new text would sit in the refs unrendered
   * until something unrelated moved. Unused in the body on purpose: its only job is to be
   * part of the props comparison.
   */
  contentVersion: number;
  getRow: (index: number) => PanelRow;
  onScroll: () => void;
  onWheel?: (event: React.WheelEvent<HTMLDivElement>) => void;
  /** The lit unit, shared by every panel — clicking one lights its counterparts. */
  highlight?: ReaderHighlight | null;
  /** Clicking a run. Must be referentially stable, or every span re-renders per click. */
  onSegmentClick?: (highlight: ReaderHighlight) => void;
}

/**
 * One row's worth of clickable runs.
 *
 * Rendered as plain `<span>`s inside the row's own `<p>`, not as a nested block: the runs
 * are exactly the characters the plain row held, so the line wraps where it always did and
 * the virtualizer measures the same height it measured before highlighting existed.
 *
 * The lit run is marked with a background rather than a heavier weight — the Translator's
 * highlight bolds, which here could rewrap a line and shove every row below it down a
 * 75,000-line book.
 */
const SegmentedLine: React.FC<{
  segments: readonly ReaderSegment[];
  highlight: ReaderHighlight | null;
  onSegmentClick: (highlight: ReaderHighlight) => void;
}> = React.memo(({ segments, highlight, onSegmentClick }) => (
  <>
    {segments.map((segment) =>
      segment.chunkKey === '' ? (
        <span key={segment.lineStart}>{segment.text}</span>
      ) : (
        <span
          key={segment.lineStart}
          data-unit-index={segment.unitIndex}
          // A unit index is only unique within its chunk — selection mapping needs both.
          data-chunk-key={segment.chunkKey}
          className={`${styles.clickableSegment} ${
            isLit(segment, highlight) ? styles.clickableSegmentHighlighted : ''
          }`}
          title={segmentTitle(segment)}
          onClick={() =>
            onSegmentClick({ chunkKey: segment.chunkKey, unitIndex: segment.unitIndex })
          }
        >
          {segment.text}
        </span>
      )
    )}
  </>
));

SegmentedLine.displayName = 'SegmentedLine';

/**
 * One scrolling panel of a book, virtualized by line.
 *
 * Every panel keeps its **natural heights**: the same line is a different number of
 * pixels tall here than in the panel beside it, and nothing pads it to a common height.
 * Padding every line to the tallest panel's — what a diff editor does — was rejected
 * because the Vietnamese is longer on nearly every line, which would leave the Chinese
 * panel mostly whitespace. Only the anchor line is guaranteed level across panels; lines
 * drift apart with distance from it, and the anchor sits at the reading position, which is
 * the only place alignment is being looked at.
 */
const ReaderPanelInner: React.FC<ReaderPanelProps> = ({
  title,
  variant,
  isFollower = false,
  scrollRef,
  virtualizer,
  rows,
  totalSize,
  getRow,
  onScroll,
  onWheel,
  highlight = null,
  onSegmentClick,
}) => {
  return (
    <section className={styles.readerPanel}>
      <header className={styles.panelTitle}>{title}</header>
      <div
        ref={scrollRef}
        className={`${styles.readerScroll} ${VARIANT_CLASS[variant]} ${
          isFollower ? styles.readerFollower : ''
        }`}
        onScroll={onScroll}
        onWheel={onWheel}
      >
        <div className={styles.readerCanvas} style={{ height: `${totalSize}px` }}>
          {rows.map((row) => {
            const { text, isPending, lang, isBlank, segments } = getRow(row.index);
            return (
              <div
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className={styles.readerRowPositioner}
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {/*
                  Placeholder and final row are the same element with the same padding,
                  font and line height — only the text node differs — so a row that
                  arrives as a single unwrapped line does not move at all, and a longer one
                  grows by whole line heights rather than by an arbitrary amount.

                  A blank line keeps its slot — line numbers stay the file's own — but
                  renders at zero height, so the file's own paragraph breaks add nothing to
                  the spacing the Appearance setting already puts below every row.
                */}
                <p
                  className={`${styles.readerLine} ${isPending ? styles.pending : ''} ${
                    isBlank ? styles.blankLine : ''
                  }`}
                  lang={lang}
                >
                  {isBlank ? (
                    ''
                  ) : segments !== undefined && onSegmentClick !== undefined ? (
                    <SegmentedLine
                      segments={segments}
                      highlight={highlight}
                      onSegmentClick={onSegmentClick}
                    />
                  ) : text === undefined ? (
                    ' '
                  ) : (
                    text || ' '
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

ReaderPanelInner.displayName = 'ReaderPanel';

/**
 * Memoized, because BookReader re-renders far more often than any panel's content changes.
 *
 * A rebuild publishes one chunk at a time and each publication is a render; so is every
 * anchor move while scrolling, and every frame of the post-reload re-anchor loop. Without
 * this, each of those re-runs all three panels' `getVirtualItems().map` over fifty-odd
 * rows — rebuilding spans for two panels whose rows did not change — and the two reference
 * panels change far less often than the master does.
 *
 * This is only worth anything while the props hold their identity across a render that
 * changed nothing: `getRow` is a `useCallback` whose own deps are the windowed-translation
 * getters, `onScroll`/`onWheel`/`onSegmentClick` are stable callbacks, and `virtualizer`
 * and `scrollRef` are per-panel instances. An inline arrow in any of those positions
 * silently turns this back into a plain component.
 */
const ReaderPanel = React.memo(ReaderPanelInner);

export default ReaderPanel;
