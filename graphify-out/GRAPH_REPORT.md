# Graph Report - chinese-translator-tauri (2026-08-14)

## Corpus Check

- 372 files · ~410,526 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 5107 nodes · 8571 edges · 308 communities (251 shown, 57 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 149 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `5f12e9b9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- dictionary_commands.rs
- number_processor.rs
- Logger
- WasmPatternProcessor.js
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
- Pattern Matching Rust WASM Migration Complete ✅
- CSP Hardening Migration - Complete Summary
- ViewportTypes.d.ts
- FallbackManager
- ADR-004: 5-Phase Processing Order Immutability
- Task 1: Add Semantic column to Patterns dictionary table
- ComponentTypes.d.ts
- UITypes.d.ts
- WasmDictionaryManager
- WASM Code Review Fixes - 2026-01-27
- Code Review Fixes - February 1, 2026
- EventTypes.d.ts
- Handoff: Shared WASM Module Panic Cascade
- DictionaryTypes.ts
- wasm_boundary.rs
- OptimizationBenchmarks
- ClickableTypes.d.ts
- Phase 8 Tests - Pattern Matching Validation
- ToastContext.tsx
- TextTokenizer.ts
- Domain Glossary
- ADR-003: TypeScript Hybrid Architecture
- String Operations Rust Migration Plan
- matcher.rs
- HookTypes.d.ts
- DictionaryContext.tsx
- text_assembly.rs
- NumberProcessor
- Code Review: Pure Computation Migration to wasm-core
- Code Review Fix Summary - 2026-01-27
- passStringToWasm0
- .new
- WasmRegexUtilsWrapper
- BatchLogger
- PerformanceBaselineTracker
- Task 1: Enable Semantic Type filter for Structural Patterns
- takeFromExternrefTable0
- BatchProcessingTypes.d.ts
- DictionaryTypes.ts
- DictionaryTrie
- SegmentPrecomputer.ts
- How to Run Baseline Benchmarks
- ADR-002: Dual-Path Clickable Highlighting Architecture
- Implementation Details ✅
- PatternIndex
- .log
- MemoryLeakDetector
- src/components/dictionary — Gotchas
- conflict_resolution.rs
- RegexUtils
- TranslationProfiler
- DictionaryWasmLookup
- Rust Trie Dictionary Migration Plan
- translation_wasm_core.js
- WasmMemoryPool
- TextChunker
- TwoPhasePatternProcessor
- precompute-dictionaries.js
- Documentation Index
- Completed Optimizations
- DictionaryEngine
- .__destroy_into_raw
- TwoPhasePatternProcessor
- CacheTypes.d.ts
- .applyMatchToTokens
- SemanticPatternProcessor
- LRUCache
- ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation
- ADR-002: Dual-Path Clickable Highlighting Architecture
- configValidation.ts
- Hotfix: Missing Method Safety Checks
- Clickable Highlighting Feature - Code Review
- Security Considerations
- translation_wasm_core.d.ts
- ElectronTypes.d.ts
- pattern.rs
- ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext
- ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler
- SmartMemoryPressureDetector.ts
- WasmMemoryPoolManager.ts
- AdaptiveChunker
- SemanticArrayBuilder.ts
- ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors
- Design
- V8OptimizationTypes.d.ts
- ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error
- SemanticArrayBuilder
- wasmIntegrityVerifier.js
- GUI Framework Evaluation: Tauri vs. Rust-Native Alternatives
- ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential
- ADR-005: Eager Dictionary Loading via DictionaryContext
- Task 6: UI — add semantic type selector to pattern entries
- CRITICAL-3: TranslationCache - O(n) Cache Invalidation
- TrieNode
- parse_pattern
- ReadonlyOptimizationTypes.d.ts
- WordTransformToolbar.tsx
- .translateWithProgressiveBatches
- ParallelConfig
- package.json
- PatternAnalyzer
- ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext
- ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler
- ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error
- Task 3: Use `semantic_type` in Phase B enhanced cache (PRIMARY FIX)
- Task 2: Parse `semanticType` from the JS pattern dictionary
- Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`
- Dictionary Management and Memory Code Review
- WasmTextChunker
- Detailed Optimization Tracking
- Potential Issues and Recommendations
- StringProcessor
- .handleSmartCleanup
- TextChunker.js
- PatternTemplateEngine
- ContentAwarePositionCache.ts
- Architecture Decision Records (ADRs)
- ADR-011: Skip useTranslatorSession Coordinator Hook
- Task 4: JS cross-pass — store `patternSemanticType` on leader tokens
- Task 1: Add `semantic_type` to Rust `PatternMetadata`
- CRITICAL-1: DictionaryManager Missing Cleanup Method
- 7. Clickable Highlighting Feature Analysis
- wasm-core Pattern Processor
- text_chunker.rs
- getStringFromWasm0
- TranslationProfiler
- Compilation Warnings - Explained
- UnicodePunctuationDetector.ts
- QuoteProcessor
- AI Readiness Evaluation: chinese-translator-tauri
- 3. Performance Optimizations ⭐⭐⭐⭐⭐
- PrecomputedTrieStats
- BoundaryOptimizer
- SegmentMatcher
- text_tokenizer.rs
- ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline
- LookupIndexUtils.ts
- DebouncedProgressHandler
- wasmOperationTimeout.js
- Testing Assessment
- ParallelDictionaryLoader
- IncrementalDictionarySorter
- WasmStringProcessor
- ScrollPositionRecovery
- Code Review: TypeScript/Rust Optimization Opportunities
- Integration #3: V8 Optimization for Memory Tracking (Task #8)
- Testing Recommendations
- ⚠️ MEDIUM-2: No Validation of WASM Token Modifications
- Compilation Warnings - Explained
- PositionMapper
- DevicePerformanceDetector
- Detailed Fix Descriptions
- RustLookupIndexManager
- UnicodePunctuationDetector
- Task 6: UI — add semantic type selector to pattern entries
- HIGH-2: LRUCache - Missing Eviction Stats Update
- Chinese-Vietnamese Translation App
- Chinese-Vietnamese Translation App
- ✅ Successfully Integrated (6 Optimizations)
- Identified Optimization Opportunities
- Optimization Integration Plan
- Pattern Semantic Type Implementation Plan
- Translation Paths Efficiency Review — 2026-02-07
- 6. Edge Case Analysis
- 5. Code Quality Review
- Part 6: Final Recommendations
- TypeScript/Rust Optimization Project
- Code Quality Assessment
- ⚠️ CRITICAL-3: Consumed Token Contract Validation (MISSING)
- Code Review: 5-Phase Processing Token Consumption
- Positive Findings ✅
- generate-wasm-hashes.js
- SemanticTypes.d.ts
- .translate
- ComponentMemoryProfiler.ts
- TranslationInputValidator
- Implementation Status 🎯
- ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting
- ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput
- ℹ️ LOW-1: Phase 3 Nested Try-Catch Complexity
- PunctuationProcessor
- Optimization Master Index - Complete Reference
- Priority 1: TypeScript Migration (Type Safety + Performance)
- Optimization Integration Session Summary
- ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider
- Design
- Tauri Backend + WASM Core — Gotchas
- find_best_pattern_match
- WasmPatternProcessor
- Appendix: File Reference
- Potential Issues and Recommendations
- 12. Implementation Summary (2026-02-07)
- ModalErrorBoundary
- 🧪 Testing & Validation Checklist
- 📍 Code Locations Map
- 🧪 Testing & Validation
- ADR-010: Dictionary Match Sort — Specificity Over Provenance
- ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine
- ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`
- ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable
- Design: Semantic Type Filter for Structural Patterns
- Character-Only Highlighting Path
- What Was Extracted (2026-01-30)
- Part 4: Design Pattern Analysis
- 1. Error Handling ⭐⭐⭐⭐⭐
- ⚠️ HIGH-2: Phase Priority Not Validated at Runtime
- 9. Recommendations
- generate-wasm-hashes.js
- TranslatorControls.tsx
- ✅ Completed Integrations (Session 2026-01-31)
- Keyboard Shortcuts
- 📍 Code Locations Map
- SemanticTypes.d.ts
- Chinese-Vietnamese Translator — Dev Memory
- useCharacterOnlySegments.ts
- 1. LRUCache Doubly-Linked List Optimization ✅
- Integration #1: Text Assembly (Task #7)
- ADR-026: Do Not Move useDictionaryCRUD to src/hooks/
- ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation
- ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting
- ADR-022: Keep streamingReducer and Initial State Constants Exported
- Testing Strategy
- 12. Implementation Summary (2026-02-07)
- Fix 8: BONUS - Fix method name typos in TranslationCache
- Conclusion
- Part 2: What MUST Stay Coupled (Architectural Analysis)
- Appendix: Evidence & Metrics
- 1. XSS Prevention ⭐⭐⭐⭐⭐
- 4. Type Safety ⭐⭐⭐⭐
- Recommendations Summary
- 1. XSS Prevention ⭐⭐⭐⭐⭐
- intl-segmenter.d.ts
- Issue tracker
- Notes
- 🚀 How to Use This Index
- ✅ Completed Work
- 🚀 How to Use This Index
- ADR-024: Do Not Move Style Objects into useAppearanceSettings
- ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init
- ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface
- ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name
- ADR-018: Unified PerformanceReport State in usePerformanceMonitoring
- ADR-017: Skip WasmMemoryPool Analytics Separation
- ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation
- ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput
- husky
- 4. Potential Optimization Opportunities
- Architecture Overview
- Appendix: File Reference
- 2. Unicode Handling ⭐⭐⭐⭐
- Recommendations
- types

## God Nodes (most connected - your core abstractions)

1. `TranslationEngine` - 111 edges
2. `Logger` - 106 edges
3. `react` - 69 edges
4. `make_cache()` - 55 edges
5. `temp_test_dir()` - 52 edges
6. `Domain Glossary` - 48 edges
7. `TranslationEngine Internals` - 44 edges
8. `DictionaryManager` - 38 edges
9. `DictionaryResponse` - 37 edges
10. `compilerOptions` - 32 edges

## Surprising Connections (you probably didn't know these)

- `DictionaryManager()` --references--> `react` [EXTRACTED]
  src/components/dictionary/DictionaryManager.tsx → package.json
- `ToastItem()` --references--> `react` [EXTRACTED]
  src/components/ToastContext.tsx → package.json
- `TranslatorDisplayPanels()` --references--> `react` [EXTRACTED]
  src/components/translator/TranslatorDisplayPanels.tsx → package.json
- `build_lookup_index_impl()` --calls--> `build_comprehensive_lookup_index()` [INFERRED]
  src-tauri/src/dictionary_commands.rs → src-tauri/src/lookup_index_engine.rs
- `useDictionaryConfigManagement()` --indirect_call--> `isFictionProperNounsId()` [INFERRED]
  src/components/configuration/useDictionaryConfigManagement.ts → src/utils/dictionary/DictionaryIdClassifier.ts

## Import Cycles

- None detected.

## Communities (308 total, 57 thin omitted)

### Community 0 - "dictionary_commands.rs"

Cohesion: 0.07
Nodes (77): BatchDictionaryResponse, create_and_activate_proper_noun_file(), create_structural_patterns_dictionary_impl(), deactivate_proper_noun_file(), deeply_nested_json(), get_cache_key(), init_app_handle(), load_dictionaries_parallel_impl() (+69 more)

### Community 1 - "number_processor.rs"

Cohesion: 0.07
Nodes (50): NumberProcessor, Regex, ConversionPattern, create_conversion_patterns(), create_number_map(), NumberMatch, NumberProcessor, HashMap (+42 more)

### Community 2 - "Logger"

Cohesion: 0.08
Nodes (41): ADR-0003, react, ModalErrorBoundaryState, Translator(), UI_TIMEOUTS, assertTranslationExecutionCtxShape, useAutoTranslateTrigger(), UseAutoTranslateTriggerOptions (+33 more)

### Community 3 - "WasmPatternProcessor.js"

Cohesion: 0.10
Nodes (17): ADR-0020, ErrorBoundaryProps, ErrorBoundaryState, PrebuiltSegment, TranslatorDisplayPanelsProps, UseVirtualScrollRangeOptions, UseVirtualScrollRangeResult, VirtualScrollRange (+9 more)

### Community 4 - "V8OptimizationUtils.js"

Cohesion: 0.09
Nodes (17): PerformanceStats, base36_encode(), DictionaryEngine, DictionaryEntry, DictionaryVersion, generate_content_hash(), normalize_batch(), normalize_single() (+9 more)

### Community 5 - "PerformanceProfiler"

Cohesion: 0.13
Nodes (24): DictionaryContext, DictionaryContextValue, DictionaryProvider(), DictionaryProviderProps, invokeEngineInvalidator(), CommitMutation, DictionaryHistoryAPI, InvalidateEngine (+16 more)

### Community 7 - "DictionaryManagerTypes.d.ts"

Cohesion: 0.09
Nodes (32): SemanticTypePicker(), supportsSemanticTypes(), BadgeProps, MetadataBadge(), RowShell(), SemanticTypeToggleCell(), VirtualRowComponent, VirtualRowProps (+24 more)

### Community 8 - "TranslationEngineTypes.d.ts"

Cohesion: 0.08
Nodes (31): AssemblyResult, AssemblySegment, AssemblyStats, is_chinese_type(), make_segment(), needs_space(), PositionEntry, Default (+23 more)

### Community 9 - "Translator.jsx"

Cohesion: 0.04
Nodes (48): accumulateLoadResults, AdaptiveBatchSizer, AppConfig, AppearanceConfig, AppearanceSettings (hook), BatchMemoryCleanup, CharacterOnlyBridge, ChunkPostProcessor (+40 more)

### Community 10 - "Fiction Structural Pattern Dictionaries — Implementation Plan"

Cohesion: 0.04
Nodes (45): ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init, Consequences, Context, Decision, Reason, ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation, Consequences, Context (+37 more)

### Community 11 - "Systematic Refactoring: Pure Utility Extraction"

Cohesion: 0.14
Nodes (24): AppearanceManager(), FIELD_GROUPS, FieldConfig, FieldGroup, FontControlGroupProps, FontControlRowProps, useAppearanceSettings(), DEFAULT_APPEARANCE (+16 more)

### Community 12 - "TranslationEngine Internals"

Cohesion: 0.04
Nodes (48): `addUnit` Requires All 6 Args at Every Call Site, `addUnit` Third Arg Must Be a Valid `PHASE_PRIORITIES` Key, All 7 WASM Wrappers Share One Binary — Cascade-Retire via `WasmCascadeRegistry` Only, `applyHierarchicalResults` Has No Overlap Check — Do Not Add One, `applyHierarchicalResults` (Phase 1) Does Not Set `isGrouped` or `groupedWith`, `applyMatchToTokens` Orphan-Release Loop Must Not Be Removed, `buildSegmentsFromPositions` Fires Only When ALL `metadata[].originalStart >= 0`, `buildVariableCache` Delegates to `PatternVariableCache.buildPatternVariableCache` (+40 more)

### Community 13 - "UtilityTypes.d.ts"

Cohesion: 0.13
Nodes (39): Arc, build_comprehensive_lookup_index(), build_index_parallel(), build_index_serial(), categorize_matches(), CategorizedMatches, Dictionary, DictionaryMatch (+31 more)

### Community 14 - "Future Optimization Work - Deferred Integrations"

Cohesion: 0.04
Nodes (45): 1.1 SemanticArrayBuilder.js → TypeScript, 1.2 OptimizedSemanticArrayBuilder.js → TypeScript, 1.3 TranslationSegmentCache.js → TypeScript, 1.4 SegmentPrecomputer.js → TypeScript, 1. LRUCache Doubly-Linked List Optimization ✅, 2.1 WASM Position Mapping Module, 2.2 WASM Content Hash Generator, 3.1 LRUCache Doubly-Linked List ✅ (+37 more)

### Community 15 - "TranslationEngine"

Cohesion: 0.04
Nodes (45): Best Practices Followed, Changes Ready to Commit, Code Quality Requirements, ✅ Completed Work, 🎉 Conclusion, Core Integration Files, ⏭️ Deferred Integrations, 📝 Documentation Created (+37 more)

### Community 16 - "Content Security Policy (CSP) and WASM Security"

Cohesion: 0.04
Nodes (44): Code Changes ✅ COMPLETED, Conclusion, CRITICAL-1: DictionaryManager Disposal ✅ IMPLEMENTED, CRITICAL-1: DictionaryManager Missing Cleanup Method, CRITICAL-2: WasmDictionaryManager Circular Buffers ✅ IMPLEMENTED, CRITICAL-2: WasmDictionaryManager - Unbounded Sync Tracking Growth, CRITICAL-3: TranslationCache Index Maps ✅ IMPLEMENTED, CRITICAL-3: TranslationCache - O(n) Cache Invalidation (+36 more)

### Community 17 - "Tauri Backend Security Audit"

Cohesion: 0.04
Nodes (45): 📍 Code Locations Map, 🎯 Complete Optimization Timeline, Current Session (2026-01-31), 📚 Documentation Map, File Paths Reference, 🔮 Future Integration Work, 🚀 How to Use This Index, I want to integrate one of the ready optimizations (+37 more)

### Community 19 - "WASM Code Review Fixes - 2026-01-28"

Cohesion: 0.05
Nodes (42): 1. Five-Phase Translation Pipeline (~1,291 lines), 2. Dictionary Operations & Cache Management (~162 lines), 3. Post-Processing & Semantic Arrays (~2,484 lines), Appendix: Evidence & Metrics, Candidate 1: Cleanup Strategies (~150 lines), Candidate 2: Match Conflict Resolution (~270 lines), Code Review: Large Files Refactoring Analysis, Conclusion (+34 more)

### Community 20 - "Test Coverage Improvements Summary"

Cohesion: 0.05
Nodes (42): 1.1 ChineseNumberConverter.js (400-500 lines), 1.2 useScrollPositionManager.js (300 lines), 1.3 TranslationInputValidator.js (100 lines), 2.1 PatternTemplateEngine.js (150-200 lines), 2.2 SemanticPositionMapper.js (300-400 lines), 3.1 useTranslationController.js (200 lines), 3.2 useDictionaryReload.js (250 lines), 4.1 Remove duplicate escapeRegExp implementations (+34 more)

### Community 21 - "WASM Serialization Optimization Implementation Plan"

Cohesion: 0.24
Nodes (36): Mutex, BatchDictionaryResult, check_json_depth(), create_fiction_dictionary_pair(), create_proper_nouns_dictionary(), create_structural_patterns_dictionary(), DictionaryCache, DictionaryResponse (+28 more)

### Community 22 - "WASM Dictionary Trie - Final Summary & Decision"

Cohesion: 0.05
Nodes (40): 1. ErrorBoundary.test.tsx (27 tests), 1. TokenHelpers.test.js (37 tests), 1. WasmTypes.test.ts in Wrong Directory, 2. MoveEntryDialog.test.tsx (24 tests), 2. PatternPriorityCalculator.test.js (26 tests), 2. Test Assertion Failures in MemoryLeakDetector, 3. LRUCache.test.ts (36 tests), 3. Pattern Priority Test Expectations (+32 more)

### Community 23 - "Number Processing Phase - Code Review Fixes"

Cohesion: 0.17
Nodes (19): BackgroundCleanupStats, CleanupTask, ComponentMetrics, ComponentProfile, ComponentStats, MemorySample, MemorySnapshot, Performance (+11 more)

### Community 24 - "Troubleshooting Guide"

Cohesion: 0.05
Nodes (38): BatchPerformanceMetrics, CharacterOnlyResult, DebugLevel, DictionaryManagerConfig, DictionaryPriorities, EngineStats, HighlightingAction, HighlightingState (+30 more)

### Community 25 - "Memory Leak Prevention"

Cohesion: 0.05
Nodes (37): A1 — lookup_index_engine.rs: chars pre-collection, A2 — LazyDictionaryContext: useMemo on context value, A3 — EnhancedVirtualizedDictionaryTable: three sub-fixes, A4 — TranslationSegmentCache: sync keys + O(1) metadata ops, A5 — pattern_processor/matcher.rs: AtomicBool + lock consolidation, A6 — pattern_processor/two_phase.rs: clone elimination, B1 — PunctuationProcessor: pre-compiled regexes, B2 — useConfigurationLoader: side-effect in useState initializer (+29 more)

### Community 27 - "Code Review Fixes - 2026-02-01 (Second Review)"

Cohesion: 0.05
Nodes (36): 1. Excellent Token Array Length Validation (Phases 1-2), 2. Robust Phase Order Enforcement, 3. Comprehensive Phase Failure Reporting, 4. Correct Consumed Token Handling in postProcess, 5. WASM Validation is Thorough, Code Review: 5-Phase Processing Token Consumption, Conclusion, ✅ CRITICAL-1: Phase Order Enforcement (GOOD) (+28 more)

### Community 28 - "Development Guide"

Cohesion: 0.27
Nodes (4): ADR-0010, DictionaryMatchLookup, ComparableMatch, compareMatchesBySpecificityThenPriority()

### Community 29 - "lookup_index_engine.rs"

Cohesion: 0.10
Nodes (23): classifies_chinese_chars_individually(), ExpectedTokens, Fixture, FixtureCase, get_byte_position(), get_tokenizer_stats(), is_chinese_char(), is_digit() (+15 more)

### Community 30 - "PatternProcessingTypes.d.ts"

Cohesion: 0.13
Nodes (18): AddToHistory, CommitMoveOp, DictionaryCRUDAPI, InvalidateEngine, PersistDictionaryMutation, prepareMutationEntry(), useDictionaryCRUD(), baseValidation() (+10 more)

### Community 31 - "TypeScript/Rust Optimization Progress Report"

Cohesion: 0.06
Nodes (32): Code Review Fixes - 2026-02-01 (Second Review), Critical (Fixed), Files Modified, Fix Applied, Fix Applied, Fix Applied, Fix Applied, Fix Applied (+24 more)

### Community 32 - "Code Review Fixes - Implementation Summary"

Cohesion: 0.06
Nodes (32): 1. Added Comprehensive Test Coverage ✅ **[BLOCKING]**, 2. Fixed Unsafe Regex Compilation ✅ **[CRASH RISK]**, 3. Fixed Memory Leak in Rust Regex ✅ **[PERFORMANCE]**, 4. Improved Error Handling ✅, 5. Fixed Token Span Validation ✅, 6. Added Performance Monitoring ✅, 7. Documented Magic Numbers ✅, All Tests Passing ✅ (+24 more)

### Community 33 - "Pattern Processing Code Review Fixes"

Cohesion: 0.06
Nodes (32): 1. ✅ Local-Only WASM Loading (CRITICAL), 2. ✅ Binary Integrity Verification (SHA-256 Hashing), 3. ✅ Module Structure Verification, 4. ✅ Instance Method Verification, 5. ✅ Graceful Degradation, 6. ✅ Retry Logic with Exponential Backoff, 7. ✅ No Dynamic WASM Loading, Attack Scenarios (If Exploited) (+24 more)

### Community 34 - "Clickable Highlighting - Code Review Fixes Summary"

Cohesion: 0.06
Nodes (32): 1. TypeScript Migration Best Practices, 2. Algorithm Optimization (LRUCache), 3. Type Safety Benefits (Real-World), Breaking Changes, Code Quality Metrics, Completed Work (5/9 Tasks), Conclusion, Created Files (+24 more)

### Community 35 - "TranslationEngine.js"

Cohesion: 0.06
Nodes (33): eslint, eslint-config-prettier, @eslint/js, jsdom, lint-staged, devDependencies, eslint, eslint-config-prettier (+25 more)

### Community 36 - "Dictionary Trie Integration Session Summary"

Cohesion: 0.15
Nodes (21): DuplicateDictionaryTableView(), DuplicateDictionaryTableViewProps, EnhancedVirtualizedDictionaryTable(), EnhancedVirtualizedDictionaryTableProps, useContextMenu(), useDictionaryEntryFilter(), useEntryEditAndMove(), BulkDeleteResult (+13 more)

### Community 37 - "System Architecture"

Cohesion: 0.19
Nodes (17): Box, PatternMatchResult, matches_the_literal_run_immediately_before_the_variable(), PatternProcessingResult, resets_at_an_earlier_variable_keeping_only_the_run_immediately_before_var_idx(), returns_zero_when_before_pos_is_zero(), returns_zero_when_the_preceding_tokens_do_not_end_with_the_literal_run(), returns_zero_when_var_idx_is_zero() (+9 more)

### Community 38 - "memory_management.rs"

Cohesion: 0.06
Nodes (31): Automated Testing, Backward Compatibility: FULL, Breaking Changes: NONE, Code Consistency, Code Review Fixes - Implementation Summary, Conclusion, ✅ CRITICAL-2: Token Array Corruption Detection, ✅ CRITICAL-3: Consumed Token Contract Validation (+23 more)

### Community 39 - "Punctuation Spacing Debug Session - 2026-02-02"

Cohesion: 0.08
Nodes (25): Before Enabling WASM Dictionary Trie:, Code Inventory, Conclusion, Created Documentation, Documentation, Executive Summary, Final Decision Rationale, In-Code Documentation (+17 more)

### Community 40 - "useDictionaryCRUD.ts"

Cohesion: 0.06
Nodes (32): 1. Character-only mode, 1. WASM Number Processor, 2. Full Translation mode, 2. WASM Pattern Processor, 3. WASM Dictionary Engine, 4. Rust Lookup Index, 5-Phase Translation Pipeline (IMMUTABLE), `applyFinalCleanup()` - Final Spacing Fixes (+24 more)

### Community 41 - "EnhancedVirtualizedDictionaryTable.tsx"

Cohesion: 0.06
Nodes (30): Behavior Changes, Benefits, Code Documentation, Compilation Verification, Conclusion, Decision: No Action Required, Deployment Safety, Developer Impact (+22 more)

### Community 42 - "DictionaryManager"

Cohesion: 0.07
Nodes (30): compilerOptions, allowJs, baseUrl, checkJs, forceConsistentCasingInFileNames, jsx, lib, module (+22 more)

### Community 43 - "Implementation Log"

Cohesion: 0.07
Nodes (29): Clickable Highlighting - Code Review Fixes Summary, ✅ CRITICAL-1: Position Order Validation, ✅ CRITICAL-2: Capitalization Length Validation, ✅ CRITICAL-3: Character-Only Mode Position Validation, ✅ CRITICAL-4: Semantic Array Synchronization Validation, ✅ CRITICAL-5: SegmentPrecomputer Position Verification, ✅ CRITICAL-6: Type Casting Bypasses, ✅ CRITICAL-7: Greedy Match Infinite Loop Prevention (+21 more)

### Community 44 - "Code Review Fixes - Translation Process"

Cohesion: 0.07
Nodes (29): Completed: 2026-01-27, ✅ COMPLETION CHECKLIST, CRITICAL-1: Verified JavaScript Pattern Sorting Consistency ✓, CRITICAL-2: Added Pattern Processing Test Suite ✓, ✅ CRITICAL ISSUES (2/2 Fixed), Documentation (1 new), 📁 FILES MODIFIED, HIGH-1: Updated Pattern Priority Documentation ✓ (+21 more)

### Community 45 - "DictionaryEngine"

Cohesion: 0.07
Nodes (29): Batch Operations (Medium Priority):, Correctness Tests, Documentation:, Expected Results, Hot Paths (Highest Priority):, Implementation Plan, JavaScript Integration:, JavaScript Migration Strategy (+21 more)

### Community 46 - "Pattern Matching Rust WASM Migration Complete ✅"

Cohesion: 0.16
Nodes (30): WordTransformToolbar(), WordTransformToolbarProps, RuleMatchesModal(), applyRule(), compareRulePrecedence(), computeInitialTranslation(), dictionarySupportsTransformRules(), findBestMatch() (+22 more)

### Community 48 - "ViewportTypes.d.ts"

Cohesion: 0.11
Nodes (22): AdaptiveBatchSizerInput, AdaptiveBatchSizerLogEntry, AdaptiveBatchSizerResult, BatchPerformanceEntry, calculateNextBatchSize(), Segment, highlightPatternVariables(), PATTERN_VARIABLE_COLORS (+14 more)

### Community 49 - "FallbackManager"

Cohesion: 0.08
Nodes (13): AdaptiveBufferCalculator, HotkeyAction, MatchHotkeyContext, AttemptFn, RecoveryOptions, ScrollPositionRecovery, ScrollPositions, DebouncedProgressHandler (+5 more)

### Community 50 - "ADR-004: 5-Phase Processing Order Immutability"

Cohesion: 0.07
Nodes (27): 1. Column Width Ratio (TranslatorDisplayPanels), 1. Flexbox Behavior, 2. CSS Property Typo (AppearanceManager), 2. Third-Party Library CSS, 3. CSS Module Import Syntax, 3. Toast Styling in Production Build, 4. Dynamic Styles Decision, Bugs Fixed (+19 more)

### Community 51 - "Task 1: Add Semantic column to Patterns dictionary table"

Cohesion: 0.10
Nodes (21): Analyze Performance Baselines, Architectural restructuring, Bounded Collection Pattern, Cache Invalidation (Unified API), Cache Management, Check Cache Performance, Check Real Memory Usage, Failed Patterns (Avoid) (+13 more)

### Community 52 - "ComponentTypes.d.ts"

Cohesion: 0.22
Nodes (20): PhaseAResult, build_result(), find_best_pattern_match(), PatternMatcher, PatternMatcher<'a>, PatternMatchResult, PhaseAPattern, PhaseAResult (+12 more)

### Community 53 - "UITypes.d.ts"

Cohesion: 0.26
Nodes (5): PrecomputedTokenStrings, classifyVariableType(), getHeuristicType(), VariableClassification, buildPrecomputedStrings()

### Community 54 - "WasmDictionaryManager"

Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, allowSyntheticDefaultImports, alwaysStrict, checkJs, emitDecoratorMetadata, esModuleInterop, experimentalDecorators (+20 more)

### Community 55 - "WASM Code Review Fixes - 2026-01-27"

Cohesion: 0.15
Nodes (24): Criterion, bench_large_token_array(), bench_pattern_competition(), bench_phase_a_processing(), bench_single_pattern_match(), bench_two_phase_processing(), create_token(), test_full_dictionary_parsing() (+16 more)

### Community 56 - "Code Review Fixes - February 1, 2026"

Cohesion: 0.07
Nodes (26): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, app, security, windows (+18 more)

### Community 57 - "EventTypes.d.ts"

Cohesion: 0.17
Nodes (14): PatternIndex, Default, HashMap, Self, SemanticPattern, String, Vec, test_clear_index() (+6 more)

### Community 58 - "Handoff: Shared WASM Module Panic Cascade"

Cohesion: 0.08
Nodes (25): 1. Documentation Improvements, 1. `src/utils/TranslationEngine.js`, 1. Understanding Code Flow is Critical, 2. Add Execution Path Diagrams, 2. `src/utils/PunctuationProcessor.ts`, 2. Understanding When Functions Are Called, 3. Lightweight Always-On Logging, 3. `src/utils/TextChunker.js` (+17 more)

### Community 59 - "DictionaryTypes.ts"

Cohesion: 0.08
Nodes (25): 1. Memory Pool Cleanup Verification, 2. Race Condition in WASM Initialization, 3. Unbounded Error Counter Growth, 4. Unsafe Buffer Size Calculation, 5. Missing Null Check in Pattern Processor, 6. Metadata JSON Parsing Without Size Limit, 7. Inconsistent Cleanup Method Naming, 8. Trie Traversal Performance Optimization (+17 more)

### Community 60 - "wasm_boundary.rs"

Cohesion: 0.06
Nodes (32): DEVICE_MEMORY_LIMITS, DICTIONARY_LOOKUP, MEMORY_MANAGEMENT, MEMORY_WASTE_DETECTION, NUMBER_PROCESSING, OPTIMIZED_SEARCH_THRESHOLDS, PATTERN_FAILURE_DETECTION, PHASE_TIMEOUTS (+24 more)

### Community 62 - "ClickableTypes.d.ts"

Cohesion: 0.08
Nodes (24): Code Review Fixes - Translation Process, Conclusion, 🔴 CRITICAL Issues (3 Fixed), Files Modified, 🟡 HIGH Priority Issues (3 Fixed), ✅ Issue #10: Magic Numbers Without Constants, ✅ Issue #11: Overly Broad Try-Catch, ✅ Issue #12: Deep Object Copying Overhead (+16 more)

### Community 63 - "Phase 8 Tests - Pattern Matching Validation"

Cohesion: 0.07
Nodes (28): Configuration Validation Pattern, Development Process Lessons, Error Handling Patterns, Fallback Mode Notification Pattern, Initialization Error Recovery Pattern, Lesson 1: Verify Execution Before Fixing Logic, Lesson 2: Test Production Builds During Development, Lesson 3: Type Boundaries Need Explicit Contracts (+20 more)

### Community 64 - "ToastContext.tsx"

Cohesion: 0.08
Nodes (24): Error, Error, Error, Fix Applied, Fix (session 47), Fix (session 48), General rule, Handoff: Shared WASM Module Panic Cascade (+16 more)

### Community 65 - "TextTokenizer.ts"

Cohesion: 0.05
Nodes (42): After Each Integration, Approach: **Minimal Surface Area**, Code Quality Requirements, Critical Constraints (from CLAUDE.md), Development Tools, ❌ DO NOT MODIFY, Functional Requirements, High-Risk Areas (+34 more)

### Community 66 - "Domain Glossary"

Cohesion: 0.08
Nodes (24): Candidate 1 — Wire `TextAssembler` into `postProcess()` (HIGHEST PRIORITY), Candidate 2 — `resolveGlobalConflicts()`: consolidate into Rust (MEDIUM PRIORITY), Candidate 3 — `applyFinalCleanup()` + `capitalizeFirstLetter()` + `applyLightFormatting()` as a bundled string post-processor (LOW PRIORITY), Candidate 4 — `findPositionOptimized()` and `buildSegmentsFromSemanticArrays()` batch position finding (LOW-MEDIUM PRIORITY), Candidate 5 — `estimateDictionaryDensity()` and `analyzeTextComplexity()` (NEGLIGIBLE), `ChineseNumberConverter.js`, Code Quality Issues Found (Not WASM-related), Code Review: Pure Computation Migration to wasm-core (+16 more)

### Community 67 - "ADR-003: TypeScript Hybrid Architecture"

Cohesion: 0.08
Nodes (24): clipboard-manager:allow-read-text, clipboard-manager:default, core:default, dialog:allow-message, dialog:allow-open, dialog:allow-save, dialog:default, fs:allow-copy-file (+16 more)

### Community 68 - "String Operations Rust Migration Plan"

Cohesion: 0.07
Nodes (22): baseDictionaryTypes, TOAST_DURATIONS, TOAST_IDS, ToastDuration, ToastId, CachePoisoningGuard, CachePoisoningPayload, ListenFn (+14 more)

### Community 70 - "HookTypes.d.ts"

Cohesion: 0.08
Nodes (23): 1. WASM Initialization Race Condition ✅, 2. Missing Input Sanitization in Tauri IPC Commands ✅, 3. Memory Leak: Timeout Not Cleared on Component Unmount ✅, 4. Potential Integer Overflow in Position Mapping ✅, 5. WASM Validation Only Checks Structure, Not Content Integrity ✅, 6. Dictionary Reload State Race Condition ✅, 7. Inconsistent Error Handling Between Sequential and Batch Dictionary Loading ✅, 8. Excessive console.log Usage Despite Logger Utility ✅ (+15 more)

### Community 71 - "DictionaryContext.tsx"

Cohesion: 0.08
Nodes (24): Active vs Dead Code, Architecture / Extraction, CI/CD Pipeline, Code Formatting (Prettier), CSS / UI Components, Development Commands, Development Debugging Tools, Development Guide (+16 more)

### Community 72 - "text_assembly.rs"

Cohesion: 0.16
Nodes (21): DictionaryManager(), useDictionaryEntryForm(), isCharacterSourceValid(), isPatternValid(), validateDictionaryEntry(), ValidationResult, DictionaryTypeFlags, isFictionPatternsId() (+13 more)

### Community 73 - "NumberProcessor"

Cohesion: 0.11
Nodes (30): POSITION_TRACKING, TranslationExecutionContext, UseCharacterOnlyBridgeOptions, useCharacterOnlySegments(), getFirstGrapheme(), getGraphemeLength(), helper, MatchCandidate (+22 more)

### Community 75 - "Code Review Fix Summary - 2026-01-27"

Cohesion: 0.06
Nodes (29): fireCascadeRetire(), _handlers, registerCascadeHandler(), getPhase2Priority(), initialize(), jsFallback(), jsFallbackPhase2(), packMatches() (+21 more)

### Community 76 - "passStringToWasm0"

Cohesion: 0.09
Nodes (23): 2026-01-31 - Session 1 (Infrastructure + Analysis), Architectural Constraints (from CLAUDE.md):, Baseline Measurements (Before Optimizations), Development Tools:, Documentation:, For Each Optimization:, Future Optimization Ideas:, Key Learnings: (+15 more)

### Community 77 - ".new"

Cohesion: 0.09
Nodes (23): Architecture: WASM-First with JavaScript Fallback, 📝 Code Changes Summary, Dictionary Trie Integration Session Summary, Documentation Updated, Error Handling, 🎯 Executive Summary, 📈 Expected Performance Impact, Files Created (+15 more)

### Community 78 - "WasmRegexUtilsWrapper"

Cohesion: 0.09
Nodes (22): CRITICAL-1: Path Traversal in Dictionary Operations, CRITICAL-2: Overly Permissive Asset Protocol Scope, CRITICAL Issues, Executive Summary, HIGH-1: Content Security Policy Too Permissive, HIGH-2: No Size Limits on User Inputs (DoS Risk), HIGH Severity Issues, Immediate (Before Production Release) (+14 more)

### Community 79 - "BatchLogger"

Cohesion: 0.09
Nodes (22): Dictionary JSON Format: Two Tiers, Dictionary Type Classification, `DictionaryContext.tsx` CRUD Audit Checklist, `DictionaryInfo` Name Collision, `DuplicateDictionaryTableView` — Duplicate Rendering Not in EVDT, Error Handling, Fiction Pattern Merge Order Is Load-Bearing, Hook Tests — jsdom Gotchas (+14 more)

### Community 80 - "PerformanceBaselineTracker"

Cohesion: 0.15
Nodes (21): DefaultClock, InMemoryState, NotKeyed, RateLimiter, build_lookup_index(), build_lookup_index_impl(), build_trie_from_entries(), DictionaryData (+13 more)

### Community 81 - "Task 1: Enable Semantic Type filter for Structural Patterns"

Cohesion: 0.09
Nodes (21): ✅ ALL CRITICAL & HIGH PRIORITY ISSUES FIXED, ✅ Automated Checks Pass, ⏳ Automated Tests Recommended, Breaking Changes: NONE, Code Review Fix Summary - 2026-01-27, Documentation, Error Handling: IMPROVED, Impact Assessment (+13 more)

### Community 82 - "takeFromExternrefTable0"

Cohesion: 0.09
Nodes (21): Benchmark Evidence, Benchmark Setup, Current Bottleneck (SemanticPatternProcessor.js:34-64), Documentation:, Expected Impact, Expected Results, Implementation Checklist, Implementation Strategy (+13 more)

### Community 83 - "BatchProcessingTypes.d.ts"

Cohesion: 0.13
Nodes (4): ExtendedCacheStats, LRUCache, LRUCacheStats, LRUNode

### Community 84 - "DictionaryTypes.ts"

Cohesion: 0.23
Nodes (20): Uint32Array, flat(), resolve_global_conflicts(), resolve_match_conflicts(), Vec, run_conflict_resolution(), run_conflict_resolution_priority_first(), test_earlier_start_wins_on_equal_length_and_type() (+12 more)

### Community 85 - "DictionaryTrie"

Cohesion: 0.14
Nodes (16): Into, build_test_zip(), import_dictionaries_impl(), Self, test_import_accumulates_error_for_invalid_json_entry(), test_import_accumulates_error_for_non_object_payload(), test_import_corrupted_zip_returns_error(), test_import_extracts_valid_entries_and_writes_files() (+8 more)

### Community 86 - "SegmentPrecomputer.ts"

Cohesion: 0.10
Nodes (21): scripts, build, build-wasm, build-wasm-dev, dev, format, format:check, generate-wasm-hashes (+13 more)

### Community 87 - "How to Run Baseline Benchmarks"

Cohesion: 0.18
Nodes (14): ClickableOriginalSemantic(), ClickableTranslationSemantic(), HighlightableSegment, HighlightableSegmentProps, BaseSegment, renderSegmentedContent(), RenderSegmentedContentOptions, ClickableTranslationOptimized() (+6 more)

### Community 88 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.12
Nodes (23): DictionaryManagerProps, SelectionState, DICTIONARY_TYPES, HotkeyHandler(), DICTIONARY_HOTKEY_MAP, TabbedInterface(), TabId, TABS (+15 more)

### Community 89 - "Implementation Details ✅"

Cohesion: 0.06
Nodes (24): fetchWasmBinary(), wasmBinaryCache, computeSHA256(), EXPECTED_EXPORTS, loadIntegrityManifest(), verifyWasmBinaryIntegrity(), verifyWasmInstance(), verifyWasmModule() (+16 more)

### Community 90 - "PatternIndex"

Cohesion: 0.24
Nodes (10): calculatePatternPriority(), calculatePriorityBreakdown(), PatternToken, PatternTokenType, PatternVariable, PRIORITY_WEIGHTS, PriorityBreakdown, NOTE: Both patterns have same length (3 tokens); whichever pattern is (+2 more)

### Community 94 - "conflict_resolution.rs"

Cohesion: 0.10
Nodes (20): Expected Output, Failure Case:, How to Run Tests, Next Steps, "No match found", Notes, Option 1: Browser Console - Simple Test (Recommended), Option 2: Add to App Code (+12 more)

### Community 95 - "RegexUtils"

Cohesion: 0.24
Nodes (14): PatternMetadata, PatternToken, PatternUsage, Default, HashMap, Option, Self, String (+6 more)

### Community 96 - "TranslationProfiler"

Cohesion: 0.16
Nodes (12): CachedString, HashMap, JsValue, Option, Result, String, Vec, StringProcessor (+4 more)

### Community 97 - "DictionaryWasmLookup"

Cohesion: 0.11
Nodes (8): cacheEntryIterator, dictionaryEntryIterator, getV8OptimizationMetrics(), memoryStatsIterator, optimizationMetrics, performanceMetricsIterator, printV8OptimizationReport(), segmentIterator

### Community 98 - "Rust Trie Dictionary Migration Plan"

Cohesion: 0.25
Nodes (11): BulkMoveDialog(), BulkMoveDialogProps, useDictionary(), getDictionaryTypes(), FullEntryData, MoveEntryDialog(), SEMANTIC_TYPE_LABELS, MoveTargetDictionary (+3 more)

### Community 100 - "WasmMemoryPool"

Cohesion: 0.09
Nodes (11): ChunkPostProcessor, PunctuationComponents, PunctuationDebugInfo, PunctuationProcessor, SpecialPattern, NormalizeTarget, QUOTE_CATEGORIES, QUOTE_TYPES (+3 more)

### Community 101 - "TextChunker"

Cohesion: 0.11
Nodes (18): Best Practices, Code Optimization Summary (2026-01-29), Completed Optimizations, Lessons Learned, LRUCache Optimization, Performance Impact Summary, Progress: 9/9 Tasks Complete (100%) ✅, ✅ Task #1: SemanticArrayBuilder TypeScript Migration (+10 more)

### Community 102 - "TwoPhasePatternProcessor"

Cohesion: 0.11
Nodes (18): Background for the Implementer, How the patterns table currently looks (column widths), Key locations in `EnhancedVirtualizedDictionaryTable.tsx`, Patterns Semantic Column Implementation Plan, Running tests, Step 1: Verify baseline, Step 2: Edit 1 — Add "Semantic" header between Translation and X types, Step 3: Run type-check after Edit 1 (+10 more)

### Community 103 - "precompute-dictionaries.js"

Cohesion: 0.11
Nodes (19): lucide-react, dependencies, lucide-react, react-dom, react-resizable-panels, @tauri-apps/api, @tauri-apps/plugin-clipboard-manager, @tauri-apps/plugin-dialog (+11 more)

### Community 106 - "DictionaryEngine"

Cohesion: 0.26
Nodes (10): MatchResult, HashMap, Option, Self, String, Vec, test_basic_insertion_and_lookup(), test_entry_count() (+2 more)

### Community 107 - ".__destroy_into_raw"

Cohesion: 0.07
Nodes (26): CRITICAL-1: Memory Safety Gap in Batch Loading, CRITICAL-2: Initialization Promise Cache Not Cleared on Failure, CRITICAL-3: Pattern Metadata Validation, CRITICAL Issues Fixed (3), Files Modified (9), HIGH-1: Error Recovery Notification in Pattern Processing, HIGH-2: Memory Pool Buffer Return Guaranteed, HIGH-3: Production Warning for Circular Trie Detection (+18 more)

### Community 108 - "TwoPhasePatternProcessor"

Cohesion: 0.11
Nodes (18): Additional Documentation, Architecture, Architecture Decision Records (ADRs), Archive, Clickable Highlighting, Code Reviews, Core Guides, Development (+10 more)

### Community 109 - "CacheTypes.d.ts"

Cohesion: 0.14
Nodes (20): RuleMatchesModalProps, AppearanceResult, BatchDictionaryResponse, ConfigurationResult, DictionaryListResult, DictionaryLoadResult, DictionaryOperationResult, DirectorySelectOptions (+12 more)

### Community 110 - ".applyMatchToTokens"

Cohesion: 0.12
Nodes (16): ADR-004: 5-Phase Processing Order Immutability, Alternative 1: Reorder Phases for Performance, Alternative 2: Parallel Processing (All Phases Simultaneously), Alternative 3: Keep Current Sequential Order (Patterns First) ✅ SELECTED, Alternatives Considered, Architectural Implications, Consequences, Context and Problem Statement (+8 more)

### Community 111 - "SemanticPatternProcessor"

Cohesion: 0.12
Nodes (16): Appearance Style Memos — Static Constants, Canonical Type Homes, `ClickableTranslationOptimized` Paragraph Logic, ConfigurationManager Settings Must Be Traced to the Engine, Engine Lifecycle — `useTranslatorEngine` Hook, Error Utilities, Global Singleton Lifecycle — `performanceHealth` / `systemPerformanceMonitor`, React Stale Dependencies (+8 more)

### Community 112 - "LRUCache"

Cohesion: 0.18
Nodes (9): MEMORY_THRESHOLDS, MemoryThresholds, UI_UPDATE_THRESHOLDS, UIUpdateThresholds, PATTERN_PROCESSING, BatchMemoryCleanup, BatchMemoryResources, BatchMemoryResult (+1 more)

### Community 113 - "ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation"

Cohesion: 0.17
Nodes (10): AtomicU32, get_global_chunker_stats(), get_stats(), JsValue, Result, String, test_basic_chunking(), test_punctuation_detection() (+2 more)

### Community 115 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.12
Nodes (16): ADR-002: Dual-Path Clickable Highlighting Architecture, Alternative 1: Consolidate Into Unified Highlighting System, Alternative 2: Keep Separate Paths (Current Implementation) ✅ SELECTED, Alternative 3: Partial Consolidation (Helper Functions), Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 116 - "configValidation.ts"

Cohesion: 0.12
Nodes (16): ADR-003: TypeScript Hybrid Architecture, Alternative 1: Full TypeScript Migration, Alternative 2: Keep Everything JavaScript, Alternative 3: Strategic Hybrid (TypeScript for Boundaries, JavaScript for Core) ✅ SELECTED, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 117 - "Hotfix: Missing Method Safety Checks"

Cohesion: 0.12
Nodes (15): ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors, Alternative 1: Copy-fix across all three processors ✗ Rejected, Alternative 2: Base class / mixin for WASM processors ✗ Rejected, Alternative 3: WasmProcessorLifecycle class ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+7 more)

### Community 118 - "Clickable Highlighting Feature - Code Review"

Cohesion: 0.09
Nodes (22): ✅ Completed Integrations (Session 2026-01-31), Completed Optimizations, ⏭️ Deferred Integrations (Require Further Work), Executive Summary, 🔮 Future Optimization Opportunities (Not Yet Planned), Future Optimization Work - Deferred Integrations, Integration #1: Text Assembly (DEFERRED), Integration #2: Parallel Dictionary Loading (+14 more)

### Community 120 - "translation_wasm_core.d.ts"

Cohesion: 0.12
Nodes (15): Build Profile, Checking Module Liveness Before a Deep Call-Site Grep, Deleting a Module — Check Cargo.toml Too, `number_processor.rs` Is Rust Spec Only — No WASM Export, PatternIndex Key Is First Char — Lookup Must Match, Phase A Composite-Coverage Scoring, Phase B Protection Blocks Shorter-or-Equal Matches, RUSTFLAGS for wasm32 (+7 more)

### Community 121 - "ElectronTypes.d.ts"

Cohesion: 0.13
Nodes (14): ADR-005: Eager Dictionary Loading via DictionaryContext, Alternative 1: Complete the LazyDictionaryContext migration ✗ Rejected, Alternative 2: Keep eager loading, delete LazyDictionaryContext ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+6 more)

### Community 122 - "pattern.rs"

Cohesion: 0.13
Nodes (15): ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation, Alternative 1: Keep inline mutation per adapter ✗ Rejected, Alternative 2: Return results, single apply site ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants, Decision (+7 more)

### Community 123 - "ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext"

Cohesion: 0.13
Nodes (14): ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext, Alternative 1: Move cache invalidation to `DictionaryContext` ✗ Rejected, Alternative 2: Keep invalidation in `handleForceReload` ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants, Decision (+6 more)

### Community 124 - "ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler"

Cohesion: 0.13
Nodes (14): ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler, Alternative 1: Full HotkeyRegistry ✗ Rejected, Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected, Alternative 3: Keep useHotkeyHandler ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+6 more)

### Community 125 - "SmartMemoryPressureDetector.ts"

Cohesion: 0.13
Nodes (14): Architecture Decision, Better Approach: Create Shared WASM Module, Current State: Dual Implementation, Expected Impact, Implementation Checklist, Implementation Strategy, Integration with TranslationEngine, Performance Impact (+6 more)

### Community 126 - "WasmMemoryPoolManager.ts"

Cohesion: 0.13
Nodes (14): App Constraints That Drive This Decision, Comparison Matrix, Current: Tauri v2, Dioxus, egui, Framework-by-Framework Analysis, gpui, GUI Framework Evaluation: Tauri vs. Rust-Native Alternatives (+6 more)

### Community 127 - "AdaptiveChunker"

Cohesion: 0.20
Nodes (10): DebugInfo, MemoryStats, PerformanceStats, PositionCandidate, PositionMappings, NOTE: Does NOT write metadata[i].translatedText — SemanticArrayMetadata omits th, SemanticArrayMetadata, SemanticArraySnapshot (+2 more)

### Community 129 - "ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors"

Cohesion: 0.15
Nodes (3): ADR-0037, DictionaryWasmLookup, validateWasmDictionaryMatch()

### Community 130 - "Design"

Cohesion: 0.14
Nodes (13): 1. Start the Development Server, 2. Open Browser DevTools, 3. Run Full Benchmark Suite, 4. Export Results, 5. Save Baseline, Benchmark Baseline Instructions, Expected Baseline Targets, How to Run Baseline Benchmarks (+5 more)

### Community 131 - "V8OptimizationTypes.d.ts"

Cohesion: 0.14
Nodes (14): ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential, Consequences, Context and Problem Statement, Decision, If Startup Latency Becomes a Problem, Implementation, Monitoring and Review, Negative (+6 more)

### Community 132 - "ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error"

Cohesion: 0.14
Nodes (13): ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error, Alternative 1: Restore JS fallback in `TwoPhasePatternProcessor` ✗ Rejected, Alternative 2: Extract `WasmPatternBridge` seam ✗ Rejected, Alternative 3: Throw on `{ success: false }`, no bridge ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+5 more)

### Community 133 - "SemanticArrayBuilder"

Cohesion: 0.14
Nodes (13): ADR-011: Skip useTranslatorSession Coordinator Hook, Alternative 1: Extract useTranslatorSession ✗ Rejected, Alternative 2: Keep coordination in Translator.jsx ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+5 more)

### Community 134 - "wasmIntegrityVerifier.js"

Cohesion: 0.14
Nodes (13): Areas for Improvement, Best Practices Observed, Clickable Highlighting Feature - Code Review, Conclusion, ✅ Excellent Practices, Executive Summary, High Priority ✨, Key Strengths (+5 more)

### Community 135 - "GUI Framework Evaluation: Tauri vs. Rust-Native Alternatives"

Cohesion: 0.14
Nodes (13): Background for the Implementer, Current flag (line ~1915), Patterns Semantic Type Filter Implementation Plan, Running checks, Step 1: Verify baseline, Step 2: Make the change, Step 3: Run type-check, Step 4: Run full test suite (+5 more)

### Community 136 - "ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential"

Cohesion: 0.17
Nodes (12): Detailed Optimization Tracking, ⏸️ Task #10: Optimize Memory Cleanup (Opportunity #10), ✅ Task #11: Performance Benchmarking Infrastructure, ⏸️ Task #1: Fix WASM Boundary Type Safety (Critical #1), ✅ Task #2: Optimize WASM JSON Serialization (High-Impact #5), ✅ Task #3: Migrate String Operations to Rust WASM (Critical #2), ✅ Task #4: Expose Rust Trie to WASM (Critical #3), ✅ Task #5: Apply TypeScript ReadonlyArray Optimizations (High-Impact #4) (+4 more)

### Community 138 - "Task 6: UI — add semantic type selector to pattern entries"

Cohesion: 0.15
Nodes (7): getIndexedMatches(), sortMatchesByPrecedence(), ConsumableToken, markPhraseFollowersConsumed(), getTextFromTokens(), getTextPositionForTokenIndex(), reconstructTextFromIndex()

### Community 139 - "CRITICAL-3: TranslationCache - O(n) Cache Invalidation"

Cohesion: 0.15
Nodes (11): DictionaryValue, FlatDictionaryEntry, flattenDictionaryEntries(), DEBUG_LEVELS, buildTrieFromDictionary(), resolveDictionaryPriority(), TrieBuildResult, DictionaryCategory (+3 more)

### Community 140 - "TrieNode"

Cohesion: 0.15
Nodes (9): MemoryPressure, BufferMetadata, MemoryPoolStats, OptimizationRecommendation, PoolCategory, PoolConfig, PoolStats, WasmBufferAllocator (+1 more)

### Community 143 - "WordTransformToolbar.tsx"

Cohesion: 0.20
Nodes (7): TwoPhasePatternProcessor, Default, JsValue, Result, Self, String, WasmPatternProcessor

### Community 144 - ".translateWithProgressiveBatches"

Cohesion: 0.15
Nodes (12): 1. Profiler Methods (2 locations), 2. System Performance Monitor (5 locations), 3. Performance Dashboard (1 location), Date: 2026-01-27, Files Modified, Fix Applied, Hotfix: Missing Method Safety Checks, Issue (+4 more)

### Community 146 - "package.json"

Cohesion: 0.15
Nodes (12): lint-staged, *.{js,jsx,ts,tsx}, _.{js,jsx,ts,tsx,css,json,md}, src/\**/_.{ts,tsx}, name, packageManager, private, type (+4 more)

### Community 147 - "PatternAnalyzer"

Cohesion: 0.18
Nodes (12): BaseSegment, ClickableOriginalSemanticProps, ClickableSegment, ClickableTranslationOptimizedProps, ClickableTranslationSemanticProps, ClickDirection, FlexibleClickHandler, PrebuiltSegment (+4 more)

### Community 148 - "ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext"

Cohesion: 0.17
Nodes (11): PatternMatchResult, PatternMetadata, PatternProcessingOptions, PatternProcessorAdapter, PatternProcessorResult, PatternToken, PatternTokenType, PatternUsageStats (+3 more)

### Community 152 - "Task 2: Parse `semanticType` from the JS pattern dictionary"

Cohesion: 0.17
Nodes (12): Active ADRs, [ADR-001: WASM Batch Loading — Remove Batch Wrapper](./ADR-001-wasm-batch-loading-failure.md), [ADR-002: Dual-Path Clickable Highlighting](./ADR-002-dual-path-clickable-highlighting.md), [ADR-003: TypeScript Hybrid Architecture](./ADR-003-typescript-hybrid-architecture.md), [ADR-004: 5-Phase Processing Order Immutability](./ADR-004-five-phase-processing-order-immutability.md), [ADR-006: PatternProcessor Interface](./ADR-006-pattern-processor-interface.md), ADR Format, Architecture Decision Records (ADRs) (+4 more)

### Community 153 - "Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`"

Cohesion: 0.17
Nodes (11): 1. `translationSource: string` — 4 Phase-1 variants, silent priority-999 fallback, 2. `TranslationEngine.js` dual interface: return + shared pipeline state, 3. WASM binary staleness is structurally undiscoverable, AI Readiness Evaluation: chinese-translator-tauri, Behavioral Clarity Detail (Dimension 5), Recommended Changes, Scores, Summary (+3 more)

### Community 154 - "Dictionary Management and Memory Code Review"

Cohesion: 0.17
Nodes (12): 1. Error Handling ⭐⭐⭐⭐⭐, 2. Unicode Handling ⭐⭐⭐⭐, 4. Type Safety ⭐⭐⭐⭐, Click Handler Type Safety (CRITICAL-6 FIX), Code Quality Assessment, Grapheme-Aware Length Checking (SegmentPrecomputer.ts:472-499), Infinite Loop Prevention (SegmentPrecomputer.ts:525-535, 614-628), Input Validation (ClickableTranslationSemantic.tsx) (+4 more)

### Community 155 - "WasmTextChunker"

Cohesion: 0.17
Nodes (12): 7. Clickable Highlighting Feature Analysis, ✅ ALREADY EXTRACTED: Position Validation Helpers, Are They Doing Redundant Work?, Component Architecture, Full Translation Highlighting Path, Highlighting Architecture Verdict, Highlighting Correctness Verification, Highlighting Performance Profile (+4 more)

### Community 156 - "Detailed Optimization Tracking"

Cohesion: 0.29
Nodes (8): HighlightingState, useHighlightingState(), UseHighlightingStateResult, highlightingReducer(), INITIAL_HIGHLIGHTING_STATE, isValidUnitIndex(), REQUIRED_PROPERTIES, MAX_SAFE_SEGMENTS

### Community 157 - "Potential Issues and Recommendations"

Cohesion: 0.26
Nodes (12): Error, PathBuf, export_dictionaries_impl(), read_zip_entries(), sanitize_io_error(), test_export_empty_directory_produces_empty_zip(), test_export_errors_when_dictionary_dir_missing(), test_export_skips_non_json_files() (+4 more)

### Community 158 - "StringProcessor"

Cohesion: 0.17
Nodes (12): **/_.spec.js, \**/_.spec.ts, **/_.spec.tsx, \**/_.test.js, **/_.test.ts, \**/_.test.tsx, exclude, build (+4 more)

### Community 159 - ".handleSmartCleanup"

Cohesion: 0.23
Nodes (7): calculateChecksum(), DictionaryTrie, __dirname, __filename, main(), precomputeDictionary(), TrieNode

### Community 160 - "TextChunker.js"

Cohesion: 0.17
Nodes (10): StreamingProgressBar, StreamingProgressBarProps, StreamingState, StreamingStateForProgress, StreamingTextRenderer, StreamingTextRendererProps, StreamingTranslationDisplay, StreamingTranslationDisplayProps (+2 more)

### Community 164 - "ADR-011: Skip useTranslatorSession Coordinator Hook"

Cohesion: 0.13
Nodes (15): 1. XSS Prevention ⭐⭐⭐⭐⭐, 2. Denial of Service (DoS) Prevention ⭐⭐⭐⭐, 3. Memory Safety ⭐⭐⭐⭐, 4. CSP Compliance ⭐⭐⭐⭐⭐, Array Size Warnings (ClickableTranslationSemantic.tsx:65-70), CSP Configuration (tauri.conf.json), Infinite Loop Prevention (Previously Covered), Input Sanitization (+7 more)

### Community 165 - "Task 4: JS cross-pass — store `patternSemanticType` on leader tokens"

Cohesion: 0.18
Nodes (10): Automated Testing, Conclusion, Dictionary Memory Management Fixes - 2026-02-03, Executive Summary, Issues Fixed, Manual Testing, Memory Impact, Overview (+2 more)

### Community 166 - "Task 1: Add `semantic_type` to Rust `PatternMetadata`"

Cohesion: 0.36
Nodes (7): ConfigurationManager(), ADR-0027, useDictionaryConfigManagement(), invalidateAppConfig(), CategorizedDictionaries, categorizeDictionaries(), sortDictionaries()

### Community 167 - "CRITICAL-1: DictionaryManager Missing Cleanup Method"

Cohesion: 0.19
Nodes (11): CacheHealthResponse, check_dictionary_cache_health(), emit_poisoning_event(), now_ms(), read_active_proper_nouns(), record_mutex_poisoning(), test_access_order_timestamp_is_milliseconds_not_seconds(), test_get_does_not_pollute_access_order_on_miss() (+3 more)

### Community 169 - "7. Clickable Highlighting Feature Analysis"

Cohesion: 0.18
Nodes (6): Intl, SegmentData, Segmenter, SegmenterConstructor, SegmenterOptions, Segments

### Community 175 - "Compilation Warnings - Explained"

Cohesion: 0.18
Nodes (10): Category 1: Future Integration APIs (18 warnings), Category 2: Helper/Utility Methods (8 warnings), Category 3: Dead Code from Earlier Phases (3 warnings), Compilation Warnings - Explained, Current Status, Fixed Warnings (7 total), Remaining Warnings (29 total) - All Expected, Summary (+2 more)

### Community 176 - "UnicodePunctuationDetector.ts"

Cohesion: 0.20
Nodes (9): Constraints, Design, Design: Semantic Type for Structural Pattern Entries, Files Touched, Problem, Section 1 — Data Model, Section 2 — Translation Engine: WASM (primary fix), Section 3 — Translation Engine: JS cross-pass fix (+1 more)

### Community 178 - "AI Readiness Evaluation: chinese-translator-tauri"

Cohesion: 0.25
Nodes (4): getSemanticTokens(), getTokenSpanForText(), LegacyTextToken, TextToken

### Community 179 - "3. Performance Optimizations ⭐⭐⭐⭐⭐"

Cohesion: 0.20
Nodes (9): AppConfiguration, AppearanceSettings, DictionaryInfo, DictionaryTypeDefinition, DictionaryTypesCollection, FontSettings, LetterSpacing, TabId (+1 more)

### Community 181 - "BoundaryOptimizer"

Cohesion: 0.29
Nodes (7): Built-in Pattern Matching Profiler, Common Profiling Targets, Prevention Strategy, Step 1: Confirm Performance Is Actually a Problem, Step 2: Identify the Bottleneck (Not Guessing), Step 3: Verify Optimization Impact, When to Profile Performance

### Community 183 - "text_tokenizer.rs"

Cohesion: 0.43
Nodes (6): AppReadinessOverlay(), AppReadinessOverlayProps, pickStatus(), stageClass(), stageIcon(), StageStatus

### Community 184 - "ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline"

Cohesion: 0.22
Nodes (8): ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline, Alternative 1: Extract to `TokenStringCache.ts` with DI ✗ Rejected, Alternative 2: Keep inline ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Supersession Note (2026-07-28)

### Community 185 - "LookupIndexUtils.ts"

Cohesion: 0.22
Nodes (8): ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider, Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected, Alternative 2: Extract loadInitialState only ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers

### Community 186 - "DebouncedProgressHandler"

Cohesion: 0.22
Nodes (8): Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected, Addendum — 2026-07-17d: Cluster deleted, not fixed, ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine, Consequence, Context, Decision, Reasoning, What Was Done Instead

### Community 187 - "wasmOperationTimeout.js"

Cohesion: 0.22
Nodes (8): 10. Code Review Checklist, 11. Conclusion, 1. Path Comparison Matrix, 2. Architectural Analysis, Critical Difference: Token Consumption, Executive Summary, Translation Paths Efficiency Review — 2026-02-07, Why They're Separate

### Community 188 - "Testing Assessment"

Cohesion: 0.32
Nodes (9): calculateDictionaryChecksum(), deserializeTrie(), savePrecomputedTrie(), serializeTrie(), tryLoadPrecomputedTrie(), TrieNode, getCacheStats(), loadDictionaryWithCache() (+1 more)

### Community 189 - "ParallelDictionaryLoader"

Cohesion: 0.22
Nodes (9): 1. Imports (Lines 135-142), 2. Feature Flag (Lines 283-297), 3. Dictionary Loading (Lines 1233-1266), 4. WASM Lookup Wrapper (Lines 8481-8536), 5. Lookup Integration (Lines 8541-8594), 6. Cache Invalidation (Lines 9612-9645), Phase 1: Position Mapping Utilities ✅ (Completed), Phase 2: TranslationEngine Integration ✅ (Completed) (+1 more)

### Community 190 - "IncrementalDictionarySorter"

Cohesion: 0.22
Nodes (8): Column header, Design, Design: Semantic Column in Patterns Dictionary Table, Files Touched, No new components, Problem, Row cell, Width adjustment

### Community 191 - "WasmStringProcessor"

Cohesion: 0.22
Nodes (8): vite.config.ts, compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 193 - "Code Review: TypeScript/Rust Optimization Opportunities"

Cohesion: 0.13
Nodes (25): DictionaryEntry(), DictionaryEntryProps, DictionaryTypeDefinition, MoveEntryDialogProps, SemanticTypePickerProps, CommitMoveOp, DictionaryPersistenceAPI, PersistDictionaryMutation (+17 more)

### Community 194 - "Integration #3: V8 Optimization for Memory Tracking (Task #8)"

Cohesion: 0.22
Nodes (8): Rust Arithmetic, Rust String Lengths, Tauri Backend + WASM Core — Gotchas, Tauri Command Security, WASM-Bridged Structs, wasm-core Architecture, WASM `&mut self` Borrow Rule (Rust 1.84+), WASM-Only Symbols Cause SIGABRT on Native Tests

### Community 198 - "PositionMapper"

Cohesion: 0.28
Nodes (3): TranslationInputValidator, ValidationResult, ValidationStats

### Community 199 - "DevicePerformanceDetector"

Cohesion: 0.25
Nodes (7): ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable, Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected, Alternative 2: Keep coordination in TranslationEngine ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers

### Community 200 - "Detailed Fix Descriptions"

Cohesion: 0.25
Nodes (8): Detailed Fix Descriptions, Fix 5: MEDIUM-1 - Add dispose() to TranslationCache, Fix 6: Update DictionaryManager to use TranslationCache.dispose(), Impact, Impact, Problem, Solution, Solution

### Community 201 - "RustLookupIndexManager"

Cohesion: 0.25
Nodes (7): Background for the Implementer, Final Verification, How pattern-within-pattern type checking works today, Key files and line numbers, Pattern Semantic Type Implementation Plan, Running tests, The fix

### Community 202 - "UnicodePunctuationDetector"

Cohesion: 0.25
Nodes (8): Background, Step 1: Write a failing test, Step 2: Run test to verify it fails, Step 3: Add the new block in `buildVariableCache`, Step 4: Run test, Step 5: Run full JS suite, Step 6: Commit, Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`

### Community 203 - "Task 6: UI — add semantic type selector to pattern entries"

Cohesion: 0.25
Nodes (8): Background, Step 1: No test needed for this visual change — run type-check instead, Step 2: Extend the condition to include patterns, Step 3: Run type-check, Step 4: Run full JS suite, Step 5: Manual smoke test, Step 6: Commit, Task 6: UI — add semantic type selector to pattern entries

### Community 204 - "HIGH-2: LRUCache - Missing Eviction Stats Update"

Cohesion: 0.25
Nodes (8): 5-Phase Pipeline (order is immutable), Architecture, Chinese-Vietnamese Translation App, Critical Constraints, Development, Dual-Path Architecture, Essential Commands, graphify

### Community 206 - "Chinese-Vietnamese Translation App"

Cohesion: 0.25
Nodes (7): Animations and Keyframes, Class Name Collisions, Cross-Component Reuse, File Placement, Hiding Elements — Use Conditional Rendering, Not `visibility: hidden`, Modal Overlays, src/styles — CSS Module Conventions

### Community 207 - "✅ Successfully Integrated (6 Optimizations)"

Cohesion: 0.25
Nodes (7): AccelerationInfo, PositionMappingStats, SemanticRange, TextPositionMapping, ValidationError, ValidationResult, ValidationWarning

### Community 209 - "Optimization Integration Plan"

Cohesion: 0.33
Nodes (6): Error Handling, Functional Testing, Performance Testing, Production Readiness, Regression Testing, 🧪 Testing & Validation Checklist

### Community 210 - "Pattern Semantic Type Implementation Plan"

Cohesion: 0.29
Nodes (6): ADR-010: Dictionary Match Sort — Specificity Over Provenance, Alternatives Considered, Consequences, Context, Decision, Rationale

### Community 211 - "Translation Paths Efficiency Review — 2026-02-07"

Cohesion: 0.29
Nodes (6): ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation, Consequence, Context, Decision, Reasoning, What Was Done Instead

### Community 212 - "6. Edge Case Analysis"

Cohesion: 0.29
Nodes (6): Addendum — 2026-07-18: Extends to `TwoPhasePatternProcessor`'s pattern-profiling cluster, ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface, Context, Decision, If App Callers Are Added, Reason

### Community 213 - "5. Code Quality Review"

Cohesion: 0.29
Nodes (6): ADR-022: Keep streamingReducer and Initial State Constants Exported, Boundary Condition, Context, Decision, Reason, Supersession Note

### Community 214 - "Part 6: Final Recommendations"

Cohesion: 0.29
Nodes (6): ADR-026: Do Not Move useDictionaryCRUD to src/hooks/, Context, Decision, Reason, Supersession Note (2026-06-27), When to Revisit

### Community 215 - "TypeScript/Rust Optimization Project"

Cohesion: 0.29
Nodes (7): Background, Step 1: Write a JS test, Step 2: Implement the change, Step 3: Run test, Step 4: Run full JS suite, Step 5: Commit, Task 4: JS cross-pass — store `patternSemanticType` on leader tokens

### Community 216 - "Code Quality Assessment"

Cohesion: 0.29
Nodes (7): Step 1: Write a failing test, Step 2: Run test to verify it fails, Step 3: Add the field to `PatternMetadata`, Step 4: Run test to verify it passes, Step 5: Run full Rust test suite, Step 6: Commit, Task 1: Add `semantic_type` to Rust `PatternMetadata`

### Community 217 - "⚠️ CRITICAL-3: Consumed Token Contract Validation (MISSING)"

Cohesion: 0.29
Nodes (7): Step 1: Write a failing test, Step 2: Run tests to verify they fail, Step 3: Update `parse_patterns_dict` to read `semanticType`, Step 4: Run tests to verify they pass, Step 5: Run full Rust test suite, Step 6: Commit, Task 2: Parse `semanticType` from the JS pattern dictionary

### Community 218 - "Code Review: 5-Phase Processing Token Consumption"

Cohesion: 0.29
Nodes (6): Behaviour, Change, Design, Design: Semantic Type Filter for Structural Patterns, Files Touched, Problem

### Community 219 - "Positive Findings ✅"

Cohesion: 0.29
Nodes (6): Chinese-Vietnamese Translator — Dev Memory, Comprehensive architecture code review — 14 issues fixed, Fixes Done (2026-02-22, session 19), Key Architectural Invariants (most frequently violated), Session History Index, Stable Project Facts

### Community 220 - "generate-wasm-hashes.js"

Cohesion: 0.33
Nodes (6): computeFileHash(), __dirname, __filename, generateIntegrityManifest(), MANIFEST_PATH, WASM_DIR

### Community 221 - "SemanticTypes.d.ts"

Cohesion: 0.29
Nodes (5): PerformanceStats, ProgressInfo, QUICK_ADD_HINTS, RegressionHealth, TranslatorControlsProps

### Community 224 - "ComponentMemoryProfiler.ts"

Cohesion: 0.40
Nodes (4): Dictionary tab, Global (any tab), Keyboard Shortcuts, Translator tab

### Community 225 - "TranslationInputValidator"

Cohesion: 0.33
Nodes (5): ADR-017: Skip WasmMemoryPool Analytics Separation, Consequence, Context, Decision, Reasoning

### Community 226 - "Implementation Status 🎯"

Cohesion: 0.33
Nodes (5): ADR-018: Unified PerformanceReport State in usePerformanceMonitoring, Consequence, Context, Decision, Reasoning

### Community 227 - "ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting"

Cohesion: 0.33
Nodes (5): ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting, Context, Decision, If a Performance Dashboard Is Built, Reason

### Community 228 - "ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput"

Cohesion: 0.33
Nodes (5): ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput, Context, Decision, Reason, When to Revisit

### Community 229 - "ℹ️ LOW-1: Phase 3 Nested Try-Catch Complexity"

Cohesion: 0.33
Nodes (5): ADR-024: Do Not Move Style Objects into useAppearanceSettings, Context, Decision, Reason, Revisit condition

### Community 230 - "PunctuationProcessor"

Cohesion: 0.33
Nodes (5): ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods, Context, Decision, Reason, When to Revisit

### Community 231 - "Optimization Master Index - Complete Reference"

Cohesion: 0.33
Nodes (5): ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`, Consequences, Context, Decision, Reason

### Community 232 - "Priority 1: TypeScript Migration (Type Safety + Performance)"

Cohesion: 0.33
Nodes (5): ADR-031: Skip Splitting dictionary_commands.rs by Concern, Consequence, Context, Decision, Reasoning

### Community 233 - "Optimization Integration Session Summary"

Cohesion: 0.33
Nodes (5): ADR-032: Delete PerformanceBaselineTracker's cacheHitRate Machinery, Consequence, Context, Decision, Reasoning

### Community 234 - "ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider"

Cohesion: 0.33
Nodes (5): ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage, Consequence, Context, Decision, Reasoning

### Community 235 - "Design"

Cohesion: 0.33
Nodes (5): ADR-034: Skip Building DictionaryManager.validateIntegrity(), Consequence, Context, Decision, Reasoning

### Community 236 - "Tauri Backend + WASM Core — Gotchas"

Cohesion: 0.33
Nodes (5): ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup), Consequence, Context, Decision, Reasoning

