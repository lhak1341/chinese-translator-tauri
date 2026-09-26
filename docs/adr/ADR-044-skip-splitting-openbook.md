# ADR-044: Skip Splitting `ReaderTab`'s `openBook`

**Status:** Decided
**Date:** 2026-09-19

## Context

An architecture review round (candidate #6) flagged `src/components/reader/ReaderTab.tsx`'s `openBook` as one function conflating two behaviors: an early-return branch that reopens an already-open book (skips the decode round trip, re-reads its record) and the rest of the function, which decodes a book via `tauriAPI.openBook` and records it fresh. The card's own badge was `Speculative` — the function is comprehensible as written, this was a plausible deepening opportunity, not a reported pain point. Proposed split: `reopenAlreadyOpenBook(book)` / `openNewBook(book, encodingOverride?)`, sharing a small `applyRecordToOpenState(record)` helper.

Grilling this candidate required reading `openBook` in full alongside every call site that invokes it. That surfaced:

- All four callers of `openBook` (`Bookshelf`'s `onOpen`, the command-palette-driven `switchBook`, `chooseEncoding`, and a direct call after choosing an encoding override) call the _same_ entry point with the _same_ signature `(book, encodingOverride?)`. None of them knows or needs to know in advance whether the book is already open — that decision is exactly what the branch inside `openBook` makes.
- Applying the deletion test to the _proposed split itself_ (not just to today's code, following the precedent set by ADR-039's grilling): if the split were undone — merged back into one function — nothing gets more complex at any call site, because no call site was ever going to call `reopenAlreadyOpenBook` or `openNewBook` directly. The branching decision has to live behind one caller-facing entry point regardless of how the body is organized internally. A split would only insert a dispatcher (`openBook` calls one of the two based on the same `open?.book.fileName === book.fileName` check it already makes) between the same callers and the same two code paths — relocation, not concentration.
- The two branches also aren't equally-weighted twins the way the split's naming suggests: reopen is read-only against `BookRecordsBackend` (`loadBookRecords`), has no error-state handling (its catch just logs — nothing user-facing can fail), and never touches the `openingFileNameRef` dedup guard. Fresh-open writes via `recordBookOpened`, has full error handling (`setShelfError`, `setIsReading(false)`), and owns the dedup guard. A shared `applyRecordToOpenState(record)` helper across them would need to paper over a `setOpen(previous => ({...previous, ...}))` merge (reopen) vs. a `setOpen({book, encoding, ...})` full replace (fresh-open) — two different operations on `open` state, not one factored out.
- One genuine duplication did exist independent of the split question: both branches construct the same `{fingerprint, fileName, title}` object literal for `announceOpenBook`, from two different sources (`open.book` vs `result.book}`). `BookBindingContext.tsx` already names this shape (`OpenBookIdentity`) for an unrelated reason (its own context value); reusing it here removes an actual repeated shape.

## Decision

Do not split `openBook` into two named functions. Instead:

- Extract the one real duplication: a small `identityOf(book: OpenBook): OpenBookIdentity` helper, replacing both inline `{fingerprint, fileName, title}` literals.
- Add `ReaderTab.openBook.test.tsx` — this component's first test coverage — characterizing both branches, the double-click dedup guard, and the two failure paths (`needsEncoding`, a thrown decode error).

## Reasoning

**A proposed split earns its keep only if some caller benefits from a narrower slice — otherwise it's the same disqualifier as ADR-039's `useDictionaryEntryForm` grilling, applied to component logic instead of a hook's return shape.** There, a wide return object wasn't shallow because its one caller needed all of it; here, one entry point isn't conflated because its four callers all need the same decision made on their behalf. Both cases fail the deletion test the same way: undoing the proposed change doesn't concentrate complexity anywhere, because it was never scattered across multiple callers to begin with.

**Field/branch count alone isn't the shallow-module signal — whether the caller-facing shape would actually change is.** The split's proposed function names (`reopenAlreadyOpenBook`, `openNewBook`) read as though they belong at the interface. They don't: the interface Reader's four callers actually use is `openBook(book, encodingOverride?)`, unchanged before and after the split, because the decision of which internal path to take is the function's job, not the caller's.

## Consequence

Future architecture reviews should not re-flag `openBook`'s branch-based shape on sight. Reconsider only with new evidence — e.g. a second real caller that already knows which path applies and would benefit from calling it directly (none of the current four do), or the two branches growing enough independent complexity that reading them interleaved becomes genuinely hard (today's ~100 lines, two branches, one early return, isn't there). Absent that, `openBook` stays one function with an early-return branch, same shape as `useDictionaryEntryForm`'s wide-return-object precedent: comprehensible as written, and a split would relocate rather than remove its complexity.

## Addendum (2026-09-26): the open book holds its whole record — decision unchanged

Architecture review 2026-09-26, candidate #3, changed what `openBook` stores, not how it is shaped. `OpenState` now holds the book's whole `record: BookRecord` in place of three copied fields (`position`, `chapterOutline`, `manualChapterPattern`), and `BookReader` takes that one `record` prop. The reopen branch sets `{ ...previous, record }` rather than patching three fields, and reads with `withBookRecordsLock(loadBookRecords)`: Back queues the final position write as the reader unmounts, so an unlocked read could restore the position before it. A failed `recordBookOpened` falls back to `emptyBookRecord` instead of four `null` locals.

`openBook` is still one function with an early-return branch, and there is still no shared `applyRecordToOpenState` helper — holding the whole record made one unnecessary, since both branches now set the same single field. The Context section above describes the reopen read as it was before this change.
