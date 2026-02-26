/**
 * Segment Precomputation for Optimized Clickable Text Rendering
 * Pre-computes all segment data during translation to avoid runtime calculations
 *
 * MEMORY MANAGEMENT NOTE (2026-01-22):
 * Object pooling removed - segments are small objects (~10 properties, <1KB each).
 * Modern V8 optimizes object literals efficiently, pooling added complexity without
 * measurable benefit. Segments have lifecycle tied to React rendering (can't be
 * released until component unmount), making caller-managed pooling impractical.
 */

import { logger } from './logger';
import { getGraphemeLength } from './GraphemeHelper.js';
import { normalizeVietnameseText } from './TextNormalizationHelpers';

/**
 * Options for segment precomputation
 */
export interface SegmentPrecomputerOptions {
  /** Whether to try WASM acceleration (default: true) */
  useWasm?: boolean;
}

/**
 * Semantic arrays from translation engine
 */
export interface SemanticArrays {
  /** Translated text units */
  translated: string[];

  /** Original text units */
  original: string[];

  /** Metadata for each unit */
  metadata: any[];
}

/**
 * Individual semantic unit with metadata
 */
interface UnitData {
  /** Index in semantic arrays */
  index: number;

  /** Translated unit text (normalized to NFC) */
  unit: string;

  /** Original unit text */
  original: string;

  /** Unit metadata */
  metadata: any;
}

/**
 * Match result from unit matching
 */
interface MatchResult {
  /** Whether a match was found */
  found: boolean;

  /** Offset from start position (accounts for punctuation) */
  offset: number;
}

/**
 * WASM match result
 */
interface WasmMatch {
  /** Starting position in text */
  position: number;

  /** Match length */
  length: number;

  /** Index of matched unit */
  unitIndex: number;
}

/**
 * Segment types
 */
type SegmentType = 'semantic' | 'space' | 'text';

/**
 * Base segment structure
 */
export interface Segment {
  /** Segment type */
  type: SegmentType;

  /** Segment text content */
  text: string;

  /** Starting position in full text */
  start: number;

  /** Ending position in full text */
  end: number;

  /** Semantic unit index (-1 for non-semantic) */
  unitIndex: number;

  /** Whether segment is clickable */
  isClickable: boolean;

  /** Original text (for semantic segments) */
  originalText?: string;

  /** Translated text (for semantic segments) */
  translatedText?: string;

  /** Translation source (for semantic segments) */
  source?: string;

  /** Unit metadata (for semantic segments) */
  metadata?: any;
}

/**
 * Render-optimized segment with additional display properties
 */
export interface RenderSegment extends Segment {
  /** Unique React key */
  key: string;

  /** Whether segment is highlighted */
  isHighlighted: boolean;

  /** CSS class name */
  className: string;
}

/**
 * Minimal WASM segment matcher interface
 */
interface WasmSegmentMatcher {
  initialize(units: UnitData[]): Promise<boolean>;
  findMatches(text: string, units: UnitData[]): WasmMatch[] | null;
  getStats(): any;
}

// Declare global WasmSegmentMatcher constructor
declare const WasmSegmentMatcher: {
  new (): WasmSegmentMatcher;
};

