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

    const { translated, original, metadata } = semanticArrays;

    const segments = [];
    let currentPosition = 0;

    // Create a lookup map for faster unit matching - don't use keys, use direct comparison
    const allUnits = translated.map((unit, index) => ({
      index,
      unit,
      original: original[index],
      metadata: metadata[index],
    }));

    // Sort units by their tokenIndex to ensure text-order processing for duplicates
    const filteredUnits = allUnits.sort(
      (a, b) => (a.metadata.tokenIndex || 0) - (b.metadata.tokenIndex || 0)
    );

    // Track used indices to ensure duplicate units map to correct sequential occurrences
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

        // Preserve original case from the full text
        const originalCaseText = text.substring(
          currentPosition,
          currentPosition + bestMatch.unit.length
        );

        // Create semantic segment
        segments.push({
          type: 'semantic',
          text: originalCaseText,
          start: currentPosition,
          end: currentPosition + bestMatch.unit.length,
          unitIndex: bestMatch.index,
          originalText: bestMatch.original,
          translatedText: originalCaseText,
          source: bestMatch.metadata.source,
          metadata: bestMatch.metadata,
          isClickable: true,
        });

        currentPosition += bestMatch.unit.length;
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
          while (
            nextBoundary < text.length &&
            !/[\s\r\n,，.。!！?？;；:：[\]]/.test(text[nextBoundary])
          ) {
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
    // Normalize both texts - handle different capitalization and spacing
    const remaining = this.normalizeText(remainingText);
    const unit = this.normalizeText(unitText);

    // First try exact match (fastest)
    if (remaining.startsWith(unit)) {
      return { found: true, offset: 0 };
    }

    // Handle punctuation, quotes, and line breaks at the beginning
    // Skip over opening quotes, punctuation, and whitespace (comprehensive Unicode support)
    let offset = 0;
    while (offset < remainingText.length) {
      const char = remainingText[offset];
      // Check for various quote, punctuation, whitespace, line break, and bracket characters
      // Added \u3000 (full-width space) and other CJK whitespace characters
      if (
        /[\s\r\n\t\u3000\u2000-\u200F\u2028\u2029"'`\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB\u300C\u300D\u300E\u300F\u3008\u3009\u300A\u300B\u3014\u3015\u3016\u3017,，.。!！?？;；:：[\]]/.test(
          char
        )
      ) {
        offset++;
      } else {
        break;
      }
    }

    if (offset > 0) {
      const textAfterPunctuation = this.normalizeText(remainingText.substring(offset));
      if (textAfterPunctuation.startsWith(unit)) {
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