### Community 237 - "find_best_pattern_match"

Cohesion: 0.33
Nodes (5): ADR-036: Skip Unifying `precomputeSegments`/`precomputeOriginalSegments` Into a Shared Scanner, Consequence, Context, Decision, Reasoning

### Community 238 - "WasmPatternProcessor"

Cohesion: 0.33
Nodes (5): ADR-038: Reject "Deepen RuleMatchesModal to Preview Real Output", Consequence, Context, Decision, Reasoning

### Community 239 - "Appendix: File Reference"

Cohesion: 0.33
Nodes (6): Appendix: File Reference, Code Reviews (Historical), Core Implementation, Documentation, Testing, Type Definitions

### Community 240 - "Potential Issues and Recommendations"

Cohesion: 0.33
Nodes (6): Issue 1: Development-Only Validation ⚠️, Issue 2: Complex Position Tracking Logic ⚠️, Issue 3: Dual-Path Maintenance Burden ⚠️, Issue 4: Magic Numbers and Constants 🟡, Issue 5: Error Recovery Strategy 🟡, Potential Issues and Recommendations

### Community 241 - "12. Implementation Summary (2026-02-07)"

Cohesion: 0.33
Nodes (6): 12. Implementation Summary (2026-02-07), Code Quality Improvements, Files Created, Files Modified, Impact, Test Results

