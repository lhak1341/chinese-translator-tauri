/**
 * Segment Precomputation for Optimized Clickable Text Rendering
 * Pre-computes all segment data during translation to avoid runtime calculations
 */

export class SegmentPrecomputer {
  // Object pools to reduce garbage collection pressure
  static segmentPool = [];
  static unitDataPool = [];
  static poolHits = 0;
  static poolMisses = 0;

  /**
   * Get a segment object from the pool or create a new one
   * @returns {Object} Segment object
   */
  static getSegment() {
    if (this.segmentPool.length > 0) {
      this.poolHits++;
      return this.segmentPool.pop();
    }
    this.poolMisses++;
    return {};
  }

  /**
   * Return a segment object to the pool for reuse
   * @param {Object} segment - Segment to return to pool
   */
  static releaseSegment(segment) {
    // Reset all properties to avoid memory leaks
    for (const key in segment) {
      delete segment[key];
    }

    // Only keep pool size reasonable to avoid excessive memory usage
    if (this.segmentPool.length < 1000) {
      this.segmentPool.push(segment);
    }
  }

  /**
   * Get a unit data object from the pool or create a new one
   * @returns {Object} Unit data object
   */
  static getUnitData() {
    if (this.unitDataPool.length > 0) {
      this.poolHits++;
      return this.unitDataPool.pop();
    }
    this.poolMisses++;
    return {};
  }

  /**
   * Return a unit data object to the pool for reuse
   * @param {Object} unitData - Unit data to return to pool
   */
  static releaseUnitData(unitData) {
    // Reset all properties
    for (const key in unitData) {
      delete unitData[key];
    }

    if (this.unitDataPool.length < 500) {
      this.unitDataPool.push(unitData);
    }
  }

  /**
   * Get object pool statistics
   * @returns {Object} Pool statistics
   */
  static getPoolStats() {
    return {
      segmentPoolSize: this.segmentPool.length,
      unitDataPoolSize: this.unitDataPool.length,
      poolHits: this.poolHits,
      poolMisses: this.poolMisses,
      hitRate: this.poolHits / Math.max(this.poolHits + this.poolMisses, 1),
    };
  }

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
    // Use object pool for unit data objects to reduce GC pressure
    const allUnits = translated.map((unit, index) => {
      const unitData = this.getUnitData();
      unitData.index = index;
      unitData.unit = unit;
      unitData.original = original[index];
      unitData.metadata = metadata[index];
      return unitData;
    });

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

        // Use object pool for segment creation
        const segment = this.getSegment();
        segment.type = 'semantic';
        segment.text = originalCaseText;
        segment.start = currentPosition;
        segment.end = currentPosition + bestMatch.unit.length;
        segment.unitIndex = bestMatch.index;
        segment.originalText = bestMatch.original;
        segment.translatedText = originalCaseText;
        segment.source = bestMatch.metadata.source;
        segment.metadata = bestMatch.metadata;
        segment.isClickable = true;

        segments.push(segment);

        currentPosition += bestMatch.unit.length;
      } else {
        // No semantic unit matches - advance carefully to avoid consuming potential matches
        const char = text[currentPosition];

        if (char === ' ') {
          // Handle spaces separately
          const spaceSegment = this.getSegment();
          spaceSegment.type = 'space';
          spaceSegment.text = ' ';
          spaceSegment.start = currentPosition;
          spaceSegment.end = currentPosition + 1;
          spaceSegment.unitIndex = -1;
          spaceSegment.isClickable = false;
          segments.push(spaceSegment);
          currentPosition++;
        } else if (/[\r\n]/.test(char)) {
          // Handle line breaks
          let lineBreakEnd = currentPosition;
          while (lineBreakEnd < text.length && /[\r\n]/.test(text[lineBreakEnd])) {
            lineBreakEnd++;
          }

          const lineBreakSegment = this.getSegment();
          lineBreakSegment.type = 'text';
          lineBreakSegment.text = text.substring(currentPosition, lineBreakEnd);
          lineBreakSegment.start = currentPosition;
          lineBreakSegment.end = lineBreakEnd;
          lineBreakSegment.unitIndex = -1;
          lineBreakSegment.isClickable = false;
          segments.push(lineBreakSegment);
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
          const textSegment = this.getSegment();
          textSegment.type = 'text';
          textSegment.text = nonSemanticText;
          textSegment.start = currentPosition;
          textSegment.end = nextBoundary;
          textSegment.unitIndex = -1;
          textSegment.isClickable = false;
          segments.push(textSegment);

          currentPosition = nextBoundary;
        }
      }
    }

    // Release unit data objects back to the pool to reduce memory pressure
    for (const unitData of allUnits) {
      this.releaseUnitData(unitData);
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
   * @param {string} text - Text to normalize
   * @returns {string} Normalized text
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
