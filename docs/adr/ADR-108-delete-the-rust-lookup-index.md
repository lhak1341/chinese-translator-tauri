# ADR-108: Delete the Rust Lookup Index

**Status:** Decided
**Date:** 2026-10-21

## Context

An architecture review (2026-10-21, round 35, candidate #3) proposed taking the category out of `MatchSource` (ADR-082). Callers passed a Rust category (`'properNouns'`) and had to keep every dictionary in that category, because the Rust index bucketed matches by `DictionaryType::from_name`. Only the index adapter read the category, and it then filtered by the dictionary set anyway. The trie adapter ignored it.

The review's own note said to measure first. ADR-082's 2026-10-10 addendum says the index serves only Full Translation, for a punctuation-free chunk of 50 or more characters. ADR-077 measured 0 index builds on 494 and on 2,600 characters.

## Evidence

Measured headlessly with the corpus-ab procedure: production dictionaries, the real WASM build, and 248 windows of 1,500 characters from the user's library (6 largest books × 8, 20 seeded-random others × 10, 372,000 characters). Each window went through `translateWithSegments`, the same call the Translator and the Reader make. A wrapper over `openMatchSource` recorded each call's normalized text length.

- 35,760 calls. **0 passed the gate** (50+ characters, no surrogate pair).
- Chunk length: median 8, 99th percentile 22, maximum 47. 43 chunks reached 30 characters and 3 reached 40.
- `TextChunker` splits only at punctuation and has no length cap. A 50-character run with no punctuation can occur, but did not in this corpus.

## Decision

Delete the Rust lookup index. `MatchSource` had one adapter that ever ran, the JS trie. It becomes `DictionaryManager.findMatchesAtToken(tokens, pos, dictionaryOrder)`, a synchronous method: `findAllMatches` over the text from the token up to the next punctuation, longest first. Phase 2 (`applyProperNouns`) calls it directly, and `matchSource` is no longer passed through `translateDirectly`, `translateSinglePass` and `applyProperNouns`.

Deleted:

- **Rust:** `lookup_index_engine.rs`; from `dictionary_commands.rs`, the `build_lookup_index` command and its `_impl`, `TrieCache`, `hash_dictionary_entries`, `DictionaryEntry`, `DictionaryData`, `LookupIndexOptions`, `LookupIndexResponse`, `build_trie_from_entries`, `MAX_TRIE_CACHE_ENTRIES`, `MAX_TEXT_SIZE_BYTES` and their tests; the registration and `.manage(TrieCache)` in `lib.rs`; `benches/trie_matching.rs` with its `[[bench]]` entry; and the `hashbrown`, `criterion` and `aho-corasick` dependencies, which only these used. `lru_cache.rs` stays, because the dictionary cache uses it.
- **TS:** `MatchSource.ts`; `DictionaryEntryFlattener.ts` and `DictionaryManager.flatEntries`; `tauriAPI.buildLookupIndex`, `CMD.BUILD_LOOKUP_INDEX` and the `LookupIndex*` types; `DICTIONARY_LOOKUP` (`MIN_TEXT_FOR_RUST_INDEX`); `TOAST_IDS.RUST_INDEX_UNAVAILABLE`.
- **Tests:** `src/test/fixtures/lookup_index_parity.json`, `MatchSource.test.ts`, `MatchSource.parity.test.ts` and `DictionaryEntryFlattener.test.ts`. The fixture's cases, without the Rust-only `category` and `charPosition`, are now a table in `DictionaryManager.findMatchesAtToken.test.js`.

## Consequences

- One way to ask for the matches at a token. Nothing carries a category, and no dictionary has to sit in a Rust bucket.
- A rare 50+ character chunk with no punctuation is answered by the trie. The output is the same, because the fixture had held both adapters to one answer. The trie walk on such a chunk takes well under a millisecond.
- No IPC payload per chunk. The 4 MB of shipped entries described in ADR-077 is gone.
- ADR-077 is superseded: nothing ships dictionaries any more. ADR-082's seam stays (one way in), but its two adapters, the category rule and the parity fixture are gone (addendum there). ADR-060's "`from_name` and `kindOf` stay different" has nothing left to compare (addendum there). ADR-040's aho-corasick comparison was about a trie that no longer exists.

## Revisit

Revisit only with a measurement: a real corpus where chunks of 50+ characters with no punctuation are common and the trie walk on them costs visible time. Even then, try a faster JS walk before reintroducing IPC.

## Addendum 2026-10-24: Phase 4 reads through the seam too

Architecture review round 37, candidate #4. Phase 4 (`processRemainingPhrases`) had kept its own lookup: text rebuilt from the tokens (`getTextFromTokens`, grouped followers dropped) and searched with `findAllMatches` at each token's `.start`. A grouped leader's `value` is the grouped text, so after a Phase 2 span that held a space (`墨 子` grouped as `墨子`) that text ran behind `.start`, and every later phrase was looked up one character late: `墨 子在这里` gave `Mặc Tử tại giá lý`, `这里` missed. A first fix computed each token's offset in the rebuilt text (`getTextWithOffsets`); a measurement then showed the second lookup was not needed.

Measured with the corpus-ab procedure over 156 windows from 26 books: 173,724 Phase 4 lookups, **0** whose match list (word and translation) differed between `findAllMatches` on the rebuilt text and `findMatchesAtToken`. Phase 4 now calls `findMatchesAtToken(tokens, i, ['phrases'])`, so no phase keeps a text frame of its own, and the offset helper was deleted. The one behaviour that can differ is a phrase matching across a digit or Latin token, which no production phrase key can do: all 16,315 are pure Han.

Also deleted: `getTextPositionForTokenIndex`, and Phase 2's `processedRanges` overlap check, which cannot fire (1,889 checks, 0 conflicts; after a match the scan jumps past the claimed span and skips claimed tokens).
