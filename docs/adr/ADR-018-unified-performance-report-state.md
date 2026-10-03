# ADR-018: Unified PerformanceReport State in usePerformanceMonitoring

**Status:** Superseded by ADR-069  
**Date:** 2026-06-07

## Context

`usePerformanceMonitoring` previously held two independent React states sourced from the same `performanceHealth.getReport()` call:

- `performanceStats` — `{ operations, avgTime, cacheHitRate }`
- `regressionHealth` — `{ status, criticalAlerts, warningAlerts, baselines }`

Both were written in `recordTranslation` (both updated together), but only `regressionHealth` was updated in `refreshCacheStats`. This meant `performanceStats.operations` and `performanceStats.avgTime` became stale after every `refreshCacheStats` call — a latent inconsistency that would silently show wrong operation counts in the UI after a cache refresh.

## Decision

Replace the two split states with a single `report` state holding the full `getReport()` return value. Both callbacks now call `setReport(performanceHealth.getReport(0))` — identical code, identical scope.

**Update (2026-07-28):** `getReport()` takes no arguments today — confirmed in `usePerformanceMonitoring.js` (`performanceHealth.getReport()`, no `0` arg) and `PerformanceHealth.js`. The `cacheHitRate` field this ADR describes the unified report as containing was deleted entirely (`TranslationSegmentCache` removed; the field was permanently 0 — see CLAUDE.md's deleted-symbols log). The single-`report`-state decision is unaffected by either change.

## Reasoning

**One source, one state.** `getReport()` is a single read path producing a single object. Decomposing it into two React states added no leverage — callers had to know which state held which fields, and the update granularity was inconsistently applied.

**The split-state was shallow.** The interface complexity (2 states, 2 setters, 2 callbacks, divergent update paths) nearly matched the implementation complexity (call `getReport()`, spread fields). Deletion test: removing the split logic concentrates no complexity — it just removes it.

**Structural fix, not workaround.** The staleness bug in `refreshCacheStats` is impossible by construction with a unified state — there is only one object to update.

**`getReport()` satisfies both prop interfaces.** `TranslatorControls` accepts `performanceStats: PerformanceStats` and `regressionHealth: RegressionHealth` as separate props. The unified `report` object satisfies both structurally (it contains `operations`, `avgTime`, `cacheHitRate`, `status`, `criticalAlerts`, `warningAlerts`, `baselines`). No prop interface changes were needed.

## Consequence

`usePerformanceMonitoring` returns `{ report, recordTranslation, refreshCacheStats }`. Callers pass `report` for both `performanceStats` and `regressionHealth` props. Future architecture reviews should not re-propose splitting `report` into per-concern state objects — the single-source invariant is the point.

If a future consumer needs only a subset of report fields and the cost of re-rendering on unrelated field changes becomes measurable, introduce a selector (e.g. `useMemo(() => report.avgTime, [report])`) at the call site rather than splitting state at the hook level.
