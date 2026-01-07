/**
 * Position Mapping Builder for Clickable Highlighting
 *
 * Builds bi-directional position mappings between original Chinese text and
 * translated Vietnamese text for clickable highlighting functionality.
 *
 * Algorithm:
 * 1. Segment both texts using semantic arrays (translation units)
 * 2. Match segments by semantic index (original[i] ↔ translated[i])
 * 3. Create bi-directional mappings for click navigation
 *
 * Features:
 * - Case-insensitive matching for translated text
 * - Handles non-semantic characters (punctuation, spaces)
 * - Preserves 1:1 correspondence between original and translation
 * - Pure function - no side effects, easy to test
 *
 * @example
 * const mappings = buildPositionMappings(
 *   semanticArrays,
 *   "在那些魔帅眼中",
 *   "Ở trong mắt những ma soái kia"
 * );
 *
 * // Click on original segment 5 -> find corresponding translation segment
 * const translatedSegmentId = mappings.originalToTranslated.get(5);
 */

/**
 * @typedef {Object} TextSegment
 * @property {number} segmentId - Unique segment identifier
 * @property {number} start - Start position in text
 * @property {number} end - End position in text
 * @property {string} text - Segment text content
 * @property {number} semanticIndex - Index in semantic array (-1 for non-semantic)
 * @property {boolean} isClickable - Whether segment is clickable
 */

/**
 * @typedef {Object} PositionMappings
 * @property {TextSegment[]} originalSegments - Segments in original text
 * @property {TextSegment[]} translatedSegments - Segments in translated text
 * @property {Map<number, number>} originalToTranslated - Mapping from original segment ID to translated segment ID
 * @property {Map<number, number>} translatedToOriginal - Mapping from translated segment ID to original segment ID
 */

/**
 * @typedef {Object} SemanticArrays
 * @property {string[]} original - Original text semantic units
 * @property {string[]} translated - Translated text semantic units
 */

/**
 * Build position mappings for clickable highlighting
 *
 * @param {SemanticArrays} semanticArrays - Semantic units for both texts
 * @param {string} originalText - Complete original Chinese text
 * @param {string} translatedText - Complete translated Vietnamese text
 * @returns {PositionMappings} Position mappings with segments and bi-directional maps
 */
export function buildPositionMappings(semanticArrays, originalText, translatedText) {
  // Create segments for both texts using the same algorithm
  const originalSegments = [];
  const translatedSegments = [];

  // Build original text segments
  const usedOriginalIndices = new Set();
  let currentPos = 0;
  let segmentId = 0;

  while (currentPos < originalText.length) {
    let bestMatch = null;
    let bestLength = 0;

    // Find longest unused semantic unit at current position
    for (let i = 0; i < semanticArrays.original.length; i++) {
      if (usedOriginalIndices.has(i)) continue;

      const unit = semanticArrays.original[i];
      const remainingText = originalText.substring(currentPos);

      if (remainingText.startsWith(unit) && unit.length > bestLength) {
        bestMatch = { semanticIndex: i, unit, length: unit.length };
        bestLength = unit.length;
      }
    }

    if (bestMatch) {
      originalSegments.push({
        segmentId: segmentId++,
        start: currentPos,
        end: currentPos + bestMatch.length,
        text: originalText.substring(currentPos, currentPos + bestMatch.length),
        semanticIndex: bestMatch.semanticIndex,
        isClickable: true,
      });
      usedOriginalIndices.add(bestMatch.semanticIndex);
      currentPos += bestMatch.length;
    } else {
      // Non-semantic character
      originalSegments.push({
        segmentId: segmentId++,
        start: currentPos,
        end: currentPos + 1,
        text: originalText[currentPos],
        semanticIndex: -1,
        isClickable: false,
      });
      currentPos++;
    }
  }

  // Build translated text segments
  const usedTranslatedIndices = new Set();
  currentPos = 0;
  segmentId = 0;

  while (currentPos < translatedText.length) {
    let bestMatch = null;
    let bestLength = 0;

    // Find longest unused semantic unit at current position (case-insensitive)
    for (let i = 0; i < semanticArrays.translated.length; i++) {
      if (usedTranslatedIndices.has(i)) continue;

      const unit = semanticArrays.translated[i];
      const remainingText = translatedText.substring(currentPos);

      if (remainingText.toLowerCase().startsWith(unit.toLowerCase()) && unit.length > bestLength) {
        bestMatch = { semanticIndex: i, unit, length: unit.length };
        bestLength = unit.length;
      }
    }

    if (bestMatch) {
      translatedSegments.push({
        segmentId: segmentId++,
        start: currentPos,
        end: currentPos + bestMatch.length,
        text: translatedText.substring(currentPos, currentPos + bestMatch.length),
        semanticIndex: bestMatch.semanticIndex,
        isClickable: true,
      });
      usedTranslatedIndices.add(bestMatch.semanticIndex);
      currentPos += bestMatch.length;
    } else {
      // Non-semantic character
      translatedSegments.push({
        segmentId: segmentId++,
        start: currentPos,
        end: currentPos + 1,
        text: translatedText[currentPos],
        semanticIndex: -1,
        isClickable: false,
      });
      currentPos++;
    }
  }

  // Build correspondence mappings
  const originalToTranslated = new Map(); // original segment ID -> translated segment ID
  const translatedToOriginal = new Map(); // translated segment ID -> original segment ID

  // Match segments by semantic index
  const originalBySemanticIndex = new Map();
  const translatedBySemanticIndex = new Map();

  originalSegments.forEach((segment) => {
    if (segment.isClickable) {
      if (!originalBySemanticIndex.has(segment.semanticIndex)) {
        originalBySemanticIndex.set(segment.semanticIndex, []);
      }
      originalBySemanticIndex.get(segment.semanticIndex).push(segment);
    }
  });

  translatedSegments.forEach((segment) => {
    if (segment.isClickable) {
      if (!translatedBySemanticIndex.has(segment.semanticIndex)) {
        translatedBySemanticIndex.set(segment.semanticIndex, []);
      }
      translatedBySemanticIndex.get(segment.semanticIndex).push(segment);
    }
  });

  // Create 1:1 mappings by position order within each semantic index group
  for (const [semanticIndex, originalSegs] of originalBySemanticIndex) {
    const translatedSegs = translatedBySemanticIndex.get(semanticIndex) || [];

    for (let i = 0; i < Math.max(originalSegs.length, translatedSegs.length); i++) {
      const origSeg = originalSegs[i];
      const transSeg = translatedSegs[i];

      if (origSeg && transSeg) {
        originalToTranslated.set(origSeg.segmentId, transSeg.segmentId);
        translatedToOriginal.set(transSeg.segmentId, origSeg.segmentId);
      }
    }
  }

  return {
    originalSegments,
    translatedSegments,
    originalToTranslated,
    translatedToOriginal,
  };
}
