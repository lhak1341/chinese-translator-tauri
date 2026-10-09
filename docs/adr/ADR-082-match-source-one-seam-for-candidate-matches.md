# ADR-082: One Seam for "Dictionary Matches at a Token" — MatchSource

**Status:** Decided
**Date:** 2026-10-07

## Context

An architecture review (2026-10-07, round 16, candidate #1) found one question answered by two adapters with nothing holding them equal: "which dictionary entries start at this token". For a text of 50 or more characters the Rust lookup index answers it (`build_lookup_index`, read back through `getIndexedMatches`). For anything shorter, or when Rust fails, the JS trie answers it (`DictionaryManager.findAllMatches`). The engine picked between them at each reader (`processCharacterOnlyTokens`, and `getCandidateMatchesAtPosition` inside `applyDictionaryTranslation`), threading `options.lookupIndex` and `options.useSharedLookupIndex` through the options bag, and the two adapters returned different shapes (the character-only fallback took one match from `findLongestMatchAtPosition`, the other fallback all matches from `findAllMatches`). No test compared them. The length gate was written in four places (`MIN_TEXT_FOR_RUST_INDEX`, an unused `MIN_TEXT_FOR_INDEXING`, and two literals in `dictionary_commands.rs`), and eight JSDoc lines still said ">500 chars".

Reading the code while grilling the candidate corrected the review's own claims: the index has two readers, not three (Phase 5 never read it), the missing `dictionarySet` filter in the character-only pass was not a bug (the `characters` category holds only the `characters` dictionary), and `options.lookupIndex` was never supplied from outside the engine.

## Decision

Add `MatchSource` (`src/utils/dictionary/MatchSource.ts`), which absorbs `LookupIndexBuilder.ts` and `LookupIndexUtils.ts`.

- `openMatchSource(text, { dictionaryManager, logWarn })` returns a source; `source.forPhase(dictionaryOrder)` returns `(tokens, pos, category) => matches`, longest first, lower priority number on a tie. The adapter (Rust index or JS trie) is chosen once per translation and no caller sees which.
- The engine opens a source in `translateDirectly` and `translateWithCharactersOnly` and passes it as an explicit argument to `translateSinglePass`, `applyDictionaryTranslation` and `processCharacterOnlyTokens`. It is not put on `options`: chunk options are spread from the parent's, so a parent's source would put its text positions into a chunk.
- The index is used for text of `DICTIONARY_LOOKUP.MIN_TEXT_FOR_RUST_INDEX` (50) or more characters with no surrogate pair. The TS side sends the threshold to Rust (`options.minTextLength`), so there is one number; Rust's `DEFAULT_MIN_TEXT_LENGTH` is only the default for a caller that sends none.
- `src/test/fixtures/lookup_index_parity.json` is the contract for a correct answer. `MatchSource.parity.test.ts` checks the JS trie against it and the order `MatchSource` gives a Rust-shaped list; `test_lookup_index_matches_the_shared_parity_fixture` in `dictionary_commands.rs` checks the Rust index (as a set, because Rust lists matches in dictionary order).
- `useSharedLookupIndex` and `lookupIndex` leave the options type, `MIN_TEXT_FOR_INDEXING` is deleted, and the `new Map(options.lookupIndex)` / `[...options.segments]` copies go (nothing read either; `DictionaryManager.loadDictionaries` reads only `options.priorities`).
- The character-only pass reads through the source for both adapters. Its old JS fallback, `findLongestMatchAtPosition` over one dictionary, gave the same word and translation as the first match of the trie lookup on every fixture row, and the trie adapter reads only up to the next punctuation, so the per-position cost stays bounded by sentence length.

## Reasoning

Two adapters, both real in production (short text and Rust failure use the trie), make the seam real by the usual test. Putting the choice in one module removes a seven-parameter helper and the flag every call site re-read, and gives one place to test the Rust-versus-JS agreement that used to be implicit.

**Text with a surrogate pair skips the index.** Rust keys the index by code point (`chars()`), while token `start` values are UTF-16 offsets (`getTextPositionForTokenIndex`). They agree only up to the first astral character; after it, `lookupIndex.get(position)` read the wrong entry, silently. The fixture's third case records the offsets. Skipping the index for such text (rare for Chinese novels) is the smallest correct fix, and without a surrogate `text.length` equals the code-point count Rust gates on, so the TS gate and Rust's own can no longer disagree. Before this, a text that passed the TS gate but fell under Rust's would return `success: false` and count toward the three-strike circuit.

**Findings recorded, not acted on.** Only the `properNouns` phase calls `applyDictionaryTranslation` in production; its `phrases`/`characters`/`general` category branches and the `phraseMatch` shortcut are reachable only from tests, and the `general` default breaks `MatchSource`'s contract that a phase's dictionaries share one category. Deleting that is a separate change. `FallbackManager` stayed as it was in this change; candidate #4 of the same review then folded it into `MatchSource.ts` as module state (see `docs/guides/deleted-symbols.md`).

## Consequence

Anything that needs the matches at a token goes through `MatchSource`. A new reader must pass dictionaries of one Rust category per phase. Rust's `DictionaryType::from_name` still decides categories and still sends unknown ids to `phrases`; the per-phase dictionary filter in the index adapter is what makes that safe, so do not drop it. A parity case is added to the fixture when either adapter's answer changes on purpose. Reconsider the surrogate skip if a corpus with many astral characters shows up; the fix then is to convert UTF-16 offsets to code-point offsets, not to read the index unchecked.

**Addendum (2026-10-10):** the character-only pass no longer reads `MatchSource` (ADR-087 addendum). The index now serves Full translation's `translateDirectly` only, which reaches it for a punctuation-free chunk of 50 or more characters. No production phase reads the `characters` category; the parity fixture still holds it.
