# Chinese-Vietnamese Translation App

React/Tauri desktop app translating Chinese novels to Vietnamese via 5-phase token consumption with WASM acceleration.

---

## Essential Commands

```bash
cargo check --manifest-path src-tauri/Cargo.toml  # NOT cd + cargo — zoxide breaks it
cargo check --manifest-path wasm-core/Cargo.toml   # separate crate — check both when touching Rust
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1
npm run tauri:dev
npm test -- --run
npm run type-check  # 0 errors expected
```

---

## Architecture

### 5-Phase Pipeline (order is immutable)

1. **Pattern** — `translationSource`: `'pattern'`, `'hierarchical_pattern'`, `'hierarchical_patterns'`, `'hierarchical_patterns_composite'`
2. **Proper Noun** — `translationSource` equals `match.dictionary` (e.g. `'properNouns-MyNovel'`)
3. **Number** — `'number_conversion'` (WASM), `'number_plus_liang_fix'` (fixup)
4. **Phrase** — `'phrases'`
5. **Character** — `'characters'`

`getSourcePriority()` returns 999 for any unrecognized string — silently corrupts output.

**Consumed token contract:** `*_consumed` → `translated` must be `null`; non-`*_consumed` → `translated` must NOT be `null`. Validated by `validateConsumedTokenContract()`.

### Dual-Path Architecture

- **Character-only**: `src/components/char-only/ClickableTranslationSemantic.tsx` + `ClickableOriginalSemantic.tsx` → `SegmentPrecomputer.ts`
- **Full Translation**: `src/components/full-translation/ClickableTranslationOptimized.tsx` → `TranslationEngine.js`

Completely separate code paths. Debug the right one. Both subdirectories have an `index.ts` entry point.

---

## Critical Constraints

**DO NOT extract** from `TranslationEngine.js`:

- `translateSinglePass()` — shared token state across all 5 phases
- `findAllMatchesWithSemanticCache()` — timing-sensitive cache invalidation
- `postProcess()` — position precision requires exact assembly order

**DO NOT modify dictionaries** without permission. Production: `~/Library/Application Support/com.lhak.chinese-translator/dictionaries/`

**Large files are intentional.** `TranslationEngine.js` and `Translator.jsx` coordinate state that can't be extracted. Can extract: pure functions → `src/utils/`; single-concern hooks → `src/hooks/`. Cannot extract: anything using `this.*`, `setState`, refs, or requiring 10+ parameters.

**Intentionally JavaScript (never TypeScript):** `TranslationEngine.js`, `Translator.jsx`, `SemanticPatternProcessor.js`

`src/utils/` has 7 concern-based subdirectories, each with `index.ts`: `wasm/` · `dictionary/` · `text/` · `pattern/` · `highlighting/` · `performance/` · `caching/`

---

## Development

**Environment:** `grep` is aliased to `rg` — flags behave differently. Always use the Grep tool.

**Dynamic JSON imports:** Never use `import(path, { assert: { type: 'json' } })` — Rolldown silently fails to rewrite the path in production. Use a static `import data from '...json'` at the top of the file.

**Testing:** `src/test/setup.ts` must stay — referenced by `vitest.config.ts:10`.

**Deleted symbols — do not recreate:**

- `DictionaryTable.tsx` / `VirtualizedDictionaryTable.tsx` → use `EnhancedVirtualizedDictionaryTable`
- `LegacySystemFlags.js` and all its exports — permanently removed
- `createReadonlyTokens` from `ReadonlyOptimizationUtils.js` — only `scanTokens` exported
- `OptimizedSemanticArrayBuilder.getCachedRegex` / `regexCache` / `maxCacheSize` — removed
- `V8OptimizationUtils.js`, `PatternParityTest.js` — in `src/utils/__benchmarks__/` (dev/debug only)

**Non-obvious contracts:**

- `src/utils/wasm/WasmBoundaryValidation.ts` — `copyWasmTokens`: param1=JS dest, param2=WASM src
- `types/WasmTypes.ts` (root-level, tests only) — `copyWasmTokens`: param1=WASM src, param2=JS dest (**reversed**)
- `ThrottledStreamingState` canonical home: `src/types/UITypes.d.ts`

📖 [Architecture](docs/guides/architecture.md) · [Development](docs/guides/development.md) · [Troubleshooting](docs/guides/troubleshooting.md) · [ADRs](docs/adr/)
