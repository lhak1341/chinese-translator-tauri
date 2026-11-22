/**
 * A dictionary match placed at a token: what `applyMatchToTokens` writes onto the tokens.
 *
 * Two lookups produce one: `DictionaryManager.findMatchesAtToken` (Phases 2 and 4) and
 * `characterMatchFor` (Phase 5 and the character-only pass, always one token). `tokenLength` comes
 * from the lookup that read the tokens, never from a recount of `word` (ADR-108 addendum
 * 2026-11-22). A match over a plain string (`findAllMatches`) has no tokens and no `tokenLength`.
 */
export interface TokenMatch {
  word: string;
  translation: string;
  /** The dictionary the entry came from; it becomes the claim's `translationSource`. */
  dictionary: string;
  /** Tokens from the match's start through the last one it covers, spaces between included. */
  tokenLength: number;
}
