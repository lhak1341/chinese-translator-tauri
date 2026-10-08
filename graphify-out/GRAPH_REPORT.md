# Graph Report - chinese-translator-tauri (2026-10-08)

## Corpus Check

- 450 files · ~413,464 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 4391 nodes · 8919 edges · 320 communities (259 shown, 61 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 131 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `a98d7c17`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- dictionary_commands.rs
- number_processor.rs
- Logger
- V8OptimizationUtils.js
- PerformanceProfiler
- _assertNum
- DictionaryManagerTypes.d.ts
- TranslationEngineTypes.d.ts
- Translator.jsx
- Fiction Structural Pattern Dictionaries — Implementation Plan
- Systematic Refactoring: Pure Utility Extraction
- TranslationEngine Internals
- UtilityTypes.d.ts
- Future Optimization Work - Deferred Integrations
- TranslationEngine
- Content Security Policy (CSP) and WASM Security
- Tauri Backend Security Audit
- Future Improvements Implementation - 2026-02-01
- WASM Code Review Fixes - 2026-01-28
- Test Coverage Improvements Summary
- WASM Serialization Optimization Implementation Plan
- WASM Dictionary Trie - Final Summary & Decision
- Number Processing Phase - Code Review Fixes
- Troubleshooting Guide
- Memory Leak Prevention
- PerformanceMonitoringTypes.d.ts
- Code Review Fixes - 2026-02-01 (Second Review)
- Development Guide
- lookup_index_engine.rs
- PatternProcessingTypes.d.ts
- TypeScript/Rust Optimization Progress Report
- Code Review Fixes - Implementation Summary
- Pattern Processing Code Review Fixes
- Clickable Highlighting - Code Review Fixes Summary
- TranslationEngine.js
- Dictionary Trie Integration Session Summary
- System Architecture
- memory_management.rs
- Punctuation Spacing Debug Session - 2026-02-02
- useDictionaryCRUD.ts
- EnhancedVirtualizedDictionaryTable.tsx
- DictionaryManager
- Implementation Log
- Code Review Fixes - Translation Process
- DictionaryEngine
- .translateWithProgressiveBatches
- CSP Hardening Migration - Complete Summary
- ViewportTypes.d.ts
- FallbackManager
- ADR-004: 5-Phase Processing Order Immutability
- Task 1: Add Semantic column to Patterns dictionary table
- ComponentTypes.d.ts
- UITypes.d.ts
- WasmDictionaryManager
- DuplicateAnalyzer.ts
- Code Review Fixes - February 1, 2026
- EventTypes.d.ts
- Handoff: Shared WASM Module Panic Cascade
- DictionaryTypes.ts
- wasm_boundary.rs
- OptimizationBenchmarks
- SemanticPatternProcessor.js
- Phase 8 Tests - Pattern Matching Validation
- ToastContext.tsx
- TextTokenizer.ts
- Domain Glossary
- useHighlightingState.ts
- tauriAPI.ts
- WasmProcessorLifecycle.js
- HookTypes.d.ts
- DictionaryContext.tsx
- text_assembly.rs
- SemanticTypes.ts
- Code Review: Pure Computation Migration to wasm-core
- SelectionMapping.ts
- TwoPhasePatternProcessor
- wasmOperationTimeout.js
- WasmRegexUtilsWrapper
- TranslatorControls.tsx
- SmartMemoryCoordinator
- Task 1: Enable Semantic Type filter for Structural Patterns
- takeFromExternrefTable0
- useDictionary
- list_dictionaries_with_prefix
- Documentation Index
- index.ts
- WasmTextAssemblerWrapper
- ADR-002: Dual-Path Clickable Highlighting Architecture
- Implementation Details ✅
- SelectionMapping.ts
- DictionaryMatchLookup.js
- MemoryLeakDetector
- DictionaryTrieLoader.js
- DictionaryManager
- RegexUtils
- TranslationProfiler
- DictionaryWasmLookup
- TokenHelpers.ts
- SemanticArrayBuilder.ts
- WasmMemoryPool
- eslint-plugin-react-refresh
- useTransformRules.ts
- precompute-dictionaries.js
- buildLookupIndexOrFallback
- Completed Optimizations
- .new
- useDictionaryConfigManagement.ts
- PatternFailureTracker
- CacheTypes.d.ts
- QuickAddTarget.ts
- SemanticPatternProcessor
- LRUCache
- WasmProcessorLifecycle
- src/components — Gotchas
- ADR-002: Dual-Path Clickable Highlighting Architecture
- configValidation.ts
- Hotfix: Missing Method Safety Checks
- useDictionaryConfigManagement.ts
- Security Considerations
- translation_wasm_core.d.ts
- ElectronTypes.d.ts
- pattern.rs
- useHighlightingState.ts
- jsdom
- useCharacterOnlySegments.ts
- eslint-plugin-react
- Security Mitigations
- Chinese-Vietnamese Translation App
- Design
- V8OptimizationTypes.d.ts
- ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error
- SemanticArrayBuilder
- wasmIntegrityVerifier.js
- ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader
- ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential
- ADR-005: Eager Dictionary Loading via DictionaryContext
- vite
- CRITICAL-3: TranslationCache - O(n) Cache Invalidation
- NumberVariable.js
- useStreamingTranslation.js
- Resolved Bug Postmortems
- WordTransformToolbar.tsx
- PatternPriorityCalculator.ts
- ParallelConfig
- package.json
- PatternFailureTracker
- ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext
- ADR-062: Pair Operations Share the Binding Queue, and the Configuration Tab Reads the Dictionary Store's List
- appearanceConfig.ts
- TranslationChunkCache.ts
- PrecomputedTrieStats
- Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`
- ModalErrorBoundary
- DictionaryTypes.ts
- WasmProcessorLifecycle
- lib.rs
- ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`
- .processCharacterOnlyTokens
- ADR-065: Keep Dictionary Reload Owned by the Translator, Behind the Registry
- ADR-048: Generic Proper-Noun Dictionaries Get Paired Pattern Dictionaries Too
- SemanticPatternProcessor.js
- WasmDictionaryAdapter
- @types/node
- LookupIndexBuilder.ts
- ReadonlyOptimizationUtils.js
- PatternPriorityCalculator.ts
- High-Priority Issues 🟠
- 7. Clickable Highlighting Feature Analysis
- wasm-core Pattern Processor
- text_chunker.rs
- getStringFromWasm0
- DictionaryTabNavigation.ts
- TextAssembly.js
- ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation
- ADR-018: Unified PerformanceReport State in usePerformanceMonitoring
- AI Readiness Evaluation: chinese-translator-tauri
- 3. Performance Optimizations ⭐⭐⭐⭐⭐
- PrecomputedTrieStats
- ReaderBinding.tsx
- FallbackManager
- text_tokenizer.rs
- ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline
- jsdom
- PositionMetadataSegmenter.ts
- wasmOperationTimeout.js
- appFile.ts
- appearanceConfig.ts
- IncrementalDictionarySorter
- ModalErrorBoundary.tsx
- WindowedTranslationFill.ts
- Integration #3: V8 Optimization for Memory Tracking (Task #8)
- eslint-plugin-unused-imports
- @types/node
- .processRemainingPhrasesSequential
- TranslatorControls.tsx
- DevicePerformanceDetector
- ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call
- RustLookupIndexManager
- UnicodePunctuationDetector
- Task 6: UI — add semantic type selector to pattern entries
- Chinese-Vietnamese Translation App
- Chinese-Vietnamese Translation App
- Chinese-Vietnamese Translation App
- ADR-066: Skip an Active-Dictionary Snapshot Module
- ADR-024: Do Not Move Style Objects into useAppearanceSettings
- ADR-043: Skip a Shared Generation-Guarded-Fill Primitive
- ADR-044: Skip Splitting `ReaderTab`'s `openBook`
- Translation Paths Efficiency Review — 2026-02-07
- TranslatorControls.tsx
- App file
- types
- Code Quality Assessment
- ADR-037: Delete Orphaned WASM Boundary Validators, Keep `validateWasmDictionaryMatch`
- ADR-084: Skip Merging the Reload Context Assembler Into useForceReload
- ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook
- generate-wasm-hashes.js
- PatternFailureTracker
- eslint-plugin-unused-imports
- ReadonlyOptimizationUtils.js
- ErrorBoundary
- ADR-061: Skip a Shelf Row Module
- ReadonlyOptimizationUtils.js
- appearanceConfig.ts
- ADR-057: Skip a ReaderSession Module
- ADR-085: EngineAccess — one queue for both tabs, ownership follows the visible tab
- PunctuationProcessor
- System Architecture
- WasmStringProcessor
- ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider
- ADR-050: One BookReader Instance per Book
- ADR-031: Skip Splitting dictionary_commands.rs by Concern
- ADR-078: Delete the WASM String Tier
- ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name
- useDictionaryModals.tsx
- ADR-049: Keep the Selection-Mapper Registry
- ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`
- ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`
- typescript
- ADR-047: Skip a Numeral-Value Interface on NumberProcessor
- ADR-010: Dictionary Match Sort — Specificity Over Provenance
- ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine
- ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`
- ADR-059: A Configuration Toggle Is Computed Under the Config Lock, Not on the Binding Queue
- eslint-plugin-import
- eslint-plugin-react
- Keyboard Shortcuts
- Documentation Index
- EngineAccess
- 9. Recommendations
- tauriAPI.ts
- DictionaryManager Types
- Keyboard Shortcuts
- 📍 Code Locations Map
- ReaderPanel.tsx
- Chinese-Vietnamese Translator — Dev Memory
- useCharacterOnlySegments.ts
- ESLint Tooling
- ADR-026: Do Not Move useDictionaryCRUD to src/hooks/
- ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation
- ADR-074: Keep the Outline-Title Fill Inside Its Hook
- 12. Implementation Summary (2026-02-07)
- Fix 8: BONUS - Fix method name typos in TranslationCache
- Appendix: Evidence & Metrics
- 1. XSS Prevention ⭐⭐⭐⭐⭐
- ✅ Completed Work
- Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup
- ADR-024: Do Not Move Style Objects into useAppearanceSettings
- ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init
- Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup
- ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name
- ADR-018: Unified PerformanceReport State in usePerformanceMonitoring
- src/components/rules — Gotchas
- ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput
- husky
- Integration Roadmap (8 Integration Points)
- Integration Sequence (Recommended Order)
- 🚀 Next Steps
- 🔄 Git Status
- ADR-030: systemPerformanceMonitor.recordAlert wrongly asserted load-bearing
- ADR-033: pattern-matcher parity test deferred (no trusted oracle)
- types
- ADR-035: DictionaryMatchLookup testability claim refuted
- ADR-036: SegmentPrecomputer two scan loops are not unification candidates
- ADR-037: WASM boundary validation gap (WasmPatternProcessor/WasmTextChunker)
- CLAUDE.md (root project instructions)
- Consumed Token Contract (validateConsumedTokenContract)
- Deletion Test (architecture review heuristic: does a split concentrate or relocate complexity)
- Dual-Path Architecture (Character-only vs Full Translation)
- Fallow Dead-Code Analysis Protocol
- 5-Phase Translation Pipeline (Pattern, Proper Noun, Number, Phrase, Character)
- getSourcePriority() 999-fallback corruption risk
- graphify knowledge graph (graphify-out/) with known nested-gitignore scan bug
- Ousterhout deep-module signal: interface-to-implementation ratio, not field count
- RTK (Rust Token Killer) proxy — token-optimized CLI wrapper with known quirks
- ADR-039: Skip Splitting useDictionaryEntryForm
- ADR-039 Decision: do not split useDictionaryEntryForm
- ADRs Drift Factually Even When Decisions Hold
- Architecture-review 'duplication' scope claims are unreliable, need re-diffing
- Constant-Zero-Metric Dead Code Pattern (cacheHitRate, ContentAwarePositionCache, getSyncMetrics, DictionaryWasmLookup perf report, PerformanceProfiler)
- Deleted Symbols Do-Not-Recreate Registry (CLAUDE.md glossary)
- Explore Subagent Fabrication Risk (verify specific claims before acting)
- Guarded typeof-call-to-never-real-method Pattern
- ||-vs-?? Falsy-Default Bug Class (WasmMemoryPoolManager, VocabularyWarmup, useDictionaryEntryForm)
- Grill #4 (2026-08-15): schema-driven dual-renderer rejected for RulesManager surfaces
- Two UI Surfaces, One Set of Field Policies (rationale for shared validation modules)
- src/components/CLAUDE.md (component gotchas)
- src/components/rules/CLAUDE.md (rules gotchas)
- RuleFieldValidation.ts (parseValidatedNumber, parseValidatedKey, extractHanChars)
- RuleFieldParity.test.tsx
- TransformRuleEngine.ts (compareRulePrecedence, applyRule, deriveCapitalizeExceptNForKeyEdit)
- PositionMetadataSegmenter.ts
- SegmentPrecomputer.ts (precomputeSegments/precomputeOriginalSegments)

## God Nodes (most connected - your core abstractions)

1. `react` - 109 edges
2. `Logger` - 87 edges
3. `Domain Glossary` - 76 edges
4. `temp_test_dir()` - 53 edges
5. `make_cache()` - 47 edges
6. `TranslationEngine` - 40 edges
7. `DictionaryResponse` - 38 edges
8. `compilerOptions` - 32 edges
9. `extractErrorMessage()` - 31 edges
10. `rename_proper_nouns_dictionary_impl()` - 30 edges

## Surprising Connections (you probably didn't know these)

- `DictionaryManager()` --references--> `react` [EXTRACTED]
  src/components/dictionary/DictionaryManager.tsx → package.json
- `ToastItem()` --references--> `react` [EXTRACTED]
  src/components/ToastContext.tsx → package.json
- `TranslatorDisplayPanels()` --references--> `react` [EXTRACTED]
  src/components/translator/TranslatorDisplayPanels.tsx → package.json
- `scan_library_impl()` --calls--> `sanitize_io_error()` [INFERRED]
  src-tauri/src/book_commands.rs → src-tauri/src/dictionary_commands.rs
- `read_book_bytes()` --calls--> `sanitize_io_error()` [INFERRED]
  src-tauri/src/book_commands.rs → src-tauri/src/dictionary_commands.rs

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **Translator.jsx state-extraction hooks (dependency-injected context pattern)** — src_components_translator_translator, src_hooks_usedictionaryreloadguard_usedictionaryreloadguard, src_hooks_useclipboardtranslation_useclipboardtranslation, src_hooks_usecharacteronlybridge_usecharacteronlybridge, src_hooks_useautotranslatetrigger_useautotranslatetrigger, src_hooks_useforcereload_useforcereload, src_hooks_usetranslatorengine_usetranslatorengine [EXTRACTED 1.00]
- **RulesManager two-surface shared field-policy group** — src_components_rules_newrulemodal_newrulemodal, src_components_rules_rulerow_rulerow, src_components_rules_rulefieldvalidation_rulefieldvalidation, src_utils_dictionary_transformruleengine_transformruleengine, src_components_rules_tests_rulefieldparity_rulefieldparity [EXTRACTED 1.00]

## Communities (320 total, 61 thin omitted)

### Community 0 - "dictionary_commands.rs"

Cohesion: 0.09
Nodes (44): Encoding, a_book_reaching_outside_gbk_reports_gbk_but_not_strictly_clean(), a_low_confidence_report_blocks_decoding(), a_multibyte_detection_is_acted_on_without_asking(), a_plain_gbk_book_is_strictly_clean(), a_single_byte_detection_is_reported_low_confidence(), an_override_decodes_a_file_detection_refused(), BookContent (+36 more)

### Community 1 - "number_processor.rs"

Cohesion: 0.14
Nodes (38): build_test_zip(), import_dictionaries_impl(), load_dictionaries_parallel_impl(), make_cache(), rename_proper_nouns_dictionary_impl(), temp_test_dir(), test_create_structural_patterns_creates_empty_file_and_invalidates_cache(), test_create_structural_patterns_rejects_path_traversal_id() (+30 more)

### Community 2 - "Logger"

Cohesion: 0.06
Nodes (66): NumberProcessor, Case, ConversionPattern, create_conversion_patterns(), create_number_map(), Fixture, Ignore, NumberMatch (+58 more)

### Community 4 - "V8OptimizationUtils.js"

Cohesion: 0.17
Nodes (17): DictionaryEntry(), EntryForm, footerMessage(), patternMessage(), shortlistKeyTarget(), shortlistLabel(), dictionaryOptionLabel(), markVariables() (+9 more)

### Community 5 - "PerformanceProfiler"

Cohesion: 0.11
Nodes (18): BookshelfProps, LibraryBook, LibraryScan, PerformanceMonitor, refreshBookRecord(), loadBookRecords(), transformRecords(), byShelfTitle() (+10 more)

### Community 6 - "_assertNum"

Cohesion: 0.13
Nodes (30): CAPITALIZATION, MOVE_TO_FRONT, Transform, WordTransformToolbar(), WordTransformToolbarProps, applyRule(), capitalizeAll(), capitalizeExceptBoundaryN() (+22 more)

### Community 7 - "DictionaryManagerTypes.d.ts"

Cohesion: 0.05
Nodes (65): ADR-0012, HotkeyHandler(), CommandPalette(), CommandPaletteProps, RulesManagerHandle, TAB_PRESENTATION, TabbedInterface(), TABS (+57 more)

### Community 8 - "TranslationEngineTypes.d.ts"

Cohesion: 0.07
Nodes (75): ChapterHeader, ChapterOutline, Drop, EncodingReport, FnOnce, Metadata, a_line_range_includes_blank_lines_as_empty_strings(), an_oversized_file_is_refused_before_it_is_read() (+67 more)

### Community 9 - "Translator.jsx"

Cohesion: 0.11
Nodes (26): ADR-0024, useAppearanceVersion(), ColumnMetrics, useColumnMetrics(), PanelSyncHandle, SyncPanel, usePanelSync(), UsePanelSyncOptions (+18 more)

### Community 10 - "Fiction Structural Pattern Dictionaries — Implementation Plan"

Cohesion: 0.03
Nodes (73): AdaptiveBatchSizer, AppConfig, AppearanceConfig, AppearanceSettings (hook), Book Loading, ChapterOutlineStore, CharacterOnlyBridge, CharOnlyAssembly (+65 more)

### Community 11 - "Systematic Refactoring: Pure Utility Extraction"

Cohesion: 0.10
Nodes (16): ADR-0080, ErrorBoundaryProps, ErrorBoundaryState, formatMessage(), isDevelopment(), LOG_PREFIXES, Logger, LogLevel (+8 more)

### Community 12 - "TranslationEngine Internals"

Cohesion: 0.12
Nodes (40): build_comprehensive_lookup_index(), build_index_parallel(), build_index_serial(), categorize_matches(), CategorizedMatches, Dictionary, DictionaryMatch, DictionaryType (+32 more)

### Community 13 - "UtilityTypes.d.ts"

Cohesion: 0.12
Nodes (18): ADR-0003, TOAST_DURATIONS, TOAST_IDS, ToastDuration, ToastId, assertTranslationExecutionCtxShape, TranslationExecutionContext, useAutoTranslateTrigger() (+10 more)

### Community 14 - "Future Optimization Work - Deferred Integrations"

Cohesion: 0.07
Nodes (29): 1a. Add `list_fiction_pattern_dictionaries`, 1b. Add `create_structural_patterns_dictionary`, 1c. Add `rename_structural_patterns_dictionary`, 1d. Modify `rename_proper_nouns_dictionary` — cascade, 1e. Register in `lib.rs`, Design Decisions (do not re-litigate), Fiction Structural Pattern Dictionaries — Implementation Plan, File: `src/components/configuration/ConfigurationManager.tsx` (+21 more)

### Community 15 - "TranslationEngine"

Cohesion: 0.07
Nodes (11): AssertTrue, EngineInterfaceMembersExistOnTheClass, isActiveProperNounSource(), openMatchSource(), cleanupFormatting(), buildProperNounCapitalizationMap(), getTextFromTokens(), getTokenSpanForText() (+3 more)

### Community 16 - "Content Security Policy (CSP) and WASM Security"

Cohesion: 0.14
Nodes (18): ClickableOriginalSemantic(), ClickableTranslationSemantic(), HighlightableSegment, HighlightableSegmentProps, BaseSegment, renderSegmentedContent(), RenderSegmentedContentOptions, ClickableTranslationOptimized() (+10 more)

### Community 17 - "Tauri Backend Security Audit"

Cohesion: 0.17
Nodes (6): ActiveRun, RunContext, RunOptions, TranslationCancelledError, TranslationRunner, TranslationTimeoutError

### Community 18 - "Future Improvements Implementation - 2026-02-01"

Cohesion: 0.13
Nodes (20): EnhancedVirtualizedDictionaryTable(), numberFormat, EntryTypeCells(), SemanticTypeFilterChips(), EMPTY_DRAFT, RulesManager, FilterDimensionRow(), FilterDimensionRowProps (+12 more)

### Community 19 - "WASM Code Review Fixes - 2026-01-28"

Cohesion: 0.13
Nodes (4): ExtendedCacheStats, LRUCache, LRUCacheStats, LRUNode

### Community 20 - "Test Coverage Improvements Summary"

Cohesion: 0.10
Nodes (41): BinaryToggleChips(), NewRuleModal(), RuleMatchesModal(), RuleRow(), assertNoConflict(), conflictError(), generateTransformRuleId(), NO_RULES (+33 more)

### Community 21 - "WASM Serialization Optimization Implementation Plan"

Cohesion: 0.07
Nodes (40): EngineContext, EngineProvider(), identityOf(), NO_BOOKS, ReaderTab(), ReaderTabProps, rememberReading(), useAppConfig() (+32 more)

### Community 22 - "WASM Dictionary Trie - Final Summary & Decision"

Cohesion: 0.12
Nodes (16): Addendum (2026-09-26): the revisit trigger fired — answered with ownership, not a registry, Addendum (2026-09-28): handlers keyed by action type — still not a registry, ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler, Alternative 1: Full HotkeyRegistry ✗ Rejected, Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected, Alternative 3: Keep useHotkeyHandler ✅ Selected, Alternatives Considered, Consequences (+8 more)

### Community 23 - "Number Processing Phase - Code Review Fixes"

Cohesion: 0.17
Nodes (41): Into, create_fiction_dictionary_pair(), create_proper_nouns_dictionary(), create_structural_patterns_dictionary(), create_structural_patterns_dictionary_impl(), DictionaryResponse, export_dictionaries(), get_app_data_dir() (+33 more)

### Community 24 - "Troubleshooting Guide"

Cohesion: 0.10
Nodes (15): UseReadingAnchorOptions, ReadingPosition, AnchorVirtualizer, computeAnchor(), DETACHED_INPUTS, isAnchorInPlace(), MODIFIER_KEYS, ReadingAnchor (+7 more)

### Community 25 - "Memory Leak Prevention"

Cohesion: 0.07
Nodes (30): MEMORY_THRESHOLDS, MemoryThresholds, UI_UPDATE_THRESHOLDS, UIUpdateThresholds, DEVICE_MEMORY_LIMITS, DICTIONARY_LOOKUP, getAdaptiveMaxSegments(), MEMORY_MANAGEMENT (+22 more)

### Community 26 - "PerformanceMonitoringTypes.d.ts"

Cohesion: 0.25
Nodes (7): Background for the Implementer, Final Verification, How pattern-within-pattern type checking works today, Key files and line numbers, Pattern Semantic Type Implementation Plan, Running tests, The fix

### Community 27 - "Code Review Fixes - 2026-02-01 (Second Review)"

Cohesion: 0.07
Nodes (21): CharacterOnlyResult, DictionaryManagerConfig, DictionaryPriorities, PatternProcessingSettings, ProperNounSource, SemanticArrayBuilderConfig, TranslationConsumedSource, TranslationEngine (+13 more)

### Community 28 - "Development Guide"

Cohesion: 0.18
Nodes (10): Automated Testing, Conclusion, Dictionary Memory Management Fixes - 2026-02-03, Executive Summary, Issues Fixed, Manual Testing, Memory Impact, Overview (+2 more)

### Community 29 - "lookup_index_engine.rs"

Cohesion: 0.12
Nodes (16): Architecture / Extraction, Before asserting, CSS / UI Components, Engine and pipeline tests, Environment / Tooling (RTK, Edit, Bash), Fake timers and async ordering, Gotchas Reference, Imports and naming traps (+8 more)

### Community 30 - "PatternProcessingTypes.d.ts"

Cohesion: 0.05
Nodes (47): App(), AppContent(), NOTE: WASM singleton cleanup intentionally NOT called from App unmount., AppearanceManager(), FIELD_GROUPS, FieldConfig, FieldGroup, FontControlGroupProps (+39 more)

### Community 31 - "TypeScript/Rust Optimization Progress Report"

Cohesion: 0.27
Nodes (8): HighlightingState, useHighlightingState(), UseHighlightingStateResult, highlightingReducer(), INITIAL_HIGHLIGHTING_STATE, isValidUnitIndex(), REQUIRED_PROPERTIES, MAX_SAFE_SEGMENTS

### Community 32 - "Code Review Fixes - Implementation Summary"

Cohesion: 0.15
Nodes (22): BindingBanner(), BindingBannerProps, BindingDialog(), ChapterPanel(), ChapterPanelProps, BindingOffer, UseBindingOfferOptions, Chapters (+14 more)

### Community 33 - "Pattern Processing Code Review Fixes"

Cohesion: 0.29
Nodes (7): 1. ✅ Local-Only WASM Loading (CRITICAL), 2. Binary hashing and module-structure checks: removed (2026-10-06, ADR-080), 4. ✅ Instance Method Verification, 5. ✅ Graceful Degradation, 6. ✅ Retry Logic with Exponential Backoff, 7. ✅ No Dynamic WASM Loading, Security Mitigations

### Community 34 - "Clickable Highlighting - Code Review Fixes Summary"

Cohesion: 0.10
Nodes (21): Attack Scenarios (If Exploited), Attack Vector Analysis, Comparison to CSP Best Practices, Configuration Location, Content Security Policy (CSP) and WASM Security, External Resources, Future Improvements, Internal Documentation (+13 more)

### Community 35 - "TranslationEngine.js"

Cohesion: 0.14
Nodes (23): CHAPTER_PATTERN_IDS, BookObservations, emptyBookRecord(), ReaderAnswerField, booksFile, EMPTY_RECORDS, OpenedBookObservations, parseRecords() (+15 more)

### Community 36 - "Dictionary Trie Integration Session Summary"

Cohesion: 0.05
Nodes (67): ADR-0014, CommitFailure, describeFreshFailure(), describeOperationError(), describeReplayFailure(), Feedback, withHalfApplied(), DictionaryRename (+59 more)

### Community 37 - "System Architecture"

Cohesion: 0.09
Nodes (29): DictionaryContext, DictionaryContextValue, DictionaryProvider(), DictionaryProviderProps, invokeEngineInvalidator(), ADR-0005, ADR-0053, ADR-0055 (+21 more)

### Community 38 - "memory_management.rs"

Cohesion: 0.17
Nodes (21): Box, PatternMatchResult, index_selects_the_same_best_match_as_scanning_every_pattern(), matches_the_literal_run_immediately_before_the_variable(), PatternProcessingResult, resets_at_an_earlier_variable_keeping_only_the_run_immediately_before_var_idx(), returns_zero_when_before_pos_is_zero(), returns_zero_when_the_preceding_tokens_do_not_end_with_the_literal_run() (+13 more)

### Community 39 - "Punctuation Spacing Debug Session - 2026-02-02"

Cohesion: 0.29
Nodes (6): baselinePath, errors, { maxWarnings }, results, root, warnings

### Community 40 - "useDictionaryCRUD.ts"

Cohesion: 0.12
Nodes (40): a_bare_arabic_line_amid_prose_is_not_mistaken_for_a_header(), a_book_with_no_structure_elects_nothing_but_still_reports_every_candidate(), a_later_pattern_more_than_near_tie_finer_still_wins(), a_near_tie_goes_to_the_earlier_pattern(), a_pattern_below_the_regularity_threshold_never_wins_even_with_a_smaller_median(), an_exact_median_tie_is_broken_by_declaration_order(), build_headers(), ChapterHeader (+32 more)

### Community 41 - "EnhancedVirtualizedDictionaryTable.tsx"

Cohesion: 0.06
Nodes (35): eslint, eslint-config-prettier, @eslint/js, eslint-plugin-import, eslint-plugin-react-refresh, globals, husky, jsdom (+27 more)

### Community 42 - "DictionaryManager"

Cohesion: 0.07
Nodes (30): compilerOptions, allowJs, baseUrl, checkJs, forceConsistentCasingInFileNames, jsx, lib, module (+22 more)

### Community 43 - "Implementation Log"

Cohesion: 0.20
Nodes (17): BandGeometry, ChunkPlanOptions, clamp(), clampRange(), computeBands(), isBlankLine(), isParagraphBreak(), isParagraphComplete() (+9 more)

### Community 44 - "Code Review Fixes - Translation Process"

Cohesion: 0.10
Nodes (10): checkVariableStructure(), checkVariableSymmetry(), countVariableOccurrences(), extractPatternVariables(), validatePatternVariables(), calculatePatternPriority(), PATTERN_VARIABLE_LETTERS, PatternTemplateEngine (+2 more)

### Community 45 - "DictionaryEngine"

Cohesion: 0.15
Nodes (22): ADR-0045, useBookBinding(), useEngine(), BookReader(), BindingButton(), BindingNotices(), BookBindingDialog(), BookBindingDialogProps (+14 more)

### Community 46 - ".translateWithProgressiveBatches"

Cohesion: 0.21
Nodes (7): PANELS, tryRestoreScrollPositions(), useScrollPositionManager(), AttemptFn, RecoveryOptions, ScrollPositionRecovery, ScrollPositions

### Community 47 - "CSP Hardening Migration - Complete Summary"

Cohesion: 0.18
Nodes (27): I, PhaseAResult, build_result(), build_result_matches_the_shared_fixture(), find_best_pattern_match(), find_best_pattern_match_iter(), Fixture, FixtureCase (+19 more)

### Community 49 - "FallbackManager"

Cohesion: 0.40
Nodes (5): artifact, GENERATED, newestMtime(), newestSource, root

### Community 51 - "Task 1: Add Semantic column to Patterns dictionary table"

Cohesion: 0.09
Nodes (22): Analyze Performance Baselines, Architectural restructuring, Cache Invalidation, Cache Management, Check Cache Performance, Check Real Memory Usage, Common Profiling Targets, Failed Patterns (Avoid) (+14 more)

### Community 52 - "ComponentTypes.d.ts"

Cohesion: 0.09
Nodes (23): Cross-panel highlight picks wrong duplicate-char instance, 2026-08-26, Development Process Lessons, Error Handling Patterns, Lesson 1: Verify Execution Before Fixing Logic, Lesson 2: Test Production Builds During Development, Lesson 3: Type Boundaries Need Explicit Contracts, Lesson 4: Follow Existing Patterns, "màu" split into "mà" + "u" (Jan 2025) (+15 more)

### Community 53 - "UITypes.d.ts"

Cohesion: 0.11
Nodes (22): ADR-0043, EngineContextValue, EngineInitOutcome, assembleBatch(), OutlineTranslations, packBatches(), useOutlineTranslations(), UseOutlineTranslationsOptions (+14 more)

### Community 55 - "DuplicateAnalyzer.ts"

Cohesion: 0.33
Nodes (5): ADR-048: Generic Proper-Noun Dictionaries Get Paired Pattern Dictionaries Too, Consequences, Context, Decision, Reason

### Community 56 - "Code Review Fixes - February 1, 2026"

Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, allowSyntheticDefaultImports, alwaysStrict, checkJs, emitDecoratorMetadata, esModuleInterop, experimentalDecorators (+20 more)

### Community 57 - "EventTypes.d.ts"

Cohesion: 0.15
Nodes (24): bench_large_token_array(), bench_pattern_competition(), bench_phase_a_processing(), bench_single_pattern_match(), bench_two_phase_processing(), create_token(), Criterion, test_full_dictionary_parsing() (+16 more)

### Community 58 - "Handoff: Shared WASM Module Panic Cascade"

Cohesion: 0.06
Nodes (35): 2026-01-31 - Session 1 (Infrastructure + Analysis), Architectural Constraints (from CLAUDE.md):, Baseline Measurements (Before Optimizations), Detailed Optimization Tracking, Development Tools:, Documentation:, For Each Optimization:, Future Optimization Ideas: (+27 more)

### Community 59 - "DictionaryTypes.ts"

Cohesion: 0.13
Nodes (5): isDigitSlash(), ADR-0079, TextChunk, TextChunker, UnicodePunctuationDetector

### Community 60 - "wasm_boundary.rs"

Cohesion: 0.17
Nodes (14): PatternIndex, Default, HashMap, Self, SemanticPattern, String, Vec, test_clear_index() (+6 more)

### Community 61 - "OptimizationBenchmarks"

Cohesion: 0.08
Nodes (25): 1. Documentation Improvements, 1. `src/utils/TranslationEngine.js`, 1. Understanding Code Flow is Critical, 2. Add Execution Path Diagrams, 2. `src/utils/PunctuationProcessor.ts`, 2. Understanding When Functions Are Called, 3. Lightweight Always-On Logging, 3. `src/utils/TextChunker.js` (+17 more)

### Community 62 - "SemanticPatternProcessor.js"

Cohesion: 0.27
Nodes (11): bench_real_dictionary_chunks(), bench_variable_pattern_clone(), create_token(), default_patterns_path(), load_processor(), Criterion, Option, String (+3 more)

### Community 63 - "Phase 8 Tests - Pattern Matching Validation"

Cohesion: 0.07
Nodes (26): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, app, security, windows (+18 more)

### Community 64 - "ToastContext.tsx"

Cohesion: 0.09
Nodes (12): NumberProcessor, addNumberVariables(), isNumeralToken(), isUntranslated(), NUMERAL_CHARS, NUMERAL_VALUES, patternsUseNumberVariable(), SMALL_NUMBER_WORDS (+4 more)

### Community 65 - "TextTokenizer.ts"

Cohesion: 0.21
Nodes (13): M, R, append(), appending_creates_the_folder_and_keeps_earlier_lines(), format_line(), on_web_content_terminated(), record(), record_launch() (+5 more)

### Community 67 - "useHighlightingState.ts"

Cohesion: 0.14
Nodes (23): K, MutexGuard, Q, a_get_protects_an_entry_from_eviction(), a_miss_leaves_no_trace(), a_poisoned_lock_is_reported_once_cleared_and_usable_again(), cache(), evicts_the_least_recently_set_entry() (+15 more)

### Community 68 - "tauriAPI.ts"

Cohesion: 0.10
Nodes (37): react, DuplicateDictionaryTableView(), DuplicateDictionaryTableViewProps, entryPatcher(), EntrySemanticCell(), EntryVarCell(), PatchEntry, digitOf() (+29 more)

### Community 69 - "WasmProcessorLifecycle.js"

Cohesion: 0.08
Nodes (37): DictionaryManager(), DictionaryTableView(), DictionaryTableViewProps, getHeaderColumns(), HeaderColumn, EnhancedVirtualizedDictionaryTableProps, EntryContextMenu(), EntryContextMenuProps (+29 more)

### Community 70 - "HookTypes.d.ts"

Cohesion: 0.08
Nodes (24): clipboard-manager:allow-read-text, clipboard-manager:default, core:default, dialog:allow-message, dialog:allow-open, dialog:allow-save, dialog:default, fs:allow-copy-file (+16 more)

### Community 71 - "DictionaryContext.tsx"

Cohesion: 0.24
Nodes (3): orderChunksByDistance(), FillEngineCalls, WindowFiller

### Community 72 - "text_assembly.rs"

Cohesion: 0.33
Nodes (5): ADR-075: Delete the Persisted Trie Cache, Consequences, Context, Decision, Evidence

### Community 73 - "SemanticTypes.ts"

Cohesion: 0.11
Nodes (10): needsSpaceCharOnly(), punctuationProcessor, SpacingToken, ChunkPostProcessor, PunctuationProcessor, SpecialPattern, QUOTE_CATEGORIES, QUOTE_TYPES (+2 more)

### Community 74 - "Code Review: Pure Computation Migration to wasm-core"

Cohesion: 0.11
Nodes (14): fireCascadeRetire(), _handlers, registerCascadeHandler(), initializeWasmPatternProcessor(), lifecycle, processTokensWasm(), reinitializeWasmPatternProcessor(), retireWasmPatternProcessorOnSharedPanic() (+6 more)

### Community 75 - "SelectionMapping.ts"

Cohesion: 0.12
Nodes (10): PatternToken, PatternTokenType, PatternVariable, PRIORITY_WEIGHTS, PriorityBreakdown, NOTE: Both patterns have same length (3 tokens); whichever pattern is, PrecomputedTokenStrings, classifyVariableType() (+2 more)

### Community 76 - "TwoPhasePatternProcessor"

Cohesion: 0.29
Nodes (6): ADR-052: Dictionary Edit Commits — One Queue, TypeScript Write-Back, Alternatives considered, Consequence, Context, Decision, Reasoning

### Community 77 - "wasmOperationTimeout.js"

Cohesion: 0.19
Nodes (14): LinePiece, fillSegmentGaps(), fillSegmentGapsCached(), EMPTY_PANEL_ROWS, Panel, PanelRowsSnapshot, partlyLandedRow(), ProjectedChunk (+6 more)

### Community 78 - "WasmRegexUtilsWrapper"

Cohesion: 0.33
Nodes (5): ADR-083: Delete the WASM Conflict Resolution Tier, Consequence, Context, Decision, Reasoning

### Community 79 - "TranslatorControls.tsx"

Cohesion: 0.19
Nodes (16): AppearanceResult, BatchDictionaryResponse, BatchDictionaryResult, BookRecordsResult, ConfigurationResult, DictionaryCreateResult, DictionaryLoadResult, DictionaryOperationResult (+8 more)

### Community 80 - "SmartMemoryCoordinator"

Cohesion: 0.29
Nodes (9): TranslatedChunk, bridgeGlossSegments(), PositionedSegment, SegmentedChunk, CachedChunk, ChunkPlan, chunkText(), FillEvent (+1 more)

### Community 81 - "Task 1: Enable Semantic Type filter for Structural Patterns"

Cohesion: 0.11
Nodes (17): Dictionary JSON Format: Two Tiers, Dictionary Type Classification, `DictionaryContext.tsx` CRUD Audit Checklist, `DictionaryInfo` Name Collision, Error Handling, Fiction Pattern Merge Order Is Load-Bearing, Hook Tests — jsdom Gotchas (Dictionary-Specific), Moving Entries — One Rule, Three Enforcement Points (+9 more)

### Community 82 - "takeFromExternrefTable0"

Cohesion: 0.20
Nodes (10): AtomicU64, DictionaryCache, get_cache_key(), load_dictionary(), test_invalidate_by_id_does_not_remove_nonexistent_key(), test_invalidate_by_id_removes_exact_key_only(), test_invalidate_none_clears_all_entries(), test_invalidate_none_on_empty_cache_is_safe() (+2 more)

### Community 83 - "useDictionary"

Cohesion: 0.13
Nodes (8): ADR-0037, TwoPhasePatternProcessor, getSemanticTokens(), isSemanticTokenType(), isPatternSource(), PATTERN_SOURCES, isPatternMatchInBounds(), isWasmPatternProcessorReady()

### Community 84 - "list_dictionaries_with_prefix"

Cohesion: 0.13
Nodes (27): BatchDictionaryResponse, BatchDictionaryResult, build_lookup_index(), build_lookup_index_impl(), build_trie_from_entries(), DictionaryData, DictionaryEntry, hash_dictionary_entries() (+19 more)

### Community 85 - "Documentation Index"

Cohesion: 0.09
Nodes (22): ADR-0010, ADR-0082, LookupIndexDictionary, LookupIndexEntry, ComparableMatch, compareMatchesBySpecificityThenPriority(), DictionaryCategory, indexSource() (+14 more)

### Community 86 - "index.ts"

Cohesion: 0.29
Nodes (6): ADR-053: Unread Dictionaries Are Refused, Not Quarantined, Alternatives considered, Consequence, Context, Decision, Reasoning

### Community 87 - "WasmTextAssemblerWrapper"

Cohesion: 0.33
Nodes (5): ADR-017: Skip WasmMemoryPool Analytics Separation, Consequence, Context, Decision, Reasoning

### Community 88 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.09
Nodes (6): DictionaryManager, DictionaryTrie, TrieNode, buildTrieFromDictionary(), resolveDictionaryPriority(), TrieBuildResult

### Community 89 - "Implementation Details ✅"

Cohesion: 0.33
Nodes (5): ADR-088: Skip Moving the Cache-Invalidator Registration Into EngineProvider, Consequence, Context, Decision, Reasoning

### Community 90 - "SelectionMapping.ts"

Cohesion: 0.11
Nodes (19): CharOnlyAssemblyResult, StampedToken, applyCharOnlySupplements(), applySmartCapitalization(), capitalizeFirstLetter(), cleanFullText(), CleanupOptions, finishCharOnlyText() (+11 more)

### Community 91 - "DictionaryMatchLookup.js"

Cohesion: 0.12
Nodes (9): GroupedToken, PhraseCandidate, ProcessingStrategy, TextAnalysis, TextComplexity, TextTokenizer, Token, TokenGroups (+1 more)

### Community 92 - "MemoryLeakDetector"

Cohesion: 0.09
Nodes (22): scripts, build, build-wasm, build-wasm-dev, dev, format, format:check, lint (+14 more)

### Community 93 - "DictionaryTrieLoader.js"

Cohesion: 0.17
Nodes (10): StreamingProgressBar, StreamingProgressBarProps, StreamingState, StreamingStateForProgress, StreamingTextRenderer, StreamingTextRendererProps, StreamingTranslationDisplay, StreamingTranslationDisplayProps (+2 more)

### Community 94 - "DictionaryManager"

Cohesion: 0.33
Nodes (5): ADR-089: The Character-Only Pass Leaves Punctuation Alone, Consequence, Context, Decision, Reasoning

### Community 95 - "RegexUtils"

Cohesion: 0.18
Nodes (6): Intl, SegmentData, Segmenter, SegmenterConstructor, SegmenterOptions, Segments

### Community 96 - "TranslationProfiler"

Cohesion: 0.10
Nodes (20): Expected Output, Failure Case:, How to Run Tests, Next Steps, "No match found", Notes, Option 1: Browser Console - Simple Test (Recommended), Option 2: Add to App Code (+12 more)

### Community 97 - "DictionaryWasmLookup"

Cohesion: 0.23
Nodes (15): PatternMetadata, PatternToken, PatternUsage, Default, HashMap, Option, Self, String (+7 more)

### Community 98 - "TokenHelpers.ts"

Cohesion: 0.13
Nodes (32): SemanticTypePickerProps, PATTERN_SEMANTIC_TYPE_REFS, PatternSemanticTypeRef, SEMANTIC_TYPES, SemanticType, DictionaryEntryFormDeps, DictionaryEntryFormState, useDictionaryEntryForm() (+24 more)

### Community 99 - "SemanticArrayBuilder.ts"

Cohesion: 0.23
Nodes (9): DebugInfo, MemoryStats, PerformanceStats, PositionCandidate, NOTE: Does NOT write metadata[i].translatedText — SemanticArrayMetadata omits th, SemanticArrayMetadata, SemanticArraySnapshot, SemanticArraysResult (+1 more)

### Community 100 - "WasmMemoryPool"

Cohesion: 0.33
Nodes (5): ADR-080: Delete the WASM Integrity Manifest, Consequences, Context, Decision, Reasoning

### Community 101 - "eslint-plugin-react-refresh"

Cohesion: 0.21
Nodes (14): Error, collision_message(), export_dictionaries_impl(), read_zip_entries(), PathBuf, sanitize_io_error(), test_export_empty_directory_produces_empty_zip(), test_export_errors_when_dictionary_dir_missing() (+6 more)

### Community 102 - "useTransformRules.ts"

Cohesion: 0.33
Nodes (5): ADR-090: Keep the tauriAPI Invoke Shell Narrow, Consequence, Context, Decision, Reasoning

### Community 103 - "precompute-dictionaries.js"

Cohesion: 0.11
Nodes (18): Background for the Implementer, How the patterns table currently looks (column widths), Key locations in `EnhancedVirtualizedDictionaryTable.tsx`, Patterns Semantic Column Implementation Plan, Running tests, Step 1: Verify baseline, Step 2: Edit 1 — Add "Semantic" header between Translation and X types, Step 3: Run type-check after Edit 1 (+10 more)

### Community 104 - "buildLookupIndexOrFallback"

Cohesion: 0.29
Nodes (6): ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation, Consequence, Context, Decision, Reasoning, What Was Done Instead

### Community 105 - "Completed Optimizations"

Cohesion: 0.17
Nodes (3): SemanticArrayBuilder, validatePosition(), assembleCharOnlyResult()

### Community 106 - ".new"

Cohesion: 0.22
Nodes (10): FixableToken, fixNumberPlusLiang(), ConsumableToken, markPhraseFollowersConsumed(), consumedSource(), ContractToken, getSourcePriority(), isConsumedSource() (+2 more)

### Community 107 - "useDictionaryConfigManagement.ts"

Cohesion: 0.40
Nodes (4): ADR-069: Delete the Baseline Regression Detector, Consequences, Context, Decision

### Community 108 - "PatternFailureTracker"

Cohesion: 0.33
Nodes (5): ADR-086: Keep ScrollPositionRecovery Separate From useScrollPositionManager, Consequence, Context, Decision, Reasoning

### Community 109 - "CacheTypes.d.ts"

Cohesion: 0.08
Nodes (25): lucide-react, dependencies, lucide-react, react, react-dom, react-resizable-panels, @tanstack/react-virtual, @tauri-apps/api (+17 more)

### Community 110 - "QuickAddTarget.ts"

Cohesion: 0.16
Nodes (18): ChapterOutlineState, ADR-0050, useChapterOutline(), UseChapterOutlineOptions, ChapterOverride, useChapters(), UseChaptersOptions, ChapterHeader (+10 more)

### Community 111 - "SemanticPatternProcessor"

Cohesion: 0.14
Nodes (13): Appearance travels as CSS variables, never as state, `ClickableTranslationOptimized` paragraph logic, Config is read and written through `appConfig.ts`, Context providers, Engine lifecycle — `EngineContext` / `useEngine()`, Every tab is mounted at once, Frequently-updating values travel by ref, not by dep array, One owner per concern (+5 more)

### Community 112 - "LRUCache"

Cohesion: 0.12
Nodes (16): ADR-003: TypeScript Hybrid Architecture, Alternative 1: Full TypeScript Migration, Alternative 2: Keep Everything JavaScript, Alternative 3: Strategic Hybrid (TypeScript for Boundaries, JavaScript for Core) ✅ SELECTED, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 113 - "WasmProcessorLifecycle"

Cohesion: 0.43
Nodes (6): AppReadinessOverlay(), AppReadinessOverlayProps, pickStatus(), stageClass(), stageIcon(), StageStatus

### Community 114 - "src/components — Gotchas"

Cohesion: 0.33
Nodes (5): ADR-062: Pair Operations Share the Binding Queue, and the Configuration Tab Reads the Dictionary Store's List, Alternatives considered, Consequence, Context, Decision

### Community 115 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.12
Nodes (16): ADR-002: Dual-Path Clickable Highlighting Architecture, Alternative 1: Consolidate Into Unified Highlighting System, Alternative 2: Keep Separate Paths (Current Implementation) ✅ SELECTED, Alternative 3: Partial Consolidation (Helper Functions), Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 116 - "configValidation.ts"

Cohesion: 0.12
Nodes (16): ADR-004: 5-Phase Processing Order Immutability, Alternative 1: Reorder Phases for Performance, Alternative 2: Parallel Processing (All Phases Simultaneously), Alternative 3: Keep Current Sequential Order (Patterns First) ✅ SELECTED, Alternatives Considered, Architectural Implications, Consequences, Context and Problem Statement (+8 more)

### Community 117 - "Hotfix: Missing Method Safety Checks"

Cohesion: 0.12
Nodes (15): ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors, Alternative 1: Copy-fix across all three processors ✗ Rejected, Alternative 2: Base class / mixin for WASM processors ✗ Rejected, Alternative 3: WasmProcessorLifecycle class ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+7 more)

### Community 118 - "useDictionaryConfigManagement.ts"

Cohesion: 0.50
Nodes (4): ConflictCandidate, resolveGlobalConflicts(), ADR-0083, typePriority()

### Community 119 - "Security Considerations"

Cohesion: 0.20
Nodes (9): Apparent status is not real status, Build profile, dev binary, and WASM-only panics, Building a new WASM boundary validator? Check `Option<T>` first, Every gate in the pattern pipeline fails silently, Phase A composite-coverage scoring, Test placement, This crate is a parity mirror, and every divergence truncates silently, Toolchain posture (+1 more)

### Community 120 - "translation_wasm_core.d.ts"

Cohesion: 0.12
Nodes (15): ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation, Alternative 1: Keep inline mutation per adapter ✗ Rejected, Alternative 2: Return results, single apply site ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants, Decision (+7 more)

### Community 121 - "ElectronTypes.d.ts"

Cohesion: 0.13
Nodes (14): ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext, Alternative 1: Move cache invalidation to `DictionaryContext` ✗ Rejected, Alternative 2: Keep invalidation in `handleForceReload` ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants, Decision (+6 more)

### Community 122 - "pattern.rs"

Cohesion: 0.14
Nodes (32): BookBindingContext, BookBindingContextValue, BookBindingProvider(), ADR-0062, bindingConfigFields(), BookBindingDeps, BookBindingSnapshot, BookBindingStore (+24 more)

### Community 123 - "useHighlightingState.ts"

Cohesion: 0.13
Nodes (21): ADR-0090, BookReaderProps, EncodingPromptProps, EncodingChoiceState, OpenState, callTauriCommand(), CMD, LookupIndexResult (+13 more)

### Community 124 - "jsdom"

Cohesion: 0.33
Nodes (5): ADR-039: Skip Splitting `useDictionaryEntryForm`, Consequence, Context, Decision, Reasoning

### Community 125 - "useCharacterOnlySegments.ts"

Cohesion: 0.33
Nodes (5): ADR-054: Skip a Book Record Field Schema, Consequence, Context, Decision, Reasoning

### Community 126 - "eslint-plugin-react"

Cohesion: 0.67
Nodes (3): node, react-dom, types

### Community 127 - "Security Mitigations"

Cohesion: 0.33
Nodes (5): ADR-079: Delete the WASM Assembler, Chunker and Tokenizer Tiers, Consequences, Context, Decision, Evidence

### Community 128 - "Chinese-Vietnamese Translation App"

Cohesion: 0.33
Nodes (6): Architecture, Chinese-Vietnamese Translation App, Critical Constraints, Essential Commands, graphify, Where Everything Else Lives

### Community 130 - "Design"

Cohesion: 0.13
Nodes (14): ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential, Consequences, Context and Problem Statement, Decision, If Startup Latency Becomes a Problem, Implementation, Monitoring and Review, Negative (+6 more)

### Community 131 - "V8OptimizationTypes.d.ts"

Cohesion: 0.13
Nodes (14): ADR-005: Eager Dictionary Loading via DictionaryContext, Alternative 1: Complete the LazyDictionaryContext migration ✗ Rejected, Alternative 2: Keep eager loading, delete LazyDictionaryContext ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+6 more)

### Community 132 - "ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error"

Cohesion: 0.14
Nodes (13): ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error, Alternative 1: Restore JS fallback in `TwoPhasePatternProcessor` ✗ Rejected, Alternative 2: Extract `WasmPatternBridge` seam ✗ Rejected, Alternative 3: Throw on `{ success: false }`, no bridge ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+5 more)

### Community 133 - "SemanticArrayBuilder"

Cohesion: 0.14
Nodes (13): ADR-011: Skip useTranslatorSession Coordinator Hook, Alternative 1: Extract useTranslatorSession ✗ Rejected, Alternative 2: Keep coordination in Translator.jsx ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+5 more)

### Community 134 - "wasmIntegrityVerifier.js"

Cohesion: 0.14
Nodes (13): Background for the Implementer, Current flag (line ~1915), Patterns Semantic Type Filter Implementation Plan, Running checks, Step 1: Verify baseline, Step 2: Make the change, Step 3: Run type-check, Step 4: Run full test suite (+5 more)

### Community 135 - "ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader"

Cohesion: 0.29
Nodes (6): ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader, Consequence, Context, Decision, Not done, Reasoning

### Community 138 - "vite"

Cohesion: 0.23
Nodes (19): assembleTranslatedLines(), chunkLinePieces(), ChunkLineRange, chunkLineRanges(), linePieceCache, linePieces(), orderChunksByLine(), rangeText() (+11 more)

### Community 139 - "CRITICAL-3: TranslationCache - O(n) Cache Invalidation"

Cohesion: 0.20
Nodes (7): Default, JsValue, Result, Self, String, TwoPhasePatternProcessor, WasmPatternProcessor

### Community 140 - "NumberVariable.js"

Cohesion: 0.33
Nodes (5): ADR-081: Skip Wire-Shape Parity for the Reader IPC Payloads, Consequence, Context, Decision, Reasoning

### Community 142 - "Resolved Bug Postmortems"

Cohesion: 0.08
Nodes (59): ADR-0060, ConfigurationManager(), TierMenu(), TierMenuProps, ADR-0027, ADR-0048, ADR-0062, useDictionaryConfigManagement() (+51 more)

### Community 143 - "WordTransformToolbar.tsx"

Cohesion: 0.15
Nodes (12): lint-staged, *.{js,jsx,ts,tsx}, _.{js,jsx,ts,tsx,css,json,md}, src/\**/_.{ts,tsx}, name, packageManager, private, type (+4 more)

### Community 145 - "ParallelConfig"

Cohesion: 0.22
Nodes (10): BaseSegment, ClickableOriginalSemanticProps, ClickableSegment, ClickableTranslationOptimizedProps, ClickableTranslationSemanticProps, ClickDirection, PrebuiltSegment, SegmentClickHandler (+2 more)

### Community 146 - "package.json"

Cohesion: 0.17
Nodes (11): PatternMatchResult, PatternMetadata, PatternProcessingOptions, PatternProcessorAdapter, PatternProcessorResult, PatternToken, PatternTokenType, PatternUsageStats (+3 more)

### Community 147 - "PatternFailureTracker"

Cohesion: 0.33
Nodes (5): ADR-082: One Seam for "Dictionary Matches at a Token" — MatchSource, Consequence, Context, Decision, Reasoning

### Community 148 - "ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext"

Cohesion: 0.15
Nodes (13): Active ADRs, [ADR-001: WASM Batch Loading — Remove Batch Wrapper](./ADR-001-wasm-batch-loading-failure.md), [ADR-002: Dual-Path Clickable Highlighting](./ADR-002-dual-path-clickable-highlighting.md), [ADR-003: TypeScript Hybrid Architecture](./ADR-003-typescript-hybrid-architecture.md), [ADR-004: 5-Phase Processing Order Immutability](./ADR-004-five-phase-processing-order-immutability.md), [ADR-006: PatternProcessor Interface](./ADR-006-pattern-processor-interface.md), ADR Format, All other ADRs (+5 more)

### Community 149 - "ADR-062: Pair Operations Share the Binding Queue, and the Configuration Tab Reads the Dictionary Store's List"

Cohesion: 0.33
Nodes (5): ADR-051: The Reader's Quick-Add Is the Shared Add Form, Not a Floating Bar, Consequence, Context, Decision, Reasoning

### Community 150 - "appearanceConfig.ts"

Cohesion: 0.08
Nodes (35): create_proper_noun_file(), emit_poisoning_event(), id_rules_fixture(), init_app_handle(), list_dictionaries_with_prefix(), now_ms(), record_mutex_poisoning(), substitute_dictionary_reference() (+27 more)

### Community 151 - "TranslationChunkCache.ts"

Cohesion: 0.33
Nodes (5): ADR-046: Keep `BookReader`'s Master-Scroll Composition and Refill Ref, Consequence, Context, Decision, Reasoning

### Community 152 - "PrecomputedTrieStats"

Cohesion: 0.14
Nodes (17): BlobKind, check_json_depth(), deeply_nested_json(), load_json_file_with_default(), quarantine_json_file(), Value, test_blob_kind_filenames_are_distinct(), test_blob_load_save_round_trip_for_every_kind() (+9 more)

### Community 153 - "Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`"

Cohesion: 0.17
Nodes (12): **/_.spec.js, \**/_.spec.ts, **/_.spec.tsx, \**/_.test.js, **/_.test.ts, \**/_.test.tsx, exclude, build (+4 more)

### Community 154 - "ModalErrorBoundary"

Cohesion: 0.22
Nodes (3): ModalErrorBoundary, ModalErrorBoundaryProps, ModalErrorBoundaryState

### Community 155 - "DictionaryTypes.ts"

Cohesion: 0.10
Nodes (15): ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init, Consequences, Context, Decision, Reason, ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name, Consequences, Context (+7 more)

### Community 156 - "WasmProcessorLifecycle"

Cohesion: 0.25
Nodes (7): A required field added to a shared type lands silently in every test fixture, Clickable highlighting is chunk-scoped, and a row's runs must equal its plain text, Cross-panel sync is line-indexed and one-way, Records read after a write must be read settled, src/utils/reader — Gotchas, The binding is the authority; the config keys it writes are a cache, Windowed translation is four seams that must stay wired together

### Community 158 - "ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`"

Cohesion: 0.33
Nodes (5): ADR-060: Dictionary-Id and Config-Key Rules Are Held by a Shared Fixture; Rust Keeps Editing Config, Consequence, Context, Decision, Reasoning

### Community 159 - ".processCharacterOnlyTokens"

Cohesion: 0.29
Nodes (7): Fixture, FixtureCase, is_lowercase(), is_variable_at(), is_variable_at_matches_the_shared_fixture(), String, Vec

### Community 160 - "ADR-065: Keep Dictionary Reload Owned by the Translator, Behind the Registry"

Cohesion: 0.33
Nodes (5): ADR-065: Keep Dictionary Reload Owned by the Translator, Behind the Registry, Consequence, Context, Decision, Reasoning

### Community 163 - "WasmDictionaryAdapter"

Cohesion: 0.33
Nodes (5): ADR-068: One LRU Module Under Both Dictionary Caches, Consequence, Context, Decision, Reasoning

### Community 164 - "@types/node"

Cohesion: 0.25
Nodes (8): Book Records, Chapters, Reader Commands, Reader Engine Calls, Reader Panels, Reader Tab, Reading Anchor, Window Filler

### Community 165 - "LookupIndexBuilder.ts"

Cohesion: 0.33
Nodes (5): ADR-071: Backend Modules Exist Where There Is a Protocol; One-Shot IPC Stays on `window.electronAPI`, Consequence, Context, Decision, Reasoning

### Community 166 - "ReadonlyOptimizationUtils.js"

Cohesion: 0.24
Nodes (3): DebouncedProgressHandler, ProgressCallbacks, ProgressData

### Community 168 - "High-Priority Issues 🟠"

Cohesion: 0.18
Nodes (10): Category 1: Future Integration APIs (18 warnings), Category 2: Helper/Utility Methods (8 warnings), Category 3: Dead Code from Earlier Phases (3 warnings), Compilation Warnings - Explained, Current Status, Fixed Warnings (7 total), Remaining Warnings (29 total) - All Expected, Summary (+2 more)

### Community 170 - "wasm-core Pattern Processor"

Cohesion: 0.20
Nodes (9): Constraints, Design, Design: Semantic Type for Structural Pattern Entries, Files Touched, Problem, Section 1 — Data Model, Section 2 — Translation Engine: WASM (primary fix), Section 3 — Translation Engine: JS cross-pass fix (+1 more)

### Community 171 - "text_chunker.rs"

Cohesion: 0.36
Nodes (9): bench_trie_vs_aho_corasick(), build_corpus(), build_dictionary(), cjk_pool(), Lcg, Criterion, String, TrieNode (+1 more)

### Community 172 - "getStringFromWasm0"

Cohesion: 0.22
Nodes (8): AppConfiguration, AppearanceSettings, DictionaryInfo, DictionaryTypeDefinition, DictionaryTypesCollection, FontSettings, TabId, Theme

### Community 173 - "DictionaryTabNavigation.ts"

Cohesion: 0.23
Nodes (15): Bookshelf(), formatBinding(), formatChapterCount(), formatProgress(), formatSize(), loadShelfLayout(), NO_BOOKS, NO_UNAVAILABLE (+7 more)

### Community 176 - "ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation"

Cohesion: 0.33
Nodes (6): ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation, Consequences, Context, Decision, Reason, Supersession Note (2026-07-28)

### Community 177 - "ADR-018: Unified PerformanceReport State in usePerformanceMonitoring"

Cohesion: 0.33
Nodes (5): ADR-058: Delete the Runtime WASM Parity Validation; Parity Lives in Tests, Consequence, Context, Decision, Reasoning

### Community 178 - "AI Readiness Evaluation: chinese-translator-tauri"

Cohesion: 0.22
Nodes (8): ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline, Alternative 1: Extract to `TokenStringCache.ts` with DI ✗ Rejected, Alternative 2: Keep inline ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Supersession Note (2026-07-28)

### Community 179 - "3. Performance Optimizations ⭐⭐⭐⭐⭐"

Cohesion: 0.18
Nodes (10): Addendum 2026-09-29, Addendum 2026-10-04, ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider, Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected, Alternative 2: Extract loadInitialState only ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement (+2 more)

### Community 180 - "PrecomputedTrieStats"

Cohesion: 0.22
Nodes (8): Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected, Addendum — 2026-07-17d: Cluster deleted, not fixed, ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine, Consequence, Context, Decision, Reasoning, What Was Done Instead

### Community 182 - "FallbackManager"

Cohesion: 0.33
Nodes (5): ADR-024: Do Not Move Style Objects into useAppearanceSettings, Context, Decision, Reason, Revisit condition

### Community 183 - "text_tokenizer.rs"

Cohesion: 0.22
Nodes (8): Column header, Design, Design: Semantic Column in Patterns Dictionary Table, Files Touched, No new components, Problem, Row cell, Width adjustment

### Community 184 - "ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline"

Cohesion: 0.22
Nodes (8): vite.config.ts, compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 185 - "jsdom"

Cohesion: 0.33
Nodes (5): ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider, Consequence, Context, Decision, Reasoning

### Community 187 - "wasmOperationTimeout.js"

Cohesion: 0.20
Nodes (9): Reader Corpus Tests, Rust Arithmetic, Rust String Lengths, Tauri Backend + WASM Core — Gotchas, Tauri Command Security, WASM-Bridged Structs, wasm-core Architecture, WASM `&mut self` Borrow Rule (Rust 1.84+) (+1 more)

### Community 188 - "appFile.ts"

Cohesion: 0.33
Nodes (5): ADR-070: Skip a Shared WASM-Call-or-Fallback Shell; Delete the Unread Wrapper Stats, Consequence, Context, Decision, Reasoning

### Community 189 - "appearanceConfig.ts"

Cohesion: 0.33
Nodes (5): ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods, Context, Decision, Reason, When to Revisit

### Community 190 - "IncrementalDictionarySorter"

Cohesion: 0.22
Nodes (8): ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable, Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected, Alternative 2: Keep coordination in TranslationEngine ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Update (2026-10-03)

### Community 192 - "WindowedTranslationFill.ts"

Cohesion: 0.25
Nodes (7): Addendum (2026-10-02), Addendum (2026-10-03), ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory, Alternatives considered, Consequence, Context, Decision

### Community 194 - "Integration #3: V8 Optimization for Memory Tracking (Task #8)"

Cohesion: 0.17
Nodes (11): Alpha-Blended Highlight Colors Need a Separate Dark-Mode Check, Animations and Keyframes, `<button>` Inherits index.css's Global Reset, Not Just `display:inline-flex`, Class Name Collisions, Cross-Component Reuse, File Placement, Grid Rows Aren't Shared Across Sibling Grid Containers, Hiding Elements — Use Conditional Rendering, Not `visibility: hidden` (+3 more)

### Community 195 - "eslint-plugin-unused-imports"

Cohesion: 0.22
Nodes (9): CI/CD Pipeline, Development Debugging Tools, Development Guide, Fallow Dead-Code Analysis, Gotchas Reference, Logging, Production Build Requirements, Related Guides (+1 more)

### Community 196 - "@types/node"

Cohesion: 0.14
Nodes (6): DictionaryValue, FlatDictionaryEntry, flattenDictionaryEntries(), ADR-0087, DictionaryMatchLookup, TranslationCache

### Community 197 - ".processRemainingPhrasesSequential"

Cohesion: 0.33
Nodes (5): ADR-034: Skip Building DictionaryManager.validateIntegrity(), Consequence, Context, Decision, Reasoning

### Community 198 - "TranslatorControls.tsx"

Cohesion: 0.33
Nodes (5): ADR-067: Keep Pair Operations in the Binding Store, Consequence, Context, Decision, Reasoning

### Community 199 - "DevicePerformanceDetector"

Cohesion: 0.29
Nodes (6): ADR-010: Dictionary Match Sort — Specificity Over Provenance, Alternatives Considered, Consequences, Context, Decision, Rationale

### Community 200 - "ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call"

Cohesion: 0.29
Nodes (6): ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call, Consequence, Context, Decision, Evidence, Reasoning

### Community 201 - "RustLookupIndexManager"

Cohesion: 0.25
Nodes (7): Addendum — 2026-07-18: Extends to `TwoPhasePatternProcessor`'s pattern-profiling cluster, Addendum (2026-09-26), ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface, Context, Decision, If App Callers Are Added, Reason

### Community 202 - "UnicodePunctuationDetector"

Cohesion: 0.29
Nodes (6): ADR-022: Keep streamingReducer and Initial State Constants Exported, Boundary Condition, Context, Decision, Reason, Supersession Note

### Community 203 - "Task 6: UI — add semantic type selector to pattern entries"

Cohesion: 0.25
Nodes (7): Addendum (2026-10-03), ADR-026: Do Not Move useDictionaryCRUD to src/hooks/, Context, Decision, Reason, Supersession Note (2026-06-27), When to Revisit

### Community 204 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Addendum 2026-10-07: the spec now runs a shared fixture, ADR-041: Keep `number_processor.rs` — It's a Parity Spec, Not Dead Code, Consequence, Context, Decision, Reasoning

### Community 205 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Behaviour, Change, Design, Design: Semantic Type Filter for Structural Patterns, Files Touched, Problem

### Community 206 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Chinese-Vietnamese Translator — Dev Memory, Comprehensive architecture code review — 14 issues fixed, Fixes Done (2026-02-22, session 19), Key Architectural Invariants (most frequently violated), Session History Index, Stable Project Facts

### Community 207 - "ADR-066: Skip an Active-Dictionary Snapshot Module"

Cohesion: 0.40
Nodes (4): ADR-066: Skip an Active-Dictionary Snapshot Module, Consequence, Context, Decision

### Community 208 - "ADR-024: Do Not Move Style Objects into useAppearanceSettings"

Cohesion: 0.29
Nodes (6): ADR-073: Delete the WASM Dictionary Lookup Tier, Consequence, Context, Decision, Evidence, Reasoning

### Community 209 - "ADR-043: Skip a Shared Generation-Guarded-Fill Primitive"

Cohesion: 0.40
Nodes (3): ProgressInfo, QUICK_ADD_HINTS, TranslatorControlsProps

### Community 210 - "ADR-044: Skip Splitting `ReaderTab`'s `openBook`"

Cohesion: 0.29
Nodes (6): Addendum (2026-09-26): the open book holds its whole record — decision unchanged, ADR-044: Skip Splitting `ReaderTab`'s `openBook`, Consequence, Context, Decision, Reasoning

### Community 211 - "Translation Paths Efficiency Review — 2026-02-07"

Cohesion: 0.25
Nodes (8): Detailed Fix Descriptions, Fix 5: MEDIUM-1 - Add dispose() to TranslationCache, Fix 6: Update DictionaryManager to use TranslationCache.dispose(), Impact, Impact, Problem, Solution, Solution

### Community 212 - "TranslatorControls.tsx"

Cohesion: 0.23
Nodes (13): useDictionary(), FullEntryData, hasMetadata(), MoveDialog(), MoveDialogProps, SEMANTIC_TYPE_LABELS, MoveTargetDictionary, useMoveTargetDictionaries() (+5 more)

### Community 215 - "types"

Cohesion: 0.33
Nodes (5): ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput, Context, Decision, Reason, When to Revisit

### Community 216 - "Code Quality Assessment"

Cohesion: 0.33
Nodes (5): ADR-018: Unified PerformanceReport State in usePerformanceMonitoring, Consequence, Context, Decision, Reasoning

### Community 217 - "ADR-037: Delete Orphaned WASM Boundary Validators, Keep `validateWasmDictionaryMatch`"

Cohesion: 0.33
Nodes (5): Addendum (2026-09-09) — Gap Closed, ADR-037: Delete Orphaned WASM Boundary Validators, Keep `validateWasmDictionaryMatch`, Context, Decision, Reasoning

### Community 218 - "ADR-084: Skip Merging the Reload Context Assembler Into useForceReload"

Cohesion: 0.33
Nodes (5): ADR-084: Skip Merging the Reload Context Assembler Into useForceReload, Consequence, Context, Decision, Reasoning

### Community 219 - "ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook"

Cohesion: 0.33
Nodes (5): ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook, Consequence, Context, Decision, Reasoning

### Community 220 - "generate-wasm-hashes.js"

Cohesion: 0.25
Nodes (7): ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage, Consequence, Context, Decision, Reasoning, Update (2026-08-25), Update (2026-09-08)

### Community 221 - "PatternFailureTracker"

Cohesion: 0.10
Nodes (27): ADR-0069, Translator(), useCachePoisoningGuard(), useCharacterOnlyBridge(), useClipboardTranslation(), DeferredRetranslate, useDeferredRetranslate(), UseDeferredRetranslateOptions (+19 more)

### Community 222 - "eslint-plugin-unused-imports"

Cohesion: 0.33
Nodes (5): ADR-050: One BookReader Instance per Book, Consequence, Context, Decision, Reasoning

### Community 223 - "ReadonlyOptimizationUtils.js"

Cohesion: 0.25
Nodes (7): Addendum (2026-08-25): Extending the decision to `segmentFromPositionMetadata` vs `precomputeOriginalSegments`, Addendum (2026-08-25): `precomputeSegments` deleted — this ADR's original subject no longer exists, ADR-036: Skip Unifying `precomputeSegments`/`precomputeOriginalSegments` Into a Shared Scanner, Consequence, Context, Decision, Reasoning

### Community 225 - "ADR-061: Skip a Shelf Row Module"

Cohesion: 0.33
Nodes (5): ADR-061: Skip a Shelf Row Module, Consequence, Context, Decision, Reasoning

### Community 226 - "ReadonlyOptimizationUtils.js"

Cohesion: 0.33
Nodes (5): ADR-038: Reject "Deepen RuleMatchesModal to Preview Real Output", Consequence, Context, Decision, Reasoning

### Community 227 - "appearanceConfig.ts"

Cohesion: 0.29
Nodes (6): Addendum (2026-09-30), ADR-043: Skip a Shared Generation-Guarded-Fill Primitive, Consequence, Context, Decision, Reasoning

### Community 228 - "ADR-057: Skip a ReaderSession Module"

Cohesion: 0.33
Nodes (5): ADR-057: Skip a ReaderSession Module, Consequence, Context, Decision, Reasoning

### Community 229 - "ADR-085: EngineAccess — one queue for both tabs, ownership follows the visible tab"

Cohesion: 0.33
Nodes (5): ADR-085: EngineAccess — one queue for both tabs, ownership follows the visible tab, Alternatives considered, Consequences, Context, Decision

### Community 230 - "PunctuationProcessor"

Cohesion: 0.33
Nodes (6): src/**/\*.d.ts, src/**/_.js, src/\**/_.jsx, src/**/\*.ts, src/**/*.tsx, include

### Community 232 - "System Architecture"

Cohesion: 0.33
Nodes (6): Execution Paths (Full Translation vs Character-only), Related Guides, Semantic Arrays (Clickable Highlighting), System Architecture, Token Processing Contracts (WASM-JavaScript Boundaries), WASM/JS Lookup Parity

### Community 233 - "WasmStringProcessor"

Cohesion: 0.33
Nodes (5): ADR-032: Delete PerformanceBaselineTracker's cacheHitRate Machinery, Consequence, Context, Decision, Reasoning

### Community 234 - "ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider"

Cohesion: 0.29
Nodes (6): Addendum — 2026-08-26: "Production builds its trie once and reuses it" was false, ADR-040: Reject Aho-Corasick as a Swap for the Native Lookup-Index Trie, Consequence, Context, Decision, Reasoning

### Community 235 - "ADR-050: One BookReader Instance per Book"

Cohesion: 0.33
Nodes (5): ADR-031: Skip Splitting dictionary_commands.rs by Concern, Consequence, Context, Decision, Reasoning

### Community 236 - "ADR-031: Skip Splitting dictionary_commands.rs by Concern"

Cohesion: 0.33
Nodes (5): ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup), Consequence, Context, Decision, Reasoning

