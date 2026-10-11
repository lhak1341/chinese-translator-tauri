/**
 * @file SemanticArrayBuilder.ts
 * Semantic Array Builder — memory-efficient semantic relationship tracking.
 */

import { logger } from '../logger';
import { semanticArrayValidator } from './SemanticArrayValidator';
import type { SemanticArrayMetadata } from '../../types/SemanticTypes';

// Rejects out-of-order, overlapping, or invalid-range positions to prevent bidirectional highlighting corruption.
function validatePosition(
  startPos: number,
  endPos: number,
  lastPositionSet: number,
  tokenIndex: number,
  translatedText: string
): boolean {
  if (lastPositionSet !== -1 && startPos < lastPositionSet) {
    logger.error('❌ setPositionByMatch overlap detected - REJECTING!', {
      tokenIndex,
      translatedText,
      expectedMinStart: lastPositionSet,
      actualStart: startPos,
      violation: 'Position overlaps with previous range',
      impact:
        'Rejected to prevent duplicate position mappings and bidirectional highlighting corruption',
    });
    return false;
  }
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
  return true;
}

/**
 * Optimized semantic metadata (excludes originalText/translatedText for memory efficiency)
 */
export interface SemanticArraySnapshot {
  readonly original: readonly string[];
  readonly translated: readonly string[];
  readonly metadata: readonly SemanticArrayMetadata[];
  readonly length: number;
  readonly capacity: number;
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
 * Semantic arrays result (with optional length property)
 */
interface SemanticArraysResult {
  original: string[];
  translated: string[];
  metadata: SemanticArrayMetadata[];
  length?: number; // Only present when copy=false
}

export class SemanticArrayBuilder {
  private original: string[] = [];
  private translated: string[] = [];
  private metadata: SemanticArrayMetadata[] = [];
  private length: number = 0;

  // Pre-compiled pattern for capitalization check — /u flag required for \p{Lu}
  private readonly uppercasePattern: RegExp = /^\p{Lu}/u;

  // Position tracking
  private lastPositionSet: number = -1;

  // Corruption tracking
  private corrupted: boolean = false;

  /**
   * True once an `addUnit` left the arrays out of sync (an `undefined` text slot). Sticky until
   * `reset()`: every later `addUnit` is refused, so highlighting is off for the rest of the run.
   */
  get isCorrupted(): boolean {
    return this.corrupted;
  }

  /**
   * Reset position tracking for a new chunk (without clearing semantic arrays)
   * Called when starting a new chunk that has positions starting from 0
   */
  resetPositionTracking(): void {
    this.lastPositionSet = -1;
  }

  /** Reset the builder for a new translation. */
  reset(): void {
    this.original = [];
    this.translated = [];
    this.metadata = [];
    this.length = 0;

    // Track position mapping order (CRITICAL-2: Detect out-of-order calls)
    this.lastPositionSet = -1;

    // CRITICAL FIX: Clear corruption flag on reset (new translation = fresh state)
    this.corrupted = false;
  }

