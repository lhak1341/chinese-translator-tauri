/**
 * Text Chunker for punctuation-based text segmentation
 * Splits text into chunks by punctuation boundaries to prevent cross-punctuation matching
 * and enable parallel processing
 */

import { UnicodePunctuationDetector } from './UnicodePunctuationDetector.js';

class TextChunk {
  constructor(content, punctuation = '', startIndex = 0, lineBreaks = '', startedBy = 'start') {
    this.content = content.trim(); // The actual text content
    this.punctuation = punctuation; // The punctuation that follows this chunk (will be translated later)
    this.lineBreaks = lineBreaks; // Line breaks that follow this chunk
    this.startIndex = startIndex; // Original position in the text
    this.endIndex = startIndex + content.length; // End position (before punctuation)
    this.startedBy = startedBy; // What precedes this chunk (for capitalization rules)
    this.translated = null; // Will hold the translated result
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

export class TextChunker {
  constructor(punctuationConfig = {}) {
    // Initialize Unicode-based punctuation detection system
    this.unicodePunctuationDetector = new UnicodePunctuationDetector(punctuationConfig);
  }

  /**
   * Test if a character is treated as a punctuation separator
   * @param {string} char - Character to test
   * @returns {boolean} True if character is a separator
   */
  isPunctuationSeparator(char) {
    return this.unicodePunctuationDetector.isPunctuationSeparator(char);
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
   *     unspecified; nothing reads it (see CONTEXT.md, TextChunker).
   *
   * @param {string} text - Input text to chunk
   * @returns {TextChunk[]} Array of text chunks with startedBy context
   */
  chunkText(text) {
    if (!text || text.trim() === '') {
      return [];
    }

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
      } else if (!isDigitSlash(chars, i) && this.isPunctuationSeparator(char)) {
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
   * Analyze chunk composition for optimization
   * @param {TextChunk[]} chunks - Array of chunks
   * @returns {Object} Analysis results
   */
  analyzeChunks(chunks) {
    const analysis = {
      totalChunks: chunks.length,
      averageLength: 0,
      maxLength: 0,
      minLength: Infinity,
      chineseChunks: 0,
      emptyChunks: 0,
      parallelizable: chunks.length > 1,
    };

    let totalLength = 0;
    const chineseRegex = /[\u4e00-\u9fff]/;

    for (const chunk of chunks) {
      const length = chunk.content.length;
      totalLength += length;

      if (length === 0) {
        analysis.emptyChunks++;
      } else {
        analysis.maxLength = Math.max(analysis.maxLength, length);
        analysis.minLength = Math.min(analysis.minLength, length);

        if (chineseRegex.test(chunk.content)) {
          analysis.chineseChunks++;
        }
      }
    }

    analysis.averageLength = chunks.length > 0 ? totalLength / chunks.length : 0;
    analysis.minLength = analysis.minLength === Infinity ? 0 : analysis.minLength;

    return analysis;
  }

  /**
   * Filter chunks that need translation
   * @param {TextChunk[]} chunks - Array of chunks
   * @returns {TextChunk[]} Chunks that contain Chinese text
   */
  getTranslatableChunks(chunks) {
    const chineseRegex = /[\u4e00-\u9fff]/;
    return chunks.filter((chunk) => chunk.content.trim() && chineseRegex.test(chunk.content));
  }
}
