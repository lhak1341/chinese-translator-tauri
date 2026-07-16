import { getFirstGrapheme } from '../GraphemeHelper.js';

/**
 * Resolves a possibly-missing tokenIndex to a value that sorts last. Chinese-text-order
 * comparators across the codebase (SegmentPrecomputer, TranslationEngine's word-level
 * builder) all need the same answer for "what if metadata is missing or corrupted" —
 * previously two call sites disagreed (?? 0 vs ?? Number.MAX_SAFE_INTEGER), silently
 * sorting a corrupted entry to the front in one place and the back in another. Treats
 * null, undefined, and negative sentinels (-1) all as "missing."
 */
export function resolveTokenIndex(tokenIndex: number | null | undefined): number {
  return tokenIndex == null || tokenIndex < 0 ? Number.MAX_SAFE_INTEGER : tokenIndex;
}

/**
 * Chinese-text-order comparator for anything carrying a tokenIndex. Missing/corrupted
 * tokenIndex sorts last (see resolveTokenIndex).
 */
export function compareByTokenIndex(
  a: number | null | undefined,
  b: number | null | undefined
): number {
  return resolveTokenIndex(a) - resolveTokenIndex(b);
}

/**
 * Greedy longest-match position mapper for semantic unit arrays.
 *
 * Maps each character position in `text` to the index of the unit in `units[0..count)`
 * that covers it. Returns an Int32Array of length `text.length`; unmapped positions are -1.
 *
 * Bug history (from SemanticArrayBuilder private methods):
 *   CRITICAL-1: empty units skip index build to prevent [0] crash
 *   MEDIUM-2:   first-character lookup uses getFirstGrapheme (handles Vietnamese combining diacritics)
 *   CRITICAL-5: explicit bounds check before inner comparison loop
 */
export function mapToPositions(
  text: string,
  units: readonly string[],
  count: number,
  caseInsensitive: boolean = false
): Int32Array {
  const positions = new Int32Array(text.length).fill(-1);
  if (!text || text.length === 0 || count === 0) return positions;

  const textCmp = caseInsensitive ? text.toLowerCase() : text;

  // Build first-grapheme index for O(1) candidate lookup (40-60% speedup on large texts)
  const firstGraphemeIdx = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const unit = units[i];
    if (!unit || unit.length === 0) continue; // CRITICAL-1
    const fg = caseInsensitive ? getFirstGrapheme(unit).toLowerCase() : getFirstGrapheme(unit);
    let bucket = firstGraphemeIdx.get(fg);
    if (!bucket) {
      bucket = [];
      firstGraphemeIdx.set(fg, bucket);
    }
    bucket.push(i);
  }

  const usedIndices = new Set<number>();
  let pos = 0;

  while (pos < text.length) {
    // MEDIUM-2: grapheme-aware lookup for current position
    const fg = caseInsensitive
      ? getFirstGrapheme(text.substring(pos)).toLowerCase()
      : getFirstGrapheme(text.substring(pos));
    const candidates = firstGraphemeIdx.get(fg);
    if (!candidates) {
      pos++;
      continue;
    }

    let bestIdx = -1;
    let bestLen = 0;

    for (const i of candidates) {
      if (usedIndices.has(i)) continue;

      const unit = units[i];
      const unitCmp = caseInsensitive ? unit.toLowerCase() : unit;
      const remaining = text.length - pos;

      // CRITICAL-5: explicit bounds check before inner loop
      if (
        unitCmp.length <= remaining &&
        unitCmp.length > bestLen &&
        pos + unitCmp.length <= textCmp.length
      ) {
        let matches = true;
        for (let j = 0; j < unitCmp.length; j++) {
          if (textCmp[pos + j] !== unitCmp[j]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          bestIdx = i;
          bestLen = unit.length; // original length drives position fill and advancement
        }
      }
    }

    if (bestIdx !== -1) {
      for (let j = 0; j < bestLen; j++) positions[pos + j] = bestIdx;
      usedIndices.add(bestIdx);
      pos += bestLen;
    } else {
      pos++;
    }
  }

  return positions;
}
