# Domain Glossary

## AppConfig

The single module owning the app configuration lifecycle: load from disk, validate, cache, and save via read-modify-write. Entry point: `src/utils/appConfig.ts`. Exposes three typed sub-objects:

- **EngineConfig** — fields that affect translation behavior (`wasmEnabled`, `wasmMemoryLimit`, `activeProperNouns`)
- **UIConfig** — fields that affect UX only, zero translation impact (`defaultQuickAddDictionary`)
- **SessionConfig** — runtime-mutable UI persistence (`lastSelectedDictionary`)

All three are slices of the same on-disk JSON file. `loadAppConfig()` loads once and caches; `saveAppConfig(patch)` merges the patch via read-modify-write so callers only provide the fields they own.

## WasmProcessorLifecycle

The shared initialization contract for WASM processors. Owns the invariant sequence every WASM processor must run before its instance is usable: binary fetch → SHA-256 integrity verification → `instantiateFn(binary)` → instance method verification. Wraps the sequence in exponential-backoff retry (transient errors only) and tracks initialization state (`isReady`, `hasFailed`, cooldown, failure count).

Each WASM processor (Pattern, Number, Dictionary) holds one `WasmProcessorLifecycle` instance. The processor module provides `instantiateFn`: a function that receives the verified binary and returns the configured WASM instance. Domain-specific setup (e.g., loading pattern dictionaries into the WASM instance) happens inside `instantiateFn` before it returns. Runtime error handling (toasts, fallback mode) stays in the processor module — the lifecycle only owns the init lifecycle.

Entry point: `src/utils/wasm/WasmProcessorLifecycle.js`.

## PerformanceHealth

Read-only facade that answers "is the system healthy right now?" in one call. Combines `globalPerformanceMonitor` (timing metrics) and `systemPerformanceMonitor` (baseline regression tracking) so callers don't need to know which singleton owns which concern.

`getReport(cacheHitRate)` returns `{ operations, avgTime, cacheHitRate, status, criticalAlerts, warningAlerts, baselines, verdict, wasm }`. `verdict` synthesizes `status` into three values: `'ok'` (healthy), `'degraded'` (warning), `'critical'`. `wasm` aggregates WASM processor availability: `{ pattern: { available, failed }, number: { available }, anyFailed, allAvailable }` — the single place to ask "is WASM the cause of degraded performance?" without importing from individual processor modules. Health is assessed at action time — after translate or after reload — not on a polling interval.

Entry point: `src/utils/performance/PerformanceHealth.js`, re-exported from `src/utils/performance/index.ts`.

## PatternVariableCache

The shared dictionary lookup algorithm consumed by both PatternProcessor adapters. Builds a `word → {translation, source, type}` map from dictionary state; both `SemanticPatternProcessor` (JS) and `TwoPhasePatternProcessor` (WASM) pass this map to their respective matchers before executing.

Four lookup stages run in fixed order, each able to overwrite earlier entries: (1) already-translated proper noun tokens, (2) phrase entries with `allowAsPatternVariable`, (3) proper noun single-token dictionary lookups, (4) full-text scan for multi-character proper nouns. Adapters supply a `resolveType(source, word, metadata) → string|null` strategy: returning `null` force-includes an entry bypassing `allowedVariableTypes` filtering; returning a type string applies normal type-filter logic. Adapter-specific setup that runs before the shared stages: Semantic injects Phase A results as lowest-priority seed entries; TwoPhase injects prior-pass pattern-translated tokens (`patternSemanticType`) as seed entries.

Entry point: `src/utils/pattern/PatternVariableCache.js`.
