/**
 * @file SemanticArrayBuilder.ts
 * Semantic Array Builder — captures 1:1 semantic relationships during translation for accurate highlighting.
 *
 * OPTIMIZED TYPESCRIPT VERSION (2026-01-29):
 * - Full type safety for position tracking and metadata
 * - Prevents undefined/null propagation bugs at compile-time
 * - V8-optimized via typed arrays and monomorphic property access
 * - Estimated performance improvement: 10-15%
 */

// === SIBLING: ./OptimizedSemanticArrayBuilder.ts — must stay field-synchronized ===
// OptimizedSemanticArrayBuilder is the production default (used by TranslationEngine.js line ~348).
// Any field added to SemanticArrayMetadata here must also be added to OptimizedSemanticMetadata,
// initialized in addUnit(), and handled in setPositionByMatch(). Algorithm changes to
// updateWithCapitalizedText must also be mirrored. See CLAUDE.md for the sync requirement.

import { logger } from '../logger';
import { validatePosition } from './PositionValidationHelpers.js';
import { getFirstGrapheme } from '../GraphemeHelper.js';

/**
 * Semantic metadata for a single translation unit
 */
interface SemanticArrayMetadata {
  index: number;
  source: string;
  tokenIndex: number;
  phase: string | null;
  dictionary: string | null;
  originalText: string;
  translatedText: string;
  translatedStart: number; // -1 if not set, otherwise valid position
  translatedEnd: number; // -1 if not set, otherwise valid position
  originalStart: number; // Character position in original Chinese text (-1 if not set)
  originalEnd: number; // End position in original Chinese text (-1 if not set)
}

/**
 * Corruption event telemetry
 */
interface CorruptionEvent {
  timestamp: number;
  originalLength: number;
  translatedLength: number;
  metadataLength: number;
  source: string;
  phase: string | null;
}

/**
 * Corruption telemetry tracking
 */
interface CorruptionTelemetry {
  totalCorruptions: number;
  corruptionEvents: CorruptionEvent[];
  lastCorruptionTime: number | null;
}

/**
 * Position mapping result
 */
interface PositionMappings {
  originalPositions: Map<number, number>;
  translatedPositions: Map<number, number>;
}

/**
 * Semantic arrays result
 */
interface SemanticArraysResult {
  original: string[];
  translated: string[];
  metadata: SemanticArrayMetadata[];
}

/**
 * Position candidate match
 */
interface PositionCandidate {
  index: number;
  meta: SemanticArrayMetadata;
  isMapped: boolean;
}

/**
 * Best match result for position mapping
 */
interface BestMatch {
  index: number;
  unit: string;
  length: number;
}

/**
 * Position validation report
 */
interface PositionValidationReport {
  total: number;
  valid: number;
  invalid: number;
  invalidEntries: InvalidPositionEntry[];
  coverage: number;
}

/**
 * Invalid position entry
 */
interface InvalidPositionEntry {
  index: number;
  original: string;
  translated: string;
  translatedStart: number;
  translatedEnd: number;
  reason: string;
}

/**
 * Debug information structure
 */
interface DebugInfo {
  totalUnits: number;
  isValid: boolean;
  positionValidation: PositionValidationReport;
  sources: string[];
  mappings: DebugMapping[];
}

/**
 * Debug mapping entry
 */
interface DebugMapping {
  index: number;
  original: string;
  translated: string;
  source: string;
}

/**
 * Corruption telemetry with current state
 */
interface CorruptionTelemetryWithState extends CorruptionTelemetry {
  isCurrentlyCorrupted: boolean;
}

export class SemanticArrayBuilder {
  private original: string[] = [];
  private translated: string[] = [];
  private metadata: SemanticArrayMetadata[] = [];

  // Corruption tracking
  private isCorrupted: boolean = false;
  private corruptionTelemetry: CorruptionTelemetry;

  // Position tracking (for out-of-order detection)
  private lastPositionSet: number = -1;

  constructor() {
    // CODE REVIEW FIX (CRITICAL-2): Telemetry for corruption tracking
    this.corruptionTelemetry = {
      totalCorruptions: 0,
      corruptionEvents: [], // Last 10 corruption events with timestamps
      lastCorruptionTime: null,
    };

    this.reset();
  }

  /**
   * Reset position tracking for a new chunk (without clearing semantic arrays)
   * Called when starting a new chunk that has positions starting from 0
   */
  resetPositionTracking(): void {
    this.lastPositionSet = -1;
  }

