/**
 * Pure matching/transform logic for Transform Rules. No React/Tauri/WASM
 * dependency — see CONTEXT.md's "Transform Rule" glossary entry for the
 * full contract this implements.
 */
import type { TransformRule } from '../../types/TransformRuleTypes';
import type { DictionaryData } from '../../types/DictionaryTypes';
import type { SemanticType, PatternSemanticTypeRef } from '../../constants/SemanticTypes';
import { shouldSkipKey } from './DuplicateAnalyzer';
import { getDictionaryLabel } from '../dictionaryHelpers';
import {
  titleCaseExceptLastN,
  moveLastNWordsToBeginning,
  capitalizeExceptFirstN,
  moveFirstNWordsToEnd,
  replaceLastNWordsWithText,
  replaceFirstNWordsWithText,
  replaceLastNWordsInPlace,
  replaceFirstNWordsInPlace,
  titleCaseWords,
  lowercaseAll,
} from '../wordTransformHelpers';

export function ruleMatches(rule: TransformRule, source: string): boolean {
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
 * Sole owner of "which rule wins" — used both to resolve a match (`findBestMatch`)
 * and to order the Rules table for display (`RulesManager.tsx`). A matching suffix
 * rule always wins outright over a matching prefix rule; within one matchKind pool,
 * longer key wins; ties broken by key text, then semantic type — for determinism in
 * both match resolution and table order, not just cosmetic table sorting.
 */
export function compareRulePrecedence(a: TransformRule, b: TransformRule): number {
  if (a.matchKind !== b.matchKind) return a.matchKind === 'suffix' ? -1 : 1;
  return (
    b.key.length - a.key.length ||
    a.key.localeCompare(b.key) ||
    a.semanticType.localeCompare(b.semanticType)
  );
}

export function findBestMatch(rules: TransformRule[], source: string): TransformRule | null {
  const candidates = rules.filter((r) => ruleMatches(r, source));
  return [...candidates].sort(compareRulePrecedence)[0] ?? null;
}

/**
 * Applies a matched rule's transform to `source`'s per-character gloss.
 * Capitalize always runs before move/replace, on the pre-move word order — see
 * CONTEXT.md for why order isn't configurable.
 *
 * When `moveReplacement` is set, the number of words replaced is always the key's own
 * character count (`rule.key.length`), not `rule.moveWords` — `moveWords` only decides
 * whether the replacement text relocates to the opposite end (moveWords > 0, matching
 * the plain move behavior) or stays in the key's own position (moveWords === 0 — useful
 * when you want to substitute the key's translation without reordering anything).
 */
export function applyRule(
  rule: TransformRule,
  source: string,
  glossFn: (source: string) => string
): string {
  const gloss = glossFn(source);
  const replaceCount = [...rule.key].length;
  if (rule.matchKind === 'suffix') {
    const capitalized = titleCaseExceptLastN(gloss, rule.capitalizeExceptN);
    if (rule.moveReplacement === undefined) {
      return moveLastNWordsToBeginning(capitalized, rule.moveWords);
    }
    return rule.moveWords > 0
      ? replaceLastNWordsWithText(capitalized, replaceCount, rule.moveReplacement)
      : replaceLastNWordsInPlace(capitalized, replaceCount, rule.moveReplacement);
  }
  const capitalized = capitalizeExceptFirstN(gloss, rule.capitalizeExceptN);
  if (rule.moveReplacement === undefined) {
    return moveFirstNWordsToEnd(capitalized, rule.moveWords);
  }
  return rule.moveWords > 0
    ? replaceFirstNWordsWithText(capitalized, replaceCount, rule.moveReplacement)
    : replaceFirstNWordsInPlace(capitalized, replaceCount, rule.moveReplacement);
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

/** A dictionary entry matching a Transform Rule's preview, with its full metadata —
 * not just the display fields — so the matches view can edit Translation/VAR/Semantic
 * in place without accidentally clobbering fields it doesn't surface (e.g.
 * allowedVariableTypes) on save. See `useEntryMetadataEdit`'s snapshot-before-patch
 * invariant, which this shape exists to feed correctly. */
export interface RuleMatchEntry {
  source: string;
  translation: string;
  dictionaryId: string;
  dictionaryLabel: string;
  semanticType: SemanticType | PatternSemanticTypeRef | '';
  allowAsPatternVariable: boolean;
  allowedVariableTypes: Record<string, string[]>;
}

/**
 * Finds every entry, across every dictionary this rule type applies to
 * (`dictionarySupportsTransformRules`), whose Source matches this rule's
 * suffix/prefix + key + charCount criteria — for the "preview matches" UI.
 * Ignores `rule.enabled` on purpose: previewing a disabled rule's matches (e.g. before
 * re-enabling it) is a reasonable thing to want, so the enabled gate is bypassed here
 * rather than reimplementing the suffix/prefix/charCount check a second time.
 */
export function findRuleMatchingEntries(
  rule: TransformRule,
  dictionaries: Record<string, DictionaryData>
): RuleMatchEntry[] {
  const alwaysEnabledRule: TransformRule = { ...rule, enabled: true };
  const results: RuleMatchEntry[] = [];

  for (const [dictionaryId, dict] of Object.entries(dictionaries)) {
    if (!dict || !dictionarySupportsTransformRules(dictionaryId)) continue;

    for (const [source, value] of Object.entries(dict)) {
      if (shouldSkipKey(source)) continue;
      if (!ruleMatches(alwaysEnabledRule, source)) continue;

      const isObject = typeof value === 'object';
      results.push({
        source,
        translation: isObject ? value.translation : value,
        dictionaryId,
        dictionaryLabel: getDictionaryLabel(dictionaryId),
        semanticType: (isObject && value.semanticType) || '',
        allowAsPatternVariable: isObject && value.allowAsPatternVariable === true,
        allowedVariableTypes: (isObject && value.allowedVariableTypes) || {},
      });
    }
  }

  return results.sort(
    (a, b) =>
      b.source.length - a.source.length ||
      a.source.localeCompare(b.source) ||
      a.dictionaryLabel.localeCompare(b.dictionaryLabel)
  );
}

/** Per-character gloss built by joining each Source character's `characters` dict
 * entry (space-separated); characters missing from that dict pass through unchanged. */
export function joinCharGloss(
  dictionaries: Record<string, DictionaryData>,
  sourceText: string
): string {
  if (!dictionaries?.characters || !sourceText) return '';
  const chars = dictionaries.characters as Record<string, string>;
  return sourceText
    .split('')
    .map((ch) => chars[ch] || ch)
    .join(' ');
}

/** Fallback Translation guess for a newly-populated Source when no Transform Rule
 * matches: title-cased for properNoun targets, all-lowercase otherwise. */
export function generateRoughTranslation(
  dictionaries: Record<string, DictionaryData>,
  sourceText: string,
  targetDictionary: string
): string {
  const gloss = joinCharGloss(dictionaries, sourceText);
  if (!gloss) return '';
  if (targetDictionary.includes('properNoun')) {
    return titleCaseWords(gloss);
  }
  return lowercaseAll(gloss);
}

/**
 * The initial Translation guess for a newly-populated Source: a matching Transform
 * Rule's guess when one exists for phrases/properNouns* targets, falling back to
 * `generateRoughTranslation` otherwise. Also returns the matched rule's semanticType,
 * if any, so the caller can stamp it.
 */
export function computeInitialTranslation(
  rules: TransformRule[],
  dictionaries: Record<string, DictionaryData>,
  sourceText: string,
  targetDictionary: string
): { translation: string; matchedRule: TransformRule | null } {
  if (dictionarySupportsTransformRules(targetDictionary)) {
    const match = findBestMatch(rules, sourceText);
    if (match) {
      return {
        translation: applyRule(match, sourceText, (s) => joinCharGloss(dictionaries, s)),
        matchedRule: match,
      };
    }
  }
  return {
    translation: generateRoughTranslation(dictionaries, sourceText, targetDictionary),
    matchedRule: null,
  };
}
