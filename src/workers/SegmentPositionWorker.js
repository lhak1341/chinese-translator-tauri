/**
 * Web Worker for Background Segment Position Mapping
 * Processes heavy position mapping computations off the main thread
 * Maintains identical accuracy to ViewportSegmentComputer
 *
 * @import {
 *   SegmentPositionWorker as ISegmentPositionWorker,
 *   WorkerCacheStats,
 *   TextPositionMapping,
 *   SemanticRange,
 *   MatchResult,
 *   DisplaySegment
 * } from '../types/WorkerTypes'
 */

// Import the core logic (will be bundled by Vite)
// For now, we'll duplicate the core functions to avoid bundling complexity
class SegmentPositionWorker {
  constructor() {
    this.cacheStats = {
      hits: 0,
      misses: 0,
      computations: 0
    };
  }

  /**
   * Create lightweight text position mapping (identical to ViewportSegmentComputer)
   * @param {string} text - Full translated text
   * @param {Object} semanticArrays - Semantic arrays from translation
   * @returns {Object} Fast position mapping
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

    // Build lightweight position mapping (identical algorithm to main thread)
    for (let i = 0; i < translated.length; i++) {
      const unit = translated[i];
      
      // Find unit in text starting from current position
      const searchText = text.substring(currentPosition);
      const matchResult = this.findUnitInText(searchText, unit);
      
      if (matchResult.found) {
        const actualStart = currentPosition + matchResult.offset;
        const actualEnd = actualStart + unit.length;
        
        // Store lightweight range info
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

    const computeTime = performance.now() - startTime;
    
    return {
      textLength: text.length,
      semanticRanges,
      fullText: text,
      stats: { computeTime, rangeCount: semanticRanges.length }
    };
  }

  /**
   * Find semantic unit in text with fuzzy matching (identical to ViewportSegmentComputer)
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
   * Normalize text for matching (identical to ViewportSegmentComputer)
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
   * Compute segments for visible text range only
   * @param {Object} semanticRangeMap - Pre-computed position mapping
   * @param {number} textStart - Start character position in text
   * @param {number} textEnd - End character position in text
   * @returns {Array} Segments for visible range only
   */
  computeSegmentsForTextRange(semanticRangeMap, textStart, textEnd) {
    if (!semanticRangeMap) {
      return [];
    }

    const startTime = performance.now();
    this.cacheStats.computations++;

    const { semanticRanges, fullText } = semanticRangeMap;
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

    const computeTime = performance.now() - startTime;

    return {
      segments,
      stats: { computeTime, segmentCount: segments.length }
    };
  }

  /**
   * Process batch of viewport computations
   * @param {Object} semanticRangeMap - Pre-computed position mapping
   * @param {Array} viewportRanges - Array of {textStart, textEnd} ranges
   * @returns {Object} Batch results
   */
  computeBatchSegments(semanticRangeMap, viewportRanges) {
    const startTime = performance.now();
    const results = {};

    for (const range of viewportRanges) {
      const cacheKey = `${range.textStart}-${range.textEnd}`;
      const result = this.computeSegmentsForTextRange(
        semanticRangeMap, 
        range.textStart, 
        range.textEnd
      );
      results[cacheKey] = result;
    }

    return {
      results,
      batchStats: {
        totalTime: performance.now() - startTime,
        rangeCount: viewportRanges.length
      }
    };
  }
}

// Worker instance
const worker = new SegmentPositionWorker();

// Message handling
self.onmessage = function(e) {
  const { type, id, data } = e.data;

  try {
    let result;

    switch (type) {
      case 'CREATE_POSITION_MAPPING':
        result = worker.createTextPositionMapping(data.text, data.semanticArrays);
        break;

      case 'COMPUTE_SEGMENTS':
        result = worker.computeSegmentsForTextRange(
          data.semanticRangeMap,
          data.textStart,
          data.textEnd
        );
        break;

      case 'COMPUTE_BATCH_SEGMENTS':
        result = worker.computeBatchSegments(
          data.semanticRangeMap,
          data.viewportRanges
        );
        break;

      case 'GET_CACHE_STATS':
        result = worker.cacheStats;
        break;

      default:
        throw new Error(`Unknown worker command: ${type}`);
    }

    // Send successful result
    self.postMessage({
      type: 'SUCCESS',
      id,
      result
    });

  } catch (error) {
    // Send error result
    self.postMessage({
      type: 'ERROR',
      id,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
};

// Worker ready signal
self.postMessage({
  type: 'READY',
  message: 'SegmentPositionWorker initialized and ready'
});