/**
 * Optimized Semantic Array Builder
 * Memory-efficient semantic relationship tracking with reduced allocations
 *
 * Key optimizations:
 * - Pre-allocated arrays with capacity estimation
 * - Shared metadata structure (no duplication)
 * - Lazy array copying only when needed
 * - Cached regex patterns to avoid recompilation
 * - Pooled objects for frequently created temporary structures
 */

import { getMemorySnapshot, releaseMemorySnapshot } from './DebugObjectPool.js';
import { batchLog } from './BatchLogger.js';

export class OptimizedSemanticArrayBuilder {
  constructor(estimatedCapacity = 100) {
    this.estimatedCapacity = Math.max(50, estimatedCapacity); // Minimum capacity

    // Initialize caches and patterns before calling reset()
    this.regexCache = new Map();
    this.maxCacheSize = 100; // Prevent unbounded growth

    // Pre-compile common patterns
    this.uppercasePattern = /^[A-ZÀ-ÿ]/;

    // Performance tracking
    this.stats = {
      totalUnits: 0,
      capacityResizes: 0,
      regexCacheHits: 0,
      regexCacheMisses: 0,
    };

    // Now safe to call reset() since all properties are initialized
    this.reset();
  }

  /**
   * Reset the builder for a new translation with capacity estimation
   * @param {number} estimatedSize - Expected number of semantic units
   */
  reset(estimatedSize) {
    if (estimatedSize) {
      // Adjust capacity based on new estimation (with 20% buffer)
      let newCapacity = Math.ceil(estimatedSize * 1.2);

      // Validate capacity to prevent "Invalid array length" error
      const MAX_SAFE_CAPACITY = 10000; // Conservative limit for translation arrays
      if (!Number.isFinite(newCapacity) || newCapacity < 1 || newCapacity > MAX_SAFE_CAPACITY) {
        newCapacity = Math.min(1000, Math.max(100, estimatedSize || 100));
      }

      this.estimatedCapacity = newCapacity;
    }

    // Ensure estimatedCapacity is always valid
    if (!Number.isFinite(this.estimatedCapacity) || this.estimatedCapacity < 1) {
      this.estimatedCapacity = 100;
    }

    // Pre-allocate arrays with validated capacity
    this.original = new Array(this.estimatedCapacity);
    this.translated = new Array(this.estimatedCapacity);
    this.metadata = new Array(this.estimatedCapacity);

    // Track actual usage
    this.length = 0;

    // Clear regex cache periodically to prevent memory leaks
    if (this.regexCache.size > this.maxCacheSize) {
      this.regexCache.clear();
    }

    batchLog.hotVerbose('semantic-builder', `Reset with capacity ${this.estimatedCapacity}`);
  }

  /**
   * Add a semantic unit with memory-efficient approach
   * @param {string} originalText - Original text segment
   * @param {string} translatedText - Translated text segment
   * @param {string} source - Source dictionary/type
   * @param {number} tokenIndex - Token index (optional)
   */
  addUnit(originalText, translatedText, source, tokenIndex = -1) {
    // Resize arrays if we exceed pre-allocated capacity
    if (this.length >= this.original.length) {
      this.resizeArrays();
    }

    const index = this.length;

    // Store in pre-allocated arrays
    this.original[index] = originalText;
    this.translated[index] = translatedText;

    // Optimized metadata: only store essential fields, avoid duplication
    this.metadata[index] = {
      index,
      source,
      tokenIndex,
      translatedStart: -1, // Will be set during postProcess text assembly
      translatedEnd: -1, // Will be set during postProcess text assembly
      // originalText and translatedText removed - accessible via arrays
    };

    this.length++;
    this.stats.totalUnits++;

    batchLog.hotVerbose(
      'semantic-add-unit',
      `Added unit ${index}: "${originalText}" → "${translatedText}" (${source})`
    );
  }

