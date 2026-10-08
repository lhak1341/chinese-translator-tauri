import { cleanFullText } from './FormattingPasses';

/** The chunk fields the batch step touches; the chunk shape itself belongs to TextChunker. */
interface BatchChunk {
  content: string;
}

/** The two ChunkPostProcessor calls a batch needs. Injected so tests need no engine. */
interface BatchChunkPostProcessor {
  translatePunctuation(
    chunks: BatchChunk[],
    punctuationDict: Record<string, unknown>,
    allChunks: BatchChunk[]
  ): void;
  reconstructText(chunks: BatchChunk[]): string;
}

export interface ProgressiveBatchTextDeps {
  punctuationDict: Record<string, unknown>;
  chunkPostProcessor: BatchChunkPostProcessor;
}

export interface ProgressiveBatchTextResult {
  batchText: string;
  cumulativeText: string;
}

export interface ProgressiveBatchText {
  /**
   * Translate the batch's punctuation, rebuild its text, clean it and append it. `allChunks`
   * is every chunk of the text, translatable or not: the batch alone cannot see its neighbours
   * (comma spacing).
   * A throw propagates; there is no fallback text.
   */
  addBatch(batch: BatchChunk[], allChunks: BatchChunk[]): ProgressiveBatchTextResult;
}

/**
 * The running text of translateWithProgressiveBatches. Batches are cleaned with cleanFullText;
 * the whole text is finished once, later, with finishFullText, so this text is a preview of the
 * final one, not a prefix of it.
 */
export function createProgressiveBatchText({
  punctuationDict,
  chunkPostProcessor,
}: ProgressiveBatchTextDeps): ProgressiveBatchText {
  let cumulativeText = '';

  return {
    addBatch(batch, allChunks) {
      chunkPostProcessor.translatePunctuation(batch, punctuationDict, allChunks);
      const batchText = cleanFullText(chunkPostProcessor.reconstructText(batch));
      cumulativeText += batchText;
      return { batchText, cumulativeText };
    },
  };
}