### Community 237 - "ADR-078: Delete the WASM String Tier"

Cohesion: 0.29
Nodes (6): ADR-078: Delete the WASM String Tier, Consequence, Context, Decision, Evidence, Reasoning

### Community 238 - "ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name"

Cohesion: 0.33
Nodes (5): ADR-045: Skip a Shared Chapter-Structure Override Control, Consequence, Context, Decision, Reasoning

### Community 239 - "useDictionaryModals.tsx"

Cohesion: 0.18
Nodes (16): DictionaryEntryProps, CLOSED, DictionaryModals, DictionaryModalsOptions, OpenQuickAdd, QuickAddModalState, sharedShortlistMemory, useDictionaryModals() (+8 more)

### Community 240 - "ADR-049: Keep the Selection-Mapper Registry"

Cohesion: 0.33
Nodes (5): ADR-049: Keep the Selection-Mapper Registry, Consequence, Context, Decision, Reasoning

### Community 241 - "ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`"

Cohesion: 0.33
Nodes (5): ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`, Alternatives Rejected, Consequences, Context, Decision

### Community 242 - "ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`"

Cohesion: 0.33
Nodes (5): ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`, Consequences, Context, Decision, Reason

### Community 243 - "typescript"

Cohesion: 0.33
Nodes (5): ADR-056: Skip a Rule-Draft Module, Consequence, Context, Decision, Reasoning

### Community 244 - "ADR-047: Skip a Numeral-Value Interface on NumberProcessor"

Cohesion: 0.33
Nodes (5): ADR-047: Skip a Numeral-Value Interface on NumberProcessor, Consequence, Context, Decision, Reasoning

### Community 246 - "ADR-010: Dictionary Match Sort — Specificity Over Provenance"

Cohesion: 0.25
Nodes (8): Background, Step 1: Write a failing test, Step 2: Run test to verify it fails, Step 3: Add the new block in `buildVariableCache`, Step 4: Run test, Step 5: Run full JS suite, Step 6: Commit, Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`

