import type { SemanticArrayBuilder } from '../highlighting/SemanticArrayBuilder';
import { matchWordSegments } from '../highlighting/WordSegmentMatcher';
import type { WordSegment } from '../highlighting/WordSegmentMatcher';
import { logger } from '../logger';
import { applySmartCapitalization, finishFullText } from './FormattingPasses';
import type { FormattingChunk } from './FormattingPasses';

/** The chunk fields the finishing pass reads (`TextChunk`, src/types/TextChunk.d.ts). */
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

interface ArraysSnapshot<O, T, M> {
  original: O[];
  translated: T[];
  metadata: M[];
}

/**
 * Copy the builder's arrays for the result. The arrays are copied, the entries are not: React
 * keeps the result, and the builder is reset and refilled by the next translation, so the
 * result must never hold its live arrays (ADR-100). The builder keeps the three arrays one
 * length, so nothing is padded.
 */
export function snapshotSemanticArrays<O, T, M>(
  semanticArrays: Partial<ArraysSnapshot<O, T, M>> | null | undefined
): ArraysSnapshot<O, T, M> {
  const arrays = semanticArrays ?? {};
  return {
    original: arrays.original ? [...arrays.original] : [],
    translated: arrays.translated ? [...arrays.translated] : [],
    metadata: arrays.metadata ? arrays.metadata.slice() : [],
  };
}

export interface FullTextAssemblyResult {
  translatedText: string;
  semanticArrays: ReturnType<SemanticArrayBuilder['getArrays']>;
  prebuiltSegments: WordSegment[];
}

/**
 * The Full Translation result, built from every chunk once the batches are done (GLOSSARY.md
 * "FullTextAssembly"). The twin of CharOnlyAssembly, except that its builder is the engine's
 * shared one, which the batch phase filled: this is the one place that builder is mutated at
 * the end (`setTranslatedCasing`).
 *
 * ORDER IS LOAD-BEARING:
 * 1. Punctuation over ALL chunks, not per batch: comma-quote spacing reads a chunk's neighbours.
 * 2. Capitalization over all chunks, before reconstruct, so the text carries it.
 * 3. reconstructText, then finishFullText once. The NFC normalization lives in finishFullText;
 *    reconstructText does none, so the Vietnamese diacritic lengths the segments are sliced by
 *    ("màu" as 3 code points, not 4) are only settled after step 3.
 * 4. Word segments are matched against the FINISHED text (case-insensitively), from the arrays
 *    as the batches left them.
 * 5. The casing of every matched unit is taken from its segment, so the arrays carry the
 *    capitalised forms the text has. A unit the match did not place keeps the form the phases gave it.
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

  // Each unit the segment match placed takes its casing from its slice of the finished text.
  for (const segment of prebuiltSegments) {
    if (segment.type !== 'semantic') continue;
    builder.setTranslatedCasing(
      segment.unitIndex,
      translatedText.slice(segment.start, segment.end)
    );
  }

  return {
    translatedText,
    semanticArrays: snapshotSemanticArrays(builder.getArrays()),
    prebuiltSegments,
  };
}
