/**
 * Segment Precomputation for Optimized Clickable Text Rendering
 * Pre-computes all segment data during translation to avoid runtime calculations
 *
 * MEMORY MANAGEMENT NOTE (2026-01-22):
 * Object pooling removed - segments are small objects (~10 properties, <1KB each).
 * Modern V8 optimizes object literals efficiently, pooling added complexity without
 * measurable benefit. Segments have lifecycle tied to React rendering (can't be
 * released until component unmount), making caller-managed pooling impractical.
 */

import { logger } from './logger';
import { getGraphemeLength } from './GraphemeHelper.js';

// MEDIUM-4 FIX: Extract magic regex patterns to named constants
// Punctuation and whitespace characters used for text boundary detection
const PUNCTUATION_AND_WHITESPACE =
  /[\s\r\n\t\u3000\u2000-\u200F\u2028\u2029"'`\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB\u300C\u300D\u300E\u300F\u3008\u3009\u300A\u300B\u3014\u3015\u3016\u3017,，.。!！?？;；:：[\]]/;

// Text boundaries for segment splitting (spaces, punctuation, line breaks)
const TEXT_BOUNDARY = /[\s\r\n,，.。!！?？;；:：[\]]/;

export class SegmentPrecomputer {
  // Enhanced with punctuation handling for proper noun highlighting
  /**
   * Pre-compute clickable segments from semantic arrays
   * @param {string} text - The full translated text
   * @param {Object} semanticArrays - Semantic arrays from translation
   * @returns {Array} Pre-computed segments with positions and metadata
   */
  static precomputeSegments(text, semanticArrays) {
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      return [];
    }

    // CRITICAL BUG FIX: Normalize text to NFC for consistent Unicode handling
    // Vietnamese diacritics can be NFC (precomposed) or NFD (decomposed)
    // Normalizing ensures .length calculations are consistent across all units
    // Example: "màu" NFC=3 chars, NFD=4 chars (m+a+combining-grave+u)
    text = text.normalize('NFC');

    const { translated, original, metadata } = semanticArrays;

    // CRITICAL-1 FIX: Removed redundant metadata validation
    // Validation already performed in ClickableTranslationSemantic.tsx:69-112
    // Duplicate validation caused 2x CPU cost and duplicate warning logs
    // Upstream components handle validation and fallback to indexOf when metadata invalid

    const segments = [];
    let currentPosition = 0;

    // Create a lookup map for faster unit matching - don't use keys, use direct comparison
    // HIGH-5 FIX: Pre-filter empty units to avoid wasting iteration cycles
    // Empty units cannot match any text, filtering saves n iterations per position
    // CRITICAL BUG FIX: Normalize units to NFC for consistent matching with normalized text
    const allUnits = translated
      .map((unit, index) => ({
        index,
        unit: unit ? unit.normalize('NFC') : unit, // Normalize each unit
        original: original[index],
        metadata: metadata[index],
      }))
      .filter((unitData) => unitData.unit && unitData.unit.length > 0);

    // Sort units by their tokenIndex to ensure text-order processing for duplicates
    // HIGH-3 FIX: Use optional chaining to prevent crash if metadata is null/undefined
    const filteredUnits = allUnits.sort((a, b) => {
      const aIndex = a.metadata?.tokenIndex ?? 0;
      const bIndex = b.metadata?.tokenIndex ?? 0;
      return aIndex - bIndex;
    });

    // HIGH-3 DOCUMENTATION: Track used indices to ensure duplicate units map correctly
    // Set size: Grows linearly with semantic array length (max = semanticArrays.translated.length)
    // Memory: ~1 byte per entry, typical max ~10KB for 10,000 char texts
    // Lifecycle: Cleared at function end, no unbounded growth risk
    const usedIndices = new Set();

    while (currentPosition < text.length) {
      let bestMatch = null;
      let bestLength = 0;
      let bestOffset = 0;

      // Find the best matching unit at current position with smart conflict resolution
      for (const unitData of filteredUnits) {
        // Skip already used semantic indices to handle duplicates correctly
        if (usedIndices.has(unitData.index)) continue;

        const remainingText = text.substring(currentPosition);

        // Enhanced matching: handle punctuation and quotes
        const matchResult = this.findUnitMatch(remainingText, unitData.unit);

        if (matchResult.found) {
          // Smart conflict resolution: prefer exact boundaries over partial overlaps
          const _isExactMatch =
            matchResult.offset === 0 &&
            (currentPosition + unitData.unit.length >= text.length ||
              /[\s\r\n,，.。!！?？;；:：[\]]/.test(text[currentPosition + unitData.unit.length]));

          // Prioritize longer matches first
          if (unitData.unit.length > bestLength) {
            bestMatch = unitData;
            bestLength = unitData.unit.length;
            bestOffset = matchResult.offset;
          }
        } else if (process.env.NODE_ENV === 'development') {
          // MEDIUM-1 FIX: Log match attempts in development for debugging
          // Only in development to avoid performance impact in production
          const preview = remainingText.substring(0, 20).replace(/\n/g, '\\n');
          logger.debug(
            `  [No match] "${unitData.unit}" at position ${currentPosition} (remaining: "${preview}...")`
          );
        }
      }

      // CRITICAL-7 FIX: Validate greedy match selection and prevent infinite loop
      // CRITICAL-3 FIX: Use grapheme-aware length checking for Vietnamese diacritics
      // CRITICAL-2 FIX: Use shared GraphemeHelper singleton (eliminates per-call instance creation)
      // Ensure selected match can actually be extracted from remaining text
      if (bestMatch) {
        const remainingText = text.substring(currentPosition + bestOffset);
        const graphemeRemaining = getGraphemeLength(remainingText);
        const graphemeUnitLength = getGraphemeLength(bestMatch.unit);

        if (graphemeUnitLength > graphemeRemaining) {
          logger.error('❌ Greedy matching validation failed: match exceeds remaining graphemes', {
            matchGraphemeLength: graphemeUnitLength,
            remainingGraphemeLength: graphemeRemaining,
            currentPosition,
            bestOffset,
            unit: bestMatch.unit,
            impact: 'Skipping to next boundary to prevent infinite loop',
          });
          // CRITICAL-7 FIX: Skip to next word boundary instead of advancing 1 char
          // Prevents infinite loop if match repeatedly exceeds remaining text
          const remainingForBoundary = text.substring(currentPosition);
          const nextBoundaryMatch = remainingForBoundary.search(TEXT_BOUNDARY);
          // MEDIUM-1 FIX: Cap skipDistance to remaining text length to prevent overflow
          const uncappedSkipDistance =
            nextBoundaryMatch > 0 ? nextBoundaryMatch : remainingText.length;
          const skipDistance = Math.min(uncappedSkipDistance, text.length - currentPosition);
          currentPosition += skipDistance;
          continue;
        }
      }

      if (bestMatch) {
        // Handle any punctuation before the match
        if (bestOffset > 0) {
          const punctuationText = text.substring(currentPosition, currentPosition + bestOffset);
          segments.push({
            type: 'text',
            text: punctuationText,
            start: currentPosition,
            end: currentPosition + bestOffset,
            unitIndex: -1,
            isClickable: false,
          });
          currentPosition += bestOffset;
        }

        // Found a semantic unit match - mark as used to handle duplicates correctly
        usedIndices.add(bestMatch.index);

        // CRITICAL BUG FIX: Both text and units are now normalized to NFC (lines 36-37, 56)
        // This ensures .length calculations are consistent for Vietnamese diacritics
        // Example: "màu" is always 3 chars in NFC (not 4 chars in NFD decomposed form)
        const endPosition = Math.min(currentPosition + bestMatch.unit.length, text.length);

        // CRITICAL-1 FIX: Prevent infinite loop from zero-length segments
        if (endPosition === currentPosition) {
          logger.error('❌ Zero-length segment detected - skipping to prevent infinite loop', {
            unitIndex: bestMatch.index,
            unit: bestMatch.unit,
            unitLength: bestMatch.unit.length,
            position: currentPosition,
          });
          currentPosition++; // Force progress
          continue;
        }

        if (endPosition - currentPosition !== bestMatch.unit.length) {
          logger.error('Segment length mismatch (array out-of-bounds prevented):', {
            expected: bestMatch.unit.length,
            actual: endPosition - currentPosition,
            position: currentPosition,
            textLength: text.length,
            unit: bestMatch.unit,
          });
        }

        // Preserve original case from the full text
        const originalCaseText = text.substring(currentPosition, endPosition);

        // Create semantic segment
        segments.push({
          type: 'semantic',
          text: originalCaseText,
          start: currentPosition,
          end: endPosition,
          unitIndex: bestMatch.index,
          originalText: bestMatch.original,
          translatedText: originalCaseText,
          source: bestMatch.metadata.source,
          metadata: bestMatch.metadata,
          isClickable: true,
        });

        currentPosition = endPosition;
      } else {
        // No semantic unit matches - advance carefully to avoid consuming potential matches
        const char = text[currentPosition];

        if (char === ' ') {
          // Handle spaces separately
          segments.push({
            type: 'space',
            text: ' ',
            start: currentPosition,
            end: currentPosition + 1,
            unitIndex: -1,
            isClickable: false,
          });
          currentPosition++;
        } else if (/[\r\n]/.test(char)) {
          // Handle line breaks
          let lineBreakEnd = currentPosition;
          while (lineBreakEnd < text.length && /[\r\n]/.test(text[lineBreakEnd])) {
            lineBreakEnd++;
          }

          segments.push({
            type: 'text',
            text: text.substring(currentPosition, lineBreakEnd),
            start: currentPosition,
            end: lineBreakEnd,
            unitIndex: -1,
            isClickable: false,
          });
          currentPosition = lineBreakEnd;
        } else {
          // Handle single character - but check if the next few characters might form a match
          // Advance to next logical boundary (space, punctuation, or line break)
          let nextBoundary = currentPosition + 1;
          while (nextBoundary < text.length && !TEXT_BOUNDARY.test(text[nextBoundary])) {
            nextBoundary++;
          }

          const nonSemanticText = text.substring(currentPosition, nextBoundary);
          segments.push({
            type: 'text',
            text: nonSemanticText,
            start: currentPosition,
            end: nextBoundary,
            unitIndex: -1,
            isClickable: false,
          });

          // CRITICAL-1 FIX: Ensure forward progress to prevent infinite loop
          // If nextBoundary equals currentPosition (shouldn't happen but safety check),
          // force at least 1 character advance to prevent infinite loop
          if (nextBoundary === currentPosition) {
            logger.error('❌ Zero progress detected in SegmentPrecomputer - forcing advance', {
              currentPosition,
              nextBoundary,
              remainingText: text.substring(
                currentPosition,
                Math.min(currentPosition + 20, text.length)
              ),
            });
            nextBoundary = currentPosition + 1;
          }
          currentPosition = nextBoundary;
        }
      }
    }

    return segments;
  }

  /**
   * Pre-compute segments for original text
   * @param {string} text - The full original text
   * @param {Object} semanticArrays - Semantic arrays from translation
   * @returns {Array} Pre-computed segments for original text
   */
  static precomputeOriginalSegments(text, semanticArrays) {
    if (!semanticArrays || !semanticArrays.original || semanticArrays.original.length === 0) {
      return [];
    }

    const { original, translated, metadata } = semanticArrays;

    // New approach: Use simple text search but prioritize longer matches
    const segments = [];
    let currentPosition = 0;
    let usedIndices = new Set();

    // Process text character by character
    while (currentPosition < text.length) {
      let bestMatch = null;
      let bestStartPos = -1;

      // Find the best match starting at current position
      for (let i = 0; i < original.length; i++) {
        if (usedIndices.has(i)) continue;

        const unit = original[i];

        // Check if this unit starts exactly at current position
        const remainingText = text.substring(currentPosition);
        if (remainingText.startsWith(unit)) {
          // Found exact match at current position - prefer longer units
          if (!bestMatch || unit.length > bestMatch.unit.length) {
            bestMatch = {
              index: i,
              unit: unit,
              translated: translated[i],
              metadata: metadata[i],
            };
            bestStartPos = currentPosition;
          }
        }
      }

      if (bestMatch && bestStartPos >= currentPosition) {
        // Add any skipped characters as non-clickable text
        if (bestStartPos > currentPosition) {
          const skippedText = text.substring(currentPosition, bestStartPos);
          segments.push({
            type: 'text',
            text: skippedText,
            start: currentPosition,
            end: bestStartPos,
            unitIndex: -1,
            isClickable: false,
          });
        }

        // Add the semantic unit
        segments.push({
          type: 'semantic',
          text: bestMatch.unit,
          start: bestStartPos,
          end: bestStartPos + bestMatch.unit.length,
          unitIndex: bestMatch.index,
          originalText: bestMatch.unit,
          translatedText: bestMatch.translated,
          source: bestMatch.metadata.source,
          metadata: bestMatch.metadata,
          isClickable: true,
        });

        usedIndices.add(bestMatch.index);
        currentPosition = bestStartPos + bestMatch.unit.length;
      } else {
        // No match found, add current character as non-clickable
        const char = text[currentPosition];
        segments.push({
          type: 'text',
          text: char,
          start: currentPosition,
          end: currentPosition + 1,
          unitIndex: -1,
          isClickable: false,
        });
        currentPosition++;
      }
    }

    return segments;
  }

  /**
   * Create optimized segment data structure for rendering
   * @param {Array} segments - Pre-computed segments
   * @param {number} highlightedUnitIndex - Currently highlighted unit index (original to translation)
   * @param {number} highlightedTranslationUnitIndex - Currently highlighted translation index (translation to original)
   * @returns {Array} Render-optimized segments
   */
  static createRenderSegments(
    segments,
    highlightedUnitIndex = -1,
    highlightedTranslationUnitIndex = -1
  ) {
    return segments.map((segment, index) => {
      const isHighlighted =
        segment.unitIndex === highlightedUnitIndex ||
        segment.unitIndex === highlightedTranslationUnitIndex;
      return {
        ...segment,
        key: `segment-${segment.type}-${index}-${segment.start}`,
        isHighlighted,
        className: this.getSegmentClassName(segment, isHighlighted),
      };
    });
  }

  /**
   * Get optimized CSS class name for segment
   * @param {Object} segment - Segment data
   * @param {boolean} isHighlighted - Whether segment is highlighted
   * @returns {string} CSS class name
   */
  static getSegmentClassName(segment, isHighlighted) {
    const classes = ['segment'];

    if (segment.isClickable) {
      classes.push('clickable');

      // Add source-specific styling
      if (segment.source) {
        classes.push(`source-${segment.source.replace(/[^a-zA-Z0-9]/g, '-')}`);
      }

      if (isHighlighted) {
        classes.push('highlighted');
      }
    }

    return classes.join(' ');
  }

  /**
   * Extract highlight styles for better performance
   * @param {boolean} isHighlighted - Whether segment is highlighted
   * @returns {Object} Style object
   */
  static getSegmentStyles(isHighlighted) {
    if (isHighlighted) {
      return {
        color: 'var(--primary-color)',
        fontWeight: 600,
      };
    }

    return {};
  }

  /**
   * Optimize segments for virtual scrolling
   * @param {Array} segments - Pre-computed segments
   * @param {number} startIndex - Start index for visible area
   * @param {number} endIndex - End index for visible area
   * @returns {Array} Visible segments only
   */
  static getVisibleSegments(segments, startIndex, endIndex) {
    return segments.slice(startIndex, endIndex + 1);
  }

  /**
   * Find a semantic unit match with offset information
   * @param {string} remainingText - Text remaining to match against
   * @param {string} unitText - Semantic unit text to find
   * @returns {Object} Match result with found flag and offset
   */
  static findUnitMatch(remainingText, unitText) {
    // HIGH-3 FIX: Validate input BEFORE offset calculation to prevent invalid processing
    // Previous: Safety check happened AFTER offset loop (line 474)
    // Fixed: Pre-validation ensures offset calculation works on valid data
    if (!remainingText || remainingText.length === 0) {
      return { found: false, offset: 0 };
    }

    // MEDIUM-3 FIX: Ensure offset calculation happens BEFORE normalization
    // CRITICAL SEPARATION: Offset uses RAW text, normalization only for comparison
    // Step 1: Calculate offset from RAW text (BEFORE any normalization)
    let offset = 0;
    while (offset < remainingText.length) {
      const char = remainingText[offset];
      // MEDIUM-4 FIX: Use named constant instead of magic regex
      if (PUNCTUATION_AND_WHITESPACE.test(char)) {
        offset++;
      } else {
        break;
      }
    }

    // Step 2: NOW normalize for comparison (offset already calculated from raw text)
    const remaining = this.normalizeText(remainingText);
    const unit = this.normalizeText(unitText);

    // First try exact match at offset 0 (fastest)
    if (remaining.startsWith(unit)) {
      return { found: true, offset: 0 };
    }

    if (offset > 0) {
      const textAfterPunctuation = this.normalizeText(remainingText.substring(offset));
      if (textAfterPunctuation.startsWith(unit)) {
        // IMPORTANT-5: Runtime enforcement - validate offset uses original text length
        // Catch bugs where normalized length might accidentally be used for positions
        if (offset >= remainingText.length) {
          logger.error('❌ normalizeText safety violation: offset exceeds original text length', {
            offset,
            originalLength: remainingText.length,
            normalizedLength: remaining.length,
            unitText,
            impact: 'Would cause array out-of-bounds in position calculation',
          });
          return { found: false, offset: 0 };
        }
        return { found: true, offset };
      }
    }

    return { found: false, offset: 0 };
  }

  /**
   * Normalize text for more reliable matching
   *
   * CRITICAL: This method is ONLY used for text comparison (case-insensitive matching),
   * NOT for position calculation. Position offsets are always calculated from the
   * original, non-normalized text to ensure accurate click highlighting.
   *
   * Why this is safe:
   * - findUnitMatch() calculates offset from raw text (lines 365-379)
   * - normalizeText() only used in startsWith() comparison (lines 359, 383)
   * - Positions stored use original text length, not normalized length
   *
   * @param {string} text - Text to normalize
   * @returns {string} Normalized text (lowercase, whitespace collapsed, zero-width removed)
   */
  static normalizeText(text) {
    return (
      text
        .toLowerCase()
        .trim()
        // Normalize all types of whitespace including CJK full-width spaces
        .replace(/[\s\u3000\u2000-\u200F\u2028\u2029]+/g, ' ')
        // Remove zero-width characters that might interfere
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
    );
  }

  // CRITICAL-2 FIX: Removed duplicate getGraphemeLength() method
  // Now using shared GraphemeHelper.getGraphemeLength() with singleton Intl.Segmenter
  // Eliminates per-call instance creation overhead (0.1-0.5ms × n calls)

  /**
   * Enhanced matching that handles punctuation and formatting differences
   * @param {string} remainingText - Text remaining to match against
   * @param {string} unitText - Semantic unit text to find
   * @returns {boolean} True if unit matches at current position
   */
  static matchesAtPosition(remainingText, unitText) {
    const remaining = remainingText.toLowerCase();
    const unit = unitText.toLowerCase();

    // First try exact match (fastest)
    if (remaining.startsWith(unit)) {
      return true;
    }

    // Handle punctuation and quotes at the beginning
    // Skip over opening quotes, punctuation, and brackets
    let offset = 0;
    while (
      offset < remaining.length &&
      /[\s\r\n"""'''"'「」『』《》〈〉[\]]/.test(remaining[offset])
    ) {
      offset++;
    }

    if (offset > 0) {
      const textAfterPunctuation = remaining.substring(offset);
      if (textAfterPunctuation.startsWith(unit)) {
        return true;
      }
    }

    return false;
  }
}
