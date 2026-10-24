# ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader

**Status:** Decided (punctuation line in "Not done" superseded by ADR-089; character-only line done, see Addendum)
**Date:** 2026-10-08

## Context

An architecture review (2026-10-08, round 19, candidate #2) found that after MatchSource (ADR-082) the engine still answered "which `characters` entry starts at this token" a second way. `processRemainingTokensInBatches` / `processTokenBatch` (Phase 5) took the raw trie from `dictionaryManager.getDictionary('characters')` and ran `findLongestMatchAtPosition` at every unclaimed token: up to 10 `tokens.slice().join()` calls per token, `Promise.all` over those synchronous lookups, and an overlap re-check for races that cannot occur. The proposal was to route Phase 5 through `MatchSource`.

Reading the data first changed the shape of the problem. Every `characters` key is one code point: the production `characters.json` holds 13,338 keys with a longest of 1, and `PersistTimeValidator` refuses a longer source on every write. So the longest match was always length 1, the 9 longer slices never matched, and `tokenLength` was always 1, so two matches could never overlap.

## Decision

Phase 5 is a point lookup. `processRemainingTokens` (renamed; nothing in it is a batch any more) calls `dictionary.get(token.value)` for each token no earlier phase claimed and applies a one-token match. It keeps the abort check every 100 tokens, the 16 ms time-slice yield, the skip guard (translated, or stamped and not released by a pattern partial reset) and the swallow-and-log `catch` around the loop. `processTokenBatch`, the batch bookkeeping and the overlap check are deleted.

Not routed through `MatchSource`. Its trie adapter rebuilds the text up to the next punctuation and runs `findAllMatches` per token, which costs more than `Map.get` for a single-character key, and a lookup of one fixed length has no Rust-versus-JS choice to make: a seam with nothing to vary.

`DictionaryManager.loadDictionaries` warns when `characters` holds a key longer than one code point. A hand-edited file is the only way in, and under the old loop such a key matched while now it does not.

## Reasoning

Verified before and after by a one-off differential: the engine run over a 100-character mixed text (CJK, Latin, digits, punctuation, an astral character, a number, a phrase, a proper noun) against the real `characters.json` produced byte-identical token output, 331 lines of `[value, translated, translationSource]`, on both sides.

No timing was taken. In the 2026-09-15 profile pattern matching was 97.9% of translation time and Phase 5 is below the printed rows; the new loop does strictly less per token.

## Not done

- **The character-only pass stays on `MatchSource`** (ADR-082). It has the same one-code-point keys and would also be a point lookup, but moving it reopens ADR-082's choice and should follow a measurement of the trie adapter's per-character cost. A candidate for a later round.
- **Punctuation keeps `findLongestMatchAtPosition`.** The Rust index has no punctuation category (`lookup_index_engine.rs`: string-only tables), so there is one adapter and no seam, and its "match must cover the whole token" rule is separate behaviour. The method now has one production caller.

## Consequence

A `characters` entry is one code point. Anything that writes the dictionary outside `PersistTimeValidator` (import, a direct file edit) can break that, and the load-time warning is the only signal. If a multi-character `characters` key is ever wanted, Phase 5 needs its longest-match loop back.

## Addendum (2026-10-10, architecture review round 24, candidate #1)

The character-only pass is now a point lookup too. `processCharacterOnlyTokens` is synchronous and takes no `MatchSource`; `translateWithCharactersOnly` no longer calls `openMatchSource`. Both character passes ask `characterMatchFor(dictionary, token)` (`src/utils/dictionary/CharacterMatch.ts`), the one place the one-code-point rule is applied.

The "measure the trie adapter first" gate did not apply: nothing in the pass reads the trie adapter or the Rust index any more, so ADR-082's choice is not reopened, one consumer of it is gone. Verified by the same kind of differential as above, old against new over three texts (a 76-character mixed text with an astral character, a short text, and whitespace-heavy text) against the production `characters.json`: byte-identical `translatedText` and semantic arrays, 985 lines of JSON. Not timed (the Tauri IPC cost cannot be seen headlessly, as in ADR-077). `TextFinishing.test.ts` pins that a 60-character text never calls `buildLookupIndex`.

Effects: the pass no longer ships the dictionaries to Rust (ADR-077's 4.4M-character payload per Reader window); it cannot interleave with another engine call (it has no `await`); and no production phase reads the `characters` category through `MatchSource`.

Not done: the Rust index, `flatEntries`, `DictionaryEntryFlattener`, the Rust `TrieCache` and the failure counter stay. Full translation reaches them only for a punctuation-free chunk of 50 or more characters, which ADR-077 measured as almost none. Retiring them needs a measurement of how often that happens on real books, and reopens ADR-082 (one live adapter is a hypothetical seam).

## Addendum (2026-10-11, architecture review round 30, candidate #5 grilling)

A review proposed closing the gap the Consequence names: entries written outside `PersistTimeValidator` (ZIP import, a hand edit) meet the entry rules only as `logger` lines at load. Declined. `PersistTimeValidator.checkEntry` run over the whole production library found 0 violations: 118 files, 64,333 entries, and no entry `buildTrieFromDictionary` skips as the wrong shape. Surfacing the findings would add a field to `DictionaryBackend`'s load protocol (kept narrow, ADR-014) or to `ImportOutcome`, plus a notice in the Dictionary tab, for a case that has not occurred. Rust's looser payload check stays as ADR-060 decided. If it ever matters, the narrow option is at the import seam only: after `importDictionaries` returns, run `checkEntry` over the imported files and add a count to the existing outcome.

## Addendum (2026-10-12, architecture review round 32, candidate #3)

The Decision kept "the skip guard (translated, or stamped and not released by a pattern partial reset)". The partial-reset half had no writer: `isPatternPartialReset` was last assigned by `updateTokensWithPatternSegmentation`, deleted in round 9 (`2e39d48`), before this ADR. The flag and its 4 reads are deleted. The skip guard is now `isClaimed(token)` from `TokenClaim.ts`, and the point lookup is unchanged. `translateSinglePass`'s pre-mark loop and the `processedTokens` set went with it: the loop repeated the skip guard, and the set's in-loop `.add` was never read again, because the loop only moves forward. `processRemainingTokens(tokens, options)` is the new signature.

## Addendum (2026-10-24, architecture review round 38, candidate #2)

The engine no longer takes the `characters` trie. `DictionaryManager.lookupCharacter(word) → string | null` answers the point lookup; `characterMatchFor(source, token)` takes anything with that one method, so `CharacterLookup` is now `{ lookupCharacter }`, not the trie's `get`. Both character passes and the two `postProcess` fallbacks (orphaned consumed token, untranslated Chinese token) call it, so four sites that used three shapes (trie handed out, `translate(…, ['characters'])`, `characterMatchFor`) use one. It returns `null` for a miss, for a manager that is not ready and for a missing `characters` dictionary, and logs nothing; the character-only pass's "No character dictionary found" error and both passes' `if (!dictionary)` branches are deleted. A missing `characters` dictionary was never reachable after `loadDictionaries`. The `postProcess` fallbacks no longer build a `{word, translation, dictionary, metadata}` object per token.

`getDictionary` stays: `PatternVariableCache` calls `getDictionary?.('phrases')` for a span search on the raw trie. The review's first report missed that caller because its grep read `getDictionary\(`, not `getDictionary?.(`. Pinned in `CharacterMatch.test.ts`, `DictionaryManager.exactLookup.test.js` ("lookupCharacter") and `TextFinishing.test.ts` (no `characters` dictionary: nothing throws, the characters are kept). Not compared: the exact spacing of the character-only output when `characters` is absent, which differs from the old early return and cannot happen after a load.
