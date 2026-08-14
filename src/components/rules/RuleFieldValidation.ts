import { MAX_TRANSFORM_RULE_KEY_LENGTH } from '../../types/TransformRuleTypes';

/** Parses a Transform Rule numeric field (Move N words, Capitalize except N,
 * Total-length limit) from raw input text. Returns null when the value isn't a
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
 * turning arbitrary prefill text (clipboard/selection) into a usable key draft. */
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
