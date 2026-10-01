# ADR-057: Skip a ReaderSession Module

**Status:** Decided
**Date:** 2026-10-01

## Context

The architecture review of 2026-10-01 (candidate #5, `Speculative`) proposed a `ReaderSession` module for `src/components/reader/ReaderTab.tsx`: the open/encoding/reading transitions as one table (`open`, `needsEncoding`, `back`, `resume`), plus the one place that remembers `lastBook` and `resumeOnLaunch`. The evidence was five `useState`s (`openError`, `open`, `encodingChoice`, `isReading`, `lastBook`) and three refs, with the screen derived from them (`!isReading` is the shelf, `isReading && encodingChoice` the encoding prompt, `isReading && open` the reader); four `rememberReading` call sites; a resume effect re-entering `openBook`; and `ReaderTab.openBook.test.tsx` mocking nine modules.

Reading the code in the grilling:

- Every path that sets `isReading` to false (Back, a failed open) leaves `encodingChoice` as it was, and every path that can show the reader clears it first (`openBook` clears it on a successful decode and on a reopen of the open book). The state is implicit, but no sequence of actions I could construct shows the wrong screen.
- All four `rememberReading` calls are in `ReaderTab`. The other writes to `ReaderConfig` are `useLibrary`'s two `libraryPath` saves, which are different fields and merge.
- The resume effect is guarded by `resumeCheckedRef` and `isReadingRef`, and its config read is cached, so a book opened in the meantime is not replaced.
- The component's props and its callers would not change. `Bookshelf`, `BookReader` and `EncodingPrompt` read the same values whether they come from five states or one reducer.

## Decision

Do not build a `ReaderSession` module. The one concrete defect found in the area was in `useLibrary`, not in the session state: `scan` had no staleness guard, so a slow scan of the old folder could resolve after a newer scan and replace it. It is fixed there, with a latest-started-wins counter and tests.

## Reasoning

**The deletion test fails for the proposed module.** A reducer or class would hold the same transitions the component holds, behind the same props. This is the reasoning of ADR-044 (a split that leaves the caller-facing shape unchanged relocates complexity) and ADR-011 (coordination of one tab's state stays in that tab's component), and the 2026-09-30 launch-resume and `lastBook` additions are not enough to change it: they added call sites, not a second place that needs a narrower interface.

**Implicit is not the same as wrong.** Five fields encoding three screens is harder to read than one named state, but the render reads it in three lines and nothing found disagrees with itself.

## Consequence

A future review should not re-propose a `ReaderSession` module from the field count or the mock count of `ReaderTab.openBook.test.tsx`. Revisit if a transition bug appears that traces to these states disagreeing, or if a second component needs to start or resume a reading session and would want a narrower interface than `ReaderTab`'s.
