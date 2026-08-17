# Chinese-Vietnamese Translation App

React/Tauri desktop app translating Chinese novels to Vietnamese via 5-phase token consumption with WASM acceleration.

---

## Essential Commands

```bash
cargo check --manifest-path src-tauri/Cargo.toml  # NOT cd + cargo — zoxide breaks it
cargo check --manifest-path wasm-core/Cargo.toml   # separate crate — check both when touching Rust
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1
cargo test --manifest-path src-tauri/Cargo.toml -- --test-threads=1  # test_reset_with_backup_copies_files_then_wipes_and_recreates is flaky under default parallel threads (pre-existing, unrelated to your change if it's the only one failing)
pnpm build-wasm-dev  # after any wasm-core change — binary is gitignored, stays stale otherwise
pnpm tauri:dev
pnpm test -- --run  # default reporter prints ~nothing when backgrounded/piped — silence ≠ hung; check `ps` CPU or add --reporter=verbose before assuming a stall
pnpm type-check  # 0 errors expected
```

---

## Architecture

**5-Phase Pipeline (order is immutable):** Pattern → Proper Noun → Number → Phrase → Character. Each phase's `translationSource` string is the discriminator (`getSourcePriority()` returns 999 for any unrecognized string — silently corrupts output). **Consumed token contract:** `*_consumed` → `translated` must be `null`; non-`*_consumed` → `translated` must NOT be `null`. Validated by `validateConsumedTokenContract()`.

**Dual-Path Architecture:** Character-only and Full-Translation are completely separate rendering/highlighting pipelines with separate entry points (`src/components/char-only/` vs `src/components/full-translation/`). Debug the right one — see `CONTEXT.md` for which module belongs to which.

---

## Critical Constraints

**DO NOT extract** from `TranslationEngine.js`: `translateSinglePass()` (shared token state across all 5 phases), `findAllMatchesWithSemanticCache()` (timing-sensitive cache invalidation), `postProcess()` (position precision requires exact assembly order).

**DO NOT modify dictionaries** without permission. Production: `~/Library/Application Support/com.lhak.chinese-translator/dictionaries/`. When permission is given for a bulk edit: back up the target files to the scratchpad dir first; confirm real formatting (indent width, literal-UTF-8 vs `\u` escapes via `grep -c '\\u'`, trailing-newline via `tail -c`) before `JSON.parse`→mutate→`JSON.stringify(obj,null,2)`, so the rewrite is a surgical diff. `.trie.json` caches don't need manual deletion — checksum staleness detection regenerates them. When bulk-matching entries by key-string suffix/prefix, also verify the matched entries' **field shape** (`allowedVariableTypes`/`semanticType`) matches the expected category before mutating — a string match alone can catch unrelated entries.

**Bash tool sandbox virtualizes writes outside the repo dir** (e.g. `~/Library/Application Support/...`) — a write can appear to succeed and read back correctly in the same session while the real on-disk file is untouched. Any write to a path outside the repo (dictionaries, `transform-rules.json`, `config.json`, `appearance.json`) needs `dangerouslyDisableSandbox: true` on the Bash call, both for the write AND the verifying read. Separately: after any direct edit to a file the running app owns, the app must be **fully quit and relaunched** (not just window-closed) before trusting the edit — a live process's own next save silently overwrites it with stale in-memory state.

**Large files are intentional.** `TranslationEngine.js` and `Translator.jsx` coordinate state that can't be extracted. Can extract: pure functions → `src/utils/`; single-concern hooks → `src/hooks/`. Cannot extract: anything using `this.*`, `setState`, refs, or requiring 10+ parameters. **Intentionally JavaScript (never TypeScript):** `TranslationEngine.js`, `Translator.jsx`, `SemanticPatternProcessor.js`.

---

## Where Everything Else Lives

This file stays short on purpose — everything task-scoped moved to where it's discoverable when you actually need it:

- **Tooling/environment gotchas** (RTK proxy quirks, Edit tool limits, test placement, regex Unicode traps, etc.) and the **full deleted-symbols history** (what's already been removed — check before recreating anything that looks missing) → [`docs/guides/development.md`](docs/guides/development.md), especially its [Gotchas Reference](docs/guides/development.md#gotchas-reference) and [deleted-symbols](docs/guides/development.md#deleted-symbols) sections.
- **Debugging steps, resolved bug postmortems, and the "verify claims before acting" discipline** (Explore subagents and architecture-review reports both fabricate/overstate specifics — always re-verify with `Grep`/`Read` before deleting or citing) → [`docs/guides/troubleshooting.md`](docs/guides/troubleshooting.md).
- **`TranslationEngine.js`/`src/utils/` internal contracts** (phase ordering, position tracking, WASM lifecycle) → `src/utils/CLAUDE.md`.
- **`Translator.jsx`/hooks/component contracts** (engine lifecycle, hotkeys, highlighting state) → `src/components/CLAUDE.md` (and nested `src/components/*/CLAUDE.md` for dictionary/rules).
- **Domain glossary** (what a module is, in this codebase's own vocabulary) → `CONTEXT.md`.
- **Architectural decisions** → `docs/adr/`.

📖 [Architecture](docs/guides/architecture.md) · [Development](docs/guides/development.md) · [Troubleshooting](docs/guides/troubleshooting.md) · [Hotkeys](docs/HOTKEYS.md) · [ADRs](docs/adr/)

## graphify

This project has a graphify knowledge graph at graphify-out/.

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost). If it refuses with "fewer nodes," that's a safety guard — run `graphify update . --force`.
- `graphify update .` reporting success is NOT proof the graph is current — a known local-detect.py scoping bug (patched 2026-08-12) can silently exclude most of the repo from a scan. After a session that added new files, spot-check with `grep -c "<new-file-name>" graphify-out/graph.json` before trusting the update. If it starts silently finding 0 files again (esp. after `uv tool upgrade`), check whether the patch survived.
- `graphify-out/graph.json` is gitignored and NOT safely reconstructible from `manifest.json` alone if deleted — never delete it as a troubleshooting step without a copy first.
