import React, { useCallback, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, List } from 'lucide-react';
import type { BookRecord, EncodingReport, OpenBook } from '../../types/ReaderTypes';
import HotkeyHandler from '../HotkeyHandler';
import { useBookLines } from '../../hooks/useBookLines';
import { useWindowedTranslation } from '../../hooks/useWindowedTranslation';
import { useReaderHighlight } from '../../hooks/useReaderHighlight';
import { useEngine } from '../EngineContext';
import { useReadingAnchor } from '../../hooks/useReadingAnchor';
import { useChapters } from '../../hooks/useChapters';
import { OVERSCAN_ROWS } from '../../hooks/useReaderPanel';
import { useReaderPanels } from '../../hooks/useReaderPanels';
import { useReaderCommands } from '../../hooks/useReaderCommands';
import { useSelectionMapper } from '../../hooks/useSelectionMapper';
import { mapReaderSelection } from '../../utils/highlighting/SelectionMapping';
import { useBookBinding } from '../BookBindingContext';
import { BindingButton, BindingNotices, BookBindingDialog } from './ReaderBinding';
import ChapterPanel from './ChapterPanel';
import CommandPalette from './CommandPalette';
import type { ShelfNavigation } from '../../utils/reader/PaletteCommands';
import type { ReaderEngineCalls } from '../../utils/reader/ReaderEngine';
import ReaderEngineErrorBanner from './ReaderEngineErrorBanner';
import ReaderPanel from './ReaderPanel';
import styles from '../../styles/Reader.module.css';

interface BookReaderProps {
  book: OpenBook;
  encoding: EncodingReport;
  /** This book's record as of this open. Read once, at mount: where it was left off
   * (`position`), and the outline to restore without re-running election
   * (`chapterOutline`, `manualChapterPattern`). Later writes go straight to disk and never
   * flow back in here. Each mount is one book: `ReaderTab` keys this component by
   * fingerprint, and Back unmounts it, so a switch or a reopen mounts afresh with a freshly
   * read record. */
  record: BookRecord;
  /** Whether the Reader is the visible tab — see `useReadingAnchor`. */
  isActive: boolean;
  /** Every engine call the Reader makes, serialized onto one queue — see
   * `createReaderEngine`. Owned by `ReaderTab` so the queue outlives this component. */
  engine: ReaderEngineCalls;
  /** The shelf's navigation, for the palette's Books rows — not read here, handed to
   * `useReaderCommands` whole (`ShelfNavigation`). */
  shelf: ShelfNavigation;
  onBack: () => void;
}

/**
 * The three-panel reader: the Chinese source and its character-only gloss stacked on the
 * left, the full translation on the right.
 *
 * The full-translation panel is the scroll master and the other two follow, line by line
 * — see `useReaderPanels`.
 *
 * Variable-height virtualization is the whole point of each panel: lines wrap to different
 * heights and a fixed-height list gets the total wrong by a growing amount down a
 * 75,000-line book. The virtualizer measures each mounted row and keeps the measurement,
 * so scrolling back over ground already covered is as accurate as it was the first time.
 */
