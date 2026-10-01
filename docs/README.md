# Documentation Index

Start at [`CLAUDE.md`](../CLAUDE.md) for critical constraints, then follow whichever guide matches the task.

## Guides

| Guide                                           | Covers                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [architecture.md](guides/architecture.md)       | execution paths, semantic arrays, token contracts                                         |
| [development.md](guides/development.md)         | Logging, debugging tools, testing conventions, CI/CD, production build requirements       |
| [deleted-symbols.md](guides/deleted-symbols.md) | What's already been removed and why — check before recreating anything that looks missing |
| [gotchas.md](guides/gotchas.md)                 | Confirmed pitfalls: RTK/Edit tooling, JS/TS, types, Rust/WASM, testing, CSS               |
| [performance.md](guides/performance.md)         | Profiling strategy, cache management, memory leak prevention, failed patterns             |
| [troubleshooting.md](guides/troubleshooting.md) | Wrong translation, wrong highlighting, stale cache, error handling patterns               |

## Decisions

[`adr/`](adr/) holds the architectural decision records, including the rationale behind the constraints that look arbitrary from the code alone — dual-path highlighting, phase-order immutability, and the TypeScript/JavaScript split. See [`adr/README.md`](adr/README.md) for the full list.

## Reference

- [CSP_SECURITY.md](CSP_SECURITY.md) — why the app needs `wasm-unsafe-eval`, and the mitigations around it
- [HOTKEYS.md](HOTKEYS.md) — keyboard shortcuts
- [`plans/`](plans/) — in-flight design work
- [`../tests/README.md`](../tests/README.md) — testing infrastructure
- [`../wasm-core/WARNINGS.md`](../wasm-core/WARNINGS.md) — WASM development warnings

## Archive

[`archive/`](archive/) keeps only the historical documents that something still cites as evidence — the failed extraction attempts behind ADR-002/003/004, the pattern-matching optimization history, the Rust migration record, and the WASM removal guide. Superseded reports were deleted rather than kept; git history has them if a question ever needs one.

Note that archived documents describe the state of the code when they were written. Treat them as a record of what was tried and what happened, not as a description of how the system works today — the guides above are the current word.
