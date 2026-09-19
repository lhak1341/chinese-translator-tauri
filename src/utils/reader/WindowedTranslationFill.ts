import { chunkText } from './TranslationWindow';
import type { ChunkPlan } from './TranslationWindow';
import type { TranslationChunkCache } from './TranslationChunkCache';
import { bridgeGlossSegments } from './LineSegments';
import type { PositionedSegment } from './LineSegments';
import { precomputeOriginalSegments, segmentFromPositionMetadata } from '../highlighting';
import type { SemanticArrays } from '../../types/SemanticTypes';

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

export interface FillEngineCalls {
  /** One engine call. */
  translateChunk: (text: string) => Promise<ChunkTranslationResult>;
  /** The same text through the engine's character-only pass, run after the chunk's full
   * translation has already landed — see the caller-side ordering note in `fillPlan`. */
  translateGloss: (text: string) => Promise<GlossResult>;
}

export type FillEvent =
  | { type: 'translated'; chunk: ChunkPlan }
  | { type: 'glossed'; chunk: ChunkPlan }
  /** The engine threw for this chunk. Not fatal to the plan — see `fillPlan`'s doc comment. */
  | { type: 'skipped'; chunk: ChunkPlan; cause: unknown };

/**
 * Translate a plan's missing chunks into `cache`, nearest-anchor-first, one call at a time.
 *
 * Plain and DOM-free: no React, no engine construction, no cache/plan computation of its
 * own — `plan` is already ordered and filtered to what's missing (`TranslationWindow.ts`
 * owns that arithmetic), and `cache` is the one place results are written. That is what
 * lets this be driven by a fake clock and a fake `engine` in a test with no `renderHook`.
 *
 * Two different staleness questions are asked at two different points, and conflating
 * them is a bug this module has already shipped once (fixed 2026-09-19, later that same
 * day — see the postmortem in `src/utils/reader/CLAUDE.md`):
 *
 * - **`isStale()`**, checked only before *starting* a new chunk, answers "is there a newer
 *   plan than this one?" — true on every ordinary re-plan (the anchor moved, a page
 *   landed, the viewport resized). Skipping a not-yet-started chunk here is free: the
 *   newer plan will pick it up if it's still needed.
 * - **`isAbandoned()`**, checked after each of a chunk's two awaits, answers "has the
 *   *cache itself* stopped being trustworthy?" — true only on a book switch or unmount,
 *   never on an ordinary re-plan. A chunk already in flight must finish both its calls
 *   once started: `translateChunk`'s result marks the chunk `isFresh` in the cache, so if
 *   `translateGloss` is abandoned by the *same* generation signal `isStale()` uses (as an
 *   earlier version of this function did), the chunk's gloss never gets attempted again —
 *   `isFresh` is already true, so no future plan ever retries it. That chunk sits with a
 *   complete translation and a permanently-`null` gloss: the reference panel shows Chinese
 *   for it forever, with no error logged, because nothing threw.
 *
 * Using `isStale()`'s signal for `isAbandoned()` was the exact mistake: an anchor move
 * mid-`await` — completely ordinary while scrolling — abandoned the gloss call for
 * whatever chunk happened to be in flight, at a rate roughly proportional to how often the
 * reader scrolls. `isAbandoned()` must bump *only* on a real book switch or unmount, not on
 * every re-plan, or this reintroduces the same bug it was meant to fix.
 *
 * A chunk that throws is `yield`ed as `skipped`, not thrown — the caller logs it and the
 * loop moves on to the next chunk. One bad passage no longer blocks translating the rest
 * of the visible window (changed 2026-09-19; previously the whole plan aborted on the
 * first error, see `useWindowedTranslation.ts`'s test suite for the old behavior pinned
 * before this change).
 */
export async function* fillPlan(
  cache: TranslationChunkCache,
  plan: readonly ChunkPlan[],
  getLine: (index: number) => string | undefined,
  engine: FillEngineCalls,
  isStale: () => boolean,
  isAbandoned: () => boolean
): AsyncGenerator<FillEvent> {
  for (const chunk of plan) {
    if (isStale()) return;
    const text = chunkText(chunk, getLine);
    if (text.trim().length === 0) continue;

    try {
      const result = await engine.translateChunk(text);
      if (isAbandoned()) return;

      // Whatever this chunk held before — the stale translation being replaced right now
      // — still has a gloss beside it, and the gloss pass is a whole engine call behind.
      // Keeping its text spares the reference panel a blank while that call runs; its
      // *segments* are dropped, because they were relabeled against the outgoing
      // translation's units and would light the wrong word against the new ones.
      const previous = cache.get(chunk.key);
      cache.set({
        chunk,
        sourceText: text,
        // The Vietnamese runs are measured against an NFC-normalized copy of this text
        // (`matchWordSegments` normalizes before it searches), so the cache must hold the
        // same normalization or every offset after the first composed character would
        // slice a row in the wrong place.
        translatedText: result.translatedText.normalize('NFC'),
        semanticArrays: result.semanticArrays,
        prebuiltSegments: result.prebuiltSegments,
        originalSegments: result.semanticArrays
          ? precomputeOriginalSegments(text, result.semanticArrays)
          : [],
        characterOnlyText: previous?.characterOnlyText ?? null,
        characterOnlySegments: null,
      });
      yield { type: 'translated', chunk };

      // Second pass, after the translation is already cached: the engine serves one caller
      // at a time, so this cannot overlap the call above, and running it here rather than
      // inside `translateChunk` is what keeps the translation landing at its own pace
      // instead of at twice the cost.
      const gloss = await engine.translateGloss(text);
      if (isAbandoned()) return;
      const stored = cache.get(chunk.key);
      if (stored) {
        // Normalized for the same reason the full translation is: the gloss's own
        // segmenter measures its offsets against an NFC copy of the text.
        const glossText = gloss.translatedText.normalize('NFC');
        cache.set({
          ...stored,
          characterOnlyText: glossText,
          // The gloss is a second pass with semantic arrays of its own, so its unit
          // indices mean nothing to the other two panels until relabeled by the source
          // characters each one covers.
          characterOnlySegments: gloss.semanticArrays
            ? bridgeGlossSegments(
                segmentFromPositionMetadata(glossText, gloss.semanticArrays),
                precomputeOriginalSegments(text, gloss.semanticArrays),
                stored.originalSegments
              )
            : null,
        });
        yield { type: 'glossed', chunk };
      }
    } catch (cause) {
      yield { type: 'skipped', chunk, cause };
    }
  }
}
