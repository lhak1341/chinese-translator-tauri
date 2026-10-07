# ADR-079: Delete the WASM Assembler, Chunker and Tokenizer Tiers

**Status:** Decided (amended by ADR-083: conflict resolution was deleted too)
**Date:** 2026-10-06

## Context

Three WASM text tiers survived ADR-073 and ADR-078: the tokenizer, the chunker and the assembler. Each had a JS twin and claimed a speedup in a comment, none measured: "30-50% faster" (assembler), "2-3x" (chunker), "3-8x" (tokenizer). Under vitest none of them initializes, so the whole suite exercised only the JS twins; the Rust twins were covered by their own `mod tests::parity` and nothing end to end.

## Decision

Delete the assembler, chunker and tokenizer tiers.

- **Assembler.** `WasmTextAssembler.js` (236 lines), `wasm-core/src/text_assembly.rs` (337) and their tests go. `needsSpace` and `assembleWithSpacing` move, unchanged, to `src/utils/text/TextAssembly.js`; `TranslationEngine.postProcess` calls the function directly.
- **Chunker.** `WasmTextChunker.js` (172), `wasm-core/src/text_chunker.rs` (362), `areChunksInBounds` and their tests go. `TextChunker.chunkText` is the JS implementation alone. `test-fixtures/chunker-parity.json` keeps the JS expectations (`expected`) and drops the Rust ones.

- **Tokenizer.** `WasmTextTokenizer.js` (130), `wasm-core/src/text_tokenizer.rs` (404) and their tests go, after `TextTokenizer.tokenize` was rewritten to classify exactly as the Rust code did (see Consequences). `lib.rs` now exports only the pattern processor and conflict resolution.

## Evidence

Real WASM binary loaded with `initSync`, warm, median of 7 rounds, harness in the session scratchpad. Run under Bun, which uses JavaScriptCore, the engine behind the app's WKWebView, with a V8 cross-check on the assembler. The WASM column includes what the wrapper does on every call.

**Assembler** (`JSON.stringify` of segments in, `JSON.parse` of the result out, against `jsAssembleWithSpacing`), results identical:

| Segments | JS        | WASM      | WASM / JS (JSC) | WASM / JS (V8) |
| -------- | --------- | --------- | --------------- | -------------- |
| 100      | 0.0026 ms | 0.0441 ms | 16.7x           | 23.5x          |
| 500      | 0.0136 ms | 0.2208 ms | 16.2x           | 24.2x          |
| 1,500    | 0.0414 ms | 0.6424 ms | 15.5x           | 24.9x          |
| 3,000    | 0.0824 ms | 1.2841 ms | 15.6x           | 23.2x          |

**Chunker** (production `TextChunker.chunkText` JS path against raw `chunkText` + `JSON.parse` + `areChunksInBounds` + `TextChunk` mapping), windows cut from three bundled novels:

| Text              | JS       | WASM     | WASM / JS |
| ----------------- | -------- | -------- | --------- |
| 600 chars (gloss) | 0.048 ms | 0.047 ms | 0.98x     |
| 2,000 chars       | 0.164 ms | 0.154 ms | 0.94x     |
| 20,000 chars      | 1.600 ms | 1.519 ms | 0.95x     |

A 5% win is 0.01 ms on a gloss window; the pre-set rule was to delete a tier that ties. The assembler lost by an order of magnitude because each call ships the segments as JSON in and the result as JSON out, for work that costs microseconds in JS (the same shape as ADR-073 and ADR-078).

## Consequences

Chunk boundaries now come from one implementation. Rust produced 0.0-0.2% more chunks than JS on 17M characters (`CONTEXT.md`, TextChunker), nearly all `——` before closing punctuation, so production chunking changes slightly on real text. The suite already pinned the JS behaviour.

ADR-009 loses two wrappers: three hold a `WasmProcessorLifecycle` (`WasmPatternProcessor`, `WasmTextTokenizer`, `WasmConflictResolution`). ADR-070's note that `WasmTextAssembler` keeps `jsAssembleWithSpacing` beside it no longer applies. `unicode_properties` stays: the pattern matcher uses it.

**Tokenizer.** The WASM tokenizer measured 7.8x to 8.4x slower than the old JS regex (0.235 ms against 0.030 ms at 600 chars), but the two did not produce the same tokens. Over the 55-book library, 41.9% of 3.77M non-empty lines tokenized differently: JS kept a punctuation run as one token (`。”`, `……`, `：“`), Rust emitted one token per character.

A harness ran the real engine with the production dictionaries over 6 of the largest bound novels, 8 windows of 1,500 characters each, once per tokenizer. Full Translation (`translateWithSegments`): `translatedText` identical in 48 of 48 windows. Character-only (`translateWithCharactersOnly`): final text differed in 28 of 48, and the JS tokenizer was the worse side. The punctuation dictionary has 41 single-character keys, so a grouped token such as `：“` had no full match and fell through to `cleanupFormatting`, which spaced it: `ạo: “Tiền` (WASM) against `ạo : Tiền` (JS), `hổ, ‘` against `hổ , `. Deleting the WASM tokenizer alone would have regressed character-only output. Segment arrays differed in 30 of 48 full-translation windows against 9 of 48 for two runs of the same tokenizer (parallel chunk completion order), so most of that is noise.

So `TextTokenizer.tokenize` was rewritten first: NFC, then one token per CJK ideograph (Unified, Extension A, Compatibility), per run of ASCII letters, digits or `White_Space`, and per any other code point as `punctuation`. That is the Rust classifier, with UTF-16 offsets. It matches an independent port of the Rust code on all 3,769,999 non-empty lines of the library (173,682,420 tokens, 0 differing lines) and takes 0.110 ms per 2,000 characters against 0.799 ms for the WASM tokenizer. The five documented divergences (punctuation grouping, CJK Extension A, Compatibility Ideographs, `_`, U+FEFF) are gone and `tokenizer-parity.json` keeps one `expected` per case.

`token.start` is now a UTF-16 index everywhere; the code-point versus UTF-16 mismatch is gone. For text that is not NFC, `start` indexes the normalized text, as it did under WASM. Under vitest the suite now runs the same tokenizer as production.

ADR-009 loses a third wrapper: two hold a `WasmProcessorLifecycle` (`WasmPatternProcessor`, `WasmConflictResolution`). The WASM binary stays for the pattern processor and conflict resolution.

A future review should not re-propose a WASM assembler, chunker or tokenizer tier on speed grounds without beating the tables above on the target platform.
