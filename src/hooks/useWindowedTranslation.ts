import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeBands,
  orderChunksByDistance,
  planChunks,
  snapRangeToParagraphs,
} from '../utils/reader/TranslationWindow';
import { EMPTY_PANEL_ROWS, projectPanelRows, rowAt } from '../utils/reader/PanelRows';
import type { PanelRow, PanelRowsSnapshot } from '../utils/reader/PanelRows';
import { TranslationChunkCache } from '../utils/reader/TranslationChunkCache';
import { fillPlan } from '../utils/reader/WindowedTranslationFill';
import type { ChunkTranslationResult, GlossResult } from '../utils/reader/WindowedTranslationFill';
import type { EngineCall } from '../utils/reader/ReaderEngine';
import { logger } from '../utils/logger';

export type { ChunkTranslationResult, GlossResult } from '../utils/reader/WindowedTranslationFill';

export interface UseWindowedTranslationOptions {
  lineCount: number;
  /** Topmost line touching the viewport — the same anchor the reading position uses. */
  anchorLine: number;
  viewportLines: number;
  overscanLines: number;
  /** Bumped by `useBookLines` whenever a page lands, so a plan blocked on unfetched lines re-runs. */
  linesVersion: number;
  getLine: (index: number) => string | undefined;
  /**
   * Whether a line is one of the file's own paragraph breaks. Must be the panels' own rule
   * (`useReaderPanels`' `isBlankAt`): a row's `isBlank` and its estimated height have to
   * agree, or it jumps when it mounts. Must be stable.
   */
  isBlankAt: (index: number) => boolean;
  /**
   * One engine call. Must be referentially stable, and must come from `createReaderEngine`
   * (`src/utils/reader/ReaderEngine.ts`) — the `EngineCall` brand is what makes wiring a
   * callback that bypasses the Reader's engine queue a compile error.
   */
  translateChunk: EngineCall<ChunkTranslationResult>;
  /**
   * The same text through the engine's character-only pass, for the reference panel. Runs
   * *after* the chunk's full translation has already been published, so the gloss costs
   * the translation panel nothing but its own engine time. Must be referentially stable and
   * come from `createReaderEngine`, same as `translateChunk`.
   */
  translateGloss: EngineCall<GlossResult>;
  /** Bumped on every engine reinitialization; a change invalidates the whole cache. */
  dictionaryVersion: number;
  /** Translation only runs while the engine is ready and the Reader is the visible tab. */
  isEnabled: boolean;
}

export interface WindowedTranslation {
  /**
   * Each panel's row for a raw file line — see `PanelRow` and CONTEXT.md's "Reader Panels".
   * Each getter is referentially stable for the component's life.
   */
  getRow: {
    translation: (index: number) => PanelRow;
    original: (index: number) => PanelRow;
    characterOnly: (index: number) => PanelRow;
  };
  /**
   * Changes whenever any row's content does — a page landing, a chunk landing, an eviction.
   *
   * The getters above read through refs and never change identity, which is what lets the
   * panels' `estimateSize` stay stable — but it means a memoized panel cannot tell from
   * them that there is new text to show. This is the value it watches instead.
   */
  contentVersion: number;
  /** True while a fill is in progress, for a quiet indicator rather than a blocking state. */
  isTranslating: boolean;
}

/**
 * Translates the region the reader is in, on demand, as the anchor moves.
 *
 * The window is a buffer, not a single engine call: the fetch band is planned into chunks
 * of roughly 600 characters and filled one call at a time, nearest the anchor first. Every
 * chunk boundary is a cancellation point — scrolling away bumps the generation and the
 * loop stops after the call in flight, which is why the buffer can be much wider than the
 * highlighting ceiling allows any single call to be.
 *
 * The fill loop itself — cancellation, the cache read/write protocol, the two-call
 * ordering, per-chunk error isolation — lives in `fillPlan` (`src/utils/reader/
 * WindowedTranslationFill.ts`), a plain async generator with no React in it. This hook is
 * wiring: it plans the band into chunks (`TranslationWindow.ts`), owns the cache instance
 * and the generation counter, drives `fillPlan` inside an effect, and re-projects the panel
 * rows (`projectPanelRows`, `src/utils/reader/PanelRows.ts`) whenever a chunk lands or leaves.
 *
 * One book per instance: `BookReader` is keyed by fingerprint, so the cache never holds
 * another book's chunks, and the book never needs to be an input here.
 *
 * Nothing here is written to disk, and nothing is translated ahead of the fetch band:
 * translating a screenful takes a fraction of a second against a reader who spends tens of
 * seconds on it.
 */