  /**
   * Update position for a semantic unit that matches the given criteria
   * @param {number} tokenIndex - Token index to match
   * @param {string} translatedText - Translated text to match (case-insensitive)
   * @param {number} startPos - Start position in final translated text
   * @param {number} endPos - End position in final translated text
   * @returns {boolean} True if a matching unit was found and updated
   */
  setPositionByMatch(tokenIndex, translatedText, startPos, endPos) {
    // Find semantic unit that matches both tokenIndex and translatedText
    // This handles cases where multiple semantic units share the same tokenIndex
    // (e.g., pattern match + character fallbacks for the same token)

    for (let i = 0; i < this.length; i++) {
      const meta = this.metadata[i];

      // Match by tokenIndex and translatedText (case-insensitive)
      if (
        meta.tokenIndex === tokenIndex &&
        this.translated[i].toLowerCase() === translatedText.toLowerCase() &&
        meta.translatedStart === -1
      ) {
        // Only update if not already set

        meta.translatedStart = startPos;
        meta.translatedEnd = endPos;

        return true;
      }
    }

    // No match found - this is expected for punctuation and whitespace added during postProcess
    return false;
  }

  /**
   * Resize arrays when capacity is exceeded
   * @private
   */
  resizeArrays() {
    const newCapacity = Math.ceil(this.original.length * 1.5);

    // Create new arrays with increased capacity
    const newOriginal = new Array(newCapacity);
    const newTranslated = new Array(newCapacity);
    const newMetadata = new Array(newCapacity);

    // Copy existing data
    for (let i = 0; i < this.length; i++) {
      newOriginal[i] = this.original[i];
      newTranslated[i] = this.translated[i];
      newMetadata[i] = this.metadata[i];
    }

    this.original = newOriginal;
    this.translated = newTranslated;
    this.metadata = newMetadata;
    this.stats.capacityResizes++;

    batchLog.info('semantic-resize', `Resized semantic arrays to capacity ${newCapacity}`);
  }

  /**
   * Build position mappings with optimized data structures
   * @param {string} originalText - Final original text
   * @param {string} translatedText - Final translated text
   * @returns {Object} Position mappings using efficient arrays
   */
  buildPositionMappings(originalText, translatedText) {
    const snapshot = getMemorySnapshot();

    // Use typed arrays for better memory efficiency and performance
    const originalPositions = new Int32Array(originalText.length);
    const translatedPositions = new Int32Array(translatedText.length);

    // Initialize with -1 (no mapping)
    originalPositions.fill(-1);
    translatedPositions.fill(-1);

    // Track used indices with Set for O(1) lookup
    const usedIndices = new Set();

    // Build original text position mapping
    this.buildOriginalMapping(originalText, originalPositions, usedIndices);

    // Reset for translation mapping
    usedIndices.clear();

    // Build translated text position mapping
    this.buildTranslatedMapping(translatedText, translatedPositions, usedIndices);

    releaseMemorySnapshot(snapshot);

    return {
      originalPositions,
      translatedPositions,
    };
  }

  /**
   * Build original text position mapping optimized
   * @private
   */
  buildOriginalMapping(originalText, positions, usedIndices) {
    let currentPos = 0;

    while (currentPos < originalText.length) {
      let bestMatch = null;
      let bestLength = 0;

      // Find longest unused semantic unit at current position
      for (let i = 0; i < this.length; i++) {
        if (usedIndices.has(i)) continue;

        const unit = this.original[i];
        const remainingLength = originalText.length - currentPos;

        // Check if unit fits and matches
        if (unit.length <= remainingLength && unit.length > bestLength) {
          // Direct string comparison is faster than substring + startsWith
          let matches = true;
          for (let j = 0; j < unit.length; j++) {
            if (originalText[currentPos + j] !== unit[j]) {
              matches = false;
              break;
            }
          }

          if (matches) {
            bestMatch = { index: i, length: unit.length };
            bestLength = unit.length;
          }
        }
      }

      if (bestMatch) {
        // Fill positions for this match
        for (let j = 0; j < bestMatch.length; j++) {
          positions[currentPos + j] = bestMatch.index;
        }
        usedIndices.add(bestMatch.index);
        currentPos += bestMatch.length;
      } else {
        currentPos++;
      }
    }
  }

