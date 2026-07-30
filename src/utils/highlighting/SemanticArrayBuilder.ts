/**
 * @file SemanticArrayBuilder.ts
 * Semantic Array Builder — memory-efficient semantic relationship tracking with pre-allocated arrays.
 */

import { batchLog } from '../BatchLogger.js';
import { logger } from '../logger';
import { mapToPositions } from './TextPositionMapper';

// Rejects out-of-order, overlapping, or invalid-range positions to prevent bidirectional highlighting corruption.
function validatePosition(
  startPos: number,
  endPos: number,
  lastPositionSet: number,
  tokenIndex: number,
  translatedText: string
): boolean {
  if (lastPositionSet !== -1 && startPos <= lastPositionSet) {
    logger.error('❌ setPositionByMatch overlap detected - REJECTING!', {
      tokenIndex,
      translatedText,
      expectedMinStart: lastPositionSet + 1,
      actualStart: startPos,
      violation:
        startPos < lastPositionSet ? 'Position decreased' : 'Position overlaps with previous range',
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
 * Consumer map (architecture review 2026-07-30, candidate #5 grilling — corrected from
 * the original "shared dual-consumer contract" framing, which overstated how much of this
 * type both highlighting paths actually touch: verified via direct grep of real readers,
 * most fields are char-only-exclusive, not shared). See src/utils/CLAUDE.md's
 * `buildSegmentsFromPositions`, `addUnit`, and duplicate-word-highlighting gotchas for the
 * specific behavioral failure modes behind originalStart/originalEnd, phase/dictionary, and
 * tokenIndex respectively.
 */
export interface SemanticArrayMetadata {
  index: number; // Internal array-position bookkeeping — not consumed by either UI path
  source: string; // Consumed by: char-only (ClickableOriginalSemantic.tsx, ClickableTranslationSemantic.tsx) AND full-translation (ClickableTranslationOptimized.tsx)
  tokenIndex: number; // Consumed by: BOTH paths, via compareByTokenIndex tie-breaking (TextPositionMapper.ts)
  phase: string | null; // Provenance only — zero real readers today (write-only; see addUnit's CLAUDE.md gotcha)
  dictionary: string | null; // Provenance only — zero real readers today (write-only; see addUnit's CLAUDE.md gotcha)
  translatedStart: number; // Consumed by: char-only only (PositionMetadataSegmenter.ts, characterOnlySemanticBuilder setup)
  translatedEnd: number; // Consumed by: char-only only (see translatedStart)
  originalStart: number; // Character position in original Chinese text (-1 if not set). Consumed by: char-only only (ClickableOriginalSemantic.tsx → precomputeOriginalSegments → buildSegmentsFromPositions)
  originalEnd: number; // End position in original Chinese text (-1 if not set). Consumed by: char-only only (see originalStart)
}

/**
 * Performance statistics
 */
interface PerformanceStats {
  totalUnits: number;
  capacityResizes: number;
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
 * Position mappings with typed arrays
 */
interface PositionMappings {
  originalPositions: Int32Array;
  translatedPositions: Int32Array;
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

/**
 * Debug information structure
 */
interface DebugInfo {
  totalUnits: number;
  allocatedCapacity: number;
  memoryEfficiency: string;
  isValid: boolean;
  stats: PerformanceStats;
  sources: string[];
  performance: {
    capacityResizes: number;
  };
}

/**
 * Memory statistics
 */
interface MemoryStats {
  totalEstimated: number;
  strings: number;
  arrays: number;
  metadata: number;
  wastedCapacity: number;
}

export class SemanticArrayBuilder {
  private original: string[];
  private translated: string[];
  private metadata: SemanticArrayMetadata[];
  private length: number = 0;
  private estimatedCapacity: number;

  // Performance tracking
  private stats: PerformanceStats;

  // Pre-compiled pattern for capitalization check — /u flag required for \p{Lu}
  private readonly uppercasePattern: RegExp = /^\p{Lu}/u;

  // Position tracking
  private lastPositionSet: number = -1;

  // Corruption tracking
  private isCorrupted: boolean = false;

  constructor(estimatedCapacity: number = 100) {
    this.estimatedCapacity = Math.max(50, estimatedCapacity); // Minimum capacity

    // Performance tracking
    this.stats = {
      totalUnits: 0,
      capacityResizes: 0,
    };

    // Pre-allocate arrays (will be properly initialized in reset())
    this.original = new Array<string>(this.estimatedCapacity);
    this.translated = new Array<string>(this.estimatedCapacity);
    this.metadata = new Array<SemanticArrayMetadata>(this.estimatedCapacity);

    // Now safe to call reset() since all properties are initialized
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
   * Reset the builder for a new translation with capacity estimation
   * @param estimatedSize - Expected number of semantic units
   */
  reset(estimatedSize?: number): void {
    // Validate input early to prevent NaN propagation
    const validSize =
      estimatedSize !== undefined && Number.isFinite(estimatedSize) && estimatedSize > 0
        ? estimatedSize
        : null;

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
    this.original = new Array<string>(this.estimatedCapacity);
    this.translated = new Array<string>(this.estimatedCapacity);
    this.metadata = new Array<SemanticArrayMetadata>(this.estimatedCapacity);

    // Track actual usage
    this.length = 0;

    // Track position mapping order (CRITICAL-2: Detect out-of-order calls)
    this.lastPositionSet = -1;

    // CRITICAL FIX: Clear corruption flag on reset (new translation = fresh state)
    this.isCorrupted = false;

    batchLog.hotVerbose('semantic-builder', `Reset with capacity ${this.estimatedCapacity}`);
  }

  /**
   * Add a semantic unit with memory-efficient approach
   * @param originalText - Original text segment
   * @param translatedText - Translated text segment
   * @param source - Source dictionary/type
   * @param tokenIndex - Token index (optional)
   * @param phase - Processing phase (optional)
   * @param dictionary - Dictionary name (optional)
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
      originalStart: -1, // Will be set during postProcess when token.start is passed
      originalEnd: -1, // Will be set during postProcess when token.start is passed
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
    const unmapped = candidates.find((c) => !c.isMapped);
    if (!unmapped) {
      // Known harmless: parallel chunks share this builder and call setPositionByMatch
      // redundantly. The first call sets the correct position; subsequent calls hit this
      // branch and overwrite candidates[0], which is already correctly mapped.
      logger.debug(
        'setPositionByMatch: all candidates already mapped (expected in parallel chunk processing)',
        { tokenIndex, translatedText, candidateCount: candidates.length }
      );
    }
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
   * Resize arrays when capacity is exceeded
   * @private
   */
  private resizeArrays(): void {
    const newCapacity = Math.ceil(this.original.length * 1.5);

    // Create new arrays with increased capacity
    const newOriginal = new Array<string>(newCapacity);
    const newTranslated = new Array<string>(newCapacity);
    const newMetadata = new Array<SemanticArrayMetadata>(newCapacity);

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
   * Build position mappings for both original Chinese text and translated Vietnamese text.
   * Delegates to TextPositionMapper.mapToPositions for the greedy longest-match algorithm.
   */
  buildPositionMappings(originalText: string, translatedText: string): PositionMappings {
    if (!originalText || originalText.length === 0) {
      logger.warn('⚠️ Empty original text in buildPositionMappings');
      return { originalPositions: new Int32Array(0), translatedPositions: new Int32Array(0) };
    }
    if (!translatedText || translatedText.length === 0) {
      logger.warn('⚠️ Empty translated text in buildPositionMappings');
      return { originalPositions: new Int32Array(0), translatedPositions: new Int32Array(0) };
    }

    return {
      originalPositions: mapToPositions(originalText, this.original, this.length),
      translatedPositions: mapToPositions(translatedText, this.translated, this.length, true),
    };
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
      // correctly. The same limitation exists in SemanticArrayBuilder.
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
   * Get the actual number of semantic units
   * @returns Number of semantic units
   */
  getLength(): number {
    return this.length;
  }

  /**
   * Check if arrays are properly aligned and builder is not corrupted
   * CRITICAL FIX: Now checks both array alignment AND corruption flag
   * @returns True if arrays are properly aligned and not corrupted
   */
  isValid(): boolean {
    return (
      !this.isCorrupted &&
      this.length <= this.original.length &&
      this.length <= this.translated.length &&
      this.length <= this.metadata.length
    );
  }

  private validateArrays(): boolean {
    const capacitiesMatch =
      this.original.length === this.translated.length &&
      this.original.length === this.metadata.length;

    const isLengthValid =
      capacitiesMatch &&
      this.length <= this.original.length &&
      this.length <= this.translated.length &&
      this.length <= this.metadata.length;

    if (!isLengthValid) {
      logger.error('❌ CRITICAL: Optimized semantic arrays desynchronized!', {
        actualLength: this.length,
        originalCapacity: this.original.length,
        translatedCapacity: this.translated.length,
        metadataCapacity: this.metadata.length,
        capacitiesMatch,
        impact: 'Highlighting functionality may break',
      });
      return false;
    }

    if (this.length > 0) {
      const lastIdx = this.length - 1;
      const elementsSynced =
        this.original[lastIdx] !== undefined &&
        this.translated[lastIdx] !== undefined &&
        this.metadata[lastIdx] !== undefined;

      if (!elementsSynced) {
        logger.error('❌ CRITICAL: Optimized semantic arrays have partial write at last slot!', {
          lastIdx,
          hasOriginal: this.original[lastIdx] !== undefined,
          hasTranslated: this.translated[lastIdx] !== undefined,
          hasMetadata: this.metadata[lastIdx] !== undefined,
          impact: 'Last semantic unit is corrupted — highlighting may misfire',
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Return a read-only snapshot of the builder's internal arrays for external validation.
   * Passes raw (capacity-sized) arrays so validators can detect partial writes at index length-1.
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

  /**
   * Get debug information including performance statistics
   * @returns Debug information
   */
  getDebugInfo(): DebugInfo {
    const memoryEfficiency =
      this.original.length > 0 ? ((this.length / this.original.length) * 100).toFixed(1) : '0';

    return {
      totalUnits: this.getLength(),
      allocatedCapacity: this.original.length,
      memoryEfficiency: `${memoryEfficiency}%`,
      isValid: this.isValid(),
      stats: this.stats,
      sources: this.metadata.slice(0, this.length).map((m) => m?.source || 'unknown'),
      performance: {
        capacityResizes: this.stats.capacityResizes,
      },
    };
  }

  /**
   * Get memory usage statistics
   * @returns Memory usage information
   */
  getMemoryStats(): MemoryStats {
    const elementSize = 8; // Approximate bytes per array element
    const stringMemory =
      this.original.slice(0, this.length).reduce((sum, str) => sum + (str?.length || 0) * 2, 0) + // Original strings (UTF-16)
      this.translated.slice(0, this.length).reduce((sum, str) => sum + (str?.length || 0) * 2, 0); // Translated strings

    const arrayMemory = this.original.length * elementSize * 3; // 3 arrays
    const metadataMemory = this.length * 32; // Approximate metadata object size

    return {
      totalEstimated: stringMemory + arrayMemory + metadataMemory,
      strings: stringMemory,
      arrays: arrayMemory,
      metadata: metadataMemory,
      wastedCapacity: (this.original.length - this.length) * elementSize * 3,
    };
  }

  /**
   * Compact arrays to remove unused capacity
   */
  compact(): void {
    if (this.original.length <= this.length) return;

    const compactOriginal = new Array<string>(this.length);
    const compactTranslated = new Array<string>(this.length);
    const compactMetadata = new Array<SemanticArrayMetadata>(this.length);

    for (let i = 0; i < this.length; i++) {
      compactOriginal[i] = this.original[i];
      compactTranslated[i] = this.translated[i];
      compactMetadata[i] = this.metadata[i];
    }

    const oldCapacity = this.original.length;

    this.original = compactOriginal;
    this.translated = compactTranslated;
    this.metadata = compactMetadata;

    batchLog.info(
      'semantic-compact',
      `Compacted arrays from ${oldCapacity} to ${this.length} capacity`
    );
  }
}

// default export intentionally omitted — use named export only
