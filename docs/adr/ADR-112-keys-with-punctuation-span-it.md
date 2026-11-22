# ADR-112: A Proper-Noun Key With Punctuation Spans It

**Status:** Decided
**Date:** 2026-11-22

## Context

A proper-noun entry whose key holds a punctuation mark (`乔斯-韦登` → `Joss Whedon`, `X战警：背水一战` → `X-Men: Apocalypse`) was accepted by the entry form and never applied in Full Translation. Three things stopped it: `TextChunker` split the text at the mark, so the halves were translated as separate chunks; `findMatchesAtToken`'s lookup text (`reconstructTextFromIndex`) stopped at the first punctuation token; and `getTokenSpanForText` skipped punctuation tokens, so a match could not claim the mark. 2 of the keys in the 63 production proper-noun and phrase dictionaries hold punctuation, both `-`.

## Options

1. **Keys span punctuation.** Keep an occurrence of such a key in one chunk, and let the lookup and the span read through the mark for it.
2. **Ignore name separators.** Treat `-`, `·`, `・` and `－` between Han characters as invisible when matching. It does not cover `：`, and it changes matching for every key (`王-五` would match `王五`).
3. **Refuse such keys in the entry form.** Cheap; the names stay untranslated.

## Decision

Option 1 (chosen by the user, 2026-11-22).

- `DictionaryManager.loadDictionaries` records each dictionary's keys that hold a `\p{P}` character (`punctuatedKeys`, the chunker's own separator test).
- `translateWithProgressiveBatches` finds those keys of the active proper-noun dictionaries in the text (`findKeyOccurrences`) and passes the spans to `chunkText` as `keepTogether`: a punctuation character inside one is content, not a separator.
- `findMatchesAtToken` reads through a punctuation token while its text is shorter than the longest punctuated key in the searched dictionaries. With none, the text stops at punctuation as before. A key without punctuation cannot match across a mark either way: its trie path holds no punctuation character.
- `getTokenSpanForText` counts a punctuation token that the matched text holds at that point, so the claim covers the mark.
- Phase 1: `buildPatternVariableCache` also caches such a name under its spelling without punctuation or whitespace (`南希丽诺`), because the WASM matcher builds a variable's text from the semantic tokens alone. So `南希-丽诺等人` fills `X等人`. An entry already cached under that spelling keeps it. No Rust change.

The name's span is then protected in `cleanupFormatting` like any proper noun, so the colon in `X-Men: Apocalypse` triggers no capitalization or spacing.

## Consequences

- Only the active proper-noun dictionaries keep a chunk together. A `phrases` key with punctuation reads through the mark in the lookup but still never sees it whole across a chunk boundary (0 such keys in production).
- A token the tokenizer types `unknown` (`…`, `》`) is not punctuation to the lookup and is skipped as before, so a key holding one does not match.
- The Rust candidate finder (`candidate_finder.rs::mask_spans`) reads Han runs only, so a punctuated key masks nothing there: `乔斯` may still be offered as a candidate. The coverage-mask parity fixture has no punctuated case.
- The chunker scans the active proper-noun keys with punctuation once per translation (`indexOf` per key); with 2 keys this is negligible.

## Addendum 2026-11-22

`getTokenSpanForText` is deleted (ADR-108 addendum 2026-11-22). The lookup walk that reads through the mark (`readLookupText`) also records where each token ends, so a match's `tokenLength` covers the mark by construction; nothing counts it separately.

## Addendum 2026-11-22: punctuation is what the tokenizer types punctuation

The Consequences bullet on `…` and `》` was wrong when written: the tokenizer (`TextTokenizer.ts`, the only one the engine uses) types every code point that is not Han, an ASCII letter, an ASCII digit or whitespace as `punctuation`, and nothing produces `unknown`. Keys holding `…` or `》` match, measured through `translateWithSegments`.

The real gap was symbols. Which keys the lookup reads through was decided by `\p{P}` on the key, the lookup by the token type, and the two disagree on `+`, `★`, `~`, `＋`, `々`, non-ASCII letters and Han outside `HAN_CLASS`. A key `甲+乙` therefore never matched on its own (`giáp+ ất`), and did match when any other punctuated key at least as long was loaded, since that key's length set how far the lookup read. `PatternVariableCache` stripped by `\p{P}` as well, so such a key had no WASM spelling.

`TextTokenizer.ts` now exports `isPunctuationChar`, the tokenizer's own fall-through test, and both `DictionaryManager` (which keys are punctuated) and `PatternVariableCache` (the spelling without marks) use it. The chunker still splits at `\p{P}` only: it decides where text breaks, a different question, and a symbol never split a chunk.

Numbers on that day: 104 production keys hold punctuation, all in one proper-noun dictionary (`-` 93, `－` 8, `：` 3, `?` 1; longest 11 characters), not 2. The new test selects the same 104 keys and gives the same WASM spelling for every key as `\p{P}` did; no production key holds a symbol. A frozen-dictionary corpus A/B is in the round's report. The "negligible" chunker scan above was argued for 2 keys and has not been measured at 104.

Not changed: the `phrases` chunk gap, `candidate_finder.rs` (still Han runs only) and the longest punctuated key length, still computed on each `findMatchesAtToken` call.
