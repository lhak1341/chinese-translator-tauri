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

import type {
  ProperNounSource,
  TranslationLeaderSource,
  TranslationSource,
} from '../types/TranslationEngineTypes';
import { logger } from './logger';

/** Every static leader source; the proper-noun sources are dynamic (dictionary names). */
type StaticLeaderSource = Exclude<TranslationLeaderSource, ProperNounSource>;

const CONSUMED_SUFFIX = '_consumed';

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
} satisfies Record<StaticLeaderSource, number>; // a source added to the type but not here fails tsc

/** The leader sources a Phase 1 pattern match writes (JS adapter and WASM paths). */
const PATTERN_SOURCES: ReadonlySet<string> = new Set(
  Object.keys(PHASE_PRIORITIES).filter((source) => PHASE_PRIORITIES[source] === 1)
);

/** Source a follower of `leaderSource` carries: consumed by that leader, `translated: null`. */
export function consumedSource(leaderSource: string): string {
  return leaderSource + CONSUMED_SUFFIX;
}

/**
 * True when `source` marks a consumed follower. With `leaderSource`, true only for a follower
 * of exactly that leader.
 */
export function isConsumedSource(
  source: string | null | undefined,
  leaderSource?: string
): boolean {
  if (!source) return false;
  return leaderSource === undefined
    ? source.endsWith(CONSUMED_SUFFIX)
    : source === consumedSource(leaderSource);
}

/** True for any Phase 1 pattern leader source. */
export function isPatternSource(source: string | null | undefined): boolean {
  return !!source && PATTERN_SOURCES.has(source);
}

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
  if (!translationSource || isConsumedSource(translationSource)) {
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

interface ContractToken {
  value?: string;
  translated?: unknown;
  translationSource?: string | null;
}

/**
 * Enforces the consumed-token contract after a phase, in both directions:
 *   (A) consumed source  -> `translated` must be null (corrected in place, so no "undefined"
 *       reaches the output);
 *   (B) leader source    -> `translated` must NOT be null (postProcess skips a null leader and
 *       its characters vanish), and the source must be one `getSourcePriority` recognises
 *       (an unrecognised one ranks 999, below the character fallback, with no other symptom).
 * Violations are logged, never thrown — the pipeline keeps going with the best state it has.
 */
export function validateConsumedTokenContract(
  tokens: ContractToken[],
  phaseName: string,
  activeProperNouns: string[] = []
): void {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.translationSource) continue;

    if (isConsumedSource(token.translationSource)) {
      if (token.translated !== null) {
        logger.error(
          `🚨 ${phaseName} consumed token contract violation at token ${i}: ` +
            `translated="${token.translated}" (expected null), ` +
            `source="${token.translationSource}"`
        );
        token.translated = null;
      }
      continue;
    }

    if (token.translated === null) {
      logger.error(
        `🚨 ${phaseName} leader token contract violation at token ${i}: ` +
          `translationSource="${token.translationSource}" but translated=null ` +
          `(token value="${token.value}" — characters will be deleted from output)`
      );
    }
    if (getSourcePriority(token.translationSource, activeProperNouns) === 999) {
      logger.error(
        `🚨 ${phaseName} unrecognised leader source at token ${i}: ` +
          `"${token.translationSource}" ranks 999, below the character fallback`
      );
    }
  }
}
