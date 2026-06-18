/**
 * Text Chunker for punctuation-based text segmentation
 * Splits text into chunks by punctuation boundaries to prevent cross-punctuation matching
 * and enable parallel processing
 *
 * @import {
 *   TextChunk as ITextChunk,
 *   TextChunker as ITextChunker,
 *   PunctuationConfig,
 *   SeparatedPunctuation,
 *   ChunkerDiagnosticInfo,
 *   ReconstructionSegment,
 *   TextReconstructionResult
 * } from '../types/BatchProcessingTypes'
 */

import { QUOTE_CATEGORIES } from './QuoteProcessor';
import { UnicodePunctuationDetector } from './UnicodePunctuationDetector.js';
import { logger } from '../logger.js';
import { wasmTextChunker } from '../wasm/WasmTextChunker.js';

export class TextChunk {
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

export class TextChunker {
  constructor(punctuationConfig = {}) {
    // Initialize Unicode-based punctuation detection system
    this.unicodePunctuationDetector = new UnicodePunctuationDetector(punctuationConfig);

    // Legacy punctuation marks for fallback compatibility
    // These are used when Unicode property escapes are not supported
    this.legacyChunkSeparators = [
      ',',
      '.',
      '!',
      '?',
      ';',
      ':',
      '，',
      '。',
      '．',
      '！',
      '？',
      '；',
      '：',
      '(',
      ')',
      '（',
      '）',
      '[',
      ']',
      '{',
      '}',
      '《',
      '》',
      '【',
      '】',
      '"',
      '\u201c',
      '\u201d',
      '\u2018',
      '\u2019',
      "'",
      '、',
      '…',
      '——',
      '－',
    ];

    // Build regex patterns based on Unicode support
    this.buildChunkingRegex();

  }

  /**
   * Build chunking regex patterns based on Unicode punctuation detection capabilities
   */
  buildChunkingRegex() {
    if (this.unicodePunctuationDetector.supportsUnicodeProperties) {
      // Use Unicode property-based regex for comprehensive punctuation detection
      const enabledCategories = Object.keys(
        this.unicodePunctuationDetector.config.enabledCategories
      ).filter((cat) => this.unicodePunctuationDetector.config.enabledCategories[cat]);

      if (enabledCategories.length > 0) {
        const categoryPattern = enabledCategories.map((cat) => `\\p{${cat}}`).join('|');
        // Match content + punctuation, capturing both parts
        this.chunkRegex = new RegExp(`([^\\p{P}]*?)([${categoryPattern}]*)`, 'gu');

        if (process.env.NODE_ENV === 'development') {
          logger.log(
            `🔧 TextChunker: Using Unicode punctuation categories: ${enabledCategories.join(', ')}`
          );
        }
        return;
      }
    }

    // Fallback to legacy separator list
    const escapedSeparators = this.legacyChunkSeparators.map((sep) =>
      sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );

    // Match content + punctuation, capturing both parts
    this.chunkRegex = new RegExp(
      `([^${escapedSeparators.join('')}]+)([${escapedSeparators.join('')}]*)`,
      'g'
    );

    if (process.env.NODE_ENV === 'development') {
      logger.log(
        `🔧 TextChunker: Using legacy punctuation separators (${this.legacyChunkSeparators.length} characters)`
      );
    }
  }

  /**
   * Update punctuation detection configuration and rebuild regex
   * @param {Object} newConfig - New punctuation configuration
   */
  updatePunctuationConfig(newConfig) {
    this.unicodePunctuationDetector.updateConfig(newConfig);
    this.buildChunkingRegex();
  }

