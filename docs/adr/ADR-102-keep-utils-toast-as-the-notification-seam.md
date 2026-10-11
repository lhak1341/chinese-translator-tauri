# ADR-102: Keep `utils/toast` as the Notification Seam

**Status:** Decided
**Date:** 2026-10-11

## Context

An architecture review (round 27, candidate #4) asked whether core modules should report a degraded state as an event, with the app supplying an adapter that turns events into toasts. The engine and four utils (`WasmPatternProcessor.js`, `MatchSource.ts`, `SemanticArraySizeGuard.ts`, `appFile.ts`) call `toast.*` directly: eleven calls in `TranslationEngine.js` (the failure counter, semantic-array corruption, the pattern-unavailable notice at init, and one "critical error" toast in each of the five phase `catch` blocks of `translateSinglePass`), one in each util. 24 test files `vi.mock` the toast module, 17 of them asserting on a call.

## Decision

Keep it. `src/utils/toast.ts` is already the seam, with two adapters: the real `ToastContext` in the app and a `vi.mock` in tests. An event port would add a vocabulary of degraded-state events, injection into the engine and four utils, and a recorder adapter that exists only to replace a one-line mock. Its interface would be wider than the `toast.warning(message)` call it replaces. By the deletion test the toast calls reappear as event emissions at the same sites.

What was done instead: the five identical "critical error" toasts in `translateSinglePass`'s phase `catch` blocks are one private method, `TranslationEngine.notifyCriticalFailure()`, so the message and duration live once. The `catch` blocks and their token-length checks stay where they are (`translateSinglePass` is not extracted). `TranslationEngine.corruption.test.js` drives each of the five phases to it.

Also declined: a shared `src/test/mockToast.ts`. A `vi.mock` factory must be hoisted, so a helper needs `vi.hoisted` or an async import in every file, about as much boilerplate as the factory it would replace.

## Consequence

A review that proposes a notification port should show a second production adapter (for example a headless run that logs instead of toasting), not a test recorder. Until then the toast module is the seam.
