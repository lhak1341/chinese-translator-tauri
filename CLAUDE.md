# Chinese-Vietnamese Translation App

React/Tauri desktop app translating Chinese novels to Vietnamese via 5-phase token consumption with WASM acceleration.

---

## Essential Commands

```bash
cargo check --manifest-path src-tauri/Cargo.toml  # NOT cd + cargo — zoxide breaks it
cargo check --manifest-path wasm-core/Cargo.toml   # separate crate — check both when touching Rust
cargo test --manifest-path wasm-core/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
bun run lint:rust  # clippy over every target of both crates, warnings denied (CI); cargo does not track clippy.toml, so touch a .rs file after editing it or the cached pass stands
bun run test --run  # rebuilds stale WASM first; default reporter prints ~nothing when backgrounded/piped — silence ≠ hung; check `ps` CPU or add --reporter=verbose before assuming a stall. vitest 4 has no `basic` reporter: `--reporter=basic` dies with ERR_LOAD_URL, which reads as a broken vite config, not a bad flag. `bunx vitest --run <path>` for single-file iteration bypasses the freshness gate (it lives in the npm script, not vitest) — fast, but re-run the full command before trusting any result that depends on Rust
bun run type-check  # 0 errors expected; excludes test files and checks no JavaScript (checkJs: false)
bun run lint:docs  # markdown allowlist, and every backticked name and path in a live doc must exist (ADRs and deleted-symbols.md exempt); a span with spaces or operators (`x.y = false`) and a `file.rs:fn()` form are not checked, so those go stale unseen
bun run type-check:ratchet  # tests and JavaScript, engine included (tsconfig.test.json); any new error fails, counts in .type-ratchet-baseline.json only fall
```

The full test run, `bun run lint` (the ratchet, over 300 s) and `git commit` (pre-commit hook: prettier, eslint, a full `tsc --noEmit`, over 300 s) each load every core: run them one at a time with `run_in_background`, never side by side. In parallel, untouched engine tests fail on load (`Failed to start forks worker`, 30 s hook timeouts; 2026-11-14) and pass when rerun alone. After a commit, check `git log` rather than trusting the exit code.

Tauri-wide conventions (standard scripts, lint ratchet, deploy, WebView limits, app-data and sandbox rules): `tauri-app-dev` skill.

---

## Architecture

**5-Phase Pipeline (order is immutable):** Pattern → Proper Noun → Number → Phrase → Character. Each phase's `translationSource` string is the discriminator (`getSourcePriority()` returns 999 for any unrecognized string — silently corrupts output). `addUnit`/`placeSpan`/`placeGroupedSpan` take a `TranslationLeaderSource`, so a wrong literal fails `type-check` (TS) or `type-check:ratchet` (JS); a source read off an untyped JS object is `any`, and only the runtime log in `TokenClaim.ts` sees it. **Consumed token contract:** `*_consumed` → `translated` must be `null`; non-`*_consumed` → `translated` must NOT be `null`. Validated by `validateConsumedTokenContract()`.

**Dual-Path Architecture:** Character-only and Full-Translation are completely separate rendering/highlighting pipelines with separate entry points (`src/components/char-only/` vs `src/components/full-translation/`). Debug the right one — see `GLOSSARY.md` for which module belongs to which.

---

## Critical Constraints

**DO NOT extract** from `TranslationEngine.js`: `translateSinglePass()` (shared token state across all 5 phases), `postProcess()` (position precision requires exact assembly order). **Ruled out for mechanization 2026-08-31**: a hook blocking edits to these would enforce the letter, block a legitimate future refactor, and teach neither reason above — which are the actual content. Stays prose deliberately.

**DO NOT modify dictionaries** without permission. Production: `~/Library/Application Support/com.lhak.chinese-translator/dictionaries/`. When permission is given for a bulk edit: back up the target files to the scratchpad dir first; confirm real formatting (indent width, literal-UTF-8 vs `\u` escapes via `grep -c '\\u'`, trailing-newline via `tail -c`) before `JSON.parse`→mutate→`JSON.stringify(obj,null,2)`, so the rewrite is a surgical diff. Orphaned `*.trie.json` files (the persisted trie cache was deleted, ADR-075) are safe to delete by hand. When bulk-matching entries by key-string suffix/prefix, also verify the matched entries' **field shape** (`allowedVariableTypes`/`semanticType`) matches the expected category before mutating — a string match alone can catch unrelated entries.

**App-owned files** in `~/Library/Application Support/com.lhak.chinese-translator/`: dictionaries, `transform-rules.json`, `config.json`, `appearance.json`. Editing any of them follows the `tauri-app-dev` app-data rules (unsandboxed write and read, full quit and relaunch).

**Large files are intentional.** `TranslationEngine.js` and `Translator.jsx` coordinate state that can't be extracted. Can extract: pure functions → `src/utils/`; single-concern hooks → `src/hooks/`. Cannot extract: anything using `this.*`, `setState`, refs, or requiring 10+ parameters. **Intentionally JavaScript (never TypeScript):** `TranslationEngine.js`, `Translator.jsx`. `PatternStore.js` is not bound by this rule.

---

## Where Everything Else Lives

This file stays short on purpose — everything task-scoped moved to where it's discoverable when you actually need it:

- **Tooling/environment gotchas** (repo-wide search and ad-hoc scripts importing `src/` — read before either; Edit tool silent-failure modes, test placement, regex Unicode traps, Rust command guards) → [`docs/guides/gotchas.md`](docs/guides/gotchas.md).
- **Deleted-symbols history** — what's already been removed; check before recreating anything that looks missing, and before deleting a method with no production callers (dev-console commands and contract tests look dead on grep, e.g. `getMemoryUsage`) → [`docs/guides/deleted-symbols.md`](docs/guides/deleted-symbols.md).
- **Debugging steps, resolved bug postmortems, and the "verify claims before acting" discipline** (Explore subagents and architecture-review reports both fabricate/overstate specifics — always re-verify with `Grep`/`Read` before deleting or citing, and before presenting a candidate run the prior-decision greps in troubleshooting.md: rounds 23, 28 and 30 shipped candidates an ADR addendum or scoped `CLAUDE.md` had already declined) → [`docs/guides/troubleshooting.md`](docs/guides/troubleshooting.md).
- **`TranslationEngine.js`/`src/utils/` internal contracts** (phase ordering, position tracking, WASM lifecycle) → `src/utils/CLAUDE.md`.
- **`Translator.jsx`/hooks/component contracts** (engine lifecycle, hotkeys, highlighting state) → `src/components/CLAUDE.md` (and nested `src/components/*/CLAUDE.md` for dictionary/rules).
- **Domain glossary** (what a module is, in this codebase's own vocabulary) → `GLOSSARY.md`.
- **Architectural decisions** → `docs/adr/` — each new ADR also gets a row in `docs/adr/README.md`'s index table (keep every cell within the existing column widths, or Prettier re-aligns the whole table — true of every Markdown table here, the scoped `CLAUDE.md` ownership tables too) **and** its id on the dated line at the bottom (the table sat stale at ADR-006 until 2026-09-26); a supersession also edits the old ADR's `Status:` line **and** its README status cell (two copies).

📖 [Architecture](docs/guides/architecture.md) · [Development](docs/guides/development.md) · [Troubleshooting](docs/guides/troubleshooting.md) · [Hotkeys](docs/HOTKEYS.md) · [ADRs](docs/adr/) · [CSP Security](docs/CSP_SECURITY.md)
