import { toPatternsId } from './DictionaryIdClassifier';

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
  return activeProperNouns.filter((id) => id.startsWith('properNouns-')).sort()[0];
}

/**
 * Resolves the Cmd-6 Quick Add target: the structural-pattern dict paired with the default
 * proper-nouns dict (ADR-027) if it's a fiction dict, else paired with the first active
 * fiction dict (sorted). Returns undefined if no active fiction dict exists.
 *
 * Does not check whether the resolved dict actually exists on disk — callers verify
 * existence themselves (in-memory state vs an IPC call, depending on caller).
 */
export function resolveStructuralPatternQuickAddTarget(
  defaultQuickAddDictionary: string | undefined | null,
  activeProperNouns: string[]
): string | undefined {
  if (defaultQuickAddDictionary?.startsWith('properNouns-f_')) {
    return toPatternsId(defaultQuickAddDictionary);
  }
  const firstFiction = activeProperNouns.filter((id) => id.startsWith('properNouns-f_')).sort()[0];
  return firstFiction ? toPatternsId(firstFiction) : undefined;
}
