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
