/**
 * Enhanced Viewport-Based Segment Computation with Web Workers
 * Maintains backward compatibility while adding Web Worker acceleration
 * Falls back gracefully to main thread processing if workers fail
 *
 * @import { ViewportSegmentComputerEnhancedInterface, TextPositionMapping, ViewportSegment, EnhancedPerformanceStats, TextRange } from '../types/ViewportTypes'
 * @implements {ViewportSegmentComputerEnhancedInterface}
 */

import { segmentWorkerManager } from './SegmentWorkerManager.js';

export class ViewportSegmentComputerEnhanced {
  constructor(options = {}) {
    // Cache for computed segments (main thread cache)
    this.segmentCache = new Map();
    this.semanticRangeMap = null;
    this.useWorkers = options.useWorkers !== false; // Default to true
    this.workerThreshold = options.workerThreshold || 1000; // Use workers for texts >1000 chars

    this.cacheStats = {
      hits: 0,
      misses: 0,
      computations: 0,
      workerHits: 0,
      mainThreadHits: 0,
    };

    // Performance tracking
    this.performanceStats = {
      positionMappingTime: 0,
      segmentComputationTime: 0,
      cacheOperationTime: 0,
      workerCommunicationTime: 0,
    };
  }

  /**
   * Create lightweight text position mapping (enhanced with Web Workers)
   * @param {string} text - Full translated text
   * @param {Object} semanticArrays - Semantic arrays from translation
   * @returns {Object} Fast position mapping (50ms → ~20ms with workers)
   */
  async createTextPositionMapping(text, semanticArrays) {
    const startTime = performance.now();

    // Quick validation
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      return {
        textLength: text.length,
        semanticRanges: [],
        stats: { computeTime: performance.now() - startTime, rangeCount: 0, usedWorker: false },
      };
    }

    // Determine whether to use Web Workers
    const shouldUseWorker = this.useWorkers && text.length > this.workerThreshold;

    let result;
    if (shouldUseWorker) {
      try {
        // Use Web Worker for heavy computation
        const workerStartTime = performance.now();
        result = await segmentWorkerManager.createTextPositionMapping(text, semanticArrays);
        result.stats.usedWorker = true;
        result.stats.workerTime = performance.now() - workerStartTime;

        console.log(
          `🚀 Worker position mapping: ${result.semanticRanges.length} ranges in ${result.stats.computeTime.toFixed(1)}ms (worker overhead: ${result.stats.workerTime.toFixed(1)}ms)`
        );
      } catch (error) {
        console.warn('⚠️ Worker failed, falling back to main thread:', error.message);
        result = this._createTextPositionMappingMainThread(text, semanticArrays);
        result.stats.usedWorker = false;
        result.stats.fallbackReason = error.message;
      }
    } else {
      // Use main thread for small texts or when workers disabled
      result = this._createTextPositionMappingMainThread(text, semanticArrays);
      result.stats.usedWorker = false;
      result.stats.skipReason = shouldUseWorker ? 'disabled' : 'below threshold';
    }

    // Store result for segment computation
    this.semanticRangeMap = result;

    // Update performance stats
    this.performanceStats.positionMappingTime += performance.now() - startTime;