export function useWindowedTranslation({
  lineCount,
  anchorLine,
  viewportLines,
  overscanLines,
  linesVersion,
  getLine,
  isBlankAt,
  translateChunk,
  translateGloss,
  dictionaryVersion,
  isEnabled,
}: UseWindowedTranslationOptions): WindowedTranslation {
  const cacheRef = useRef<TranslationChunkCache>(new TranslationChunkCache());
  const rowsRef = useRef<PanelRowsSnapshot>(EMPTY_PANEL_ROWS);
  const generationRef = useRef(0);
  // Bumps only when the cache itself stops being trustworthy — on unmount, which is also
  // what a book switch is —
  // never on an ordinary re-plan (anchor move, page landing, resize). Separate from
  // `generationRef` on purpose: see `fillPlan`'s doc comment for the bug conflating them
  // caused (a chunk's gloss silently abandoned by an anchor move, orphaned forever since
  // its translation was already cached as "fresh").
  const bookGenerationRef = useRef(0);
  const [version, forceRender] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);

  const rebuild = useCallback((): void => {
    rowsRef.current = projectPanelRows(cacheRef.current.values());
    forceRender((n) => n + 1);
  }, []);

  // Abandon any fill still running when the panel goes away. The chunk in flight still
  // resolves after unmount, and must not be folded into anything.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      bookGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    // Invalidates without discarding: the page keeps the text it has until each chunk's
    // replacement arrives, rather than reverting to Chinese for the length of the refill.
    cache.setVersion(dictionaryVersion);
    if (!isEnabled || lineCount === 0 || viewportLines <= 0) return;

    const generation = (generationRef.current += 1);
    const bookGeneration = bookGenerationRef.current;
    // "Is there a newer plan?" — checked only before starting a new chunk. True on every
    // ordinary re-plan; skipping a not-yet-started chunk here is free.
    const isStale = (): boolean => generationRef.current !== generation;
    // "Has the cache itself stopped being trustworthy?" — checked after each of a started
    // chunk's two awaits. True only on unmount (a book switch included), never an ordinary
    // re-plan — see `fillPlan`'s doc comment for why conflating this with `isStale` is a
    // bug already shipped once. `dictionaryVersion` belongs here too: a reload must not
    // let a chunk's result land against dictionaries no longer in force, same as before.
    const isAbandoned = (): boolean =>
      bookGenerationRef.current !== bookGeneration || cache.version !== dictionaryVersion;

    const bands = computeBands({ anchorLine, viewportLines, overscanLines, lineCount });
    if (cache.prune(bands.keep).length > 0) rebuild();

    const fetchRange = snapRangeToParagraphs(bands.fetch, getLine, lineCount);
    const plan = orderChunksByDistance(planChunks(fetchRange, getLine, lineCount), anchorLine);
    const missing = plan.filter((chunk) => !cache.isFresh(chunk.key));
    if (missing.length === 0) {
      // Clear it here too: a fill abandoned mid-loop never reaches its own tail, so without
      // this the indicator pulses for as long as the reader stays in already-translated text.
      setIsTranslating(false);
      return;
    }

    setIsTranslating(true);
    void (async () => {
      for await (const event of fillPlan(
        cache,
        missing,
        getLine,
        { translateChunk, translateGloss },
        isStale,
        isAbandoned
      )) {
        if (event.type === 'skipped') {
          // Isolated, not fatal: one bad chunk does not block the rest of the visible
          // window, and does not degrade the reading experience with a banner for it — the
          // chunk simply stays un-translated and retries the next time planning re-runs.
          logger.error('Failed to translate a reader chunk:', event.cause);
          continue;
        }
        rebuild();
      }
      if (generationRef.current === generation) setIsTranslating(false);
    })();
  }, [
    anchorLine,
    dictionaryVersion,
    getLine,
    isEnabled,
    lineCount,
    linesVersion,
    overscanLines,
    rebuild,
    translateChunk,
    translateGloss,
    viewportLines,
  ]);

  const translationRow = useCallback(
    (index: number): PanelRow =>
      rowAt(rowsRef.current, 'translation', index, getLine(index), isBlankAt(index)),
    [getLine, isBlankAt]
  );
  const originalRow = useCallback(
    (index: number): PanelRow =>
      rowAt(rowsRef.current, 'original', index, getLine(index), isBlankAt(index)),
    [getLine, isBlankAt]
  );
  const characterOnlyRow = useCallback(
    (index: number): PanelRow =>
      rowAt(rowsRef.current, 'characterOnly', index, getLine(index), isBlankAt(index)),
    [getLine, isBlankAt]
  );

  const getRow = useMemo(
    () => ({ translation: translationRow, original: originalRow, characterOnly: characterOnlyRow }),
    [translationRow, originalRow, characterOnlyRow]
  );

  // Both counters only ever increase, so their sum changes whenever either does.
  return { getRow, contentVersion: linesVersion + version, isTranslating };
}
