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
import DictionaryEntry from '../dictionary/DictionaryEntry';
import ModalErrorBoundary from '../ModalErrorBoundary';
import { useBookLines } from '../../hooks/useBookLines';
import { useWindowedTranslation } from '../../hooks/useWindowedTranslation';
import type { GlossResult } from '../../hooks/useWindowedTranslation';
import { callOnEngine } from '../../utils/reader/EngineCall';
import { useReaderHighlight } from '../../hooks/useReaderHighlight';
import { countVisibleLines, nextViewportLines } from '../../utils/reader/TranslationWindow';
import { useEngine } from '../EngineContext';
import { computeAnchor, useReadingPosition } from '../../hooks/useReadingPosition';
import { useChapterOutline } from '../../hooks/useChapterOutline';
import { useOutlineTranslations } from '../../hooks/useOutlineTranslations';
import { OVERSCAN_ROWS, useReaderPanel } from '../../hooks/useReaderPanel';
import type { WordSegment } from '../../utils/highlighting';
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
import { fillSegmentGapsCached } from '../../utils/reader/LineSegments';
import type { ReaderSegment } from '../../utils/reader/LineSegments';
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
function vietnameseRow(
  translated: string | undefined,
  source: string | undefined,
  isBlank: boolean,
  segments?: readonly ReaderSegment[]
): PanelRow {
  if (translated !== undefined)
    return { text: translated, isPending: false, lang: 'vi', isBlank, segments };
  // Stand-in Chinese carries no runs: they describe the Vietnamese this row will become.
  return { text: source, isPending: true, lang: 'zh', isBlank };
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
  /** Set by `scrollToLine`, consumed by the very next `measureViewport` call — see its
   * own comment for why a jump's first remeasurement needs to be thrown away. */
  const skipNextAnchorMeasureRef = useRef(false);
  const { engineRef, enginePhase, engineVersion } = useEngine();
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

  // `getLine` is referentially stable and reads through a ref, so this is too — which is
  // what lets every panel's `estimateSize` stay stable across renders.
  const charCountAt = useCallback(
    (index: number): number => getLine(index)?.length ?? 0,
    [getLine]
  );

  /**
   * Whether this line is one of the file's own paragraph breaks — rendered at zero height,
   * see `PanelRow.isBlank`.
   *
   * Distinct from `charCountAt(index) === 0`, which is also true of a line whose page has
   * not been fetched: an unfetched row keeps its full estimated height, so the scrollbar
   * does not shrink and then grow again as pages land.
   */
  const isBlankAt = useCallback(
    (index: number): boolean => getLine(index)?.trim() === '',
    [getLine]
  );

  const translationPanel = useReaderPanel({
    lineCount: book.lineCount,
    emPerChar: EM_PER_CHAR_TRANSLATION,
    charCountAt,
    isBlankAt,
  });
  const originalPanel = useReaderPanel({
    lineCount: book.lineCount,
    emPerChar: EM_PER_CHAR_ORIGINAL,
    charCountAt,
    isBlankAt,
  });
  const characterPanel = useReaderPanel({
    lineCount: book.lineCount,
    emPerChar: EM_PER_CHAR_CHARACTER_ONLY,
    charCountAt,
    isBlankAt,
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
   * Space / Shift+Space, dispatched by the same window-level hotkey handler as every
   * other reader shortcut — not the browser's native "scroll the focused element"
   * behavior, which is what broke: a virtualized row can leave the DOM (recycled out of
   * view) while it holds focus, and nothing is focused for the browser to scroll until
   * the panel is clicked again. This needs no focus at all, so it can't be lost that way.
   */
  const pageBy = useCallback(
    (direction: 1 | -1): void => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      scrollEl.scrollTop += direction * scrollEl.clientHeight * 0.9;
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

    // A jump via `scrollToLine` can land on a row the virtualizer has only ever
    // estimated the size of — translated Vietnamese routinely wraps to more lines than
    // the Chinese-based estimate, so once that row (and the ones before it) actually
    // render and measure, the virtualizer's own settling shifts where a given `scrollTop`
    // pixel value falls relative to line numbers. That settling's own scroll event is
    // real, but computing an anchor from it walks the anchor *backward* — enough, right
    // after a forward chapter jump, to land back before the header just jumped to. One
    // skip is enough: `scrollToLine` already set the correct anchor, and by the
    // measurement after this one the settling has already happened.
    const skipAnchor = skipNextAnchorMeasureRef.current;
    skipNextAnchorMeasureRef.current = false;
    if (skipAnchor) return;

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
   * Serializes every call this component makes onto the shared engine.
   *
   * `translateWithSegments` resets engine-wide segment state on entry, so two calls
   * in flight at once — the viewport fill and the outline's title-by-title translation,
   * say — would race: the second call's reset can land while the first is still awaiting
   * its own result, corrupting it. Routing both through one promise chain, rather than
   * relying on each caller to loop sequentially on its own, is what keeps that true across
   * two independent hooks that don't know about each other.
   *
   * `callOnEngine` (`src/utils/reader/EngineCall.ts`) is what makes going around this queue
   * a compile error rather than a documentation violation: it's the only producer of the
   * `EngineCall<T>` brand that `useWindowedTranslation`/`useOutlineTranslations` require on
   * their options, and it also owns the ready-check every one of the three calls below
   * needs — each supplies only its own engine method call and result mapping.
   */
  const engineQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const runOnEngine = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const settled = engineQueueRef.current.then(fn, fn);
    engineQueueRef.current = settled.then(
      () => undefined,
      () => undefined
    );
    return settled;
  }, []);

  /**
   * One engine call.
   *
   * Only ever called while the Reader is the visible tab: the Translator tab's own calls
   * are user-driven from its own view, so the two never contend for the engine.
   */
  // `useMemo`, not `useCallback`: `callOnEngine`'s result isn't an inline function literal,
  // so `useCallback` can't have its deps statically checked by `exhaustive-deps` — wrapping
  // in a literal `() => callOnEngine(...)` for `useMemo` keeps the same memoized identity
  // while giving the linter a body it can actually scan.
  const translateChunk = useMemo(
    () =>
      callOnEngine(engineRef, runOnEngine, async (engine, text) => {
        // Progressive batching is the engine's only supported path through this method;
        // the Reader passes no progress callbacks because a chunk is small enough to land
        // whole.
        const result = await engine.translateWithSegments(text, { progressive: true });
        return {
          translatedText: result?.translatedText ?? '',
          semanticArrays: result?.semanticArrays ?? null,
          // `TranslationEngineTypes.d.ts` declares these as `TranslationSegment[]`, but
          // what fills them is `matchWordSegments`, whose output is `WordSegment[]` —
          // offsets into the translated text plus a unit index, which is what the Reader
          // slices by. The Translator reaches the same runtime objects through an `as any`
          // at its own panel; this asserts the real shape instead.
          prebuiltSegments: (result?.prebuiltSegments ?? []) as unknown as WordSegment[],
        };
      }),
    [engineRef, runOnEngine]
  );

  /**
   * The same text through the engine's character-only pass, for the reference panel.
   *
   * A second engine call, run after the chunk's full translation is already on screen —
   * see `useWindowedTranslation`, which owns that ordering.
   */
  const translateGloss = useMemo(
    () =>
      callOnEngine(engineRef, runOnEngine, async (engine, text): Promise<GlossResult> => {
        const result = await engine.translateWithCharactersOnly(text);
        return {
          translatedText: result?.translatedText ?? '',
          // Carried, not dropped: the gloss's own units are what its clickable runs are
          // built from before being relabeled with the full translation's.
          semanticArrays: result?.semanticArrays ?? null,
        };
      }),
    [engineRef, runOnEngine]
  );

  /** One engine call, for a batch of chapter titles — see `useOutlineTranslations`. */
  const translateOutlineBatch = useMemo(
    () =>
      callOnEngine(engineRef, runOnEngine, async (engine, text) => {
        const result = await engine.translateWithSegments(text, { progressive: true });
        return result?.translatedText ?? '';
      }),
    [engineRef, runOnEngine]
  );

  const {
    getTranslatedLine,
    getCharacterOnlyLine,
    getTranslatedSegments,
    getOriginalSegments,
    getCharacterOnlySegments,
    isTranslating,
    version: translationVersion,
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

  // Runs in the background, not just while the panel is open — the chapter-strip button
  // shows the current title too, and waiting for the reader to open the panel before
  // starting would just move the wait rather than remove it. `!isTranslating` backs off
  // while the viewport fill is busy, so a long book's title list never delays the text
  // actually on screen; titles batch several to a call (see the hook) rather than paying
  // one whole round trip per title, and the panel degrades to the original Chinese for
  // whichever ones haven't landed yet, same as any other reader text.
  const { getTranslatedTitle, isTranslating: isTranslatingTitles } = useOutlineTranslations({
    fingerprint: book.fingerprint,
    headers: chapterHeaders,
    priorityLine: anchorLine,
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

  // `anchorLine`, not `firstIndex`: the virtualizer's rendered range includes
  // `OVERSCAN_ROWS` (24) lines above the viewport, so `firstIndex` sits up to 24 lines
  // *before* what the reader can actually see. Chapter detection built on it lagged
  // behind a real chapter boundary by that much — up to 24 lines into the next chapter,
  // "next" still read the reader as being in the one before, jumping back to a start
  // already scrolled past instead of advancing. `anchorLine` is `computeAnchor`'s
  // topmost line actually touching the viewport, with no such margin.
  const chapterIndex = currentChapterIndex(chapterHeaders, anchorLine);
  const currentChapter = chapterIndex >= 0 ? chapterHeaders[chapterIndex] : null;

  // Clamped for the last line's rounding, not for anything the anchor itself can produce.
  const readingProgressPercent =
    book.lineCount > 0 ? Math.min(100, ((anchorLine + 1) / book.lineCount) * 100) : 0;

  /**
   * Every programmatic jump goes through here rather than a bare `scrollToIndex` call.
   *
   * `anchorLine` otherwise only updates from `measureViewport`, which runs off the
   * scroll element's own `scroll` event — and that event races the virtualizer's own
   * range recalculation for the same scroll. Landing before it does, `measureViewport`
   * reads `getVirtualItems()` still describing the *pre*-jump range, so `computeAnchor`
   * resolves the wrong row and `anchorLine` is left one jump behind. `]` then reads the
   * stale anchor, recomputes the *same* target chapter it just jumped to, and the second
   * press looks like it does nothing — until a manual scroll produces a `scroll` event
   * that isn't racing anything, which is what "unsticks" it.
   *
   * `align: 'start'` guarantees the target line lands at the very top of the viewport, so
   * the anchor here — line, fraction 0 — needs no measurement to already be correct.
   */
  const scrollToLine = useCallback(
    (line: number): void => {
      virtualizer.scrollToIndex(line, { align: 'start' });
      setAnchorLine(line);
      anchorRef.current = { line, fraction: 0 };
      // See `measureViewport`: the settling from this jump's own scroll event must not be
      // allowed to walk the anchor it just set back across the boundary just crossed.
      skipNextAnchorMeasureRef.current = true;
    },
    [virtualizer]
  );

  const jumpToLine = useCallback(
    (line: number): void => {
      scrollToLine(line);
      setOutline(null);
    },
    [scrollToLine]
  );

  const goToChapter = useCallback(
    (direction: -1 | 1): void => {
      // `anchorRef.current`, not the `anchorLine` state closed over here: a rapid second
      // `]` can fire before React has re-rendered (and so re-created this callback) after
      // the first press's `setAnchorLine` — key-repeat routinely does this within the
      // same tick. `optionsRef` in `useHotkeyHandler` would then hand the keydown listener
      // this exact stale closure, still bound to the pre-jump `anchorLine`, and it would
      // recompute the same target it just jumped to — a second "does nothing" on top of
      // the first fix's. The ref is written synchronously in `scrollToLine`, so reading it
      // here is correct regardless of which render generation of this closure runs it.
      const line = anchorRef.current?.line ?? anchorLine;
      const target = stepChapter(chapterHeaders, line, direction);
      if (target) scrollToLine(target.line);
    },
    [chapterHeaders, anchorLine, scrollToLine]
  );

  const reloadDictionaries = useCallback((): void => {
    // The owner reports its own failures (toast + status); this catch only keeps a
    // rejection from escaping as an unhandled one.
    requestDictionaryReload().catch((cause: unknown) => {
      logger.error('Reader-triggered dictionary reload failed:', cause);
    });
  }, []);

  // The add-entry shortcut family, reused: the same hook (and the same DictionaryEntry
  // modal) the Translator uses, so Cmd-1..6 resolve the same targets here as there —
  // including the two that mean "the active fiction's dictionaries", which the open
  // book's binding is what makes reliable.
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
    handleQuickAddDictionaryChange,
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
    // The refill is what moves rows, so it — not a stopwatch — is what decides how long the
    // anchor keeps being re-applied.
    isRefilling: isTranslating,
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

  // The follower panels' own scroll handlers. Stable rather than inline arrows: both
  // panels are memoized, and a fresh closure per render would make every render a prop
  // change and the memo a no-op.
  const handleOriginalScroll = useCallback((): void => {
    syncScroll(ORIGINAL_PANEL);
  }, [syncScroll]);

  const handleCharacterScroll = useCallback((): void => {
    syncScroll(CHARACTER_ONLY_PANEL);
  }, [syncScroll]);

  const translationRow = useCallback(
    (index: number): PanelRow =>
      vietnameseRow(
        getTranslatedLine(index),
        getLine(index),
        isBlankAt(index),
        getTranslatedSegments(index)
      ),
    [getLine, getTranslatedLine, getTranslatedSegments, isBlankAt]
  );

  const originalRow = useCallback(
    (index: number): PanelRow => {
      const line = getLine(index);
      const segments = line === undefined ? undefined : getOriginalSegments(index);
      return {
        text: line,
        // The source panel is only ever pending on its own page fetch, never on translation.
        isPending: line === undefined,
        lang: 'zh',
        isBlank: isBlankAt(index),
        // A chunk covers part of a line before the rest of it lands, and this panel shows
        // the file's own line either way — so whatever no run covers is filled back in as
        // plain text rather than dropped.
        // Cached on the runs' own identity: this runs per rendered row per render, and a
        // fresh array each time is a changed prop for every row in the panel.
        segments: segments && fillSegmentGapsCached(line as string, segments),
      };
    },
    [getLine, getOriginalSegments, isBlankAt]
  );

  const characterRow = useCallback(
    (index: number): PanelRow =>
      vietnameseRow(
        getCharacterOnlyLine(index),
        getLine(index),
        isBlankAt(index),
        getCharacterOnlySegments(index)
      ),
    [getCharacterOnlyLine, getCharacterOnlySegments, getLine, isBlankAt]
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
        onPageDown={() => pageBy(1)}
        onPageUp={() => pageBy(-1)}
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
        <div className={styles.chapterStripReference}>
          <div className={styles.chapterStripNav}>
            <button
              onClick={() => goToChapter(-1)}
              // Mirrors `stepChapter` itself rather than re-deriving "is there a previous
              // chapter" from `chapterIndex` — since a step back from mid-chapter now
              // lands on the *current* chapter's own start, the button stays enabled in
              // the first chapter too, as long as there's somewhere for it to go.
              disabled={
                chapterHeaders.length === 0 || stepChapter(chapterHeaders, anchorLine, -1) === null
              }
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
        </div>
        <div className={styles.chapterStripTranslation}>
          <button
            className={styles.chapterStripCurrent}
            onClick={() => setOutline({ focusSearch: false })}
            title="Open chapter list"
          >
            <List size={13} />
            <span className={styles.chapterStripTitle}>
              {currentChapter
                ? (getTranslatedTitle(currentChapter.line) ?? currentChapter.title) || '(untitled)'
                : chapterHeaders.length > 0
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
            isFollower
            scrollRef={originalPanel.scrollRef}
            virtualizer={originalPanel.virtualizer}
            rows={originalPanel.virtualizer.getVirtualItems()}
            totalSize={originalTotalSize}
            // Both: this panel's text comes from `getLine` (so a landed page changes it)
            // and its runs from the chunk cache (so a landed chunk does too).
            contentVersion={linesVersion + translationVersion}
            getRow={originalRow}
            onScroll={handleOriginalScroll}
            onWheel={forwardWheelToMaster}
            highlight={highlight}
            onSegmentClick={toggleHighlight}
          />
          <ReaderPanel
            title="Character only"
            variant="characterOnly"
            isFollower
            scrollRef={characterPanel.scrollRef}
            virtualizer={characterPanel.virtualizer}
            rows={characterPanel.virtualizer.getVirtualItems()}
            totalSize={characterTotalSize}
            contentVersion={linesVersion + translationVersion}
            getRow={characterRow}
            onScroll={handleCharacterScroll}
            onWheel={forwardWheelToMaster}
            highlight={highlight}
            onSegmentClick={toggleHighlight}
          />
        </div>
        <ReaderPanel
          title="Translation"
          variant="translation"
          scrollRef={scrollRef}
          virtualizer={virtualizer}
          rows={virtualRows}
          totalSize={translationTotalSize}
          contentVersion={linesVersion + translationVersion}
          getRow={translationRow}
          onScroll={handleScroll}
          highlight={highlight}
          onSegmentClick={toggleHighlight}
        />
      </div>

      {showQuickAdd && (
        <ModalErrorBoundary onClose={closeQuickAdd} title="❌ Failed to load Add">
          <DictionaryEntry
            onClose={closeQuickAdd}
            selectedDictionary={quickAddDictionary}
            allowDictionarySelection={true}
            onDictionaryChange={handleQuickAddDictionaryChange}
            initialSource={clipboardText}
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
          getTranslatedTitle={getTranslatedTitle}
          isTranslatingTitles={isTranslatingTitles}
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
