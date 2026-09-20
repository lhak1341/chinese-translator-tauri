import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assembleTranslatedLines,
  computeBands,
  orderChunksByDistance,
  planChunks,
  snapRangeToParagraphs,
} from '../utils/reader/TranslationWindow';
import {
  buildCharacterOnlyLineSegments,
  buildOriginalLineSegments,
  buildTranslatedLineSegments,
} from '../utils/reader/LineSegments';
import type { ReaderSegment, SegmentedChunk } from '../utils/reader/LineSegments';
import { TranslationChunkCache } from '../utils/reader/TranslationChunkCache';
import { fillPlan } from '../utils/reader/WindowedTranslationFill';
import type { ChunkTranslationResult, GlossResult } from '../utils/reader/WindowedTranslationFill';
import type { EngineCall } from '../utils/reader/EngineCall';
import { logger } from '../utils/logger';

export type { ChunkTranslationResult, GlossResult } from '../utils/reader/WindowedTranslationFill';

export interface UseWindowedTranslationOptions {
  /** The open book. A change means every cached chunk belongs to a different novel. */
  fingerprint: string | null;
  lineCount: number;
  /** Topmost line touching the viewport — the same anchor the reading position uses. */
  anchorLine: number;
  viewportLines: number;
  overscanLines: number;
  /** Bumped by `useBookLines` whenever a page lands, so a plan blocked on unfetched lines re-runs. */
  linesVersion: number;
  getLine: (index: number) => string | undefined;
  /**
   * One engine call. Must be referentially stable, and must be produced by `callOnEngine`
   * (`src/utils/reader/EngineCall.ts`) — the `EngineCall` brand is what makes wiring a
   * callback that bypasses the shared engine queue a compile error.
   */
  translateChunk: EngineCall<ChunkTranslationResult>;
  /**
   * The same text through the engine's character-only pass, for the reference panel. Runs
   * *after* the chunk's full translation has already been published, so the gloss costs
   * the translation panel nothing but its own engine time. Must be referentially stable and
   * `callOnEngine`-produced, same as `translateChunk`.
   */
  translateGloss: EngineCall<GlossResult>;
  /** Bumped on every engine reinitialization; a change invalidates the whole cache. */
  dictionaryVersion: number;
  /** Translation only runs while the engine is ready and the Reader is the visible tab. */
  isEnabled: boolean;
}

export interface WindowedTranslation {
  /** Vietnamese for this raw file line, or `undefined` while it is still Chinese. */
  getTranslatedLine: (index: number) => string | undefined;
  /** Character-by-character Vietnamese for this raw file line, or `undefined`. */
  getCharacterOnlyLine: (index: number) => string | undefined;
  /**
   * The gloss of this line cut into clickable runs, or `undefined` where its second pass
   * has not landed. Their unit indices are the full translation's, so a click here lights
   * the same word in the other two panels.
   */
  getCharacterOnlySegments: (index: number) => readonly ReaderSegment[] | undefined;
  /**
   * The Vietnamese of this line cut into clickable runs, or `undefined` where nothing has
   * been translated yet. Concatenates to exactly `getTranslatedLine(index)`.
   */
  getTranslatedSegments: (index: number) => readonly ReaderSegment[] | undefined;
  /**
   * The Chinese of this line cut into clickable runs, or `undefined` where no chunk covers
   * it. May cover only part of the line while a fill is in flight — see `fillSegmentGaps`.
   */
  getOriginalSegments: (index: number) => readonly ReaderSegment[] | undefined;
  /** True while a fill is in progress, for a quiet indicator rather than a blocking state. */
  isTranslating: boolean;
  /**
   * Bumped every time the folded output above changes — a chunk landing, an eviction, a
   * book switch.
   *
   * Every getter here is a `useCallback(..., [])` reading through a ref, so none of them
   * changes identity when the text behind it does. That is deliberate (it is what lets the
   * panels' `estimateSize` stay stable), but it means a memoized consumer cannot tell from
   * its props that there is new text to show. This is the value it watches instead.
   */
  version: number;
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
 * and the generation counter, drives `fillPlan` inside an effect, and folds landed chunks
 * back into per-line strings/segments for render (`rebuild`).
 *
 * Nothing here is written to disk, and nothing is translated ahead of the fetch band:
 * translating a screenful takes a fraction of a second against a reader who spends tens of
 * seconds on it.
 */
export function useWindowedTranslation({
  fingerprint,
  lineCount,
  anchorLine,
  viewportLines,
  overscanLines,
  linesVersion,
  getLine,
  translateChunk,
  translateGloss,
  dictionaryVersion,
  isEnabled,
}: UseWindowedTranslationOptions): WindowedTranslation {
  const cacheRef = useRef<TranslationChunkCache>(new TranslationChunkCache());
  const linesRef = useRef<Map<number, string>>(new Map());
  const characterOnlyRef = useRef<Map<number, string>>(new Map());
  const translatedSegmentsRef = useRef<Map<number, ReaderSegment[]>>(new Map());
  const originalSegmentsRef = useRef<Map<number, ReaderSegment[]>>(new Map());
  const characterOnlySegmentsRef = useRef<Map<number, ReaderSegment[]>>(new Map());
  const generationRef = useRef(0);
  // Bumps only when the cache itself stops being trustworthy — a book switch or unmount —
  // never on an ordinary re-plan (anchor move, page landing, resize). Separate from
  // `generationRef` on purpose: see `fillPlan`'s doc comment for the bug conflating them
  // caused (a chunk's gloss silently abandoned by an anchor move, orphaned forever since
  // its translation was already cached as "fresh").
  const bookGenerationRef = useRef(0);
  const [version, forceRender] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);

