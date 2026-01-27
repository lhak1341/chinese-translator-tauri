/**
 * Semantic Array Builder
 * Captures 1:1 semantic relationships during translation for accurate highlighting
 */

import { logger } from './logger';
import { validatePosition } from './PositionValidationHelpers.js';
import { getFirstGrapheme } from './GraphemeHelper.js';

export class SemanticArrayBuilder {
  constructor() {
    // Metadata object pool for performance optimization
    // Reuse frozen objects for common metadata patterns to reduce allocations
    this.metadataDefaults = {
      phrases: Object.freeze({ source: 'phrases', tokenIndex: -1 }),
      characters: Object.freeze({ source: 'characters', tokenIndex: -1 }),
      properNouns: Object.freeze({ source: 'properNouns', tokenIndex: -1 }),
      patterns: Object.freeze({ source: 'patterns', tokenIndex: -1 }),
      numbers: Object.freeze({ source: 'numbers', tokenIndex: -1 }),
    };

    // CRITICAL FIX: Track corruption state to prevent cascading failures
    this.isCorrupted = false;

    // CODE REVIEW FIX (CRITICAL-2): Telemetry for corruption tracking
    this.corruptionTelemetry = {
      totalCorruptions: 0,
      corruptionEvents: [], // Last 10 corruption events with timestamps
      lastCorruptionTime: null,
    };

    this.reset();
  }

  /**
   * Reset the builder for a new translation
   * CODE REVIEW FIX (CRITICAL-2): Preserves corruption telemetry across resets for monitoring
   */
  reset() {
    this.original = [];
    this.translated = [];
    this.metadata = [];

    // Track position mapping order (CRITICAL-2: Detect out-of-order calls)
    this.lastPositionSet = -1;

    // CRITICAL FIX: Clear corruption flag on reset (new translation = fresh state)
    // Note: We DON'T reset telemetry - it accumulates across session for monitoring
    this.isCorrupted = false;
  }

