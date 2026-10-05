# ADR-078: Delete the WASM String Tier

**Status:** Decided
**Date:** 2026-10-05

## Context

`SemanticPatternProcessor.processTokens` builds a position × span → joined-string cache before it matches patterns. `StringProcessingAdapter.buildPrecomputedStrings` chose the implementation: the Rust `StringProcessor` through `WasmStringProcessor`, or the JS `PrecomputedTokenStrings` when WASM was unavailable. The tier was `StringProcessingAdapter.js`, `WasmStringProcessor.js` (165 lines), `wasm-core/src/string_processor.rs` (197 lines), a test file, a section of `OptimizationBenchmarks.js`, and a place in the cascade-retire rules.

`SemanticPatternProcessor` is the JS fallback pattern matcher. `TranslationEngine.applyPatterns` takes the default path, `TwoPhasePatternProcessor` over WASM, whenever `enableTwoPhasePatterns` is on and the pattern list is not empty. It reaches `processTokens` only after repeated WASM pattern failures or with no patterns loaded.

## Decision

Delete the tier. `SemanticPatternProcessor.processTokens` builds a `PrecomputedTokenStrings` directly and synchronously, and drops the `usingWasm` field and the two copies of the clear-the-cache block that only existed for the second implementation. The Rust module and its `lib.rs` re-export are gone; `src/wasm/` is gitignored wasm-pack output that `scripts/ensure-wasm-fresh.mjs` rebuilds, so the binary and its integrity manifest regenerate on the next `bun run test` or `build-wasm-dev`.

## Evidence

The fallback is lookup-heavy. `processTokens` over the 3,985 production patterns on pattern-dense text, jsdom on Node, JS cache:

| Text           | Lookups    | JS cache | No cache (dynamic `slice().map().join()`) |
| -------------- | ---------- | -------- | ----------------------------------------- |
| 501 characters | 3,374,907  | 256 ms   | 597 ms                                    |
| 2,001 chars    | 13,545,487 | 1,080 ms | 2,450 ms                                  |

So the cache itself earns its keep (2.3x). The question is which cache. A standalone benchmark, the real WASM binary loaded with `initSync`, warm, `getString` over every position and span up to 10:

| Tokens | Build, JS | Build, WASM | Lookup all, JS | Lookup all, WASM | Total, JS | Total, WASM |
| ------ | --------- | ----------- | -------------- | ---------------- | --------- | ----------- |
| 100    | 0.21 ms   | 0.11 ms     | 0.08 ms        | 0.28 ms          | 0.29 ms   | 0.40 ms     |
| 500    | 1.35 ms   | 0.60 ms     | 0.40 ms        | 1.43 ms          | 1.75 ms   | 2.02 ms     |
| 2,000  | 5.13 ms   | 2.49 ms     | 1.57 ms        | 5.59 ms          | 6.70 ms   | 8.08 ms     |

WASM builds about 2x faster and looks up 3.5x to 6x slower, so it loses in total, and the matcher does millions of lookups. At the lookup counts above the lookup cost is the whole story.

`WasmStringProcessor.js` claimed "5-15x speedup" and "saves 0.28-0.33 ms per 2000-char translation". Nothing measured here supports it. The numbers are Node/V8 and not WKWebView, which the Tauri app runs on; the gap is large enough that a different engine is unlikely to reverse it.

## Reasoning

**The shape could not win.** Each `getString` crosses the WASM boundary and returns a freshly decoded JS string; the JS cache is one `Map.get` of a string already in the heap. `buildCache` also takes `JSON.stringify` of every token. This is the shape of the WASM dictionary tier ADR-073 deleted.

**It only served the path that runs after WASM has already failed, or with no patterns.** The default pattern path never touches it.

**It cost startup and upkeep.** The wrapper started a WASM `StringProcessor` at import time, in every session. The cascade-retire rules and the lifecycle contract covered it. The `SemanticPatternProcessor` test mocked `wasmStringProcessor` with methods the real class never had (`isAvailable`, `concatenateTokenValues`, `splitAtPosition`), so the tier was effectively untested.

## Consequence

A future review should not re-propose a WASM string tier on speed grounds without beating the tables above on the target platform.

ADR-009 loses a wrapper: five wrappers now hold a `WasmProcessorLifecycle` (`WasmPatternProcessor`, `WasmTextChunker`, `WasmTextTokenizer`, `WasmTextAssembler`, `WasmConflictResolution`). ADR-070's "`WasmStringProcessor.getStats` stays" line no longer applies, and `StringProcessingAdapter` is no longer an example of a fallback shape. ADR-013's "WASM is the primary path" premise is gone with it (that ADR is already superseded).

Found, not changed: with an empty pattern list the engine still routes to the JS path, and `processTokens` builds the string cache for any text over 5 tokens before looping over nothing. An early return is a separate change.
