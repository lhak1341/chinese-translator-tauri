# ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup)

**Status:** Superseded (2026-10-20) by the addendum below: `DictionaryMatchLookup` was folded into `DictionaryManager`
**Date:** 2026-07-29

## Context

Architecture review (2026-07-29, candidate #2) proposed deepening `DictionaryManager`'s constructor (`src/utils/dictionary/DictionaryManager.js:54-117`), which wires `getDefaultSearchOrder`/`isReady` (and, for `DictionaryWasmLookup`, `getEntries`/`getPriorities`) as closures over `this` when constructing `DictionaryMatchLookup` and `DictionaryWasmLookup`. The candidate's stated problem: "`DictionaryMatchLookup` can't be tested without a live `DictionaryManager`, defeating the point of extracting it into its own module" — with a deletion-test verdict that inlining `DictionaryMatchLookup` back into `DictionaryManager` would remove the closure indirection and "arguably simplify," i.e. the extraction moved code, not complexity.

Before designing a fix, we verified the claim against the real test suite. Both `src/utils/__tests__/DictionaryMatchLookup.test.js` and `src/utils/__tests__/DictionaryWasmLookup.test.js` already exist, and both construct their respective class directly with plain stub functions/objects — no `DictionaryManager` instance anywhere in either file. `DictionaryMatchLookup`'s own test helper (`makeLookup()`) passes `getDefaultSearchOrder`/`isReady` as bare arrow functions over local variables, exactly the shape the constructor already requires. Separately, of the 4 values the candidate described as "closures over `this`," 2 (`dictionaries`, `metadata`) are actually plain injected live `Map` references, not closures at all — only `getDefaultSearchOrder` and `isReady` are genuinely `() => this.X` closures.

## Decision

Do not touch `DictionaryManager`'s constructor wiring or attempt to remove the `isReady`/`getDefaultSearchOrder` closures. No deepening work proceeds on this candidate.

## Reasoning

**The stated blocker doesn't exist.** The core justification for deepening — untestable without a live `DictionaryManager` — is false, disproven by test files that already exist and already pass. Both extracted classes are independently, standalone tested today.

**Neither extraction is shallow.** `DictionaryMatchLookup.js` is 226 lines of real dispatch logic (thread-safe trie walk, sequential scan, parallel fan-out with WASM-first/JS-fallback, stats tracking) behind a small constructor — interface is not "nearly as complex as the implementation." Same shape for `DictionaryWasmLookup`.

**The deletion test doesn't hold either.** Inlining `DictionaryMatchLookup` back into `DictionaryManager` would not simplify anything — it would delete a real, independently-tested module and concentrate its 226 lines back into the God-class this codebase has spent many sessions extracting concerns out of. The candidate's own "moved code, not complexity" verdict was built on the false testability premise; once that premise is removed, the deletion test favors keeping the extraction as-is.

**Same failure class as prior "architecture-review report card is unreliable" findings.** CLAUDE.md already documents (2026-07-28 audit) that `/improve-codebase-architecture` reports need re-verification against real files before acting — this is another confirmed instance: a plausible-sounding shallowness claim that a direct `Grep`/test-run disproved.

## Consequence

Future architecture reviews should not re-propose removing `DictionaryManager`'s `isReady`/`getDefaultSearchOrder` closures on the "untestable extraction" premise — check `DictionaryMatchLookup.test.js`/`DictionaryWasmLookup.test.js` first. If a real friction point in `DictionaryManager`'s constructor surfaces later, it isn't this one.

## Addendum (2026-10-20, architecture review round 34, candidate #3)

The premise of this decision is gone. `DictionaryMatchLookup.js` was 226 lines of dispatch; by 2026-10-20 it was 55 lines with one method. The parallel fan-out and its stats were deleted on 2026-10-03, `findMatchesThreadSafe` on 2026-10-05, and the WASM tier with `DictionaryWasmLookup` by ADR-073. What was left was one 25-line loop behind four injected values (the `dictionaries` and `metadata` Maps, `getDefaultSearchOrder`, `isReady`), with one caller, `DictionaryManager.findAllMatches`, that only delegated. The shared Maps also forced a rule on `_releaseDictionaries`: empty them in place, never reassign.

The deletion test now favors folding. The loop is `DictionaryManager.findAllMatches(text, startPos, dictionaryOrder)`, reading `this.dictionaries` and `this.metadata` directly. `dictionaryOrder` is required, since every production caller passes one. The `ready` guard (which also covers a call after `dispose()`) and the log-and-skip catch per dictionary are unchanged. The tests run over real tries in `DictionaryManager.findAllMatches.test.js`.
