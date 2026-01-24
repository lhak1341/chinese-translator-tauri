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

import { PunctuationProcessor } from './PunctuationProcessor.js';
import { QuoteProcessor, QUOTE_CATEGORIES, QUOTE_TYPES } from './QuoteProcessor';
import { UnicodePunctuationDetector } from './UnicodePunctuationDetector.js';
import { logger } from './logger.js';

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

    // Initialize unified punctuation processor
    this.punctuationProcessor = new PunctuationProcessor();
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
   * Reconstruct text from translated chunks and build segment positions simultaneously
   * @param {TextChunker[]} chunks - Array of translated chunks
   * @param {Object} semanticArrays - Optional semantic arrays for segment tracking
   * @returns {Object} {text: string, segments: Array} - Reconstructed text and segment positions
   */
  reconstructTextWithSegments(chunks, semanticArrays = null) {
    const segments = [];
    let currentPosition = 0;

    const textParts = chunks.map((chunk, index) => {
      // CRITICAL BUG FIX: Normalize content to NFC for consistent Vietnamese diacritic handling
      // Ensures .length calculations match normalized output text (prevents "màu" → "mà" + "u" split)
      const rawContent = chunk.translated || chunk.translatedContent || chunk.content;
      const content = rawContent ? rawContent.normalize('NFC') : rawContent;
      const punctuation = chunk.translatedPunctuation || chunk.punctuation;
      const lineBreaks = chunk.lineBreaks || '';

      // Handle spacing using unified punctuation processor
      let prefixSpacing = '';
      let processedPunctuation = '';

      // Check if this chunk has opening punctuation that should appear before content
      let openingPunctuation = chunk.openingPunctuation || '';
      // Add space before opening punctuation if there's previous content and no existing space
      if (openingPunctuation && content && index > 0 && !openingPunctuation.startsWith(' ')) {
        openingPunctuation = ' ' + openingPunctuation;
      }
      let remainingPunctuation = punctuation;

      // Process remaining punctuation using unified processor
      if (remainingPunctuation) {
        // Only add space after punctuation if there's a next chunk with content
        const hasNextChunk =
          index < chunks.length - 1 && !lineBreaks && !!chunks[index + 1]?.content?.trim();
        processedPunctuation = this.punctuationProcessor.processSequence(
          remainingPunctuation,
          hasNextChunk
        );

        // Add space before opening punctuation when there's content before it
        // BUT NOT when the punctuation sequence starts with sentence punctuation (like :, ,, ., etc.)
        // BUT NOT when the punctuation sequence starts with closing elements (like ], ), }, etc.)
        // BUT DO add space for opening quotes (they need space before them)
        const startsWithSentencePunct = /^[.,!?:;，。！？：；、]/.test(remainingPunctuation);
        const startsWithClosingElement = /^[\])}】》）]/.test(remainingPunctuation);

        if (
          content &&
          this.punctuationProcessor.hasOpeningElements(remainingPunctuation) &&
          !processedPunctuation.startsWith(' ') &&
          !startsWithSentencePunct &&
          !startsWithClosingElement
        ) {
          // Add space for opening elements including opening quotes
          processedPunctuation = ' ' + processedPunctuation;
        }
      }

      const fullChunkText =
        prefixSpacing + openingPunctuation + content + processedPunctuation + lineBreaks;

      // Build segments if semantic arrays are provided
      if (segments !== null) {
        // Add opening punctuation segment if it exists
        if (openingPunctuation) {
          segments.push({
            type: 'punctuation',
            start: currentPosition,
            end: currentPosition + openingPunctuation.length,
            text: openingPunctuation,
            isClickable: false,
            chunkIndex: index,
          });
          currentPosition += openingPunctuation.length;
        }

        // Add content segment
        if (content) {
          if (chunk.semanticIndex !== undefined && semanticArrays) {
            // Semantic (translated) content
            segments.push({
              type: 'semantic',
              unitIndex: chunk.semanticIndex,
              start: currentPosition,
              end: currentPosition + content.length,
              originalText: semanticArrays.original[chunk.semanticIndex],
              translatedText: content,
              source: semanticArrays.metadata[chunk.semanticIndex]?.source || 'unknown',
              metadata: semanticArrays.metadata[chunk.semanticIndex],
              isClickable: true,
              chunkIndex: index,
            });
          } else {
            // Untranslated content (Latin/numbers)
            segments.push({
              type: 'untranslated',
              start: currentPosition,
              end: currentPosition + content.length,
              text: content,
              isClickable: false,
              chunkIndex: index,
            });
          }
          currentPosition += content.length;
        }

        // Add punctuation segment
        if (processedPunctuation) {
          segments.push({
            type: 'punctuation',
            start: currentPosition,
            end: currentPosition + processedPunctuation.length,
            text: processedPunctuation,
            isClickable: false,
            chunkIndex: index,
          });
          currentPosition += processedPunctuation.length;
        }

        // Add line breaks segment
        if (lineBreaks) {
          segments.push({
            type: 'linebreak',
            start: currentPosition,
            end: currentPosition + lineBreaks.length,
            text: lineBreaks,
            isClickable: false,
            chunkIndex: index,
          });
          currentPosition += lineBreaks.length;
        }
      } else {
        currentPosition += fullChunkText.length;
      }

      return fullChunkText;
    });

    const text = textParts.join('');

    return { text, segments };
  }

  /**
   * Reconstruct text from translated chunks with translated punctuation and preserved line breaks
   * @param {TextChunk[]} chunks - Array of translated chunks
   * @returns {string} Reconstructed text
   */
  reconstructText(chunks) {
    return chunks
      .map((chunk, index) => {
        const content = chunk.translated || chunk.translatedContent || chunk.content;
        const punctuation = chunk.translatedPunctuation || chunk.punctuation;
        const lineBreaks = chunk.lineBreaks || '';

        // Handle spacing using unified punctuation processor
        let prefixSpacing = '';
        let processedPunctuation = '';

        // Check if this chunk has opening punctuation that should appear before content
        let openingPunctuation = chunk.openingPunctuation || '';
        // Add space before opening punctuation if there's previous content and no existing space
        if (openingPunctuation && content && index > 0 && !openingPunctuation.startsWith(' ')) {
          openingPunctuation = ' ' + openingPunctuation;
        }
        let remainingPunctuation = punctuation;

        // Note: Ellipsis spacing is now handled by PunctuationProcessor

        // Process remaining punctuation using unified processor
        if (remainingPunctuation) {
          // Only add space after punctuation if there's a next chunk with content
          // This prevents empty chunks from adding unwanted spaces
          const hasNextChunk =
            index < chunks.length - 1 && !lineBreaks && !!chunks[index + 1]?.content?.trim();
          processedPunctuation = this.punctuationProcessor.processSequence(
            remainingPunctuation,
            hasNextChunk
          );

          // Add space before opening punctuation when there's content before it
          // BUT NOT when the punctuation sequence starts with sentence punctuation (like :, ,, ., etc.)
          // BUT NOT when the punctuation sequence starts with closing elements (like ], ), }, etc.)
          // BUT DO add space for opening quotes (they need space before them)
          const startsWithSentencePunct = /^[.,!?:;，。！？：；、]/.test(remainingPunctuation);
          const startsWithClosingElement = /^[\])}】》）]/.test(remainingPunctuation);
          const _containsOnlyOpeningQuotes =
            remainingPunctuation.length > 0 &&
            Array.from(remainingPunctuation).every((char) => QuoteProcessor.isOpeningQuote(char));

          if (
            content &&
            this.punctuationProcessor.hasOpeningElements(remainingPunctuation) &&
            !processedPunctuation.startsWith(' ') &&
            !startsWithSentencePunct &&
            !startsWithClosingElement
          ) {
            // Add space for opening elements including opening quotes
            processedPunctuation = ' ' + processedPunctuation;
          }
        }

        return prefixSpacing + openingPunctuation + content + processedPunctuation + lineBreaks;
      })
      .join('');
  }

  /**
   * Translate punctuation for all chunks using punctuation dictionary
   * @param {TextChunk[]} chunks - Array of chunks
   * @param {Object} punctuationDict - Punctuation translation dictionary
   */
  translatePunctuation(chunks, punctuationDict) {
    // Translate punctuation normally
    this.translatePunctuationNormally(chunks, punctuationDict);

    // Fix the specific angle quote positioning issue
    this.fixAngleQuotePositioning(chunks);
  }

  /**
   * Normal punctuation translation (original logic)
   * @param {TextChunk[]} chunks - Array of chunks
   * @param {Object} punctuationDict - Punctuation translation dictionary
   */
  translatePunctuationNormally(chunks, punctuationDict) {
    for (const chunk of chunks) {
      if (chunk.punctuation) {
        // If translatedPunctuation already exists (with spacing), preserve the spacing
        if (chunk.translatedPunctuation && chunk.translatedPunctuation !== 'null') {
          // Apply character translation while preserving spacing
          let result = chunk.translatedPunctuation;
          for (const [originalChar, translatedChar] of Object.entries(punctuationDict)) {
            result = result.replace(
              new RegExp(originalChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              translatedChar
            );
          }
          chunk.translatedPunctuation = result;
        } else {
          // Translate each punctuation character normally
          let translatedPunctuation = '';
          for (const char of chunk.punctuation) {
            translatedPunctuation += punctuationDict[char] || char;
          }
          chunk.translatedPunctuation = translatedPunctuation;
        }

        // SIMPLE FIX: Add space after comma if there's a next chunk with content
        // BUT NOT if the next chunk starts with a quote
        if (chunk.translatedPunctuation && chunk.translatedPunctuation.includes(',')) {
          const chunkIndex = chunks.indexOf(chunk);
          const nextChunk = chunkIndex < chunks.length - 1 ? chunks[chunkIndex + 1] : null;
          const hasNextChunk = nextChunk?.content?.trim();

          // Check if comma is followed by a quote (either in same chunk or next chunk)
          const nextChunkFirstChar = nextChunk?.content?.trim().charAt(0);
          const nextChunkStartsWithQuote =
            nextChunkFirstChar && QuoteProcessor.isQuote(nextChunkFirstChar);

          // Check if current punctuation ends with a quote (comma+quote in same chunk)
          const currentPunctLastChar = chunk.translatedPunctuation.slice(-1);
          const currentPunctEndsWithQuote = QuoteProcessor.isQuote(currentPunctLastChar);

          // Check if next chunk's punctuation contains a closing quote
          const nextChunkPunctuation = nextChunk?.punctuation || '';
          const nextChunkHasClosingQuote = Array.from(nextChunkPunctuation).some((char) =>
            QuoteProcessor.isClosingQuote(char)
          );

          // Don't add space if comma is followed by quote (any type, any location)
          const commaFollowedByQuote =
            currentPunctEndsWithQuote || nextChunkStartsWithQuote || nextChunkHasClosingQuote;

          // Special handling for comma-bracket sequences: ensure proper spacing
          const commaPattern = /,\s*[[({（【《]/;
          if (commaPattern.test(chunk.translatedPunctuation)) {
            // Replace comma+bracket patterns with comma+space+bracket
            chunk.translatedPunctuation = chunk.translatedPunctuation.replace(
              /,\s*([[({（【《])/g,
              ', $1'
            );
          } else if (
            hasNextChunk &&
            !chunk.translatedPunctuation.endsWith(' ') &&
            !commaFollowedByQuote
          ) {
            chunk.translatedPunctuation += ' ';
          }
        }
      }

      // Also translate punctuation characters that might be mixed in the content
      if (chunk.content) {
        let translatedContent = '';
        for (const char of chunk.content) {
          translatedContent += punctuationDict[char] || char;
        }
        chunk.translatedContent = translatedContent;
      }
    }
  }

  /**
   * Fix angle quote positioning issue: move opening angle quotes from end of one chunk to start of next
   * @param {TextChunk[]} chunks - Array of chunks after normal translation
   */
  fixAngleQuotePositioning(chunks) {
    // Simple targeted fix: if a chunk has only opening curly quote (from 《), move it to next chunk
    for (let i = 0; i < chunks.length - 1; i++) {
      const chunk = chunks[i];
      const nextChunk = chunks[i + 1];

      // Check if chunk has opening quote (angle or curly) that should be moved to next chunk
      // BUT ONLY if the current chunk has no content (quote-only chunk)
      const isOpeningQuote =
        chunk.punctuation === '《' || QuoteProcessor.isOpeningQuote(chunk.punctuation);
      if (isOpeningQuote && nextChunk.content.trim() && !chunk.content.trim()) {
        // Determine appropriate opening quote before clearing
        let openingQuote;
        if (chunk.punctuation === '《') {
          // Angle quote becomes curly quote
          openingQuote = QUOTE_TYPES.CURLY_OPEN_DOUBLE;
        } else {
          // Keep the original opening quote (already curly)
          openingQuote = chunk.punctuation;
        }

        // Clear both original and translated punctuation from this chunk
        chunk.punctuation = '';
        chunk.translatedPunctuation = '';

        // Add opening quote to next chunk - store separately to place before content
        nextChunk.openingPunctuation = openingQuote;

        // Update startedBy for capitalization
        nextChunk.startedBy = openingQuote;
      }
    }
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

  /**
   * Test the chunking system with example text
   * @param {string} text - Test text
   * @returns {Object} Test results
   */
  testChunking(text) {
    const chunks = this.chunkText(text);
    const analysis = this.analyzeChunks(chunks);
    const reconstructed = this.reconstructText(chunks);

    if (process.env.NODE_ENV === 'development') {
      logger.log('📝 Testing chunking system with:', text);
      logger.log('📊 Chunks created:', chunks.length);

      chunks.forEach((chunk, index) => {
        logger.log(
          `  ${index + 1}. "${chunk.content}"${chunk.punctuation ? ` + "${chunk.punctuation}"` : ''}`
        );
      });

      logger.log('📈 Analysis:', analysis);
      logger.log('🔄 Reconstructed:', reconstructed);
      logger.log('✅ Match original:', reconstructed === text);
    }

    return {
      chunks,
      analysis,
      reconstructed,
      isValid: reconstructed === text,
    };
  }
}

// Utility function
export const createChunker = () => new TextChunker();

// Export for testing
export const testChunker = () => {
  if (process.env.NODE_ENV === 'development') {
    const chunker = new TextChunker();

    // Test with your example
    logger.log('🧪 Testing with example: ABC,DE.FG"HIJ"KL!MNOP.');
    chunker.testChunking('ABC,DE.FG"HIJ"KL!MNOP.');

    // Test with Chinese text
    logger.log('\n🧪 Testing with Chinese text:');
    chunker.testChunking('她的目光忽然落在陈暮的脸上，当看到陈暮闭上的双眼时，她的眼睛腾地红了。');

    // Test with mixed punctuation
    logger.log('\n🧪 Testing with mixed punctuation:');
    chunker.testChunking('Hello, 世界！How are you? 你好吗？');
  }
};