### Community 247 - "ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine"

Cohesion: 0.40
Nodes (4): ProgressData, SemanticArrays, SemanticMetadata, Token

### Community 248 - "ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`"

Cohesion: 0.40
Nodes (4): module, $schema, ts-node, compilerOptions

### Community 249 - "ADR-059: A Configuration Toggle Is Computed Under the Config Lock, Not on the Binding Queue"

Cohesion: 0.33
Nodes (5): ADR-059: A Configuration Toggle Is Computed Under the Config Lock, Not on the Binding Queue, Consequence, Context, Decision, Reasoning

### Community 250 - "eslint-plugin-import"

Cohesion: 0.33
Nodes (5): ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting, Context, Decision, If a Performance Dashboard Is Built, Reason

### Community 251 - "eslint-plugin-react"

Cohesion: 0.33
Nodes (5): ADR-063: Skip a Hotkey Chord Module, Consequence, Context, Decision, Reasoning

### Community 252 - "Keyboard Shortcuts"

Cohesion: 0.40
Nodes (5): Dictionary tab, Global (any tab), Keyboard Shortcuts, Reader tab, Translator tab

### Community 253 - "Documentation Index"

Cohesion: 0.40
Nodes (5): Archive, Decisions, Documentation Index, Guides, Reference

### Community 256 - "9. Recommendations"

