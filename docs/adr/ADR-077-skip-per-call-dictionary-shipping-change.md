# ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call

**Status:** Decided
**Date:** 2026-10-05

## Context

An architecture review (2026-10-05, candidate #4) noted that `buildLookupIndexOrFallback` sends every dictionary's entries to Rust on each call (`toRustDictionaries` → `buildLookupIndex`), and Rust hashes them all to find its cached trie (`hash_dictionary_entries`). It proposed sending the dictionaries once per engine version and keying the cache by identity. ADR-040 (trie rebuild cost removed) and ADR-060 are adjacent and do not reject it.

## Decision

Do not change the seam. The payload ships with each call, as before.

## Evidence

Traced and measured headlessly (real dictionaries and WASM build, a counting stub for `window.electronAPI.buildLookupIndex`; Rust cost in a scratch release crate with the same serde structs and hasher):

- **Full translation never builds an index.** `translateWithProgressiveBatches` gives each TextChunker chunk its own options with `lookupIndex: undefined`, and chunks split at every punctuation mark, so almost none reach the 50-character gate (`MIN_TEXT_FOR_RUST_INDEX`). 0 `buildLookupIndex` calls on 494 and on 2,600 characters.
- **The character-only gloss does, once per call.** `translateWithCharactersOnly` indexes the whole text it is given: once per ~600-character window in the Reader (after the translation is published), once per run in the Translator.
- **Cost per call, 10 dictionaries, 42,377 entries:** 4.4M characters of JSON; `JSON.stringify` 6.5–7.2 ms; Rust `serde_json::from_str` 7.3–8.2 ms; `hash_dictionary_entries` 1.3 ms; about 9 ms in Rust on a trie-cache hit, before matching. Not measured: the Tauri IPC transport of the ~4.75 MB string in both directions, the return transfer and the `Map` conversion.
- The earlier headless profile (`translateWithSegments`, 93% in the WASM pattern matcher) did not run this path: with no `window.electronAPI` every index build failed into the fallback.

## Reasoning

About 16 ms plus IPC, once per window, in the background gloss pass, is not worth a new stateful seam. Sending dictionaries once means Rust holds a copy that every dictionary edit, reload, rename and import must invalidate (ADR-055's one queue is the only place that knows when), where today the content hash makes staleness impossible by construction.

## Consequence

Future architecture reviews should not re-propose it without a measurement. Revisit if a measured IPC round trip exceeds about 50 ms per window, or if a code path starts calling the index per chunk. The dev console now logs the whole round trip (`🦀 Lookup index: Nms round trip …`, `LookupIndexBuilder.ts`); read it with a book open in `bun run tauri:dev`.

**Addendum (2026-10-10):** the character-only gloss no longer builds an index (ADR-087 addendum), so the per-window payload described under Evidence is gone. The decision stands for the remaining caller, Full translation's 50+ character chunk.
