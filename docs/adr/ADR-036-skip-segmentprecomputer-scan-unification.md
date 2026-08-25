# ADR-036: Skip Unifying `precomputeSegments`/`precomputeOriginalSegments` Into a Shared Scanner

**Status:** Decided (addenda 2026-08-25)
**Date:** 2026-08-08

## Context

An architecture review round (candidate #6) flagged `src/utils/highlighting/SegmentPrecomputer.ts`'s `precomputeSegments` (Vietnamese/translated-panel segmentation) and `precomputeOriginalSegments` (Chinese/original-panel segmentation) as ~130-line duplicated greedy longest-match scans, proposing a shared parameterized scanner.

Direct investigation during grilling found the two functions are not cosmetically different implementations of the same algorithm — they solve genuinely different matching problems:

- **`precomputeSegments`** matches via `findUnitMatch`: skips leading punctuation/whitespace before comparing, compares case-insensitively and whitespace-normalized (`normalizeText`), and indexes candidates by lowercased first UTF-16 code unit.
- **`precomputeOriginalSegments`** matches via plain `text.startsWith(unit, currentPosition)`: no punctuation-skip, no case/whitespace normalization, indexes candidates by grapheme cluster (`getFirstGrapheme`, needed for combining-diacritic clusters that raw indexing would miss).
- A third function, `buildSegmentsFromPositions`, is an entirely separate fast path — only reachable from `precomputeOriginalSegments`, bypassing the scan altogether when every semantic-array entry already has `originalStart`/`originalEnd` metadata.

CLAUDE.md already documents that a prior attempt to unify just these two functions' tie-break comparators (`?? 0` vs `?? Number.MAX_SAFE_INTEGER` for a missing `tokenIndex`) caused a real bug before being reconciled — the same failure class this candidate proposed reopening at a larger scale.

Test coverage was also found lopsided: `precomputeSegments` has ~26 tests (duplicates, NFC normalization, line breaks, position integrity, `findUnitMatch`, `normalizeText`); `precomputeOriginalSegments` had only 3 shallow tests; `buildSegmentsFromPositions` — the fast path that fires for every single-chunk (short) translation, the common case — had zero tests at all.

## Decision

Do not build a shared parameterized scanner. Close the test-coverage gap instead: added duplicate/tie-break parity tests for `precomputeOriginalSegments` (mirroring `precomputeSegments`'s existing coverage) and a dedicated test block for `buildSegmentsFromPositions` (fast-path routing, gap-before-first-entry, trailing text, overlap guard, originalStart-order-not-array-order, and the `allHavePositions` gating condition itself) — see `src/utils/__tests__/SegmentPrecomputer.test.ts`.

## Reasoning

**The deletion test fails.** Deleting either function and inlining a shared scanner in its place wouldn't concentrate complexity — it would require the shared scanner to accept the match predicate, the index-key function, the punctuation-handling strategy, and the unmatched-text segmentation strategy as parameters, since all four are exactly where the two functions load-bearingly diverge. What's left over after parameterizing away everything that differs is just loop control-flow (`while (currentPosition < text.length)`, `usedIndices` tracking, `segments.push`) — the shared module's interface would end up nearly as complex as its implementation, the shallow-module anti-pattern this whole review exists to fix, not create.

**One adapter, not two, for the parts that would actually be shared.** The codebase-design principle "two adapters justify a seam" doesn't apply here in the direction the candidate assumed — the genuinely shared part (loop skeleton) has no behavioral variation to justify a seam at all, while the parts with real variation (matching semantics) are each used exactly once and don't need one either.

**This codebase has already paid for this exact mistake once.** The tie-break comparator unification bug (documented in CLAUDE.md, `src/utils/CLAUDE.md`'s "Duplicate-Word Highlighting Requires `tokenIndex` Ordering" entry) is direct precedent: unifying a smaller piece of these same two functions already produced a silent divergence bug. Attempting a full-scan merge without first closing the test gap would repeat that mistake at larger scale — and even with the test gap closed, the matching-semantics differences found are real design decisions (Vietnamese output needs punctuation-skip and case-normalization because translated text carries different surrounding punctuation; Chinese source text doesn't), not accidental drift to reconcile.

## Consequence

Future architecture reviews should not re-propose merging these two scan loops without new evidence that the matching-semantics differences have become accidental rather than load-bearing. The test-coverage gap that made a prior comparator-unification bug possible is now closed for both the scan path and the fast path — a future genuine parity concern between the two panels has real characterization tests to check against, matching the precondition ADR-033 already established for the JS/WASM pattern-matcher pair (a trusted oracle must exist before a parity/unification effort is safe to attempt).

## Addendum (2026-08-25): `precomputeSegments` deleted — this ADR's original subject no longer exists

`precomputeSegments`/`findUnitMatch` (the Vietnamese/translated-panel scan this ADR compares against `precomputeOriginalSegments`) was deleted 2026-07-17 (commit `57a413c`) as dead code — its sole caller, the `useFullTranslationSegments` hook, had zero production callers of its own; the full-translation path never computed segments client-side, it always consumed `prebuiltSegments` built engine-side. The deletion is unrelated to `segmentFromPositionMetadata` (`src/utils/highlighting/PositionMetadataSegmenter.ts`) — that function was created 2026-06-05, six weeks _before_ this deletion, and has always served a different panel (the char-only translated panel, via `useCharacterOnlySegments`), not a replacement for `precomputeSegments`.

Practical effect: the Context/Decision/Reasoning above correctly describe a decision that was right when made 2026-08-08, but the specific merge question they answer (`precomputeSegments` vs `precomputeOriginalSegments`) is now moot — there is nothing left to merge on that axis. Kept as historical record rather than rewritten, since the reasoning itself isn't wrong. See the next addendum for the pairing that's actually live today.

## Addendum (2026-08-25): Extending the decision to `segmentFromPositionMetadata` vs `precomputeOriginalSegments`

With `precomputeSegments` gone, the real duplication surface between the two char-only panels is `segmentFromPositionMetadata` (translated panel) vs `precomputeOriginalSegments` (original panel, this file). Investigated directly rather than assumed, per this ADR's own Consequence clause requiring new evidence:

The two functions' fallback strategies differ in **granularity**, and it's load-bearing, not accidental:

- **`precomputeOriginalSegments`** gates all-or-nothing on `allHavePositions` (every entry in the semantic array has `originalStart`) before delegating entirely to `buildSegmentsFromPositions`; otherwise the whole array runs the greedy scan. This matches how `originalStart` actually fails: it comes from direct tokenizer offsets, present on every entry _unless_ the parallel-chunk merge path drops the field for the entire array at once (see `PositionBasedSegmentBuilder`'s CONTEXT.md entry) — a batch-level failure mode.
- **`segmentFromPositionMetadata`** checks `translatedStart`/`translatedEnd` per unit, falling back to `indexOf` for that unit alone when invalid. This matches how `translatedStart` actually fails: `TranslationEngine.js`'s char-only position-assignment loop (lines 1216-1256) sequentially assigns positions via best-effort `indexOf`, and its `else` branch (lines 1251-1254) leaves an individual unit's metadata unset when the search misses — a per-unit sparse-gap failure mode, never a whole-array one.

A shared "prefer metadata, fall back to text search" scanner would have to parameterize away exactly this granularity difference (whole-array gate vs per-unit check) on top of the same case/script differences ADR-036's original comparison already found load-bearing (Vietnamese needs case-insensitive/normalized matching; Chinese needs grapheme-cluster indexing, not applicable here). The deletion test fails again, for a verified reason: each panel's fallback strategy is shaped by how its own upstream position-assignment code actually fails, not by convention drift. `ADR-002`'s 2026-07-28 update already namechecks `segmentFromPositionMetadata` as part of the char-only path's real architecture — this addendum is the merge-worthiness analysis that update didn't do.

Same standing instruction as the original Consequence section: don't re-propose unifying this pair without new evidence that the granularity difference has become accidental.
