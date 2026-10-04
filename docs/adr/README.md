# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records documenting key architectural decisions for the Chinese-Vietnamese Translation App.

## Purpose

ADRs prevent repeated investigations of solved problems by documenting:

- **Context**: Why was this decision needed?
- **Alternatives**: What options were considered?
- **Decision**: What did we choose and why?
- **Consequences**: What are the trade-offs?

## Active ADRs

Every ADR is listed: the five foundational ones in full below, the rest in the table after them. Add a row when you add an ADR.

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

### All other ADRs

| ADR                                                                                 | Title                                                        | Status                            | Decision                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-005](./ADR-005-eager-dictionary-loading.md)                                    | Eager dictionary loading via DictionaryContext               | Accepted                          | `DictionaryContext` with eager loading is the only dictionary context; `LazyDictionaryContext` deleted.                                              |
| [ADR-007](./ADR-007-wasm-pattern-processor-no-js-fallback.md)                       | TwoPhasePatternProcessor — no JS fallback                    | Accepted                          | A WASM pattern error throws to `applyPatterns()`; no silent JS fallback.                                                                             |
| [ADR-008](./ADR-008-dictionary-cache-invalidation-locality.md)                      | Dictionary cache invalidation locality                       | Accepted (mechanism superseded)   | Reload cache invalidation stays with the reload path, not a `DictionaryContext` notification.                                                        |
| [ADR-009](./ADR-009-wasm-processor-lifecycle.md)                                    | WasmProcessorLifecycle                                       | Accepted                          | One shared init contract class for every WASM processor.                                                                                             |
| [ADR-010](./ADR-010-dictionary-match-sort-specificity-over-provenance.md)           | Dictionary match sort — specificity over provenance          | Accepted                          | Longer match wins; priority only breaks ties at equal length.                                                                                        |
| [ADR-011](./ADR-011-skip-use-translator-session.md)                                 | Skip useTranslatorSession                                    | Accepted                          | Coordination stays in `Translator.jsx`.                                                                                                              |
| [ADR-012](./ADR-012-skip-hotkey-registry.md)                                        | Skip HotkeyRegistry                                          | Accepted (addenda 09-26, 09-28)   | Keep `useHotkeyHandler`; trigger fired — tab rules and ownership moved into `matchHotkey`, visible tab from context.                                 |
| [ADR-013](./ADR-013-skip-precomputed-token-strings-extraction.md)                   | Skip PrecomputedTokenStrings extraction                      | Superseded (2026-07-28)           | Originally kept inline; the extraction later happened, correctly.                                                                                    |
| [ADR-014](./ADR-014-dictionary-backend-load-only.md)                                | DictionaryBackend owns load protocol only                    | Accepted                          | Only the load retry/classification protocol moves to `DictionaryBackend`; save/move IPC stays in the provider.                                       |
| [ADR-015](./ADR-015-skip-text-processing-pipeline.md)                               | Skip TextProcessingPipeline                                  | Accepted                          | `TextChunker` and `AdaptiveChunker` solve different problems and are not composed.                                                                   |
| [ADR-016](./ADR-016-skip-streaming-context-record.md)                               | Skip StreamingContext record                                 | Decided                           | `useStreamingTranslation`'s return is not wrapped in a record.                                                                                       |
| [ADR-017](./ADR-017-skip-wasm-pool-analytics-separation.md)                         | Skip WasmMemoryPool analytics separation                     | Decided                           | Pool analytics stay in `WasmMemoryPool`.                                                                                                             |
| [ADR-018](./ADR-018-unified-performance-report-state.md)                            | Unified PerformanceReport state                              | Superseded by ADR-069             | One `report` state holds the full `getReport()` result.                                                                                              |
| [ADR-019](./ADR-019-skip-wasm-status-absorption-into-useTranslatorEngine.md)        | Skip absorbing WASM status into useTranslatorEngine          | Decided                           | The WASM status cluster stays out of `useTranslatorEngine`.                                                                                          |
| [ADR-020](./ADR-020-delete-wasm-sync-tracker.md)                                    | Delete WasmDictionaryManager sync tracking                   | Decided                           | Deleted outright rather than extracted.                                                                                                              |
| [ADR-021](./ADR-021-skip-performance-reporter-abstraction.md)                       | Skip a PerformanceReporter abstraction                       | Decided                           | `TranslationEngine` keeps its wide, flat performance-reporting interface.                                                                            |
| [ADR-022](./ADR-022-keep-streaming-reducer-exports.md)                              | Keep streamingReducer exports                                | Superseded (2026-06-21)           | Reducer and initial-state exports were kept; later superseded.                                                                                       |
| [ADR-023](./ADR-023-skip-translation-output-protocol-merge.md)                      | Skip a useTranslationOutput merge                            | Decided                           | `useStreamingTranslation` and `useTranslationResults` stay separate.                                                                                 |
| [ADR-024](./ADR-024-skip-appearance-style-objects-in-hook.md)                       | Skip style objects in useAppearanceSettings                  | Decided                           | Style memos stay where they are.                                                                                                                     |
| [ADR-025](./ADR-025-skip-useDictionaryEntryForm-setter-narrowing.md)                | Skip named actions for useDictionaryEntryForm                | Decided                           | Raw setters are the right interface for a form.                                                                                                      |
| [ADR-026](./ADR-026-skip-useDictionaryCRUD-move-to-hooks.md)                        | Skip moving useDictionaryCRUD                                | Superseded (move done 2026-06-27) | Originally kept co-located; the move later happened.                                                                                                 |
| [ADR-027](./ADR-027-fiction-structural-patterns-coupled-by-naming-convention.md)    | Fiction pattern dictionaries coupled by naming               | Decided                           | `patterns-f_X` pairs with `properNouns-f_X` by name at engine init; fiction entries win ties.                                                        |
| [ADR-028](./ADR-028-eager-creation-of-structural-pattern-dictionary.md)             | Eager creation of the fiction pattern dictionary             | Decided (mechanism superseded)    | A fiction dictionary is always created with its `patterns-f_*` pair.                                                                                 |
| [ADR-029](./ADR-029-fiction-patterns-use-pattern-source-string.md)                  | Fiction patterns use the 'pattern' source                    | Decided                           | Fiction pattern matches report `'pattern'`, like global patterns.                                                                                    |
| [ADR-030](./ADR-030-performanceHealth-is-the-sole-barrel-export.md)                 | performanceHealth is the sole barrel export                  | Superseded by ADR-069             | `utils/performance` exports only `performanceHealth`.                                                                                                |
| [ADR-031](./ADR-031-skip-dictionary-commands-file-split.md)                         | Skip splitting dictionary_commands.rs                        | Decided                           | No split by concern, no `ValidatedDictionaryId` newtype.                                                                                             |
| [ADR-032](./ADR-032-delete-baseline-tracker-cachehitrate-machinery.md)              | Delete PerformanceBaselineTracker's cacheHitRate             | Decided                           | The whole `cacheHitRate` baseline/alert machinery is deleted.                                                                                        |
| [ADR-033](./ADR-033-defer-pattern-matcher-parity-test.md)                           | Delete broken pattern-matcher parity tooling                 | Resolved (2026-09-08)             | Broken parity tooling deleted; real parity coverage built later.                                                                                     |
| [ADR-034](./ADR-034-skip-dictionarymanager-validateintegrity.md)                    | Skip DictionaryManager.validateIntegrity()                   | Decided                           | Fix the test's silent guard instead of building the method.                                                                                          |
| [ADR-035](./ADR-035-skip-dictionarymatchlookup-closure-removal.md)                  | Skip removing DictionaryManager's constructor closures       | Decided                           | The lookup classes are already testable with stubs; no change.                                                                                       |
| [ADR-036](./ADR-036-skip-segmentprecomputer-scan-unification.md)                    | Skip a shared segment scanner                                | Decided (addenda 2026-08-25)      | The two scans solve different matching problems; close test gaps instead.                                                                            |
| [ADR-037](./ADR-037-delete-orphaned-wasm-boundary-validators.md)                    | Delete orphaned WASM boundary validators                     | Decided                           | Dead validators deleted; `validateWasmDictionaryMatch` kept.                                                                                         |
| [ADR-038](./ADR-038-reject-rulematchesmodal-transform-output-preview.md)            | Reject RuleMatchesModal output preview                       | Decided                           | The modal edits real stored translations, which is what it is for.                                                                                   |
| [ADR-039](./ADR-039-skip-usedictionaryentryform-split.md)                           | Skip splitting useDictionaryEntryForm                        | Decided                           | One form, one wide return object; no caller wants a slice.                                                                                           |
| [ADR-040](./ADR-040-reject-aho-corasick-lookup-index-swap.md)                       | Reject Aho-Corasick for the lookup index                     | Decided                           | Prototype built, benchmarked and removed; the trie stays.                                                                                            |
| [ADR-041](./ADR-041-keep-number-processor-rs-as-parity-spec.md)                     | Keep number_processor.rs                                     | Decided                           | It is the Rust parity spec for `NumberProcessor.js`, not dead code.                                                                                  |
| [ADR-042](./ADR-042-adopt-tanstack-react-virtual-for-the-reader.md)                 | Adopt @tanstack/react-virtual for the Reader                 | Decided                           | Variable-height rows need it; `useVirtualScrollRange` stays for the dictionary table.                                                                |
| [ADR-043](./ADR-043-skip-shared-windowed-fill-primitive.md)                         | Skip a shared generation-guarded fill primitive              | Decided                           | `fillPlan` and the title fill stay separate loops.                                                                                                   |
| [ADR-044](./ADR-044-skip-splitting-openbook.md)                                     | Skip splitting ReaderTab's openBook                          | Decided (addendum 2026-09-26)     | One entry point, one early-return branch; it now holds the whole record.                                                                             |
| [ADR-045](./ADR-045-skip-shared-chapter-structure-override.md)                      | Skip a shared chapter-structure override control             | Decided                           | The dialog and panel selects differ because their surroundings do.                                                                                   |
| [ADR-046](./ADR-046-keep-bookreader-scroll-composition-and-refill-ref.md)           | Keep BookReader's master-scroll composition and refill ref   | Decided                           | Both break the panels → anchor → fill construction cycle; moving them adds a trampoline or dispatch-order dependency.                                |
| [ADR-047](./ADR-047-skip-numberprocessor-numeral-value.md)                          | Skip a numeral-value interface on NumberProcessor            | Decided                           | Slot value and running-text conversion are different policies; the tables cannot drift.                                                              |
| [ADR-048](./ADR-048-generic-proper-nouns-get-paired-patterns.md)                    | Generic proper-noun dictionaries get paired patterns too     | Decided                           | ADR-027's pairing extended to `properNouns-_X`; merge precedence base < generic < fiction; Cmd-6 mirrors Cmd-5.                                      |
| [ADR-049](./ADR-049-keep-selection-mapper-registry.md)                              | Keep the selection-mapper registry                           | Decided                           | Each mapper answers only inside its own panel, so one answers at most; the registry is Cmd-7's seam to the panels.                                   |
| [ADR-050](./ADR-050-one-bookreader-instance-per-book.md)                            | One BookReader instance per book                             | Decided                           | `ReaderTab` keys `BookReader` by fingerprint; the engine queue lives in `ReaderTab`; hooks under it assume one book.                                 |
| [ADR-051](./ADR-051-reader-quick-add-is-the-shared-add-form.md)                     | The Reader's quick-add is the shared Add form                | Decided                           | An Add key over a selection opens the shared `DictionaryEntry` form; no Reader-only floating bar.                                                    |
| [ADR-052](./ADR-052-dictionary-edit-commits-one-queue-typescript-write-back.md)     | Dictionary Edit commits: one queue, TypeScript write-back    | Decided                           | Multi-dictionary edits roll back in TypeScript, not a Rust batch save; all commits run through one global queue.                                     |
| [ADR-053](./ADR-053-unread-dictionaries-are-refused-not-quarantined.md)             | Unread dictionaries are refused, not quarantined             | Decided                           | A dictionary that failed to load is left out of memory and its edits refused; unlike app files, it is not set aside.                                 |
| [ADR-054](./ADR-054-skip-book-record-field-schema.md)                               | Skip a Book Record field schema                              | Decided                           | The compiler already checks three of four sites; only the chapter pattern ids needed one declaration and a Rust pin.                                 |
| [ADR-055](./ADR-055-dictionary-store-one-queue-for-every-write.md)                  | Dictionary Store: one queue for every write                  | Decided                           | Reloads, renames, import and force reload join commits on one queue; memory is the source of truth.                                                  |
| [ADR-056](./ADR-056-skip-rule-draft-module.md)                                      | Skip a rule-draft module                                     | Decided                           | The draft's rules already have one owner; only `HAN_CHAR` and the key trim were duplicated.                                                          |
| [ADR-057](./ADR-057-skip-reader-session-module.md)                                  | Skip a ReaderSession module                                  | Decided                           | `ReaderTab`'s states disagree nowhere and its props would not change; the concrete bug was `useLibrary`'s stale scan.                                |
| [ADR-058](./ADR-058-delete-runtime-wasm-parity-validation.md)                       | Delete the runtime WASM parity validation                    | Decided                           | The check never ran (dead `wasmInitialized` gate, mocked test); parity moves to a shared-fixture test in Rust and JS.                                |
| [ADR-059](./ADR-059-config-toggle-computed-under-the-lock.md)                       | A Configuration toggle is computed under the config lock     | Decided                           | A toggle causes no rebuild, so the binding queue buys nothing; computing it from React state lost back-to-back clicks.                               |
| [ADR-060](./ADR-060-dictionary-id-and-config-key-rules-held-by-a-shared-fixture.md) | Dictionary-id and config-key rules held by a shared fixture  | Decided                           | Tier, pairing and config-key facts live in TS and Rust; one fixture holds both, and Rust keeps editing config during a rename.                       |
| [ADR-061](./ADR-061-skip-shelf-row-module.md)                                       | Skip a shelf row module                                      | Decided                           | The formatters are single-use and tested through the component; the repeated unknown-identity rule became one local `rowLabels`.                     |
| [ADR-062](./ADR-062-pair-operations-share-the-binding-queue-and-the-stores-list.md) | Pair operations share the binding queue and the store's list | Decided                           | One queue for every create, rename and move; the Configuration tab and the fiction list read the Dictionary Store's list, with no copy of their own. |
| [ADR-063](./ADR-063-skip-hotkey-chord-module.md)                                    | Skip a hotkey chord module                                   | Decided                           | Palette hints and `RELOAD_HINT` are already parsed back through `matchHotkey` by tests, and the bindings are literal-pinned on purpose.              |
| [ADR-064](./ADR-064-skip-splitting-the-binding-context.md)                          | Skip splitting the binding context                           | Decided                           | The snapshot changes about four times per book open, and an actions-only hook would be a pass-through slice of the same provider.                    |
| [ADR-065](./ADR-065-keep-dictionary-reload-owned-by-the-translator.md)              | Keep dictionary reload owned by the Translator               | Decided                           | Eight of the reload protocol's ten inputs are the Translator tab's own state, so an engine-owned reload would need a two-phase protocol.             |
| [ADR-066](./ADR-066-skip-active-dictionary-snapshot.md)                             | Skip an active-dictionary snapshot module                    | Decided                           | The engine's list is what it was built with and the Configuration tab's is saved intent; they differ until a reload on purpose.                      |
| [ADR-067](./ADR-067-keep-pair-operations-in-the-binding-store.md)                   | Keep pair operations in the binding store                    | Decided                           | Create, rename and move each read or write the binding, so a pair module would take that state through getters, with one adapter.                    |
| [ADR-068](./ADR-068-one-lru-module-under-both-dictionary-caches.md)                 | One LRU module under both dictionary caches                  | Decided                           | The two caches had drifted (a recency guard only one carried); one lock, a counter clock and one poison path remove the cases the copies patched.    |
| [ADR-069](./ADR-069-delete-the-baseline-regression-detector.md)                     | Delete the baseline regression detector                      | Decided                           | The tracker, 30 s poll and status dot could not fire; ADR-018 and ADR-030 superseded.                                                                |
| [ADR-070](./ADR-070-skip-wasm-call-or-fallback-shell.md)                            | Skip a WASM-call-or-fallback shell                           | Decided                           | Catch blocks share two lines; unread wrapper stats deleted.                                                                                          |
| [ADR-071](./ADR-071-skip-backends-for-one-shot-ipc.md)                              | Skip Backends for one-shot IPC                               | Decided                           | A Backend holds a protocol; one-shot commands have none.                                                                                             |
| [ADR-072](./ADR-072-skip-dictionaryprovider-policy-extraction.md)                   | Keep DictionaryProvider policy in place                      | Decided                           | Startup-load and invalidation policy is wiring; provider is the test seam.                                                                           |

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
- **2026-09-26**: Index filled in for ADR-005 and ADR-007 through ADR-045; ADR-046; ADR-047; ADR-048; ADR-049
- **2026-09-27**: ADR-050; ADR-051
- **2026-09-29**: ADR-052; ADR-053
- **2026-09-30**: ADR-054; ADR-055; ADR-056
- **2026-10-01**: ADR-057
- **2026-10-02**: ADR-058; ADR-059; ADR-060; ADR-061; ADR-062; ADR-063; ADR-064; ADR-065
- **2026-10-03**: ADR-066; ADR-067; ADR-068; ADR-069
- **2026-10-04**: ADR-070; ADR-071; ADR-072
- **Future ADRs**: WASM memory configuration, new phase addition, `useTranslatorEngine` hook scope
