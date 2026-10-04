# ADR-073: Delete the WASM Dictionary Lookup Tier

**Status:** Decided
**Date:** 2026-10-04

## Context

`DictionaryManager` could answer a lookup from a WASM copy of every dictionary: `translate()` tried `DictionaryWasmLookup` first whenever it was ready, and `findAllMatchesAsync` did the same for a search across two or more dictionaries. The tier was `DictionaryWasmLookup`, `WasmDictionaryAdapter` and `WasmDictionaryManager` (about 680 lines of JavaScript), a sync of every dictionary into Rust on each load, edit and reload, the cascade-retire rules, and seven test files. `CONTEXT.md` listed whether it beat the JS trie walk at all as "open, unmeasured".

## Decision

Delete the tier. `DictionaryManager.translate` and `findAllMatches` are plain JS: the trie walk and the lookup cache. The Rust side went the same day: `DictionaryEngine`, its tests, `trie.rs`, `benches/trie_matching.rs` (with the `aho-corasick` dev-dependency) and `trie_lookup_parity_test.rs` with its fixture. `src/wasm/` is gitignored wasm-pack output that `scripts/ensure-wasm-fresh.mjs` rebuilds, so the binary and its integrity manifest regenerate on the next `bun run test` or `build-wasm-dev`.

## Evidence

A benchmark on the real dictionaries (read-only: 13,338 characters; 3,525, 3,570 and 2,281 proper nouns), the real WASM binary, warm, median of 7 rounds, jsdom on Node:

| Case                                              | JS      | WASM                                                        |
| ------------------------------------------------- | ------- | ----------------------------------------------------------- |
| `translate`, characters, distinct words           | 0.54 µs | 1.37 µs                                                     |
| `translate`, characters, repeated words           | 0.15 µs | 1.31 µs                                                     |
| `translate`, 3 proper-noun dictionaries, distinct | 1.13 µs | 3.00 µs                                                     |
| `translate`, 3 proper-noun dictionaries, repeated | 0.36 µs | 2.89 µs                                                     |
| `findAllMatchesAsync`, 3 dictionaries             | 0.69 µs | 15.2 µs                                                     |
| Dictionary reload                                 | 20 ms   | 34 ms                                                       |
| Linear memory                                     | none    | 4.4 MB at init, 11.6 MB after load, 18.6 MB after 5 reloads |

WASM lost every case, by 2.5x to 22x. Hits and the word, translation and dictionary of every match agreed. The `metadata` object differed at 654 of 2,000 positions: JS includes `priority`, WASM omits it and sometimes adds `lowPriority: false`.

## Reasoning

**The shape could not win.** WASM `translate` was an exact lookup built on a prefix search that returns every prefix match as a JSON string, parsed in JS per call, and it bypassed the JS lookup cache. The JS path is one trie get behind a cache.

**It cost a lot to keep.** Every load and every dictionary edit serialized the entries into Rust. Linear memory never shrinks, so each reload added to it. The cascade-retire rules, the teardown rules and the seven test files existed for this tier alone. The tier also returned different `metadata` than the JS path for the same lookup.

**Callers that were not on it already took the fast path.** The phrase pass uses the sync lookup (never WASM), and texts of 50 or more characters use the Rust lookup index built through Tauri, not per-position WASM lookups.

## Consequence

A future review should not re-propose a WASM lookup tier on speed grounds without beating the table above on the target platform. The numbers came from jsdom, not WKWebView; the gap is large enough that a different engine is very unlikely to reverse it. The benchmark harness was deleted on purpose: nothing would run it.

The JS half of the parity test became `DictionaryManager.exactLookup.test.js`: the six exact-lookup cases inlined, with no shared fixture and no `wasmExpected` field.
