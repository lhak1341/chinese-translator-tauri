# ADR-080: Delete the WASM Integrity Manifest

**Status:** Decided
**Date:** 2026-10-06

## Context

Before the shared WASM binary was instantiated, `wasmIntegrityVerifier.js` (331 lines, "CODE REVIEW FIX (CRITICAL-1)", 2026-02-01) hashed it with SHA-256 and compared the result and its size with `src/wasm/integrity-manifest.json`, written by `scripts/generate-wasm-hashes.js` at the end of every `build-wasm` and `build-wasm-dev`. A second check, `verifyWasmModule`, looked for one class and `default` on the module (Pattern only). `verifyWasmInstance` checked each wrapper's expected methods on its instance.

The hash check ran three times per startup: once in each of the two lifecycles (`WasmPatternProcessor`, `WasmConflictResolution`) and once more in `WasmSharedModule`, on the same cached bytes. ADR-009 called the second run "redundant but harmless".

## Decision

Delete the SHA-256 check, the manifest and its generator, and `verifyWasmModule`. Keep `verifyWasmInstance`, moved to `src/utils/wasm/wasmInstanceCheck.js`. `WasmSharedModule` is the only place the binary is fetched and instantiated; `WasmProcessorLifecycle` no longer takes `wasmFileName` or `wasmBinaryUrl`, and `instantiateFn()` takes no argument. Two functions in the verifier file, `registerWasmModule` and `getIntegrityManifestStatus`, had no callers and went with it.

## Reasoning

**It could not stop tampering.** The manifest is a static JSON import in the same JS bundle as the `.wasm` asset. Anyone able to rewrite the bundled binary can rewrite the manifest beside it. The file's own header says "Tauri's code signing provides app-level protection", and that signature covers the embedded frontend assets; it is the control that a modified bundle fails. This was reasoned from the bundle layout and `tauri.conf.json`, not checked against a built `.app`.

**Corruption is already caught.** A truncated or corrupt `.wasm` fails `WebAssembly.instantiate`, which the lifecycle retries and then reports. The binary is 301 KB, so the hash cost nothing; speed was never the argument.

**It added a failure of its own.** With no manifest in a production build, `verifyWasmBinaryIntegrity` returned `valid: false`, which disabled pattern processing and conflict resolution for the session. A stale manifest after a Rust-only rebuild did the same. The generator also hashed every `.wasm` in `src/wasm/`, including an orphan from an older crate name.

**The module check proved nothing the next line did not.** It looked for `WasmPatternProcessor` and `default`; the instantiation and `new wasmModule.WasmPatternProcessor()` directly after it throw if either is missing. The instance check stays because the JS glue and the binary come from one wasm-pack build and drift only when one is stale, and a wrapper expecting a method the binary lacks should fail at init, not at the first call.

## Consequences

`docs/CSP_SECURITY.md` listed the hash as mitigation #2 and SRI as "implemented". Both sections now say it was removed and why, so a future security review does not re-add it as a missing control. Do not re-add a hash step unless the expected hash can be held outside the bundle (a signed manifest, or a value baked into the Rust side that the frontend cannot rewrite).

ADR-009's lifecycle sequence is now `instantiateFn()` then instance verification; the fetch and SHA-256 rows in its table no longer apply.

**Addendum 2026-10-06 (architecture review candidate #3 grilling):** `verifyWasmInstance` is strict: every expected method must exist, and the error names each missing one. It had been lenient "for test mocks" — valid with a single method present, a missing one only a debug line — so a stale binary lacking `processTokens` passed init and failed at the first call, the case the paragraph above says the check is for. The real `WasmPatternProcessor` has all four expected methods, so production is unaffected. Tests supply an instance with the wrapper's real method set (`patternInstance()` in `WasmPatternProcessor.errorHandling.test.js`) instead of mocking the check; `wasmInstanceCheck.test.js` tests it directly. Do not loosen it again for a test's convenience. The module stays a file of its own, as decided above.
