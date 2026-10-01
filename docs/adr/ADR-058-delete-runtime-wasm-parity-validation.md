# ADR-058: Delete the Runtime WASM Parity Validation; Parity Lives in Tests

**Status:** Decided
**Date:** 2026-10-02

## Context

The architecture review of 2026-10-02 (candidate #1) found that the post-reinit WASM/JS dictionary check never ran in production. `useEngineReinitializer` gated it on `engineRef.current.dictionaryManager.wasmInitialized`, a property only `SemanticPatternProcessor` ever sets, so the `setTimeout` block was unreachable. `useEngineReinitializer.test.js` faked `{wasmInitialized: true, validateWasmFallback: vi.fn()}`, so it passed against an interface the real object lacks. This is the second time that test hid a dead integration: the earlier status-string mismatch is in `docs/guides/troubleshooting.md` (fixed, but the gate stayed dead behind it).

Reading the code in the grilling:

- `validateWasmFallback` already gated itself (`wasmLookup.isReady()` → `SKIPPED`), so the hook's gate was redundant as well as broken.
- Its sample was at most 20 single-character words (`_getSampleTestWords`: one first-child word per dictionary, read off `trie.root.children`).
- Its toast said "Using JavaScript fallback". `translate()` falls back to JS only when WASM is not ready or throws, never on a mismatch, so the message was never true.
- `_translateJSDirect`'s only production caller was `validateWasmFallback`.

## Decision

Delete the runtime check: the hook's validation block (and its toast and logger imports), `validateWasmFallback`, `_getSampleTestWords`, `_translateJSDirect`, and the hook test's validation cases. `useEngineReinitializer` is now `reinitialize` then `isReady()`.

Keep `getWasmStatus()` (a documented dev-console command asserted by `DictionaryManager.apiContract.test.js`; see `deleted-symbols.md`), `getMemoryUsage()`, and `_findInDictionaries` (the JS path of `translate()`).

Parity moves to a test, in the ADR-033 / ADR-041 shape: one fixture, `wasm-core/tests/fixtures/trie_lookup_parity.json`, read by `wasm-core/tests/trie_lookup_parity_test.rs` (calls `TrieNode::find_matches`, a plain `pub fn`, the same call `DictionaryWasmLookup.translate` makes through `engine.find_matches`) and by `src/utils/__tests__/DictionaryLookup.parity.test.js` (calls `_findInDictionaries`).

## Reasoning

A parity bug is a defect to catch before release, not something to toast at a user after a dictionary edit. A fixture over real tries covers more than 20 single-character words. The check was dead and nobody noticed, which is evidence that nobody relies on it. No behavior changes for users: the check never ran.

A silent switch to the JS path on mismatch was rejected: it hides WASM bugs (ADR-007 takes the same stance for the pattern processor).

## Consequence

The new test found a real divergence at once. `DictionaryWasmLookup.translate` took `findMatches(dict, word, 0)[0]`, the longest _prefix_ match, while the JS path is an exact lookup. With `我们` in the dictionary, WASM `translate('我们俩')` returned `chúng tôi` and JS returned `null`. `PatternVariableCache` calls `translate` on arbitrary tokens, so this was production-reachable, and a translation depended on whether WASM happened to be ready.

Fixed the same day in `DictionaryWasmLookup.translate`: it accepts a match only if `matches[0].word === word`, and otherwise moves on to the next dictionary. The raw trie keeps returning prefix matches, since tokenization needs them, so the Rust test cannot assert an exact lookup. The fixture's `wasmExpected` field records what the trie returns where `translate` must differ, and `DictionaryWasmLookup.test.js` (stub adapter returning prefix matches) holds the exact-lookup guarantee.

A future review should not re-propose a runtime parity toast. Add fixture cases instead, and keep the two tests above in step with the fixture.
