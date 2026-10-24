/**
 * A text chunk: the text between two punctuation separators, with the punctuation and line
 * breaks that follow it (GLOSSARY.md "TextChunker"). The one declaration of the shape:
 * `TextChunker.js` builds it, `ChunkPostProcessor.js` fills in the translated fields, and the
 * TypeScript passes that read it (`FormattingPasses`, `FullTextAssembly`,
 * `ProgressiveBatchText`) take a `Pick` of it.
 */
export interface TextChunk {
  /** The text, trimmed. Empty for a chunk that is only punctuation or a line break. */
  content: string;
  /** The punctuation that follows `content`, as written in the source. */
  punctuation: string;
  /** The line breaks that follow, as written. */
  lineBreaks: string;
  /** UTF-16 index of `content` in the source text. Unspecified when `content` is empty. */
  startIndex: number;
  /** What precedes the chunk, for capitalization: `'start'`, `'linebreak'` or the punctuation. */
  startedBy: string;
  /** The translated `content`; null until translated, and for non-Chinese content. */
  translated: string | null;
  /** `punctuation` through the punctuation dictionary; null until `translatePunctuation` runs. */
  translatedPunctuation: string | null;
  /**
   * `content` with the punctuation dictionary applied, set by `translatePunctuation`. The
   * text of a chunk that has no `translated` (non-Chinese content) in `reconstructText`.
   */
  translatedContent?: string;
  /** An opening quote `fixAngleQuotePositioning` moved onto this chunk from a quote-only one. */
  openingPunctuation?: string;
}