const BookReader: React.FC<BookReaderProps> = ({
  book,
  encoding,
  record,
  isActive,
  engine,
  shelf,
  onBack,
}) => {
  const { getLine, linesVersion, requestRange, error } = useBookLines(
    book.fingerprint,
    book.lineCount
  );
  /** The outline panel, and whether it should take focus into its search on open. The
   * jump-to-chapter shortcut opens it ready to type; the chapter-strip button opens it
   * for the eye, leaving the keyboard where it was. */
  const [outline, setOutline] = useState<{ focusSearch: boolean } | null>(null);
  const { enginePhase, engineVersion } = useEngine();
  const { highlight, toggleHighlight } = useReaderHighlight(engineVersion);
  // The palette's "Bind dictionaries" opens the dialog; everything else about the binding
  // is `ReaderBinding.tsx`'s.
  const { openDialog } = useBookBinding();

  const { master, followers, panels, pageBy, isBlankAt } = useReaderPanels({
    lineCount: book.lineCount,
    getLine,
    requestRange,
  });

  /** Whether the windowed refill is translating, read live by the reload re-anchor. A ref
   * because `useWindowedTranslation` runs below, and itself takes the anchor as input. */
  const isRefillingRef = useRef(false);
  const isRefilling = useCallback((): boolean => isRefillingRef.current, []);

  // The master is the panel the anchor is measured on and restored to; the followers are
  // pulled level by the panel sync, so the anchor only re-measures them on a relayout.
  const {
    anchorLine,
    viewportLines,
    readLine,
    onScroll: onAnchorScroll,
    scrollToLine,
  } = useReadingAnchor({
    fingerprint: book.fingerprint,
    initialPosition: record.position,
    isActive,
    engineVersion,
    master,
    followers,
    lineCount: book.lineCount,
    isRefilling,
  });

  // The engine is only asked while the Reader is the visible tab and the engine is up.
  const canTranslate = isActive && enginePhase === 'ready';

  const { translateChunk, translateGloss, translateOutlineBatch } = engine;

  const { getRow, contentVersion, isTranslating } = useWindowedTranslation({
    lineCount: book.lineCount,
    anchorLine,
    viewportLines,
    overscanLines: OVERSCAN_ROWS,
    linesVersion,
    getLine,
    isBlankAt,
    translateChunk,
    translateGloss,
    dictionaryVersion: engineVersion,
    isEnabled: canTranslate,
  });
  isRefillingRef.current = isTranslating;

  // Cmd-1..7 over a Translation-panel selection add the Chinese it came from.
  useSelectionMapper((range) =>
    mapReaderSelection(range, panels.translation.scrollRef.current, getRow.original)
  );

  // Title translation runs in the background, not just while the panel is open — the
  // chapter-strip button shows the current title too, and waiting for the reader to open
  // the panel before starting would just move the wait rather than remove it.
  // `!isTranslating` backs off while the viewport fill is busy, so a long book's title list
  // never delays the text actually on screen.
  const chapters = useChapters({
    fingerprint: book.fingerprint,
    cachedOutline: record.chapterOutline,
    cachedManualPattern: record.manualChapterPattern,
    anchor: { anchorLine, readLine, scrollToLine },
    translateBatch: translateOutlineBatch,
    dictionaryVersion: engineVersion,
    isEnabled: canTranslate && !isTranslating,
  });

  // Clamped for the last line's rounding, not for anything the anchor itself can produce.
  const readingProgressPercent =
    book.lineCount > 0 ? Math.min(100, ((anchorLine + 1) / book.lineCount) * 100) : 0;

  const jumpToLine = useCallback(
    (line: number): void => {
      scrollToLine(line);
      setOutline(null);
    },
    [scrollToLine]
  );

  /** Open the outline ready to be typed into — what both the jump-to-chapter shortcut and
   * the palette's own row do. The chapter-strip button opens it without taking focus. */
  const openOutlineForSearch = useCallback((): void => {
    setOutline({ focusSearch: true });
  }, []);

  const { actions, paletteCommands, hotkeyProps, palette, quickAddDialog } = useReaderCommands({
    shelf,
    currentFileName: book.fileName,
    goToChapter: chapters.step,
    openOutline: openOutlineForSearch,
    pageBy,
    openBindingDialog: openDialog,
  });

  const syncFollowers = panels.translation.onScroll;
  const handleScroll = useCallback((): void => {
    onAnchorScroll();
    syncFollowers();
  }, [onAnchorScroll, syncFollowers]);

  return (
    <div className={styles.reader}>
      <HotkeyHandler {...hotkeyProps} />

      <div className={styles.readerHeader}>
        <button onClick={onBack} className={styles.secondaryButton}>
          <ArrowLeft size={14} />
          Back
        </button>
        <span className={styles.readerTitle} title={book.fileName}>
          {book.title}
        </span>
        <BindingButton fileName={book.fileName} />
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
        <div className={styles.chapterStripReference}>
          <div className={styles.chapterStripNav}>
            <button
              onClick={() => void actions.previousChapter()}
              // `canStep` mirrors `stepChapter` itself: a step back from mid-chapter lands
              // on the *current* chapter's own start, so this stays enabled in the first
              // chapter too, as long as there's somewhere for it to go.
              disabled={!chapters.canStep(-1)}
              className={styles.iconButton}
              title="Previous chapter ([)"
              aria-label="Previous chapter"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => void actions.nextChapter()}
              disabled={!chapters.canStep(1)}
              className={styles.iconButton}
              title="Next chapter (])"
              aria-label="Next chapter"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className={styles.chapterStripTranslation}>
          <button
            className={styles.chapterStripCurrent}
            onClick={() => setOutline({ focusSearch: false })}
            title="Open chapter list"
          >
            <List size={13} />
            <span className={styles.chapterStripTitle}>
              {chapters.current
                ? chapters.displayTitle(chapters.current)
                : chapters.headers.length > 0
                  ? 'Before the first chapter'
                  : 'No chapter structure detected'}
            </span>
          </button>
          <span className={styles.chapterStripLine}>
            {isTranslating && <span className={styles.translatingDot} aria-hidden="true" />}
            <span className={styles.readingProgressTrack} aria-hidden="true">
              <span
                className={styles.readingProgressFill}
                style={{ width: `${readingProgressPercent}%` }}
              />
            </span>
            Line {(anchorLine + 1).toLocaleString()} of {book.lineCount.toLocaleString()}
          </span>
        </div>
      </div>

      <BindingNotices fileName={book.fileName} />

      <ReaderEngineErrorBanner />

      {error && (
        <div className={styles.error}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      <div className={styles.readerBody}>
        <div className={styles.readerReference}>
          <ReaderPanel
            title="Original"
            variant="original"
            {...panels.original}
            contentVersion={contentVersion}
            getRow={getRow.original}
            highlight={highlight}
            onSegmentClick={toggleHighlight}
          />
          <ReaderPanel
            title="Character only"
            variant="characterOnly"
            {...panels.characterOnly}
            contentVersion={contentVersion}
            getRow={getRow.characterOnly}
            highlight={highlight}
            onSegmentClick={toggleHighlight}
          />
        </div>
        <ReaderPanel
          title="Translation"
          variant="translation"
          {...panels.translation}
          contentVersion={contentVersion}
          getRow={getRow.translation}
          // The master's scroll moves the reading anchor as well as the followers.
          onScroll={handleScroll}
          highlight={highlight}
          onSegmentClick={toggleHighlight}
        />
      </div>

      {quickAddDialog}

      <BookBindingDialog
        bookTitle={book.title}
        fileName={book.fileName}
        chapterOverride={chapters.override}
      />

      {outline && (
        <ChapterPanel
          chapters={chapters}
          onJump={jumpToLine}
          autoFocusSearch={outline.focusSearch}
          onClose={() => setOutline(null)}
        />
      )}

      {palette.isOpen && <CommandPalette commands={paletteCommands} onClose={palette.close} />}
    </div>
  );
};

export default BookReader;