### Community 242 - "ModalErrorBoundary"

Cohesion: 0.33
Nodes (6): 5. Code Quality Review, ✅ GOOD: Clear Separation of Concerns, ✅ GOOD: Performance Optimizations Already Applied, ✅ GOOD: Phase Execution Documentation, ✅ GOOD: Position Tracking Correctness, ⚠️ MINOR ISSUE: Lookup Index Threshold Inconsistency

### Community 243 - "🧪 Testing & Validation Checklist"

Cohesion: 0.50
Nodes (4): High Priority (Next 3 months), 📋 Implementation Priority Recommendations, Low Priority (6-12 months), Medium Priority (3-6 months)

### Community 244 - "📍 Code Locations Map"

Cohesion: 0.33
Nodes (6): Step 1: Write a failing integration test, Step 2: Apply the fix in `two_phase.rs`, Step 3: Run tests to verify the fix works, Step 4: Run full Rust test suite, Step 5: Commit, Task 3: Use `semantic_type` in Phase B enhanced cache (PRIMARY FIX)

### Community 245 - "🧪 Testing & Validation"

Cohesion: 0.33
Nodes (6): src/**/\*.d.ts, src/**/_.js, src/\**/_.jsx, src/**/\*.ts, src/**/*.tsx, include

### Community 246 - "ADR-010: Dictionary Match Sort — Specificity Over Provenance"

