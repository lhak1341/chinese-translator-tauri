/**
 * Viewport-Based Segment Computation
 * Eliminates 6.8-second segment precomputation bottleneck by computing segments only for visible text ranges
 *
 * @import { ViewportSegmentComputerInterface, TextPositionMapping, ViewportSegment, ViewportCacheStats } from '../types/ViewportTypes'
 * @implements {ViewportSegmentComputerInterface}
 */

export class ViewportSegmentComputer {
  constructor() {
    // Cache for computed segments
    this.segmentCache = new Map();
    this.semanticRangeMap = null;
    this.cacheStats = {
      hits: 0,
      misses: 0,
      computations: 0
    };
  }

  /**
   * Create lightweight text position mapping (replaces 6800ms precomputeSegments)
   * @param {string} text - Full translated text
   * @param {Object} semanticArrays - Semantic arrays from translation
   * @returns {Object} Fast position mapping (50ms vs 6800ms)
   */
  createTextPositionMapping(text, semanticArrays) {
    const startTime = performance.now();
    
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      return {
        textLength: text.length,
        semanticRanges: [],
        stats: { computeTime: performance.now() - startTime, rangeCount: 0 }
      };
    }

    const { translated, original, metadata } = semanticArrays;
    const semanticRanges = [];
    let currentPosition = 0;

    // Build lightweight position mapping (no full segments)
    for (let i = 0; i < translated.length; i++) {
      const unit = translated[i];
      
      // Find unit in text starting from current position
      const searchText = text.substring(currentPosition);
      const matchResult = this.findUnitInText(searchText, unit);
      
      if (matchResult.found) {
        const actualStart = currentPosition + matchResult.offset;
        const actualEnd = actualStart + unit.length;
        
        // Store lightweight range info (not full segment objects)
        semanticRanges.push({
          startPos: actualStart,
          endPos: actualEnd,
          unitIndex: i,
          originalText: original[i],
          translatedText: unit,
          source: metadata[i].source,
          metadata: metadata[i]
        });
        
        currentPosition = actualEnd;
      }
    }

    this.semanticRangeMap = {
      textLength: text.length,
      semanticRanges,
      fullText: text // Store for segment computation
    };

    const computeTime = performance.now() - startTime;
    console.log(`🚀 Text position mapping: ${semanticRanges.length} ranges in ${computeTime.toFixed(1)}ms (vs 6800ms full computation)`);

