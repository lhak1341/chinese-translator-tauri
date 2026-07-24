# ADR-032: Delete PerformanceBaselineTracker's cacheHitRate Machinery

**Status:** Decided
**Date:** 2026-07-24

## Context

The 2026-07-17 `ContentAwarePositionCache` deletion (see CLAUDE.md's deleted-symbols log) considered and explicitly kept `PerformanceBaselineTracker.js`'s `cacheHitRate` regression-tracking machinery — `avgCacheHitRate`/`medianCacheHitRate` baseline fields, the EMA update in `updateBaseline`, and the `cache_degradation` alert branch in `checkImmediateAlerts` — reasoning it was "generic machinery, reusable for any future operationType, not specific to this cache." At that point it was already unfed: no `recordPerformance` caller set a `cacheHitRate` field on its metrics object.

A 2026-07-24 architecture review re-surfaced the same code as part of narrowing `PerformanceHealth`'s interface (the `getReport()`/`getDebugReport()` split). It remains unfed — `grep`-confirmed zero producers across `SystemPerformanceMonitor.recordIntegrationMetrics`'s three integrations (`translation_engine`, `virtual_scrolling`, `wasm_memory_pool`), the only `recordPerformance` call sites in the codebase. `establishBaseline`'s `avgCacheHitRate` computation was always `0`; the alert branch's `baseline.avgCacheHitRate > 0` guard could never pass.

## Decision

Delete the full `cacheHitRate` machinery: `avgCacheHitRate`/`medianCacheHitRate` baseline fields, their EMA update in `updateBaseline`, the `cache_degradation` branch in `checkImmediateAlerts`, and the `cacheHitRateWarning`/`cacheHitRateCritical` threshold options. This supersedes the 2026-07-17 "left intact, reusable" reasoning.

## Reasoning

**"Reusable for a future operationType" never materialized.** A full week (and several further architecture-review rounds) passed with no new cache built that fed it. Generic machinery kept on spec for a hypothetical future consumer, with no consumer arriving, is the same failure mode this codebase has already named five times over (`cacheHitRate`/`TranslationSegmentCache`, `ContentAwarePositionCache`, `getSyncMetrics`, `getPrecomputedCacheStats`, `getEnhancedPerformanceReport`/`isWasmBeneficial`) — a constant-zero metric nobody reads.

**It has direct unit test coverage, which made it look load-bearing.** `PerformanceBaselineTracker.test.js` fed synthetic `cacheHitRate` values and asserted the alert fires — proving the mechanism works in isolation, not that anything in the app produces the data it needs. Test coverage of a dead path is not evidence of use.

**Reopening it needs a concrete trigger, not renewed absence of one.** If a future cache is built and needs regression tracking, re-add cache-hit-rate tracking fitted to that cache's actual metrics shape — not resurrect this generic pre-built version, which was never validated against any real cache's data.

## Consequence

Future architecture reviews should not re-propose keeping or restoring generic `cacheHitRate` regression machinery in `PerformanceBaselineTracker` on spec. If a concrete cache with a real hit-rate metric is introduced, add tracking scoped to that cache when it lands, informed by its actual metrics — not before.
