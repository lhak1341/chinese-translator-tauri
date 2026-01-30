# Documentation Index

Complete documentation for the Chinese-Vietnamese Translation App.

## Getting Started

- **[CLAUDE.md](../CLAUDE.md)** - Quick reference and critical constraints
- **[README.md](../README.md)** - Project overview

## Core Guides

### Architecture

**[guides/architecture.md](guides/architecture.md)** - System design and technical architecture

- 5-Phase Translation Pipeline (IMMUTABLE)
- WASM Acceleration Systems (Number, Pattern, Dictionary, Lookup)
- Semantic Arrays and Clickable Highlighting
- Token Processing Contracts (WASM ↔ JavaScript)
- System Requirements

### Development

**[guides/development.md](guides/development.md)** - Development guidelines and tools

- Safe Development Zones
- Logging Best Practices (environment-aware)
- TypeScript Migration Strategy
- Testing Infrastructure (541 tests across 25 files)
- Development Commands and Shortcuts
- CI/CD Pipeline
- Code Formatting (Prettier)
- Production Build Requirements

### Performance

**[guides/performance.md](guides/performance.md)** - Optimization and profiling

- Performance Monitoring (memory, cache, baselines)
- Cache Management (unified invalidation API)
- Profiling Strategy (3-step systematic approach)
- Memory Leak Prevention (timers, bounded collections, localStorage)
- Failed Patterns to Avoid

### Troubleshooting

**[guides/troubleshooting.md](guides/troubleshooting.md)** - Debugging and common issues

- When Translation Is Wrong (5-step diagnosis)
- When Clickable Highlighting Is Wrong (dual-path debugging)
- When Cache Serves Wrong Translation
- Error Handling Patterns (React, WASM, Rust)
- Development Process Lessons

## Architecture Decision Records (ADRs)

**[adr/](adr/)** - Key architectural decisions and rationale

- [ADR-001: WASM Batch Loading Failure](adr/ADR-001-wasm-batch-loading-failure.md)
- [ADR-002: Dual-Path Clickable Highlighting](adr/ADR-002-dual-path-clickable-highlighting.md)
- [ADR-003: TypeScript Hybrid Architecture](adr/ADR-003-typescript-hybrid-architecture.md)
- [ADR-004: Five-Phase Processing Order Immutability](adr/ADR-004-five-phase-processing-order-immutability.md)

## Code Reviews

**[code-review/](code-review/)** - Recent code reviews and fixes

- [Hotfix 2026-01-27](code-review/HOTFIX_2026-01-27.md)
- [Pattern Processing Fixes 2026-01-27](code-review/PATTERN_PROCESSING_FIXES_2026-01-27.md)
- [WASM Code Review 2026-01-28](code-review/WASM_CODE_REVIEW_2026_01_28.md)
- Historical code reviews (5-phase processing, clickable highlighting, etc.)

## Additional Documentation

- **[CSP_SECURITY.md](CSP_SECURITY.md)** - Content Security Policy and WASM security analysis
- **[TEST_COVERAGE_IMPROVEMENTS.md](TEST_COVERAGE_IMPROVEMENTS.md)** - Test suite evolution (541 tests, 4,408% increase)
- **[../tests/README.md](../tests/README.md)** - Testing infrastructure details
- **[../wasm-core/WARNINGS.md](../wasm-core/WARNINGS.md)** - WASM development warnings

## Archive

**[archive/](archive/)** - Historical documentation and context

### Migrations

- [WASM Removal Migration Guide](archive/migrations/WASM_REMOVAL_MIGRATION_GUIDE.md) - Full WASM engine removal (Phase 6-7, 2024)

### Pattern Optimization

**[archive/pattern-optimization/](archive/pattern-optimization/)** - WASM pattern matching optimization history

- Hash map cloning elimination (40-60% speedup)
- String allocation reduction (30-40% speedup)
- Early pattern rejection
- Rust-side profiling guide

### Refactoring 2026

**[archive/refactoring-2026/](archive/refactoring-2026/)** - Refactoring attempts and learnings

- Extraction analysis (what can vs cannot be extracted)
- Extraction summary (5 successful extractions, ~680 lines)
- Refactoring progress

### Pattern Matching Migration

**[archive/pattern-matching-migration/](archive/pattern-matching-migration/)** - Rust pattern matching migration

- Pattern matching conversion to Rust
- Pattern parity testing guide

### Phase Reports

**[archive/phase-reports/](archive/phase-reports/)** - Historical development phases

- Phase 1-8 completion reports
- Integration plans and test strategies

### Clickable Highlighting

**[archive/clickable-highlighting/](archive/clickable-highlighting/)** - Review history

- 7 incremental reviews documenting clickable highlighting development

## Quick Navigation

**By Topic:**

| Topic                  | Guide                                        | Section                       |
| ---------------------- | -------------------------------------------- | ----------------------------- |
| 5-Phase Pipeline       | [Architecture](guides/architecture.md)       | System Architecture           |
| WASM Systems           | [Architecture](guides/architecture.md)       | WASM Acceleration             |
| WASM Security          | [CSP_SECURITY.md](CSP_SECURITY.md)           | Full Document                 |
| Clickable Highlighting | [Architecture](guides/architecture.md)       | Semantic Arrays               |
| Translation Issues     | [Troubleshooting](guides/troubleshooting.md) | When Translation Is Wrong     |
| Performance Issues     | [Troubleshooting](guides/troubleshooting.md) | When Performance Degrades     |
| Memory Leaks           | [Performance](guides/performance.md)         | Memory Leak Prevention        |
| Testing                | [Development](guides/development.md)         | Testing Infrastructure        |
| Production Builds      | [Development](guides/development.md)         | Production Build Requirements |
| Code Formatting        | [Development](guides/development.md)         | Code Formatting               |

**By Activity:**

- **Setting up dev environment** → [Development Guide](guides/development.md) + [CLAUDE.md](../CLAUDE.md)
- **Understanding architecture** → [Architecture Guide](guides/architecture.md)
- **Debugging translation** → [Troubleshooting Guide](guides/troubleshooting.md)
- **Optimizing performance** → [Performance Guide](guides/performance.md)
- **Understanding design decisions** → [ADRs](adr/)
- **Historical context** → [Archive](archive/)
