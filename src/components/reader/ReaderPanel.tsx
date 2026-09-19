import React from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { ReaderSegment } from '../../utils/reader/LineSegments';
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

/** One line as a panel renders it. */
export interface PanelRow {
  /** The text to show. `undefined` is a line whose page has not been fetched yet. */
  text: string | undefined;
  /**
   * Whether this is stand-in content — the Chinese source in a panel that will eventually
   * show Vietnamese. Styled dimmer, but in the same element, so the row's height barely
   * changes when the real text lands.
   */
  isPending: boolean;
  /** Language of `text` as rendered, which changes while a row is pending. */
  lang: 'zh' | 'vi';
  /**
   * A blank line in the source file, which renders at zero height.
   *
   * Line breaks between paragraphs are not uniform across a library — one file runs its
   * paragraphs adjacent, the next separates them by one blank line, the one after by two —
   * and every row already carries the paragraph gap as its own bottom padding. Rendering a
   * blank line as a real row would add that file's own spacing on top of the setting's, so
   * the same Paragraph Spacing would read differently from book to book. Collapsed to
   * nothing, every file spaces its paragraphs by the setting alone.
   *
   * Decided from the *original* Chinese line, never from this panel's own text, so all
   * three panels collapse the same rows and stay aligned. An unfetched line is not blank —
   * it keeps its full height, so its row does not jump when its page lands.
   */
  isBlank: boolean;
  /**
   * The row cut into clickable runs, when something has translated it. Absent while the row
   * is still Chinese stand-in text, and on a row no chunk covers.
   *
   * The runs concatenate to exactly `text`, so a row does not reflow when highlighting
   * arrives — it is the same characters, in spans rather than one text node.
   */
  segments?: readonly ReaderSegment[];
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
  virtualizer: Virtualizer<HTMLDivElement, Element>;
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
          className={`${styles.clickableSegment} ${
            isLit(segment, highlight) ? styles.clickableSegmentHighlighted : ''
          }`}
          title={`"${sanitizeString(segment.originalText ?? '', 100)}" → "${sanitizeString(
            segment.translatedText ?? '',
            100
          )}" (${segment.source ?? 'unknown'})`}
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
const ReaderPanel: React.FC<ReaderPanelProps> = ({
  title,
  variant,
  isFollower = false,
  scrollRef,
  virtualizer,
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
        <div className={styles.readerCanvas} style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((row) => {
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

export default ReaderPanel;
