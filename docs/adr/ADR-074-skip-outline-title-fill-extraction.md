# ADR-074: Keep the Outline-Title Fill Inside Its Hook

**Status:** Decided
**Date:** 2026-10-04

## Context

An architecture review (2026-10-04, round 10, candidate #3) asked whether `useOutlineTranslations`'s fill loop should move out of its effect into a plain class with `update`/`dispose`/`getSnapshot`, the way the viewport fill became `WindowFiller` (ADR-043's addendum, 2026-09-30). The case for it: the staleness rule (`isStale` vs `isAbandoned`, see `src/utils/reader/CLAUDE.md`) was collapsed there once, and the loop is only reachable through `renderHook`.

## Decision

Do not extract it. The hook stays as it is.

## Reasoning

**The extraction would move the loop, not concentrate anything.** `packBatches` and `assembleBatch` are already pure functions in the same file. What sits in the effect is a cache, an in-flight map, one generation counter and the loop. The hook would shrink by about 110 lines and a class would gain them; `useChapters`, the only consumer, reads two fields either way.

**`WindowFiller` was extracted for a reason this loop does not share.** Both bugs in the viewport fill's effect were in how it called already-tested pure pieces (`computeBands`, `planChunks`, `fillPlan`). Here there is no such seam: the loop calls one engine function and two in-file helpers.

**The behaviour is already pinned.** `useOutlineTranslations.test.ts` has eight tests, among them the three cases that tell stale from abandoned: a re-plan mid-batch caches the landed batch and does not re-request it, `isEnabled` going false lets the in-flight batch land but starts no further one, and unmounting mid-batch stops further engine calls. They were added with the 2026-09-26 fix, and no later bug has been found in this file.

**One consumer, one adapter.** A plain class with a hook over it is a seam only if something varies behind it. Nothing does.

## Consequence

Future architecture reviews should not re-propose a plain-class `OutlineFiller`. Revisit if a second consumer of the title loop appears, or if the staleness bug recurs in a way the existing tests do not catch. ADR-043's decision (no shared primitive between the two fills) stands.