    return {
      ...this.semanticRangeMap,
      stats: { computeTime, rangeCount: semanticRanges.length }
    };
  }

  /**
   * Compute segments for visible text range only
   * @param {number} textStart - Start character position in text
   * @param {number} textEnd - End character position in text
   * @returns {Array} Segments for visible range only
   */
  computeSegmentsForTextRange(textStart, textEnd) {
    if (!this.semanticRangeMap) {
      console.warn('⚠️ No semantic range map available - call createTextPositionMapping first');
      return [];
    }

    const startTime = performance.now();
    const cacheKey = `${textStart}-${textEnd}`;
    
    // Check cache first
    if (this.segmentCache.has(cacheKey)) {
      this.cacheStats.hits++;
      return this.segmentCache.get(cacheKey);
    }

    this.cacheStats.misses++;
    this.cacheStats.computations++;

    const { semanticRanges, fullText } = this.semanticRangeMap;
    const segments = [];
    let currentPos = textStart;

    // Find semantic ranges that overlap with visible area
    const relevantRanges = semanticRanges.filter(range => 
      range.startPos < textEnd && range.endPos > textStart
    );

    // Build segments for visible area
    while (currentPos < textEnd) {
      // Find next semantic unit starting at or after current position
      const nextRange = relevantRanges.find(range => 
        range.startPos >= currentPos && range.startPos < textEnd
      );

      if (nextRange) {
        // Add non-semantic text before the semantic unit (if any)
        if (nextRange.startPos > currentPos) {
          const textBefore = fullText.substring(currentPos, nextRange.startPos);
          if (textBefore.trim()) {
            segments.push({
              type: 'text',
              text: textBefore,
              start: currentPos,
              end: nextRange.startPos,
              unitIndex: -1,
              isClickable: false
            });
          }
        }

        // Add the semantic segment
        const segmentEnd = Math.min(nextRange.endPos, textEnd);
        segments.push({
          type: 'semantic',
          text: fullText.substring(nextRange.startPos, segmentEnd),
          start: nextRange.startPos,
          end: segmentEnd,
          unitIndex: nextRange.unitIndex,
          originalText: nextRange.originalText,
          translatedText: nextRange.translatedText,
          source: nextRange.source,
          metadata: nextRange.metadata,
          isClickable: true
        });

        currentPos = segmentEnd;
      } else {
        // No more semantic units - add remaining text as non-clickable
        const remainingText = fullText.substring(currentPos, textEnd);
        if (remainingText.trim()) {
          segments.push({
            type: 'text',
            text: remainingText,
            start: currentPos,
            end: textEnd,
            unitIndex: -1,
            isClickable: false
          });
        }
        break;
      }
    }

    // Cache the result
    this.segmentCache.set(cacheKey, segments);
    
    // Keep cache size reasonable
    if (this.segmentCache.size > 50) {
      const firstKey = this.segmentCache.keys().next().value;
      this.segmentCache.delete(firstKey);
    }

    const computeTime = performance.now() - startTime;
    console.log(`📊 Viewport segments: ${segments.length} segments (${textStart}-${textEnd}) in ${computeTime.toFixed(1)}ms`);

    return segments;
  }

  /**
   * Convert viewport coordinates to text positions
   * @param {number} scrollTop - Current scroll position
   * @param {number} containerHeight - Viewport height
   * @param {number} itemHeight - Height per text line
   * @param {number} bufferSize - Extra buffer around visible area
   * @returns {Object} Text range for segment computation
   */
  calculateTextRangeFromViewport(scrollTop, containerHeight, itemHeight, bufferSize = 20) {
    if (!this.semanticRangeMap) {
      return { textStart: 0, textEnd: 0 };
    }

    const { textLength, semanticRanges } = this.semanticRangeMap;
    
    // Calculate visible line range
    const startLineIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const endLineIndex = Math.min(
      semanticRanges.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
    );

    // Convert line indices to text positions
    // Estimate based on average characters per line
    const avgCharsPerLine = textLength / semanticRanges.length;
    
    const textStart = Math.max(0, Math.floor(startLineIndex * avgCharsPerLine));
    const textEnd = Math.min(textLength, Math.ceil(endLineIndex * avgCharsPerLine));

    return { textStart, textEnd, startLineIndex, endLineIndex };
  }

  /**
   * Find semantic unit in text with fuzzy matching
   * @param {string} searchText - Text to search in
   * @param {string} unit - Semantic unit to find
   * @returns {Object} Match result with found flag and offset
   */
  findUnitInText(searchText, unit) {
    // Try exact match first (fastest)
    const exactIndex = searchText.indexOf(unit);
    if (exactIndex !== -1) {
      return { found: true, offset: exactIndex };
    }

    // Try normalized matching (case-insensitive, whitespace normalized)
    const normalizedSearch = this.normalizeText(searchText);
    const normalizedUnit = this.normalizeText(unit);
    
    const normalizedIndex = normalizedSearch.indexOf(normalizedUnit);
    if (normalizedIndex !== -1) {
      // Find actual offset in original text
      let actualOffset = 0;
      let normalizedOffset = 0;
      
      while (normalizedOffset < normalizedIndex && actualOffset < searchText.length) {
        if (this.normalizeText(searchText[actualOffset]) !== '') {
          normalizedOffset++;
        }
        actualOffset++;
      }
      
      return { found: true, offset: actualOffset };
    }

    return { found: false, offset: 0 };
  }

  /**
   * Normalize text for matching
   * @param {string} text - Text to normalize
   * @returns {string} Normalized text
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\s\u3000\u2000-\u200F\u2028\u2029]+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '');
  }

  /**
   * Get cache statistics for performance monitoring
   * @returns {Object} Cache performance stats
   */
  getCacheStats() {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    return {
      ...this.cacheStats,
      hitRate: total > 0 ? this.cacheStats.hits / total : 0,
      cacheSize: this.segmentCache.size
    };
  }

  /**
   * Clear cache and reset stats
   */
  clearCache() {
    this.segmentCache.clear();
    this.cacheStats = { hits: 0, misses: 0, computations: 0 };
  }

  /**
   * Pre-warm cache for common viewport positions
   * @param {number} textLength - Total text length
   * @param {number} viewportSize - Typical viewport size
   */
  prewarmCache(textLength, viewportSize = 1000) {
    if (!this.semanticRangeMap) return;

    // Pre-compute segments for beginning, middle, and end of text
    const positions = [
      { start: 0, end: Math.min(viewportSize, textLength) },
      { start: Math.max(0, textLength / 2 - viewportSize / 2), 
        end: Math.min(textLength, textLength / 2 + viewportSize / 2) },
      { start: Math.max(0, textLength - viewportSize), end: textLength }
    ];

    console.log('🔄 Pre-warming viewport cache...');
    positions.forEach(pos => {
      this.computeSegmentsForTextRange(pos.start, pos.end);
    });
    
    console.log(`✅ Cache pre-warmed with ${this.segmentCache.size} ranges`);
  }
}