Cohesion: 0.25
Nodes (8): Background, Step 1: No test needed for this visual change — run type-check instead, Step 2: Extend the condition to include patterns, Step 3: Run type-check, Step 4: Run full JS suite, Step 5: Manual smoke test, Step 6: Commit, Task 6: UI — add semantic type selector to pattern entries

### Community 257 - "tauriAPI.ts"

Cohesion: 0.13
Nodes (23): ADR-0036, POSITION_TRACKING, UseCharacterOnlyBridgeOptions, getFirstGrapheme(), findCharacterOnlyMatch(), MatchCandidate, buildSegmentsFromPositions(), segmentFromPositionMetadata() (+15 more)

### Community 259 - "DictionaryManager Types"

Cohesion: 0.50
Nodes (3): DictionaryEntryMetadata, TrieMatch, TrieStats

### Community 260 - "Keyboard Shortcuts"

Cohesion: 0.50
Nodes (4): lib, DOM, DOM.Iterable, ES2020

### Community 262 - "ReaderPanel.tsx"

Cohesion: 0.15
Nodes (12): PanelVariant, ReaderHighlight, ReaderPanel, ReaderPanelProps, SegmentedLine, segmentTitle(), titleCache, VARIANT_CLASS (+4 more)

### Community 264 - "useCharacterOnlySegments.ts"

