import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, BookMarked, ChevronLeft, ChevronRight, List } from 'lucide-react';
import type {
  ChapterOutlineSummary,
  ChapterPatternId,
  EncodingReport,
  OpenBook,
  ReadingPosition,
} from '../../types/ReaderTypes';
import { logger } from '../../utils/logger';
import { requestDictionaryReload } from '../../utils/dictionary';
import { useDictionary } from '../dictionary/DictionaryContext';
import { useDictionaryModals } from '../../hooks/useDictionaryModals';
import { useReloadReanchor } from '../../hooks/useReloadReanchor';
import { useAppearanceRelayout } from '../../hooks/useAppearanceRelayout';
import HotkeyHandler from '../HotkeyHandler';
import AddEntryBar from './AddEntryBar';
import { useBookLines } from '../../hooks/useBookLines';
import { useWindowedTranslation } from '../../hooks/useWindowedTranslation';
import { countVisibleLines, nextViewportLines } from '../../utils/reader/TranslationWindow';
import { useEngine } from '../EngineContext';
import { computeAnchor, useReadingPosition } from '../../hooks/useReadingPosition';
import { useChapterOutline } from '../../hooks/useChapterOutline';
import { OVERSCAN_ROWS, useReaderPanel } from '../../hooks/useReaderPanel';
import { usePanelSync } from '../../hooks/usePanelSync';
import { currentChapterIndex, stepChapter } from '../../utils/reader/ChapterNavigation';
import {
  fictionDisplayName,
  suggestFictionDictionary,
} from '../../utils/reader/FictionDictionarySuggestion';
import { boundQuickAddTargets } from '../../utils/reader/BoundQuickAddTargets';
import { useBookBinding } from '../BookBindingContext';
import BindingBanner from './BindingBanner';
import BindingDialog from './BindingDialog';
import ChapterPanel from './ChapterPanel';
import CommandPalette from './CommandPalette';
import { buildPaletteCommands, type PaletteBook } from '../../utils/reader/PaletteCommands';
import ReaderPanel from './ReaderPanel';
import type { PanelRow } from './ReaderPanel';
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
  /** The whole shelf, so the palette can switch books without going back to it. The open
   * book is in here too; the palette drops its own row. */
  books: readonly PaletteBook[];
  /** Open another book by file name — the shelf's own open path, so the book arrives with
   * its binding applied exactly as it would from a click on the shelf. */
  onSwitchBook: (fileName: string) => void;
  onBack: () => void;
}

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

/** Panel identities, as `usePanelSync` names them. */
const TRANSLATION_PANEL = 'translation';
const ORIGINAL_PANEL = 'original';
const CHARACTER_ONLY_PANEL = 'character-only';

/**
 * One row of a Vietnamese panel.
 *
 * Text the reader has not reached yet shows its real Chinese, dimmed, rather than a blank
 * or a grey bar — scrolling ahead still shows something readable, and the row is measured
 * at very nearly its final height, so it barely moves when the Vietnamese lands.
 */
function vietnameseRow(translated: string | undefined, source: string | undefined): PanelRow {
  if (translated !== undefined) return { text: translated, isPending: false, lang: 'vi' };
  return { text: source, isPending: true, lang: 'zh' };
}

