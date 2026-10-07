# ADR-084: Skip Merging the Reload Context Assembler Into useForceReload

**Status:** Decided
**Date:** 2026-10-07

## Context

An architecture review (2026-10-07, round 16, candidate #5) noted that `useForceReloadContext` (`src/hooks/useReloadExecutionContexts.ts`) takes 13 params and returns a 10-field `ForceReloadContext`, and that nine of those fields are pass-throughs or renames (`setStatus` from `setStatusMessage`, `setReloadError` from `setTranslationError`, `setReloading` from `setDictionaryReloading`, and six names that pass straight through). Only `cancelTranslations` has logic: cancel, wait for cleanup, then reset `isTranslatingRef`, `isTranslating` and progress. The hook has one caller (`Translator.jsx`) and one consumer (`useForceReload`), which holds the CRITICAL-3 invariant (`cancelTranslations` must resolve before `destroyEngine`) and the CRITICAL-1 ordering (scroll restored before `setReloading(false)`). The proposal was to merge the assembler into `useForceReload`: it would take the 13 raw params, build `cancelTranslations` itself, and drop the renames, deleting `useReloadExecutionContexts.ts` and its 144-line test and moving `createShapeGuard` to its own file.

## Decision

Do not merge. Leave `useForceReloadContext`, `ForceReloadContext` and `useForceReload` as they are.

## Reasoning

**The gain is one module, and it is paid for in the wrong place.** The merge puts the cancel logic beside the ordering that depends on it, which is a real locality gain, but `useForceReload` is the hook that carries two invariants, and its interface would grow from 10 named capabilities to 13 raw params, with the three renames that give the protocol its own vocabulary (`setStatus`, `setReloadError`, `setReloading`) moved into its body.

**The assembler is the only typed contract at a JS call site.** `Translator.jsx` is intentionally JavaScript (ADR-003), so nothing type-checks the object built there. `ForceReloadContext` is the declared contract, and the dev-only shape guard (`createShapeGuard`) is what fails loudly if a field is dropped from the call site. `useAutoTranslateTrigger.ts` imports the same guard for its own context. Merging keeps the need for the guard, so it would only move.

**The cost is the test suite that pins the invariants.** `useForceReload.test.js` (496 lines) is built around fakes for the 10-field context; a merge rewrites its setup, and a mistake there would weaken the CRITICAL-1 and CRITICAL-3 tests, which are the point of the file.

**No bug is hidden.** The review found none. The seven-hook fan-in that `Translator.jsx` documents in its call-order comment (`useDictionaryReloadGuard`, `useReloadRetranslate`, `useDeferredRetranslate`, `useForceReload`, `useReloadExecutionContexts`, `useAutoTranslateTrigger`, `DictionaryReloadRegistry`) is the larger friction, and merging the assembler does not shrink it. ADR-065 (reload stays owned by the Translator) is untouched either way.

## Consequence

A review that sees the 13-in, 10-out hook and proposes folding it should find this ADR first. Reconsider if the reload protocol gains a second caller (then the assembler is shared and earns its keep), if `Translator.jsx` becomes TypeScript (then the typed contract and shape guard stop being needed and the assembler is a pure pass-through), or if the fan-in is reworked for another reason.