Cohesion: 0.50
Nodes (4): react, react, ToastItem(), TranslatorDisplayPanels()

### Community 247 - "ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine"

Cohesion: 0.33
Nodes (4): read_clipboard(), AppHandle, Result, String

### Community 248 - "ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`"

Cohesion: 0.33
Nodes (5): ApplyUpdatesOptions, ApplyUpdatesResult, TokenScanOptions, TokenScanResult, TokenUpdate

### Community 249 - "ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable"

Cohesion: 0.67
Nodes (3): Security Assessment, Security Score: 9/10, Threat Model

### Community 250 - "Design: Semantic Type Filter for Structural Patterns"

Cohesion: 0.40
Nodes (4): ADR-037: Delete Orphaned WASM Boundary Validators, Keep `validateWasmDictionaryMatch`, Context, Decision, Reasoning

### Community 251 - "Character-Only Highlighting Path"

Cohesion: 0.40
Nodes (5): 3. Performance Optimizations ⭐⭐⭐⭐⭐, Level 1: React Memoization (ClickableTranslationOptimized.tsx), Level 2: Prebuilt Segments (Zero Computation), Level 3: WASM Acceleration (SegmentPrecomputer.ts:164-261), Level 4: Performance Fixes from Code Reviews

### Community 252 - "What Was Extracted (2026-01-30)"

