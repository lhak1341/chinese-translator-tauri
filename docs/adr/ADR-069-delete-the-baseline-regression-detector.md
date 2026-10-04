# ADR-069: Delete the Baseline Regression Detector

**Status:** Decided
**Date:** 2026-10-03
**Supersedes:** ADR-018, ADR-030. Finishes what ADR-032 started.

## Context

`SystemPerformanceMonitor` polled every 30 s and fed three series into `PerformanceBaselineTracker`. The tracker raised an alert at 1.2× its baseline (warning) or 1.5× (critical), and the Translator tab's status dot read the last hour of alerts through `PerformanceHealth`. The 2026-10-03 architecture review (candidate #3) found the chain could not do its job:

- The `translation_engine` series was `globalPerformanceMonitor`'s cumulative mean since launch, sampled whether or not anything was translated. The baseline was the first ten samples (about 5 minutes in). With nothing translated in that window the baseline was 0, and `checkImmediateAlerts` requires a baseline above 0, so that series never alerted for the session. A baseline refresh happens only after 24 h.
- With a non-zero baseline, an alert meant "the mean since launch rose 20% over its minute-5 value". That tracks text-size mix, not regressions.
- The `virtual_scrolling` series came from the adaptive scroll buffer, deleted the same day. The `wasm_memory_pool` series was the pool's allocation time.
- Its memory inputs read `performance.memory`, which WebKit does not have (CONTEXT.md, "Memory signals on macOS").
- The owner had never seen the dot leave green.

## Decision

Delete `PerformanceBaselineTracker`, `SystemPerformanceMonitor`, `PerformanceHealth`, the `utils/performance` barrel, the 30 s poll in `App.jsx`, and every `DevConsole` command that read them (`getHealthReport`, `getDebugReport`, `getBaselines`, `getAlerts`, `getTrends`, `exportData`, `resetData`, `checkCachePerformance`, `window.systemPerformanceMonitor`, `window.checkRealMemory`).

`usePerformanceMonitoring` calls `globalPerformanceMonitor` directly and returns `{ avgTime, recordTranslation }`. `TranslatorControls` takes `avgTime` and shows the average ms; the status dot is gone. `window.performanceDashboard.getStats()` returns `globalPerformanceMonitor.getMetrics()`.

`WasmMemoryPoolManager` stayed here; it was deleted separately on 2026-10-04 (nothing borrowed its buffers, and its pressure detector was inert on macOS).

## Consequences

- ADR-018's single-`report` state and ADR-030's "sole barrel export" rule have nothing left to govern.
- Future reviews should not re-propose a regression detector on spec. If a real slowdown signal is wanted, design it against a measured need, with a per-translation metric normalized by text size rather than a cumulative mean.
- A real memory signal for the reload paths is still open and unbuilt (CONTEXT.md). This ADR does not decide it.
