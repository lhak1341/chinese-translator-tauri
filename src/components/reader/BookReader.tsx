import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, BookMarked, ChevronLeft, ChevronRight, List } from 'lucide-react';
import type {
  ChapterOutlineSummary,
  ChapterPatternId,
  EncodingReport,
  OpenBook,
  ReadingPosition,
} from '../../types/ReaderTypes';
import HotkeyHandler from '../HotkeyHandler';
import DictionaryEntry from '../dictionary/DictionaryEntry';
import ModalErrorBoundary from '../ModalErrorBoundary';
import { useBookLines } from '../../hooks/useBookLines';
import { useWindowedTranslation } from '../../hooks/useWindowedTranslation';
import { useReaderEngine } from '../../hooks/useReaderEngine';
import { useReaderHighlight } from '../../hooks/useReaderHighlight';
import { useEngine } from '../EngineContext';
import { useReadingAnchor } from '../../hooks/useReadingAnchor';
import { useChapters } from '../../hooks/useChapters';
import { OVERSCAN_ROWS } from '../../hooks/useReaderPanel';
import { useReaderPanels } from '../../hooks/useReaderPanels';
import { useReaderCommands } from '../../hooks/useReaderCommands';
import {
  fictionDisplayName,
  suggestFictionDictionary,
} from '../../utils/reader/FictionDictionarySuggestion';
import { useBookBinding } from '../BookBindingContext';
import BindingBanner from './BindingBanner';
import BindingDialog from './BindingDialog';
import ChapterPanel from './ChapterPanel';
import CommandPalette from './CommandPalette';
import type { PaletteBook } from '../../utils/reader/PaletteCommands';
import ReaderPanel from './ReaderPanel';
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
  /** Whether the Reader is the visible tab — see `useReadingAnchor`. */
  isActive: boolean;
  /** The whole shelf, so the palette can switch books without going back to it. The open
   * book is in here too; the palette drops its own row. */
  books: readonly PaletteBook[];
  /** Open another book by file name — the shelf's own open path, so the book arrives with
   * its binding applied exactly as it would from a click on the shelf. */
  onSwitchBook: (fileName: string) => void;
  onBack: () => void;
}

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
  initialPosition,
  initialChapterOutline,
  initialManualChapterPattern,
  isActive,
  books,
  onSwitchBook,
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
  // Dismissal is session-local on purpose: it is not an answer, so nothing is persisted
  // and the offer returns on the next open. Keyed by fingerprint so dismissing it for one
  // book does not silently hide it for the next.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const { enginePhase, engineVersion } = useEngine();
  const { highlight, toggleHighlight } = useReaderHighlight(book.fingerprint, engineVersion);
  const {
    binding,
    fictionDictionaries,
    isDialogOpen,
    isApplying: isBindingApplying,
    error: bindingError,
    openDialog,
    closeDialog,
    bind,
    createAndBind,
  } = useBookBinding();

  const { master, followers, panels, pageBy, isBlankAt } = useReaderPanels({
    lineCount: book.lineCount,
    getLine,
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
    initialPosition,
    isActive,
    engineVersion,
    master,
    followers,
    lineCount: book.lineCount,
    isRefilling,
  });

  const virtualRows = panels.translation.rows;
  const firstIndex = virtualRows.length > 0 ? virtualRows[0].index : 0;
  const lastIndex = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index : 0;

  // Every engine call the Reader makes, serialized onto one queue — see `createReaderEngine`.
  const { translateChunk, translateGloss, translateOutlineBatch } = useReaderEngine();

  const { getRow, contentVersion, isTranslating } = useWindowedTranslation({
    fingerprint: book.fingerprint,
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
    isEnabled: isActive && enginePhase === 'ready',
  });
  isRefillingRef.current = isTranslating;

  // Title translation runs in the background, not just while the panel is open — the
  // chapter-strip button shows the current title too, and waiting for the reader to open
  // the panel before starting would just move the wait rather than remove it.
  // `!isTranslating` backs off while the viewport fill is busy, so a long book's title list
  // never delays the text actually on screen.
  const chapters = useChapters({
    fingerprint: book.fingerprint,
    cachedOutline: initialChapterOutline,
    cachedManualPattern: initialManualChapterPattern,
    anchor: { anchorLine, readLine, scrollToLine },
    translateBatch: translateOutlineBatch,
    dictionaryVersion: engineVersion,
    isEnabled: isActive && enginePhase === 'ready' && !isTranslating,
  });

  const suggestion = useMemo(
    () => suggestFictionDictionary(book.fileName, fictionDictionaries),
    [book.fileName, fictionDictionaries]
  );
  // `binding === null` is "never answered". `{ fictionDictionary: null }` is the answer
  // "none", and must not re-offer — collapsing the two is how this asks forever.
  const isUnbound = binding === null;
  const showBanner = isUnbound && dismissedFor !== book.fingerprint;

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

  const { actions, paletteCommands, hotkeyProps, palette, quickAdd } = useReaderCommands({
    isActive,
    books,
    currentFileName: book.fileName,
    binding,
    goToChapter: chapters.step,
    openOutline: openOutlineForSearch,
    pageBy,
    openBindingDialog: openDialog,
    onSwitchBook,
  });

  // Fetch the pages covering what is about to be painted. Running after render (rather
  // than inside it) keeps the fetch out of the render pass; the rows it fills in arrive
  // as a state update on the next tick. The deps are the two indices, not the row array:
  // the virtualizer returns a fresh array every render, so depending on it would re-run
  // this on every render including the ones the fetched pages themselves cause.
  useEffect(() => {
    requestRange(firstIndex - PREFETCH_LINES, lastIndex + 1 + PREFETCH_LINES);
  }, [firstIndex, lastIndex, requestRange]);

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
        <button
          onClick={openDialog}
          className={styles.secondaryButton}
          title="Dictionaries for this book"
        >
          <BookMarked size={14} />
          {binding?.fictionDictionary
            ? fictionDisplayName(binding.fictionDictionary)
            : isUnbound
              ? 'Bind dictionaries'
              : 'No fiction dictionary'}
        </button>
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

      {showBanner && (
        <BindingBanner
          suggestedDictionary={suggestion.dictionaryId}
          onChoose={openDialog}
          onDismiss={() => setDismissedFor(book.fingerprint)}
        />
      )}

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

      {quickAdd.isOpen && (
        <ModalErrorBoundary onClose={quickAdd.close} title="❌ Failed to load Add">
          <DictionaryEntry
            onClose={quickAdd.close}
            selectedDictionary={quickAdd.dictionary}
            allowDictionarySelection={true}
            onDictionaryChange={quickAdd.onDictionaryChange}
            initialSource={quickAdd.initialText}
          />
        </ModalErrorBoundary>
      )}

      {isDialogOpen && (
        <BindingDialog
          bookTitle={book.title}
          fileName={book.fileName}
          fictionDictionaries={fictionDictionaries}
          suggestion={suggestion}
          currentBinding={binding}
          isApplying={isBindingApplying}
          error={bindingError}
          chapterOverride={chapters.override}
          onBind={(fictionDictionary) => void bind(fictionDictionary)}
          onCreateAndBind={(rawName) => void createAndBind(rawName)}
          onClose={closeDialog}
        />
      )}

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