  /**
   * Build translated text position mapping optimized
   * @private
   */
  buildTranslatedMapping(translatedText, positions, usedIndices) {
    let currentPos = 0;
    const translatedLower = translatedText.toLowerCase(); // Cache lowercase version

    while (currentPos < translatedText.length) {
      let bestMatch = null;
      let bestLength = 0;

      // Find longest unused semantic unit at current position (case-insensitive)
      for (let i = 0; i < this.length; i++) {
        if (usedIndices.has(i)) continue;

        const unit = this.translated[i];
        const unitLower = unit.toLowerCase();
        const remainingLength = translatedText.length - currentPos;

        // Check if unit fits and matches (case-insensitive)
        if (unitLower.length <= remainingLength && unitLower.length > bestLength) {
          // Direct character comparison on lowercase strings
          let matches = true;
          for (let j = 0; j < unitLower.length; j++) {
            if (translatedLower[currentPos + j] !== unitLower[j]) {
              matches = false;
              break;
            }
          }

          if (matches) {
            bestMatch = { index: i, length: unit.length };
            bestLength = unit.length;
          }
        }
      }

      if (bestMatch) {
        // Fill positions for this match
        for (let j = 0; j < bestMatch.length; j++) {
          positions[currentPos + j] = bestMatch.index;
        }
        usedIndices.add(bestMatch.index);
        currentPos += bestMatch.length;
      } else {
        currentPos++;
      }
    }
  }

  /**
   * Get semantic arrays with lazy copying
   * @param {boolean} copy - Whether to create copies (default: true)
   * @returns {Object} Semantic arrays
   */
  getArrays(copy = true) {
    if (!copy) {
      // Return direct references for read-only access (dangerous but faster)
      return {
        original: this.original,
        translated: this.translated,
        metadata: this.metadata,
        length: this.length,
      };
    }

    // Create properly sized arrays (not pre-allocated size)
    const original = new Array(this.length);
    const translated = new Array(this.length);
    const metadata = new Array(this.length);

    // Copy only used elements
    for (let i = 0; i < this.length; i++) {
      original[i] = this.original[i];
      translated[i] = this.translated[i];
      // Reconstruct metadata with originalText/translatedText for compatibility
      metadata[i] = {
        ...this.metadata[i],
        originalText: this.original[i],
        translatedText: this.translated[i],
      };
    }

    return {
      original,
      translated,
      metadata,
    };
  }

  /**
   * Update with capitalized text using cached regex patterns
   * @param {string} finalText - The final capitalized text
   */
  updateWithCapitalizedText(finalText) {
    if (!finalText || this.length === 0) return;

    const snapshot = getMemorySnapshot();

    for (let i = 0; i < this.length; i++) {
      const originalTranslation = this.translated[i];

      // Skip if empty
      if (!originalTranslation || originalTranslation.length === 0) continue;

      // Use cached regex pattern
      const regex = this.getCachedRegex(originalTranslation);
      const matches = [...finalText.matchAll(regex)];

      if (matches.length > 0) {
        // Find best capitalized match
        let bestMatch = originalTranslation;

        for (const match of matches) {
          const matchText = match[0];
          // If different and capitalized, prefer it
          if (matchText !== originalTranslation && this.uppercasePattern.test(matchText)) {
            bestMatch = matchText;
            break;
          }
        }

        // Update if we found better version
        if (bestMatch !== originalTranslation) {
          this.translated[i] = bestMatch;
          // metadata[i] will get updated originalText/translatedText in getArrays()
        }
      }
    }

    releaseMemorySnapshot(snapshot);
  }

