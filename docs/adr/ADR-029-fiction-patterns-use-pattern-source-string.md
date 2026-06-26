# ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name

**Status:** Decided  
**Date:** 2026-06-26

## Context

When `TranslationEngine` processes a match and calls `semanticArrayBuilder.addUnit()`, the `translationSource` argument determines phase priority via `getSourcePriority()`. The wrong source string silently returns priority 999 and corrupts output order.

For proper noun matches, the source string is the dictionary name itself (e.g. `'properNouns-f_DuongThan'`). This gives proper nouns their own priority tier (Phase 2) distinct from phrases (Phase 4).

For fiction structural pattern matches from `patterns-f_X`, two options were considered:

1. **Dictionary name as source** — `'patterns-f_DuongThan'`. Distinct per-fiction source string, analogous to proper nouns. Requires `getSourcePriority()` to recognize a `patterns-*` prefix and return Phase 1 priority, or it returns 999.
2. **`'pattern'` as source** — same string as global pattern matches. Fiction patterns are Phase 1 patterns; their provenance is recorded in `match.dictionary` but does not affect priority.

## Decision

Use `'pattern'` as the source string for fiction structural pattern matches (option 2). Fiction patterns produce the same `translationSource` as global patterns. No changes to `getSourcePriority()` or `TranslationSourcePriority.js`.

## Reason

**Fiction patterns are Phase 1 patterns.** The source string encodes phase membership. Fiction structural patterns belong to Phase 1 — they do not need a separate priority tier. Giving them a distinct source string that maps to the same priority as `'pattern'` adds complexity with no semantic benefit.

**The proper noun analogy does not apply.** Proper nouns use dictionary name as source specifically because they need a distinct priority tier (Phase 2 vs Phase 4 phrases). Fiction patterns have no such need — they are Phase 1 regardless of which file they came from.

**`getSourcePriority()` is a silent corruption risk.** Any unrecognized source string returns priority 999, ranking below character fallback and silently corrupting output. Adding a new recognized prefix (`patterns-*`) would need to be maintained whenever a new fiction is created. Using `'pattern'` requires no such maintenance.

**`match.dictionary` preserves provenance.** If a future caller needs to know that a match came from `patterns-f_DuongThan` vs `patterns`, `match.dictionary` carries that information. The source string only needs to encode phase priority, not full provenance.

## Consequences

- Fiction structural pattern matches are indistinguishable from global pattern matches in the semantic array. Highlighting and clickable segments treat them identically.
- If a future feature needs to highlight "this segment came from a fiction-specific pattern" differently, the source string would need to be changed to the dictionary name — requiring `getSourcePriority()` to be updated and tested. This is the main cost of this decision.
- No changes to `getSourcePriority()`, `TranslationSourcePriority.js`, `addUnit()`, or `validateConsumedTokenContract()`.
