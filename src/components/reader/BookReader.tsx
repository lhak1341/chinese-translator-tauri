import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, List } from 'lucide-react';
import type {
  ChapterOutlineSummary,
  ChapterPatternId,
  EncodingReport,
  OpenBook,
  ReadingPosition,
} from '../../types/ReaderTypes';
import { useBookLines } from '../../hooks/useBookLines';
import { useWindowedTranslation } from '../../hooks/useWindowedTranslation';
import { countVisibleLines, nextViewportLines } from '../../utils/reader/TranslationWindow';
import { useEngine } from '../EngineContext';
import { computeAnchor, useReadingPosition } from '../../hooks/useReadingPosition';
import { useChapterOutline } from '../../hooks/useChapterOutline';
import { useChapterHotkeys } from '../../hooks/useChapterHotkeys';
import { currentChapterIndex, stepChapter } from '../../utils/reader/ChapterNavigation';
import ChapterPanel from './ChapterPanel';
import styles from '../../styles/Reader.module.css';

interface BookReaderProps {
  book: OpenBook;
  encoding: EncodingReport;
  /** Where this book was left off, or `null` if it's never been opened before. */
  initialPosition: ReadingPosition | null;
  /** This book's cached chapter outline at open time, or `null` if this fingerprint has
   * never been elected before — see `useChapterOutline`. */
  initialChapterOutline: ChapterOutlineSummary | null;
  /** This book's persisted manual pattern override at open time, or `null`. */
  initialManualChapterPattern: ChapterPatternId | null;
  /** Whether the Reader is the visible tab — see `useReadingPosition`. */
  isActive: boolean;
  onBack: () => void;
}

/**
 * Starting height guess for an unmeasured row. Every mounted row is measured, so this
 * only has to be close enough that the scrollbar is not absurd while scrolling fast
 * through never-visited regions.
 */
const ESTIMATED_ROW_HEIGHT = 30;

/** Rows rendered outside the viewport, so a flick does not expose blank space. */
const OVERSCAN_ROWS = 24;

/**
 * Lines the viewport is assumed to hold before it has been measured once. Only the very
 * first fill uses it; every later one is driven by the measured count.
 */
const DEFAULT_VIEWPORT_LINES = 30;

/**
 * Lines requested beyond the rendered range in each direction.
 *
 * A row that mounts before its text arrives is one placeholder line tall and grows to its
 * real wrapped height when the page lands — a visible shift. Fetching well ahead of the
 * rendered range means that only happens on the very first paint of a region, not on
 * every row during ordinary scrolling.
 */
const PREFETCH_LINES = 600;

/**
 * One scrolling panel of decoded Chinese, virtualized by line.
 *
 * Variable-height virtualization is the whole point: lines wrap to different heights and
 * a fixed-height list gets the total wrong by a growing amount down a 75,000-line book.
 * The virtualizer measures each mounted row and keeps the measurement, so scrolling back
 * over ground already covered is as accurate as it was the first time.
 */
