import type { TextChunk } from '../../types/TextChunk';
import { cleanFullText } from './FormattingPasses';

/** The chunk fields the batch step touches (`TextChunk`, src/types/TextChunk.d.ts). */
type BatchChunk = Pick<TextChunk, 'content'>;

/** The two ChunkPostProcessor calls a batch needs. Injected so tests need no engine. */
interface BatchChunkPostProcessor {
  translatePunctuation(
    chunks: BatchChunk[],
    translateText: (text: string) => string,
    allChunks: BatchChunk[]
  ): void;
  reconstructText(chunks: BatchChunk[]): string;
}

export interface ProgressiveBatchTextDeps {
  /** The punctuation dictionary applied to a text (`DictionaryManager.translatePunctuationText`). */
  translatePunctuationText: (text: string) => string;
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
  translatePunctuationText,
  chunkPostProcessor,
}: ProgressiveBatchTextDeps): ProgressiveBatchText {
  let cumulativeText = '';

  return {
    addBatch(batch, allChunks) {
      chunkPostProcessor.translatePunctuation(batch, translatePunctuationText, allChunks);
      const batchText = cleanFullText(chunkPostProcessor.reconstructText(batch));
      cumulativeText += batchText;
      return { batchText, cumulativeText };
    },
  };
}
