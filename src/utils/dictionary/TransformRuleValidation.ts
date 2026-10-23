import type { TransformRule, TransformRuleMatchKind } from '../../types/TransformRuleTypes';
import { MAX_TRANSFORM_RULE_KEY_LENGTH } from '../../types/TransformRuleTypes';
import { SEMANTIC_TYPE_LIST, type SemanticType } from '../../constants/SemanticTypes';
import { deriveCapitalizeExceptNForKeyEdit } from './TransformRuleEngine';

const MATCH_KINDS: TransformRuleMatchKind[] = ['suffix', 'prefix'];

/** Parses a Transform Rule numeric field (Capitalize except N, Total-length limit)
 * from raw input text. Returns null when the value isn't a
 * finite number at least `min` — callers decide what "invalid" means for them
 * (silently keep the previous value, or block Save). Integer-ness is NOT enforced —
 * fractional counts (e.g. "2.5") are accepted, matching the original per-site guards
 * this consolidates; tightening that is a separate, not-yet-requested change. */
export function parseValidatedNumber(value: string, min: number): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : null;
}

const HAN_CHAR = /\p{Script=Han}/u;

/** Parses a Transform Rule `key` field. Returns the trimmed key when it's 1 to
 * `MAX_TRANSFORM_RULE_KEY_LENGTH` Chinese characters (checked per-codepoint via
 * `[...value]`, so astral-plane CJK Extension chars are never split), else null.
 * Same reject-and-let-caller-decide contract as `parseValidatedNumber`. */
export function parseValidatedKey(value: string): string | null {
  const trimmed = value.trim();
  const chars = [...trimmed];
  if (chars.length < 1 || chars.length > MAX_TRANSFORM_RULE_KEY_LENGTH) return null;
  return chars.every((c) => HAN_CHAR.test(c)) ? trimmed : null;
}

/** Extracts up to `max` Chinese characters found anywhere in `text`, in order,
 * skipping non-Han characters rather than rejecting the whole string — for
 * turning arbitrary prefill text (clipboard/selection) into a usable key draft.
 * Same `HAN_CHAR` as `parseValidatedKey`, so a prefilled key is always one it accepts. */
export function extractHanChars(text: string, max: number): string {
  const result: string[] = [];
  for (const c of text) {
    if (HAN_CHAR.test(c)) {
      result.push(c);
      if (result.length >= max) break;
    }
  }
  return result.join('');
}

export function isValidMatchKind(v: unknown): v is TransformRuleMatchKind {
  return typeof v === 'string' && (MATCH_KINDS as string[]).includes(v);
}

export function isValidSemanticType(v: unknown): v is SemanticType {
  return typeof v === 'string' && (SEMANTIC_TYPE_LIST as string[]).includes(v);
}

/** Validates one persisted Transform Rule at load time — the load-time counterpart to
 * the form-time field checks (`commitRuleField`/`ruleDraftProblem` below; reuses
 * `parseValidatedKey`/`parseValidatedNumber` from here so both surfaces enforce the same
 * key/number contract). Whole-rule drop on any invalid field — `key`/`matchKind`/
 * `semanticType` are identity fields with no meaningful default to repair to, so a
 * partial-repair strategy (as `AppearanceConfig.fromRaw` uses for its cosmetic leaves)
 * would produce a rule that doesn't mean what the user authored. Returns `null` to drop.
 *
 * Must run AFTER `TransformRuleBackend`'s legacy `moveWords` → `relocate` migration —
 * this validates the current `relocate: boolean` shape only. */
export function validateTransformRule(raw: unknown): TransformRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== 'string' || r.id.length === 0) return null;
  if (!isValidMatchKind(r.matchKind)) return null;
  if (typeof r.key !== 'string') return null;
  const key = parseValidatedKey(r.key);
  if (key === null) return null;
  if (typeof r.relocate !== 'boolean') return null;
  if (typeof r.capitalizeExceptN !== 'number' && typeof r.capitalizeExceptN !== 'string') {
    return null;
  }
  const capitalizeExceptN = parseValidatedNumber(String(r.capitalizeExceptN), 0);
  if (capitalizeExceptN === null) return null;
  if (!isValidSemanticType(r.semanticType)) return null;
  if (typeof r.enabled !== 'boolean') return null;

  let charCount: number | undefined;
  if (r.charCount !== undefined) {
    if (typeof r.charCount !== 'number' && typeof r.charCount !== 'string') return null;
    const parsed = parseValidatedNumber(String(r.charCount), 1);
    if (parsed === null) return null;
    charCount = parsed;
  }

  if (r.moveReplacement !== undefined && typeof r.moveReplacement !== 'string') return null;
  if (r.label !== undefined && typeof r.label !== 'string') return null;

  const rule: TransformRule = {
    id: r.id,
    matchKind: r.matchKind,
    key,
    relocate: r.relocate,
    capitalizeExceptN,
    semanticType: r.semanticType,
    enabled: r.enabled,
  };
  if (charCount !== undefined) rule.charCount = charCount;
  // Empty optional text means absent — on disk as in both editing surfaces (`commitRuleField`).
  if (typeof r.moveReplacement === 'string' && r.moveReplacement.trim()) {
    rule.moveReplacement = r.moveReplacement;
  }
  if (typeof r.label === 'string' && r.label.trim()) rule.label = r.label;
  return rule;
}

