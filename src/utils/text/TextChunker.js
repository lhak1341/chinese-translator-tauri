// @ts-check
/** @import { TextChunk as TextChunkShape } from '../../types/TextChunk' */
/**
 * Text Chunker for punctuation-based text segmentation
 * Splits text into chunks by punctuation boundaries to prevent cross-punctuation matching
 * and enable parallel processing
 */

import { containsHan } from './TextTokenizer.js';

/** @implements {TextChunkShape} */
class TextChunk {
  /**
   * @param {string} content
   * @param {string} [punctuation]
   * @param {number} [startIndex]
   * @param {string} [lineBreaks]
   * @param {string} [startedBy]
   */
  constructor(content, punctuation = '', startIndex = 0, lineBreaks = '', startedBy = 'start') {
    this.content = content.trim(); // The actual text content
    this.punctuation = punctuation; // The punctuation that follows this chunk (will be translated later)
    this.lineBreaks = lineBreaks; // Line breaks that follow this chunk
    // UTF-16 index of `content` in the text: the scan starts at the first character after a
    // separator, an indent included, so skip the whitespace the trim dropped.
    this.startIndex = startIndex + (content.length - content.trimStart().length);
    this.startedBy = startedBy; // What precedes this chunk (for capitalization rules)
    /** @type {string | null} */
    this.translated = null; // Will hold the translated result
    /** @type {string | null} */
    this.translatedPunctuation = null; // Will hold the translated punctuation
  }

  toString() {
    return `Chunk("${this.content}"${this.punctuation ? ` + "${this.punctuation}"` : ''}${this.lineBreaks ? ` + linebreaks` : ''} | started by: ${this.startedBy})`;
  }
}

/**
 * A '/' between two ASCII digits (23/30, 3/4) is part of the number, not a separator.
 * @param {string[]} chars
 * @param {number} i
 */
function isDigitSlash(chars, i) {
  return chars[i] === '/' && /[0-9]/.test(chars[i - 1] ?? '') && /[0-9]/.test(chars[i + 1] ?? '');
}

/**
 * The UTF-16 [start, end) spans where any of `keys` occurs in `text`, for `chunkText`'s
 * `keepTogether`. Overlapping occurrences are all returned; the chunker reads them as a union.
 * @param {string} text
 * @param {ReadonlyArray<string>} keys
 * @returns {{start: number, end: number}[]}
 */
export function findKeyOccurrences(text, keys) {
  const spans = [];
  for (const key of keys) {
    if (!key) continue;
    for (let at = text.indexOf(key); at !== -1; at = text.indexOf(key, at + 1)) {
      spans.push({ start: at, end: at + key.length });
    }
  }
  return spans;
}

/** Every Unicode punctuation category (Pc Pd Pe Pf Pi Po Ps) separates chunks; chunker-parity.json pins Pd and Pc. */
const PUNCTUATION = /^\p{P}$/u;

export class TextChunker {
  /**
   * Test if a character is treated as a punctuation separator
   * @param {string} char - Character to test
   * @returns {boolean} True if character is a separator
   */
  isPunctuationSeparator(char) {
    return PUNCTUATION.test(char);
  }

  /**
   * Split text into chunks by punctuation boundaries, preserving line breaks and tracking what starts each chunk
   *
   * Pure JavaScript. A WASM twin (`WasmTextChunker` / `text_chunker.rs`) was deleted 2026-10-06
   * (ADR-079): it measured no faster (0.94-0.98x of this code's time on real chapters).
   * Used by: Full Translation mode for chunking large texts.
   *
   * CHUNKING BEHAVIOR:
   *   - startIndex of a chunk with empty content (punctuation or line break only) is
   *     unspecified; nothing reads it (see GLOSSARY.md, TextChunker).
   *
   * KEEP-TOGETHER SPANS:
   *   - A punctuation char inside one of `keepTogether`'s UTF-16 [start, end) spans is content,
   *     not a separator: the engine passes the occurrences of dictionary keys with punctuation
   *     in them (`乔斯-韦登`), which a chunk boundary would cut in two.
   *
   * @param {string} text - Input text to chunk
   * @param {ReadonlyArray<{start: number, end: number}>} [keepTogether] - Spans not to split
   * @returns {TextChunk[]} Array of text chunks with startedBy context
   */
  chunkText(text, keepTogether = []) {
    if (!text || text.trim() === '') {
      return [];
    }

    /** @type {TextChunk[]} */
    const chunks = [];
    const chars = Array.from(text);
    let currentContent = '';
    let currentPunctuation = '';
    let currentLineBreaks = '';
    let chunkStartIndex = 0;
    let previousPunctuation = 'start';

    const flushChunk = () => {
      if (currentContent.trim() || currentPunctuation || currentLineBreaks) {
        let startedBy = previousPunctuation;
        // Only treat as linebreak if there's no meaningful punctuation before it
        if (
          currentLineBreaks &&
          chunks.length > 0 &&
          (!previousPunctuation || previousPunctuation === 'start')
        ) {
          startedBy = 'linebreak';
        }

        chunks.push(
          new TextChunk(
            currentContent,
            currentPunctuation,
            chunkStartIndex,
            currentLineBreaks,
            startedBy
          )
        );

        // Update previous punctuation for next chunk
        if (currentLineBreaks) {
          previousPunctuation = 'linebreak';
        } else {
          previousPunctuation = currentPunctuation || '';
        }
      }

      // Reset for next chunk
      currentContent = '';
      currentPunctuation = '';
      currentLineBreaks = '';
      chunkStartIndex = -1;
    };

    // UTF-16 offset of `char` in `text` (matches Rust's chunker and `String.slice`): an
    // astral character is one element of `chars` but two code units.
    let utf16Index = 0;
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const charStart = utf16Index;
      utf16Index += char.length;

      if (char === '\r' || char === '\n') {
        // Handle line breaks
        currentLineBreaks += char;
      } else if (
        !isDigitSlash(chars, i) &&
        !keepTogether.some(({ start, end }) => charStart >= start && charStart < end) &&
        this.isPunctuationSeparator(char)
      ) {
        // Handle punctuation using Unicode detection
        // If we have line breaks accumulated, this punctuation should start a new chunk
        if (currentLineBreaks) {
          flushChunk();
          chunkStartIndex = -1;
        }
        currentPunctuation += char;
      } else {
        // Handle content characters
        if (chunkStartIndex === -1) {
          chunkStartIndex = charStart;
        }

        // If we have accumulated punctuation or line breaks, flush previous chunk
        if (currentPunctuation || currentLineBreaks) {
          flushChunk();
          chunkStartIndex = charStart;
        }

        currentContent += char;
      }
    }

    // Flush final chunk
    flushChunk();

    return chunks;
  }

  /**
   * Filter chunks that need translation
   * @param {TextChunk[]} chunks - Array of chunks
   * @returns {TextChunk[]} Chunks that contain Chinese text
   */
  getTranslatableChunks(chunks) {
    return chunks.filter((chunk) => chunk.content.trim() && containsHan(chunk.content));
  }
}
