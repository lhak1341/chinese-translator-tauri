# ADR-090: Keep the tauriAPI Invoke Shell Narrow

**Status:** Decided
**Date:** 2026-10-08

## Context

`callTauriCommand` (`src/tauriAPI.ts`) is the invoke/catch shell for the wrappers whose failure contract is exactly `{ success: false, error: String(error) }`. Four wrappers stay inline: `saveDictionary`, `loadDictionary`, `loadDictionariesParallel` and `buildLookupIndex`; `readClipboard` rethrows by design. The 2026-09-09 grilling (candidate #2) left them out and recorded why in a comment on `callTauriCommand`. An architecture review (2026-10-08, round 20, candidate #4) proposed extending the shell so the failure policy lives in one place.

## Decision

Do not extend it. The shell keeps the wrappers whose failure handling is exactly its own. The four inline wrappers keep their try/catch, and their failure handling gets tests (`src/__tests__/tauriAPI.test.ts`), which it lacked.

## Reasoning

**They differ where a shell would need callbacks.**

- `saveDictionary` and `loadDictionary` also log a failure the backend _returned_, and `loadDictionary` suppresses that log for `'File not found'`.
- `loadDictionariesParallel` fails a whole batch: one failed result per id, with one message for an invalid id and another for the valid ones around it.
- `buildLookupIndex` returns a zero-filled `LookupIndexResult`.

Covering them takes an `onResult` hook and a `fallback` factory, and the logic would sit in those two callbacks. That is the ADR-070 objection to a shared WASM-call-or-fallback shell: complexity moves into the callbacks instead of concentrating.

**The gap was tests, not duplication.** The shell was covered through two wrappers; the four inline ones were not covered at all.

**The error text difference is not a defect.** The result-returning wrappers use `String(error)`, `callReaderCommand` uses `extractErrorMessage`. Every Rust command that returns an error returns a `String`, so the text is identical for a Tauri rejection and differs only for an `Error` or object rejection. The Reader throws and the others return a result, so the two conventions are separate on purpose.

## Consequence

Future architecture reviews should not re-propose folding the four wrappers into `callTauriCommand`, or unifying `String(error)` with `extractErrorMessage`. Revisit if the inline wrappers converge on one failure shape.

**Addendum 2026-10-09 (round 22):** `loadDictionary` was deleted (`deleted-symbols.md`, ADR-053 addendum); three wrappers stay inline: `saveDictionary`, `loadDictionariesParallel` and `buildLookupIndex`. The decision stands.