Cohesion: 0.67
Nodes (3): paths, ./src/_, @/_

### Community 265 - "ESLint Tooling"

Cohesion: 0.29
Nodes (7): Background, Step 1: Write a JS test, Step 2: Implement the change, Step 3: Run test, Step 4: Run full JS suite, Step 5: Commit, Task 4: JS cross-pass — store `patternSemanticType` on leader tokens

### Community 267 - "ADR-026: Do Not Move useDictionaryCRUD to src/hooks/"

Cohesion: 0.29
Nodes (7): Step 1: Write a failing test, Step 2: Run test to verify it fails, Step 3: Add the field to `PatternMetadata`, Step 4: Run test to verify it passes, Step 5: Run full Rust test suite, Step 6: Commit, Task 1: Add `semantic_type` to Rust `PatternMetadata`

### Community 268 - "ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation"

Cohesion: 0.29
Nodes (7): Step 1: Write a failing test, Step 2: Run tests to verify they fail, Step 3: Update `parse_patterns_dict` to read `semanticType`, Step 4: Run tests to verify they pass, Step 5: Run full Rust test suite, Step 6: Commit, Task 2: Parse `semanticType` from the JS pattern dictionary

### Community 271 - "ADR-074: Keep the Outline-Title Fill Inside Its Hook"