Cohesion: 0.40
Nodes (5): Architecture Overview, Dual-Path Design, Path 1: Character-Only Mode, Path 2: Full Translation Mode, Position Tracking Flow

### Community 253 - "Part 4: Design Pattern Analysis"

Cohesion: 0.40
Nodes (5): Code Quality Improvements, Consistency, Documentation, Error Handling, Maintainability

### Community 254 - "1. Error Handling ⭐⭐⭐⭐⭐"

Cohesion: 0.40
Nodes (5): 4. Potential Optimization Opportunities, ⚠️ MINOR: Share Lookup Index Instance, ❌ REJECTED: Parallel Execution, ❌ REJECTED: Reuse Phase 5 from Full Translation, ❌ REJECTED: Unify Semantic Array Builders

### Community 255 - "⚠️ HIGH-2: Phase Priority Not Validated at Runtime"

Cohesion: 0.40
Nodes (5): 6. Edge Case Analysis, ✅ HANDLED: Duplicate Translations, ✅ HANDLED: Empty Input, ✅ HANDLED: Mixed Chinese/Latin Text, ✅ HANDLED: WASM Unavailable

### Community 256 - "9. Recommendations"

Cohesion: 0.40
Nodes (5): 9. Recommendations, ✅ DO NOT MERGE PHASE 5, ✅ DO NOT PARALLELIZE, ✅ KEEP CURRENT ARCHITECTURE, ✅ MONITOR, DON'T OPTIMIZE

