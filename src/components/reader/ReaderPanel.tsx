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
  variant,
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
        className={`${styles.readerScroll} ${VARIANT_CLASS[variant]} ${
          isFollower ? styles.readerFollower : ''
        }`}
        onScroll={onScroll}
        onWheel={onWheel}
      >
        <div className={styles.readerCanvas} style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((row) => {
            const { text, isPending, lang, isBlank } = getRow(row.index);
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
                  {isBlank ? '' : text === undefined ? ' ' : text || ' '}
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
