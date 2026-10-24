/**
 * The `characters` entry for one token, as the one-token match both character passes apply
 * (Phase 5 of Full Translation and the character-only pass).
 *
 * Every `characters` key is one code point (ADR-087; PersistTimeValidator enforces it on every
 * write and DictionaryManager warns on a load that breaks it), so the entry for a token is a
 * point lookup: no span, no overlap, no `findMatchesAtToken`. This is the one
 * place that rule is applied; a multi-character key never matches here.
 *
 * Interface: `characterMatchFor(source, token) → match | null`. The caller still owns the
 * skip guard and `applyMatchToTokens`.
 */

/** The one method of the Dictionary Manager this reads (`DictionaryManager.lookupCharacter`). */
export interface CharacterLookup {
  lookupCharacter(word: string): string | null;
}

export interface CharacterMatch {
  word: string;
  translation: string;
  dictionary: 'characters';
  tokenLength: 1;
}

export function characterMatchFor(
  source: CharacterLookup,
  token: { value: string }
): CharacterMatch | null {
  const translation = source.lookupCharacter(token.value);
  if (!translation) return null;
  return { word: token.value, translation, dictionary: 'characters', tokenLength: 1 };
}