Cohesion: 0.33
Nodes (5): ADR-074: Keep the Outline-Title Fill Inside Its Hook, Consequence, Context, Decision, Reasoning

### Community 272 - "12. Implementation Summary (2026-02-07)"

Cohesion: 0.33
Nodes (6): Step 1: Write a failing integration test, Step 2: Apply the fix in `two_phase.rs`, Step 3: Run tests to verify the fix works, Step 4: Run full Rust test suite, Step 5: Commit, Task 3: Use `semantic_type` in Phase B enhanced cache (PRIMARY FIX)

### Community 273 - "Fix 8: BONUS - Fix method name typos in TranslationCache"

Cohesion: 0.40
Nodes (5): Code Quality Improvements, Consistency, Documentation, Error Handling, Maintainability

### Community 276 - "Appendix: Evidence & Metrics"

Cohesion: 0.17
Nodes (10): 1. These APIs do not validate their arguments — a wrong one degrades silently, 2. Code that looks redundant here is load-bearing — each of these was already removed once, and broke something, 3. Three implementations must move together, 4. Position arithmetic in `postProcess` has four independent traps, 5. State has one owner — do not re-add a local copy, Dictionaries, Punctuation, quotes, and chunk boundaries, src/utils — Gotchas (+2 more)

### Community 285 - "✅ Completed Work"

