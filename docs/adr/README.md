# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records documenting key architectural decisions for the Chinese-Vietnamese Translation App.

## Purpose

ADRs prevent repeated investigations of solved problems by documenting:

- **Context**: Why was this decision needed?
- **Alternatives**: What options were considered?
- **Decision**: What did we choose and why?
- **Consequences**: What are the trade-offs?

## Active ADRs

**This index has not been kept in sync with new ADRs — always run `ls docs/adr/` for the complete, current list before treating this section as exhaustive.**

### [ADR-001: WASM Batch Loading — Remove Batch Wrapper](./ADR-001-wasm-batch-loading-failure.md)

**Status**: Revised (2026-05-16) — Remove batch attempt, use sequential as primary path
**Decision**: Delete JS-side batch call; sequential loading is the only path
**Impact**: Removes ~60 lines of dead fallback logic and startup warning noise

**Summary**: Root cause identified — Rust batch uses cumulative memory check (hits 15MB limit across 12 dicts) while sequential uses per-dictionary check. Fix is tractable but ADR-005 already settled that startup latency isn't a problem. Keeping broken batch code produces only constant-zero metrics and warning noise. Rust `load_dictionaries_batch()` stays compiled in; only the JS call site is removed.

---

### [ADR-002: Dual-Path Clickable Highlighting](./ADR-002-dual-path-clickable-highlighting.md)

**Status**: Accepted
**Decision**: Keep separate implementations for character-only vs full translation
**Impact**: ~200 lines code duplication, but 100% highlighting coverage

**Summary**: Two separate clickable highlighting implementations exist (character-only vs full translation). Consolidation attempts broke 63% of highlighting coverage due to position mapping failures. We accept the duplication because both paths work reliably and serve different use cases optimally.

---

### [ADR-003: TypeScript Hybrid Architecture](./ADR-003-typescript-hybrid-architecture.md)

**Status**: Accepted
**Decision**: TypeScript for utilities/boundaries, JavaScript for core engine
**Impact**: Context switching, but safety where it matters + flexibility where needed

**Summary**: Strategic hybrid approach - TypeScript for type-safe boundaries (WASM, APIs, utilities) and JavaScript for core engine requiring tight coupling. Full TypeScript migration would break timing-sensitive 5-phase processing. This hybrid provides type safety without sacrificing performance.

---

### [ADR-004: 5-Phase Processing Order Immutability](./ADR-004-five-phase-processing-order-immutability.md)

**Status**: Accepted (Architectural Constraint)
**Decision**: Pattern → Proper Noun → Number → Phrase → Character order is IMMUTABLE
**Impact**: Cannot reorder phases, but correct translations guaranteed

**Summary**: The 5-phase translation order is an architectural constraint that cannot be changed. Phase order determines translation priority and changing it breaks accuracy (documented with examples). Sequential processing is also faster than parallel (O(n) vs O(n²) conflict resolution).

---

### [ADR-006: PatternProcessor Interface](./ADR-006-pattern-processor-interface.md)

**Status**: Accepted
**Decision**: `processTokens()` returns `PatternProcessorResult[]`; `applyHierarchicalResults()` is the sole mutation site
**Impact**: Both adapters (JS + WASM) satisfy the same contract; `applyPatterns()` needs no adapter-type branching

**Summary**: Phase 1 has two adapters (`SemanticPatternProcessor` JS, `TwoPhasePatternProcessor` WASM). Both must return the same `PatternProcessorResult[]` shape from `processTokens()` so that `applyHierarchicalResults()` can apply either without branching. `applyPatternMatch` was deleted; callers that ignore the return value silently drop all pattern translations.

---

## ADR Format

Each ADR follows this structure:

- **Status**: Accepted | Deprecated | Superseded
- **Context**: Problem statement and background
- **Decision Drivers**: Key factors influencing the decision
- **Alternatives Considered**: Options evaluated with pros/cons
- **Decision**: What was chosen and why
- **Consequences**: Positive, negative, and neutral outcomes
- **References**: Code locations, related docs, tests

**Reference hygiene**: Use full paths (e.g. `src/utils/dictionary/EnhancedDictionaryManager.js`), not bare filenames. Use function names, not line numbers — lines drift in large files and extensions change during refactors.

## When to Write an ADR

Write an ADR when making decisions about:

- **Architecture**: System structure, component boundaries
- **Technology**: Framework, library, or tool choices
- **Constraints**: Accepted limitations or immutable patterns
- **Tradeoffs**: Performance vs simplicity, safety vs flexibility
- **Workarounds**: Known issues with accepted solutions

**Don't write ADRs for**:

- Bug fixes (unless they reveal architectural issues)
- Routine refactoring
- Code style choices (use ESLint/Prettier)
- Temporary experiments

**Rejecting a proposed split/extraction**: apply the deletion test to the _proposed change itself_, not just the original shallow-module complaint — a split whose caller-facing shape never changes relocates complexity instead of concentrating it (ADR-039, ADR-043, ADR-044 all reject this way).

## References

- ADR Process: [Michael Nygard's ADR Template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- Project Documentation: [CLAUDE.md](../../CLAUDE.md)
- Technical Debt Analysis: [Code Review Report](../../CLAUDE.md)
- Failed Attempts Archive: [docs/archive/](../archive/)

## History

- **2026-01-28**: Created ADR-001 through ADR-004 (WASM batch, dual-path, TypeScript hybrid, 5-phase order)
- **2026-05-03**: ADR-005 (eager dictionary loading, LazyDictionaryContext deletion)
- **2026-05-03**: ADR-006 (PatternProcessor interface — return results, single apply site)
- **Future ADRs**: WASM memory configuration, new phase addition, `useTranslatorEngine` hook scope
