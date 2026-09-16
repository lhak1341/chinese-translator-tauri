import React, { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import type { EncodingReport, OpenBook } from '../../types/ReaderTypes';
import { useBookLines } from '../../hooks/useBookLines';
import styles from '../../styles/Reader.module.css';

interface BookReaderProps {
  book: OpenBook;
  encoding: EncodingReport;
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
const BookReader: React.FC<BookReaderProps> = ({ book, encoding, onBack }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { getLine, requestRange, error } = useBookLines(book.fingerprint, book.lineCount);

  const virtualizer = useVirtualizer({
    count: book.lineCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const firstIndex = virtualRows.length > 0 ? virtualRows[0].index : 0;
  const lastIndex = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : 0;

  // Fetch the pages covering what is about to be painted. Running after render (rather
  // than inside it) keeps the fetch out of the render pass; the rows it fills in arrive
  // as a state update on the next tick. The deps are the two indices, not the row array:
  // the virtualizer returns a fresh array every render, so depending on it would re-run
  // this on every render including the ones the fetched pages themselves cause.
  useEffect(() => {
    requestRange(firstIndex - PREFETCH_LINES, lastIndex + 1 + PREFETCH_LINES);
  }, [firstIndex, lastIndex, requestRange]);

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

      {error && (
        <div className={styles.error}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      <div ref={scrollRef} className={styles.readerScroll}>
        <div className={styles.readerCanvas} style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualRows.map((row) => {
            const line = getLine(row.index);
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
                <p className={`${styles.readerLine} ${line === undefined ? styles.pending : ''}`}>
                  {line === undefined ? ' ' : line || ' '}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BookReader;
