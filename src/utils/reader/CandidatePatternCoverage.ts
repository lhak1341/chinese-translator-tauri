import { hasPairedPatterns, toPatternsId } from '../dictionary/DictionaryIdClassifier';
import { PatternTemplateEngine } from '../pattern/PatternTemplateEngine.js';
import { MAX_NUMERAL_SPAN, NUMERAL_CHARS } from '../pattern/NumberVariable.js';

/**
 * Candidates a Phase 1 pattern already reads whole (ADR-111). The Rust coverage mask only
 * models Phase 2, so `三星卡片` under the pattern `#星X` (X = the phrase `卡片`) survives it. A
 * pattern covers a candidate when the entire text matches it, `#` as a numeral run and each
 * X/Y/Z as a known variable: a `phrases` entry with `allowAsPatternVariable`, or a key of an
 * active proper-noun dictionary (what `PatternVariableCache` offers). A slot holding an
 * unknown string does not count, since that string may be the missing name. Allowed variable
 * types are not checked, so a match is a little more generous than Phase 1's. Pure: the caller
 * owns the dictionaries and the active list.
 *
 * Applied once, when a run lands, over the dictionaries that run read (`CandidateFinderStore`),
 * so it costs one pass per run: an Add never re-tests the list. A text tries only the keys
 * whose first literal character it holds; testing every key took about 3 s over 18,000
 * survivors and the 4,082 root patterns, the index about 35 ms (2026-10-26, Bun).
 */

// A numeral run as `NumberVariable` reads one.
const NUMERAL_RUN = `[${[...NUMERAL_CHARS].join('')}]{1,${MAX_NUMERAL_SPAN}}`;

/** The patterns dictionaries a book's Phase 1 reads: the root, and the pair of each active
 * proper-noun dictionary. */
export function activePatternIds(activeProperNouns: readonly string[]): string[] {
  return ['patterns', ...activeProperNouns.filter(hasPairedPatterns).map(toPatternsId)];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface KeyMatcher {
  regexp: RegExp;
  /** Capture groups that hold an X/Y/Z slot. */
  slots: number;
  /** The key's first literal character, or `null` for a key of variables only. */
  literal: string | null;
}

/** The full-match regex for a pattern key; each X/Y/Z is a capture group, `#` is not. */
function keyMatcher(key: string): KeyMatcher | null {
  const source: string[] = [];
  let slots = 0;
  let literal: string | null = null;
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    if (!PatternTemplateEngine.isVariableChar(key, i)) {
      source.push(escapeRegExp(ch));
      literal ??= ch;
    } else if (ch === '#') {
      source.push(NUMERAL_RUN);
    } else {
      source.push('(.+?)');
      slots++;
    }
  }
  return source.length > 0
    ? { regexp: new RegExp(`^${source.join('')}$`, 'u'), slots, literal }
    : null;
}

/** A test for "an active pattern covers this whole text". */
export function patternCoverage(
  dictionaries: Readonly<Record<string, object | undefined>>,
  activeProperNouns: readonly string[]
): (text: string) => boolean {
  // A whole-text match holds every literal of the key, so a text need only try the keys whose
  // first literal it contains; a key with none is tried for every text.
  const byLiteral = new Map<string, KeyMatcher[]>();
  const unanchored: KeyMatcher[] = [];
  for (const id of activePatternIds(activeProperNouns)) {
    for (const key of Object.keys(dictionaries[id] ?? {})) {
      const matcher = keyMatcher(key);
      if (!matcher) continue;
      if (matcher.literal === null) {
        unanchored.push(matcher);
      } else {
        const bucket = byLiteral.get(matcher.literal);
        if (bucket) bucket.push(matcher);
        else byLiteral.set(matcher.literal, [matcher]);
      }
    }
  }
  const variables = new Set<string>();
  const phrases = (dictionaries.phrases ?? {}) as Record<
    string,
    { allowAsPatternVariable?: boolean }
  >;
  for (const [key, entry] of Object.entries(phrases)) {
    if (entry?.allowAsPatternVariable) variables.add(key);
  }
  for (const id of activeProperNouns) {
    for (const key of Object.keys(dictionaries[id] ?? {})) variables.add(key);
  }
  const covers = (text: string, { regexp, slots }: KeyMatcher): boolean => {
    const match = regexp.exec(text);
    return match !== null && match.slice(1, 1 + slots).every((slot) => variables.has(slot));
  };
  return (text) =>
    unanchored.some((matcher) => covers(text, matcher)) ||
    [...new Set(text)].some((ch) =>
      (byLiteral.get(ch) ?? []).some((matcher) => covers(text, matcher))
    );
}
