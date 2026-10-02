# Development Guide

Logging conventions, debugging tools, testing conventions, CI/CD, and production build requirements.

---

## Logging

Use the `logger` utility instead of `console.*` — it's a no-op in production (avoids overhead and exposing internals), except `logger.warn`/`logger.error` which always show.

```typescript
import { logger } from './utils/logger';
logger.log('Translation started:', text); // dev only
logger.warn('Dictionary not found:', dictId); // always
```

Scoped logging for component-specific logs: `createScopedLogger('TranslationEngine')` returns a logger that prefixes messages with the component name.

An ESLint rule warns on new `console.*` usage (see `eslint.config.js`).

---

## Development Debugging Tools

**Every `window.*` debugging API must be wrapped in a dev-only guard** — `if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development')`. Exposing internal engine/dictionary state in production enables reverse engineering and leaks internals; this is the one rule in this section that's actually load-bearing, not just a catalog of current APIs (those rot — grep `window\.` assignments in `src/` for the current list rather than trusting a hardcoded one here).

Two real examples of the pattern, current as of this writing: `window.translationEngine` (engine state; `dictionaryManager.getWasmStatus()` is a documented public-API-contract method, asserted by `DictionaryManager.apiContract.test.js` — don't delete it as dead code on a plain caller-count grep) and `window.checkRealMemory()` (heap usage %).

---

## Testing Infrastructure

**Test runner**: Vitest + React Testing Library. Config: `vitest.config.ts`, `src/test/setup.ts` (the `@tauri-apps` modules are auto-mocked here). `window.electronAPI` is a plain global that tests stub per file: `installFakeConfigDisk()` (`src/test/fakeConfigDisk.ts`) for config, a hand-built object elsewhere (ADR-014).

**API contract testing**: critical methods that must stay synchronous (e.g. `translate()`) are pinned with `expect(result).not.toBeInstanceOf(Promise)` — see `DictionaryManager.apiContract.test.js`. Add a case here before changing a hot-path method's sync/async shape.

`bun run test` runs in watch mode; `bun run test --run` runs once (used by CI and pre-commit). See root `CLAUDE.md` for the "silent when piped" gotcha.

---

## CI/CD Pipeline

**GitHub Actions**: `.github/workflows/ci.yml`

**Automated checks** (runs on push and PR):

1. wasm-core Rust tests (`cargo test --manifest-path wasm-core/Cargo.toml`) — added 2026-08-25; previously wasm-core had zero CI coverage despite 35+ passing local tests
2. src-tauri Rust tests (`cargo test --manifest-path src-tauri/Cargo.toml`) — added 2026-08-31; the suite had zero CI coverage while two of its reset tests failed deterministically on every local run
3. Bench compilation (`cargo check --benches`, both crates) — added 2026-08-31; `cargo test` never compiles benches, so they bit-rotted silently between manual runs
4. WASM dev build (`bun run build-wasm-dev`, via wasm-pack) — needed before the JS test suite can run
5. Type checking (`bun run type-check`)
6. Linting (`bun run lint`) — a real gate since 2026-08-31; before that it ran `eslint . --quiet` against a warn-only rule set and could not fail
7. Tests (`bun run test --run`) — rebuilds stale WASM first via `scripts/ensure-wasm-fresh.mjs`

**Pragmatic CI philosophy**: CI catches development errors (types, lint, wasm-core tests, JS tests). Full production app builds (`bun run tauri:build`) are verified locally before releases, not in CI — build works locally, that's what matters for releases.

**Pre-commit hooks** (Husky + lint-staged, installed via `bun install`'s `prepare` script): Prettier auto-format, ESLint auto-fix, and TypeScript type-check on staged files.

---

## Production Build Requirements

See [CSP_SECURITY.md](../CSP_SECURITY.md) for the full CSP directive rationale (`'wasm-unsafe-eval'`) and its mitigations — this section covers only what that doc doesn't.

**Vite WASM plugin order matters**: `wasm()` and `topLevelAwait()` must come before the React plugin in `vite.config.ts`'s `plugins` array — WASM modules need to be processed before React transformation runs.

**WASM asset filenames must not be content-hashed** — wasm-pack's generated glue code imports the `.wasm` file by its literal name; Vite's default content-hashing breaks that import. `rollupOptions.output.assetFileNames` needs an explicit `.wasm` exception (`assets/[name][extname]`, no hash).

**Test production builds before releasing**: `bun run tauri:build`, then open the built `.app` and manually check WASM number processing, dictionary loading, and translation quality — this is not covered by CI (see CI/CD Pipeline above).

---

## Gotchas Reference

Moved to [gotchas.md](gotchas.md) — environment and tooling traps, JavaScript/TypeScript, types and imports, Rust/WASM, testing, and CSS.

---

## Fallow Dead-Code Analysis

Fallow reports are a starting point, not a deletion list. Four blind spots:

1. **Class dead ≠ file dead.** Fallow tracks `export class Foo` and `export const foo = new Foo()` separately. If only the class is listed dead, the singleton may still have callers — check both before touching the file.

2. **CSS `composes` is invisible.** `composes: X from './shared.module.css'` is a hard dependency fallow never sees. Before deleting any `.module.css`, grep: `composes.*from.*'./filename'` across all CSS files.

3. **Dynamic `import()` calls not tracked.** `import("./SomeFile.js")` lazy imports are invisible to fallow. Before deleting, grep: `import(.*filename` across `src/`.

4. **Test imports count.** Fallow may flag exports used only in `__tests__/` files as dead. Check test files before removing.

4b. **A test-only caller isn't automatically "delete it."** If the test unit-tests real, substantial edge-case logic that only works via direct import, keep the export — a real test surface justifies an interface with zero cross-module callers. Reserve unexport/delete for trivial constants or logic the surviving public function already covers indirectly. (2026-08-08: kept `VocabularyWarmup.js`'s `extractHighFrequencyVocabulary`/`generateCharacterCombinations` exported for this reason; unexported `CharacterOnlyBridge`/`PerformanceMonitor`'s trivial constants safely since their tests lost nothing hardcoding literals instead.)

5. **Partial-dead ≠ file-dead.** A file with some dead exports is NOT a dead file. Verify every export has zero callers before deleting the file.

6. **JSDoc `@import {...} from '...'` and inline `@type {import('...').X}` are invisible to `analyze`/`trace_export`.** This codebase types many `.js` files via JSDoc, not real ES imports — a `.d.ts` file consumed only this way shows `file_reachable: false` even when genuinely alive. Grep for `@import\s*{` and `import\(['"].*['"]\)\.` referencing a file before trusting fallow's verdict on it.

7. **`analyze` with a `file:` filter suppresses `unused_files`** (dependency-level checks are disabled in file-scoped mode — the tool's own docs say so, easy to miss). Re-run without `file:` for a real answer.

8. **`fix_apply`/`fix_preview` have no file/name scoping and only cover `unused-exports`, not `unused-types`.** Confirmed false positives: wanted to strip exports from a barrel that real code imports, and delete npm deps wired through Rust, not JS. Not usable for a scoped cleanup — verify every proposed fix manually, or don't use it for `.d.ts`/type pruning at all.

9. **`find_dupes` (structural/`weak` mode) misses small-scale near-duplicates.** Tested against a deliberate ~15-line near-copy of a React component — 0 hits at `top: 200`. Its clone detector needs larger duplicated blocks to fire; don't trust it for component/JSX-level drift detection. Keep `top` modest — very large values (200+) can disconnect the MCP server outright. Full account: `src/components/dictionary/CLAUDE.md`'s "mechanized gate ... investigated and rejected" note.

**Protocol per file:**

- Grep each export (not just fallow-listed ones): `grep -r "ExportName" src/` — confirm zero results outside the definition.
- Grep dynamic imports: `grep -r "import(.*filename" src/`
- For `.module.css`: grep `composes.*from.*'./filename'` in all CSS files.

**Verification after each batch:**

```bash
bun run type-check && bun run test --run  # add --reporter=verbose if backgrounding — default reporter is silent when piped, and a full run legitimately slows down deep in; that's not a hang
bun run tauri:dev  # catches dynamic import() breakage — type-check/tests miss it
```

---

## Related Guides

- [Architecture Guide](./architecture.md) - Execution paths, semantic arrays, token contracts
- [Performance Guide](./performance.md) - Performance monitoring and optimization
- [Deleted Symbols](./deleted-symbols.md) - What's already been removed, and why
- [Troubleshooting Guide](./troubleshooting.md) - Debugging steps and resolved bug postmortems