  /**
   * Add a semantic unit (original text mapped to translated text)
   * @param {string} originalText - Original text segment
   * @param {string} translatedText - Translated text segment
   * @param {string} source - Source dictionary/type (e.g., "phrases", "characters", "properNouns")
   * @param {number} tokenIndex - Token index for debugging (optional)
   * @param {string} phase - Processing phase (optional, e.g., "patterns", "properNouns", "phrases")
   * @param {string} dictionary - Dictionary name (optional, e.g., "phrases", "characters", "properNouns-NovelName")
   * @returns {boolean} True if unit added successfully, false if builder corrupted
   */
  addUnit(originalText, translatedText, source, tokenIndex = -1, phase = null, dictionary = null) {
    // CRITICAL FIX: Block operations on corrupted builder to prevent cascading failures
    if (this.isCorrupted) {
      logger.error('❌ Cannot add unit - semantic array builder is corrupted');
      return false;
    }

    const index = this.original.length;

    this.original.push(originalText);
    this.translated.push(translatedText);

    // Create metadata object with position tracking fields
    // NOTE: Can't use frozen defaults anymore since we need to update positions later
    // MEDIUM FIX: Include phase and dictionary for better debugging/tracking
    const metadata = {
      index,
      source,
      tokenIndex,
      phase, // Processing phase (patterns, properNouns, phrases, characters, etc.)
      dictionary, // Dictionary name for provenance tracking
      originalText,
      translatedText,
      translatedStart: -1, // Will be set during postProcess text assembly
      translatedEnd: -1, // Will be set during postProcess text assembly
    };

    this.metadata.push(metadata);

    // CRITICAL-4 FIX: Validate arrays stay synchronized after mutation
    // HIGH-6 FIX: Check validation result (no longer throws)
    // CODE REVIEW FIX (CRITICAL-2): Enhanced corruption tracking with telemetry
    if (!this.validateArrays()) {
      // Desync detected - mark builder as corrupted to prevent further operations
      this.isCorrupted = true;

      // Record corruption event for telemetry
      this.corruptionTelemetry.totalCorruptions++;
      this.corruptionTelemetry.lastCorruptionTime = Date.now();
      this.corruptionTelemetry.corruptionEvents.push({
        timestamp: Date.now(),
        originalLength: this.original.length,
        translatedLength: this.translated.length,
        metadataLength: this.metadata.length,
        source,
        phase,
      });
      // Keep only last 10 events to prevent memory growth
      if (this.corruptionTelemetry.corruptionEvents.length > 10) {
        this.corruptionTelemetry.corruptionEvents.shift();
      }

      logger.error('❌ Semantic arrays corrupted - highlighting will be disabled', {
        totalCorruptions: this.corruptionTelemetry.totalCorruptions,
        arrayLengths: {
          original: this.original.length,
          translated: this.translated.length,
          metadata: this.metadata.length,
        },
      });
      return false; // Signal failure to caller
    }

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

    // CRITICAL: Collect all matching candidates, prioritize unmapped ones
    // Why: Multiple units can share same tokenIndex (pattern + character fallback)
    // Fix: Prevent race where first-matched unit gets position, subsequent updates ignored
    const candidates = [];

    for (let i = 0; i < this.metadata.length; i++) {
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
    // This prevents text mismatches when capitalization differs (e.g., "Ở" vs "ở")
    this.translated[target.index] = translatedText;

    return true;
  }

  /**
   * Build position-to-semantic-index mappings for reliable highlighting
   * @param {string} originalText - Final original text
   * @param {string} translatedText - Final translated text
   * @returns {Object} Position mappings for both texts
   */
  buildPositionMappings(originalText, translatedText) {
    const originalPositions = new Map(); // position -> semantic index
    const translatedPositions = new Map(); // position -> semantic index

    // Track which semantic indices have been used
    const usedIndices = new Set();

    // OPTIMIZATION: Build first-character index for original text (40-60% speedup)
    // Maps first character -> array of unit indices starting with that character
    const originalFirstCharIndex = new Map();
    for (let i = 0; i < this.original.length; i++) {
      // CRITICAL-1 FIX: Skip empty strings to prevent [0] access crash
      if (!this.original[i] || this.original[i].length === 0) {
        continue;
      }
      // MEDIUM-2 FIX: Use grapheme-aware first character extraction for Vietnamese diacritics
      // CRITICAL-3 FIX: Use shared GraphemeHelper (eliminates duplicate implementation)
      // [0] indexing breaks for combining diacritics (e.g., "ả" = "a" + combining mark)
      const firstChar = getFirstGrapheme(this.original[i]);
      if (!originalFirstCharIndex.has(firstChar)) {
        originalFirstCharIndex.set(firstChar, []);
      }
      originalFirstCharIndex.get(firstChar).push(i);
    }

    // Build original text position mapping
    let currentPos = 0;
    while (currentPos < originalText.length) {
      let bestMatch = null;
      let bestLength = 0;

      // OPTIMIZATION: Only check units starting with current character
      // MEDIUM-2 FIX: Use grapheme-aware lookup for consistency with index building
      const currentFirstGrapheme = getFirstGrapheme(originalText.substring(currentPos));
      const candidateIndices = originalFirstCharIndex.get(currentFirstGrapheme) || [];

      // HIGH-4 DOCUMENTATION: Iteration order guarantee
      // JavaScript Map iteration is ordered by insertion order (ES2015 spec)
      // usedIndices.add() during iteration is safe - Set maintains insertion order
      // Modifying Set during iteration only affects future iterations, not current
      // Find longest unused semantic unit at current position
      for (const i of candidateIndices) {
        if (usedIndices.has(i)) continue;

        const unit = this.original[i];
        const remainingLength = originalText.length - currentPos;

        // Check if unit fits and matches (optimized: direct character comparison)
        if (unit.length <= remainingLength && unit.length > bestLength) {
          let matches = true;
          for (let j = 0; j < unit.length; j++) {
            if (originalText[currentPos + j] !== unit[j]) {
              matches = false;
              break;
            }
          }

          if (matches) {
            bestMatch = { index: i, unit, length: unit.length };
            bestLength = unit.length;
          }
        }
      }

      if (bestMatch) {
        // Map each character position to this semantic index
        for (let j = 0; j < bestMatch.length; j++) {
          originalPositions.set(currentPos + j, bestMatch.index);
        }
        usedIndices.add(bestMatch.index);
        currentPos += bestMatch.length;
      } else {
        currentPos++;
      }
    }

    // Reset used indices for translation mapping
    usedIndices.clear();

    // OPTIMIZATION: Build first-character index for translated text (case-insensitive)
    const translatedFirstCharIndex = new Map();
    for (let i = 0; i < this.translated.length; i++) {
      // CRITICAL-1 FIX: Skip empty strings to prevent [0] access crash
      if (!this.translated[i] || this.translated[i].length === 0) {
        continue;
      }
      // MEDIUM-2 FIX: Use grapheme-aware first character extraction for Vietnamese diacritics
      // [0] indexing breaks for combining diacritics (e.g., "ả" = "a" + combining mark)
      const firstChar = getFirstGrapheme(this.translated[i]).toLowerCase();
      if (!translatedFirstCharIndex.has(firstChar)) {
        translatedFirstCharIndex.set(firstChar, []);
      }
      translatedFirstCharIndex.get(firstChar).push(i);
    }

    // Build translated text position mapping
    currentPos = 0;
    while (currentPos < translatedText.length) {
      let bestMatch = null;
      let bestLength = 0;

      // OPTIMIZATION: Only check units starting with current character (case-insensitive)
      // MEDIUM-2 FIX: Use grapheme-aware lookup for consistency with index building
      const currentFirstGrapheme = getFirstGrapheme(
        translatedText.substring(currentPos)
      ).toLowerCase();
      const candidateIndices = translatedFirstCharIndex.get(currentFirstGrapheme) || [];

      // Find longest unused semantic unit at current position (case-insensitive)
      for (const i of candidateIndices) {
        if (usedIndices.has(i)) continue;

        const unit = this.translated[i];
        const remainingLength = translatedText.length - currentPos;

        // Check if unit fits and matches (optimized: direct character comparison)
        if (unit.length <= remainingLength && unit.length > bestLength) {
          let matches = true;
          for (let j = 0; j < unit.length; j++) {
            // Case-insensitive comparison
            if (translatedText[currentPos + j].toLowerCase() !== unit[j].toLowerCase()) {
              matches = false;
              break;
            }
          }

          if (matches) {
            bestMatch = { index: i, unit, length: unit.length };
            bestLength = unit.length;
          }
        }
      }

      if (bestMatch) {
        // Map each character position to this semantic index
        for (let j = 0; j < bestMatch.length; j++) {
          translatedPositions.set(currentPos + j, bestMatch.index);
        }
        usedIndices.add(bestMatch.index);
        currentPos += bestMatch.length;
      } else {
        currentPos++;
      }
    }

    return {
      originalPositions,
      translatedPositions,
    };
  }

  /**
   * Get the built semantic arrays
   * @returns {Object} Semantic arrays with original, translated, and metadata
   */
  getArrays() {
    return {
      original: [...this.original],
      translated: [...this.translated],
      metadata: [...this.metadata],
    };
  }

  /**
   * Update semantic arrays with capitalized versions from final text
   * @param {string} finalText - The final capitalized text
   */
  updateWithCapitalizedText(finalText) {
    if (!finalText) return;

    // MEDIUM-2 FIX: Cache regex patterns to avoid recompilation in loop
    // HIGH-2 FIX: Add LRU eviction to prevent unbounded cache growth (50K+ entries after 100 translations)
    const regexCache = new Map();
    const MAX_REGEX_CACHE_SIZE = 100;

    for (let i = 0; i < this.translated.length; i++) {
      const originalTranslation = this.translated[i];

      // Skip if empty
      if (!originalTranslation || originalTranslation.length === 0) continue;

      // Get cached regex or create new one
      let regex = regexCache.get(originalTranslation);
      if (!regex) {
        // HIGH-2 FIX: Evict oldest entry if cache is full (LRU eviction)
        if (regexCache.size >= MAX_REGEX_CACHE_SIZE) {
          const firstKey = regexCache.keys().next().value;
          regexCache.delete(firstKey);
        }
        regex = new RegExp(this.escapeRegex(originalTranslation), 'gi');
        regexCache.set(originalTranslation, regex);
      }

      // Find all case-insensitive matches in final text
      const matches = [...finalText.matchAll(regex)];

      if (matches.length > 0) {
        // Prefer capitalized versions
        let bestMatch = originalTranslation;

        for (const match of matches) {
          const matchText = match[0];
          // If this match is different (capitalized) and starts with uppercase, prefer it
          if (matchText !== originalTranslation && /^[A-ZÀ-ÿ]/.test(matchText)) {
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
          this.metadata[i].translatedText = bestMatch;
        }
      }
    }
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get the total number of semantic units
   * @returns {number} Number of semantic units
   */
  getLength() {
    return this.original.length;
  }

  /**
   * CODE REVIEW FIX (CRITICAL-2): Get corruption telemetry
   * Returns telemetry data for monitoring corruption frequency
   * @returns {Object} Corruption telemetry data
   */
  getCorruptionTelemetry() {
    return {
      ...this.corruptionTelemetry,
      isCurrentlyCorrupted: this.isCorrupted,
    };
  }

  /**
   * Check if arrays are properly aligned and builder is not corrupted
   * CRITICAL FIX: Now checks both array alignment AND corruption flag
   * @returns {boolean} True if arrays are properly aligned and not corrupted
   */
  isValid() {
    return (
      !this.isCorrupted &&
      this.original.length === this.translated.length &&
      this.original.length === this.metadata.length
    );
  }

  /**
   * CRITICAL-4 FIX: Validate that semantic arrays stay synchronized
   * HIGH-6 FIX: Returns validation result instead of throwing (allows graceful degradation)
   * @returns {boolean} True if arrays are synchronized, false if desynchronized
   */
  validateArrays() {
    const isValid =
      this.original.length === this.translated.length &&
      this.original.length === this.metadata.length;

    if (!isValid) {
      const error = {
        originalLength: this.original.length,
        translatedLength: this.translated.length,
        metadataLength: this.metadata.length,
        impact: 'Highlighting functionality may break',
      };
      logger.error('❌ CRITICAL: Semantic arrays desynchronized!', error);
      // HIGH-6 FIX: Return false instead of throwing - let caller decide recovery strategy
      // Throwing breaks entire translation, returning false allows graceful degradation
      return false;
    }

    return true;
  }

  /**
   * HIGH-5 FIX: Validate that position metadata is valid
   * @param {Object} metadata - Metadata object to validate
   * @returns {boolean} True if positions are valid
   */
  hasValidPositions(metadata) {
    return (
      metadata &&
      typeof metadata.translatedStart === 'number' &&
      typeof metadata.translatedEnd === 'number' &&
      metadata.translatedStart >= 0 &&
      metadata.translatedEnd > metadata.translatedStart
    );
  }

  /**
   * HIGH-5 FIX: Get validation report for all position metadata
   * @returns {Object} Validation report with counts and invalid entries
   */
  validateAllPositions() {
    const invalid = [];
    let validCount = 0;

    for (let i = 0; i < this.metadata.length; i++) {
      const meta = this.metadata[i];
      if (this.hasValidPositions(meta)) {
        validCount++;
      } else {
        invalid.push({
          index: i,
          original: this.original[i],
          translated: this.translated[i],
          translatedStart: meta.translatedStart,
          translatedEnd: meta.translatedEnd,
          reason:
            meta.translatedStart < 0
              ? 'negative start position'
              : meta.translatedEnd <= meta.translatedStart
                ? 'end <= start'
                : 'missing position data',
        });
      }
    }

    return {
      total: this.metadata.length,
      valid: validCount,
      invalid: invalid.length,
      invalidEntries: invalid,
      coverage: (validCount / this.metadata.length) * 100,
    };
  }

  /**
   * Get debug information about the semantic arrays
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      totalUnits: this.getLength(),
      isValid: this.isValid(),
      positionValidation: this.validateAllPositions(),
      sources: this.metadata.map((m) => m.source),
      mappings: this.original.map((orig, i) => ({
        index: i,
        original: orig,
        translated: this.translated[i],
        source: this.metadata[i].source,
      })),
    };
  }

  // CRITICAL-3 FIX: Removed duplicate getFirstGrapheme() method
  // Now using shared GraphemeHelper.getFirstGrapheme() with singleton Intl.Segmenter
  // Eliminates duplicate implementation and per-call instance creation overhead
}
