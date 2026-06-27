# ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`

**Status:** Decided  
**Date:** 2026-06-27

## Context

`src/utils/performance/index.ts` previously re-exported three singletons:

```ts
export { globalPerformanceMonitor } from './PerformanceMonitor';
export { systemPerformanceMonitor } from './SystemPerformanceMonitor';
export { performanceHealth } from './PerformanceHealth';
```

`performanceHealth` was designed as the unified gateway — callers import it, it wraps both monitors internally. But two callers bypassed it via the barrel:

- `App.jsx` — imported `systemPerformanceMonitor` for lifecycle (`startMonitoring`, `destroy`) and a startup diagnostic log.
- `DevConsole.js` — imported `systemPerformanceMonitor` for raw devtools access (`baselineTracker.*`, `getSystemHealthReport()`).

`PerformanceHealth.js` already imported `systemPerformanceMonitor` privately. The barrel made the singleton reachable without going through the seam.

`TranslationEngine.js` and `OptimizationBenchmarks.js` already imported directly from the concrete files, not the barrel — so they were unaffected.

## Decision

The barrel exports only `performanceHealth`:

```ts
export { performanceHealth } from './PerformanceHealth';
```

`PerformanceHealth` gains two lifecycle methods — `startMonitoring(intervalMs)` and `destroy()` — delegating to `systemPerformanceMonitor`. `App.jsx` now crosses the seam for all operations.

`DevConsole.js` switches to a direct import from `./performance/SystemPerformanceMonitor`. Raw access is correct for a devtools module — `window.systemPerformanceMonitor` assignment is load-bearing for `TranslationEngine.js`'s `typeof systemPerformanceMonitor` alert calls and must not be routed through `performanceHealth`.

## Reason

**One barrel export = one seam.** With two production callers (`App.jsx` and `usePerformanceMonitoring.js`) crossing `performanceHealth`, the seam is real — not hypothetical. All performance bugs now have a single module to investigate first.

**`App.jsx`'s bypass was lifecycle, not raw access.** Adding `startMonitoring` and `destroy` to `performanceHealth` is a natural extension — it already owned the write (`recordTranslation`) and read (`getReport`) sides.

**`DevConsole.js`'s bypass is intentional.** Devtools modules need raw access to internal state (`baselineTracker.baselines/alerts/trends`). Routing that through `performanceHealth` would either bloat `performanceHealth`'s interface with devtools-specific methods or force DevConsole to call `getReport()` repeatedly to extract fields it needs raw. A direct import is the correct pattern for a devtools escape hatch. The import path makes the bypass explicit.

**The startup diagnostic log was misleading.** `App.jsx` logged `integrations.size` (always 4, hardcoded) and `memory.pressure` (always ~0 at startup before any translation runs). These fields were not operational. The simplified log uses `performanceHealth.getReport().status`.

## Consequences

- `globalPerformanceMonitor` and `systemPerformanceMonitor` are no longer reachable via `utils/performance` barrel. New callers must import directly from their concrete files, making the bypass visible at the import site.
- `performanceHealth` owns the full lifecycle of the performance monitoring subsystem from the application's perspective.
- `DevConsole.js` is the documented raw-access consumer of `systemPerformanceMonitor`. Any new devtools use of the singleton should live in `DevConsole.js`, not in application code.
- Future callers wanting system-level metrics for operational use (not devtools) should add a method to `performanceHealth` rather than importing `systemPerformanceMonitor` directly.
