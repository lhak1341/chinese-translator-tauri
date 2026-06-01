# AI Readiness Evaluation: chinese-translator-tauri

## Summary

The binding constraint is **Behavioral Clarity (dimension 5)**: the `translationSource` source-string taxonomy (4 Phase-1 variants, a silent priority-999 fallback) creates the highest probability of a first-attempt AI failure that produces plausible-but-wrong output with no compile-time or runtime signal. Structural dimensions are in good shape — feature folders, rich `.d.ts` types, and solid interface-level tests give AI a reliable foundation — but the untyped `string` boundary at the pipeline's most complex seam undermines it. Feedback loop is fully runnable.

---

## Scores

| Dimension              | Score | Verdict                                               |
| ---------------------- | ----- | ----------------------------------------------------- |
| File System Clarity    | 4/5   | Feature folders clear; barrel coverage uneven         |
| Module Depth           | 3/5   | Core deep, utilities shallow, circular dep            |
| Interface Visibility   | 4/5   | Rich `.d.ts`; JS god-file contracts in CLAUDE.md only |
| Tests at the Interface | 4/5   | Predominantly behavioral; one internal leak           |
| Behavioral Clarity     | 3/5   | **Binding: pattern density (source strings)**         |

**Binding constraint: Behavioral Clarity (dimension 5)** — structural dimensions score 3–4, good enough that the behavioral layer is what actually causes first-attempt failures. Low Behavioral Clarity means AI produces wrong output even after correctly finding the right code.

**Feedback Loop Status:** runnable  
— JS/TS: `pnpm test -- --run` (1199 tests, 53 files)  
— Rust: `cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1` (155 tests)  
Two separate commands, but both documented in CLAUDE.md.

**Doc-code drift:** none found (spot-checked 5 CLAUDE.md rules against code — all verified correct).

---

## Tooling Context

- **`graphify-out/`** present, built from `b4fe3a9f`, current HEAD 1 commit ahead (`284234e` — one pipeline fix). Graph is still usable; AI enters with a pre-computed call graph of 283 files / ~438K words. Does not fix the behavioral-clarity issues; offsets the structural ones.
- **`CLAUDE.md`** present, 108 lines — lean, not bloated. Contains ~15 prescriptive rules. Spot-checked rules match code (source strings, wasm barrel, JS-only files, getSourcePriority contract). These rules compensate for the untyped `translationSource: string` gap — every rule that compensates for a type gap is re-loaded cost per session.
- **`docs/adr/`** — 12 ADRs present (ADR-001 through ADR-012), well-maintained through 2026-05-22. ADR-004 (5-phase order immutability), ADR-006 (pattern processor interface), ADR-009 (WASM lifecycle) reduce behavioral ambiguity substantially.

---

## What AI Sees When It Enters This Codebase

**Navigation** is good. `src/` splits cleanly into `components/` (dual-path: `char-only/` vs `full-translation/`, each with `index.ts`), `hooks/`, `types/` (22 `.d.ts` files), and `utils/` (8 concern-based subdirs, 5 with barrel `index.ts`). A fresh AI agent can locate the right module in under 5 minutes. graphify supplements this with pre-computed community structure.

**Prediction** is where it breaks down. When AI needs to write code that passes a `translationSource` string — creating a token, calling `getSourcePriority`, or adding a new translation phase — it sees `'pattern'`, `'hierarchical_pattern'`, `'hierarchical_patterns'`, and `'hierarchical_patterns_composite'` as four seemingly valid Phase-1 values, all typed `string`. The function accepts any string and returns 999 for the wrong one. No compile error. No runtime error. Corrupted output. The CLAUDE.md documents the contract, but AI doesn't know it needs to read that rule before writing the string literal.

Similarly, `TranslationEngine.js` (10K LOC, 130 graph edges) has functions that return values **and** update shared pipeline token state. AI reading a call to `findAllMatchesWithSemanticCache()` sees only the return type — the shared-state mutation is invisible from the signature.

**Verification** is strong. The test suite is behavior-focused: `WasmProcessorLifecycle` tests check observable state (`isReady`, `hasFailed`), WASM boundary tests check behavior at the JS/WASM seam under malformed input, and `TranslationEngine.sourceStrings.test.js` contracts exactly which strings are valid. Running `pnpm test -- --run` gives a green/red in ~seconds.

---

## Top Problems

### 1. `translationSource: string` — 4 Phase-1 variants, silent priority-999 fallback