  const rebuild = useCallback((): void => {
    const entries = cacheRef.current.values();
    linesRef.current = assembleTranslatedLines(entries);
    // The character-only pass folds back into lines by exactly the same rule — it is the
    // same chunks through the same engine — so it reuses the same assembler rather than
    // growing a second one that could drift from it. A chunk whose gloss has not landed
    // yet is left out entirely rather than assembled as an empty string: an empty string
    // is a translated blank line, which would blank the reference panel instead of leaving
    // the Chinese showing.
    characterOnlyRef.current = assembleTranslatedLines(
      entries
        .filter((entry) => entry.characterOnlyText !== null)
        .map(({ chunk, characterOnlyText }) => ({
          chunk,
          translatedText: characterOnlyText as string,
        }))
    );
    // Cut from the same chunks the lines above were assembled from, so a row's runs and its
    // plain string are two views of one fold rather than two foldings that can disagree.
    const segmented: SegmentedChunk[] = entries.map((entry) => ({
      ...entry,
      translatedSegments: entry.prebuiltSegments,
    }));
    translatedSegmentsRef.current = buildTranslatedLineSegments(segmented);
    originalSegmentsRef.current = buildOriginalLineSegments(segmented);
    characterOnlySegmentsRef.current = buildCharacterOnlyLineSegments(segmented);
    forceRender((n) => n + 1);
  }, []);

  // A different book means every cached chunk is keyed by a line range in another file.
  useEffect(() => {
    generationRef.current += 1;
    bookGenerationRef.current += 1;
    cacheRef.current.clear();
    linesRef.current = new Map();
    characterOnlyRef.current = new Map();
    translatedSegmentsRef.current = new Map();
    originalSegmentsRef.current = new Map();
    characterOnlySegmentsRef.current = new Map();
    forceRender((n) => n + 1);
  }, [fingerprint]);

  // Abandon any fill still running when the panel goes away.
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
    // chunk's two awaits. True only on a book switch or unmount, never an ordinary
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
    // Not read in the body — the book-change effect above owns the cache reset. Listed so
    // a fill is re-planned for the new book even if nothing else in this list moved.
    fingerprint,
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

  const getTranslatedLine = useCallback(
    (index: number): string | undefined => linesRef.current.get(index),
    []
  );

  const getCharacterOnlyLine = useCallback(
    (index: number): string | undefined => characterOnlyRef.current.get(index),
    []
  );

  const getTranslatedSegments = useCallback(
    (index: number): readonly ReaderSegment[] | undefined =>
      translatedSegmentsRef.current.get(index),
    []
  );

  const getOriginalSegments = useCallback(
    (index: number): readonly ReaderSegment[] | undefined => originalSegmentsRef.current.get(index),
    []
  );

  const getCharacterOnlySegments = useCallback(
    (index: number): readonly ReaderSegment[] | undefined =>
      characterOnlySegmentsRef.current.get(index),
    []
  );

  return {
    getTranslatedLine,
    getCharacterOnlyLine,
    getTranslatedSegments,
    getOriginalSegments,
    getCharacterOnlySegments,
    isTranslating,
    version,
  };
}
