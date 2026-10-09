# Chinese-Vietnamese Translation App

React/Tauri desktop app translating Chinese novels to Vietnamese via 5-phase token consumption with WASM acceleration.

---

## Essential Commands

```bash
cargo check --manifest-path src-tauri/Cargo.toml  # NOT cd + cargo — zoxide breaks it
cargo check --manifest-path wasm-core/Cargo.toml   # separate crate — check both when touching Rust
cargo test --manifest-path wasm-core/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
bun run tauri:dev  # opens a native WebView window, not a browser tab — claude-in-chrome tools can't attach to it; ask the user to check visually, or verify via bun run test/type-check instead
bun run test --run  # rebuilds stale WASM first; default reporter prints ~nothing when backgrounded/piped — silence ≠ hung; check `ps` CPU or add --reporter=verbose before assuming a stall. vitest 4 has no `basic` reporter: `--reporter=basic` dies with ERR_LOAD_URL, which reads as a broken vite config, not a bad flag. `bunx vitest --run <path>` for single-file iteration bypasses the freshness gate (it lives in the npm script, not vitest) — fast, but re-run the full command before trusting any result that depends on Rust
bun run type-check  # 0 errors expected; excludes **/*.test.ts(x) — a test file's own type errors surface only at test-run time, not here
bun run lint  # enforced warning ceiling (.lint-baseline.json); `bun run lint:full` for the findings. Exits 1 both directions — *below* baseline fails too, with a "nice." message that reads like success; `bun run lint:baseline` locks the lower count in and is required to go green. The pre-commit hook runs `bun run lint:ratchet-down` when a JS/TS file is staged: it lowers the baseline itself and stages `.lint-baseline.json`, so only an increase blocks a commit and CI still fails on a drop
```

`git commit` runs the pre-commit hook (prettier, eslint, a full `tsc --noEmit`) and has taken over 300 s; a chained test + lint + commit run went past 600 s. Run long chains with `run_in_background`, then check `git log` rather than trusting the exit code.

`bun run deploy` runs `sweep-targets` after build (prunes `src-tauri/target` and `wasm-core/target` artifacts older than 7 days via `cargo sweep`, keeps disk usage sane under weekly deploys). Requires `cargo install cargo-sweep` on the machine first — not a repo dependency, so a fresh clone/machine needs it installed manually or `sweep-targets` fails with "command not found".

## Standard commands (same names in all my Tauri apps)

`bun run tauri:dev` native app with hot reload · `bun run tauri:build` release bundle · `bun run deploy` build, quit the running copy, install into `~/Applications`, then `sweep-targets` (needs `cargo install cargo-sweep`) · `bun run check` type-check · `bun run test` · `bun run lint` (warning ceiling in `.lint-baseline.json`; `lint:full` shows findings, `lint:baseline` locks a lower count) · `bun run format` / `format:check`. Dev ports: translator 5174, fanfiction-reader 1420, family-ledger 1430. Husky `pre-commit` runs lint-staged and ratchets the lint baseline down; CI runs check, lint, format:check, test and `cargo test`. `scripts/install-app.sh` is identical in all three — it reads the app name from `tauri.conf.json`.

---

## Architecture

**5-Phase Pipeline (order is immutable):** Pattern → Proper Noun → Number → Phrase → Character. Each phase's `translationSource` string is the discriminator (`getSourcePriority()` returns 999 for any unrecognized string — silently corrupts output; literal `addUnit()` sources are guarded by `TranslationEngine.addUnitCallSites.test.js`, runtime-computed ones are not). **Consumed token contract:** `*_consumed` → `translated` must be `null`; non-`*_consumed` → `translated` must NOT be `null`. Validated by `validateConsumedTokenContract()`.

**Dual-Path Architecture:** Character-only and Full-Translation are completely separate rendering/highlighting pipelines with separate entry points (`src/components/char-only/` vs `src/components/full-translation/`). Debug the right one — see `CONTEXT.md` for which module belongs to which.

---

## Critical Constraints

**DO NOT extract** from `TranslationEngine.js`: `translateSinglePass()` (shared token state across all 5 phases), `findAllMatchesWithSemanticCache()` (timing-sensitive cache invalidation), `postProcess()` (position precision requires exact assembly order). **Ruled out for mechanization 2026-08-31**: a hook blocking edits to these would enforce the letter, block a legitimate future refactor, and teach none of the three reasons above — which are the actual content. Stays prose deliberately.

**DO NOT modify dictionaries** without permission. Production: `~/Library/Application Support/com.lhak.chinese-translator/dictionaries/`. When permission is given for a bulk edit: back up the target files to the scratchpad dir first; confirm real formatting (indent width, literal-UTF-8 vs `\u` escapes via `grep -c '\\u'`, trailing-newline via `tail -c`) before `JSON.parse`→mutate→`JSON.stringify(obj,null,2)`, so the rewrite is a surgical diff. Orphaned `*.trie.json` files (the persisted trie cache was deleted, ADR-075) are safe to delete by hand. When bulk-matching entries by key-string suffix/prefix, also verify the matched entries' **field shape** (`allowedVariableTypes`/`semanticType`) matches the expected category before mutating — a string match alone can catch unrelated entries.