**What:** `getSourcePriority()` accepts an untyped `string`. Valid Phase-1 values are `'pattern'` (JS adapter), `'hierarchical_pattern'`, `'hierarchical_patterns'`, `'hierarchical_patterns_composite'` (WASM paths). Any other string silently returns priority 999, corrupting output ordering. The function is defined only inside `TranslationEngine.js` and is not importable — the test file at `src/utils/__tests__/TranslationEngine.sourceStrings.test.js:52` redefines it locally to test it.

**Impact:** Pattern density — AI encounters one variant (e.g., `'pattern'`) and treats it as canonical. Next time it writes code for the WASM path, it uses `'pattern'` instead of `'hierarchical_patterns_composite'`. Output is silently deprioritized. No type error, no test failure for the new code path.

**Example:** `src/utils/__tests__/TranslationEngine.sourceStrings.test.js:88` — `expect(getSourcePriority('patterns')).toBe(999)` — note `'patterns'` vs `'pattern'` is a 1-char typo with a defined test proving it silently fails.

**Predicted failure:** AI writes `translationSource: 'hierarchical_pattern'` for a new composite WASM result (copy-pasting from a single-pattern result). The composite path gets priority 999 instead of 1, so a longer correct match loses to a shorter character-level match. Output looks plausible but is wrong. No error thrown.

---

### 2. `TranslationEngine.js` dual interface: return + shared pipeline state

**What:** `translateSinglePass()`, `findAllMatchesWithSemanticCache()`, and `postProcess()` both return values and update shared `this.*` token state across the 5 phases. CLAUDE.md documents "shared token state across all 5 phases" and "timing-sensitive cache invalidation" as reasons these can't be extracted. But these invariants are not surfaced at call sites — they live in a prose comment in CLAUDE.md.

**Impact:** Side-effect surface — AI reading a call to `findAllMatchesWithSemanticCache()` sees the return value and models the interaction accordingly. It won't account for the shared-state mutation when adding a new call site or reorganizing call order.

**Example:** `src/utils/TranslationEngine.js` — any new call to `translateSinglePass()` by AI in isolation (e.g., in a utility function) will break the cross-phase token contract because shared state won't be correctly initialized.

**Predicted failure:** AI introduces a helper that calls `translateSinglePass()` once for a preview feature, expecting to discard the result. The call mutates shared state, corrupting the next full translation run.

---

### 3. WASM binary staleness is structurally undiscoverable

**What:** Running `pnpm tauri:dev` without first running `pnpm build-wasm-dev` silently runs stale WASM. The dependency is documented in CLAUDE.md but not enforced by the build system (the WASM binary is gitignored, stays stale). This is not a code quality problem but a cold-start failure that wastes AI debug cycles.

**Impact:** Ordering constraint — AI making a change to `wasm-core/` that should fix a bug, running the app, and seeing the old behavior, will assume the bug is elsewhere and make additional wrong changes.

**Predicted failure:** AI modifies a WASM function in `wasm-core/src/`, runs `pnpm tauri:dev` without rebuilding, observes no change, and concludes the Rust function isn't being called — then incorrectly modifies the JS side to compensate.

---

## Behavioral Clarity Detail (Dimension 5)

**Exception/error intent (score: 4 — largely clean)**

- `clearPanelLayoutStorage.ts`: two intentional `catch` blocks, each has an explanatory comment (`// localStorage unavailable`) — clean.
- `UnicodePunctuationDetector.ts`: `catch(_e) { // Category not supported }` — intentional, declared.
- `SegmentPrecomputer.ts:183–186`: `catch(error)` logs via `logger.warn` in dev only — production catch is silent. Isolated to one file, WASM-fallback path. Prevalence: low (score stays 4).
- `translation_wasm.js`: `catch(_)` blocks are wasm-bindgen generated, not hand-written. Not charged.

**Pattern density (score: 3 — mixed, critical-path concentration)**

- Phase-1 source strings: 4 variants for the same semantic operation (apply pattern match), concentrated on the most-touched code path in the codebase. First variant AI sees becomes its session-canonical.
- Async deferral in `TranslationEngine.js`: `setTimeout(fn, 0)`, `requestIdleCallback + setTimeout fallback`, `await new Promise(resolve => setTimeout(resolve, 0))` — three forms, different semantics (cleanup vs yield vs backpressure). Medium risk; concentrated in one file.

**Side-effect surface (score: 3 — concentrated in god file)**