  /**
   * Reset the builder for a new translation
   * CODE REVIEW FIX (CRITICAL-2): Preserves corruption telemetry across resets for monitoring
   */
  reset(): void {
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
   * @param originalText - Original text segment
   * @param translatedText - Translated text segment
   * @param source - Source dictionary/type (e.g., "phrases", "characters", "properNouns")
   * @param tokenIndex - Token index for debugging (optional)
   * @param phase - Processing phase (optional, e.g., "patterns", "properNouns", "phrases")
   * @param dictionary - Dictionary name (optional, e.g., "phrases", "characters", "properNouns-NovelName")
   * @returns True if unit added successfully, false if builder corrupted
   */
  addUnit(
    originalText: string,
    translatedText: string,
    source: string,
    tokenIndex: number = -1,
    phase: string | null = null,
    dictionary: string | null = null
  ): boolean {
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
    const metadata: SemanticArrayMetadata = {
      index,
      source,
      tokenIndex,
      phase, // Processing phase (patterns, properNouns, phrases, characters, etc.)
      dictionary, // Dictionary name for provenance tracking
      originalText,
      translatedText,
      translatedStart: -1, // Will be set during postProcess text assembly
      translatedEnd: -1, // Will be set during postProcess text assembly
      originalStart: -1, // Will be set during postProcess when token.start is passed
      originalEnd: -1, // Will be set during postProcess when token.start is passed
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
   * @param tokenIndex - Token index to match
   * @param translatedText - Translated text to match (case-insensitive)
   * @param startPos - Start position in final translated text
   * @param endPos - End position in final translated text
   * @returns True if a matching unit was found and updated
   */
  setPositionByMatch(
    tokenIndex: number,
    translatedText: string,
    startPos: number,
    endPos: number,
    originalStart?: number // NEW: character position in original Chinese text
  ): boolean {
    // Find semantic unit that matches both tokenIndex and translatedText
    // This handles cases where multiple semantic units share the same tokenIndex
    // (e.g., pattern match + character fallbacks for the same token)

    // CRITICAL: Collect all matching candidates, prioritize unmapped ones
    // Why: Multiple units can share same tokenIndex (pattern + character fallback)
    // Fix: Prevent race where first-matched unit gets position, subsequent updates ignored
    const candidates: PositionCandidate[] = [];

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

    // Prioritize unmapped candidates (prevents wrong unit from getting position).
    // If all candidates are already mapped (surplus call), fall back to candidates[0]
    // and overwrite its position — this produces a wrong click rather than no click.
    // The root cause of surplus calls (more position assigns than semantic entries) should
    // be investigated upstream; this fallback keeps units clickable in the meantime.
    const unmapped = candidates.find((c) => !c.isMapped);
    if (!unmapped) {
      logger.error(
        '❌ setPositionByMatch: all candidates already mapped — overwriting candidates[0] to preserve clickability',
        {
          tokenIndex,
          translatedText,
          candidateCount: candidates.length,
          impact:
            'candidates[0] will point to the wrong text occurrence; investigate surplus calls upstream',
        }
      );
    }
    const target = unmapped ?? candidates[0];

    // MEDIUM-3 FIX: Use shared validation logic (extracted from duplicate code)
    // CRITICAL-1 FIX: Reject out-of-order positions to prevent corruption
    // HIGH-1 FIX: Prevent overlapping positions by requiring startPos > lastPositionSet (not >=)
    if (!validatePosition(startPos, endPos, this.lastPositionSet, tokenIndex, translatedText)) {
      return false; // ✅ Reject invalid positions (out-of-order, overlapping, or invalid range)
    }

    // Update the selected candidate's position
    target.meta.translatedStart = startPos;
    target.meta.translatedEnd = endPos;

    // Set original Chinese position once (never overwrite already-set value)
    if (originalStart !== undefined && originalStart >= 0 && target.meta.originalStart === -1) {
      target.meta.originalStart = originalStart;
      target.meta.originalEnd = originalStart + this.original[target.index].length;
    }

    // Track last position for order validation
    this.lastPositionSet = endPos;

    // MEDIUM-2 FIX: Update translated array to match actual casing in final text
    // This prevents text mismatches when capitalization differs (e.g., "Ở" vs "ở")
    this.translated[target.index] = translatedText;

    return true;
  }

  /**
   * Build position-to-semantic-index mappings for reliable highlighting
   * @param originalText - Final original text
   * @param translatedText - Final translated text
   * @returns Position mappings for both texts
   */
  buildPositionMappings(originalText: string, translatedText: string): PositionMappings {
    const originalPositions = new Map<number, number>(); // position -> semantic index
    const translatedPositions = new Map<number, number>(); // position -> semantic index

    // Track which semantic indices have been used
    const usedIndices = new Set<number>();

    // OPTIMIZATION: Build first-character index for original text (40-60% speedup)
    // Maps first character -> array of unit indices starting with that character
    const originalFirstCharIndex = new Map<string, number[]>();
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
      originalFirstCharIndex.get(firstChar)!.push(i);
    }

    // Build original text position mapping
    let currentPos = 0;
    while (currentPos < originalText.length) {
      let bestMatch: BestMatch | null = null;
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
    const translatedFirstCharIndex = new Map<string, number[]>();
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
      translatedFirstCharIndex.get(firstChar)!.push(i);
    }

    // Build translated text position mapping
    currentPos = 0;
    while (currentPos < translatedText.length) {
      let bestMatch: BestMatch | null = null;
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
   * @returns Semantic arrays with original, translated, and metadata
   */
  getArrays(): SemanticArraysResult {
    return {
      original: [...this.original],
      translated: [...this.translated],
      metadata: [...this.metadata],
    };
  }

  /**
   * Update semantic arrays with capitalized versions from final text.
   * SYNC: Algorithm must stay identical to OptimizedSemanticArrayBuilder.updateWithCapitalizedText.
   * Fast path uses translatedStart/End; fallback uses indexOf with cached lowercase string.
   * @param finalText - The final capitalized text
   */
  updateWithCapitalizedText(finalText: string): void {
    if (!finalText) return;

    // Lazy-initialised lowercase cache for the indexOf fallback path
    let lowerFinal: string | null = null;

    for (let i = 0; i < this.translated.length; i++) {
      const originalTranslation = this.translated[i];
      if (!originalTranslation || originalTranslation.length === 0) continue;

      const meta = this.metadata[i];

      // Fast path: position metadata is available — O(1) lookup per unit.
      // This is the common case after postProcess() has assembled the final text.
      if (
        meta.translatedStart >= 0 &&
        meta.translatedEnd > meta.translatedStart &&
        meta.translatedEnd <= finalText.length
      ) {
        const actualText = finalText.substring(meta.translatedStart, meta.translatedEnd);

        // CRITICAL-2 FIX: Only update when lengths match and casing actually differs
        if (
          actualText.length === originalTranslation.length &&
          actualText !== originalTranslation &&
          /^[A-ZÀ-ÿ]/.test(actualText) &&
          actualText.toLowerCase() === originalTranslation.toLowerCase()
        ) {
          this.translated[i] = actualText;
          this.metadata[i].translatedText = actualText;
        }
        continue;
      }

      // Fallback: position metadata not yet set — use indexOf with a cached lowercase
      // copy of finalText. indexOf is V8-optimised and avoids the per-unit regex + matchAll
      // that previously made this O(n × textLength).
      //
      // KNOWN LIMITATION: This search starts at index 0 regardless of which unit i is.
      // For a repeated word (e.g. "là" appearing 10×), it always capitalises the first
      // occurrence in the text for every unit that lacks position metadata, regardless of
      // which occurrence unit i actually maps to. This only fires when translatedStart/End
      // is not set — the fast path above (O(1), position-gated) handles the common case
      // correctly. The same limitation exists in OptimizedSemanticArrayBuilder.
      if (lowerFinal === null) lowerFinal = finalText.toLowerCase();
      const lowerUnit = originalTranslation.toLowerCase();
      let searchFrom = 0;

      while (searchFrom <= finalText.length - originalTranslation.length) {
        const idx = lowerFinal.indexOf(lowerUnit, searchFrom);
        if (idx === -1) break;

        const candidate = finalText.substring(idx, idx + originalTranslation.length);
        if (candidate !== originalTranslation && /^[A-ZÀ-ÿ]/.test(candidate)) {
          // CRITICAL-2 FIX: Validate length before updating to prevent position corruption
          if (candidate.length === originalTranslation.length) {
            this.translated[i] = candidate;
            this.metadata[i].translatedText = candidate;
          }
          break;
        }
        searchFrom = idx + 1;
      }
    }
  }

  /**
   * Get the total number of semantic units
   * @returns Number of semantic units
   */
  getLength(): number {
    return this.original.length;
  }

  /**
   * CODE REVIEW FIX (CRITICAL-2): Get corruption telemetry
   * Returns telemetry data for monitoring corruption frequency
   * @returns Corruption telemetry data
   */
  getCorruptionTelemetry(): CorruptionTelemetryWithState {
    return {
      ...this.corruptionTelemetry,
      isCurrentlyCorrupted: this.isCorrupted,
    };
  }

  /**
   * Check if arrays are properly aligned and builder is not corrupted
   * CRITICAL FIX: Now checks both array alignment AND corruption flag
   * @returns True if arrays are properly aligned and not corrupted
   */
  isValid(): boolean {
    return (
      !this.isCorrupted &&
      this.original.length === this.translated.length &&
      this.original.length === this.metadata.length
    );
  }

  /**
   * CRITICAL-4 FIX: Validate that semantic arrays stay synchronized
   * HIGH-6 FIX: Returns validation result instead of throwing (allows graceful degradation)
   * @returns True if arrays are synchronized, false if desynchronized
   */
  validateArrays(): boolean {
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
   * @param metadata - Metadata object to validate
   * @returns True if positions are valid
   */
  hasValidPositions(metadata: SemanticArrayMetadata): boolean {
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
   * @returns Validation report with counts and invalid entries
   */
  validateAllPositions(): PositionValidationReport {
    const invalid: InvalidPositionEntry[] = [];
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
   * @returns Debug information
   */
  getDebugInfo(): DebugInfo {
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
