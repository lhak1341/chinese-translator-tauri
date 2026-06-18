/**
 * @import {
 *   TextChunk as ITextChunk,
 *   TextReconstructionResult
 * } from '../types/BatchProcessingTypes'
 */

import { PunctuationProcessor } from './PunctuationProcessor.js';
import { QuoteProcessor, QUOTE_TYPES } from './QuoteProcessor';

/**
 * Post-processing operations on TextChunk[] arrays after chunking and translation phases.
 *
 * Owns punctuation translation and text reconstruction. Separated from TextChunker so that
 * Phase 5 post-processing bugs have a single locality and methods are testable with a
 * TextChunk[] fixture without constructing a full TextChunker.
 *
 * JS/WASM divergence: fixAngleQuotePositioning handles only the JS chunker's empty-chunk
 * representation of 《 (creates a separate empty chunk with punctuation="«"). WASM accumulates
 * 《 directly into the preceding chunk's punctuation field — applySmartCapitalization in
 * TranslationEngine handles that path via the multi-char includes("：") check.
 */
export class ChunkPostProcessor {
  constructor() {
    this.punctuationProcessor = new PunctuationProcessor();
  }

  /**
   * Reconstruct text from translated chunks and build segment positions simultaneously
   *
   * EXECUTION PATH:
   *   - Used by: Full Translation mode (right panel with clickable highlighting)
   *   - Called from: TranslationEngine.translateSinglePass() after all 5 phases
   *   - Purpose: Build both final text AND semantic arrays for clickable word highlighting
   *
   * NOT USED BY:
   *   - Character-only mode uses reconstructText() instead (simpler, no segments)
   *
   * PERFORMANCE:
   *   - Slower than reconstructText() due to semantic array building
   *   - Builds position tracking for every chunk, punctuation, and line break
   *
   * @param {TextChunk[]} chunks - Array of translated chunks
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
   * Reconstruct text from translated chunks (WITHOUT building segment positions)
   *
   * EXECUTION PATH:
   *   - Used by: Character-only translation mode (bottom-left panel)
   *   - Called from: SegmentPrecomputer.js for simple text reconstruction
   *   - Purpose: Fast text assembly without position tracking overhead
   *
   * NOT USED BY:
   *   - Full Translation mode uses reconstructTextWithSegments() instead
   *
   * PERFORMANCE:
   *   - Faster than reconstructTextWithSegments() (no segment building)
   *   - Simple string concatenation with punctuation spacing
   *
   * @param {TextChunk[]} chunks - Array of translated chunks
   * @returns {string} Reconstructed text
   */
  reconstructText(chunks) {
    const result = chunks
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

    return result;
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
   * Fix angle quote positioning: move opening angle quotes from end of one chunk to start of next.
   *
   * Handles 《 and curly opening quotes only. Does NOT handle 「 (U+300C) —
   * QuoteProcessor.isOpeningQuote('「') returns false; the fallback in applySmartCapitalization
   * (checking chunks[i-1].content.trim() === "") covers that case instead.
   *
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

        // Update startedBy for capitalization.
        // The colon context lives in chunk.startedBy (the quote-only chunk), not nextChunk.startedBy.
        // e.g. for 道：「说 — quote-only chunk has startedBy='：', nextChunk has startedBy='«' (quote).
        const prevStartedBy = chunk.startedBy || '';
        const colonInPrev = /[:：]/.exec(prevStartedBy);
        nextChunk.startedBy = colonInPrev ? colonInPrev[0] + openingQuote : openingQuote;
      }
    }
  }
}
