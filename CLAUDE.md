# Chinese-Vietnamese Translation App

React/Tauri desktop app translating Chinese novels to Vietnamese via 5-phase token consumption with WASM acceleration.

📖 **Full Documentation**: [docs/README.md](docs/README.md)

---

## Essential Commands

```bash
cargo check --manifest-path src-tauri/Cargo.toml  # Rust type-check (NOT cd + cargo — zoxide breaks it)
cargo check --manifest-path wasm-core/Cargo.toml   # WASM core is a separate crate — check both when touching Rust
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1  # 94 unit + 40 integration tests
npm run tauri:dev   # Start dev server
npm test -- --run   # Run all tests once (CI)
npm run type-check  # TypeScript (0 errors expected)
```

---

## System Architecture

### 5-Phase Translation Pipeline (IMMUTABLE ORDER)

1. **Pattern** — structural patterns with variables; `translationSource` strings: `'pattern'`, `'hierarchical_pattern'`, `'hierarchical_patterns'`, `'hierarchical_patterns_composite'`
2. **Proper Noun** — novel-specific terms; `translationSource` equals `match.dictionary` (e.g. `'properNouns-MyNovel'`); check membership via `this.activeProperNouns`
3. **Number** — `'number_conversion'` (WASM), `'number_plus_liang_fix'` (post-process fixup)
4. **Phrase** — `'phrases'`
5. **Character** — `'characters'`

`getSourcePriority()` in `translateSinglePass` resolves all of the above to priorities 1–5. Any unrecognized string returns 999 — lower than the character fallback — causing silent translation corruption.

Each phase **consumes** tokens (`translated: null, translationSource: "X_consumed"`); later phases skip consumed tokens. Changing order breaks conflict resolution.

**Consumed token contract (two-directional):** `*_consumed` source → `translated` must be `null`; non-`_consumed` source → `translated` must NOT be `null`. A leader with `translationSource` set and `translated=null` is silently skipped by `postProcess()` — those characters vanish from output with no warning. Both directions are validated by `validateConsumedTokenContract()`.

📖 [Architecture guide](docs/guides/architecture.md#5-phase-translation-pipeline)

### Dual-Path Architecture (debug the right path)

- **Character-only mode**: `ClickableTranslationSemantic.tsx` → `SegmentPrecomputer.js`
- **Full Translation mode**: `ClickableTranslationOptimized.tsx` → `TranslationEngine.js`

These are completely separate code paths. Semantic array positions are stored during `postProcess()` assembly.

📖 [Architecture guide](docs/guides/architecture.md)

---

## Critical Constraints

### DO NOT Extract These (Architectural Coupling Required)

- **`TranslationEngine.js:translateSinglePass()`** — shared token state requires synchronous coordination across all 5 phases; extracting phases eliminates conflict resolution.
- **`TranslationEngine.js:findAllMatchesWithSemanticCache()`** — cache invalidation is timing-sensitive; separating lookups causes phase priority violations.
- **`TranslationEngine.js:postProcess()`** — position precision depends on exact post-processing assembly order.

📖 [Why extraction fails](docs/archive/refactoring-2026/EXTRACTION_ANALYSIS.md)

### DO NOT Modify Dictionaries Without Permission

Production: `~/Library/Application Support/com.lhak.chinese-translator/dictionaries/`
Source templates: `src/dictionaries/` · Proper noun dicts: `properNouns-{NovelName}.json`

### Large Files Are Intentional

- `TranslationEngine.js`: 5-phase coordination, WASM sync, memory management
- `Translator.jsx`: cross-mode state management, configuration timing

**Can extract**: pure functions → `src/utils/`; single-concern React hooks → `src/hooks/`
**Cannot extract**: anything using `this.*`, `setState`, refs, or requiring 10+ parameters

**Intentionally JavaScript (never migrate to TypeScript)**: `TranslationEngine.js`, `Translator.jsx`, `SemanticPatternProcessor.js`

📖 [Extraction guidelines](docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md)

---

## Development Guidelines

### Refactoring Red Flags

- 10+ parameters — coordination logic, keep in place
- Multiple state setters — coordination logic
- `this.*`, `setState`, refs — state dependency, can't extract
- Functions prefixed `_` — likely dead code, verify with grep before removing

### Environment Gotcha

`grep` is aliased to `rg` — multiple flags behave differently (`-E` sets encoding, not extended-regex; `grep -rl` gives unreliable counts). Always use the **Grep tool** for code search or import counting.

### Testing

`src/test/setup.ts` **must stay** — referenced by `vitest.config.ts:10`. The duplicate test files in `src/test/` were removed (stale); `setup.ts` was not.

📖 [Full gotchas reference](docs/guides/development.md#gotchas-reference) — see also subdirectory `CLAUDE.md` files for scoped gotchas.

### Deleted Symbols — Do Not Recreate

- `DictionaryTable.tsx`/`VirtualizedDictionaryTable.tsx` → use `EnhancedVirtualizedDictionaryTable`
- `LegacySystemFlags.js` and its exports (`getLegacySystemStatus`, `checkRollbackTriggers`, `initializePerformanceBaselines`, `updatePerformanceBaselines`) — permanently removed
- `createReadonlyTokens` from `ReadonlyOptimizationUtils.js` — only `scanTokens` exported
- `OptimizedSemanticArrayBuilder.getCachedRegex` / `regexCache` / `maxCacheSize` — `updateWithCapitalizedText` now uses fast-path + `indexOf`
- `V8OptimizationUtils.js` moved to `src/utils/__benchmarks__/` (was `src/utils/`)

---

## Key Files

| Purpose               | File                                       | Note                                                                       |
| --------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Translation Core      | `src/utils/TranslationEngine.js`           | 5-phase coordination                                                       |
| UI Coordination       | `src/components/Translator.jsx`            | Cross-mode synchronization                                                 |
| Shared TS types       | `src/types/DictionaryTypes.ts`             | Canonical dict/entry/metadata types                                        |
| Shared dict utils     | `src/utils/dictionaryHelpers.ts`           | `sortDictionaryEntries`, labels, ordering                                  |
| WASM boundary (prod)  | `src/utils/wasm/WasmBoundaryValidation.ts` | `copyWasmTokens`: param1=JS dest, param2=WASM src                          |
| WASM boundary (tests) | `types/WasmTypes.ts` (root-level)          | `copyWasmTokens`: param1=WASM src, param2=JS dest — **reversed from prod** |
| Shared UI types       | `src/types/UITypes.d.ts`                   | `ThrottledStreamingState` canonical home                                   |
| Keyboard shortcuts    | `src/hooks/useHotkeyHandler.ts`            | Logic lives here; `HotkeyHandler.tsx` is a thin wrapper                    |

---

## Documentation

- [Architecture Guide](docs/guides/architecture.md) — system design, WASM, semantic arrays
- [Development Guide](docs/guides/development.md) — guidelines, gotchas reference, commands
- [Troubleshooting Guide](docs/guides/troubleshooting.md) — debugging and fixes
- [Performance Guide](docs/guides/performance.md) — optimization and profiling
- [ADRs](docs/adr/) · [Archive](docs/archive/)
- [GUI Framework Evaluation](docs/GUI_FRAMEWORK_EVALUATION_2026.md) — verdict: stay on Tauri
- [WASM Migration Code Review](docs/WASM_MIGRATION_CODE_REVIEW_2026.md) — pure computation candidates
