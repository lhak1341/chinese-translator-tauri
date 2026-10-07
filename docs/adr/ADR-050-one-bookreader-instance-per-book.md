# ADR-050: One BookReader Instance per Book

**Status:** Decided
**Date:** 2026-09-27

## Context

Architecture review 2026-09-27 (candidate #1, rated Strong). `ReaderTab` rendered `<BookReader>` without a `key`. Back already unmounted it, but a switch from the command palette (`switchBook` → `openBook` → `setOpen`) re-rendered the mounted instance with a new book. Every hook under it therefore had to notice the new book on its own: useWindowedTranslation, useBookLines, useOutlineTranslations, useChapterOutline, useReaderHighlight, useBindingOffer and useReadingAnchor each had a reset effect or a fingerprint-comparing guard.

Two things had no reset at all:

- **Measured row heights.** `@tanstack/react-virtual` keys its size cache by index, and only `measure()` clears it. The next book inherited the previous book's heights.
- **The scroll offset.** `ReadingAnchor.open()` does nothing when the book has no saved position, so a never-opened book reached from the palette started at the previous book's `scrollTop`.

## Decision

`ReaderTab` keys `BookReader` by `open.book.fingerprint`. A book's lifetime is the component's lifetime: a different book is always a fresh mount, whichever route opened it. The hooks under `BookReader` assume one book per instance, and their book-change branches are deleted.

The Reader's engine queue (`useReaderEngine`) moves up to `ReaderTab`, which never unmounts, and reaches `BookReader` as its `engine` prop. The queue has to outlive a switch: a call from the previous book may still be in flight, and the next book's first calls must wait behind it.

## Reasoning

**The deletion test concentrates.** Book identity now lives at one seam, the `key`. About six reset effects were deleted, not moved, and the two missing resets are fixed without adding code for them.

**Only unmount-driven guards stay.** A result from the previous book can still resolve after the switch, because the call was already made. That is an unmount case, and it stays guarded where it matters: `useWindowedTranslation`'s abandon bump on unmount, and a matching unmount stop in `useOutlineTranslations`. Without the second one, the old book's remaining title batches would queue ahead of the new book's text. Guards that compared fingerprints after an `await` could no longer fire and were deleted as misleading.

**Encoding is not part of the key.** A new encoding for the same file goes through `EncodingPrompt`, which unmounts `BookReader` first. The same fingerprint therefore cannot arrive with a different encoding while an instance is mounted.

**Losing view state on a switch is intended.** The outline panel, the binding banner's dismissal, a highlighted unit and the palette are all about one book. The banner's dismissal already lasted "as long as the reading view", so Back and reopen offered again. A switch now behaves the same way.

## Consequence

Do not remove the `key` to keep view state across a switch. If some state should survive one, lift it to `ReaderTab`, as the engine queue was. A new hook under `BookReader` can treat its `fingerprint` as fixed and needs no book-change branch. It still needs an unmount guard if its async work outlives the component and feeds the shared engine queue.

`ReaderTab.openBook.test.tsx` pins the contract: a palette switch mounts a second `BookReader`, and both instances receive the same `engine`.

The separate gap between the Reader and the Translator, documented in `src/utils/reader/CLAUDE.md`, is unchanged. The tab gate stops new Reader calls on a tab switch but does not abort one already in flight.

**Addendum 2026-10-07:** that gap is closed by ADR-085. The queue this ADR lifted into `ReaderTab` moved into `EngineAccess` (`useEngine().engineAccess`), shared with the Translator; `useReaderEngine` still runs in `ReaderTab` so the call objects stay stable across book switches.
