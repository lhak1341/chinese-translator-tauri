# ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine

**Status:** Decided  
**Date:** 2026-06-13

## Context

`useTranslatorEngine` owns the engine lifecycle (`engineRef`, `enginePhase`, `reinitialize`). `Translator.jsx` holds a related cluster: `wasmStatus` (useState), `wasmStatusRef` (useRef for stale-closure avoidance), and a `useEffect([enginePhase])` that polls `engineRef.current.wasmManager` on a 5-second interval and updates `wasmStatus` only when values change.

The deletion test initially supports absorption: if the cluster were deleted from `Translator.jsx`, complexity would re-appear in `useTranslatorEngine` (which already owns `engineRef` and `enginePhase`). This looked like a false seam.

## Decision

Do not move the WASM status cluster into `useTranslatorEngine`.

## Reasoning

**The effect has a hidden dep on translation runtime state.** The interval callback reads `isTranslatingRef.current` to skip polling during active translation — a guard against wasm-bindgen's `RcRefCell` recursive-borrow panic (`rt/mod.rs:287`). That ref is owned by `Translator.jsx`'s translation runtime, not by the engine lifecycle. Absorbing the effect into `useTranslatorEngine` would require either injecting `isTranslatingRef` as a hook param (coupling the lifecycle hook to translation runtime state it otherwise doesn't touch) or introducing a callback seam (`canPollWasm: () => bool`) — both add interface surface to paper over a real two-concern dependency.

**The seam is false.** The effect looks like engine-lifecycle concern (`enginePhase`, `engineRef`) but has a load-bearing dep on translation runtime (`isTranslatingRef`). Both refs must be co-located for the borrow guard to be correct. `Translator.jsx` is the only place both are in scope without injection.

**Dev-only display.** `wasmStatus` is consumed by `TranslatorControls` exclusively inside `process.env.NODE_ENV === 'development'`. The value never influences production behavior. Moving ~40 LOC into a shared hook to clean up dev tooling is not worth the coupling introduced.

**The existing comment is the right fix.** The `CODE REVIEW FIX (HIGH-1)` comment on the `eslint-disable` line already documents the invariant precisely. The ref-vs-state dual pattern is an implementation detail of one effect; it does not need a hook boundary to be understood.

## What Was Done Instead

Nothing. The cluster stays in `Translator.jsx` as-is. The `HIGH-1` comment remains the canonical documentation of the stale-closure avoidance pattern and the borrow-guard skip.

## Consequence

Future architecture reviews should not re-propose absorbing `wasmStatus`/`wasmStatusRef` into `useTranslatorEngine`. The blocker is `isTranslatingRef` coupling — revisit only if the borrow guard is removed (e.g., wasm-bindgen gains re-entrant `RefCell` support, or the polling strategy changes to a one-shot post-ready probe).

---

## Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected

A 2026-06-20 architecture review proposed extracting the cluster into a standalone `useWasmStatus(engineRef, enginePhase, isTranslatingRef)` hook rather than absorbing it into `useTranslatorEngine`.

**Rejected for the same reason.** A standalone hook still requires `isTranslatingRef` as an injected parameter — the coupling is identical regardless of which hook receives it. The hook boundary does not eliminate the two-concern dependency; it just moves where the injection happens. The ADR-019 blocker (`isTranslatingRef` coupling + dev-only display) applies equally to any standalone extraction.

## Addendum — 2026-07-17d: Cluster deleted, not fixed

`TranslationEngine.wasmManager` (the getter this effect polled) silently stopped pointing at a real property on 2026-06-03, when `DictionaryManager` moved WASM state behind `wasmLookup` during the `WasmDictionaryAdapter` composition change — and again in 61b4807's `DictionaryMatchLookup`/`DictionaryWasmLookup` split. The getter was never updated to follow either move, so `engineRef.current?.wasmManager` was `undefined` from 2026-06-03 onward: the polling effect's outer guard never passed, `checkWasmStatus`/`setInterval`/`setWasmStatus` never ran, and `wasmStatus` stayed frozen at its `useState` init value (`{ initialized: false, ... }`) for the effect's entire life. Because `TranslatorControls`' dev badge is gated on `wasmStatus.initialized`, it never rendered even once in that window.

Given this ADR's own finding that the cluster was dev-only display with zero production impact, repairing it wasn't worth it — doing so would mean widening `WasmDictionaryAdapter`, a seam its own doc comment describes as deliberately narrow ("exposes only the 5 operations `DictionaryManager` needs"). The cluster was deleted instead: the `wasmManager` getter, the polling effect, `wasmStatus`/`wasmStatusRef` state, the `TranslatorControls` prop and badge JSX, the `.wasmStatus` CSS class, three duplicate `WasmStatus` ambient type declarations (`ComponentTypes.d.ts`, `TranslationEngineTypes.d.ts` ×2), and the now-unused `WASM_STATUS_CHECK_INTERVAL` constant.

Future architecture reviews: this cluster no longer exists. Do not recreate it without a concrete need — see `CLAUDE.md`'s deleted-symbols list.