### Community 257 - "generate-wasm-hashes.js"

Cohesion: 0.40
Nodes (5): Core Files, Documentation, Highlighting Components, References, Shared Utilities (Extracted)

### Community 258 - "TranslatorControls.tsx"

Cohesion: 0.42
Nodes (6): conflictError(), generateTransformRuleId(), useTransformRules(), loadTransformRules(), saveTransformRules(), findConflict()

### Community 260 - "Keyboard Shortcuts"

Cohesion: 0.23
Nodes (4): ADR-0009, PerformanceHealth, hasWasmPatternProcessorFailed(), isWasmPatternProcessorAvailable()

### Community 262 - "SemanticTypes.d.ts"

Cohesion: 0.40
Nodes (4): ProgressData, SemanticArrays, SemanticMetadata, Token

### Community 263 - "Chinese-Vietnamese Translator — Dev Memory"

Cohesion: 0.40
Nodes (4): module, $schema, ts-node, compilerOptions

### Community 264 - "useCharacterOnlySegments.ts"

Cohesion: 0.29
Nodes (7): Future Activation Scenarios, Scenario 1: WebAssembly Interface Types (2025-2026) 🌟, Scenario 2: Batch Processing API 🚀, Scenario 3: Very Large Dictionaries (>50,000 entries), Scenario 4: Parallel Processing (Web Workers), Scenario 5: Multi-Character Phrase Lookups, When to Reactivate WASM Dictionary Trie

