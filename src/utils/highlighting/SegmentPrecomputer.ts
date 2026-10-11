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

import { getFirstGrapheme } from '../GraphemeHelper.js';
import { compareByTokenIndex } from './TextPositionMapper';
import { buildSegmentsFromPositions } from './PositionBasedSegmentBuilder';
import type { Segment, SemanticArrayMetadata, SemanticArrays } from '../../types/SemanticTypes';

/**
 * Empty SemanticArrays — the shared fallback shape for `semanticArrayBuilder?.getArrays() || ...`
 * call sites (architecture review 2026-08-15, candidate #4). Was hand-copied at 7 sites across
 * TranslationEngine.js before being unified here.
 */
export function emptySemanticArrays(): SemanticArrays {
  return { original: [], translated: [], metadata: [] };
}

/**
 * Pre-compute segments for original Chinese text.
 * @param text - The full original text
 * @param semanticArrays - Semantic arrays from translation
 * @returns Pre-computed segments for original text
 */
export function precomputeOriginalSegments(
  text: string,
  semanticArrays: SemanticArrays
): Segment[] {
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
    return buildSegmentsFromPositions(text, semanticArrays);
  }

  const { original, translated, metadata } = semanticArrays;

  const segments: Segment[] = [];
  let currentPosition = 0;
  const usedIndices = new Set<number>();

  // Build first-character index for O(1) candidate lookup instead of scanning all units
  const firstCharIndex = new Map<string, number[]>();
  for (let i = 0; i < original.length; i++) {
    if (!original[i] || original[i].length === 0) continue;
    const firstChar = getFirstGrapheme(original[i]);
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
    indices.sort((a, b) => compareByTokenIndex(metadata[a]?.tokenIndex, metadata[b]?.tokenIndex));
  }

  while (currentPosition < text.length) {
    let bestMatch: {
      index: number;
      unit: string;
      translated: string;
      metadata: SemanticArrayMetadata;
    } | null = null;
    let bestStartPos = -1;

    // Only check units whose first character matches the current position.
    // Must use getFirstGrapheme (not text[currentPosition]) — the map was built with
    // getFirstGrapheme keys, so raw indexing misses combining-diacritic grapheme clusters.
    const candidateIndices =
      firstCharIndex.get(getFirstGrapheme(text.substring(currentPosition))) ?? [];
    for (const i of candidateIndices) {
      if (usedIndices.has(i)) continue;

      const unit = original[i];

      // Check if unit matches at current position using startsWith with offset (no substring)
      if (unit.length <= text.length - currentPosition && text.startsWith(unit, currentPosition)) {
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
