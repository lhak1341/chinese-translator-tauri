import React from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import styles from '../../styles/Reader.module.css';

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
}

export interface ReaderPanelProps {
  title: string;
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
}

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
  isFollower = false,
  scrollRef,
  virtualizer,
  getRow,
  onScroll,
  onWheel,
}) => {
  return (
    <section className={styles.readerPanel}>
      <header className={styles.panelTitle}>{title}</header>
      <div
        ref={scrollRef}
        className={`${styles.readerScroll} ${isFollower ? styles.readerFollower : ''}`}
        onScroll={onScroll}
        onWheel={onWheel}
      >
        <div className={styles.readerCanvas} style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((row) => {
            const { text, isPending, lang } = getRow(row.index);
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

                  A blank line is a real, empty line and keeps its slot, so line numbers
                  stay the file's own.
                */}
                <p
                  className={`${styles.readerLine} ${isPending ? styles.pending : ''}`}
                  lang={lang}
                >
                  {text === undefined ? ' ' : text || ' '}
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