const BookReader: React.FC<BookReaderProps> = ({
  book,
  encoding,
  initialPosition,
  initialChapterOutline,
  initialManualChapterPattern,
  isActive,
  onBack,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { getLine, linesVersion, requestRange, error } = useBookLines(
    book.fingerprint,
    book.lineCount
  );
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [viewportLines, setViewportLines] = useState(DEFAULT_VIEWPORT_LINES);
  const [anchorLine, setAnchorLine] = useState(0);
  const { engineRef, enginePhase, engineVersion } = useEngine();

  const virtualizer = useVirtualizer({
    count: book.lineCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
  });

  /**
   * Publish the anchor and the measured viewport height that the translation bands derive
   * from. The arithmetic — which rows count as visible, when a change is a real resize
   * rather than a row growing under the reader, and which line the anchor is — lives in
   * `TranslationWindow` and `useReadingPosition`; this only supplies the DOM geometry.
   *
   * The anchor is `computeAnchor`'s topmost line *touching the viewport*, not
   * `virtualRows[0].index`: the virtualizer's item list includes `OVERSCAN_ROWS` above the
   * viewport, so using it would put the bands a screenful above the reader and make the
   * fetch band asymmetric around them.
   */
  const measureViewport = useCallback((): void => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const rows = virtualizer.getVirtualItems();
    const visible = countVisibleLines(rows, scrollEl.scrollTop, scrollEl.clientHeight);
    setViewportLines((previous) => nextViewportLines(previous, visible));
    const anchor = computeAnchor(scrollEl.scrollTop, rows);
    if (anchor) setAnchorLine(anchor.line);
  }, [virtualizer]);

  const { onScroll } = useReadingPosition({
    fingerprint: book.fingerprint,
    initialPosition,
    scrollRef,
    virtualizer,
    lineCount: book.lineCount,
    isActive,
  });

  const {
    headers: chapterHeaders,
    candidates: chapterCandidates,
    activePattern: chapterPattern,
    isOverridden: isChapterOverridden,
    error: chapterError,
    setOverride: setChapterOverride,
  } = useChapterOutline({
    fingerprint: book.fingerprint,
    cachedOutline: initialChapterOutline,
    cachedManualPattern: initialManualChapterPattern,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const firstIndex = virtualRows.length > 0 ? virtualRows[0].index : 0;
  const lastIndex = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : 0;

  /**
   * One engine call.
   *
   * Only ever called while the Reader is the visible tab: `translateWithSegments` resets
   * engine-wide segment state on entry, so the single shared engine can serve exactly one
   * caller at a time, and the Translator tab's own calls are user-driven from its own view.
   */
  const translateChunk = useCallback(
    async (text: string) => {
      const engine = engineRef.current;
      if (!engine?.isReady()) throw new Error('Translation engine is not ready');
      // Progressive batching is the engine's only supported path through this method; the
      // Reader passes no progress callbacks because a chunk is small enough to land whole.
      const result = await engine.translateWithSegments(text, { progressive: true });
      return {
        translatedText: result?.translatedText ?? '',
        semanticArrays: result?.semanticArrays ?? null,
        prebuiltSegments: result?.prebuiltSegments ?? [],
      };
    },
    [engineRef]
  );

  const {
    getTranslatedLine,
    isTranslating,
    error: translationError,
  } = useWindowedTranslation({
    fingerprint: book.fingerprint,
    lineCount: book.lineCount,
    anchorLine,
    viewportLines,
    overscanLines: OVERSCAN_ROWS,
    linesVersion,
    getLine,
    translateChunk,
    dictionaryVersion: engineVersion,
    isEnabled: isActive && enginePhase === 'ready',
  });

  const chapterIndex = currentChapterIndex(chapterHeaders, firstIndex);
  const currentChapter = chapterIndex >= 0 ? chapterHeaders[chapterIndex] : null;

  const jumpToLine = useCallback(
    (line: number): void => {
      virtualizer.scrollToIndex(line, { align: 'start' });
      setIsOutlineOpen(false);
    },
    [virtualizer]
  );

  const goToChapter = useCallback(
    (direction: -1 | 1): void => {
      const target = stepChapter(chapterHeaders, firstIndex, direction);
      if (target) virtualizer.scrollToIndex(target.line, { align: 'start' });
    },
    [chapterHeaders, firstIndex, virtualizer]
  );

  useChapterHotkeys({
    isActive,
    onPrevious: () => goToChapter(-1),
    onNext: () => goToChapter(1),
  });

  // Fetch the pages covering what is about to be painted. Running after render (rather
  // than inside it) keeps the fetch out of the render pass; the rows it fills in arrive
  // as a state update on the next tick. The deps are the two indices, not the row array:
  // the virtualizer returns a fresh array every render, so depending on it would re-run
  // this on every render including the ones the fetched pages themselves cause.
  useEffect(() => {
    requestRange(firstIndex - PREFETCH_LINES, lastIndex + 1 + PREFETCH_LINES);
  }, [firstIndex, lastIndex, requestRange]);

  // Re-measure whenever the rendered range moves — which covers the first paint, a window
  // resize (rows enter or leave), and a row growing as its translation lands.
  useEffect(() => {
    measureViewport();
  }, [firstIndex, lastIndex, measureViewport]);

  const handleScroll = useCallback((): void => {
    onScroll();
    measureViewport();
  }, [measureViewport, onScroll]);

  return (
    <div className={styles.reader}>
      <div className={styles.readerHeader}>
        <button onClick={onBack} className={styles.secondaryButton}>
          <ArrowLeft size={14} />
          Back
        </button>
        <span className={styles.readerTitle} title={book.fileName}>
          {book.title}
        </span>
        <span className={styles.readerMeta}>
          {book.lineCount.toLocaleString()} lines · {encoding.label}
          {encoding.label === 'GBK' && !encoding.strictlyClean && (
            <span
              className={styles.encodingNote}
              title="Decoded with the GB18030 superset: this file uses code points outside GBK proper."
            >
              extended
            </span>
          )}
          {encoding.overridden && <span className={styles.encodingNote}>manual</span>}
        </span>
      </div>

      <div className={styles.chapterStrip}>
        <div className={styles.chapterStripNav}>
          <button
            onClick={() => goToChapter(-1)}
            disabled={chapterHeaders.length === 0 || chapterIndex <= 0}
            className={styles.iconButton}
            title="Previous chapter ([)"
            aria-label="Previous chapter"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => goToChapter(1)}
            disabled={chapterHeaders.length === 0 || chapterIndex === chapterHeaders.length - 1}
            className={styles.iconButton}
            title="Next chapter (])"
            aria-label="Next chapter"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <button
          className={styles.chapterStripCurrent}
          onClick={() => setIsOutlineOpen(true)}
          title="Open chapter list"
        >
          <List size={13} />
          <span className={styles.chapterStripTitle}>
            {currentChapter
              ? currentChapter.title || '(untitled)'
              : chapterHeaders.length > 0
                ? 'Before the first chapter'
                : 'No chapter structure detected'}
          </span>
        </button>
        <span className={styles.chapterStripLine}>
          {isTranslating && <span className={styles.translatingDot} aria-hidden="true" />}
          Line {(firstIndex + 1).toLocaleString()} of {book.lineCount.toLocaleString()}
        </span>
      </div>

      {(error || translationError) && (
        <div className={styles.error}>
          <AlertCircle size={15} />
          {error ?? translationError}
        </div>
      )}

      <div ref={scrollRef} className={styles.readerScroll} onScroll={handleScroll}>
        <div className={styles.readerCanvas} style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualRows.map((row) => {
            const line = getLine(row.index);
            const translated = getTranslatedLine(row.index);
            // Text the reader has not reached yet shows its real Chinese, dimmed, rather
            // than a blank or a grey bar — scrolling ahead still shows something readable,
            // and the row is measured at very nearly its final height.
            const text = translated ?? line;
            const isUntranslated = translated === undefined && (line?.trim().length ?? 0) > 0;
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
                  grows by whole line heights rather than by an arbitrary amount. The
                  prefetch margin above is what keeps that from being the common case.

                  A blank line is a real, empty line and keeps its slot, so line numbers
                  stay the file's own.
                */}
                <p
                  className={`${styles.readerLine} ${isUntranslated || line === undefined ? styles.pending : ''}`}
                  lang={translated === undefined ? 'zh' : 'vi'}
                >
                  {text === undefined ? ' ' : text || ' '}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {isOutlineOpen && (
        <ChapterPanel
          headers={chapterHeaders}
          candidates={chapterCandidates}
          activePattern={chapterPattern}
          isOverridden={isChapterOverridden}
          currentIndex={chapterIndex}
          error={chapterError}
          onJump={jumpToLine}
          onSetOverride={setChapterOverride}
          onClose={() => setIsOutlineOpen(false)}
        />
      )}
    </div>
  );
};

export default BookReader;
