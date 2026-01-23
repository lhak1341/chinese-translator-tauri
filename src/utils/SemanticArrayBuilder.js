/**
 * Semantic Array Builder
 * Captures 1:1 semantic relationships during translation for accurate highlighting
 */

import { logger } from './logger';

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

    this.reset();
  }

  /**
   * Reset the builder for a new translation
   */
  reset() {
    this.original = [];
    this.translated = [];
    this.metadata = [];

    // Track position mapping order (CRITICAL-2: Detect out-of-order calls)
    this.lastPositionSet = -1;
  }

  /**
   * Add a semantic unit (original text mapped to translated text)
   * @param {string} originalText - Original text segment
   * @param {string} translatedText - Translated text segment
   * @param {string} source - Source dictionary/type (e.g., "phrases", "characters", "properNouns")
   * @param {number} tokenIndex - Token index for debugging (optional)
   */
  addUnit(originalText, translatedText, source, tokenIndex = -1) {
    const index = this.original.length;

    this.original.push(originalText);
    this.translated.push(translatedText);

    // Create metadata object with position tracking fields
    // NOTE: Can't use frozen defaults anymore since we need to update positions later
    const metadata = {
      index,
      source,
      tokenIndex,
      originalText,
      translatedText,
      translatedStart: -1, // Will be set during postProcess text assembly
      translatedEnd: -1, // Will be set during postProcess text assembly
    };

    this.metadata.push(metadata);

    // CRITICAL-4 FIX: Validate arrays stay synchronized after mutation
    this.validateArrays();
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

    // CRITICAL-1 FIX: Reject out-of-order positions to prevent corruption
    // setPositionByMatch MUST be called in ascending position order during postProcess
    if (this.lastPositionSet !== -1 && startPos < this.lastPositionSet) {
      logger.error('❌ setPositionByMatch called out of order - REJECTING!', {
        tokenIndex,
        translatedText,
        expectedOrder: 'ascending positions',
        previousPos: this.lastPositionSet,
        currentPos: startPos,
        violation: 'Position decreased',
        impact: 'Rejected to prevent bidirectional highlighting corruption',
      });
      return false; // ✅ Reject out-of-order positions
    }

    // Validate position range
    if (startPos < 0 || endPos <= startPos) {
      logger.error('❌ Invalid position range - REJECTING!', {
        tokenIndex,
        translatedText,
        startPos,
        endPos,
        violation: 'startPos must be >= 0 and endPos must be > startPos',
      });
      return false;
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
      const firstChar = this.original[i][0];
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
      const candidateIndices = originalFirstCharIndex.get(originalText[currentPos]) || [];

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
      const firstChar = this.translated[i][0].toLowerCase();
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
      const currentCharLower = translatedText[currentPos].toLowerCase();
      const candidateIndices = translatedFirstCharIndex.get(currentCharLower) || [];

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
    const regexCache = new Map();

    for (let i = 0; i < this.translated.length; i++) {
      const originalTranslation = this.translated[i];

      // Skip if empty
      if (!originalTranslation || originalTranslation.length === 0) continue;

      // Get cached regex or create new one
      let regex = regexCache.get(originalTranslation);
      if (!regex) {
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
   * Check if arrays are properly aligned (should always be true)
   * @returns {boolean} True if arrays are properly aligned
   */
  isValid() {
    return (
      this.original.length === this.translated.length &&
      this.original.length === this.metadata.length
    );
  }

  /**
   * CRITICAL-4 FIX: Validate that semantic arrays stay synchronized
   * Throws error if arrays are desynchronized to prevent silent failures
   * @throws {Error} If arrays have different lengths
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
        impact: 'All highlighting functionality will break silently',
      };
      logger.error('❌ CRITICAL: Semantic arrays desynchronized!', error);
      throw new Error(
        `Semantic arrays desynchronized: original=${error.originalLength}, translated=${error.translatedLength}, metadata=${error.metadataLength}`
      );
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
}