    return result;
  }

  /**
   * Main thread position mapping (fallback and small texts)
   */
  _createTextPositionMappingMainThread(text, semanticArrays) {
    const startTime = performance.now();

    const { translated, original, metadata } = semanticArrays;
    const semanticRanges = [];
    let currentPosition = 0;

    // Build lightweight position mapping (identical algorithm to worker)
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
          metadata: metadata[i],
        });

        currentPosition = actualEnd;
      }
    }

    const computeTime = performance.now() - startTime;

    return {
      textLength: text.length,
      semanticRanges,
      fullText: text,
      stats: { computeTime, rangeCount: semanticRanges.length },
    };
  }

  /**
   * Compute segments for visible text range with Web Worker support
   * @param {number} textStart - Start character position in text
   * @param {number} textEnd - End character position in text
   * @returns {Array} Segments for visible range only
   */
  async computeSegmentsForTextRange(textStart, textEnd) {
    if (!this.semanticRangeMap) {
      console.warn('⚠️ No semantic range map available - call createTextPositionMapping first');
      return [];
    }

    const startTime = performance.now();
    const cacheKey = `${textStart}-${textEnd}`;

    // Check cache first (main thread cache is still faster for hits)
    if (this.segmentCache.has(cacheKey)) {
      this.cacheStats.hits++;
      this.cacheStats.mainThreadHits++;
      return this.segmentCache.get(cacheKey);
    }

    this.cacheStats.misses++;
    this.cacheStats.computations++;

    // Determine whether to use worker
    const rangeSize = textEnd - textStart;
    const shouldUseWorker = this.useWorkers && rangeSize > this.workerThreshold / 4; // Use worker for large ranges

    let segmentResult;
    if (shouldUseWorker) {
      try {
        // Use Web Worker for segment computation
        segmentResult = await segmentWorkerManager.computeSegmentsForTextRange(
          this.semanticRangeMap,
          textStart,
          textEnd
        );
        this.cacheStats.workerHits++;
      } catch (error) {
        console.warn('⚠️ Worker segment computation failed, using main thread:', error.message);
        segmentResult = {
          segments: this._computeSegmentsMainThread(textStart, textEnd),
          stats: { computeTime: performance.now() - startTime },
        };
      }
    } else {
      // Use main thread
      segmentResult = {
        segments: this._computeSegmentsMainThread(textStart, textEnd),
        stats: { computeTime: performance.now() - startTime },
      };
    }

    const segments = segmentResult.segments;

    // Cache the result (keep cache size reasonable)
    this.segmentCache.set(cacheKey, segments);
    if (this.segmentCache.size > 50) {
      const firstKey = this.segmentCache.keys().next().value;
      this.segmentCache.delete(firstKey);
    }

    // Update performance stats
    this.performanceStats.segmentComputationTime += performance.now() - startTime;

    return segments;
  }

  /**
   * Main thread segment computation (fallback)
   */
  _computeSegmentsMainThread(textStart, textEnd) {
    const { semanticRanges, fullText } = this.semanticRangeMap || {};

    // Validate inputs
    if (!semanticRanges || !fullText) {
      console.error('⚠️ _computeSegmentsMainThread: Missing semanticRanges or fullText', {
        hasSemanticRanges: !!semanticRanges,
        hasFullText: !!fullText,
        semanticRangeMap: this.semanticRangeMap,
      });
      return [];
    }

    // DEBUG: Check if fullText has capitalization
    if (process.env.NODE_ENV === 'development' && textStart === 0) {
      const firstChar = fullText.charAt(0);
      const isCapitalized =
        firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();
      console.log(
        `🔍 Segment computation fullText capitalization check: "${fullText.substring(0, 50)}" - First char capitalized: ${isCapitalized}`
      );
    }

    const segments = [];
    let currentPos = textStart;

    // Find semantic ranges that overlap with visible area
    const relevantRanges = semanticRanges.filter(
      (range) => range.startPos < textEnd && range.endPos > textStart
    );

    // Build segments for visible area (identical to worker algorithm)
    while (currentPos < textEnd) {
      const nextRange = relevantRanges.find(
        (range) => range.startPos >= currentPos && range.startPos < textEnd
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
              isClickable: false,
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
          isClickable: true,
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
            isClickable: false,
          });
        }
        break;
      }
    }

    return segments;
  }

  /**
   * Pre-warm cache for common viewport positions with batch worker processing
   * @param {number} textLength - Total text length
   * @param {number} viewportSize - Typical viewport size
   */
  async prewarmCache(textLength, viewportSize = 1000) {
    if (!this.semanticRangeMap) return;

    const positions = [
      { textStart: 0, textEnd: Math.min(viewportSize, textLength) },
      {
        textStart: Math.max(0, textLength / 2 - viewportSize / 2),
        textEnd: Math.min(textLength, textLength / 2 + viewportSize / 2),
      },
      { textStart: Math.max(0, textLength - viewportSize), textEnd: textLength },
    ];

    console.log('🔄 Pre-warming viewport cache with Web Workers...');

    try {
      if (this.useWorkers) {
        // Use batch worker processing for efficiency
        const batchResult = await segmentWorkerManager.computeBatchSegments(
          this.semanticRangeMap,
          positions
        );

        // Store results in main thread cache
        for (const [cacheKey, result] of Object.entries(batchResult.results)) {
          this.segmentCache.set(cacheKey, result.segments);
        }

        console.log(
          `✅ Batch cache pre-warmed: ${Object.keys(batchResult.results).length} ranges in ${batchResult.batchStats.totalTime.toFixed(1)}ms`
        );
      } else {
        // Fallback to individual computations
        for (const pos of positions) {
          await this.computeSegmentsForTextRange(pos.textStart, pos.textEnd);
        }
        console.log(`✅ Cache pre-warmed with ${this.segmentCache.size} ranges (main thread)`);
      }
    } catch (error) {
      console.warn('⚠️ Cache pre-warming failed:', error.message);
    }
  }

  /**
   * Find semantic unit in text with fuzzy matching (identical to worker)
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
   * Normalize text for matching (identical to worker)
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\s\u3000\u2000-\u200F\u2028\u2029]+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '');
  }

  /**
   * Get comprehensive performance statistics
   */
  getCacheStats() {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const workerStats = segmentWorkerManager.getStats();

    return {
      // Local cache stats
      ...this.cacheStats,
      hitRate: total > 0 ? this.cacheStats.hits / total : 0,
      cacheSize: this.segmentCache.size,

      // Worker stats
      workerStats,

      // Performance stats
      performanceStats: this.performanceStats,

      // Combined efficiency
      totalSpeedup: this.useWorkers ? 'Enabled' : 'Disabled',
      recommendedAction: this._getOptimizationRecommendation(),
    };
  }

  /**
   * Get optimization recommendation based on usage patterns
   */
  _getOptimizationRecommendation() {
    const workerStats = segmentWorkerManager.getStats();

    if (this.cacheStats.misses > 20 && workerStats.workerPercentage < 50) {
      return 'Consider lowering workerThreshold to use workers more often';
    }

    if (workerStats.errors > 5) {
      return 'High worker error rate - consider disabling workers';
    }

    if (this.cacheStats.hits / Math.max(this.cacheStats.misses, 1) > 10) {
      return 'Excellent cache performance - consider increasing cache size';
    }

    return 'Performance optimized';
  }

  /**
   * Clear cache and reset stats
   */
  clearCache() {
    this.segmentCache.clear();
    this.cacheStats = { hits: 0, misses: 0, computations: 0, workerHits: 0, mainThreadHits: 0 };
    this.performanceStats = {
      positionMappingTime: 0,
      segmentComputationTime: 0,
      cacheOperationTime: 0,
      workerCommunicationTime: 0,
    };
  }

  /**
   * Enable or disable Web Workers
   */
  setWorkerEnabled(enabled) {
    this.useWorkers = enabled;
    console.log(`🔧 Web Workers ${enabled ? 'enabled' : 'disabled'} for ViewportSegmentComputer`);
  }

  /**
   * Calculate text range from viewport coordinates (unchanged)
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
    const avgCharsPerLine = textLength / semanticRanges.length;

    const textStart = Math.max(0, Math.floor(startLineIndex * avgCharsPerLine));
    const textEnd = Math.min(textLength, Math.ceil(endLineIndex * avgCharsPerLine));

    return { textStart, textEnd, startLineIndex, endLineIndex };
  }
}
