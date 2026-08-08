/**
 * Pure matching/transform logic for Transform Rules. No React/Tauri/WASM
 * dependency — see CONTEXT.md's "Transform Rule" glossary entry for the
 * full contract this implements.
 */
import type { TransformRule } from '../../types/TransformRuleTypes';
import {
  titleCaseExceptLastN,
  moveLastNWordsToBeginning,
  capitalizeExceptFirstN,
  moveFirstNWordsToEnd,
} from '../wordTransformHelpers';

function ruleMatches(rule: TransformRule, source: string): boolean {
  if (!rule.enabled) return false;
  if (rule.charCount !== undefined && source.length !== rule.charCount) return false;
  return rule.matchKind === 'suffix' ? source.endsWith(rule.key) : source.startsWith(rule.key);
}

/** Transform Rules apply to phrases/properNouns* entries only — not patterns*, whose
 * Source is a literal X/Y placeholder template rather than plain Chinese content. */
export function dictionarySupportsTransformRules(dictionaryId: string): boolean {
  return dictionaryId === 'phrases' || dictionaryId.startsWith('properNouns');
}

/**
 * A matching suffix rule always wins outright over a matching prefix rule;
 * within one matchKind pool, the rule with the longer key wins.
 */
export function findBestMatch(rules: TransformRule[], source: string): TransformRule | null {
  const candidates = rules.filter((r) => ruleMatches(r, source));

  const suffixes = candidates
    .filter((r) => r.matchKind === 'suffix')
    .sort((a, b) => b.key.length - a.key.length);
  if (suffixes.length > 0) return suffixes[0];

  const prefixes = candidates
    .filter((r) => r.matchKind === 'prefix')
    .sort((a, b) => b.key.length - a.key.length);
  return prefixes[0] ?? null;
}

/**
 * Applies a matched rule's transform to `source`'s per-character gloss.
 * Capitalize always runs before move, on the pre-move word order — see
 * CONTEXT.md for why order isn't configurable.
 */
export function applyRule(
  rule: TransformRule,
  source: string,
  glossFn: (source: string) => string
): string {
  const gloss = glossFn(source);
  if (rule.matchKind === 'suffix') {
    return moveLastNWordsToBeginning(
      titleCaseExceptLastN(gloss, rule.capitalizeExceptN),
      rule.moveWords
    );
  }
  return moveFirstNWordsToEnd(
    capitalizeExceptFirstN(gloss, rule.capitalizeExceptN),
    rule.moveWords
  );
}

/**
 * Returns the existing rule that collides with `candidate` on (matchKind, key),
 * or undefined if there's no collision. A rule never conflicts with itself.
 */
export function findConflict(
  rules: TransformRule[],
  candidate: Pick<TransformRule, 'id' | 'matchKind' | 'key'>
): TransformRule | undefined {
  return rules.find(
    (r) => r.id !== candidate.id && r.matchKind === candidate.matchKind && r.key === candidate.key
  );
}