  /**
   * Get cached regex pattern or create and cache new one
   * @param {string} text - Text to create regex for
   * @returns {RegExp} Cached or new regex pattern
   * @private
   */
  getCachedRegex(text) {
    if (this.regexCache.has(text)) {
      this.stats.regexCacheHits++;
      return this.regexCache.get(text);
    }

    // Create new regex pattern
    const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedText, 'gi');

    // Cache it (with size limit)
    if (this.regexCache.size < this.maxCacheSize) {
      this.regexCache.set(text, regex);
    }

    this.stats.regexCacheMisses++;
    return regex;
  }

  /**
   * Get the actual number of semantic units
   * @returns {number} Number of semantic units
   */
  getLength() {
    return this.length;
  }

  /**
   * Check if arrays are properly aligned
   * @returns {boolean} True if arrays are properly aligned
   */
  isValid() {
    return (
      this.length <= this.original.length &&
      this.length <= this.translated.length &&
      this.length <= this.metadata.length
    );
  }

  /**
   * Get debug information including performance statistics
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    const memoryEfficiency =
      this.original.length > 0 ? ((this.length / this.original.length) * 100).toFixed(1) : 0;

    return {
      totalUnits: this.getLength(),
      allocatedCapacity: this.original.length,
      memoryEfficiency: `${memoryEfficiency}%`,
      isValid: this.isValid(),
      stats: this.stats,
      sources: this.metadata.slice(0, this.length).map((m) => m?.source || 'unknown'),
      regexCacheSize: this.regexCache.size,
      performance: {
        capacityResizes: this.stats.capacityResizes,
        regexHitRate:
          this.stats.regexCacheHits + this.stats.regexCacheMisses > 0
            ? (
                (this.stats.regexCacheHits /
                  (this.stats.regexCacheHits + this.stats.regexCacheMisses)) *
                100
              ).toFixed(1)
            : 0,
      },
    };
  }

  /**
   * Get memory usage statistics
   * @returns {Object} Memory usage information
   */
  getMemoryStats() {
    const elementSize = 8; // Approximate bytes per array element
    const stringMemory =
      this.original.slice(0, this.length).reduce((sum, str) => sum + (str?.length || 0) * 2, 0) + // Original strings (UTF-16)
      this.translated.slice(0, this.length).reduce((sum, str) => sum + (str?.length || 0) * 2, 0); // Translated strings

    const arrayMemory = this.original.length * elementSize * 3; // 3 arrays
    const metadataMemory = this.length * 32; // Approximate metadata object size
    const regexCacheMemory = this.regexCache.size * 100; // Approximate regex size

    return {
      totalEstimated: stringMemory + arrayMemory + metadataMemory + regexCacheMemory,
      strings: stringMemory,
      arrays: arrayMemory,
      metadata: metadataMemory,
      regexCache: regexCacheMemory,
      wastedCapacity: (this.original.length - this.length) * elementSize * 3,
    };
  }

  /**
   * Compact arrays to remove unused capacity
   */
  compact() {
    if (this.original.length <= this.length) return;

    const compactOriginal = new Array(this.length);
    const compactTranslated = new Array(this.length);
    const compactMetadata = new Array(this.length);

    for (let i = 0; i < this.length; i++) {
      compactOriginal[i] = this.original[i];
      compactTranslated[i] = this.translated[i];
      compactMetadata[i] = this.metadata[i];
    }

    this.original = compactOriginal;
    this.translated = compactTranslated;
    this.metadata = compactMetadata;

    batchLog.info(
      'semantic-compact',
      `Compacted arrays from ${this.original.length} to ${this.length} capacity`
    );
  }
}

/**
 * Factory function to create builder with estimated capacity
 * @param {number} estimatedCapacity - Expected number of semantic units
 * @returns {OptimizedSemanticArrayBuilder} New builder instance
 */
export function createOptimizedSemanticBuilder(estimatedCapacity) {
  return new OptimizedSemanticArrayBuilder(estimatedCapacity);
}

export default OptimizedSemanticArrayBuilder;
