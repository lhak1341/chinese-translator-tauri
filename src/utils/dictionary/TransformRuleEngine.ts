/**
 * Pure matching/transform logic for Transform Rules. No React/Tauri/WASM
 * dependency — see CONTEXT.md's "Transform Rule" glossary entry for the
 * full contract this implements.
 */
import { isPhrasesDict, isProperNounsDict } from './DictionaryIdClassifier';
import type { TransformRule } from '../../types/TransformRuleTypes';
import type { DictionaryData } from '../../types/DictionaryTypes';
import type { SemanticType, PatternSemanticTypeRef } from '../../constants/SemanticTypes';
import { shouldSkipKey } from './DuplicateAnalyzer';
import { entryFields } from './EntryValue';
import { getDictionaryLabel } from './DictionaryLabels';
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
  return isPhrasesDict(dictionaryId) || isProperNounsDict(dictionaryId);
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
 * `relocate` is always a boolean relocate/stay flag, never a literal word count — the
 * number of words moved (or replaced) is always the key's own character count
 * (`rule.key.length`). `relocate: true` moves to the opposite end; `relocate: false`
 * leaves the words (or, with `moveReplacement` set, the replacement text) in the key's
 * own position.
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
      return rule.relocate ? moveLastNWordsToBeginning(capitalized, replaceCount) : capitalized;
    }
    return rule.relocate
      ? replaceLastNWordsWithText(capitalized, replaceCount, rule.moveReplacement)
      : replaceLastNWordsInPlace(capitalized, replaceCount, rule.moveReplacement);
  }
  const capitalized = capitalizeExceptFirstN(gloss, rule.capitalizeExceptN);
  if (rule.moveReplacement === undefined) {
    return rule.relocate ? moveFirstNWordsToEnd(capitalized, replaceCount) : capitalized;
  }
  return rule.relocate
    ? replaceFirstNWordsWithText(capitalized, replaceCount, rule.moveReplacement)
    : replaceFirstNWordsInPlace(capitalized, replaceCount, rule.moveReplacement);
}

/**
 * Returns the existing rule that collides with `candidate` on (matchKind, key),
 * or undefined if there's no collision. A rule never conflicts with itself.
 */
/**
 * Derives the Capitalize-except-N default when a rule's `key` changes, shared by
 * NewRuleModal's per-keystroke create path and RuleRow's inline edit path — see
 * CONTEXT.md's "Transform Rule" glossary entry for why capitalizeExceptN defaults
 * to the key's own length.
 *
 * Only re-derives when the key's LENGTH actually changes: a same-length edit (e.g.
 * fixing one wrong character) leaves `currentValue` untouched, so a manually-tuned
 * value survives a trivial typo-fix instead of being silently clobbered back to the
 * default on every keystroke. A length change re-derives to the new key's length,
 * same as the create path's existing per-keystroke behavior.
 */
export function deriveCapitalizeExceptNForKeyEdit(
  oldKey: string,
  newKey: string,
  currentValue: number
): number {
  const oldLength = [...oldKey].length;
  const newLength = [...newKey].length;
  return oldLength === newLength ? currentValue : newLength;
}

export function findConflict(
  rules: TransformRule[],
  candidate: Pick<TransformRule, 'id' | 'matchKind' | 'key'>
): TransformRule | undefined {
  return rules.find(
    (r) => r.id !== candidate.id && r.matchKind === candidate.matchKind && r.key === candidate.key
  );
}

/** A dictionary entry matching a Transform Rule's preview, with its full metadata for
 * display. Its inline edits go through `patchEntry`, which reads the stored entry itself,
 * so a field this shape does not carry is never clobbered on save. */
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

      const fields = entryFields(value);
      results.push({
        source,
        translation: fields.translation,
        dictionaryId,
        dictionaryLabel: getDictionaryLabel(dictionaryId),
        semanticType: fields.semanticType as RuleMatchEntry['semanticType'],
        allowAsPatternVariable: fields.allowAsPatternVariable,
        allowedVariableTypes: fields.allowedVariableTypes,
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
  if (isProperNounsDict(targetDictionary)) {
    return titleCaseWords(gloss);
  }
  return lowercaseAll(gloss);
}

/** A new entry's semanticType before any Transform Rule stamps one: `'character'` for
 * properNouns* targets, none otherwise. */
export function defaultSemanticType(targetDictionary: string): SemanticType | '' {
  return isProperNounsDict(targetDictionary) ? 'character' : '';
}

export interface InitialEntryGuess {
  /** A matching Transform Rule's guess, else the rough gloss. */
  translation: string;
  /** `generateRoughTranslation`'s gloss, unaffected by any rule — the reference field. */
  roughGloss: string;
  /** The matched rule's semanticType, else the target's `defaultSemanticType` — always
   * complete, so a re-seed for another target never leaves a stale type behind. */
  semanticType: SemanticType | '';
}

/** The initial guess and the rule that produced it, if any — the one path behind both
 * `initialEntryGuess` (the Add form) and `previewRuleGuess` (the New Rule dialog). */
function guessWithRules(
  rules: TransformRule[],
  dictionaries: Record<string, DictionaryData>,
  sourceText: string,
  targetDictionary: string
): { guess: InitialEntryGuess; match: TransformRule | null } {
  const roughGloss = generateRoughTranslation(dictionaries, sourceText, targetDictionary);
  const match = dictionarySupportsTransformRules(targetDictionary)
    ? findBestMatch(rules, sourceText)
    : null;
  if (!match) {
    return {
      guess: {
        translation: roughGloss,
        roughGloss,
        semanticType: defaultSemanticType(targetDictionary),
      },
      match: null,
    };
  }
  return {
    guess: {
      translation: applyRule(match, sourceText, (s) => joinCharGloss(dictionaries, s)),
      roughGloss,
      semanticType: match.semanticType,
    },
    match,
  };
}

/**
 * Everything the Add form writes when it seeds a newly-populated Source for
 * `targetDictionary`. Transform Rules apply only to phrases/properNouns* targets.
 */
export function initialEntryGuess(
  rules: TransformRule[],
  dictionaries: Record<string, DictionaryData>,
  sourceText: string,
  targetDictionary: string
): InitialEntryGuess {
  return guessWithRules(rules, dictionaries, sourceText, targetDictionary).guess;
}

/**
 * What the Add form would guess for `sourceText` in `targetDictionary` once `draft` is saved
 * beside `rules` — the New Rule dialog's preview. The draft counts as enabled: it is being
 * written, and the dialog says separately when Enabled is off. `winner` is the rule the guess
 * came from (the draft, or another rule that outranks it — `compareRulePrecedence`), or null
 * for the rough gloss. See CONTEXT.md "Rule preview".
 */
export function previewRuleGuess<D extends Omit<TransformRule, 'id'> & { id?: string }>(
  draft: D,
  rules: TransformRule[],
  dictionaries: Record<string, DictionaryData>,
  sourceText: string,
  targetDictionary: string
): { guess: string; winner: TransformRule | null } {
  const writing: TransformRule = { ...draft, id: draft.id ?? 'draft', enabled: true };
  const { guess, match } = guessWithRules(
    [...rules, writing],
    dictionaries,
    sourceText,
    targetDictionary
  );
  return { guess: guess.translation, winner: match };
}