// ─── Rule field commit ──────────────────────────────────────────────────────────
// What an edited value means, for both editing surfaces — the inline RuleRow (one field at a
// time, on blur) and NewRuleModal (the whole draft, at Save). See GLOSSARY.md "Rule field
// commit". One rule per field: `key` is trimmed; an empty `charCount` is absent (any length);
// an empty `capitalizeExceptN` is invalid, never a silent 0; empty or whitespace-only
// `label`/`moveReplacement` are absent, and non-empty ones are trimmed.

/** The Transform Rule fields edited as text. The rest are toggles with typed values. */
export type RuleTextField = 'key' | 'charCount' | 'capitalizeExceptN' | 'moveReplacement' | 'label';

type RuleDraft = Omit<TransformRule, 'id'>;

/** `raw` trimmed, or `undefined` when nothing is left — how optional text commits. */
const optionalText = (raw: string): string | undefined => raw.trim() || undefined;

/** Sets or removes an optional field, so an absent value leaves no key behind. */
function withOptional<R extends RuleDraft, K extends 'charCount' | 'moveReplacement' | 'label'>(
  rule: R,
  field: K,
  value: R[K] | undefined
): R {
  const next = { ...rule };
  if (value === undefined) delete next[field];
  else next[field] = value;
  return next;
}

/**
 * `rule` with `field` set from the text `raw`, or `null` when `raw` is not a valid value
 * (the caller keeps the old one). A key of a new length re-derives `capitalizeExceptN`.
 */
export function commitRuleField<R extends RuleDraft>(
  rule: R,
  field: RuleTextField,
  raw: string
): R | null {
  switch (field) {
    case 'key': {
      const key = parseValidatedKey(raw);
      if (key === null) return null;
      const capitalizeExceptN = deriveCapitalizeExceptNForKeyEdit(
        rule.key,
        key,
        rule.capitalizeExceptN
      );
      return { ...rule, key, capitalizeExceptN };
    }
    case 'charCount': {
      if (!raw.trim()) return withOptional(rule, 'charCount', undefined);
      const n = parseValidatedNumber(raw, 1);
      return n === null ? null : withOptional(rule, 'charCount', n);
    }
    case 'capitalizeExceptN': {
      if (!raw.trim()) return null;
      const n = parseValidatedNumber(raw, 0);
      return n === null ? null : { ...rule, capitalizeExceptN: n };
    }
    case 'moveReplacement':
    case 'label':
      return withOptional(rule, field, optionalText(raw));
  }
}

/** The draft as a rule is saved, or `null` when a field is invalid (`ruleDraftProblem` says
 * which). Runs every text field through `commitRuleField`'s rules. The key's
 * capitalize-default is not re-derived here: the form already did, as the key was typed. */
export function commitRuleDraft(draft: RuleDraft): RuleDraft | null {
  const key = parseValidatedKey(draft.key);
  const capitalizeExceptN = parseValidatedNumber(String(draft.capitalizeExceptN), 0);
  if (key === null || capitalizeExceptN === null) return null;
  const rule = commitRuleField(
    { ...draft, key, capitalizeExceptN },
    'charCount',
    draft.charCount === undefined ? '' : String(draft.charCount)
  );
  if (rule === null) return null;
  const withReplacement = withOptional(
    rule,
    'moveReplacement',
    optionalText(draft.moveReplacement ?? '')
  );
  return withOptional(withReplacement, 'label', optionalText(draft.label ?? ''));
}

/** The id a draft carries while it is checked against saved rules — never a saved rule's. */
export const DRAFT_RULE_ID = '__new__';

/** The draft as its conflict check and its preview see it: the key trimmed, as Save will
 * store it (`commitRuleDraft`). One place, so the two can't disagree about what it matches. */
export function draftAsRule(draft: RuleDraft): TransformRule {
  return { ...draft, key: draft.key.trim(), id: DRAFT_RULE_ID };
}

/** Why the draft can't be saved, most urgent first, or `null` when it can. `conflictLabel`
 * names an existing rule with the same match kind and (trimmed) key. */
export function ruleDraftProblem(draft: RuleDraft, conflictLabel: string | null): string | null {
  if (conflictLabel) {
    return `Conflicts with "${conflictLabel}" — same match kind + key already used.`;
  }
  if (parseValidatedKey(draft.key) === null) {
    return `Key must be 1-${MAX_TRANSFORM_RULE_KEY_LENGTH} Chinese characters.`;
  }
  if (parseValidatedNumber(String(draft.capitalizeExceptN), 0) === null) {
    return 'The lowercase count must be a non-negative number.';
  }
  if (draft.charCount !== undefined && parseValidatedNumber(String(draft.charCount), 1) === null) {
    return 'The length limit must be at least 1.';
  }
  return null;
}
