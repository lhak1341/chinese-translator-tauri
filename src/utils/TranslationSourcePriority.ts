/**
 * Translation source string priority mapping.
 *
 * Extracted from TranslationEngine.js:translateSinglePass() so that:
 * - Tests can import the real function instead of duplicating it.
 * - Call sites outside the engine can type-check their translationSource values.
 *
 * Keys must match the actual translationSource strings written onto tokens —
 * NOT the phase-group labels used in REQUIRED_PHASE_ORDER.
 * Lower numbers = higher priority (earlier phases override later).
 *
 * INVARIANT: getSourcePriority() returns 999 for any unrecognised string.
 * That silently deprioritizes the token below character-level fallback with
 * no error. Always use a TranslationLeaderSource at assignment sites.
 */

import type { TranslationSource } from '../types/TranslationEngineTypes';

export const PHASE_PRIORITIES: Record<string, number> = {
  // Phase 1 — Pattern (all source strings from JS and WASM paths)
  pattern: 1,
  hierarchical_pattern: 1,
  hierarchical_patterns: 1,
  hierarchical_patterns_composite: 1,
  // Phase 2 — Proper noun: dynamic dictionary names resolved separately
  // Phase 3 — Number
  number_conversion: 3,
  number_plus_liang_fix: 3,
  // Phase 4 — Phrase
  phrases: 4,
  // Phase 5 — Character
  characters: 5,
};

/**
 * Returns the phase priority for a leader translationSource string.
 *
 * - Returns null for consumed sources (includes '_consumed') — they are not leaders.
 * - Returns 2 for dynamic proper-noun dictionary names (Phase 2) when present in activeProperNouns.
 * - Returns 999 for unrecognised sources so priority violations are not silently missed.
 *
 * In TranslationEngine.js this is wrapped per-call as:
 *   const getSourcePriority = (src) => getSourcePriorityFn(src, this.activeProperNouns);
 */
export function getSourcePriority(
  translationSource: TranslationSource | string | null | undefined,
  activeProperNouns: string[] = []
): number | null {
  if (!translationSource || translationSource.includes('_consumed')) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(PHASE_PRIORITIES, translationSource)) {
    return PHASE_PRIORITIES[translationSource];
  }
  if (activeProperNouns.includes(translationSource)) {
    return 2;
  }
  return 999;
}