### Community 266 - "Integration #1: Text Assembly (Task #7)"

Cohesion: 0.50
Nodes (4): Benchmark Results (from documentation), Memory Usage, Performance Analysis, Scalability

### Community 267 - "ADR-026: Do Not Move useDictionaryCRUD to src/hooks/"

Cohesion: 0.50
Nodes (4): Coverage Analysis, Test Quality Indicators, Testing Assessment, Testing Score: 9/10

### Community 268 - "ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation"

Cohesion: 0.50
Nodes (4): Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear(), Impact, Problem, Solution

### Community 269 - "ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting"

Cohesion: 0.50
Nodes (4): Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup(), Impact, Problem, Solution

### Community 270 - "ADR-022: Keep streamingReducer and Initial State Constants Exported"

Cohesion: 0.50
Nodes (4): Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries(), Impact, Problem, Solution

### Community 271 - "Testing Strategy"

Cohesion: 0.50
Nodes (4): Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries, Impact, Problem, Solution

### Community 272 - "12. Implementation Summary (2026-02-07)"

Cohesion: 0.50
Nodes (4): Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup, Impact, Problem, Solution

### Community 273 - "Fix 8: BONUS - Fix method name typos in TranslationCache"

Cohesion: 0.50
Nodes (4): Fix 8: BONUS - Fix method name typos in TranslationCache, Impact, Problem, Solution