**Bash tool sandbox virtualizes writes outside the repo dir** (e.g. `~/Library/Application Support/...`) — a write can appear to succeed and read back correctly in the same session while the real on-disk file is untouched. Any write to a path outside the repo (dictionaries, `transform-rules.json`, `config.json`, `appearance.json`) needs `dangerouslyDisableSandbox: true` on the Bash call, both for the write AND the verifying read. Separately: after any direct edit to a file the running app owns, the app must be **fully quit and relaunched** (not just window-closed) before trusting the edit — a live process's own next save silently overwrites it with stale in-memory state.

**Large files are intentional.** `TranslationEngine.js` and `Translator.jsx` coordinate state that can't be extracted. Can extract: pure functions → `src/utils/`; single-concern hooks → `src/hooks/`. Cannot extract: anything using `this.*`, `setState`, refs, or requiring 10+ parameters. **Intentionally JavaScript (never TypeScript):** `TranslationEngine.js`, `Translator.jsx`, `SemanticPatternProcessor.js`.

---

## Where Everything Else Lives

This file stays short on purpose — everything task-scoped moved to where it's discoverable when you actually need it:

- **Tooling/environment gotchas** (repo-wide search and ad-hoc scripts importing `src/` — read before either; RTK proxy output is lossy, Edit tool silent-failure modes, test placement, regex Unicode traps, Rust command guards) → [`docs/guides/gotchas.md`](docs/guides/gotchas.md).
- **Deleted-symbols history** — what's already been removed; check before recreating anything that looks missing, and before deleting a method with no production callers (dev-console commands and contract tests look dead on grep, e.g. `getWasmStatus`) → [`docs/guides/deleted-symbols.md`](docs/guides/deleted-symbols.md).
- **Debugging steps, resolved bug postmortems, and the "verify claims before acting" discipline** (Explore subagents and architecture-review reports both fabricate/overstate specifics — always re-verify with `Grep`/`Read` before deleting or citing) → [`docs/guides/troubleshooting.md`](docs/guides/troubleshooting.md).
- **`TranslationEngine.js`/`src/utils/` internal contracts** (phase ordering, position tracking, WASM lifecycle) → `src/utils/CLAUDE.md`.
- **`Translator.jsx`/hooks/component contracts** (engine lifecycle, hotkeys, highlighting state) → `src/components/CLAUDE.md` (and nested `src/components/*/CLAUDE.md` for dictionary/rules).
- **Domain glossary** (what a module is, in this codebase's own vocabulary) → `CONTEXT.md`.
- **Architectural decisions** → `docs/adr/` — each new ADR also gets a row in `docs/adr/README.md`'s index table (keep every cell within the existing column widths, or Prettier re-aligns the whole table) **and** its id on the dated line at the bottom (the table sat stale at ADR-006 until 2026-09-26); a supersession also edits the old ADR's `Status:` line **and** its README status cell (two copies).

📖 [Architecture](docs/guides/architecture.md) · [Development](docs/guides/development.md) · [Troubleshooting](docs/guides/troubleshooting.md) · [Hotkeys](docs/HOTKEYS.md) · [ADRs](docs/adr/) · [CSP Security](docs/CSP_SECURITY.md)

## graphify

This project has a graphify knowledge graph at graphify-out/.

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost). If it refuses with "fewer nodes," that's a safety guard — run `graphify update . --force`.
- `graphify update .` reporting success is NOT proof the graph is current — a known local-detect.py scoping bug (patched 2026-08-12) can silently exclude most of the repo from a scan. After a session that added new files, spot-check with `grep -c "<new-file-name>" graphify-out/graph.json` before trusting the update — pick a non-test module or exported function; test files and callbacks defined inside hooks or components are never nodes, so they read 0 on a healthy graph. If it starts silently finding 0 files again (esp. after `uv tool upgrade`), check whether the patch survived. The reverse also holds: a deleted file's nodes stay in `graph.json` after `update` (19 entries for a deleted script, 2026-10-04), so a grep hit proves nothing about a file that is gone — check the filesystem.
- `graphify-out/graph.json` is gitignored and NOT safely reconstructible from `manifest.json` alone if deleted — never delete it as a troubleshooting step without a copy first.
- A high god-node edge count can be text co-occurrence noise (doc/ADR titles mentioning the name), not import coupling — cross-check `graphify-out/GRAPH_REPORT.md`'s "Surprising Connections" and community cohesion before trusting it as a real signal (confirmed 2026-09-08: `Logger`'s 105 edges were noise; `logger.ts` itself is a clean, deep module).