- `TranslationEngine.js`: `translateSinglePass()`, `findAllMatchesWithSemanticCache()` mutate shared token state without surfacing the mutation at signatures or call sites. CLAUDE.md prose is the only declaration. Concentrated in the most-called module.
- Post-refactor hooks (`useDictionaryCRUD`, `useDictionaryHistory`): cleaner — mutations flow through declared deps (`commitMutation`, `addToHistory`). Good precedent.

**Ordering constraints (score: 3 — documented, not enforced)**

- 5-phase pipeline order: immutable, documented in ADR-004. Enforced at runtime via `getSourcePriority()` numeric values, but AI can't know this without reading the ADR or CLAUDE.md.
- WASM binary build step: must precede dev server. Enforced only by CLAUDE.md documentation.
- `loadAppConfig()` vs `window.electronAPI.loadConfiguration()`: caller must use the wrapper — documented in CLAUDE.md, not type-enforced.

**Type-level enforcement (score: 4 — largely clean, one structural gap)**

- Zero `: any` in `src/types/` — all 22 `.d.ts` files use concrete types.
- TypeScript strict mode, 0 errors.
- `translationSource: string | null` in `WasmToken` — uses `string` not a discriminated union. The Phase-1 source string variants are not enumerated in the type. This is the structural root cause of Problem 1. Medium surface: only call sites that assign `translationSource` are affected, but they're in the critical translation path.

---

## Recommended Changes

**[Quick Win, ~2 hr] Extract `translationSource` literal types into a discriminated union**  
Add `type TranslationSource = 'pattern' | 'hierarchical_pattern' | 'hierarchical_patterns' | 'hierarchical_patterns_composite' | 'number_conversion' | 'number_plus_liang_fix' | 'phrases' | 'characters' | ${string & {}}` (or similar) to `TranslationEngineTypes.d.ts`. Update `WasmToken.translationSource` to use it. This makes `getSourcePriority()` type-checkable if it can be pulled into a `.ts` wrapper. Even a partial union + `never` default branch in a switch eliminates the silent-999 class of bug for all typed call sites.  
_Why it helps:_ eliminates pattern-density Problem 1 for all TypeScript call sites; converts silent corruption into a compile error.

**[Quick Win, ~30 min] Make WASM build a pre-check in dev scripts**  
Add a `prebuild-wasm-dev` no-op or `pnpm tauri:dev` wrapper that checks WASM binary freshness (compare mtime of `wasm-core/src/**` vs binary). Fail fast with a clear message if stale.  
_Why it helps:_ ordering constraint Problem 3 becomes a fast error instead of a silent wrong-behavior session.

**[Quick Win, ~1 hr] Promote `SegmentPrecomputer.ts:183` WASM-fallback catch to prod logging**  
Remove the `process.env.NODE_ENV === 'development'` guard or add a production-facing metric counter. Silent WASM fallback in production is indistinguishable from a bug to a reviewing AI.  
_Why it helps:_ exception-intent sub-factor improvement; makes fallback behavior observable in production.

**[Medium effort, ~1 day] Export `getSourcePriority` as a typed utility**  
Currently defined only inside `TranslationEngine.js` and re-defined in the test file. Extract to a small `.ts` file in `utils/` that accepts the `TranslationSource` union type. The test file can then import the real function instead of duplicating it.  
_Why it helps:_ module depth improvement (deletion test: deleting the duplication reveals shared logic); reduces pattern density; enables compile-time checking.

**[Higher effort] Side-effect surface in `TranslationEngine.js`: document at call sites**  
For `translateSinglePass()` and `findAllMatchesWithSemanticCache()`, add a one-line JSDoc `@sideeffects` or `// Mutates: this.tokens, this.cache` at each method header. This is the minimum viable declaration short of refactoring.  
_Why it helps:_ side-effect surface sub-factor improvement; any AI reading the signature now sees the dual interface declared.

**[Structural, multi-session] `utils/` barrel consistency**  
`caching/`, `pattern/`, and `wasm/` lack `index.ts`. `wasm/` is intentional (CLAUDE.md). `caching/` and `pattern/` could gain barrels to match the other 5 subdirs, reducing the number of "where do I import from?" decisions AI needs to make.  
_Why it helps:_ File System Clarity dimension 1 improvement; reduces undisciplined cross-module imports.

**Quick Wins:** items 1 (TranslationSource union), 2 (WASM pre-check), and 3 (SegmentPrecomputer prod logging) above — all under 2 hours combined, directly address the binding constraint and top 3 problems.