  /**
   * Get current punctuation detection configuration
   * @returns {Object} Current punctuation configuration
   */
  getPunctuationConfig() {
    return this.unicodePunctuationDetector.getConfig();
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
   * Get diagnostic information about punctuation detection capabilities
   * @returns {Object} Diagnostic information
   */
  getDiagnosticInfo() {
    return {
      supportsUnicodeProperties: this.unicodePunctuationDetector.supportsUnicodeProperties,
      enabledCategories: this.unicodePunctuationDetector.config.enabledCategories,
      customSeparatorCount: this.unicodePunctuationDetector.config.customSeparators.length,
      excludedCharacters: Array.from(this.unicodePunctuationDetector.config.excludedCharacters),
      includedCharacters: Array.from(this.unicodePunctuationDetector.config.includedCharacters),
    };
  }

  /**
   * Check if punctuation contains opening punctuation that should precede content
   * @param {string} punctuation - Punctuation string to check
   * @returns {boolean} True if contains opening punctuation
   */
  hasOpeningPunctuation(punctuation) {
    if (!punctuation) return false;
    const openingChars = ['《', '【', '(', '（', '[', '{', ...QUOTE_CATEGORIES.OPENING];
    return Array.from(punctuation).some((char) => openingChars.includes(char));
  }

  /**
   * Extract opening punctuation from a punctuation string
   * @param {string} punctuation - Full punctuation string
   * @returns {{opening: string, remaining: string}} Separated punctuation
   */
  separateOpeningPunctuation(punctuation) {
    if (!punctuation) return { opening: '', remaining: '' };

    const openingChars = ['《', '【', '(', '（', '[', '{', ...QUOTE_CATEGORIES.OPENING];
    let opening = '';
    let remaining = '';

    for (const char of punctuation) {
      if (openingChars.includes(char)) {
        opening += char;
      } else {
        remaining += char;
      }
    }

    return { opening, remaining };
  }

  /**
   * Split text into chunks by punctuation boundaries, preserving line breaks and tracking what starts each chunk
   *
   * EXECUTION PATH (WASM vs JavaScript):
   *   - Primary: WASM TextChunker (Rust implementation, 2-3x faster)
   *   - Fallback: JavaScript implementation (when WASM not loaded yet)
   *   - Used by: Full Translation mode for chunking large texts
   *
   * WASM ACCELERATION:
   *   - Lazy initialization: WASM loads on first use
   *   - Graceful degradation: Falls back to JS if WASM fails
   *   - Performance: 2-3x speedup for large texts (>1000 chars)
   *
   * CHUNKING BEHAVIOR:
   *   - WASM: More aggressive chunking (splits at / for example)
   *   - JavaScript: Less aggressive (preserves / in same chunk)
   *   - Result: WASM may produce more chunks than JavaScript
   *
   * @param {string} text - Input text to chunk
   * @returns {TextChunk[]} Array of text chunks with startedBy context
   */
  chunkText(text) {
    if (!text || text.trim() === '') {
      return [];
    }

    // OPTIMIZATION: Try WASM chunker first for 2-3x speedup
    // LAZY INITIALIZATION: WASM loads on first use, falls back to JS if not ready
    try {
      const wasmChunks = wasmTextChunker.chunkText(text);

      if (wasmChunks && Array.isArray(wasmChunks)) {
        // Convert WASM chunk results to TextChunk objects
        return wasmChunks.map(
          (chunk) =>
            new TextChunk(
              chunk.content,
              chunk.punctuation,
              chunk.startIndex,
              chunk.lineBreaks,
              chunk.startedBy
            )
        );
      }
      // If wasmChunks is null, fall through to JavaScript implementation
    } catch (wasmError) {
      // Graceful fallback to JavaScript implementation
      logger.debug('WASM TextChunker failed, using JavaScript fallback:', wasmError);
    }

    // JavaScript implementation (fallback)
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

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];

      if (char === '\r' || char === '\n') {
        // Handle line breaks
        currentLineBreaks += char;
      } else if (this.isPunctuationSeparator(char)) {
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
          chunkStartIndex = i;
        }

        // If we have accumulated punctuation or line breaks, flush previous chunk
        if (currentPunctuation || currentLineBreaks) {
          flushChunk();
          chunkStartIndex = i;
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

// Utility function
export const createChunker = () => new TextChunker();

