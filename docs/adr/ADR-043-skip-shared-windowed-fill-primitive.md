# ADR-043: Skip a Shared Generation-Guarded-Fill Primitive

**Status:** Decided
**Date:** 2026-09-19

## Context

An architecture review round (candidate #2) flagged `src/hooks/useWindowedTranslation.ts` and `src/hooks/useOutlineTranslations.ts` as hand-duplicating the same coordination shape — a cache ref, a `generationRef` for cancellation, priority/distance ordering before batching, and an async loop with try/catch. `useOutlineTranslations`'s own doc comment even says it "mirrors `useWindowedTranslation`'s cache-and-generation shape." The card's badge was `Worth exploring`, recommending extraction of a shared primitive once both adapters' real shapes were in view — deferred from candidate #1's grilling (2026-09-19), which narrowly extracted `fillPlan` (`src/utils/reader/WindowedTranslationFill.ts`) for `useWindowedTranslation` alone on the reasoning that "one adapter is a hypothetical seam."

Grilling this candidate with `fillPlan` now built and `useOutlineTranslations.ts` read in full surfaced real, not incidental, variation between the two:

- **Call arity.** `fillPlan` makes two ordered engine calls per unit (`translateChunk` then `translateGloss`). `useOutlineTranslations` makes one (`translateBatch`).
- **Cache shape.** `useWindowedTranslation` uses `TranslationChunkCache`, a class with LRU eviction (`prune`, `isFresh`, capacity) because a translated chunk is expensive and the keep band can hold ~100k characters. `useOutlineTranslations` uses a plain `Map<number, {title, version}>` with no eviction at all — chapter titles are few and cheap, kept for the life of the book.
- **Effect splitting.** `useWindowedTranslation` splits book-change reset into its own effect, separate from the fill-scheduling effect — required because of the prune/keep-band bookkeeping. `useOutlineTranslations` does both in one effect. This split is _why_ `useWindowedTranslation` needed the isStale-after-every-`await` fix (candidate #1): a _different_ effect bumping `generationRef` independently of the fill effect's own closure is exactly the race that fix closed. `useOutlineTranslations`'s single-effect shape was never exposed to that race — bumping `generationRef` happens synchronously, in the same effect invocation, before any new async work starts.
- **Blank-input handling.** `fillPlan` skips a blank chunk outright (retried next plan). `useOutlineTranslations` writes a blank title through to the cache as "translated" — correct for its domain, since a blank chapter title has no real translation to wait for.

## Decision

Do not build a shared primitive. Instead, apply the one genuinely portable improvement — isolate-and-continue error handling (a failed unit is logged and skipped, not fatal to the rest of the plan) — directly to `useOutlineTranslations`, matching `fillPlan`'s change from candidate #1 at the same granularity (one failed batch, not one failed title). `useOutlineTranslations` does **not** need the isStale-after-`await` fix; it was never exposed to the race that motivated it.

## Reasoning

**Surface-pattern similarity isn't the same signal as shared depth.** Both hooks look alike in outline (cache ref + generation ref + async loop), which is what made this candidate plausible from the outside. Reading both in full showed the variation is in exactly the parts that would have to live in the shared interface — call count, cache eviction policy, effect topology — not in incidental implementation detail that a wrapper could hide. A primitive covering all of it would need a config object parameterizing each axis (engine-call arity, a cache adapter interface, an effect-splitting strategy), which is a shallow wrapper accreting options, not a deepening.

**Two adapters justify a seam only when something real varies _behind_ a shared interface — not when the "shared" shape turns out to be two different problems wearing the same three variable names.** `generationRef`, a cache ref, and an async loop are a common idiom for cancellable incremental work in this codebase; that doesn't make every instance of the idiom one module.

## Consequence

Future architecture reviews should not re-flag these two hooks' "duplicated cache-and-generation shape" on sight. Revisit only with new evidence — e.g. a third windowed-fill consumer whose shape actually matches one of the two closely enough to share, or a concrete bug proven to come from the duplication itself rather than from either hook's own domain logic. Absent that, each hook owns its own fill loop, same as `TranslationChunkCache` (LRU, eviction) and `useOutlineTranslations`'s plain `Map` (no eviction) were correctly never unified — they solve different caching problems, not the same one twice.

## Addendum (2026-09-30)

The viewport fill's plan lifecycle moved out of `useWindowedTranslation`'s effect into a plain `WindowFiller` class (`src/utils/reader/WindowFiller.ts`, architecture review candidate #2). That deepens one hook and shares nothing with `useOutlineTranslations`; this decision stands. A later review should not read the filler as the start of a shared primitive and try to fold the outline loop into it.
