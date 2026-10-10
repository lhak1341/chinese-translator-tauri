# ADR-093: Skip a Dictionary-Tab Action Runner

**Status:** Decided
**Date:** 2026-10-10

## Context

`DictionaryManager.tsx` has five handlers that report failure to the error banner: `handleUndo`, `handleRedo`, `handleOpenFolder`, `handleExportDictionaries` and `handleImportDictionaries`. Each clears the banner, makes a call and sets an error message, and most also log. The architecture review of 2026-10-10 (round 25, candidate #6) proposed a local `runAction(label, fn)` that owns the error state and message formatting.

## Decision

Do not add the runner. The handlers stay as they are.

## Reasoning

**Only undo and redo are the same shape.** Both are a try/catch with a static message and `logger.error`. The others differ:

- Open folder and export handle two failure channels, a `{ success: false }` result and a thrown error, each with its own message format ("failed: …" and "error: …"). Open folder logs both; export logs only the throw and raises a success toast.
- Import has no try/catch at all. The store resolves a three-way outcome (`failed`, `reload-failed`, success) and the handler wraps it in a `finally` that clears the loading flag.

A runner would take the message, the result check, the success toast and the loading flag as callbacks. That moves the differences into the callbacks instead of concentrating anything, the argument of ADR-070. The saving is about 15 lines.

**The real gap was the tests.** Nothing covered undo or redo throwing, or export failing or rejecting. `DictionaryManager.composition.test.tsx` now has four tests for those banners, next to the existing import and open-folder ones. A message change fails them (checked by temporarily editing two messages).

## Consequence

Future architecture reviews should not re-propose a shared runner for these handlers from the repeated `setError`/`logger.error` lines alone. Revisit if the handlers converge on one return shape, or if a sixth handler with the same static-message shape as undo and redo appears.
