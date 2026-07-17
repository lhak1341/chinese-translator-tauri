# ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface

**Status:** Decided  
**Date:** 2026-06-19

## Context

`TranslationEngine.js` exposes 9–10 performance-related methods:

- `getEngineStats()` — translation counts, timing, throughput, memory stats
- `getPerformanceReport()` — delegates to `performanceProfiler.getPerformanceReport()`
- `getDashboardMetrics()` — delegates to `performanceProfiler.getDashboardMetrics()`
- `enableProfiling()` / `disableProfiling()` / `resetProfiling()` — toggle `translationProfiler`
- `getProfilingReport()` — phase-by-phase breakdown from `translationProfiler`
- `getWasmPerformanceReport()` — delegates to `dictionaryManager.getPerformanceReport()`
- `getCoreEngineStats()` — internal engine counters
- `getPerformanceAnalysis()` — delegates to `performanceLogger.getPerformanceAnalysis()`

Backed by 3 separate modules: `TranslationProfiler`, `PerformanceProfiler`, `PerformanceMonitor`.

The 2026-06-19 architecture review proposed unifying these behind a single `PerformanceReporter` interface: `getReport(scope)` where scope is `'phases' | 'batches' | 'system' | 'wasm' | 'all'`.

## Decision

Do not extract a `PerformanceReporter`. Keep the wide flat interface on `TranslationEngine`.

## Reason

**Only `getEngineStats()` has live app callers.** Translator.jsx calls it at 3 sites (L277, L1069, L1070) to update the engine stats display. Every other method is a dev-console diagnostic tool accessed via `window.translationEngine.*` during debugging.

The deletion test reveals two different situations in the same method list:

- `getEngineStats()` — real seam, concentrates complexity at callers if removed. Keep as-is.
- All other 9 methods — zero app callers. Deletion concentrates zero complexity. These are dev tools, not an interface.

For dev-console tools, a flat named interface beats a scope-parameterized one: `window.translationEngine.getProfilingReport()` is tab-completable and self-describing; `window.translationEngine.perf.getReport('phases')` requires knowing the scope vocabulary. Abstraction trades discoverability for narrowness — the wrong tradeoff for irregular diagnostic use.

The wide method count is not friction; it is the correct shape for an inspection surface.

## If App Callers Are Added

If a performance dashboard component is built that calls multiple TE perf methods, revisit. The extraction becomes justified when there are ≥2 app callers that share the same multi-method call pattern — at that point a `PerformanceReporter` removes duplication rather than adding indirection.

## Addendum — 2026-07-18: Extends to `TwoPhasePatternProcessor`'s pattern-profiling cluster

A 2026-07-18 architecture review surfaced a structurally identical, previously-undocumented cluster: `TwoPhasePatternProcessor`'s `enableInternalProfiling()` / `disableInternalProfiling()` / `resetInternalProfiling()` / `getInternalProfilingReport()` / `printInternalProfilingReport()`, plus `TranslationEngine`'s 5 matching delegators (`enablePatternProfiling()`, `disablePatternProfiling()`, `resetPatternProfiling()`, `getPatternProfilingReport()`, `printPatternProfilingReport()`).

This ADR's original method list did not name this cluster — it is textually distinct from `TranslationProfiler`'s generic `enableProfiling`/`disableProfiling`/`resetProfiling`/`getProfilingReport`. But the same reasoning applies without modification: zero app callers anywhere, reachable only via `window.translationEngine.*` in devtools (gated `NODE_ENV === 'development'` same as every other dev tool this ADR covers), disabled by default with zero overhead when off. The deletion test gives the same answer — zero complexity concentrates anywhere if removed, because nothing calls it.

**Correction, not just extension:** the review also found this cluster had zero test coverage anywhere (not even its own test file), contradicting an initial claim that `TwoPhasePatternProcessor.test.js` covered it. Rather than leave an untested-but-kept surface, dedicated tests were added: `TwoPhasePatternProcessor.internalProfiling.test.js` and `TranslationEngine.patternProfiling.test.js`. Future reviews: this cluster is decided-kept per this ADR; a missing test file is not grounds to re-flag it as dead.
