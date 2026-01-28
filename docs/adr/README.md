# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records documenting key architectural decisions for the Chinese-Vietnamese Translation App.

## Purpose

ADRs prevent repeated investigations of solved problems by documenting:

- **Context**: Why was this decision needed?
- **Alternatives**: What options were considered?
- **Decision**: What did we choose and why?
- **Consequences**: What are the trade-offs?

## Active ADRs

### [ADR-001: WASM Batch Loading Failure](./ADR-001-wasm-batch-loading-failure.md)

**Status**: Accepted (Workaround)
**Decision**: Accept sequential fallback for dictionary loading
**Impact**: 200-500ms slower startup, but 100% reliability

**Summary**: WASM batch dictionary loading fails 100% of the time, forcing sequential fallback. We accept this workaround because sequential loading has proven stable (100% success rate) and startup is already fast enough (<100ms total). Fixing batch loading would be high-risk with marginal benefit.

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

## ADR Format

Each ADR follows this structure:

- **Status**: Accepted | Deprecated | Superseded
- **Context**: Problem statement and background
- **Decision Drivers**: Key factors influencing the decision
- **Alternatives Considered**: Options evaluated with pros/cons
- **Decision**: What was chosen and why
- **Consequences**: Positive, negative, and neutral outcomes
- **References**: Code locations, related docs, tests

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

## References

- ADR Process: [Michael Nygard's ADR Template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- Project Documentation: [CLAUDE.md](../../CLAUDE.md)
- Technical Debt Analysis: [Code Review Report](../../CLAUDE.md)
- Failed Attempts Archive: [docs/archive/](../archive/)

## History

- **2026-01-28**: Created ADR-001 through ADR-004 (WASM batch, dual-path, TypeScript hybrid, 5-phase order)
- **Future ADRs**: WASM memory configuration, new phase addition, performance optimizations
