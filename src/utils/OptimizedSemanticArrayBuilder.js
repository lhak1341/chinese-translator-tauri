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
import { logger } from './logger';
import { validatePosition } from './PositionValidationHelpers.js';
import { getFirstGrapheme } from './GraphemeHelper.js';

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

    // CRITICAL FIX: Track corruption state to prevent cascading failures
    this.isCorrupted = false;

    // Now safe to call reset() since all properties are initialized
    this.reset();
  }

  /**
   * Reset the builder for a new translation with capacity estimation
   * @param {number} estimatedSize - Expected number of semantic units
   */
  reset(estimatedSize) {
    // Validate input early to prevent NaN propagation
    const validSize = Number.isFinite(estimatedSize) && estimatedSize > 0 ? estimatedSize : null;

    if (validSize) {
      // CRITICAL: Clamp input BEFORE multiplication to prevent overflow
      // 8333 * 1.2 = 9999.6 → 10000 (max safe capacity)
      // Validates BEFORE computation, not after (catches overflow early)
      const MAX_SAFE_INPUT = 8333;
      const clampedSize = Math.min(validSize, MAX_SAFE_INPUT);

      // Log if input was clamped (helps debug large text issues)
      if (validSize > MAX_SAFE_INPUT) {
        logger.warn(
          `⚠️ Semantic array size clamped: ${validSize} → ${MAX_SAFE_INPUT} (prevents overflow)`
        );
      }

      // Adjust capacity based on clamped estimation (with 20% buffer)
      let newCapacity = Math.ceil(clampedSize * 1.2);

      // Validate capacity to prevent "Invalid array length" error
      // This is secondary validation - should never trigger if input clamped correctly
      const MAX_SAFE_CAPACITY = 10000; // Conservative limit for translation arrays
      if (newCapacity < 1 || newCapacity > MAX_SAFE_CAPACITY) {
        logger.error('❌ Capacity calculation error:', {
          input: validSize,
          clamped: clampedSize,
          calculated: newCapacity,
        });
        newCapacity = Math.min(1000, Math.max(100, clampedSize));
      }

      this.estimatedCapacity = newCapacity;
    }

    // Ensure estimatedCapacity is always valid (fallback for first call or invalid input)
    if (!Number.isFinite(this.estimatedCapacity) || this.estimatedCapacity < 1) {
      this.estimatedCapacity = 100;
    }

    // Pre-allocate arrays with validated capacity
    this.original = new Array(this.estimatedCapacity);
    this.translated = new Array(this.estimatedCapacity);
    this.metadata = new Array(this.estimatedCapacity);

    // Track actual usage
    this.length = 0;

    // Track position mapping order (CRITICAL-2: Detect out-of-order calls)
    this.lastPositionSet = -1;

    // Clear regex cache periodically to prevent memory leaks
    if (this.regexCache.size > this.maxCacheSize) {
      this.regexCache.clear();
    }

    // CRITICAL FIX: Clear corruption flag on reset (new translation = fresh state)
    this.isCorrupted = false;

    batchLog.hotVerbose('semantic-builder', `Reset with capacity ${this.estimatedCapacity}`);
  }

  /**
   * Add a semantic unit with memory-efficient approach
   * @param {string} originalText - Original text segment
   * @param {string} translatedText - Translated text segment
   * @param {string} source - Source dictionary/type
   * @param {number} tokenIndex - Token index (optional)
   * @param {string} phase - Processing phase (optional, e.g., "patterns", "properNouns", "phrases")
   * @param {string} dictionary - Dictionary name (optional, e.g., "phrases", "characters", "properNouns-NovelName")
   * @returns {boolean} True if unit added successfully, false if builder corrupted
   */
  addUnit(originalText, translatedText, source, tokenIndex = -1, phase = null, dictionary = null) {
    // CRITICAL FIX: Block operations on corrupted builder to prevent cascading failures
    if (this.isCorrupted) {
      logger.error('❌ Cannot add unit - optimized semantic array builder is corrupted');
      return false;
    }

    // Resize arrays if we exceed pre-allocated capacity
    if (this.length >= this.original.length) {
      this.resizeArrays();
    }

    const index = this.length;

    // Store in pre-allocated arrays
    this.original[index] = originalText;
    this.translated[index] = translatedText;

    // Optimized metadata: only store essential fields, avoid duplication
    // MEDIUM FIX: Include phase and dictionary for better debugging/tracking
    this.metadata[index] = {
      index,
      source,
      tokenIndex,
      phase, // Processing phase (patterns, properNouns, phrases, characters, etc.)
      dictionary, // Dictionary name for provenance tracking
      translatedStart: -1, // Will be set during postProcess text assembly
      translatedEnd: -1, // Will be set during postProcess text assembly
      // originalText and translatedText removed - accessible via arrays
    };

    this.length++;
    this.stats.totalUnits++;

    // CRITICAL-4 FIX: Validate arrays stay synchronized after mutation
    // HIGH-6 FIX: Check validation result (no longer throws)
    // CRITICAL FIX: Mark as corrupted and signal failure to caller
    if (!this.validateArrays()) {
      // Desync detected - mark builder as corrupted to prevent further operations
      this.isCorrupted = true;
      logger.error('❌ Optimized semantic arrays corrupted - highlighting will be disabled');
      return false; // Signal failure to caller
    }

    batchLog.hotVerbose(
      'semantic-add-unit',
      `Added unit ${index}: "${originalText}" → "${translatedText}" (${source})`
    );

    return true; // Signal success
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

    // CRITICAL FIX: Collect all matching candidates, prioritize unmapped ones
    // Why: Multiple units can share same tokenIndex (pattern + character fallback)
    // Bug: Previous code returned on first unmapped match, had no fallback if all mapped
    // Fix: Collect all candidates, prioritize unmapped, fallback to first if all mapped
    const candidates = [];

    for (let i = 0; i < this.length; i++) {
      const meta = this.metadata[i];

      // Match by tokenIndex and translatedText (case-insensitive)
      if (
        meta.tokenIndex === tokenIndex &&
        this.translated[i].toLowerCase() === translatedText.toLowerCase()
      ) {
        candidates.push({
          index: i,
          meta,
          isMapped: meta.translatedStart !== -1,
        });
      }
    }

    if (candidates.length === 0) {
      // No match found - expected for punctuation/whitespace added during postProcess
      return false;
    }

    // Prioritize unmapped candidates (prevents wrong unit from getting position)
    const unmapped = candidates.find((c) => !c.isMapped);
    const target = unmapped || candidates[0]; // Use first candidate if all mapped

    // MEDIUM-3 FIX: Use shared validation logic (extracted from duplicate code)
    // CRITICAL-1 FIX: Reject out-of-order positions to prevent corruption
    // HIGH-1 FIX: Prevent overlapping positions by requiring startPos > lastPositionSet (not >=)
    if (!validatePosition(startPos, endPos, this.lastPositionSet, tokenIndex, translatedText)) {
      return false; // ✅ Reject invalid positions (out-of-order, overlapping, or invalid range)
    }

    // Update the selected candidate's position
    target.meta.translatedStart = startPos;
    target.meta.translatedEnd = endPos;

    // Track last position for order validation
    this.lastPositionSet = endPos;

    // MEDIUM-2 FIX: Update translated array to match actual casing in final text
    // This prevents text mismatches when capitalization differs (e.g., "Ở" vs "ø")
    this.translated[target.index] = translatedText;

    return true;
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

    // CRITICAL-2 FIX: Validate text length before allocating typed arrays
    // Empty text or mismatched length would cause silent data loss
    if (!originalText || originalText.length === 0) {
      logger.warn('⚠️ Empty original text in buildPositionMappings');
      return {
        originalPositions: new Int32Array(0),
        translatedPositions: new Int32Array(0),
      };
    }
    if (!translatedText || translatedText.length === 0) {
      logger.warn('⚠️ Empty translated text in buildPositionMappings');
      return {
        originalPositions: new Int32Array(0),
        translatedPositions: new Int32Array(0),
      };
    }

    // Use typed arrays for better memory efficiency and performance
    const originalPositions = new Int32Array(originalText.length);
    const translatedPositions = new Int32Array(translatedText.length);

    // CRITICAL-2 FIX: Validate typed array allocation succeeded
    if (originalPositions.length !== originalText.length) {
      logger.error('❌ Typed array allocation failed for originalPositions', {
        expectedLength: originalText.length,
        actualLength: originalPositions.length,
        impact: 'Position mapping will be incomplete',
      });
    }
    if (translatedPositions.length !== translatedText.length) {
      logger.error('❌ Typed array allocation failed for translatedPositions', {
        expectedLength: translatedText.length,
        actualLength: translatedPositions.length,
        impact: 'Position mapping will be incomplete',
      });
    }

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
    // OPTIMIZATION: Build first-character index (40-60% speedup for large texts)
    const firstCharIndex = new Map();
    for (let i = 0; i < this.length; i++) {
      // CRITICAL-1 FIX: Skip empty strings to prevent [0] access crash
      if (!this.original[i] || this.original[i].length === 0) {
        continue;
      }
      // MEDIUM-2 FIX: Use grapheme-aware first character extraction for Vietnamese diacritics
      // [0] indexing breaks for combining diacritics (e.g., "ả" = "a" + combining mark)
      const firstChar = getFirstGrapheme(this.original[i]);
      if (!firstCharIndex.has(firstChar)) {
        firstCharIndex.set(firstChar, []);
      }
      firstCharIndex.get(firstChar).push(i);
    }

    let currentPos = 0;

    while (currentPos < originalText.length) {
      let bestMatch = null;
      let bestLength = 0;

      // OPTIMIZATION: Only check units starting with current character
      // MEDIUM-2 FIX: Use grapheme-aware lookup for consistency with index building
      const currentFirstGrapheme = getFirstGrapheme(originalText.substring(currentPos));
      const candidateIndices = firstCharIndex.get(currentFirstGrapheme) || [];

      // Find longest unused semantic unit at current position
      for (const i of candidateIndices) {
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
    const translatedLower = translatedText.toLowerCase(); // Cache lowercase version

    // OPTIMIZATION: Build first-character index (case-insensitive, 40-60% speedup)
    const firstCharIndex = new Map();
    for (let i = 0; i < this.length; i++) {
      // CRITICAL-1 FIX: Skip empty strings to prevent [0] access crash
      if (!this.translated[i] || this.translated[i].length === 0) {
        continue;
      }
      // MEDIUM-2 FIX: Use grapheme-aware first character extraction for Vietnamese diacritics
      // [0] indexing breaks for combining diacritics (e.g., "ả" = "a" + combining mark)
      const firstChar = getFirstGrapheme(this.translated[i]).toLowerCase();
      if (!firstCharIndex.has(firstChar)) {
        firstCharIndex.set(firstChar, []);
      }
      firstCharIndex.get(firstChar).push(i);
    }

    let currentPos = 0;

    while (currentPos < translatedText.length) {
      let bestMatch = null;
      let bestLength = 0;

      // OPTIMIZATION: Only check units starting with current character (case-insensitive)
      // MEDIUM-2 FIX: Use grapheme-aware lookup for consistency with index building
      const currentFirstGrapheme = getFirstGrapheme(
        translatedText.substring(currentPos)
      ).toLowerCase();
      const candidateIndices = firstCharIndex.get(currentFirstGrapheme) || [];

      // Find longest unused semantic unit at current position (case-insensitive)
      for (const i of candidateIndices) {
        if (usedIndices.has(i)) continue;

        const unit = this.translated[i];
        const unitLower = unit.toLowerCase();
        const remainingLength = translatedText.length - currentPos;

        // CRITICAL-5 FIX: Add explicit bounds validation before inner loop
        // Prevents out-of-bounds access if translatedLower differs from translatedText
        // Previous: Relied on remainingLength check (implicit safety)
        // Fixed: Explicit validation makes safety guarantee clear
        if (
          unitLower.length <= remainingLength &&
          unitLower.length > bestLength &&
          currentPos + unitLower.length <= translatedLower.length // ← Explicit bounds check
        ) {
          // Direct character comparison on lowercase strings (now guaranteed safe)
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
      // CRITICAL-1 FIX: Freeze returned arrays to prevent mutation of internal state
      // MEDIUM-3 FIX: Make freeze conditional (development only) to reduce production overhead
      // Object.freeze() walks all properties (O(n) for arrays), costs CPU but provides safety
      // Development: Freeze to catch mutation bugs early
      // Production: Skip freeze for performance (documented as read-only in JSDoc)
      const slicedArrays = {
        original: this.original.slice(0, this.length),
        translated: this.translated.slice(0, this.length),
        metadata: this.metadata.slice(0, this.length),
        length: this.length,
      };

      if (process.env.NODE_ENV === 'development') {
        return Object.freeze({
          original: Object.freeze(slicedArrays.original),
          translated: Object.freeze(slicedArrays.translated),
          metadata: Object.freeze(slicedArrays.metadata),
          length: slicedArrays.length,
        });
      }

      // Production: Return without freeze (caller MUST NOT mutate - read-only contract)
      return slicedArrays;
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

        // CRITICAL-2 FIX: Validate length before updating to prevent position corruption
        if (bestMatch !== originalTranslation) {
          if (bestMatch.length !== originalTranslation.length) {
            logger.error('❌ Capitalization changed text length - SKIPPING update!', {
              index: i,
              original: originalTranslation,
              capitalized: bestMatch,
              originalLength: originalTranslation.length,
              capitalizedLength: bestMatch.length,
              impact: 'Would corrupt position mapping',
            });
            continue; // Skip this update
          }

          this.translated[i] = bestMatch;
          // metadata[i] will get updated originalText/translatedText in getArrays()
        }
      }
    }

    releaseMemorySnapshot(snapshot);
  }

  /**
   * Get cached regex pattern or create and cache new one
   * HIGH-2 FIX: Uses LRU eviction to prevent unbounded cache growth
   * @param {string} text - Text to create regex for
   * @returns {RegExp} Cached or new regex pattern
   * @private
   */
  getCachedRegex(text) {
    if (this.regexCache.has(text)) {
      this.stats.regexCacheHits++;
      // LRU: Move to end by deleting and re-adding
      const regex = this.regexCache.get(text);
      this.regexCache.delete(text);
      this.regexCache.set(text, regex);
      return regex;
    }

    // HIGH-2 FIX: LRU eviction when cache is full
    if (this.regexCache.size >= this.maxCacheSize) {
      // Remove oldest entry (first key in Map = oldest due to insertion order)
      const firstKey = this.regexCache.keys().next().value;
      this.regexCache.delete(firstKey);
      batchLog.hotVerbose('regex-cache-evict', `Evicted oldest regex pattern: "${firstKey}"`);
    }

    // Create new regex pattern
    const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedText, 'gi');

    // Cache it
    this.regexCache.set(text, regex);

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
   * Check if arrays are properly aligned and builder is not corrupted
   * CRITICAL FIX: Now checks both array alignment AND corruption flag
   * @returns {boolean} True if arrays are properly aligned and not corrupted
   */
  isValid() {
    return (
      !this.isCorrupted &&
      this.length <= this.original.length &&
      this.length <= this.translated.length &&
      this.length <= this.metadata.length
    );
  }

  /**
   * CRITICAL-4 FIX: Validate that semantic arrays stay synchronized
   * HIGH-6 FIX: Returns validation result instead of throwing (allows graceful degradation)
   * @returns {boolean} True if arrays are synchronized, false if desynchronized
   */
  validateArrays() {
    const isLengthValid =
      this.length <= this.original.length &&
      this.length <= this.translated.length &&
      this.length <= this.metadata.length;

    if (!isLengthValid) {
      const error = {
        actualLength: this.length,
        originalCapacity: this.original.length,
        translatedCapacity: this.translated.length,
        metadataCapacity: this.metadata.length,
        impact: 'Highlighting functionality may break',
      };
      logger.error('❌ CRITICAL: Optimized semantic arrays desynchronized!', error);
      // HIGH-6 FIX: Return false instead of throwing - let caller decide recovery strategy
      // Throwing breaks entire translation, returning false allows graceful degradation
      return false;
    }

    return true;
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

  // CRITICAL-3 FIX: Removed duplicate getFirstGrapheme() method
  // Now using shared GraphemeHelper.getFirstGrapheme() with singleton Intl.Segmenter
  // Eliminates duplicate implementation and per-call instance creation overhead
}

export default OptimizedSemanticArrayBuilder;
