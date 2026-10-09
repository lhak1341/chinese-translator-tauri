import type { SemanticArrayBuilder } from '../highlighting/SemanticArrayBuilder';
import { matchWordSegments } from '../highlighting/WordSegmentMatcher';
import type { WordSegment } from '../highlighting/WordSegmentMatcher';
import { logger } from '../logger';
import { snapshotSemanticArrays } from '../performance/ProgressiveProgressReporter';
import { applySmartCapitalization, finishFullText } from './FormattingPasses';
import type { FormattingChunk } from './FormattingPasses';

/** The chunk fields the finishing pass reads; the chunk shape itself belongs to TextChunker. */
export type FullTextChunk = FormattingChunk;

/** The two ChunkPostProcessor calls the finishing pass needs. Injected so tests need no engine. */
interface FinishChunkPostProcessor {
  translatePunctuation(chunks: FullTextChunk[], punctuationDict: Record<string, unknown>): void;
  reconstructText(chunks: FullTextChunk[]): string;
}

export interface FullTextAssemblyDeps {
  chunkPostProcessor: FinishChunkPostProcessor;
  punctuationDict: Record<string, unknown>;
  properNounTranslations: ReadonlyMap<string, string> | null;
  /** The engine's shared builder, already filled by every batch. Mutated once, at the end. */
  builder: SemanticArrayBuilder;
}

export interface FullTextAssemblyResult {
  translatedText: string;
  semanticArrays: ReturnType<typeof snapshotSemanticArrays>;
  prebuiltSegments: WordSegment[];
}

/**
 * The Full Translation result, built from every chunk once the batches are done (CONTEXT.md
 * "FullTextAssembly"). The twin of CharOnlyAssembly, except that its builder is the engine's
 * shared one, which the batch phase filled: this is the one place that builder is mutated at
 * the end (`updateWithCapitalizedText`).
 *
 * ORDER IS LOAD-BEARING:
 * 1. Punctuation over ALL chunks, not per batch: comma-quote spacing reads a chunk's neighbours.
 * 2. Capitalization over all chunks, before reconstruct, so the text carries it.
 * 3. reconstructText, then finishFullText once. The NFC normalization lives in finishFullText;
 *    reconstructText does none, so the Vietnamese diacritic lengths the segments are sliced by
 *    ("màu" as 3 code points, not 4) are only settled after step 3.
 * 4. Word segments are matched against the FINISHED text (case-insensitively), from the arrays
 *    as the batches left them.
 * 5. updateWithCapitalizedText, then the casing of every matched unit taken from its segment, so
 *    the arrays carry the capitalised forms the text has. The second step overrides the first
 *    for units without a recorded position, where updateWithCapitalizedText guesses by first
 *    occurrence.
 *
 * The batch preview text (ProgressiveBatchText) is cleaned only; the text returned here is the
 * finished one and is not an extension of it.
 */
export function assembleFullText(
  chunks: FullTextChunk[],
  { chunkPostProcessor, punctuationDict, properNounTranslations, builder }: FullTextAssemblyDeps
): FullTextAssemblyResult {
  chunkPostProcessor.translatePunctuation(chunks, punctuationDict);
  applySmartCapitalization(chunks, properNounTranslations);

  // reconstructText builds no segments: prebuiltSegments is built below via matchWordSegments,
  // against the finished text.
  const translatedText = finishFullText(chunkPostProcessor.reconstructText(chunks));

  const batchArrays = builder.getArrays();
  const translatedChunk = chunks.find((chunk) => chunk.translated && chunk.content.trim());

  let prebuiltSegments: WordSegment[];
  if (translatedChunk && batchArrays.original.length > 0) {
    // Map each translated semantic unit onto its actual position in the output text
    // (extracted to WordSegmentMatcher — architecture review 2026-07-29, candidate #1)
    prebuiltSegments = matchWordSegments(batchArrays, translatedText);
  } else {
    prebuiltSegments = [];
    logger.log(`⚠️ Progressive: No translated chunks or semantic arrays available`);
  }

  builder.updateWithCapitalizedText(translatedText);
  // updateWithCapitalizedText cannot place a unit that has no recorded position (every unit after
  // the first chunk) except by its text's first occurrence, which stamps a later lowercase repeat
  // with an earlier capital. The segment match above already placed every unit it found, so its
  // slice of the finished text is the casing to take.
  for (const segment of prebuiltSegments) {
    if (segment.type !== 'semantic') continue;
    builder.setTranslatedCasing(
      segment.unitIndex,
      translatedText.slice(segment.start, segment.end)
    );
  }

  // Metadata gaps get the shared explicit-missing default (isMissing: true), the same fill the
  // progress callbacks use.
  return {
    translatedText,
    semanticArrays: snapshotSemanticArrays(builder.getArrays()),
    prebuiltSegments,
  };
}
