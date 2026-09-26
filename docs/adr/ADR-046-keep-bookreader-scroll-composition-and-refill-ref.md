# ADR-046: Keep `BookReader`'s Master-Scroll Composition and Refill Ref

**Status:** Decided
**Date:** 2026-09-26

## Context

Architecture review 2026-09-26 (candidate #5) set out to push `src/components/reader/BookReader.tsx`'s remaining wiring behind the panels and reading-anchor seam, once candidates #1, #3 and #4 had moved the chapter, record and binding-offer logic out. One piece did move: the page prefetch now lives in `useReaderPanels`, which already knows what the master is about to paint. Two pieces were grilled and stay, and both look like glue a future review will flag on sight:

- **The master-scroll composition.** `handleScroll` calls the reading anchor's `onScroll()`, then the panel sync's master `onScroll`, and is passed as the translation panel's `onScroll`.
- **The refill ref written during render.** `isRefillingRef.current = isTranslating` runs right after `useWindowedTranslation`, and `useReadingAnchor` receives `isRefilling: () => isRefillingRef.current`.

Both exist because of the order the three hooks have to be built in, and that order is not negotiable:

1. `useReaderPanels` creates the master and follower virtualizers.
2. `useReadingAnchor` needs them (`master`, `followers`) to measure and restore — so it comes after the panels.
3. `useWindowedTranslation` needs the anchor's `anchorLine`/`viewportLines` to plan — so it comes after the anchor.

Yet the panels' master scroll must reach the anchor (built after them), and the anchor's reload re-anchor loop must know whether the fill (built after it) is still refilling.

## Decision

Keep both in `BookReader` as written.

## Reasoning

**Master-scroll composition.** The alternatives both cost more than five explicit lines:

- `useReaderPanels` taking an `onMasterScroll` listener needs a ref trampoline to reach an anchor that does not exist yet when the panels are built — the same cycle, hidden one level down.
- `useReadingAnchor` attaching its own native `scroll` listener to `master.scrollRef` would mix a native listener with React's delegated `onScroll` on the same element. Today's order (anchor first, then the sync) would survive only because target-phase native listeners happen to run before React's root delegation — a correctness property resting on event-dispatch mechanics rather than on anything written down at the call site.

Deleting either alternative again would concentrate nothing: the two callees and their order are the whole content, and they are clearest where both are visible.

**Refill ref.** The anchor reads `isRefilling()` on its animation-frame loop, after commit, so a "latest value" ref written during render is always current by the time it is read. Passing a boolean through `anchor.setInputs` instead would lag one render — the anchor's inputs are set before the fill hook runs in the same render — so when the fill finishes, the reload re-anchor would keep holding the page for one extra render on a value that is already false.

## Consequence

Future reviews should not re-flag `handleScroll` or `isRefillingRef` as misplaced glue. Reconsider if the construction order changes — for example, if the reading anchor could be created before the panels and handed its virtualizers later — since that would remove the cycle both pieces exist to break.
