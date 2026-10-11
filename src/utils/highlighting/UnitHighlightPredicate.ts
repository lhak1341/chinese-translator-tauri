/**
 * Shared "is this unit highlighted" predicate for the Clickable* components.
 *
 * The three Clickable* components (ClickableOriginalSemantic, ClickableTranslationSemantic,
 * ClickableTranslationOptimized) each independently reimplemented a null/undefined-guarded,
 * array-or-scalar equality check against one or more highlight-index props. The three real
 * shapes: one scalar prop, one array-capable prop, and two scalar props OR'd together — this
 * predicate takes any number of highlight values (each scalar, array, null, or undefined) so
 * all three shapes call the same function.
 */
export function isUnitHighlighted(
  unitIndex: number,
  ...highlightValues: Array<number | number[] | null | undefined>
): boolean {
  for (const value of highlightValues) {
    if (value === null || value === undefined) continue;
    // -1 is the codebase-wide "cleared" sentinel (see HighlightResolver.ts) — never
    // treat it as a match, even if unitIndex itself were somehow -1.
    if (Array.isArray(value)) {
      if (value.includes(unitIndex) && unitIndex !== -1) return true;
    } else if (value === unitIndex && unitIndex !== -1) {
      return true;
    }
  }
  return false;
}
