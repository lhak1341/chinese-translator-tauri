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