Cohesion: 0.50
Nodes (4): Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear(), Impact, Problem, Solution

### Community 286 - "Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup"

Cohesion: 0.50
Nodes (4): Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup(), Impact, Problem, Solution

### Community 287 - "ADR-024: Do Not Move Style Objects into useAppearanceSettings"

Cohesion: 0.50
Nodes (4): Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries(), Impact, Problem, Solution

### Community 288 - "ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init"

Cohesion: 0.50
Nodes (4): Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries, Impact, Problem, Solution

### Community 289 - "Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup"

Cohesion: 0.50
Nodes (4): Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup, Impact, Problem, Solution

### Community 290 - "ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name"

Cohesion: 0.50
Nodes (4): Fix 8: BONUS - Fix method name typos in TranslationCache, Impact, Problem, Solution

### Community 291 - "ADR-018: Unified PerformanceReport State in usePerformanceMonitoring"

Cohesion: 0.50
Nodes (4): GC Pressure Reduction, Memory Leak Elimination, Performance Impact, User-Visible Benefits

### Community 293 - "src/components/rules — Gotchas"

Cohesion: 0.33
Nodes (5): Compact Toggle-in-a-Table-Cell Pattern, Saving: one writer, one queue, src/components/rules — Gotchas, `TransformRule.relocate` — Renamed from `moveWords: number` 2026-08-24, Two UI Surfaces, One Set of Field Policies

