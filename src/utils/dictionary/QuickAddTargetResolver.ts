import { tierOf, toPatternsId, isFictionProperNounsId } from './DictionaryIdClassifier';
import type { DictionaryData } from '../../types/DictionaryTypes';

/**
 * Resolves the Cmd-5 Quick Add target: the default proper-nouns dict if still active,
 * else the first active custom proper-nouns dict (sorted). Returns undefined if neither exists.
 */
export function resolveDefaultProperNounTarget(
  defaultQuickAddDictionary: string | undefined | null,
  activeProperNouns: string[]
): string | undefined {
  if (defaultQuickAddDictionary && activeProperNouns.includes(defaultQuickAddDictionary)) {
    return defaultQuickAddDictionary;
  }
  return activeProperNouns.filter((id) => tierOf(id) !== 'root').sort()[0];
}

/**
 * Resolves the Cmd-6 Quick Add target: the structural-pattern dict paired with the default
 * proper-nouns dict (ADR-027) if it's a fiction dict, else paired with the first active
 * fiction dict (sorted). Returns undefined if no active fiction dict exists.
 *
 * Does not check whether the resolved dict actually exists in memory — use
 * resolveAndVerifyStructuralPatternTarget for the resolve+verify call in one step.
 */
export function resolveStructuralPatternQuickAddTarget(
  defaultQuickAddDictionary: string | undefined | null,
  activeProperNouns: string[]
): string | undefined {
  if (defaultQuickAddDictionary && isFictionProperNounsId(defaultQuickAddDictionary)) {
    return toPatternsId(defaultQuickAddDictionary);
  }
  const firstFiction = activeProperNouns.filter(isFictionProperNounsId).sort()[0];
  return firstFiction ? toPatternsId(firstFiction) : undefined;
}

/**
 * Resolves AND verifies the Cmd-6 Quick Add target in one call: returns the structural-pattern
 * dict ID only if it resolves (see resolveStructuralPatternQuickAddTarget) AND is present in
 * `dictionaries` (in-memory DictionaryContext state). Returns undefined otherwise, so callers
 * don't need a separate existence check.
 */
export function resolveAndVerifyStructuralPatternTarget(
  defaultQuickAddDictionary: string | undefined | null,
  activeProperNouns: string[],
  dictionaries: { [key: string]: DictionaryData }
): string | undefined {
  const target = resolveStructuralPatternQuickAddTarget(
    defaultQuickAddDictionary,
    activeProperNouns
  );
  return target && dictionaries[target] !== undefined ? target : undefined;
}
