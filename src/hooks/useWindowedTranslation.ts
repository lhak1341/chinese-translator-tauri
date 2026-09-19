import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assembleTranslatedLines,
  chunkText,
  computeBands,
  orderChunksByDistance,
  planChunks,
  snapRangeToParagraphs,
} from '../utils/reader/TranslationWindow';
import {
  bridgeGlossSegments,
  buildCharacterOnlyLineSegments,
  buildOriginalLineSegments,
  buildTranslatedLineSegments,
} from '../utils/reader/LineSegments';
import type {
  PositionedSegment,
  ReaderSegment,
  SegmentedChunk,
} from '../utils/reader/LineSegments';
import { TranslationChunkCache } from '../utils/reader/TranslationChunkCache';
import { precomputeOriginalSegments, segmentFromPositionMetadata } from '../utils/highlighting';
import type { SemanticArrays } from '../types/SemanticTypes';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';

/** What one engine call gives back, trimmed to what the Reader keeps. */
export interface ChunkTranslationResult {
  translatedText: string;
  semanticArrays: SemanticArrays | null;
  prebuiltSegments: PositionedSegment[];
}

/** What the character-only pass gives back. */
export interface GlossResult {
  translatedText: string;
  semanticArrays: SemanticArrays | null;
}

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
  /** One engine call. Must be referentially stable. */
  translateChunk: (text: string) => Promise<ChunkTranslationResult>;
  /**
   * The same text through the engine's character-only pass, for the reference panel. Runs
   * *after* the chunk's full translation has already been published, so the gloss costs
   * the translation panel nothing but its own engine time. Must be referentially stable.
   */
  translateGloss: (text: string) => Promise<GlossResult>;
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
  error: string | null;
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
  const [, forceRender] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    cacheRef.current.clear();
    linesRef.current = new Map();
    characterOnlyRef.current = new Map();
    translatedSegmentsRef.current = new Map();
    originalSegmentsRef.current = new Map();
    characterOnlySegmentsRef.current = new Map();
    setError(null);
    forceRender((n) => n + 1);
  }, [fingerprint]);

  // Abandon any fill still running when the panel goes away.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    // Invalidates without discarding: the page keeps the text it has until each chunk's
    // replacement arrives, rather than reverting to Chinese for the length of the refill.
    cache.setVersion(dictionaryVersion);
    if (!isEnabled || lineCount === 0 || viewportLines <= 0) return;

    const generation = (generationRef.current += 1);
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
      for (const chunk of missing) {
        if (generationRef.current !== generation) return;
        const text = chunkText(chunk, getLine);
        if (text.trim().length === 0) continue;
        try {
          const result = await translateChunk(text);
          // The work is done and the text is unchanged, so a chunk that finished after the
          // reader scrolled away is still worth keeping — but only if the dictionaries it
          // was translated against are still the ones in force.
          if (cache.version !== dictionaryVersion) return;
          // Whatever this chunk held before — the stale translation being replaced right
          // now — still has a gloss beside it, and the gloss pass is a whole engine call
          // behind. Keeping its text spares the reference panel a blank while that call
          // runs; its *segments* are dropped, because they were relabeled against the
          // outgoing translation's units and would light the wrong word against the new
          // ones. The panel shows them as plain text until the new gloss lands.
          const previous = cache.get(chunk.key);
          cache.set({
            chunk,
            ...result,
            // The Vietnamese runs are measured against an NFC-normalized copy of this text
            // (`matchWordSegments` normalizes before it searches), so the panel must hold
            // the same normalization or every offset after the first composed character
            // would slice a row in the wrong place.
            translatedText: result.translatedText.normalize('NFC'),
            sourceText: text,
            // Derived once, here, rather than on every rebuild: see `CachedChunk`.
            originalSegments: result.semanticArrays
              ? precomputeOriginalSegments(text, result.semanticArrays)
              : [],
            characterOnlyText: previous?.characterOnlyText ?? null,
            characterOnlySegments: null,
          });
          rebuild();
          setError(null);

          // Second pass, after the translation is already on screen: the engine serves one
          // caller at a time, so this cannot overlap the call above, and running it here
          // rather than inside `translateChunk` is what keeps the translation panel filling
          // at its own pace instead of at twice the cost.
          const gloss = await translateGloss(text);
          if (cache.version !== dictionaryVersion) return;
          const stored = cache.get(chunk.key);
          if (stored) {
            // Normalized for the same reason the full translation is: the gloss's own
            // segmenter measures its offsets against an NFC copy of the text.
            const glossText = gloss.translatedText.normalize('NFC');
            cache.set({
              ...stored,
              characterOnlyText: glossText,
              // The gloss is a second pass with semantic arrays of its own, so its unit
              // indices mean nothing to the other two panels until they are relabeled by
              // the source characters each one covers.
              characterOnlySegments: gloss.semanticArrays
                ? bridgeGlossSegments(
                    segmentFromPositionMetadata(glossText, gloss.semanticArrays),
                    precomputeOriginalSegments(text, gloss.semanticArrays),
                    stored.originalSegments
                  )
                : null,
            });
            rebuild();
          }
        } catch (cause) {
          logger.error('Failed to translate a reader chunk:', cause);
          setError(extractErrorMessage(cause));
          break;
        }
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
    error,
  };
}
