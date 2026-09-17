import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assembleTranslatedLines,
  chunkText,
  computeBands,
  orderChunksByDistance,
  planChunks,
  snapRangeToParagraphs,
} from '../utils/reader/TranslationWindow';
import { TranslationChunkCache } from '../utils/reader/TranslationChunkCache';
import type { SemanticArrays } from '../types/SemanticTypes';
import type { TranslationSegment } from '../types/TranslationEngineTypes';
import { extractErrorMessage } from '../utils/errorHelpers';
import { logger } from '../utils/logger';

/** What one engine call gives back, trimmed to what the Reader keeps. */
export interface ChunkTranslationResult {
  translatedText: string;
  semanticArrays: SemanticArrays | null;
  prebuiltSegments: TranslationSegment[];
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
  translateGloss: (text: string) => Promise<string>;
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
    forceRender((n) => n + 1);
  }, []);

  // A different book means every cached chunk is keyed by a line range in another file.
  useEffect(() => {
    generationRef.current += 1;
    cacheRef.current.clear();
    linesRef.current = new Map();
    characterOnlyRef.current = new Map();
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
    if (cache.setVersion(dictionaryVersion)) rebuild();
    if (!isEnabled || lineCount === 0 || viewportLines <= 0) return;

    const generation = (generationRef.current += 1);
    const bands = computeBands({ anchorLine, viewportLines, overscanLines, lineCount });
    if (cache.prune(bands.keep).length > 0) rebuild();

    const fetchRange = snapRangeToParagraphs(bands.fetch, getLine, lineCount);
    const plan = orderChunksByDistance(planChunks(fetchRange, getLine, lineCount), anchorLine);
    const missing = plan.filter((chunk) => !cache.has(chunk.key));
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
          cache.set({ chunk, ...result, characterOnlyText: null });
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
            cache.set({ ...stored, characterOnlyText: gloss });
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

  return { getTranslatedLine, getCharacterOnlyLine, isTranslating, error };
}