// MEDIUM-4 FIX: Extract magic regex patterns to named constants
// Punctuation and whitespace characters used for text boundary detection
const PUNCTUATION_AND_WHITESPACE =
  /[\s\r\n\t\u3000\u2000-\u200F\u2028\u2029"'`\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB\u300C\u300D\u300E\u300F\u3008\u3009\u300A\u300B\u3014\u3015\u3016\u3017,，.。!！?？;；:：[\]]/;

// Text boundaries for segment splitting (spaces, punctuation, line breaks)
const TEXT_BOUNDARY = /[\s\r\n,，.。!！?？;；:：[\]]/;

export class SegmentPrecomputer {
  // Enhanced with punctuation handling for proper noun highlighting
  /**
   * Pre-compute clickable segments from semantic arrays
   * @param text - The full translated text
   * @param semanticArrays - Semantic arrays from translation
   * @param options - Options for segment computation
   * @returns Pre-computed segments with positions and metadata
   */
  static async precomputeSegments(
    text: string,
    semanticArrays: SemanticArrays,
    options: SegmentPrecomputerOptions = {}
  ): Promise<Segment[]> {
    const { useWasm = true } = options;

    // Try WASM first if enabled
    if (useWasm) {
      try {
        const wasmSegments = await this.precomputeSegmentsWasm(text, semanticArrays);
        if (wasmSegments !== null) {
          return wasmSegments;
        }
        // Fall through to JavaScript if WASM returned null
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn('⚠️ WASM segment computation failed, falling back to JavaScript:', error);
        }
        // Fall through to JavaScript implementation
      }
    }

    // JavaScript fallback
    return this.precomputeSegmentsJS(text, semanticArrays);
  }

  /**
   * WASM-accelerated segment computation (8-20x faster)
   * @param text - The full translated text
   * @param semanticArrays - Semantic arrays from translation
   * @returns Pre-computed segments or null if WASM unavailable
   */
  static async precomputeSegmentsWasm(
    text: string,
    semanticArrays: SemanticArrays
  ): Promise<Segment[] | null> {
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      return [];
    }

    // Normalize text to NFC
    // CODE REVIEW FIX (2026-02-07): Use shared helper instead of inline .normalize('NFC')
    text = normalizeVietnameseText(text)!;

    const { translated, original, metadata } = semanticArrays;

    // Prepare semantic units for WASM
    // CODE REVIEW FIX (2026-02-07): Use shared helper for array normalization
    const allUnits: UnitData[] = translated
      .map((unit, index) => ({
        index,
        unit: normalizeVietnameseText(unit),
        original: original[index],
        metadata: metadata[index],
      }))
      .filter((unitData): unitData is UnitData => !!unitData.unit && unitData.unit.length > 0);

    if (allUnits.length === 0) {
      return [];
    }

    // Sort by token index
    const filteredUnits = allUnits.sort((a, b) => {
      const aIndex = a.metadata?.tokenIndex ?? 0;
      const bIndex = b.metadata?.tokenIndex ?? 0;
      return aIndex - bIndex;
    });

    // Initialize WASM matcher
    const wasmMatcher = new WasmSegmentMatcher();
    const wasmReady = await wasmMatcher.initialize(filteredUnits);

    if (!wasmReady) {
      if (process.env.NODE_ENV === 'development') {
        logger.log('ℹ️ WASM segment matcher not available, using JavaScript fallback');
      }
      return null; // Signal to use JavaScript fallback
    }

    // Find matches using WASM trie (O(n+k) instead of O(n*m*k))
    const wasmMatches = wasmMatcher.findMatches(text, filteredUnits);

    if (!wasmMatches) {
      return null; // WASM failed, use JavaScript fallback
    }

    if (process.env.NODE_ENV === 'development') {
      const stats = wasmMatcher.getStats();
      logger.log('✅ WASM segment matcher used:', {
        textLength: text.length,
        units: filteredUnits.length,
        matches: wasmMatches.length,
        stats,
      });
    }

    // Convert WASM matches to segments.
    // NOTE: convertMatchesToSegments does not maintain a usedIndices Set. If the WASM
    // trie returns the same unitIndex for multiple text positions (possible when two
    // semantic units share identical translated text), the same unitIndex would be
    // assigned to multiple segments, breaking duplicate-word highlighting. Add a
    // usedIndices guard in convertMatchesToSegments before activating this path in
    // production. Currently WasmSegmentMatcher is not defined globally, so this path
    // throws and falls back to precomputeSegmentsJS on every call.
    return this.convertMatchesToSegments(text, wasmMatches, filteredUnits);
  }

  /**
   * Convert WASM matches to segment format
   * @param text - The full translated text
   * @param matches - Matches from WASM matcher
   * @param filteredUnits - Filtered semantic units
   * @returns Segments in expected format
   */
  static convertMatchesToSegments(
    text: string,
    matches: WasmMatch[],
    filteredUnits: UnitData[]
  ): Segment[] {
    const segments: Segment[] = [];
    let currentPosition = 0;

    // Sort matches by position
    const sortedMatches = matches.sort((a, b) => a.position - b.position);

    for (const match of sortedMatches) {
      // Add non-matching text before this match
      if (match.position > currentPosition) {
        const nonMatchingText = text.substring(currentPosition, match.position);
        this.addNonSemanticSegments(segments, nonMatchingText, currentPosition);
      }

      // Add the matched segment
      const unitData = filteredUnits[match.unitIndex];
      const endPosition = match.position + match.length;

      // Get matched text (already has correct capitalization from source text)
      const matchedText = text.substring(match.position, endPosition);

      segments.push({
        type: 'semantic',
        text: matchedText,
        start: match.position,
        end: endPosition,
        unitIndex: unitData.index,
        originalText: unitData.original,
        translatedText: matchedText,
        source: unitData.metadata?.source || 'unknown',
        metadata: unitData.metadata,
        isClickable: true,
      });

      currentPosition = endPosition;
    }

    // Add remaining text
    if (currentPosition < text.length) {
      const remainingText = text.substring(currentPosition);
      this.addNonSemanticSegments(segments, remainingText, currentPosition);
    }

    return segments;
  }

  /**
   * Add non-semantic text segments (spaces, line breaks, text)
   * @param segments - Segments array to append to
   * @param text - Non-semantic text
   * @param startPosition - Starting position in original text
   */
  static addNonSemanticSegments(segments: Segment[], text: string, startPosition: number): void {
    let position = 0;

    while (position < text.length) {
      const char = text[position];

      if (char === ' ') {
        segments.push({
          type: 'space',
          text: ' ',
          start: startPosition + position,
          end: startPosition + position + 1,
          unitIndex: -1,
          isClickable: false,
        });
        position++;
      } else if (/[\r\n]/.test(char)) {
        let lineBreakEnd = position;
        while (lineBreakEnd < text.length && /[\r\n]/.test(text[lineBreakEnd])) {
          lineBreakEnd++;
        }

        segments.push({
          type: 'text',
          text: text.substring(position, lineBreakEnd),
          start: startPosition + position,
          end: startPosition + lineBreakEnd,
          unitIndex: -1,
          isClickable: false,
        });
        position = lineBreakEnd;
      } else {
        // Find next boundary
        let nextBoundary = position + 1;
        while (nextBoundary < text.length && !TEXT_BOUNDARY.test(text[nextBoundary])) {
          nextBoundary++;
        }

        const nonSemanticText = text.substring(position, nextBoundary);
        segments.push({
          type: 'text',
          text: nonSemanticText,
          start: startPosition + position,
          end: startPosition + nextBoundary,
          unitIndex: -1,
          isClickable: false,
        });

        position = nextBoundary;
      }
    }
  }

  /**
   * JavaScript fallback segment computation (original implementation)
   * @param text - The full translated text
   * @param semanticArrays - Semantic arrays from translation
   * @returns Pre-computed segments with positions and metadata
   */
  static precomputeSegmentsJS(text: string, semanticArrays: SemanticArrays): Segment[] {
    if (!semanticArrays || !semanticArrays.translated || semanticArrays.translated.length === 0) {
      return [];
    }

    // CRITICAL BUG FIX: Normalize text to NFC for consistent Unicode handling
    // Vietnamese diacritics can be NFC (precomposed) or NFD (decomposed)
    // Normalizing ensures .length calculations are consistent across all units
    // Example: "màu" NFC=3 chars, NFD=4 chars (m+a+combining-grave+u)
    // CODE REVIEW FIX (2026-02-07): Use shared helper instead of inline .normalize('NFC')
    text = normalizeVietnameseText(text)!;

    const { translated, original, metadata } = semanticArrays;

    // CRITICAL-1 FIX: Removed redundant metadata validation
    // Validation already performed in ClickableTranslationSemantic.tsx:69-112
    // Duplicate validation caused 2x CPU cost and duplicate warning logs
    // Upstream components handle validation and fallback to indexOf when metadata invalid

    const segments: Segment[] = [];
    let currentPosition = 0;

    // Create a lookup map for faster unit matching - don't use keys, use direct comparison
    // HIGH-5 FIX: Pre-filter empty units to avoid wasting iteration cycles
    // Empty units cannot match any text, filtering saves n iterations per position
    // CRITICAL BUG FIX: Normalize units to NFC for consistent matching with normalized text
    // CODE REVIEW FIX (2026-02-07): Use shared helper for array normalization
    const allUnits: UnitData[] = translated
      .map((unit, index) => ({
        index,
        unit: normalizeVietnameseText(unit),
        original: original[index],
        metadata: metadata[index],
      }))
      .filter((unitData): unitData is UnitData => !!unitData.unit && unitData.unit.length > 0);

    // Sort units by their tokenIndex to ensure text-order processing for duplicates
    // HIGH-3 FIX: Use optional chaining to prevent crash if metadata is null/undefined
    const filteredUnits = allUnits.sort((a, b) => {
      const aIndex = a.metadata?.tokenIndex ?? 0;
      const bIndex = b.metadata?.tokenIndex ?? 0;
      return aIndex - bIndex;
    });

    // Build first-character index for O(1) candidate lookup instead of scanning all units.
    // Keyed on lowercased first char to match the case-insensitive comparison in findUnitMatch.
    const firstCharIndex = new Map<string, UnitData[]>();
    for (const unitData of filteredUnits) {
      const fc = unitData.unit[0].toLowerCase();
      if (!firstCharIndex.has(fc)) {
        firstCharIndex.set(fc, []);
      }
      firstCharIndex.get(fc)!.push(unitData);
    }

    // HIGH-3 DOCUMENTATION: Track used indices to ensure duplicate units map correctly
    // Set size: Grows linearly with semantic array length (max = semanticArrays.translated.length)
    // Memory: ~1 byte per entry, typical max ~10KB for 10,000 char texts
    // Lifecycle: Cleared at function end, no unbounded growth risk
    const usedIndices = new Set<number>();

    while (currentPosition < text.length) {
      let bestMatch: UnitData | null = null;
      let bestLength = 0;
      let bestOffset = 0;

      // Find the best matching unit at current position with smart conflict resolution
      // Extract remainingText once per outer iteration — it doesn't change inside the inner loop
      const remainingText = text.substring(currentPosition);

      // Pre-compute the offset past leading punctuation/whitespace once — same logic as
      // findUnitMatch uses internally. This lets us pick the correct lookup character for
      // the first-char index without re-scanning punctuation per candidate.
      let effectiveOffset = 0;
      while (
        effectiveOffset < remainingText.length &&
        PUNCTUATION_AND_WHITESPACE.test(remainingText[effectiveOffset])
      ) {
        effectiveOffset++;
      }

      // Determine candidate set via first-char index.
      // Zero-width chars (\u200B-\u200D, \uFEFF) are stripped by normalizeText but not
      // caught by the punctuation offset loop — fall back to full scan in that rare case.
      let candidates: UnitData[];
      if (/[\u200B-\u200D\uFEFF]/.test(remainingText[0] || '')) {
        candidates = filteredUnits;
      } else {
        const lookupChar =
          effectiveOffset < remainingText.length
            ? remainingText[effectiveOffset].toLowerCase()
            : '';
        candidates = firstCharIndex.get(lookupChar) || [];
      }

      for (const unitData of candidates) {
        // Skip already used semantic indices to handle duplicates correctly
        if (usedIndices.has(unitData.index)) continue;

        // Enhanced matching: handle punctuation and quotes
        const matchResult = this.findUnitMatch(remainingText, unitData.unit);

        if (matchResult.found) {
          // Prioritize longer matches first.
          // NOTE on same-length tie-breaking: strict > means the first candidate in
          // filteredUnits (sorted by tokenIndex, i.e. lower source-position first) wins
          // all same-length ties. For character-only mode this is always correct because
          // output order == source order. If this path is ever used for reordered phrase
          // output (currently it is not), prefer the candidate whose position metadata
          // tokenIndex matches the expected text order instead.
          if (unitData.unit.length > bestLength) {
            bestMatch = unitData;
            bestLength = unitData.unit.length;
            bestOffset = matchResult.offset;
          }
        } else if (process.env.NODE_ENV === 'development') {
          // MEDIUM-1 FIX: Log match attempts in development for debugging
          // Only in development to avoid performance impact in production
          const preview = remainingText.substring(0, 20).replace(/\n/g, '\\n');
          logger.debug(
            `  [No match] "${unitData.unit}" at position ${currentPosition} (remaining: "${preview}...")`
          );
        }
      }

      // CRITICAL-7 FIX: Validate greedy match selection and prevent infinite loop
      // CRITICAL-3 FIX: Use grapheme-aware length checking for Vietnamese diacritics
      // CRITICAL-2 FIX: Use shared GraphemeHelper singleton (eliminates per-call instance creation)
      // Ensure selected match can actually be extracted from remaining text
      if (bestMatch) {
        const remainingText = text.substring(currentPosition + bestOffset);
        const graphemeRemaining = getGraphemeLength(remainingText);
        const graphemeUnitLength = getGraphemeLength(bestMatch.unit);

        if (graphemeUnitLength > graphemeRemaining) {
          logger.error('❌ Greedy matching validation failed: match exceeds remaining graphemes', {
            matchGraphemeLength: graphemeUnitLength,
            remainingGraphemeLength: graphemeRemaining,
            currentPosition,
            bestOffset,
            unit: bestMatch.unit,
            impact: 'Skipping to next boundary to prevent infinite loop',
          });
          // CRITICAL-7 FIX: Skip to next word boundary instead of advancing 1 char
          // Prevents infinite loop if match repeatedly exceeds remaining text
          const remainingForBoundary = text.substring(currentPosition);
          const nextBoundaryMatch = remainingForBoundary.search(TEXT_BOUNDARY);
          // MEDIUM-1 FIX: Cap skipDistance to remaining text length to prevent overflow
          const uncappedSkipDistance =
            nextBoundaryMatch > 0 ? nextBoundaryMatch : remainingText.length;
          const skipDistance = Math.min(uncappedSkipDistance, text.length - currentPosition);
          currentPosition += skipDistance;
          continue;
        }
      }

      if (bestMatch) {
        // Handle any punctuation before the match
        if (bestOffset > 0) {
          const punctuationText = text.substring(currentPosition, currentPosition + bestOffset);
          segments.push({
            type: 'text',
            text: punctuationText,
            start: currentPosition,
            end: currentPosition + bestOffset,
            unitIndex: -1,
            isClickable: false,
          });
          currentPosition += bestOffset;
        }

        // Found a semantic unit match - mark as used to handle duplicates correctly
        usedIndices.add(bestMatch.index);

        // CRITICAL BUG FIX: Both text and units are now normalized to NFC (lines 36-37, 56)
        // This ensures .length calculations are consistent for Vietnamese diacritics
        // Example: "màu" is always 3 chars in NFC (not 4 chars in NFD decomposed form)
        const endPosition = Math.min(currentPosition + bestMatch.unit.length, text.length);

        // CRITICAL-1 FIX: Prevent infinite loop from zero-length segments
        if (endPosition === currentPosition) {
          logger.error('❌ Zero-length segment detected - skipping to prevent infinite loop', {
            unitIndex: bestMatch.index,
            unit: bestMatch.unit,
            unitLength: bestMatch.unit.length,
            position: currentPosition,
          });
          currentPosition++; // Force progress
          continue;
        }

        if (endPosition - currentPosition !== bestMatch.unit.length) {
          logger.error('Segment length mismatch (array out-of-bounds prevented):', {
            expected: bestMatch.unit.length,
            actual: endPosition - currentPosition,
            position: currentPosition,
            textLength: text.length,
            unit: bestMatch.unit,
          });
        }

        // Preserve original case from the full text
        const originalCaseText = text.substring(currentPosition, endPosition);

        // Create semantic segment
        segments.push({
          type: 'semantic',
          text: originalCaseText,
          start: currentPosition,
          end: endPosition,
          unitIndex: bestMatch.index,
          originalText: bestMatch.original,
          translatedText: originalCaseText,
          source: bestMatch.metadata.source,
          metadata: bestMatch.metadata,
          isClickable: true,
        });

        currentPosition = endPosition;
      } else {
        // No semantic unit matches - advance carefully to avoid consuming potential matches
        const char = text[currentPosition];

        if (char === ' ') {
          // Handle spaces separately
          segments.push({
            type: 'space',
            text: ' ',
            start: currentPosition,
            end: currentPosition + 1,
            unitIndex: -1,
            isClickable: false,
          });
          currentPosition++;
        } else if (/[\r\n]/.test(char)) {
          // Handle line breaks
          let lineBreakEnd = currentPosition;
          while (lineBreakEnd < text.length && /[\r\n]/.test(text[lineBreakEnd])) {
            lineBreakEnd++;
          }

          segments.push({
            type: 'text',
            text: text.substring(currentPosition, lineBreakEnd),
            start: currentPosition,
            end: lineBreakEnd,
            unitIndex: -1,
            isClickable: false,
          });
          currentPosition = lineBreakEnd;
        } else {
          // Handle single character - but check if the next few characters might form a match
          // Advance to next logical boundary (space, punctuation, or line break)
          let nextBoundary = currentPosition + 1;
          while (nextBoundary < text.length && !TEXT_BOUNDARY.test(text[nextBoundary])) {
            nextBoundary++;
          }

          const nonSemanticText = text.substring(currentPosition, nextBoundary);
          segments.push({
            type: 'text',
            text: nonSemanticText,
            start: currentPosition,
            end: nextBoundary,
            unitIndex: -1,
            isClickable: false,
          });

          // CRITICAL-1 FIX: Ensure forward progress to prevent infinite loop
          // If nextBoundary equals currentPosition (shouldn't happen but safety check),
          // force at least 1 character advance to prevent infinite loop
          if (nextBoundary === currentPosition) {
            logger.error('❌ Zero progress detected in SegmentPrecomputer - forcing advance', {
              currentPosition,
              nextBoundary,
              remainingText: text.substring(
                currentPosition,
                Math.min(currentPosition + 20, text.length)
              ),
            });
            nextBoundary = currentPosition + 1;
          }
          currentPosition = nextBoundary;
        }
      }
    }

    return segments;
  }

  /**
   * Pre-compute segments for original text
   * @param text - The full original text
   * @param semanticArrays - Semantic arrays from translation
   * @returns Pre-computed segments for original text
   */
  static precomputeOriginalSegments(text: string, semanticArrays: SemanticArrays): Segment[] {
    if (!semanticArrays || !semanticArrays.original || semanticArrays.original.length === 0) {
      return [];
    }

    // Fast path: use stored originalStart positions when all entries have them.
    // This is always accurate because positions come directly from token.start (Chinese text offsets),
    // bypassing the greedy scan whose first-available tie-breaking can diverge from the
    // Vietnamese panel's assignment order.
    const allHavePositions =
      semanticArrays.metadata.length > 0 &&
      semanticArrays.metadata.every(
        (m) => m && m.originalStart !== undefined && m.originalStart >= 0
      );
    if (allHavePositions) {
      return SegmentPrecomputer.buildSegmentsFromPositions(text, semanticArrays);
    }

    const { original, translated, metadata } = semanticArrays;

    const segments: Segment[] = [];
    let currentPosition = 0;
    const usedIndices = new Set<number>();

    // Build first-character index for O(1) candidate lookup instead of scanning all units
    const firstCharIndex = new Map<string, number[]>();
    for (let i = 0; i < original.length; i++) {
      if (!original[i] || original[i].length === 0) continue;
      const firstChar = original[i][0];
      if (!firstCharIndex.has(firstChar)) {
        firstCharIndex.set(firstChar, []);
      }
      firstCharIndex.get(firstChar)!.push(i);
    }

    // Sort each candidate list by tokenIndex ascending so the greedy scan selects
    // entries in original-text order regardless of semantic-array-insertion order.
    // Without this, parallel-chunk scrambling causes entries from later chunks (higher
    // tokenIndex) to land at lower array indices and get consumed first, assigning
    // wrong unitIndices to duplicate characters (e.g. unitIndex for 1st 是 gets
    // assigned to 4th 是 because three other 是 entries had lower array indices).
    for (const indices of firstCharIndex.values()) {
      indices.sort((a, b) => (metadata[a]?.tokenIndex ?? 0) - (metadata[b]?.tokenIndex ?? 0));
    }

    while (currentPosition < text.length) {
      let bestMatch: {
        index: number;
        unit: string;
        translated: string;
        metadata: any;
      } | null = null;
      let bestStartPos = -1;

      // Only check units whose first character matches the current position
      const candidateIndices = firstCharIndex.get(text[currentPosition]) || [];
      for (const i of candidateIndices) {
        if (usedIndices.has(i)) continue;

        const unit = original[i];

        // Check if unit matches at current position using startsWith with offset (no substring)
        if (
          unit.length <= text.length - currentPosition &&
          text.startsWith(unit, currentPosition)
        ) {
          if (!bestMatch || unit.length > bestMatch.unit.length) {
            bestMatch = {
              index: i,
              unit: unit,
              translated: translated[i],
              metadata: metadata[i],
            };
            bestStartPos = currentPosition;
          }
        }
      }

      if (bestMatch && bestStartPos >= currentPosition) {
        // Add any skipped characters as non-clickable text
        if (bestStartPos > currentPosition) {
          const skippedText = text.substring(currentPosition, bestStartPos);
          segments.push({
            type: 'text',
            text: skippedText,
            start: currentPosition,
            end: bestStartPos,
            unitIndex: -1,
            isClickable: false,
          });
        }

        // Add the semantic unit
        segments.push({
          type: 'semantic',
          text: bestMatch.unit,
          start: bestStartPos,
          end: bestStartPos + bestMatch.unit.length,
          unitIndex: bestMatch.index,
          originalText: bestMatch.unit,
          translatedText: bestMatch.translated,
          source: bestMatch.metadata.source,
          metadata: bestMatch.metadata,
          isClickable: true,
        });

        usedIndices.add(bestMatch.index);
        currentPosition = bestStartPos + bestMatch.unit.length;
      } else {
        // No match found, add current character as non-clickable
        const char = text[currentPosition];
        segments.push({
          type: 'text',
          text: char,
          start: currentPosition,
          end: currentPosition + 1,
          unitIndex: -1,
          isClickable: false,
        });
        currentPosition++;
      }
    }

    return segments;
  }

  /**
   * Direct-placement path: build Chinese-panel segments using stored originalStart positions.
   * Called when all metadata entries have originalStart >= 0 (set during postProcess).
   * Avoids the greedy scan's first-available tie-breaking, which can diverge from the
   * Vietnamese panel's assignment order for duplicate translated words.
   */
  private static buildSegmentsFromPositions(
    text: string,
    semanticArrays: SemanticArrays
  ): Segment[] {
    const { original, translated, metadata } = semanticArrays;

    // Sort entries by originalStart to walk the Chinese text in order
    const sorted = metadata
      .map((meta, i) => ({ i, meta }))
      .filter(({ meta }) => meta.originalStart >= 0)
      .sort((a, b) => a.meta.originalStart - b.meta.originalStart);

    const segments: Segment[] = [];
    let currentPosition = 0;

    for (const { i, meta } of sorted) {
      // Skip if this entry's range has already been covered (overlap guard)
      if (meta.originalStart < currentPosition) continue;

      // Add gap text before this entry
      if (meta.originalStart > currentPosition) {
        segments.push({
          type: 'text',
          text: text.substring(currentPosition, meta.originalStart),
          start: currentPosition,
          end: meta.originalStart,
          unitIndex: -1,
          isClickable: false,
        });
      }

      // Add the semantic segment at its recorded position
      const segEnd = Math.min(meta.originalEnd, text.length);
      segments.push({
        type: 'semantic',
        text: text.substring(meta.originalStart, segEnd),
        start: meta.originalStart,
        end: segEnd,
        unitIndex: i,
        originalText: original[i],
        translatedText: translated[i],
        source: meta.source,
        metadata: meta,
        isClickable: true,
      });

      currentPosition = segEnd;
    }

    // Add any remaining text after the last segment
    if (currentPosition < text.length) {
      segments.push({
        type: 'text',
        text: text.substring(currentPosition),
        start: currentPosition,
        end: text.length,
        unitIndex: -1,
        isClickable: false,
      });
    }

    return segments;
  }

  /**
   * Create optimized segment data structure for rendering
   * @param segments - Pre-computed segments
   * @param highlightedUnitIndex - Currently highlighted unit index (original to translation)
   * @param highlightedTranslationUnitIndex - Currently highlighted translation index (translation to original)
   * @returns Render-optimized segments
   */
  static createRenderSegments(
    segments: Segment[],
    highlightedUnitIndex: number = -1,
    highlightedTranslationUnitIndex: number = -1
  ): RenderSegment[] {
    return segments.map((segment, index) => {
      const isHighlighted =
        segment.unitIndex === highlightedUnitIndex ||
        segment.unitIndex === highlightedTranslationUnitIndex;
      return {
        ...segment,
        key: `segment-${segment.type}-${index}-${segment.start}`,
        isHighlighted,
        className: this.getSegmentClassName(segment, isHighlighted),
      };
    });
  }

  /**
   * Get optimized CSS class name for segment
   * @param segment - Segment data
   * @param isHighlighted - Whether segment is highlighted
   * @returns CSS class name
   */
  static getSegmentClassName(segment: Segment, isHighlighted: boolean): string {
    const classes: string[] = ['segment'];

    if (segment.isClickable) {
      classes.push('clickable');

      // Add source-specific styling
      if (segment.source) {
        classes.push(`source-${segment.source.replace(/[^a-zA-Z0-9]/g, '-')}`);
      }

      if (isHighlighted) {
        classes.push('highlighted');
      }
    }

    return classes.join(' ');
  }

  /**
   * Extract highlight styles for better performance
   * @param isHighlighted - Whether segment is highlighted
   * @returns Style object
   */
  static getSegmentStyles(isHighlighted: boolean): { color?: string; fontWeight?: number } {
    if (isHighlighted) {
      return {
        color: 'var(--primary-color)',
        fontWeight: 600,
      };
    }

    return {};
  }

  /**
   * Optimize segments for virtual scrolling
   * @param segments - Pre-computed segments
   * @param startIndex - Start index for visible area
   * @param endIndex - End index for visible area
   * @returns Visible segments only
   */
  static getVisibleSegments(segments: Segment[], startIndex: number, endIndex: number): Segment[] {
    return segments.slice(startIndex, endIndex + 1);
  }

  /**
   * Find a semantic unit match with offset information
   * @param remainingText - Text remaining to match against
   * @param unitText - Semantic unit text to find
   * @returns Match result with found flag and offset
   */
  static findUnitMatch(remainingText: string, unitText: string): MatchResult {
    // HIGH-3 FIX: Validate input BEFORE offset calculation to prevent invalid processing
    // Previous: Safety check happened AFTER offset loop (line 474)
    // Fixed: Pre-validation ensures offset calculation works on valid data
    if (!remainingText || remainingText.length === 0) {
      return { found: false, offset: 0 };
    }

    // MEDIUM-3 FIX: Ensure offset calculation happens BEFORE normalization
    // CRITICAL SEPARATION: Offset uses RAW text, normalization only for comparison
    // Step 1: Calculate offset from RAW text (BEFORE any normalization)
    let offset = 0;
    while (offset < remainingText.length) {
      const char = remainingText[offset];
      // MEDIUM-4 FIX: Use named constant instead of magic regex
      if (PUNCTUATION_AND_WHITESPACE.test(char)) {
        offset++;
      } else {
        break;
      }
    }

    // Step 2: NOW normalize for comparison (offset already calculated from raw text)
    const remaining = this.normalizeText(remainingText);
    const unit = this.normalizeText(unitText);

    // First try exact match at offset 0 (fastest)
    if (remaining.startsWith(unit)) {
      return { found: true, offset: 0 };
    }

    if (offset > 0) {
      const textAfterPunctuation = this.normalizeText(remainingText.substring(offset));
      if (textAfterPunctuation.startsWith(unit)) {
        // IMPORTANT-5: Runtime enforcement - validate offset uses original text length
        // Catch bugs where normalized length might accidentally be used for positions
        if (offset >= remainingText.length) {
          logger.error('❌ normalizeText safety violation: offset exceeds original text length', {
            offset,
            originalLength: remainingText.length,
            normalizedLength: remaining.length,
            unitText,
            impact: 'Would cause array out-of-bounds in position calculation',
          });
          return { found: false, offset: 0 };
        }
        return { found: true, offset };
      }
    }

    return { found: false, offset: 0 };
  }

  /**
   * Normalize text for more reliable matching
   *
   * CRITICAL: This method is ONLY used for text comparison (case-insensitive matching),
   * NOT for position calculation. Position offsets are always calculated from the
   * original, non-normalized text to ensure accurate click highlighting.
   *
   * Why this is safe:
   * - findUnitMatch() calculates offset from raw text (lines 365-379)
   * - normalizeText() only used in startsWith() comparison (lines 359, 383)
   * - Positions stored use original text length, not normalized length
   *
   * @param text - Text to normalize
   * @returns Normalized text (lowercase, whitespace collapsed, zero-width removed)
   */
  static normalizeText(text: string): string {
    return (
      text
        .toLowerCase()
        .trim()
        // Normalize all types of whitespace including CJK full-width spaces
        .replace(/[\s\u3000\u2000-\u200F\u2028\u2029]+/g, ' ')
        // Remove zero-width characters that might interfere
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
    );
  }

  // CRITICAL-2 FIX: Removed duplicate getGraphemeLength() method
  // Now using shared GraphemeHelper.getGraphemeLength() with singleton Intl.Segmenter
  // Eliminates per-call instance creation overhead (0.1-0.5ms × n calls)
}