  /**
   * Add a semantic unit with memory-efficient approach
   * @param originalText - Original text segment
   * @param translatedText - Translated text segment
   * @param source - Source dictionary/type
   * @param tokenIndex - Token index (optional)
   * @returns True if unit added successfully, false if builder corrupted
   */
  addUnit(
    originalText: string,
    translatedText: string,
    source: string,
    tokenIndex: number = -1
  ): boolean {
    // CRITICAL FIX: Block operations on corrupted builder to prevent cascading failures
    if (this.corrupted) {
      logger.error('❌ Cannot add unit - optimized semantic array builder is corrupted');
      return false;
    }

    const index = this.length;

    this.original[index] = originalText;
    this.translated[index] = translatedText;

    // Optimized metadata: only store essential fields, avoid duplication
    this.metadata[index] = {
      index,
      source,
      tokenIndex,
      translatedStart: -1, // Will be set during postProcess text assembly
      translatedEnd: -1, // Will be set during postProcess text assembly
      originalStart: -1, // Will be set during postProcess when token.start is passed
      originalEnd: -1, // Will be set during postProcess when token.start is passed
      // originalText and translatedText removed - accessible via arrays
    };

    this.length++;

    // CRITICAL-4 FIX: Validate arrays stay synchronized after mutation
    // HIGH-6 FIX: Check validation result (no longer throws)
    // CRITICAL FIX: Mark as corrupted and signal failure to caller
    if (!this.validateArrays()) {
      // Desync detected - mark builder as corrupted to prevent further operations
      this.corrupted = true;
      logger.error('❌ Optimized semantic arrays corrupted - highlighting will be disabled');
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

    // CRITICAL FIX: Collect all matching candidates, prioritize unmapped ones
    // Why: Multiple units can share same tokenIndex (pattern + character fallback)
    // Bug: Previous code returned on first unmapped match, had no fallback if all mapped
    // Fix: Collect all candidates, prioritize unmapped, fallback to first if all mapped
    const candidates: PositionCandidate[] = [];

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
    // No unmapped candidate is known harmless and deliberately unlogged: parallel chunks share
    // this builder and call setPositionByMatch redundantly. The first call sets the correct
    // position; later calls overwrite candidates[0], which is already correctly mapped.
    const unmapped = candidates.find((c) => !c.isMapped);
    const target = unmapped ?? candidates[0];

    if (!validatePosition(startPos, endPos, this.lastPositionSet, tokenIndex, translatedText)) {
      return false;
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
    // This prevents text mismatches when capitalization differs (e.g., "Ở" vs "ø")
    this.translated[target.index] = translatedText;

    return true;
  }

  /**
   * Get semantic arrays with lazy copying
   * @param copy - Whether to create copies (default: true)
   * @returns Semantic arrays
   */
  getArrays(copy: boolean = true): SemanticArraysResult {
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
        // TypeScript: Cast to SemanticArraysResult to handle frozen arrays
        return Object.freeze({
          original: Object.freeze(slicedArrays.original),
          translated: Object.freeze(slicedArrays.translated),
          metadata: Object.freeze(slicedArrays.metadata),
          length: slicedArrays.length,
        }) as SemanticArraysResult;
      }

      // Production: Return without freeze (caller MUST NOT mutate - read-only contract)
      // WARNING: metadata[i].translatedText is ABSENT in this path — SemanticArrayMetadata
      // intentionally excludes it for memory efficiency. getArrays(copy=true) reconstructs it
      // from this.translated[i]. If you need translatedText, use copy=true (the default).
      return slicedArrays;
    }

    // Create properly sized arrays (not pre-allocated size)
    const original = new Array<string>(this.length);
    const translated = new Array<string>(this.length);
    // Include originalText/translatedText for consumers that read these fields
    // (e.g. TranslationEngine word-segment builder). Typed as intersection to preserve
    // SemanticArrayMetadata structure while adding the compatibility fields.
    const metadata = new Array<
      SemanticArrayMetadata & { originalText: string; translatedText: string }
    >(this.length);

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
   * Update semantic arrays with capitalized versions from final text.
   * - Fast path (O(1)): uses translatedStart/End position metadata when available
   * - Fallback: indexOf with a lazily-initialised lowercase copy of finalText
   *
   * NOTE: Does NOT write metadata[i].translatedText — SemanticArrayMetadata omits that
   * field for memory efficiency. getArrays(copy=true) reconstructs translatedText from
   * this.translated[i]; getArrays(copy=false) callers must not read metadata[i].translatedText.
   *
   * @param finalText - The final capitalized text
   */
  updateWithCapitalizedText(finalText: string): void {
    if (!finalText || this.length === 0) return;

    // Lazy-initialised lowercase cache for the indexOf fallback path
    let lowerFinal: string | null = null;

    for (let i = 0; i < this.length; i++) {
      const originalTranslation = this.translated[i];
      if (!originalTranslation || originalTranslation.length === 0) continue;

      const meta = this.metadata[i];

      // Fast path: position metadata is available — O(1) lookup per unit.
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
          this.uppercasePattern.test(actualText) &&
          actualText.toLowerCase() === originalTranslation.toLowerCase()
        ) {
          this.translated[i] = actualText;
        }
        continue;
      }

      // Fallback: position metadata not yet set — use indexOf with a cached lowercase
      // copy of finalText. indexOf is V8-optimised and avoids per-unit regex + matchAll.
      //
      // KNOWN LIMITATION: This search starts at index 0 regardless of which unit i is.
      // For a repeated word (e.g. "là" appearing 10×), it always capitalises the first
      // occurrence in the text for every unit that lacks position metadata, regardless of
      // which occurrence unit i actually maps to. This only fires when translatedStart/End
      // is not set — the fast path above (O(1), position-gated) handles the common case
      // correctly. The same limitation exists in SemanticArrayBuilder. FullTextAssembly works
      // around it for Full Translation with setTranslatedCasing, after this call.
      if (lowerFinal === null) lowerFinal = finalText.toLowerCase();
      const lowerUnit = originalTranslation.toLowerCase();
      let searchFrom = 0;

      while (searchFrom <= finalText.length - originalTranslation.length) {
        const idx = lowerFinal.indexOf(lowerUnit, searchFrom);
        if (idx === -1) break;

        const candidate = finalText.substring(idx, idx + originalTranslation.length);
        if (candidate !== originalTranslation && this.uppercasePattern.test(candidate)) {
          // CRITICAL-2 FIX: Validate length before updating to prevent position corruption
          if (candidate.length === originalTranslation.length) {
            this.translated[i] = candidate;
          }
          break;
        }
        searchFrom = idx + 1;
      }
    }
  }

  /**
   * Take a unit's casing from the finished text, where the caller has already found the unit.
   * Unlike `updateWithCapitalizedText`, which guesses the unit's place from its text when no
   * position was recorded (the first occurrence, so a later lowercase repeat is stamped with an
   * earlier capital), this is told the place. It changes the casing only: a form that differs in
   * length or in anything but case is ignored.
   */
  setTranslatedCasing(index: number, finalForm: string): void {
    if (index < 0 || index >= this.length) return;
    const current = this.translated[index];
    if (finalForm.length !== current.length) return;
    if (finalForm.toLowerCase() !== current.toLowerCase()) return;
    this.translated[index] = finalForm;
  }

  private validateArrays(): boolean {
    return semanticArrayValidator.validateArrays(this.getSnapshot());
  }

  /**
   * Return a read-only snapshot of the builder's internal arrays for external validation.
   * Passes the raw arrays so validators can detect partial writes at index length-1.
   */
  getSnapshot(): SemanticArraySnapshot {
    return {
      original: this.original,
      translated: this.translated,
      metadata: this.metadata,
      length: this.length,
      capacity: this.original.length,
    };
  }
}

// default export intentionally omitted — use named export only