### Community 274 - "Conclusion"

Cohesion: 0.50
Nodes (4): GC Pressure Reduction, Memory Leak Elimination, Performance Impact, User-Visible Benefits

### Community 275 - "Part 2: What MUST Stay Coupled (Architectural Analysis)"

Cohesion: 0.50
Nodes (4): 3. Current Optimizations (Already Implemented), ✅ Infrastructure Sharing, ✅ Sequential Execution (Intentional UX Design), ✅ WASM/Rust Acceleration

### Community 276 - "Appendix: Evidence & Metrics"

Cohesion: 0.50
Nodes (4): 8. Memory & Performance Profile, Character-Only (same 1000-char text), Efficiency Verdict, Full Translation (1000-char text, typical)

### Community 277 - "1. XSS Prevention ⭐⭐⭐⭐⭐"

Cohesion: 0.50
Nodes (4): Character-Only Highlighting Path, Strategy 1: Position Metadata (Preferred, Fastest), Strategy 2: indexOf Fallback (Synchronous), Strategy 3: Async SegmentPrecomputer (Comprehensive)

### Community 278 - "4. Type Safety ⭐⭐⭐⭐"

Cohesion: 0.12
Nodes (18): App(), AppContent(), NOTE: WASM singleton cleanup intentionally NOT called from App unmount., pendingToastCalls, setGlobalToast(), Toast, ToastContainer(), ToastContext (+10 more)

### Community 279 - "Recommendations Summary"

Cohesion: 0.50
Nodes (3): DictionaryEntryMetadata, TrieMatch, TrieStats

### Community 280 - "1. XSS Prevention ⭐⭐⭐⭐⭐"

Cohesion: 0.39
Nodes (4): batchLog, debugObjectPool, getLogEntry(), releaseLogEntry()

### Community 281 - "intl-segmenter.d.ts"

Cohesion: 0.50
Nodes (4): lib, DOM, DOM.Iterable, ES2020

### Community 284 - "🚀 How to Use This Index"

Cohesion: 0.67
Nodes (3): Future Improvements, Long Term, Short Term

### Community 285 - "✅ Completed Work"

Cohesion: 0.67
Nodes (3): Manual Verification Completed, Testing Required, Verification Checklist

### Community 288 - "ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init"

Cohesion: 0.67
Nodes (3): paths, ./src/_, @/_

### Community 294 - "ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput"

Cohesion: 0.50
Nodes (4): 5. Testing Coverage ⭐⭐⭐⭐⭐, Test Categories, Test Gaps, Test Statistics

### Community 310 - "types"

Cohesion: 0.67
Nodes (3): node, react-dom, types

## Knowledge Gaps

- **2170 isolated node(s):** `checkJs`, `jsx`, `module`, `moduleResolution`, `target` (+2165 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **57 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Logger` connect `WasmPatternProcessor.js` to `ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors`, `Logger`, `PerformanceProfiler`, `📍 Code Locations Map`, `DictionaryManagerTypes.d.ts`, `Systematic Refactoring: Pure Utility Extraction`, `CRITICAL-3: TranslationCache - O(n) Cache Invalidation`, `TrieNode`, `4. Type Safety ⭐⭐⭐⭐`, `Number Processing Phase - Code Review Fixes`, `1. XSS Prevention ⭐⭐⭐⭐⭐`, `Detailed Optimization Tracking`, `Development Guide`, `PatternProcessingTypes.d.ts`, `Dictionary Trie Integration Session Summary`, `Task 1: Add `semantic_type`to Rust`PatternMetadata``, `ViewportTypes.d.ts`, `UITypes.d.ts`, `wasm_boundary.rs`, `Testing Assessment`, `Code Review: TypeScript/Rust Optimization Opportunities`, `String Operations Rust Migration Plan`, `PositionMapper`, `text_assembly.rs`, `NumberProcessor`, `Code Review Fix Summary - 2026-01-27`, `How to Run Baseline Benchmarks`, `ADR-002: Dual-Path Clickable Highlighting Architecture`, `Implementation Details ✅`, `PatternIndex`, `DictionaryWasmLookup`, `Rust Trie Dictionary Migration Plan`, `AdaptiveChunker`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `react` connect `Logger` to `TranslatorControls.tsx`, `WasmPatternProcessor.js`, `PerformanceProfiler`, `DictionaryManagerTypes.d.ts`, `Systematic Refactoring: Pure Utility Extraction`, `4. Type Safety ⭐⭐⭐⭐`, `Detailed Optimization Tracking`, `PatternProcessingTypes.d.ts`, `TextChunker.js`, `Dictionary Trie Integration Session Summary`, `Task 1: Add `semantic_type`to Rust`PatternMetadata``, `Pattern Matching Rust WASM Migration Complete ✅`, `ViewportTypes.d.ts`, `types`, `text_tokenizer.rs`, `wasm_boundary.rs`, `Code Review: TypeScript/Rust Optimization Opportunities`, `String Operations Rust Migration Plan`, `NumberProcessor`, `How to Run Baseline Benchmarks`, `ADR-002: Dual-Path Clickable Highlighting Architecture`, `SemanticTypes.d.ts`, `Rust Trie Dictionary Migration Plan`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `TranslationEngine` connect `_assertNum` to `PatternTemplateEngine`, `High-Priority Issues 🟠`, `Task 6: UI — add semantic type selector to pattern entries`, `SmartMemoryPressureDetector`, `AI Readiness Evaluation: chinese-translator-tauri`, `Security Considerations`, `wasm_boundary.rs`, `OptimizationBenchmarks`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `checkJs`, `jsx`, `module` to the rest of the system?**
  _2170 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dictionary_commands.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06772151898734177 - nodes in this community are weakly interconnected._
- **Should `number_processor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.07656341320864991 - nodes in this community are weakly interconnected._