/**
 * The three-panel reader: the Chinese source and its character-only gloss stacked on the
 * left, the full translation on the right.
 *
 * The full-translation panel is the scroll master and the other two follow, line by line
 * — see `usePanelSync` for why the mapping is a line index rather than a pixel ratio, and
 * why the follower writes are animation-frame throttled behind a "who is driving" latch.
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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  /** The reader's text selection as of the moment the palette opened. Captured there
   * rather than read when an Add row runs: focusing the palette's search collapses the
   * document selection, so by then the term the reader highlighted is gone. */
  const [paletteSelection, setPaletteSelection] = useState('');
  // Dismissal is session-local on purpose: it is not an answer, so nothing is persisted
  // and the offer returns on the next open. Keyed by fingerprint so dismissing it for one
  // book does not silently hide it for the next.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [viewportLines, setViewportLines] = useState(DEFAULT_VIEWPORT_LINES);
  const [anchorLine, setAnchorLine] = useState(0);
  /** The anchor at full precision (line + sub-line fraction), kept live for the reload
   * re-anchor — which needs the value as of the moment the reload lands, not as of
   * whatever render last read it. */
  const anchorRef = useRef<ReadingPosition | null>(null);
  const { engineRef, enginePhase, engineVersion } = useEngine();
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

  // `getLine` is referentially stable and reads through a ref, so this is too — which is
  // what lets every panel's `estimateSize` stay stable across renders.
  const charCountAt = useCallback(
    (index: number): number => getLine(index)?.length ?? 0,
    [getLine]
  );

  const translationPanel = useReaderPanel({
    lineCount: book.lineCount,
    emPerChar: EM_PER_CHAR_TRANSLATION,
    charCountAt,
  });
  const originalPanel = useReaderPanel({
    lineCount: book.lineCount,
    emPerChar: EM_PER_CHAR_ORIGINAL,
    charCountAt,
  });
  const characterPanel = useReaderPanel({
    lineCount: book.lineCount,
    emPerChar: EM_PER_CHAR_CHARACTER_ONLY,
    charCountAt,
  });

  const { scrollRef, virtualizer } = translationPanel;

  const { handleScroll: syncScroll, resync } = usePanelSync({
    panels: [
      { id: TRANSLATION_PANEL, scrollRef, metrics: translationPanel.metrics },
      {
        id: ORIGINAL_PANEL,
        scrollRef: originalPanel.scrollRef,
        metrics: originalPanel.metrics,
      },
      {
        id: CHARACTER_ONLY_PANEL,
        scrollRef: characterPanel.scrollRef,
        metrics: characterPanel.metrics,
      },
    ],
    lineCount: book.lineCount,
    masterId: TRANSLATION_PANEL,
  });

  /**
   * A wheel over a follower scrolls the master, which then drives every panel including
   * the one under the pointer.
   *
   * The reference panels do not scroll on their own — the translation panel is the scroll
   * master and the other two follow, so they are `overflow: hidden` and only ever moved by
   * a write from the sync. Forwarding the wheel is what keeps them usable anyway: the
   * reader can point anywhere and scroll, and the master stays the only thing driving.
   */
  const forwardWheelToMaster = useCallback(
    (event: React.WheelEvent<HTMLDivElement>): void => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      scrollEl.scrollTop += event.deltaY;
    },
    [scrollRef]
  );

  /**
   * Publish the anchor and the measured viewport height that the translation bands derive
   * from. The arithmetic — which rows count as visible, when a change is a real resize
   * rather than a row growing under the reader, and which line the anchor is — lives in
   * `TranslationWindow` and `useReadingPosition`; this only supplies the DOM geometry.
   *
   * Taken from the master panel, and deliberately not from the cross-panel sync: this is
   * the durable anchor — persistence, the line display, translation scheduling — and it
   * has different timing needs from the per-frame pixel writes that keep the followers
   * level.
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
    if (anchor) {
      setAnchorLine(anchor.line);
      // The line alone drives the translation bands; the fraction only matters to the
      // reload re-anchor, which needs the same precision the persisted position has.
      anchorRef.current = anchor;
    }
    // `scrollRef` comes from `useReaderPanel` rather than a local `useRef`, so the lint
    // rule cannot tell it is a ref — it is listed, and is as stable as any other ref.
  }, [scrollRef, virtualizer]);

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

  /**
   * The same text through the engine's character-only pass, for the reference panel.
   *
   * A second engine call, run after the chunk's full translation is already on screen —
   * see `useWindowedTranslation`, which owns that ordering. Sequential rather than
   * concurrent for the same reason as everything else here: the engine serves one caller
   * at a time.
   */
  const translateGloss = useCallback(
    async (text: string): Promise<string> => {
      const engine = engineRef.current;
      if (!engine?.isReady()) throw new Error('Translation engine is not ready');
      const result = await engine.translateWithCharactersOnly(text);
      return result?.translatedText ?? '';
    },
    [engineRef]
  );

  const {
    getTranslatedLine,
    getCharacterOnlyLine,
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
    translateGloss,
    dictionaryVersion: engineVersion,
    isEnabled: isActive && enginePhase === 'ready',
  });

  const suggestion = useMemo(
    () => suggestFictionDictionary(book.fileName, fictionDictionaries),
    [book.fileName, fictionDictionaries]
  );
  // `binding === null` is "never answered". `{ fictionDictionary: null }` is the answer
  // "none", and must not re-offer — collapsing the two is how this asks forever.
  const isUnbound = binding === null;
  const showBanner = isUnbound && dismissedFor !== book.fingerprint;

  const chapterIndex = currentChapterIndex(chapterHeaders, firstIndex);
  const currentChapter = chapterIndex >= 0 ? chapterHeaders[chapterIndex] : null;

  const jumpToLine = useCallback(
    (line: number): void => {
      virtualizer.scrollToIndex(line, { align: 'start' });
      setOutline(null);
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

  const reloadDictionaries = useCallback((): void => {
    // The owner reports its own failures (toast + status); this catch only keeps a
    // rejection from escaping as an unhandled one.
    requestDictionaryReload().catch((cause: unknown) => {
      logger.error('Reader-triggered dictionary reload failed:', cause);
    });
  }, []);

  // The add-entry shortcut family, reused: the same hook the Translator's modal is driven
  // by, so Cmd-1..6 resolve the same targets here as there — including the two that mean
  // "the active fiction's dictionaries", which the open book's binding is what makes
  // reliable. Only the surface differs; see `AddEntryBar`.
  const { dictionaries } = useDictionary();
  const {
    showQuickAdd,
    quickAddDictionary,
    clipboardText,
    openQuickAdd,
    openQuickAddCharacter,
    openQuickAddPhrase,
    openQuickAddProperNoun,
    openQuickAddPattern,
    openQuickAddCustomProperNoun,
    openQuickAddCustomStructuralPattern,
    closeQuickAdd,
  } = useDictionaryModals(dictionaries);

  // The two members of the family that mean "the active fiction's dictionaries" are
  // answered from the open book's binding, not from the config key the binding happens to
  // have written — so the bar's label and its destination cannot disagree when that write
  // failed. An unbound book falls through to the config-driven resolvers, which own the
  // reporting for having no fiction dictionary at all.
  const boundTargets = useMemo(
    () => boundQuickAddTargets(binding?.fictionDictionary ?? null, dictionaries),
    [binding, dictionaries]
  );

  const openBoundProperNoun = useCallback(
    async (text?: string): Promise<void> => {
      if (boundTargets.properNouns) {
        openQuickAdd(boundTargets.properNouns, text ?? '');
        return;
      }
      await openQuickAddCustomProperNoun(text);
    },
    [boundTargets.properNouns, openQuickAdd, openQuickAddCustomProperNoun]
  );

  const openBoundStructuralPattern = useCallback(
    async (text?: string): Promise<void> => {
      if (boundTargets.structuralPatterns) {
        openQuickAdd(boundTargets.structuralPatterns, text ?? '');
        return;
      }
      await openQuickAddCustomStructuralPattern(text);
    },
    [boundTargets.structuralPatterns, openQuickAdd, openQuickAddCustomStructuralPattern]
  );

  /** Open the outline ready to be typed into — what both the jump-to-chapter shortcut and
   * the palette's own row do. The chapter-strip button opens it without taking focus. */
  const openOutlineForSearch = useCallback((): void => {
    setOutline({ focusSearch: true });
  }, []);

  const openPalette = useCallback((): void => {
    setPaletteSelection(window.getSelection()?.toString().trim() ?? '');
    setIsPaletteOpen(true);
  }, []);

  // The palette's rows are data — the shortcut each one displays included. Everything
  // here is the same callback the direct binding fires, so the two paths cannot drift.
  const paletteCommands = useMemo(
    () =>
      buildPaletteCommands({
        books,
        currentFileName: book.fileName,
        handlers: {
          onJumpToChapter: openOutlineForSearch,
          onPreviousChapter: () => goToChapter(-1),
          onNextChapter: () => goToChapter(1),
          onBindDictionaries: openDialog,
          onReloadDictionaries: reloadDictionaries,
          onAddCharacter: () => openQuickAddCharacter(paletteSelection),
          onAddPhrase: () => openQuickAddPhrase(paletteSelection),
          onAddProperNoun: () => openQuickAddProperNoun(paletteSelection),
          onAddPattern: () => openQuickAddPattern(paletteSelection),
          onAddFictionProperNoun: () => void openBoundProperNoun(paletteSelection),
          onAddFictionStructuralPattern: () => void openBoundStructuralPattern(paletteSelection),
          onSwitchBook,
        },
      }),
    [
      book.fileName,
      books,
      goToChapter,
      openOutlineForSearch,
      onSwitchBook,
      openBoundProperNoun,
      openBoundStructuralPattern,
      openDialog,
      openQuickAddCharacter,
      openQuickAddPattern,
      openQuickAddPhrase,
      openQuickAddProperNoun,
      paletteSelection,
      reloadDictionaries,
    ]
  );

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

  // A row that gets measured moves every row below it in *that* panel and in no other, so
  // the panels drift apart with no scroll event to notice it. Each panel's total size is
  // the signal: it changes exactly when a measurement does.
  const translationTotalSize = virtualizer.getTotalSize();
  const originalTotalSize = originalPanel.virtualizer.getTotalSize();
  const characterTotalSize = characterPanel.virtualizer.getTotalSize();
  useEffect(() => {
    resync();
  }, [translationTotalSize, originalTotalSize, characterTotalSize, resync]);

  // Steps 1 and 5 of a reload in the Reader: capture the anchor, and scroll back to it
  // once the chunk cache has been invalidated and the fetch band re-translated. Steps 2-4
  // are the reload itself plus `engineVersion` reaching `useWindowedTranslation`.
  useReloadReanchor({
    engineVersion,
    isEnabled: isActive,
    anchorRef,
    scrollRef,
    virtualizer,
    lineCount: book.lineCount,
  });

  // A font change from the Appearance tab resizes every row in all three panels. The
  // master is listed first: it is the one the anchor is restored on, and the followers
  // are then pulled level by the resync above.
  useAppearanceRelayout({
    isEnabled: isActive,
    anchorRef,
    panels: [
      { virtualizer, scrollRef },
      { virtualizer: originalPanel.virtualizer, scrollRef: originalPanel.scrollRef },
      { virtualizer: characterPanel.virtualizer, scrollRef: characterPanel.scrollRef },
    ],
    lineCount: book.lineCount,
  });

  const handleScroll = useCallback((): void => {
    onScroll();
    measureViewport();
    syncScroll(TRANSLATION_PANEL);
  }, [measureViewport, onScroll, syncScroll]);

  const translationRow = useCallback(
    (index: number): PanelRow => vietnameseRow(getTranslatedLine(index), getLine(index)),
    [getLine, getTranslatedLine]
  );

  const originalRow = useCallback(
    (index: number): PanelRow => {
      const line = getLine(index);
      // The source panel is only ever pending on its own page fetch, never on translation.
      return { text: line, isPending: line === undefined, lang: 'zh' };
    },
    [getLine]
  );

  const characterRow = useCallback(
    (index: number): PanelRow => vietnameseRow(getCharacterOnlyLine(index), getLine(index)),
    [getCharacterOnlyLine, getLine]
  );

  return (
    <div className={styles.reader}>
      {/* `activeTab` is left unset while the Reader is in the background, exactly as the
          Translator does it: every tab stays mounted, so the tab identity is what keeps
          two registered handlers from both answering the same key. */}
      <HotkeyHandler
        activeTab={isActive ? 'reader' : undefined}
        onQuickAdd={openQuickAddProperNoun}
        onQuickAddCharacter={openQuickAddCharacter}
        onQuickAddPhrase={openQuickAddPhrase}
        onQuickAddProperNoun={openQuickAddProperNoun}
        onQuickAddPattern={openQuickAddPattern}
        onQuickAddCustomProperNoun={openBoundProperNoun}
        onQuickAddCustomStructuralPattern={openBoundStructuralPattern}
        onReloadDictionary={reloadDictionaries}
        onOpenCommandPalette={openPalette}
        onOpenChapterOutline={openOutlineForSearch}
        onPreviousChapter={() => goToChapter(-1)}
        onNextChapter={() => goToChapter(1)}
      />

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
          onClick={() => setOutline({ focusSearch: false })}
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

      {showBanner && (
        <BindingBanner
          suggestedDictionary={suggestion.dictionaryId}
          onChoose={openDialog}
          onDismiss={() => setDismissedFor(book.fingerprint)}
        />
      )}

      {(error || translationError) && (
        <div className={styles.error}>
          <AlertCircle size={15} />
          {error ?? translationError}
        </div>
      )}

      <div className={styles.readerBody}>
        <div className={styles.readerReference}>
          <ReaderPanel
            title="Original"
            variant="original"
            isFollower
            scrollRef={originalPanel.scrollRef}
            virtualizer={originalPanel.virtualizer}
            getRow={originalRow}
            onScroll={() => syncScroll(ORIGINAL_PANEL)}
            onWheel={forwardWheelToMaster}
          />
          <ReaderPanel
            title="Character only"
            variant="characterOnly"
            isFollower
            scrollRef={characterPanel.scrollRef}
            virtualizer={characterPanel.virtualizer}
            getRow={characterRow}
            onScroll={() => syncScroll(CHARACTER_ONLY_PANEL)}
            onWheel={forwardWheelToMaster}
          />
        </div>
        <ReaderPanel
          title="Translation"
          variant="translation"
          scrollRef={scrollRef}
          virtualizer={virtualizer}
          getRow={translationRow}
          onScroll={handleScroll}
        />
      </div>

      {showQuickAdd && (
        <AddEntryBar
          source={clipboardText}
          dictionaryId={quickAddDictionary}
          onClose={closeQuickAdd}
        />
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
          candidates={chapterCandidates}
          activePattern={chapterPattern}
          isOverridden={isChapterOverridden}
          onSetOverride={setChapterOverride}
          onBind={(fictionDictionary) => void bind(fictionDictionary)}
          onCreateAndBind={(rawName) => void createAndBind(rawName)}
          onClose={closeDialog}
        />
      )}

      {outline && (
        <ChapterPanel
          headers={chapterHeaders}
          candidates={chapterCandidates}
          activePattern={chapterPattern}
          isOverridden={isChapterOverridden}
          currentIndex={chapterIndex}
          error={chapterError}
          onJump={jumpToLine}
          onSetOverride={setChapterOverride}
          autoFocusSearch={outline.focusSearch}
          onClose={() => setOutline(null)}
        />
      )}

      {isPaletteOpen && (
        <CommandPalette commands={paletteCommands} onClose={() => setIsPaletteOpen(false)} />
      )}
    </div>
  );
};

export default BookReader;
