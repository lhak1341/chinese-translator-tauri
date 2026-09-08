import type { TransformRule, TransformRuleMatchKind } from '../../types/TransformRuleTypes';
import { MAX_TRANSFORM_RULE_KEY_LENGTH } from '../../types/TransformRuleTypes';
import { SEMANTIC_TYPE_LIST, type SemanticType } from '../../constants/SemanticTypes';

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

export function isValidMatchKind(v: unknown): v is TransformRuleMatchKind {
  return typeof v === 'string' && (MATCH_KINDS as string[]).includes(v);
}

export function isValidSemanticType(v: unknown): v is SemanticType {
  return typeof v === 'string' && (SEMANTIC_TYPE_LIST as string[]).includes(v);
}

/** Validates one persisted Transform Rule at load time — the load-time counterpart to
 * the form-time field checks in `src/components/rules/RuleFieldValidation.ts` (reuses
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
  if (typeof r.moveReplacement === 'string') rule.moveReplacement = r.moveReplacement;
  if (typeof r.label === 'string') rule.label = r.label;
  return rule;
}