### Community 294 - "ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput"

Cohesion: 0.67
Nodes (3): Future Improvements, Long Term, Short Term

### Community 295 - "husky"

Cohesion: 0.67
Nodes (3): Manual Verification Completed, Testing Required, Verification Checklist

## Knowledge Gaps

- **1594 isolated node(s):** `checkJs`, `jsx`, `module`, `moduleResolution`, `target` (+1589 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **61 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `tauriAPI.ts` to `tauriAPI.ts`, `V8OptimizationUtils.js`, `_assertNum`, `DictionaryManagerTypes.d.ts`, `ReaderPanel.tsx`, `Translator.jsx`, `Systematic Refactoring: Pure Utility Extraction`, `UtilityTypes.d.ts`, `Resolved Bug Postmortems`, `Content Security Policy (CSP) and WASM Security`, `Future Improvements Implementation - 2026-02-01`, `Test Coverage Improvements Summary`, `WASM Serialization Optimization Implementation Plan`, `ModalErrorBoundary`, `PatternProcessingTypes.d.ts`, `TypeScript/Rust Optimization Progress Report`, `Code Review Fixes - Implementation Summary`, `Dictionary Trie Integration Session Summary`, `System Architecture`, `DictionaryEngine`, `DictionaryTabNavigation.ts`, `.translateWithProgressiveBatches`, `UITypes.d.ts`, `WasmProcessorLifecycle.js`, `ADR-043: Skip a Shared Generation-Guarded-Fill Primitive`, `TranslatorControls.tsx`, `DictionaryTrieLoader.js`, `PatternFailureTracker`, `TokenHelpers.ts`, `QuickAddTarget.ts`, `useDictionaryModals.tsx`, `WasmProcessorLifecycle`, `pattern.rs`, `useHighlightingState.ts`, `eslint-plugin-react`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `Logger` connect `Systematic Refactoring: Pure Utility Extraction` to `tauriAPI.ts`, `PerformanceProfiler`, `DictionaryManagerTypes.d.ts`, `UtilityTypes.d.ts`, `Resolved Bug Postmortems`, `TranslationEngine`, `Content Security Policy (CSP) and WASM Security`, `Tauri Backend Security Audit`, `WASM Serialization Optimization Implementation Plan`, `Troubleshooting Guide`, `Memory Leak Prevention`, `ModalErrorBoundary`, `PatternProcessingTypes.d.ts`, `TypeScript/Rust Optimization Progress Report`, `TranslationEngine.js`, `Dictionary Trie Integration Session Summary`, `System Architecture`, `.translateWithProgressiveBatches`, `UITypes.d.ts`, `tauriAPI.ts`, `WasmProcessorLifecycle.js`, `@types/node`, `Code Review: Pure Computation Migration to wasm-core`, `SelectionMapping.ts`, `wasmOperationTimeout.js`, `useDictionary`, `TranslatorControls.tsx`, `Documentation Index`, `PatternFailureTracker`, `TokenHelpers.ts`, `SemanticArrayBuilder.ts`, `.new`, `QuickAddTarget.ts`, `pattern.rs`, `useHighlightingState.ts`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `react` connect `CacheTypes.d.ts` to `WasmProcessorLifecycle.js`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `checkJs`, `jsx`, `module` to the rest of the system?**
  _1594 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dictionary_commands.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.08650937689050212 - nodes in this community are weakly interconnected._
- **Should `number_processor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.13940256045519203 - nodes in this community are weakly interconnected._
- **Should `Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.06177076183939602 - nodes in this community are weakly interconnected._
