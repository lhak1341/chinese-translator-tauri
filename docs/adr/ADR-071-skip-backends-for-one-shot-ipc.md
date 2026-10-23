# ADR-071: Backend Modules Exist Where There Is a Protocol; One-Shot IPC Stays on `window.electronAPI`

**Status:** Decided
**Date:** 2026-10-04

## Context

An architecture review (2026-10-04, candidate #4) read the codebase as inconsistent: config, appearance, book records, transform rules and dictionary load each have a Backend module, while `ReaderTab.tsx` (`openBook`), `useBookLines.ts` (`readBookLines`), `useClipboardTranslation.ts` (`readClipboard`) and `DictionaryManager.tsx` (`openDictionaryFolder`, `exportDictionaries`) call `window.electronAPI` directly. It proposed Backend modules for the direct callers.

## Decision

Do not add them. A Backend module is justified by a protocol it holds, and the one-shot commands hold none.

- `appConfig.ts`, `appearanceConfig.ts`, `BookRecordsBackend.ts` and `TransformRuleBackend.ts` are each a two-line `load`/`save` pair handed to `createAppFile` (`appFile.ts`). The cache, the lock and the unread-file refusal live there, once. They share a Backend shape because they share that protocol.
- `DictionaryBackend.ts` holds the parallel load, serial retry and partial-failure classification (ADR-014).
- The direct callers are single commands with their own UI error handling, no cache and no lock.

## Reasoning

**One adapter is a hypothetical seam.** Each direct caller has one call site. Tests for all of them (`ReaderTab.openBook.test.tsx`, `useBookLines.test.ts`, `useClipboardTranslation.test.ts`, `DictionaryManager.composition.test.tsx`) already stub the `window.electronAPI` global, so a Backend module would add an indirection without unlocking a test.

**The single IPC door is already enforced.** `tauriAPI` installs `window.electronAPI`, and `TauriApiAccessPath.test.js` rejects production value imports of it (GLOSSARY.md, "tauriAPI"). Callers that need injection already take the same object as a dependency (`ChapterOutlineStore`, `ReconcileLibrary`, `DictionaryContext` passing `save` / `importFiles` to the store).

**Same reasoning as ADR-014**, which kept save/move IPC in the provider for the same reasons.

## Consequence

Future architecture reviews should not read "N Backend modules and M direct `window.electronAPI` callers" as inconsistency. Add a Backend module when a new IPC command brings a protocol (cache, lock, retry, classification), and not otherwise. Revisit if a one-shot command grows a second caller that needs the same error handling.
