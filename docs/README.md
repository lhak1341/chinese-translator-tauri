# Documentation Index

Start at [`CLAUDE.md`](../CLAUDE.md) for critical constraints, then follow whichever guide matches the task.

## Guides

| Guide                                           | Covers                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [architecture.md](guides/architecture.md)       | execution paths, semantic arrays, token contracts                                         |
| [development.md](guides/development.md)         | Logging, debugging tools, testing conventions, CI/CD, production build requirements       |
| [deleted-symbols.md](guides/deleted-symbols.md) | What's already been removed and why — check before recreating anything that looks missing |
| [gotchas.md](guides/gotchas.md)                 | Confirmed pitfalls: Edit tooling, JS/TS, types, Rust/WASM, testing, CSS                   |
| [performance.md](guides/performance.md)         | Profiling strategy, cache management, memory leak prevention, failed patterns             |
| [troubleshooting.md](guides/troubleshooting.md) | Wrong translation, wrong highlighting, stale cache, error handling patterns               |

## Decisions

[`adr/`](adr/) holds the architectural decision records, including the rationale behind the constraints that look arbitrary from the code alone — dual-path highlighting, phase-order immutability, and the TypeScript/JavaScript split. See [`adr/README.md`](adr/README.md) for the full list.

## Reference

- [CSP_SECURITY.md](CSP_SECURITY.md) — why the app needs `wasm-unsafe-eval`, and the mitigations around it
- [HOTKEYS.md](HOTKEYS.md) — keyboard shortcuts

## Archive

Retired documents live in git, not in the tree. The last commit that holds them is `be492346`: the failed extraction attempts behind ADR-002/003/004 (`be492346:docs/archive/refactoring-2026/`), the pattern-matching optimization history, the Rust migration record, the WASM removal guide, the 2026-01/02 code reviews (`be492346:docs/code-review/`), the 2026-02 design plans (`be492346:docs/plans/`), and three docs retired later: `be492346:memory/MEMORY.md`, `be492346:tests/README.md` and `be492346:wasm-core/WARNINGS.md`. A doc cites one as `be492346:<path>`:

```bash
git ls-tree -r --name-only be492346 -- docs/archive docs/code-review docs/plans
git show be492346:docs/archive/refactoring-2026/EXTRACTION_SUMMARY.md
```

They describe the code as it was when they were written; the guides above describe it as it is.

`scripts/check-docs-allowlist.mjs` (run by `bun run lint` and the pre-commit hook) fails on any markdown file outside its allowlist. A new doc belongs in an existing guide, a scoped `CLAUDE.md`, an ADR, or a commit message; add a path to the allowlist only when none of those fits.

`scripts/check-doc-claims.ts` (same two places) fails when a live doc names code that does not exist: every backticked identifier must appear in code outside comments, and every backticked path must resolve. ADRs and `docs/guides/deleted-symbols.md` are exempt, since they name deleted code on purpose; elsewhere, write the present tense or cite a retired file as `be492346:<path>`. A real name from outside the repo goes in the script's `EXTERNAL` list.
