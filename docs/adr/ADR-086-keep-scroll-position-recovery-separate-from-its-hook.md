# ADR-086: Keep ScrollPositionRecovery Separate From useScrollPositionManager

**Status:** Decided
**Date:** 2026-10-07

## Context

Architecture review round 17 (candidate #3) deleted `useVirtualScrollRange`'s restore path, which left `ScrollPositionRecovery` (`src/utils/ui/ScrollPositionRecovery.ts`, 73 lines) with one adapter: `useScrollPositionManager`, the Translator's three-panel restore. By the "one adapter is a hypothetical seam" test, the generic `ScrollPositionRecovery<T>` and its injected `AttemptFn` have nothing that varies across them. The follow-up asked whether to fold the class into the hook, or at least drop the generic.

## Decision

Keep the class as its own module, and keep it generic. Do not merge it into `useScrollPositionManager`.

## Reasoning

**The class is the algorithm and the hook is the DOM, and they test differently.** The class's 8 tests drive the retry loop (RAF-first attempt, exponential backoff capped at `maxRetryDelay`, `cancel()`, a second `restore()` cancelling the first, retries exhausted) with a fake `attemptFn` and fake timers: no refs, no renderer. The DOM half, `tryRestoreScrollPositions`, is a pure function of refs and positions, tested directly. Folding the loop into the hook would put the retry timing behind `renderHook` with fake DOM refs, so every algorithm test pays for setup that has nothing to do with backoff.

**The merge only relocates the loop.** The hook would own `savePositions`, `cleanup`, the unmount effect, the latest-ref wiring and the retry loop with its timer handles. The class's interface (`restore`, `cancel`) is small and its implementation is the retry loop, so it is deep for what it does. ADR-084 rejected a merge of the same shape: a typed or tested contract at a call site, folded into the module that already carries the invariants.

**The generic costs nothing.** `T` is one type parameter. The class never reads `positions`, and the type is what keeps it from starting to. Dropping it changes the class, its tests and `AttemptFn<T>` for no simpler interface.

**What the follow-up did find was an untested DOM function.** `tryRestoreScrollPositions` had no test and wrote the same clamp block three times. It is now exported and tested (readiness, only the saved panels, clamping to what each panel can scroll), and written as one loop over the panels.

## Consequence

A review that sees one adapter on the class should find this ADR first. Reconsider if the hook's own tests end up driving `restore()` through fake timers anyway (the testability argument is gone), or if the class gains options only a second caller would use (then it is a hook in disguise). Do not add a second caller's options speculatively.
