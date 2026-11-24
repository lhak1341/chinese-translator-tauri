# ADR-089: The Character-Only Pass Leaves Punctuation Alone

**Status:** Decided
**Date:** 2026-10-08

## Context

An architecture review (2026-10-08, round 20, candidates #2 and #6) looked at `translateWithCharactersOnly`. ADR-087 had left one thing in place: "Punctuation keeps `findLongestMatchAtPosition`", on the grounds that the Rust index has no punctuation category, so there was one adapter and no seam to put a `MatchSource` on.

Reading the pass showed the matcher had no effect:

- `processCharacterOnlyTokens` called `applyMatchToTokens` for a matched punctuation token. `applyMatchToTokens` returns at its first check unless the start token is `chinese_char` or `chinese_word`, so a matched punctuation token kept `translated = null`, and assembly fell back to `token.value`. `cleanupFormatting` translates punctuation later, through `lookupPunctuation`.
- With `findLongestMatchAtPosition` stubbed to return null, the stub was called and `translatedText` and `semanticArrays` came out byte-identical on three mixed inputs (full-width commas, stops, quotes, `……`, a newline, `2,700！`).
- All 41 keys in the production `punctuation.json` are one code point and the tokenizer never groups punctuation (`TextTokenizer.ts`), so the 10-token search never had a longer key to find.
- Its only test was an oracle in `MatchSource.parity.test.ts` comparing the `characters` category with the character-only fallback that ADR-082 deleted.

## Decision

The character-only pass does not match punctuation. A punctuation token is kept as-is like every other non-Chinese token (`preserved-punctuation`), and `lookupPunctuation` translates it during finishing, as before. `findLongestMatchAtPosition`, the punctuation branch of `processCharacterOnlyTokens` and the oracle block in `MatchSource.parity.test.ts` are deleted.

The assembly that follows the pass (text, units, finishing, position back-fill) moves to `CharOnlyAssembly` (`src/utils/text/CharOnlyAssembly.ts`; GLOSSARY.md). The stamping pass stays in the engine because it uses `this.applyMatchToTokens`.

## Reasoning

Nothing varied across the seam ADR-087 declined to build, because nothing was being matched. The line in ADR-087 was a reasonable reading of a method that looked live; the stamp it made was discarded one call later.

## Consequence

ADR-087's "Not done" item on the character-only `characters` lookup was done on 2026-10-10: the pass is a point lookup and no longer reads `MatchSource` (ADR-087 addendum). If a multi-character punctuation key is ever wanted, matching has to start from `applyMatchToTokens` accepting a punctuation start token, not from restoring the deleted method.

## Addendum (2026-11-24)

Finishing no longer goes through `lookupPunctuation`, which is deleted along with the 26 marks `cleanupFormatting` used to look up one at a time. `cleanupFormatting` applies the whole punctuation dictionary in one pass, `DictionaryManager.translatePunctuationText`, the same scan Full Translation's chunk punctuation uses. Keys outside the old list now apply in character-only mode too (architecture review round 45, candidate #1; numbers in `docs/guides/deleted-symbols.md`). The pass itself still matches no punctuation, as decided above.
