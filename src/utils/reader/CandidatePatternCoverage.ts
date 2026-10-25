import { hasPairedPatterns, toPatternsId } from '../dictionary/DictionaryIdClassifier';
import { PatternTemplateEngine } from '../pattern/PatternTemplateEngine.js';

/**
 * Candidates a Phase 1 pattern already reads whole (ADR-111). The Rust coverage mask only
 * models Phase 2, so `三星卡片` under the pattern `#星X` (X = the phrase `卡片`) survives it. A
 * pattern covers a candidate when the entire text matches it, `#` as a numeral run and each
 * X/Y/Z as a known variable: a `phrases` entry with `allowAsPatternVariable`, or a key of an
 * active proper-noun dictionary (what `PatternVariableCache` offers). A slot holding an
 * unknown string does not count, since that string may be the missing name. Allowed variable
 * types are not checked, so a match is a little more generous than Phase 1's. Pure: the caller
 * owns the dictionaries and the active list.
 */

// A numeral run as `NumberVariable` reads one (its NUMERAL_CHARS; at most MAX_NUMERAL_SPAN).
const NUMERAL_RUN = '[零一二两三四五六七八九十百千万]{1,8}';

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
}

/** The full-match regex for a pattern key; each X/Y/Z is a capture group, `#` is not. */
function keyMatcher(key: string): KeyMatcher | null {
  const source: string[] = [];
  let slots = 0;
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    if (!PatternTemplateEngine.isVariableChar(key, i)) {
      source.push(escapeRegExp(ch));
    } else if (ch === '#') {
      source.push(NUMERAL_RUN);
    } else {
      source.push('(.+?)');
      slots++;
    }
  }
  return source.length > 0 ? { regexp: new RegExp(`^${source.join('')}$`, 'u'), slots } : null;
}

/** A test for "an active pattern covers this whole text". */
export function patternCoverage(
  dictionaries: Readonly<Record<string, object | undefined>>,
  activeProperNouns: readonly string[]
): (text: string) => boolean {
  const matchers = activePatternIds(activeProperNouns).flatMap((id) =>
    Object.keys(dictionaries[id] ?? {}).flatMap((key) => keyMatcher(key) ?? [])
  );
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
  return (text) =>
    matchers.some(({ regexp, slots }) => {
      const match = regexp.exec(text);
      return match !== null && match.slice(1, 1 + slots).every((slot) => variables.has(slot));
    });
}
