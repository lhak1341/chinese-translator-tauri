# Graph Report - chinese-translator-tauri (2026-07-17)

## Corpus Check

- 0 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 5778 nodes · 8063 edges · 351 communities (297 shown, 54 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `61b4807c`
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
- src/components — Gotchas
- .new
- configValidation.ts
- Hotfix: Missing Method Safety Checks
- Clickable Highlighting Feature - Code Review
- Security Considerations
- translation_wasm_core.d.ts
- ElectronTypes.d.ts
- pattern.rs
- WasmTypes.d.ts
- PerformanceTypes.d.ts
- SmartMemoryPressureDetector.ts
- WasmMemoryPoolManager.ts
- AdaptiveChunker
- SemanticArrayBuilder.ts
- ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors
- Design
- V8OptimizationTypes.d.ts
- GraphemeHelper
- SemanticArrayBuilder
- configValidation.ts
- GUI Framework Evaluation: Tauri vs. Rust-Native Alternatives
- ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential
- ADR-005: Eager Dictionary Loading via DictionaryContext
- Task 6: UI — add semantic type selector to pattern entries
- CRITICAL-3: TranslationCache - O(n) Cache Invalidation
- TrieNode
- parse_pattern
- ReadonlyOptimizationTypes.d.ts
- WordTransformToolbar.tsx
- ParallelConfig
- SystemPerformanceMonitor
- PatternAnalyzer
- ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext
- ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler
- ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error
- Task 3: Use `semantic_type` in Phase B enhanced cache (PRIMARY FIX)
- Task 2: Parse `semanticType` from the JS pattern dictionary
- Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`
- Dictionary Management and Memory Code Review
- PrecomputedTrieStats
- Detailed Optimization Tracking
- Potential Issues and Recommendations
- StringProcessor
- WasmTextAssemblerWrapper
- TextChunker.js
- TextTokenizer
- ContentAwarePositionCache.ts
- Architecture Decision Records (ADRs)
- ADR-011: Skip useTranslatorSession Coordinator Hook
- Task 4: JS cross-pass — store `patternSemanticType` on leader tokens
- Task 1: Add `semantic_type` to Rust `PatternMetadata`
- CRITICAL-1: DictionaryManager Missing Cleanup Method
- High-Priority Issues 🟠
- 7. Clickable Highlighting Feature Analysis
- wasm-core Pattern Processor
- text_chunker.rs
- DictionaryTypes.d.ts
- WasmMemoryPoolManager.ts
- SmartMemoryPressureDetector
- WasmTextTokenizer
- WasmProcessorLifecycle
- QuoteProcessor
- AI Readiness Evaluation: chinese-translator-tauri
- 3. Performance Optimizations ⭐⭐⭐⭐⭐
- WasmTypes.ts
- BoundaryOptimizer
- SegmentMatcher
- text_tokenizer.rs
- ErrorBoundary.tsx
- LookupIndexUtils.ts
- DebouncedProgressHandler
- wasmOperationTimeout.js
- tauriAPI.ts
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
- RustLookupIndexManager
- UnicodePunctuationDetector
- PerformanceMonitor
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
- SemanticTypes.d.ts
- ComponentMemoryProfiler.ts
- TranslationInputValidator
- Implementation Status 🎯
- UnicodePunctuationDetector.ts
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
- SmoothLoadingManager
- ModalErrorBoundary
- DictionaryHealthMonitor
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
- generate-wasm-hashes.js
- TranslatorControls.tsx
- SemanticPatternProcessor.js
- AppReadinessOverlay.tsx
- ChunkPostProcessor
- SemanticArrayValidator
- Chinese-Vietnamese Translator — Dev Memory
- ⏭️ Ready Optimizations (Not Yet Integrated)
- 1. LRUCache Doubly-Linked List Optimization ✅
- Integration #1: Text Assembly (Task #7)
- ADR-026: Do Not Move useDictionaryCRUD to src/hooks/
- ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation
- ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting
- ADR-022: Keep streamingReducer and Initial State Constants Exported
- Testing Strategy
- 12. Implementation Summary (2026-02-07)
- Conclusion
- Part 2: What MUST Stay Coupled (Architectural Analysis)
- Appendix: Evidence & Metrics
- 1. XSS Prevention ⭐⭐⭐⭐⭐
- 4. Type Safety ⭐⭐⭐⭐
- Recommendations Summary
- translation_wasm_core.d.ts
- intl-segmenter.d.ts
- SmartMemoryCoordinator
- 🚀 How to Use This Index
- ✅ Completed Work
- ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods
- ADR-024: Do Not Move Style Objects into useAppearanceSettings
- ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init
- ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface
- ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name
- ADR-018: Unified PerformanceReport State in usePerformanceMonitoring
- ADR-017: Skip WasmMemoryPool Analytics Separation
- ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation
- ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput
- HIGH-4: WASM Dictionary Trie - No JS-Visible Disposal
- 4. Potential Optimization Opportunities
- Architecture Overview
- Appendix: File Reference
- 2. Unicode Handling ⭐⭐⭐⭐
- src/styles — CSS Module Conventions
- Implementation Roadmap
- Recommendations
- Integration Roadmap (8 Integration Points)
- Integration Sequence (Recommended Order)
- 🚀 Next Steps
- 🔄 Git Status
- Keyboard Shortcuts
- 9. Recommendations
- 3. Current Optimizations (Already Implemented)
- ✅ IMPLEMENTED Micro-Optimizations (2026-02-07)
- References
- Verification Checklist
- Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries
- Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup
- Risk Mitigation
- Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear
- ⏸️ Task #10: Optimize Memory Cleanup (Opportunity #10)
- Code Review: Large Files Refactoring Analysis
- Part 3: What Could Be Extracted (But Shouldn't Be)
- Monitoring & Validation
- ⚠️ HIGH-1: Cached Semantic Tokens Invalidation Timing
- .initialize
- 🎯 Complete Optimization Timeline
- ✅ Verification Checklist
- Executive Summary
- Risk Assessment
- Testing Strategy
- Risk Mitigation
- Success Criteria
- 🎓 Lessons Learned
- ⏭️ Deferred Integrations
- 📁 Files Modified
- ✅ Success Criteria Met
- PatternPriorityCalculator.ts
- Optimization Roadmap
- Resources
- DictionaryEntryValidator.ts
- main
- ParagraphGrouping.ts
- 📊 Performance Summary
- Performance Metrics
- ⏸️ Task #1: Fix WASM Boundary Type Safety (Critical #1)
- ✅ Task #7: Rust String Builder for Post-Processing (Medium #7)
- ✅ Task #3: Migrate String Operations to Rust WASM (Critical #2)
- ✅ Task #5: Apply TypeScript ReadonlyArray Optimizations (High-Impact #4)
- ✅ Task #8: TypeScript Interfaces for V8 Optimization (Medium #8)

## God Nodes (most connected - your core abstractions)

1. `TranslationEngine` - 129 edges
2. `Logger` - 103 edges
3. `DictionaryManager()` - 52 edges
4. `TranslationEngine Internals` - 44 edges
5. `passStringToWasm0()` - 32 edges
6. `Implementation Log` - 30 edges
7. `Domain Glossary` - 27 edges
8. `NumberProcessor` - 26 edges
9. `NumberProcessor` - 24 edges
10. `_assertNum()` - 24 edges

## Surprising Connections (you probably didn't know these)

- `bench_two_phase_processing()` --calls--> `parse_pattern()` [INFERRED]
  wasm-core/benches/pattern_matching.rs → wasm-core/src/pattern_processor/parser.rs
- `build_lookup_index()` --calls--> `build_comprehensive_lookup_index()` [INFERRED]
  src-tauri/src/dictionary_commands.rs → src-tauri/src/lookup_index_engine.rs
- `bench_single_pattern_match()` --calls--> `parse_pattern()` [INFERRED]
  wasm-core/benches/pattern_matching.rs → wasm-core/src/pattern_processor/parser.rs
- `bench_pattern_competition()` --calls--> `parse_pattern()` [INFERRED]
  wasm-core/benches/pattern_matching.rs → wasm-core/src/pattern_processor/parser.rs
- `bench_phase_a_processing()` --calls--> `parse_pattern()` [INFERRED]
  wasm-core/benches/pattern_matching.rs → wasm-core/src/pattern_processor/parser.rs

## Import Cycles

- None detected.

## Communities (351 total, 54 thin omitted)

### Community 0 - "dictionary_commands.rs"

Cohesion: 0.08
Nodes (70): BatchDictionaryResponse, BatchDictionaryResult, build_lookup_index(), build_trie_from_entries(), CacheHealthResponse, check_dictionary_cache_health(), check_json_depth(), create_proper_nouns_dictionary() (+62 more)

### Community 1 - "number_processor.rs"

Cohesion: 0.06
Nodes (39): ConversionPattern, create_conversion_patterns(), create_number_map(), NumberMatch, NumberProcessor, test_bu_yao_dao_shi_yi_tiao_no_panic(), test_converter_hundreds_range(), test_converter_implicit_tens() (+31 more)

### Community 2 - "Logger"

Cohesion: 0.07
Nodes (36): DictionaryEntry(), DictionaryEntryProps, DuplicateDictionaryTableViewProps, CommitMutation, DictionaryHistoryAPI, InvalidateEngine, useDictionaryEntryFilter(), DictionaryEntryFormDeps (+28 more)

### Community 3 - "WasmPatternProcessor.js"

Cohesion: 0.18
Nodes (21): fireCascadeRetire(), _handlers, registerCascadeHandler(), getPhase2Priority(), jsFallback(), jsFallbackPhase2(), packMatches(), packMatchesPhase2() (+13 more)

### Community 4 - "V8OptimizationUtils.js"

Cohesion: 0.05
Nodes (16): OptimizationBenchmarks, cacheEntryIterator, dictionaryEntryIterator, getV8OptimizationMetrics(), memoryStatsIterator, optimizationMetrics, performanceMetricsIterator, printV8OptimizationReport() (+8 more)

### Community 6 - "_assertNum"

Cohesion: 0.09
Nodes (22): addToExternrefTable0(), _assertBoolean(), _assertNum(), buf, CoreTranslationEngine, debugString(), DictionaryEngine, getDataViewMemory0() (+14 more)

### Community 7 - "DictionaryManagerTypes.d.ts"

Cohesion: 0.04
Nodes (50): CacheConfiguration, DebugLevel, DictionaryData, DictionaryEntry, DictionaryEntryMetadata, DictionaryLoadOptions, DictionaryManagerInterface, DictionaryManagerOptions (+42 more)

### Community 8 - "TranslationEngineTypes.d.ts"

Cohesion: 0.04
Nodes (49): AdvancedPerformanceStats, BatchPerformanceMetrics, CharacterOnlyResult, ConfigurationLoadResult, DebugLevel, DictionaryFilter, DictionaryManagerConfig, DictionaryMatch (+41 more)

### Community 9 - "Translator.jsx"

Cohesion: 0.06
Nodes (43): useDictionary(), Translator(), TOAST_DURATIONS, TOAST_IDS, ToastDuration, ToastId, TranslationExecutionContext, useAutoTranslateTrigger() (+35 more)

### Community 10 - "Fiction Structural Pattern Dictionaries — Implementation Plan"

Cohesion: 0.04
Nodes (46): 1a. Add `list_fiction_pattern_dictionaries`, 1b. Add `create_structural_patterns_dictionary`, 1c. Add `rename_structural_patterns_dictionary`, 1d. Modify `rename_proper_nouns_dictionary` — cascade, 1e. Register in `lib.rs`, code:block1 (Fiction key: "DuongThan" (or with f_ prefix in dict IDs: "f), code:js (// Merge fiction structural pattern dicts into filtered.patt), code:ts (if (dictionaryId.startsWith('properNouns-f_')) {) (+38 more)

### Community 11 - "Systematic Refactoring: Pure Utility Extraction"

Cohesion: 0.04
Nodes (48): 1.1 ChineseNumberConverter.js (400-500 lines), 1.2 useScrollPositionManager.js (300 lines), 1.3 TranslationInputValidator.js (100 lines), 2.1 PatternTemplateEngine.js (150-200 lines), 2.2 SemanticPositionMapper.js (300-400 lines), 3.1 useTranslationController.js (200 lines), 3.2 useDictionaryReload.js (250 lines), 4.1 Remove duplicate escapeRegExp implementations (+40 more)

### Community 12 - "TranslationEngine Internals"

Cohesion: 0.04
Nodes (48): `addUnit` Requires All 6 Args at Every Call Site, `addUnit` Third Arg Must Be a Valid `PHASE_PRIORITIES` Key, All 5 WASM Wrappers Share One Binary — Cascade-Retire Required, All 6 WASM Wrappers Share One Binary — Cascade-Retire Required, `applyHierarchicalResults` Has No Overlap Check — Do Not Add One, `applyHierarchicalResults` (Phase 1) Does Not Set `isGrouped` or `groupedWith`, `applyMatchToTokens` Orphan-Release Loop Must Not Be Removed, `buildSegmentsFromPositions` Fires Only When ALL `metadata[].originalStart >= 0` (+40 more)

### Community 13 - "UtilityTypes.d.ts"

Cohesion: 0.04
Nodes (47): ArrayElement, AsyncCallback, AsyncConsumer, AsyncFunction, AsyncMapper, AsyncPredicate, AsyncReducer, AsyncSupplier (+39 more)

### Community 14 - "Future Optimization Work - Deferred Integrations"

Cohesion: 0.05
Nodes (45): code:javascript (// Import added), code:javascript (try {), code:javascript (// Must verify exact matches for:), code:bash (# Found only 13 regex compilations total), code:rust (// Rust implementation), code:javascript (async function* translateStream(text, options) {), code:javascript (// Build-time script), code:javascript (// Line 4062: postProcess(tokens, options)) (+37 more)

### Community 16 - "Content Security Policy (CSP) and WASM Security"

Cohesion: 0.04
Nodes (45): 1. ✅ Local-Only WASM Loading (CRITICAL), 2. ✅ Binary Integrity Verification (SHA-256 Hashing), 3. ✅ Module Structure Verification, 4. ✅ Instance Method Verification, 5. ✅ Graceful Degradation, 6. ✅ Retry Logic with Exponential Backoff, 7. ✅ No Dynamic WASM Loading, Attack Scenarios (If Exploited) (+37 more)

### Community 17 - "Tauri Backend Security Audit"

Cohesion: 0.05
Nodes (43): code:rust (// dictionary_commands.rs:173), code:json ({), code:html (<!-- Should be blocked: -->), code:rust (// No size check before parsing potentially huge JSON), code:javascript (// Send 1GB JSON file), code:rust (// Add size limits configuration), code:rust (lazy_static! {), code:rust (self.cache.lock().unwrap().get(key).cloned() // Panics on p) (+35 more)

### Community 18 - "Future Improvements Implementation - 2026-02-01"

Cohesion: 0.05
Nodes (42): Behavior Changes, Benefits, Code Documentation, code:javascript (// WasmPatternProcessor.js:111), code:json ({), code:bash (cargo check --manifest-path src-tauri/Cargo.toml), code:bash (cargo check --manifest-path wasm-core/Cargo.toml), code:bash (npm test -- --run) (+34 more)

### Community 19 - "WASM Code Review Fixes - 2026-01-28"

Cohesion: 0.04
Nodes (44): code:javascript (// Record sequential fallback success after batch failure), code:javascript (import { categorizeWasmError, formatWasmError } from './wasm), code:javascript (// Chinese: 3 bytes/char (typical CJK in UTF-8)), code:javascript (const PATTERN_WARNING_COOLDOWN = 10 * 60 * 1000; // 10 minut), code:javascript (// CODE REVIEW NOTE (MEDIUM-4): Performance degradation moni), code:rust (/// CODE REVIEW FIX (MEDIUM-5): TODO - Expose regex compilat), code:javascript (/**), code:javascript (import { cleanupWasmNumberProcessor } from './utils/WasmNumb) (+36 more)

### Community 20 - "Test Coverage Improvements Summary"

Cohesion: 0.05
Nodes (43): 1. ErrorBoundary.test.tsx (27 tests), 1. TokenHelpers.test.js (37 tests), 1. WasmTypes.test.ts in Wrong Directory, 2. MoveEntryDialog.test.tsx (24 tests), 2. PatternPriorityCalculator.test.js (26 tests), 2. Test Assertion Failures in MemoryLeakDetector, 3. LRUCache.test.ts (36 tests), 3. Pattern Priority Test Expectations (+35 more)

### Community 21 - "WASM Serialization Optimization Implementation Plan"

Cohesion: 0.05
Nodes (41): Batch Operations (Medium Priority):, code:rust (use serde_wasm_bindgen;), code:rust (use bincode;), code:javascript (// src/utils/WasmNumberProcessor.js), code:javascript (// src/utils/WasmDictionaryManager.js), code:javascript (async benchmarkWasmSerializationOptimization() {), code:javascript (// Verify optimized method produces identical results), code:rust (use js_sys::Array;) (+33 more)

### Community 22 - "WASM Dictionary Trie - Final Summary & Decision"

Cohesion: 0.05
Nodes (42): Before Enabling WASM Dictionary Trie:, Code Inventory, code:block1 (WASM Total: 33.574ms), code:javascript (// In TranslationEngine.js:), code:block2 (Current overhead: ~15-20ms (boundary + marshaling)), code:javascript (// Add to WasmDictionaryTrie:), code:block4 (Current: 1,700 calls × 0.02ms overhead = 34ms), code:block5 (Dictionary Size | JS Map | WASM Trie | Winner) (+34 more)

### Community 23 - "Number Processing Phase - Code Review Fixes"

Cohesion: 0.05
Nodes (41): 1. Added Comprehensive Test Coverage ✅ **[BLOCKING]**, 2. Fixed Unsafe Regex Compilation ✅ **[CRASH RISK]**, 3. Fixed Memory Leak in Rust Regex ✅ **[PERFORMANCE]**, 4. Improved Error Handling ✅, 5. Fixed Token Span Validation ✅, 6. Added Performance Monitoring ✅, 7. Documented Magic Numbers ✅, All Tests Passing ✅ (+33 more)

### Community 24 - "Troubleshooting Guide"

Cohesion: 0.05
Nodes (42): code:bash (# Click "Reload Dictionary" button (clears cache + reloads d), code:bash (# Step 1: Verify import), code:bash (npm run tauri:build), code:typescript (interface WasmToken {), code:typescript (// CRITICAL-1: React async operations), code:javascript (// CRITICAL-2: WASM pattern processor), code:javascript (// CRITICAL-3: Translation engine initialization), code:javascript (// HIGH-2: Rust lookup index fallback) (+34 more)

### Community 25 - "Memory Leak Prevention"

Cohesion: 0.05
Nodes (42): Analyze Performance Baselines, Architectural restructuring, Bounded Collection Pattern, Built-in Pattern Matching Profiler, Cache Invalidation (Unified API), Cache Management, Check Cache Performance, Check Real Memory Usage (+34 more)

### Community 26 - "PerformanceMonitoringTypes.d.ts"

Cohesion: 0.05
Nodes (41): AggregatedStats, AlertThresholds, BaselineMetrics, BaselineSummary, BaselineTrackerOptions, BenchmarkEnvironment, BenchmarkResults, BenchmarkScenario (+33 more)

### Community 27 - "Code Review Fixes - 2026-02-01 (Second Review)"

Cohesion: 0.09
Nodes (29): Code Review Fixes - 2026-02-01 (Second Review), code:rust (// CODE REVIEW FIX (2026-02-01): Document that mutex is perm), code:javascript (if (!manifest) {), code:javascript (// CODE REVIEW FIX (2026-02-01): Track pending cleanup callb), code:javascript (// CODE REVIEW FIX (2026-02-01): Track and cancel cleanup ca), code:javascript (// CODE REVIEW FIX (2026-02-01): Cancel all pending cleanup ), code:javascript (const startPos = segment.startPosition;), code:javascript (// CODE REVIEW FIX (2026-02-01): Prevent integer overflow in) (+21 more)

### Community 28 - "Development Guide"

Cohesion: 0.05
Nodes (41): Active vs Dead Code, Architecture / Extraction, CI/CD Pipeline, Code Formatting (Prettier), code:javascript (// Extend around existing systems without modifying core log), code:bash (# Development), code:bash (pnpm format # Format all src/ files), code:json (// .vscode/settings.json) (+33 more)

### Community 29 - "lookup_index_engine.rs"

Cohesion: 0.12
Nodes (32): build_comprehensive_lookup_index(), build_index_parallel(), build_index_serial(), categorize_matches(), CategorizedMatches, Dictionary, DictionaryMatch, DictionaryType (+24 more)

### Community 30 - "PatternProcessingTypes.d.ts"

Cohesion: 0.05
Nodes (40): AbsorptionInfo, CompositeDetectionConfig, CompositeGeneratorConfig, CompositePatternDetector, CompositePatternResult, DecisionEngineResult, PatternAnalysisResult, PatternCategorizationResult (+32 more)

### Community 31 - "TypeScript/Rust Optimization Progress Report"

Cohesion: 0.05
Nodes (40): 1. TypeScript Migration Best Practices, 2. Algorithm Optimization (LRUCache), 3. Type Safety Benefits (Real-World), Breaking Changes, Code Quality Metrics, code:typescript (// Before: O(n) - Map re-insertion reorganizes all subsequen), code:typescript (// Before: JavaScript - runtime type errors possible), code:typescript (// Before: JavaScript - capacity overflow possible) (+32 more)

### Community 32 - "Code Review Fixes - Implementation Summary"

Cohesion: 0.05
Nodes (40): Automated Testing, Backward Compatibility: FULL, Breaking Changes: NONE, Code Consistency, Code Review Fixes - Implementation Summary, code:javascript (// Consistent pattern across all phases:), code:javascript (const validateConsumedTokenContract = (phaseName) => {), code:javascript (// NOTE (CODE REVIEW 2026-01-27): This cache is primarily us) (+32 more)

### Community 33 - "Pattern Processing Code Review Fixes"

Cohesion: 0.05
Nodes (40): code:block1 (✓ src/test/PatternPriorityCalculator.test.js (25 tests) 4ms), code:bash (npm test -- PatternPriorityCalculator --run), code:javascript (// In browser console), code:javascript (// Constructor initialization), code:javascript (if (tokens.length !== tokensLengthBeforePhase) {), code:javascript (if (failedPhases.length > 0) {), code:javascript (const VALID_TOKEN_TYPES = ['literal', 'variable'];), code:javascript (// Module-level state) (+32 more)

### Community 34 - "Clickable Highlighting - Code Review Fixes Summary"

Cohesion: 0.05
Nodes (39): Clickable Highlighting - Code Review Fixes Summary, code:javascript (if (bestMatch.length !== originalTranslation.length) {), code:bash (npm test -- ClickableHighlighting.fixes.test.js --run), code:bash (npm run type-check), code:javascript (if (process.env.NODE_ENV === 'development' && usingMetadata)), code:javascript (validateArrays() {), code:typescript ((onSegmentClick as any)({ unitIndex, originalText, ... }); /), code:typescript (const payload: SegmentClickPayload = {) (+31 more)

### Community 35 - "TranslationEngine.js"

Cohesion: 0.13
Nodes (21): MEMORY_THRESHOLDS, MemoryThresholds, UI_UPDATE_THRESHOLDS, UIUpdateThresholds, DEVICE_MEMORY_LIMITS, DICTIONARY_LOOKUP, getAdaptiveMaxSegments(), MEMORY_MANAGEMENT (+13 more)

### Community 36 - "Dictionary Trie Integration Session Summary"

Cohesion: 0.05
Nodes (39): 1. Imports (Lines 135-142), 2. Feature Flag (Lines 283-297), 3. Dictionary Loading (Lines 1233-1266), 4. WASM Lookup Wrapper (Lines 8481-8536), 5. Lookup Integration (Lines 8541-8594), 6. Cache Invalidation (Lines 9612-9645), Architecture: WASM-First with JavaScript Fallback, 📝 Code Changes Summary (+31 more)

### Community 37 - "System Architecture"

Cohesion: 0.05
Nodes (39): 1. Character-only mode, 1. WASM Number Processor, 2. Full Translation mode, 2. WASM Pattern Processor, 3. WASM Dictionary Engine, 4. Rust Lookup Index, 5-Phase Translation Pipeline (IMMUTABLE), `applyFinalCleanup()` - Final Spacing Fixes (+31 more)

### Community 39 - "Punctuation Spacing Debug Session - 2026-02-02"

Cohesion: 0.06
Nodes (35): 1. Documentation Improvements, 1. `src/utils/TranslationEngine.js`, 1. Understanding Code Flow is Critical, 2. Add Execution Path Diagrams, 2. `src/utils/PunctuationProcessor.ts`, 2. Understanding When Functions Are Called, 3. Lightweight Always-On Logging, 3. `src/utils/TextChunker.js` (+27 more)

### Community 41 - "EnhancedVirtualizedDictionaryTable.tsx"

Cohesion: 0.06
Nodes (40): EnhancedVirtualizedDictionaryTable(), EnhancedVirtualizedDictionaryTableProps, SemanticTypePicker(), SemanticTypePickerProps, supportsSemanticTypes(), BadgeProps, VirtualRowComponent, VirtualRowProps (+32 more)

### Community 43 - "Implementation Log"

Cohesion: 0.05
Nodes (37): A1 — lookup_index_engine.rs: chars pre-collection, A2 — LazyDictionaryContext: useMemo on context value, A3 — EnhancedVirtualizedDictionaryTable: three sub-fixes, A4 — TranslationSegmentCache: sync keys + O(1) metadata ops, A5 — pattern_processor/matcher.rs: AtomicBool + lock consolidation, A6 — pattern_processor/two_phase.rs: clone elimination, B1 — PunctuationProcessor: pre-compiled regexes, B2 — useConfigurationLoader: side-effect in useState initializer (+29 more)

### Community 44 - "Code Review Fixes - Translation Process"

Cohesion: 0.06
Nodes (34): Code Review Fixes - Translation Process, code:javascript (// Before:), code:javascript (// src/constants/TranslationConstants.js), code:bash (Test Files 28 passed (28)), code:javascript (// Validate structure BEFORE mutating original tokens array), code:javascript (this.patternFailureCount++;), code:javascript (// New method to find unprocessed ranges), code:javascript (cleanupOldSegments() {) (+26 more)

### Community 45 - "DictionaryEngine"

Cohesion: 0.08
Nodes (7): base36_encode(), DictionaryEngine, DictionaryEntry, DictionaryVersion, generate_content_hash(), PerformanceStats, VersionedDictionary

### Community 46 - "Pattern Matching Rust WASM Migration Complete ✅"

Cohesion: 0.06
Nodes (35): 1. Fixed JavaScript Parity Gap ✅, 2. Created Parity Verification System ✅, 3. Verified Complete Parity ✅, 4. Removed JavaScript Fallback ✅, 5. Updated Documentation ✅, Best Practices Established, Build Verification ✅, Code Quality (+27 more)

### Community 47 - "CSP Hardening Migration - Complete Summary"

Cohesion: 0.06
Nodes (35): 1. Column Width Ratio (TranslatorDisplayPanels), 1. Flexbox Behavior, 2. CSS Property Typo (AppearanceManager), 2. Third-Party Library CSS, 3. CSS Module Import Syntax, 3. Toast Styling in Production Build, 4. Dynamic Styles Decision, Bugs Fixed (+27 more)

### Community 48 - "ViewportTypes.d.ts"

Cohesion: 0.06
Nodes (34): AcceleratedMapperStats, AcceleratedPerformanceStats, AcceleratedPositionMapperInterface, AcceleratedPositionMapperOptions, AccelerationConfiguration, AccelerationInfo, AccelerationStrategy, ContentAwareCacheStats (+26 more)

### Community 49 - "FallbackManager"

Cohesion: 0.11
Nodes (18): comparePatternResults(), PARITY_TEST_CASES, runAllParityTests(), testPatternParity(), fetchWasmBinary(), wasmBinaryCache, computeSHA256(), EXPECTED_EXPORTS (+10 more)

### Community 50 - "ADR-004: 5-Phase Processing Order Immutability"

Cohesion: 0.06
Nodes (33): ADR-004: 5-Phase Processing Order Immutability, Alternative 1: Reorder Phases for Performance, Alternative 2: Parallel Processing (All Phases Simultaneously), Alternative 3: Keep Current Sequential Order (Patterns First) ✅ SELECTED, Alternatives Considered, Architectural Implications, code:block1 (1. Numbers (Phase 3) - WASM-accelerated, 5-10x faster), code:block10 (Sequential: Phases coordinate via shared token state (synchr) (+25 more)

### Community 51 - "Task 1: Add Semantic column to Patterns dictionary table"

Cohesion: 0.07
Nodes (30): Background for the Implementer, code:block1 (checkbox(40px) | source(calc(25%-20px)) | translation(55%) |), code:tsx (<div className={styles.cellEditable} style={{ width: '55%' }), code:tsx (<div className={styles.cellEditable} style={{ width: '43%' }), code:tsx (const semanticType = entry.metadata?.semanticType ?? '';), code:tsx ({), code:bash (npm run type-check 2>&1 | tail -5), code:bash (npm test -- --run 2>&1 | tail -10) (+22 more)

### Community 52 - "ComponentTypes.d.ts"

Cohesion: 0.06
Nodes (33): AppConfiguration, AppearanceSettings, AsyncOperationState, ClickableSegmentProps, ClickDirection, DictionaryEntry, DictionaryEntryMetadata, DictionaryInfo (+25 more)

### Community 53 - "UITypes.d.ts"

Cohesion: 0.06
Nodes (33): AnimationConfig, AnimationTiming, Breakpoints, ColorScheme, CSSVariables, FontWeight, KeyboardShortcut, LayoutConfig (+25 more)

### Community 55 - "WASM Code Review Fixes - 2026-01-27"

Cohesion: 0.06
Nodes (32): 1. Memory Pool Cleanup Verification, 2. Race Condition in WASM Initialization, 3. Unbounded Error Counter Growth, 4. Unsafe Buffer Size Calculation, 5. Missing Null Check in Pattern Processor, 6. Metadata JSON Parsing Without Size Limit, 7. Inconsistent Cleanup Method Naming, 8. Trie Traversal Performance Optimization (+24 more)

### Community 56 - "Code Review Fixes - February 1, 2026"

Cohesion: 0.06
Nodes (32): 1. WASM Initialization Race Condition ✅, 2. Missing Input Sanitization in Tauri IPC Commands ✅, 3. Memory Leak: Timeout Not Cleared on Component Unmount ✅, 4. Potential Integer Overflow in Position Mapping ✅, 5. WASM Validation Only Checks Structure, Not Content Integrity ✅, 6. Dictionary Reload State Race Condition ✅, 7. Inconsistent Error Handling Between Sequential and Batch Dictionary Loading ✅, 8. Excessive console.log Usage Despite Logger Utility ✅ (+24 more)

### Community 57 - "EventTypes.d.ts"

Cohesion: 0.06
Nodes (31): AppearanceChangeEvent, AppEvent, CacheClearEvent, CacheHitEvent, CacheMissEvent, ConfigurationChangeEvent, ConfigurationErrorEvent, ConfigurationSaveEvent (+23 more)

### Community 58 - "Handoff: Shared WASM Module Panic Cascade"

Cohesion: 0.08
Nodes (28): code:js (registerCascadeHandler(fn); // called once at module load by), code:block2 (panicked at /...alloc/src/rc.rs:3743:13:), code:rust (let _ = &*NUMBER_MAP;), code:block4 (panicked at /...wasm-bindgen-0.2.100/src/rt/mod.rs:287:25:), code:rust (// Pre-warm regex-automata Pool<Cache> (regex 1.11 / regex-a), code:block6 ([Error] ❌ WASM number processing wasm_runtime error:), code:block7 ([Error] ❌ "WASM assembleWithSpacing failed, retiring instanc), Error (+20 more)

### Community 60 - "wasm_boundary.rs"

Cohesion: 0.21
Nodes (6): batchLog, debugObjectPool, getLogEntry(), getPerformanceMetric(), releaseLogEntry(), releasePerformanceMetric()

### Community 61 - "OptimizationBenchmarks"

Cohesion: 0.12
Nodes (16): AppearanceResult, BatchDictionaryResponse, BatchDictionaryResult, ConfigurationResult, DictionaryListResult, DictionaryLoadResult, DictionaryOperationResult, DirectorySelectOptions (+8 more)

### Community 62 - "ClickableTypes.d.ts"

Cohesion: 0.07
Nodes (28): BaseSegment, ClickableOriginalOptimizedProps, ClickableOriginalSemanticProps, ClickablePerformanceMetrics, ClickableSegment, ClickableTranslationOptimizedProps, ClickableTranslationSemanticProps, ClickDirection (+20 more)

### Community 63 - "Phase 8 Tests - Pattern Matching Validation"

Cohesion: 0.07
Nodes (27): code:bash (npm run tauri:dev), code:javascript (await runTest1_1()), code:javascript (// In your React component), code:javascript (const { runTest1_1 } = require('./phase8-test-1.1-basic-patt), code:block6 (========================================), code:block7 (❌ FAIL: No match found for "张三的手"), code:javascript (window.translationEngine = yourEngineInstance;), Expected Output (+19 more)

### Community 64 - "ToastContext.tsx"

Cohesion: 0.11
Nodes (19): AppContent(), AppearanceManager(), setGlobalToast(), ToastContainer(), ToastContext, ToastContextType, ToastInternalContext, ToastProvider() (+11 more)

### Community 65 - "TextTokenizer.ts"

Cohesion: 0.12
Nodes (12): GroupedToken, PhraseCandidate, ProcessingStrategy, TextAnalysis, TextComplexity, Token, TokenGroups, TokenType (+4 more)

### Community 66 - "Domain Glossary"

Cohesion: 0.07
Nodes (27): AppConfig, AppearanceSettings (hook), CharacterOnlyBridge, ChunkPostProcessor, DictionaryBackend, DictionaryCRUD, DictionaryEntryForm, DictionaryHealthMonitor (+19 more)

### Community 67 - "ADR-003: TypeScript Hybrid Architecture"

Cohesion: 0.07
Nodes (26): ADR-003: TypeScript Hybrid Architecture, Alternative 1: Full TypeScript Migration, Alternative 2: Keep Everything JavaScript, Alternative 3: Strategic Hybrid (TypeScript for Boundaries, JavaScript for Core) ✅ SELECTED, Alternatives Considered, code:typescript (// TypeScript strict mode makes shared-mutable-state coordin), code:javascript (// package.json), code:block2 (✅ Pure utilities (zero `this.*` references)) (+18 more)

### Community 68 - "String Operations Rust Migration Plan"

Cohesion: 0.07
Nodes (26): Benchmark Evidence, Benchmark Setup, code:javascript (class PrecomputedTokenStrings {), code:rust (use wasm_bindgen::prelude::*;), code:javascript (import init, { StringProcessor } from '../wasm/translation_w), code:javascript (import { wasmStringProcessor } from './WasmStringProcessor.j), code:javascript (// Test with 200 tokens, maxSpan = 10 (typical 2000-char tex), Current Bottleneck (SemanticPatternProcessor.js:34-64) (+18 more)

### Community 69 - "matcher.rs"

Cohesion: 0.12
Nodes (12): build_result(), MatcherProfilingData, PatternMatcher, PatternMatcher<'a>, PatternMatchResult, PhaseAPattern, PhaseAResult, SemanticToken (+4 more)

### Community 70 - "HookTypes.d.ts"

Cohesion: 0.08
Nodes (25): AsyncState, DictionaryConfig, KeyModifiers, StreamingTranslationState, UseAsyncOptions, UseAsyncReturn, UseDebounceOptions, UseDebounceReturn (+17 more)

### Community 71 - "DictionaryContext.tsx"

Cohesion: 0.09
Nodes (28): DictionaryContext, DictionaryContextValue, DictionaryProvider(), DictionaryProviderProps, useDictionaryHistory(), useDictionaryPersistence(), useDictionaryCRUD(), usePersistSelectedDictionary() (+20 more)

### Community 72 - "text_assembly.rs"

Cohesion: 0.07
Nodes (25): assemble_original_text(), assemble_translated_text(), AssemblyResult, AssemblySegment, AssemblyStats, is_chinese_type(), needs_space(), PositionEntry (+17 more)

### Community 74 - "Code Review: Pure Computation Migration to wasm-core"

Cohesion: 0.08
Nodes (24): Candidate 1 — Wire `TextAssembler` into `postProcess()` (HIGHEST PRIORITY), Candidate 2 — `resolveGlobalConflicts()`: consolidate into Rust (MEDIUM PRIORITY), Candidate 3 — `applyFinalCleanup()` + `capitalizeFirstLetter()` + `applyLightFormatting()` as a bundled string post-processor (LOW PRIORITY), Candidate 4 — `findPositionOptimized()` and `buildSegmentsFromSemanticArrays()` batch position finding (LOW-MEDIUM PRIORITY), Candidate 5 — `estimateDictionaryDensity()` and `analyzeTextComplexity()` (NEGLIGIBLE), `ChineseNumberConverter.js`, Code Quality Issues Found (Not WASM-related), Code Review: Pure Computation Migration to wasm-core (+16 more)

### Community 75 - "Code Review Fix Summary - 2026-01-27"

Cohesion: 0.08
Nodes (24): ✅ ALL CRITICAL & HIGH PRIORITY ISSUES FIXED, ✅ Automated Checks Pass, ⏳ Automated Tests Recommended, Breaking Changes: NONE, Code Review Fix Summary - 2026-01-27, code:javascript (// 1. Consumed Token Contract Validation), code:javascript (// Phase X:), code:bash (npm run type-check # ✅ 0 errors) (+16 more)

### Community 76 - "passStringToWasm0"

Cohesion: 0.18
Nodes (6): generateContentHash(), getArrayJsValueFromWasm0(), getStringFromWasm0(), normalizeSingle(), passStringToWasm0(), RegexUtils

### Community 77 - ".new"

Cohesion: 0.17
Nodes (6): getGlobalChunkerStats(), getTokenizerStats(), normalizeBatch(), SegmentMatcher, takeFromExternrefTable0(), tokenizeText()

### Community 81 - "Task 1: Enable Semantic Type filter for Structural Patterns"

Cohesion: 0.12
Nodes (19): Background for the Implementer, code:ts (const showSemanticTypeFilter = isPhrasesDictionary || isProp), code:ts (const showSemanticTypeFilter =), code:bash (# TypeScript check:), code:bash (npm run type-check 2>&1 | tail -5), code:bash (npm test -- --run 2>&1 | tail -10), code:bash (git add src/components/dictionary/EnhancedVirtualizedDiction), Current flag (line ~1915) (+11 more)

### Community 83 - "BatchProcessingTypes.d.ts"

Cohesion: 0.09
Nodes (21): AdaptationStats, AdaptiveChunker, AdaptiveChunkerOptions, BatchProcessingConfig, BatchProcessingResult, BatchProcessingStats, ChunkerDiagnosticInfo, ChunkingStrategy (+13 more)

### Community 84 - "DictionaryTypes.ts"

Cohesion: 0.31
Nodes (3): initializeWasm(), isWasmTextTokenizerSupported(), WasmTextTokenizer

### Community 85 - "DictionaryTrie"

Cohesion: 0.08
Nodes (13): calculateDictionaryChecksum(), deserializeTrie(), invalidatePrecomputedTrie(), PrecomputedTrieStats, savePrecomputedTrie(), serializeTrie(), tryLoadPrecomputedTrie(), DictionaryTrie (+5 more)

### Community 86 - "SegmentPrecomputer.ts"

Cohesion: 0.14
Nodes (15): getGraphemeLength(), MatchCandidate, segmentFromPositionMetadata(), buildSegmentsFromPositions(), findUnitMatch(), MatchResult, normalizeText(), precomputeOriginalSegments() (+7 more)

### Community 87 - "How to Run Baseline Benchmarks"

Cohesion: 0.09
Nodes (21): 1. Start the Development Server, 2. Open Browser DevTools, 3. Run Full Benchmark Suite, 4. Export Results, 5. Save Baseline, Benchmark Baseline Instructions, code:bash (npm run tauri:dev), code:javascript (// Run complete optimization benchmark suite) (+13 more)

### Community 88 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.09
Nodes (21): ADR-002: Dual-Path Clickable Highlighting Architecture, Alternative 1: Consolidate Into Unified Highlighting System, Alternative 2: Keep Separate Paths (Current Implementation) ✅ SELECTED, Alternative 3: Partial Consolidation (Helper Functions), Alternatives Considered, code:javascript (// Unified approach tried:), code:javascript (// Component: ClickableTranslationSemantic.tsx (src/compone), code:javascript (// Component: ClickableTranslationOptimized.tsx (src/compon) (+13 more)

### Community 89 - "Implementation Details ✅"

Cohesion: 0.20
Nodes (10): code:javascript (dispose() {), code:javascript (this.syncFailureTracking = {), code:javascript (const MAX_REASON_LENGTH = 200;), code:javascript (const validFailures = this.syncFailureTracking.failureReason), code:javascript (const MAX_CHARACTER_PREWARM = Math.floor(this.characterCache), code:javascript (async preWarmNovelSpecificVocabulary(dictionaryManager, acti), CRITICAL-1: DictionaryManager Disposal ✅ IMPLEMENTED, CRITICAL-2: WasmDictionaryManager Circular Buffers ✅ IMPLEMENTED (+2 more)

### Community 90 - "PatternIndex"

Cohesion: 0.20
Nodes (8): PatternIndex, test_clear_index(), test_get_all_patterns(), test_get_nonexistent_pattern(), test_index_literal_starting_pattern(), test_index_mixed_patterns(), test_index_multiple_patterns_same_first_token(), test_index_variable_starting_pattern()

### Community 93 - "src/components/dictionary — Gotchas"

Cohesion: 0.10
Nodes (20): code:ts (const rafCalls: FrameRequestCallback[] = [];), Dictionary JSON Format: Two Tiers, Dictionary Type Classification, `DictionaryContext.tsx` CRUD Audit Checklist, `DictionaryInfo` Name Collision, `DuplicateDictionaryTableView` — Duplicate Rendering Not in EVDT, Error Handling, Hook Tests — jsdom Gotchas (+12 more)

### Community 94 - "conflict_resolution.rs"

Cohesion: 0.24
Nodes (18): flat(), resolve_global_conflicts(), resolve_match_conflicts(), run_conflict_resolution(), run_conflict_resolution_priority_first(), test_earlier_start_wins_on_equal_length_and_type(), test_input_not_mutated(), test_longer_beats_shorter_overlapping() (+10 more)

### Community 95 - "RegexUtils"

Cohesion: 0.16
Nodes (7): RegexUtils, test_chinese_punctuation(), test_number_range(), test_pattern_variables(), test_punctuation_positions(), test_sentence_splitting(), test_whitespace_normalization()

### Community 98 - "Rust Trie Dictionary Migration Plan"

Cohesion: 0.10
Nodes (19): Architecture Decision, Better Approach: Create Shared WASM Module, code:rust (// Tauri command pattern), code:rust (use std::collections::HashMap;), code:rust (mod dictionary_trie;), code:javascript (import init, { WasmDictionaryTrie } from '../wasm/translatio), code:javascript (import { wasmDictionaryTrie } from './WasmDictionaryTrie.js'), Current State: Dual Implementation (+11 more)

### Community 99 - "translation_wasm_core.js"

Cohesion: 0.23
Nodes (19): addToExternrefTable0(), buf, debugString(), disable_matcher_profiling(), enable_matcher_profiling(), getArrayU8FromWasm0(), getDataViewMemory0(), getUint8ArrayMemory0() (+11 more)

### Community 101 - "TextChunker"

Cohesion: 0.13
Nodes (3): testChunker(), TextChunk, TextChunker

### Community 102 - "TwoPhasePatternProcessor"

Cohesion: 0.16
Nodes (4): buildPatternVariableCache(), buildTypeFilter(), TwoPhasePatternProcessor, isWasmPatternProcessorReady()

### Community 103 - "precompute-dictionaries.js"

Cohesion: 0.27
Nodes (7): calculateChecksum(), DictionaryTrie, __dirname, __filename, main(), precomputeDictionary(), TrieNode

### Community 104 - "Documentation Index"

Cohesion: 0.11
Nodes (18): Additional Documentation, Architecture, Architecture Decision Records (ADRs), Archive, Clickable Highlighting, Code Reviews, Core Guides, Development (+10 more)

### Community 105 - "Completed Optimizations"

Cohesion: 0.11
Nodes (18): Best Practices, Code Optimization Summary (2026-01-29), Completed Optimizations, Lessons Learned, LRUCache Optimization, Performance Impact Summary, Progress: 9/9 Tasks Complete (100%) ✅, ✅ Task #1: SemanticArrayBuilder TypeScript Migration (+10 more)

### Community 108 - "TwoPhasePatternProcessor"

Cohesion: 0.23
Nodes (4): PatternProcessingResult, test_pattern_categorization(), TwoPhasePatternProcessor, TwoPhaseStats

### Community 109 - "CacheTypes.d.ts"

Cohesion: 0.11
Nodes (17): CacheEntry, CacheKeyGenerator, CacheKeyOptions, CacheStats, ContentAwarePositionCache, ContentAwarePositionCacheOptions, ContentAwarePositionCacheStats, ContentSignature (+9 more)

### Community 110 - ".applyMatchToTokens"

Cohesion: 0.19
Nodes (3): getTextFromTokens(), getTextPositionForTokenIndex(), reconstructTextFromIndex()

### Community 112 - "LRUCache"

Cohesion: 0.14
Nodes (4): ExtendedCacheStats, LRUCache, LRUCacheStats, LRUNode

### Community 113 - "ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation"

Cohesion: 0.11
Nodes (17): ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation, Alternative 1: Keep inline mutation per adapter ✗ Rejected, Alternative 2: Return results, single apply site ✅ Selected, Alternatives Considered, code:javascript (// @typedef PatternProcessor), code:javascript (`${result.translationSource}_consumed`;), Consequences, Context and Problem Statement (+9 more)

### Community 114 - "src/components — Gotchas"

Cohesion: 0.11
Nodes (17): Appearance Style Memos — Static Constants, Canonical Type Homes, `ClickableTranslationOptimized` Paragraph Logic, ConfigurationManager Settings Must Be Traced to the Engine, Engine Lifecycle — `useTranslatorEngine` Hook, Error Utilities, Global Singleton Lifecycle — `performanceHealth` / `systemPerformanceMonitor`, Global Singleton Lifecycle — `systemPerformanceMonitor` (+9 more)

### Community 115 - ".new"

Cohesion: 0.26
Nodes (10): PositionMapper, test_case_insensitive(), test_chinese_text(), test_chinese_text_second_occurrence(), test_find_all(), test_length_char_count(), test_not_found(), test_simple_search() (+2 more)

### Community 116 - "configValidation.ts"

Cohesion: 0.29
Nodes (4): AttemptFn, RecoveryOptions, ScrollPositionRecovery, ScrollPositions

### Community 117 - "Hotfix: Missing Method Safety Checks"

Cohesion: 0.15
Nodes (14): 1. Profiler Methods (2 locations), 2. System Performance Monitor (5 locations), 3. Performance Dashboard (1 location), code:javascript (// Before (unsafe)), code:javascript (// ✅ CORRECT: Check both existence and type), Date: 2026-01-27, Files Modified, Fix Applied (+6 more)

### Community 118 - "Clickable Highlighting Feature - Code Review"

Cohesion: 0.12
Nodes (16): Areas for Improvement, Benchmark Results (from documentation), Best Practices Observed, Clickable Highlighting Feature - Code Review, Conclusion, ✅ Excellent Practices, Executive Summary, Key Strengths (+8 more)

### Community 119 - "Security Considerations"

Cohesion: 0.12
Nodes (17): 2. Denial of Service (DoS) Prevention ⭐⭐⭐⭐, 3. Memory Safety ⭐⭐⭐⭐, 4. CSP Compliance ⭐⭐⭐⭐⭐, Array Size Warnings (ClickableTranslationSemantic.tsx:65-70), code:typescript (if (semanticArrays.translated.length > 10000) {), code:typescript (const elapsedMs = performance.now() - startTime;), code:typescript (const MAX_CACHE_SIZE = 100;), code:typescript (useEffect(() => {) (+9 more)

### Community 120 - "translation_wasm_core.d.ts"

Cohesion: 0.18
Nodes (14): BoundaryOptimizer, DictionaryEngine, InitInput, InitOutput, NumberProcessor, PositionMapper, RegexUtils, SegmentMatcher (+6 more)

### Community 121 - "ElectronTypes.d.ts"

Cohesion: 0.07
Nodes (25): ClickableOriginalSemantic(), ClickableTranslationSemantic(), HighlightableSegment, HighlightableSegmentProps, SegmentComponent, StreamingProgressBar, StreamingProgressBarProps, StreamingState (+17 more)

### Community 122 - "pattern.rs"

Cohesion: 0.19
Nodes (9): PatternMetadata, PatternToken, PatternUsage, SemanticPattern, test_low_priority_penalty(), test_pattern_token_creation(), test_priority_calculation(), test_variable_first_pattern() (+1 more)

### Community 123 - "WasmTypes.d.ts"

Cohesion: 0.12
Nodes (15): CoreTranslationEngine, WasmBenchmarkResult, WasmDictionaryEntry, WasmEngineStats, WasmError, WasmErrorType, WasmInit, WasmInitOptions (+7 more)

### Community 124 - "PerformanceTypes.d.ts"

Cohesion: 0.12
Nodes (15): MemoryStats, PerformanceAlert, PerformanceBaseline, PerformanceBaselineOptions, PerformanceDataPoint, PerformanceMetrics, PerformanceMonitorConfig, PerformanceProfilerOptions (+7 more)

### Community 125 - "SmartMemoryPressureDetector.ts"

Cohesion: 0.16
Nodes (13): BackgroundCleanupStats, CleanupTask, IdleDeadline, SmartMemoryCoordinatorOptions, CleanupEvent, CleanupPriority, MemoryEventCallback, MemoryEventData (+5 more)

### Community 126 - "WasmMemoryPoolManager.ts"

Cohesion: 0.20
Nodes (9): BufferMetadata, MemoryPoolStats, OptimizationRecommendation, PoolCategory, PoolConfig, PoolStats, WasmBufferAllocator, wasmMemoryPoolManager (+1 more)

### Community 128 - "SemanticArrayBuilder.ts"

Cohesion: 0.06
Nodes (14): getFirstGrapheme(), GraphemeHelper, DebugInfo, MemoryStats, PerformanceStats, PositionCandidate, PositionMappings, SemanticArrayBuilder (+6 more)

### Community 129 - "ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors"

Cohesion: 0.12
Nodes (15): ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors, Alternative 1: Copy-fix across all three processors ✗ Rejected, Alternative 2: Base class / mixin for WASM processors ✗ Rejected, Alternative 3: WasmProcessorLifecycle class ✅ Selected, Alternatives Considered, code:javascript (class WasmProcessorLifecycle {), Consequences, Context and Problem Statement (+7 more)

### Community 130 - "Design"

Cohesion: 0.13
Nodes (14): code:rust (// pattern.rs — PatternMetadata), code:rust (// parser.rs), code:rust (enhanced_cache.insert(matched_text.clone(), CacheEntry {), code:javascript (token.patternSemanticType = matchedPattern.semanticType ?? n), code:javascript (const entryType = token.patternSemanticType ?? null;), Constraints, Design, Design: Semantic Type for Structural Pattern Entries (+6 more)

### Community 131 - "V8OptimizationTypes.d.ts"

Cohesion: 0.13
Nodes (14): CacheEntryShape, DictionaryEntryMetadataShape, DictionaryEntryShape, HiddenClassMetrics, MemoryStatsShape, MetadataFlagsShape, MonomorphicFunction, PerformanceMetricsShape (+6 more)

### Community 135 - "GUI Framework Evaluation: Tauri vs. Rust-Native Alternatives"

Cohesion: 0.13
Nodes (14): App Constraints That Drive This Decision, Comparison Matrix, Current: Tauri v2, Dioxus, egui, Framework-by-Framework Analysis, gpui, GUI Framework Evaluation: Tauri vs. Rust-Native Alternatives (+6 more)

### Community 136 - "ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential"

Cohesion: 0.13
Nodes (14): ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential, Consequences, Context and Problem Statement, Decision, If Startup Latency Becomes a Problem, Implementation, Monitoring and Review, Negative (+6 more)

### Community 137 - "ADR-005: Eager Dictionary Loading via DictionaryContext"

Cohesion: 0.13
Nodes (14): ADR-005: Eager Dictionary Loading via DictionaryContext, Alternative 1: Complete the LazyDictionaryContext migration ✗ Rejected, Alternative 2: Keep eager loading, delete LazyDictionaryContext ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+6 more)

### Community 138 - "Task 6: UI — add semantic type selector to pattern entries"

Cohesion: 0.22
Nodes (10): code:bash (npm test -- --run), code:bash (npm run type-check), code:tsx ({), Step 1: No test needed for this visual change — run type-check instead, Step 2: Extend the condition to include patterns, Step 3: Run type-check, Step 4: Run full JS suite, Step 5: Manual smoke test (+2 more)

### Community 139 - "CRITICAL-3: TranslationCache - O(n) Cache Invalidation"

Cohesion: 0.18
Nodes (13): code:javascript (export class DictionaryManager {), code:block10 (TranslationCache.invalidateDictionary 89.3ms SLOW), code:javascript (/**), code:javascript (recordSnapshot(operation = 'unknown', context = {}) {), code:javascript (// During batch translation:), code:javascript (// Test memory cleanup), code:javascript (// After 2 hours of use with intermittent WASM failures:), code:javascript (// User switches from properNouns-NovelA to properNouns-Nove) (+5 more)

### Community 140 - "TrieNode"

Cohesion: 0.29
Nodes (5): MatchResult, test_basic_insertion_and_lookup(), test_entry_count(), test_no_match(), TrieNode

### Community 141 - "parse_pattern"

Cohesion: 0.25
Nodes (12): test_full_dictionary_parsing(), test_parse_and_index_workflow(), test_priority_ordering(), parse_pattern(), parse_patterns_dict(), test_parse_multi_variable_pattern(), test_parse_pattern_with_low_priority(), test_parse_pattern_with_repeated_variable() (+4 more)

### Community 142 - "ReadonlyOptimizationTypes.d.ts"

Cohesion: 0.14
Nodes (13): ApplyUpdatesOptions, ApplyUpdatesResult, CharacterPhaseContext, NumberPhaseContext, PatternPhaseContext, PhaseProcessingContext, PhrasePhaseContext, ProperNounPhaseContext (+5 more)

### Community 143 - "WordTransformToolbar.tsx"

Cohesion: 0.28
Nodes (13): WordTransformToolbar(), WordTransformToolbarProps, capitalizeAll(), capitalizeExceptLast(), capitalizeExceptLastThree(), capitalizeExceptLastTwo(), lowercaseAll(), moveLastNWordsToBeginning() (+5 more)

### Community 148 - "ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext"

Cohesion: 0.14
Nodes (13): ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext, Alternative 1: Move cache invalidation to `DictionaryContext` ✗ Rejected, Alternative 2: Keep invalidation in `handleForceReload` ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants, Decision (+5 more)

### Community 149 - "ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler"

Cohesion: 0.14
Nodes (13): ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler, Alternative 1: Full HotkeyRegistry ✗ Rejected, Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected, Alternative 3: Keep useHotkeyHandler ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+5 more)

### Community 150 - "ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error"

Cohesion: 0.14
Nodes (13): ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error, Alternative 1: Restore JS fallback in `TwoPhasePatternProcessor` ✗ Rejected, Alternative 2: Extract `WasmPatternBridge` seam ✗ Rejected, Alternative 3: Throw on `{ success: false }`, no bridge ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+5 more)

### Community 151 - "Task 3: Use `semantic_type` in Phase B enhanced cache (PRIMARY FIX)"

Cohesion: 0.20
Nodes (10): code:rust (/// A Phase A pattern with semanticType "person" should sati), code:rust (// CURRENT (hardcoded):), code:rust (// FIXED:), code:bash (git add wasm-core/src/pattern_processor/ wasm-core/tests/), code:bash (git add src/utils/TranslationEngine.js src/utils/**tests**/T), Step 1: Write a failing integration test, Step 2: Apply the fix in `two_phase.rs`, Step 4: Run full Rust test suite (+2 more)

### Community 152 - "Task 2: Parse `semanticType` from the JS pattern dictionary"

Cohesion: 0.24
Nodes (11): code:rust (let (template, allowed_variable_types, allow_as_pattern_vari), code:bash (cargo test --manifest-path wasm-core/Cargo.toml -- --test-th), code:rust (#[test]), code:javascript (import { describe, it, expect } from 'vitest';), Step 1: Write a failing test, Step 2: Run tests to verify they fail, Step 3: Run tests to verify the fix works, Step 3: Update `parse_patterns_dict` to read `semanticType` (+3 more)

### Community 153 - "Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`"

Cohesion: 0.40
Nodes (6): code:bash (npm test -- --run src/utils/**tests**/TwoPhasePatternProcess), code:javascript (// 1b. Cache pattern-translated tokens that carry an explici), Step 2: Run test to verify it fails, Step 3: Add the new block in `buildVariableCache`, Step 4: Run test, Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`

### Community 154 - "Dictionary Management and Memory Code Review"

Cohesion: 0.14
Nodes (13): Code Changes ✅ COMPLETED, Conclusion, Dictionary Management and Memory Code Review, Documentation 📝, Executive Summary, Immediate Actions (Within 1 Week), Long-Term Optimizations (Within 1 Month), Next Steps (+5 more)

### Community 156 - "Detailed Optimization Tracking"

Cohesion: 0.18
Nodes (11): code:javascript (// Run benchmarks), code:rust (// Rust already uses lazy_static for regex optimization), code:rust (/// Build index using parallel processing with Rayon), code:rust (// Option 1: Use wasm-bindgen's js-sys for zero-copy typed a), code:rust (pub struct TrieNode {), Detailed Optimization Tracking, ✅ Task #11: Performance Benchmarking Infrastructure, ✅ Task #2: Optimize WASM JSON Serialization (High-Impact #5) (+3 more)

### Community 157 - "Potential Issues and Recommendations"

Cohesion: 0.14
Nodes (14): code:typescript (// ClickableTranslationSemantic.tsx:169-180), code:typescript (if (usingMetadata) {), code:typescript (// src/utils/**tests**/PositionTracking.integration.test.ts), code:markdown (## Dual-Path Synchronization Checklist), code:typescript (// ClickableTranslationSemantic.tsx:217), code:typescript (// Recommendation: Extract to configuration), code:typescript (if (!usingMetadata) {), code:typescript (// Track how often we fall back to indexOf (production-safe)) (+6 more)

### Community 158 - "StringProcessor"

Cohesion: 0.24
Nodes (5): StringProcessor, test_build_cache_from_json(), test_cache_operations(), test_clear(), test_string_processor_basic()

### Community 159 - "WasmTextAssemblerWrapper"

Cohesion: 0.16
Nodes (4): createWasmTextAssembler(), isChinese(), needsSpace(), WasmTextAssemblerWrapper

### Community 160 - "TextChunker.js"

Cohesion: 0.23
Nodes (8): PunctuationComponents, PunctuationDebugInfo, SpecialPattern, NormalizeTarget, QUOTE_CATEGORIES, QUOTE_TYPES, QuoteInfo, QuoteTypeName

### Community 162 - "ContentAwarePositionCache.ts"

Cohesion: 0.60
Nodes (4): isCharacterSourceValid(), isPatternValid(), validateDictionaryEntry(), ValidationResult

### Community 163 - "Architecture Decision Records (ADRs)"

Cohesion: 0.15
Nodes (12): Active ADRs, [ADR-001: WASM Batch Loading — Remove Batch Wrapper](./ADR-001-wasm-batch-loading-failure.md), [ADR-002: Dual-Path Clickable Highlighting](./ADR-002-dual-path-clickable-highlighting.md), [ADR-003: TypeScript Hybrid Architecture](./ADR-003-typescript-hybrid-architecture.md), [ADR-004: 5-Phase Processing Order Immutability](./ADR-004-five-phase-processing-order-immutability.md), [ADR-006: PatternProcessor Interface](./ADR-006-pattern-processor-interface.md), ADR Format, Architecture Decision Records (ADRs) (+4 more)

### Community 164 - "ADR-011: Skip useTranslatorSession Coordinator Hook"

Cohesion: 0.15
Nodes (12): ADR-011: Skip useTranslatorSession Coordinator Hook, Alternative 1: Extract useTranslatorSession ✗ Rejected, Alternative 2: Keep coordination in Translator.jsx ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+4 more)

### Community 165 - "Task 4: JS cross-pass — store `patternSemanticType` on leader tokens"

Cohesion: 0.25
Nodes (9): Background, code:javascript (import { describe, it, expect, vi } from 'vitest';), code:bash (npm test -- --run src/utils/**tests**/TranslationEngine.patt), code:javascript (tokens[idx].patternSemanticType = result.semanticType ?? nul), code:tsx ({(activeDictionary === 'phrases' || activeDictionary.startsW), Step 1: Write a JS test, Step 2: Implement the change, Step 3: Run test (+1 more)

### Community 166 - "Task 1: Add `semantic_type` to Rust `PatternMetadata`"

Cohesion: 0.22
Nodes (9): code:bash (git add wasm-core/src/pattern_processor/parser.rs wasm-core/), code:bash (git add src/utils/TwoPhasePatternProcessor.js src/utils/__te), code:rust (#[derive(Debug, Clone, Serialize, Deserialize)]), code:bash (git add src/components/dictionary/DictionaryEntry.tsx), code:bash (git add wasm-core/src/pattern_processor/pattern.rs wasm-core), Step 3: Add the field to `PatternMetadata`, Step 4: Run test to verify it passes, Step 6: Commit (+1 more)

### Community 167 - "CRITICAL-1: DictionaryManager Missing Cleanup Method"

Cohesion: 0.22
Nodes (9): code:javascript (export class DictionaryTrie {), code:javascript (// Two async operations on same trie), code:javascript (findMatches(text, startPos = 0) {), code:javascript (constructor() {), code:javascript (const lightweightSnapshot = {), code:javascript (getSnapshotContext(snapshot) {), HIGH-1: MemoryLeakDetector WeakMap ✅ IMPLEMENTED, MEDIUM-1: DictionaryTrie - sharedMatchesArray Not Thread-Safe (+1 more)

### Community 168 - "High-Priority Issues 🟠"

Cohesion: 0.22
Nodes (9): code:javascript (delete(key: K): boolean {), code:javascript (// Cache manager manually clears old entries), code:javascript (returnBuffer(buffer: ArrayBuffer | null): void {), code:javascript (const buffer = pool.getBuffer(1024);), HIGH-2: LRUCache Eviction Stats ✅ IMPLEMENTED, HIGH-2: LRUCache - Missing Eviction Stats Update, HIGH-3: WasmMemoryPool - Buffer Double-Return Risk, HIGH-3: WasmMemoryPool Double-Return Protection ✅ IMPLEMENTED (+1 more)

### Community 169 - "7. Clickable Highlighting Feature Analysis"

Cohesion: 0.15
Nodes (13): 7. Clickable Highlighting Feature Analysis, Are They Doing Redundant Work?, code:block14 (TranslationEngine.translateWithSegments()), code:javascript ({), code:javascript (// Text: "màu trắng mà tôi thích"), code:typescript (interface Segment {), Component Architecture, Full Translation Highlighting Path (+5 more)

### Community 170 - "wasm-core Pattern Processor"

Cohesion: 0.15
Nodes (12): Build Profile, `number_processor.rs` Is Rust Spec Only — No WASM Export, PatternIndex Key Is First Char — Lookup Must Match, Phase A Composite-Coverage Scoring, Phase B Protection Blocks Shorter-or-Equal Matches, RUSTFLAGS for wasm32, `semanticType: "$X"` Resolves at Match Time, Test locations (+4 more)

### Community 171 - "text_chunker.rs"

Cohesion: 0.21
Nodes (4): test_basic_chunking(), test_punctuation_detection(), TextChunker, TextChunkResult

### Community 172 - "DictionaryTypes.d.ts"

Cohesion: 0.17
Nodes (11): CompiledPattern, DictionaryEntry, DictionaryMatch, DictionaryStats, DictionaryTrie, PatternDictionaryEntry, PatternMatchResult, PatternToken (+3 more)

### Community 175 - "WasmTextTokenizer"

Cohesion: 0.50
Nodes (4): Coverage Analysis, Test Quality Indicators, Testing Assessment, Testing Score: 9/10

### Community 178 - "AI Readiness Evaluation: chinese-translator-tauri"

Cohesion: 0.17
Nodes (11): 1. `translationSource: string` — 4 Phase-1 variants, silent priority-999 fallback, 2. `TranslationEngine.js` dual interface: return + shared pipeline state, 3. WASM binary staleness is structurally undiscoverable, AI Readiness Evaluation: chinese-translator-tauri, Behavioral Clarity Detail (Dimension 5), Recommended Changes, Scores, Summary (+3 more)

### Community 179 - "3. Performance Optimizations ⭐⭐⭐⭐⭐"

Cohesion: 0.17
Nodes (12): 3. Performance Optimizations ⭐⭐⭐⭐⭐, code:typescript (// Segments built during translation (TranslationEngine.js:p), code:typescript (// Try WASM first (8-20x faster)), code:typescript (// Uses Rust trie for O(n+k) matching instead of O(n*m*k)), code:typescript (// Previous: substring(currentPosition) creates new string E), code:typescript (// Pre-filter empty units before iteration), code:typescript (// Cache compiled regexes with LRU eviction), code:typescript (// Memoized segment component prevents re-renders) (+4 more)

### Community 180 - "WasmTypes.ts"

Cohesion: 0.12
Nodes (11): copyWasmTokens(), validateWasmDictionaryMatch(), validateWasmToken(), copyWasmTokens(), RustLookupMatch, validateWasmToken(), WasmBatchDictionaryResult, WasmDictionaryMatch (+3 more)

### Community 181 - "BoundaryOptimizer"

Cohesion: 0.14
Nodes (3): BoundaryOptimizer, TextAssembler, TextChunker

### Community 182 - "SegmentMatcher"

Cohesion: 0.40
Nodes (5): 2. Architectural Analysis, code:javascript (// Phase 1: Pattern processing consumes tokens), code:javascript (// No consumption - each token gets exactly one lookup), Critical Difference: Token Consumption, Why They're Separate

### Community 183 - "text_tokenizer.rs"

Cohesion: 0.29
Nodes (8): get_byte_position(), is_chinese_char(), is_digit(), is_latin_letter(), is_punctuation(), Token, tokenize_text(), TokenType

### Community 184 - "ErrorBoundary.tsx"

Cohesion: 0.20
Nodes (4): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, clearPanelLayoutStorage()

### Community 185 - "LookupIndexUtils.ts"

Cohesion: 0.33
Nodes (6): DictionaryCategory, getIndexedMatches(), IndexedMatch, isDictionaryCategory(), RUST_KEY, sortMatchesByPrecedence()

### Community 186 - "DebouncedProgressHandler"

Cohesion: 0.18
Nodes (5): DebouncedProgressHandler, LoadingCallback, LoadingState, ProgressCallbacks, ProgressData

### Community 187 - "wasmOperationTimeout.js"

Cohesion: 0.27
Nodes (5): callWasmWithTimeout(), createTimeoutWrapper(), DEFAULT_WASM_TIMEOUTS, TimeoutError, TimeoutManager

### Community 188 - "tauriAPI.ts"

Cohesion: 0.20
Nodes (8): CMD, LookupIndexDictionary, LookupIndexEntry, LookupIndexOptions, LookupIndexResult, ProperNounsListResult, ResetDictionariesOptions, tauriAPI

### Community 193 - "Code Review: TypeScript/Rust Optimization Opportunities"

Cohesion: 0.18
Nodes (10): Areas for Improvement 🔧, Code Quality Observations, Code Review: TypeScript/Rust Optimization Opportunities, Conclusion, Critical Test Files:, Excellent Practices ✅, For Each Migration:, Performance Impact Projections (+2 more)

### Community 194 - "Integration #3: V8 Optimization for Memory Tracking (Task #8)"

Cohesion: 0.29
Nodes (7): code:javascript (// Line 5881: Memory tracking), code:javascript (import { segmentIterator } from './V8OptimizationUtils.js';), code:javascript (// Phase 4: Find unprocessed tokens), code:javascript (import { scanTokens } from './ReadonlyOptimizationUtils.js';), Integration #3: V8 Optimization for Memory Tracking (Task #8), Integration #4: ReadonlyArray for Phase Processing (Task #5), 🟡 Priority 2: Medium-Impact, Medium-Risk

### Community 195 - "Testing Recommendations"

Cohesion: 0.18
Nodes (11): code:javascript (// Verify validatePhaseOrder catches violations), code:javascript (// Verify corruption detection in all phases), code:javascript (// Verify consumed tokens have correct structure), code:javascript (// Verify phase priority is respected), code:javascript (// Verify corruption detection per phase), Test 1: Phase Order Violation, Test 2: Token Array Corruption, Test 3: Consumed Token Contract (+3 more)

### Community 196 - "⚠️ MEDIUM-2: No Validation of WASM Token Modifications"

Cohesion: 0.18
Nodes (11): code:javascript (// Phase 1 & 2: Record profiling metrics (lines 6394-6397)), code:javascript (// After each phase), code:javascript (// Pre-validate array length (line 6569)), code:javascript (// No validation that WASM respects consumed tokens from ear), code:javascript (// Before WASM processing), code:javascript (// Timeout helper references PHASE_TIMEOUTS constant (line 6), code:javascript (// PHASE_TIMEOUTS (from constants file - verify these values), ⚠️ MEDIUM-1: Inconsistent Phase Completion Logging (+3 more)

### Community 197 - "Compilation Warnings - Explained"

Cohesion: 0.18
Nodes (10): Category 1: Future Integration APIs (18 warnings), Category 2: Helper/Utility Methods (8 warnings), Category 3: Dead Code from Earlier Phases (3 warnings), Compilation Warnings - Explained, Current Status, Fixed Warnings (7 total), Remaining Warnings (29 total) - All Expected, Summary (+2 more)

### Community 198 - "PositionMapper"

Cohesion: 0.08
Nodes (15): ModalErrorBoundaryProps, ModalErrorBoundaryState, installDevConsole(), DEBUG_LEVELS, extractHighFrequencyVocabulary(), generateCharacterCombinations(), warmNovelSpecificVocabulary(), charLengthToTokenCount() (+7 more)

### Community 205 - "Chinese-Vietnamese Translation App"

Cohesion: 0.20
Nodes (9): 5-Phase Pipeline (order is immutable), Architecture, Chinese-Vietnamese Translation App, code:bash (cargo check --manifest-path src-tauri/Cargo.toml # NOT cd +), Critical Constraints, Development, Dual-Path Architecture, Essential Commands (+1 more)

### Community 206 - "Chinese-Vietnamese Translation App"

Cohesion: 0.20
Nodes (9): 5-Phase Pipeline (order is immutable), Architecture, Chinese-Vietnamese Translation App, code:bash (cargo check --manifest-path src-tauri/Cargo.toml # NOT cd +), Critical Constraints, Development, Dual-Path Architecture, Essential Commands (+1 more)

### Community 207 - "✅ Successfully Integrated (6 Optimizations)"

Cohesion: 0.20
Nodes (10): code:bash (npm run precompute-dictionaries # Optional: pre-generate .t), code:javascript (// Get cache performance stats), Integration #2: Parallel Dictionary Loading (Task #9), Integration #3: V8 Optimization (Task #8), Integration #4: ReadonlyArray Optimization (Task #5), Integration #5: WASM String Processor (Task #3) - VERIFIED, Integration #6: WASM Text Chunking (NEW - HIGH PRIORITY), Integration #7: Dictionary Precomputation (NEW - BUILD-TIME + RUNTIME CACHING) (+2 more)

### Community 208 - "Identified Optimization Opportunities"

Cohesion: 0.20
Nodes (10): 2.1 WASM Position Mapping Module, 2.2 WASM Content Hash Generator, 3.1 LRUCache Doubly-Linked List ✅, code:javascript (// SemanticArrayBuilder.js:434-476), code:rust (// wasm-core/src/position_mapper.rs), code:javascript (// ContentAwarePositionCache.js:75-83), code:rust (use std::collections::hash_map::DefaultHasher;), Identified Optimization Opportunities (+2 more)

### Community 209 - "Optimization Integration Plan"

Cohesion: 0.20
Nodes (9): Approach: **Minimal Surface Area**, Critical Constraints (from CLAUDE.md), ❌ DO NOT MODIFY, Integration Strategy: Surgical Changes Only, Next Steps, Optimization Integration Plan, Principle: **Feature Flags + Graceful Degradation**, Questions for Review (+1 more)

### Community 210 - "Pattern Semantic Type Implementation Plan"

Cohesion: 0.20
Nodes (9): Background for the Implementer, code:bash (# Rust (run after every Rust task):), code:bash (# All Rust tests), Final Verification, How pattern-within-pattern type checking works today, Key files and line numbers, Pattern Semantic Type Implementation Plan, Running tests (+1 more)

### Community 211 - "Translation Paths Efficiency Review — 2026-02-07"

Cohesion: 0.20
Nodes (9): 10. Code Review Checklist, 11. Conclusion, 1. Path Comparison Matrix, 8. Memory & Performance Profile, Character-Only (same 1000-char text), Efficiency Verdict, Executive Summary, Full Translation (1000-char text, typical) (+1 more)

### Community 212 - "6. Edge Case Analysis"

Cohesion: 0.22
Nodes (9): 6. Edge Case Analysis, code:javascript (if (!text || typeof text !== 'string') {), code:javascript (if (numberCandidates.length > 25 && this.wasmManager?.number), code:javascript (if (text.length > USE_LOOKUP_INDEX_THRESHOLD && this.diction), code:javascript (// Use case-insensitive indexOf with offset to find each occ), ✅ HANDLED: Duplicate Translations, ✅ HANDLED: Empty Input, ✅ HANDLED: Mixed Chinese/Latin Text (+1 more)

### Community 213 - "5. Code Quality Review"

Cohesion: 0.20
Nodes (10): 5. Code Quality Review, code:javascript (// Full Translation - Line 2025), code:javascript (// Phase 1: Pattern Processing (Line 7869)), code:javascript (const USE_LOOKUP_INDEX_THRESHOLD = 50; // characters), code:javascript (const USE_LOOKUP_INDEX_THRESHOLD = 500; // characters), ✅ GOOD: Clear Separation of Concerns, ✅ GOOD: Performance Optimizations Already Applied, ✅ GOOD: Phase Execution Documentation (+2 more)

### Community 214 - "Part 6: Final Recommendations"

Cohesion: 0.20
Nodes (10): code:javascript (/**), code:javascript (// NEW FILE: src/constants/TranslationPhases.js), code:block13 (Input Text), code:mermaid (graph TD), P0: Keep As-Is (Confidence: 85%, Effort: 0h, Impact: HIGH), P1: Add Method-Level JSDoc (Confidence: 95%, Effort: 2-3h, Impact: MEDIUM), P2: Extract Constants (Confidence: 90%, Effort: 1-2h, Impact: LOW), P3: Create Visual Diagrams (Confidence: 100%, Effort: 1-2h, Impact: MEDIUM) (+2 more)

### Community 215 - "TypeScript/Rust Optimization Project"

Cohesion: 0.18
Nodes (10): 2026-01-31 - Session 1 (Infrastructure + Analysis), For Each Optimization:, Future Optimization Ideas:, Key Learnings:, Notes, Overall Integration Testing:, Progress Log, Testing Strategy (+2 more)

### Community 216 - "Code Quality Assessment"

Cohesion: 0.20
Nodes (10): 5. Testing Coverage ⭐⭐⭐⭐⭐, Code Quality Assessment, code:javascript (test('CRITICAL-1: setPositionByMatch should reject out-of-or), code:typescript (test('should use position metadata for duplicate units', () ), code:javascript (test('O(n*m) position mapping should complete in reasonable ), code:javascript (test('Integration: Full translation flow with position track), code:javascript (describe('Performance benchmarks', () => {), Test Categories (+2 more)

### Community 217 - "⚠️ CRITICAL-3: Consumed Token Contract Validation (MISSING)"

Cohesion: 0.20
Nodes (10): code:javascript (const REQUIRED_PHASE_ORDER = ['patterns', 'properNouns', 'nu), code:javascript (// Phase 1 (Patterns) - HAS corruption check ✅), code:javascript (// FIX: Add consistent corruption detection for ALL phases), code:javascript (// postProcess checks consumed tokens (lines 3542-3549)), code:javascript (// CRITICAL: No validation that phases correctly mark consum), code:javascript (// After Phase 1 (line ~6434)), ✅ CRITICAL-1: Phase Order Enforcement (GOOD), ⚠️ CRITICAL-2: Token Array Corruption Detection (INCONSISTENT) (+2 more)

### Community 218 - "Code Review: 5-Phase Processing Token Consumption"

Cohesion: 0.18
Nodes (10): Code Review: 5-Phase Processing Token Consumption, Conclusion, Executive Summary, High Priority (Within 1 Week), Immediate Actions (CRITICAL), Key Concerns, Key Strengths, Low Priority (Nice to Have) (+2 more)

### Community 219 - "Positive Findings ✅"

Cohesion: 0.20
Nodes (10): 1. Excellent Token Array Length Validation (Phases 1-2), 2. Robust Phase Order Enforcement, 3. Comprehensive Phase Failure Reporting, 4. Correct Consumed Token Handling in postProcess, 5. WASM Validation is Thorough, code:javascript (// Lines 6403-6429), code:javascript (const validatePhaseOrder = (phaseName) => {), code:javascript (const failedPhases = ['patterns', 'properNouns', 'numbers', ) (+2 more)

### Community 221 - "SemanticTypes.d.ts"

Cohesion: 0.22
Nodes (8): DictionaryMatch, PatternMatchResult, ProgressData, SemanticArrays, SemanticMetadata, Token, TranslationOptions, TranslationSegment

### Community 224 - "ComponentMemoryProfiler.ts"

Cohesion: 0.07
Nodes (35): BulkMoveDialog(), BulkMoveDialogProps, baseDictionaryTypes, baseValidation(), DictionaryTypeDefinition, getDictionaryTypes(), validateDictionaryEntry(), AvailableDictionary (+27 more)

### Community 225 - "TranslationInputValidator"

Cohesion: 0.28
Nodes (3): TranslationInputValidator, ValidationResult, ValidationStats

### Community 226 - "Implementation Status 🎯"

Cohesion: 0.40
Nodes (5): Critical Issues - ✅ ALL FIXED, High-Priority Issues - ✅ ALL FIXED, Implementation Status 🎯, Medium-Priority Issues - ✅ ALL FIXED, Performance Improvements Achieved

### Community 227 - "UnicodePunctuationDetector.ts"

Cohesion: 0.29
Nodes (6): CategoryInfo, CharacterInfo, CompiledRegexes, PunctuationCategory, ResolvedConfig, UnicodePunctuationConfig

### Community 229 - "ℹ️ LOW-1: Phase 3 Nested Try-Catch Complexity"

Cohesion: 0.50
Nodes (4): code:javascript (try {), code:javascript (// In translateSinglePass:), ℹ️ LOW-1: Phase 3 Nested Try-Catch Complexity, LOW Priority Issues

### Community 231 - "Optimization Master Index - Complete Reference"

Cohesion: 0.22
Nodes (8): Current Session (2026-01-31), 📚 Documentation Map, 🔮 Future Integration Work, Optimization Master Index - Complete Reference, Prior Work, Priority Roadmap, 📞 Quick Answers to Common Questions, 📋 Quick Navigation

### Community 232 - "Priority 1: TypeScript Migration (Type Safety + Performance)"

Cohesion: 0.22
Nodes (9): 1.1 SemanticArrayBuilder.js → TypeScript, 1.2 OptimizedSemanticArrayBuilder.js → TypeScript, 1.3 TranslationSegmentCache.js → TypeScript, 1.4 SegmentPrecomputer.js → TypeScript, code:typescript (interface SemanticArrayMetadata {), code:typescript (class OptimizedSemanticArrayBuilder {), code:typescript (interface CacheEntry {), code:typescript (interface PrecomputedSegment {) (+1 more)

### Community 233 - "Optimization Integration Session Summary"

Cohesion: 0.22
Nodes (8): 🎉 Conclusion, 📝 Documentation Created, Expected Overall Impact, Measured Gains, Optimization Integration Session Summary, 📊 Performance Improvements, 📖 Reference Documentation, 🎯 Session Objectives

### Community 234 - "ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider"

Cohesion: 0.22
Nodes (8): ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider, Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected, Alternative 2: Extract loadInitialState only ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers

### Community 235 - "Design"

Cohesion: 0.22
Nodes (8): Column header, Design, Design: Semantic Column in Patterns Dictionary Table, Files Touched, No new components, Problem, Row cell, Width adjustment

### Community 236 - "Tauri Backend + WASM Core — Gotchas"

Cohesion: 0.22
Nodes (8): Rust Arithmetic, Rust String Lengths, Tauri Backend + WASM Core — Gotchas, Tauri Command Security, WASM-Bridged Structs, wasm-core Architecture, WASM `&mut self` Borrow Rule (Rust 1.84+), WASM-Only Symbols Cause SIGABRT on Native Tests

### Community 237 - "find_best_pattern_match"

Cohesion: 0.36
Nodes (7): bench_large_token_array(), bench_pattern_competition(), bench_phase_a_processing(), bench_single_pattern_match(), bench_two_phase_processing(), create_token(), find_best_pattern_match()

### Community 244 - "📍 Code Locations Map"

Cohesion: 0.25
Nodes (8): 📍 Code Locations Map, code:block3 (lib.rs # Main WASM module (Dictionary Tri), code:block4 (WasmStringProcessor.js # ✅ INTEGRATED), code:block5 (TranslationEngine.js # Lines 3146-3218 (✅ ReadonlyArray), File Paths Reference, Infrastructure (Used by Other Modules), Integrated Code (Active in Production), Ready to Integrate (Code Complete, Not Active)

### Community 245 - "🧪 Testing & Validation"

Cohesion: 0.25
Nodes (8): code:block4 (npm test -- --run), code:block5 (npm run type-check), code:block6 (wasm-pack build), Manual Testing Performed, Test Results, 🧪 Testing & Validation, Type Checking, WASM Build

### Community 246 - "ADR-010: Dictionary Match Sort — Specificity Over Provenance"

Cohesion: 0.25
Nodes (7): ADR-010: Dictionary Match Sort — Specificity Over Provenance, Alternatives Considered, code:js (// DictionaryManager.js — findAllMatchesSequential + findAll), Consequences, Context, Decision, Rationale

### Community 247 - "ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine"

Cohesion: 0.25
Nodes (7): Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected, ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine, Consequence, Context, Decision, Reasoning, What Was Done Instead

### Community 248 - "ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`"

Cohesion: 0.25
Nodes (7): ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`, code:ts (export { globalPerformanceMonitor } from './PerformanceMonit), code:ts (export { performanceHealth } from './PerformanceHealth';), Consequences, Context, Decision, Reason

### Community 249 - "ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable"

Cohesion: 0.25
Nodes (7): ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable, Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected, Alternative 2: Keep coordination in TranslationEngine ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers

### Community 250 - "Design: Semantic Type Filter for Structural Patterns"

Cohesion: 0.25
Nodes (7): Behaviour, Change, code:ts (// Before), Design, Design: Semantic Type Filter for Structural Patterns, Files Touched, Problem

### Community 251 - "Character-Only Highlighting Path"

Cohesion: 0.25
Nodes (8): Character-Only Highlighting Path, code:block16 (TranslationEngine.translateWithCharactersOnly()), code:javascript (// CRITICAL: Happens AFTER all text transformations), code:javascript (// Case-insensitive search in remaining text), code:block19 (ClickableTranslationSemantic.tsx), Strategy 1: Position Metadata (Preferred, Fastest), Strategy 2: indexOf Fallback (Synchronous), Strategy 3: Async SegmentPrecomputer (Comprehensive)

### Community 252 - "What Was Extracted (2026-01-30)"

Cohesion: 0.25
Nodes (8): code:block1 (Before Refactoring (2026-01-30 morning):), Extraction Success Metrics, Part 1: Recent Refactoring Success Analysis, Phase 1: Core Utilities & State Management (-663 lines), Phase 2: Pattern Processing (-43 lines), Phase 3: Translation Control (-80 lines), Phase 4: Dead Code & Helpers (-390 lines), What Was Extracted (2026-01-30)

### Community 253 - "Part 4: Design Pattern Analysis"

Cohesion: 0.25
Nodes (8): code:javascript (// Proposed structure), code:javascript (class TranslationMediator {), code:javascript (class TranslationEngine extends EventEmitter {), Part 4: Design Pattern Analysis, Pattern 1: Strategy Pattern, Pattern 2: Mediator Pattern, Pattern 3: Event Emitter Pattern, Pattern 4: Current Pattern (Monolithic Coordinator)

### Community 254 - "1. Error Handling ⭐⭐⭐⭐⭐"

Cohesion: 0.25
Nodes (8): 1. Error Handling ⭐⭐⭐⭐⭐, code:typescript (// Example: Comprehensive null guards before processing), code:typescript (// Multi-layered validation: undefined check → -1 check → bo), code:typescript (// src/utils/PositionValidationHelpers.ts), code:typescript (// CRITICAL-1 FIX: Prevent infinite loop from zero-length se), Infinite Loop Prevention (SegmentPrecomputer.ts:525-535, 614-628), Input Validation (ClickableTranslationSemantic.tsx), Position Metadata Validation (lines 86-118)

### Community 255 - "⚠️ HIGH-2: Phase Priority Not Validated at Runtime"

Cohesion: 0.25
Nodes (8): code:javascript (// Documentation states phase priority:), code:javascript (// Phases check `token.translated !== null` before processin), code:javascript (// After each phase, validate no lower-priority translations), code:javascript (// Check for corruption after ALL phases (line 6886)), code:javascript (// Helper function), ⚠️ HIGH-2: Phase Priority Not Validated at Runtime, ⚠️ HIGH-3: Semantic Array Corruption Detection (PARTIAL), HIGH Priority Issues

### Community 257 - "generate-wasm-hashes.js"

Cohesion: 0.33
Nodes (6): computeFileHash(), __dirname, __filename, generateIntegrityManifest(), MANIFEST_PATH, WASM_DIR

### Community 258 - "TranslatorControls.tsx"

Cohesion: 0.29
Nodes (5): PerformanceStats, ProgressInfo, RegressionHealth, TranslatorControlsProps, WasmStatus

### Community 259 - "SemanticPatternProcessor.js"

Cohesion: 0.23
Nodes (5): PrecomputedTokenStrings, classifyVariableType(), getHeuristicType(), VariableClassification, buildPrecomputedStrings()

### Community 260 - "AppReadinessOverlay.tsx"

Cohesion: 0.43
Nodes (6): AppReadinessOverlay(), AppReadinessOverlayProps, pickStatus(), stageClass(), stageIcon(), StageStatus

### Community 262 - "SemanticArrayValidator"

Cohesion: 0.22
Nodes (8): ComponentMetrics, ComponentProfile, ComponentStats, MemorySample, MemorySnapshot, Performance, ProfilerStats, TopMemoryConsumer

### Community 263 - "Chinese-Vietnamese Translator — Dev Memory"

Cohesion: 0.29
Nodes (6): Chinese-Vietnamese Translator — Dev Memory, Comprehensive architecture code review — 14 issues fixed, Fixes Done (2026-02-22, session 19), Key Architectural Invariants (most frequently violated), Session History Index, Stable Project Facts

### Community 264 - "⏭️ Ready Optimizations (Not Yet Integrated)"

Cohesion: 0.29
Nodes (7): ⏭️ Ready Optimizations (Not Yet Integrated), Task #10: Memory Management (RAII) (Infrastructure), Task #1: Pattern Validation (Complete, Used), Task #2: Zero-Copy WASM Boundary (Infrastructure), Task #4: WASM Dictionary Trie ✅ COMPLETE - Research Code (Disabled), Task #6: Rust Regex Utilities (Not Applicable), Task #7: WASM Text Assembly (Deferred - High Complexity)

### Community 265 - "1. LRUCache Doubly-Linked List Optimization ✅"

Cohesion: 0.29
Nodes (7): 1. LRUCache Doubly-Linked List Optimization ✅, Code Quality, code:typescript (interface LRUNode<K, V> {), Completed Work, Performance Gains, Problem, Solution

### Community 266 - "Integration #1: Text Assembly (Task #7)"

Cohesion: 0.29
Nodes (7): code:javascript (// Line 5550-5561: postProcess()), code:javascript (// Import at top), code:javascript (// Sequential dictionary loading), code:javascript (import { parallelDictionaryLoader } from './ParallelDictiona), Integration #1: Text Assembly (Task #7), Integration #2: Parallel Dictionary Loading (Task #9), 🟢 Priority 1: High-Impact, Low-Risk (Complete First)

### Community 267 - "ADR-026: Do Not Move useDictionaryCRUD to src/hooks/"

Cohesion: 0.29
Nodes (6): ADR-026: Do Not Move useDictionaryCRUD to src/hooks/, Context, Decision, Reason, Supersession Note (2026-06-27), When to Revisit

### Community 268 - "ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation"

Cohesion: 0.29
Nodes (6): ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation, Consequence, Context, Decision, Reasoning, What Was Done Instead

### Community 269 - "ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting"

Cohesion: 0.29
Nodes (6): ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting, code:ts (type SyncMode = 'batch' | 'sequential' | 'sequential_fallbac), Context, Decision, If a Performance Dashboard Is Built, Reason

### Community 270 - "ADR-022: Keep streamingReducer and Initial State Constants Exported"

Cohesion: 0.29
Nodes (6): ADR-022: Keep streamingReducer and Initial State Constants Exported, Boundary Condition, Context, Decision, Reason, Supersession Note

### Community 271 - "Testing Strategy"

Cohesion: 0.29
Nodes (7): code:javascript (// DictionaryManager disposal), code:javascript (// Memory leak detection), code:javascript (// Cache invalidation benchmark), Integration Tests, Performance Benchmarks, Testing Strategy, Unit Tests

### Community 272 - "12. Implementation Summary (2026-02-07)"

Cohesion: 0.29
Nodes (7): 12. Implementation Summary (2026-02-07), Code Quality Improvements, code:block24 (✅ All tests pass: 1033 passed | 60 skipped), Files Created, Files Modified, Impact, Test Results

### Community 274 - "Conclusion"

Cohesion: 0.18
Nodes (11): code:markdown (**Large files are PARTIALLY intentional:**), code:markdown (**Large files are intentional:**), Conclusion, Failed Extractions (Correctly Avoided), Final Verdict, Part 5: Comparison with Past Refactoring Attempts, Recommended Actions, Successful Extractions (2026-01-30) (+3 more)

### Community 275 - "Part 2: What MUST Stay Coupled (Architectural Analysis)"

Cohesion: 0.29
Nodes (7): 1. Five-Phase Translation Pipeline (~1,291 lines), 2. Dictionary Operations & Cache Management (~162 lines), 3. Post-Processing & Semantic Arrays (~2,484 lines), code:javascript (// CRITICAL: Shared token state requires synchronous coordin), code:javascript (findAllMatchesWithSemanticCache(tokens, startIdx, dictionari), code:javascript (postProcess(translationSegments) {), Part 2: What MUST Stay Coupled (Architectural Analysis)

### Community 276 - "Appendix: Evidence & Metrics"

Cohesion: 0.29
Nodes (7): Appendix: Evidence & Metrics, code:block17 (TranslationEngine.js:), code:block18 (Tests Created (2026-01-30):), code:block19 (TypeScript Errors: 0), File Size Evolution, Quality Metrics, Test Coverage

### Community 277 - "1. XSS Prevention ⭐⭐⭐⭐⭐"

Cohesion: 0.29
Nodes (7): 1. XSS Prevention ⭐⭐⭐⭐⭐, code:typescript (// ClickableTranslationSemantic.tsx:327), code:tsx (// All text content rendered via React (automatic escaping)), code:bash ($ grep -r "dangerouslySetInnerHTML" src/components/Clickable), Input Sanitization, No `dangerouslySetInnerHTML`, React Automatic Escaping

### Community 278 - "4. Type Safety ⭐⭐⭐⭐"

Cohesion: 0.29
Nodes (7): 4. Type Safety ⭐⭐⭐⭐, Click Handler Type Safety (CRITICAL-6 FIX), code:typescript (// Discriminated unions for segment types), code:typescript (// Before: Bypassed type safety), code:bash (npm run type-check # 0 errors expected), Type Coverage, Type Definitions (ClickableTypes.d.ts)

### Community 279 - "Recommendations Summary"

Cohesion: 0.29
Nodes (7): code:typescript (const CLICKABLE_CONFIG = {), code:typescript (test('should handle 10,000 segments without degradation', ()), code:typescript (performanceMonitor.trackOperation('segment_computation', ela), High Priority ✨, Low Priority 📝, Medium Priority 🔄, Recommendations Summary

### Community 280 - "translation_wasm_core.d.ts"

Cohesion: 0.33
Nodes (5): CoreTranslationEngine, DictionaryEngine, InitInput, InitOutput, SyncInitInput

### Community 281 - "intl-segmenter.d.ts"

Cohesion: 0.33
Nodes (5): SegmentData, Segmenter, SegmenterConstructor, SegmenterOptions, Segments

### Community 284 - "🚀 How to Use This Index"

Cohesion: 0.33
Nodes (6): 🚀 How to Use This Index, I want to integrate one of the ready optimizations, I want to know what code exists but isn't used, I want to see performance improvements, I want to understand what was done today, I want to write new optimizations

### Community 285 - "✅ Completed Work"

Cohesion: 0.28
Nodes (9): code:javascript (// Import), ✅ Completed Work, ✅ Integration #2: Parallel Dictionary Loading, ✅ Integration #3: V8 Optimization for Memory Tracking, ✅ Integration #4: ReadonlyArray for Phase Processing, ✅ Integration #5: WASM String Processor (Verified), Phase A: Safe Integrations, Phase B: Medium-Risk Integrations (+1 more)

### Community 286 - "ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods"

Cohesion: 0.33
Nodes (5): ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods, Context, Decision, Reason, When to Revisit

### Community 287 - "ADR-024: Do Not Move Style Objects into useAppearanceSettings"

Cohesion: 0.33
Nodes (5): ADR-024: Do Not Move Style Objects into useAppearanceSettings, Context, Decision, Reason, Revisit condition

### Community 288 - "ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init"

Cohesion: 0.33
Nodes (5): ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init, Consequences, Context, Decision, Reason

### Community 289 - "ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface"

Cohesion: 0.33
Nodes (5): ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface, Context, Decision, If App Callers Are Added, Reason

### Community 290 - "ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name"

Cohesion: 0.33
Nodes (5): ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name, Consequences, Context, Decision, Reason

### Community 291 - "ADR-018: Unified PerformanceReport State in usePerformanceMonitoring"

Cohesion: 0.33
Nodes (5): ADR-018: Unified PerformanceReport State in usePerformanceMonitoring, Consequence, Context, Decision, Reasoning

### Community 292 - "ADR-017: Skip WasmMemoryPool Analytics Separation"

Cohesion: 0.33
Nodes (5): ADR-017: Skip WasmMemoryPool Analytics Separation, Consequence, Context, Decision, Reasoning

### Community 293 - "ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation"

Cohesion: 0.33
Nodes (5): ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation, Consequences, Context, Decision, Reason

### Community 294 - "ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput"

Cohesion: 0.33
Nodes (5): ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput, Context, Decision, Reason, When to Revisit

### Community 295 - "HIGH-4: WASM Dictionary Trie - No JS-Visible Disposal"

Cohesion: 0.17
Nodes (12): code:rust (#[wasm_bindgen]), code:javascript (// JavaScript side:), code:javascript (// Chrome DevTools Memory Profiler:), code:javascript (// WasmDictionaryManager.js), code:javascript (async preWarmCaches(dictionaryManager, options = {}) {), code:rust (static ALLOCATED_BYTES: AtomicUsize = AtomicUsize::new(0);), code:javascript (// JavaScript detects memory pressure), code:rust (// Add to wasm-core/src/memory_management.rs) (+4 more)

### Community 296 - "4. Potential Optimization Opportunities"

Cohesion: 0.33
Nodes (6): 4. Potential Optimization Opportunities, code:javascript (// Line 1545-1552 in TranslationEngine.js), ⚠️ MINOR: Share Lookup Index Instance, ❌ REJECTED: Parallel Execution, ❌ REJECTED: Reuse Phase 5 from Full Translation, ❌ REJECTED: Unify Semantic Array Builders

### Community 297 - "Architecture Overview"

Cohesion: 0.33
Nodes (6): Architecture Overview, code:block1 (Translation Phase → postProcess() → Position Recording → Sem), Dual-Path Design, Path 1: Character-Only Mode, Path 2: Full Translation Mode, Position Tracking Flow

### Community 298 - "Appendix: File Reference"

Cohesion: 0.33
Nodes (6): Appendix: File Reference, Code Reviews (Historical), Core Implementation, Documentation, Testing, Type Definitions

### Community 299 - "2. Unicode Handling ⭐⭐⭐⭐"

Cohesion: 0.33
Nodes (6): 2. Unicode Handling ⭐⭐⭐⭐, code:typescript (// CODE REVIEW FIX: Normalize text BEFORE validation), code:typescript (// SegmentPrecomputer.ts:394 - Text normalization), code:typescript (// CRITICAL-3 FIX: Use grapheme-aware length checking), Grapheme-Aware Length Checking (SegmentPrecomputer.ts:472-499), NFC Normalization (ClickableTranslationSemantic.tsx:47-52)

### Community 300 - "src/styles — CSS Module Conventions"

Cohesion: 0.33
Nodes (5): Animations and Keyframes, File Placement, Hiding Elements — Use Conditional Rendering, Not `visibility: hidden`, Modal Overlays, src/styles — CSS Module Conventions

### Community 302 - "Implementation Roadmap"

Cohesion: 0.40
Nodes (5): Implementation Roadmap, Phase 1: TypeScript Migration (Estimated: 2-3 days), Phase 2: Rust/WASM Acceleration (Estimated: 5-7 days), Phase 3: Additional TypeScript Migrations (Estimated: 2-3 days), Phase 4: WASM Hash Generator (Estimated: 1-2 days)

### Community 303 - "Recommendations"

Cohesion: 0.40
Nodes (5): Immediate Actions (Week 1), Medium-Term (Month 1-2), Recommendations, Short-Term (Weeks 2-3), Success Criteria

### Community 304 - "Integration Roadmap (8 Integration Points)"

Cohesion: 0.22
Nodes (9): code:javascript (import { wasmDictionaryTrie } from './WasmDictionaryTrie.js'), code:javascript (// Phase 5: Character dictionary lookup), Integration #5: String Processor for Pattern Matching (Task #3), Integration #6: Dictionary Trie for Phase 5 (Task #4), Integration #7: Zero-Copy WASM Boundary (Task #2), Integration #8: Regex Utilities (Task #6), Integration Roadmap (8 Integration Points), 🔴 Priority 3: High-Impact, Higher-Risk (Careful Integration) (+1 more)

### Community 305 - "Integration Sequence (Recommended Order)"

Cohesion: 0.40
Nodes (5): Integration Sequence (Recommended Order), Phase A: Safe Integrations (Week 1), Phase B: Medium-Risk Integrations (Week 2), Phase C: High-Impact Integrations (Week 3), Phase D: Infrastructure Documentation

### Community 306 - "🚀 Next Steps"

Cohesion: 0.40
Nodes (5): Immediate (This Week), Long-term (6-12 Months), Medium-term (3-6 Months), 🚀 Next Steps, Short-term (Next Month)

### Community 307 - "🔄 Git Status"

Cohesion: 0.40
Nodes (5): Changes Ready to Commit, code:bash (# Modified files), code:bash (# Commit 1: ParallelDictionaryLoader integration), 🔄 Git Status, Recommended Commit Strategy

### Community 309 - "Keyboard Shortcuts"

Cohesion: 0.40
Nodes (4): Dictionary tab, Global (any tab), Keyboard Shortcuts, Translator tab

### Community 312 - "9. Recommendations"

Cohesion: 0.40
Nodes (5): 9. Recommendations, ✅ DO NOT MERGE PHASE 5, ✅ DO NOT PARALLELIZE, ✅ KEEP CURRENT ARCHITECTURE, ✅ MONITOR, DON'T OPTIMIZE

### Community 313 - "3. Current Optimizations (Already Implemented)"

Cohesion: 0.40
Nodes (5): 3. Current Optimizations (Already Implemented), code:javascript (// Translator.jsx:1853-1869), ✅ Infrastructure Sharing, ✅ Sequential Execution (Intentional UX Design), ✅ WASM/Rust Acceleration

### Community 314 - "✅ IMPLEMENTED Micro-Optimizations (2026-02-07)"

Cohesion: 0.40
Nodes (5): ✅ ALREADY EXTRACTED: Position Validation Helpers, code:typescript (import { normalizeVietnameseText } from '../utils/TextNormal), code:typescript (import { validatePosition } from './PositionValidationHelper), ✅ IMPLEMENTED: Extract NFC Normalization Helper, ✅ IMPLEMENTED Micro-Optimizations (2026-02-07)

### Community 315 - "References"

Cohesion: 0.40
Nodes (5): Core Files, Documentation, Highlighting Components, References, Shared Utilities (Extracted)

### Community 318 - "Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries"

Cohesion: 0.50
Nodes (4): code:javascript (this.dictionaryIndex = {), code:javascript (setCharacter(character, dictionaryName, result) {), code:javascript (invalidateDictionary(dictionaryName) {), CRITICAL-3: TranslationCache Index Maps ✅ IMPLEMENTED

### Community 319 - "Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup"

Cohesion: 0.20
Nodes (3): getArrayU32FromWasm0(), getUint32ArrayMemory0(), PositionMapper

### Community 320 - "Risk Mitigation"

Cohesion: 0.67
Nodes (3): Architectural Constraints (from CLAUDE.md):, Risk Mitigation, Rollback Plan:

### Community 321 - "Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear"

Cohesion: 0.06
Nodes (47): Automated Testing, Code Quality Improvements, code:javascript (// CODE REVIEW FIX (CRITICAL-1): Dispose existing tries befo), code:javascript (// Check WASM drops in development console), code:javascript (const cache = new TranslationCache();), code:javascript (describe('Dictionary Memory Management', () => {), code:javascript (/**), code:rust (// CODE REVIEW FIX (CRITICAL-2): Implement Drop trait for ex) (+39 more)

### Community 323 - "⏸️ Task #10: Optimize Memory Cleanup (Opportunity #10)"

Cohesion: 0.67
Nodes (3): code:javascript (// Critical cleanup - synchronous and blocking), code:rust (// Rust Drop trait handles cleanup automatically), ⏸️ Task #10: Optimize Memory Cleanup (Opportunity #10)

### Community 325 - "Code Review: Large Files Refactoring Analysis"

Cohesion: 0.40
Nodes (4): Code Review: Large Files Refactoring Analysis, Executive Summary, Key Findings (High Confidence: ≥95%), Recommendations

### Community 326 - "Part 3: What Could Be Extracted (But Shouldn't Be)"

Cohesion: 0.40
Nodes (5): Candidate 1: Cleanup Strategies (~150 lines), Candidate 2: Match Conflict Resolution (~270 lines), code:javascript (cleanupSegments() {), code:javascript (resolveMatchConflicts(matches, tokens, currentPhase) {), Part 3: What Could Be Extracted (But Shouldn't Be)

### Community 327 - "Monitoring & Validation"

Cohesion: 0.67
Nodes (3): Development Tools, Monitoring & Validation, Performance Dashboards

### Community 328 - "⚠️ HIGH-1: Cached Semantic Tokens Invalidation Timing"

Cohesion: 0.40
Nodes (5): code:javascript (// OPTIMIZATION: Cache semantic tokens after proper noun gro), code:javascript (// Cache is populated AFTER Phase 2 (line 6494)), code:javascript (// From documentation: getSemanticTokens filters unconsumed ), code:javascript (// Before Phase 3, 4, 5), ⚠️ HIGH-1: Cached Semantic Tokens Invalidation Timing

### Community 331 - "🎯 Complete Optimization Timeline"

Cohesion: 0.50
Nodes (4): 🎯 Complete Optimization Timeline, Phase 1: Optimization Module Creation (Completed), Phase 2: Integration Planning (Completed), Phase 3: Integration Execution (Today's Session)

### Community 332 - "✅ Verification Checklist"

Cohesion: 0.50
Nodes (4): ✅ Verification Checklist, What Needs More Work, What's Integrated and Working, What's Ready to Integrate (Code Complete)

### Community 333 - "Executive Summary"

Cohesion: 0.50
Nodes (4): Assessment, Current State, Executive Summary, Work Completed

### Community 334 - "Risk Assessment"

Cohesion: 0.50
Nodes (4): High Risk (Not Recommended) ❌, Low Risk (Recommended) ✅, Medium Risk (Evaluate Benefits) 🟡, Risk Assessment

### Community 335 - "Testing Strategy"

Cohesion: 0.50
Nodes (4): After Each Integration, Rollback Plan, Test Cases, Testing Strategy

### Community 336 - "Risk Mitigation"

Cohesion: 0.50
Nodes (4): High-Risk Areas, Performance Validation, Risk Mitigation, Safety Measures

### Community 337 - "Success Criteria"

Cohesion: 0.50
Nodes (4): Code Quality Requirements, Functional Requirements, Performance Requirements, Success Criteria

### Community 338 - "🎓 Lessons Learned"

Cohesion: 0.50
Nodes (4): Best Practices Followed, 🎓 Lessons Learned, What Was Challenging, What Worked Well

### Community 339 - "⏭️ Deferred Integrations"

Cohesion: 0.50
Nodes (4): ⏭️ Deferred Integrations, Integration #1: Text Assembly, Integration #6: Dictionary Trie, Integration #8: Regex Utilities

### Community 340 - "📁 Files Modified"

Cohesion: 0.50
Nodes (4): Core Integration Files, 📁 Files Modified, Supporting Files (Already Existed), WASM Modules (Compiled Successfully)

### Community 341 - "✅ Success Criteria Met"

Cohesion: 0.50
Nodes (4): Code Quality Requirements, Functional Requirements, Performance Requirements, ✅ Success Criteria Met

### Community 342 - "PatternPriorityCalculator.ts"

Cohesion: 0.25
Nodes (6): calculatePatternPriority(), PatternToken, PatternTokenType, PatternVariable, PRIORITY_WEIGHTS, PriorityBreakdown

### Community 344 - "Optimization Roadmap"

Cohesion: 0.50
Nodes (4): Optimization Roadmap, Phase 1: Immediate Wins (2-3 days, 20-30% improvement), Phase 2: Rust Migrations (1-2 weeks, additional 15-25% improvement), Phase 3: Architectural Improvements (Ongoing)

### Community 346 - "Resources"

Cohesion: 0.50
Nodes (4): code:javascript (// Run full benchmark suite), Development Tools:, Documentation:, Resources

### Community 347 - "DictionaryEntryValidator.ts"

Cohesion: 0.17
Nodes (13): DictionaryManagerProps, SelectionState, DICTIONARY_TYPES, HotkeyHandler(), DICTIONARY_HOTKEY_MAP, TabbedInterface(), TabId, TABS (+5 more)

### Community 351 - "📊 Performance Summary"

Cohesion: 0.67
Nodes (3): Measured Gains (Integrated), 📊 Performance Summary, Potential Future Gains (Not Yet Integrated)

### Community 353 - "Performance Metrics"

Cohesion: 0.67
Nodes (3): Baseline Measurements (Before Optimizations), Performance Metrics, Post-Optimization Measurements

### Community 354 - "⏸️ Task #1: Fix WASM Boundary Type Safety (Critical #1)"

Cohesion: 0.67
Nodes (3): code:typescript (// Line 146, 329:), code:typescript (// Strict typing eliminates runtime checks), ⏸️ Task #1: Fix WASM Boundary Type Safety (Critical #1)

### Community 355 - "✅ Task #7: Rust String Builder for Post-Processing (Medium #7)"

Cohesion: 0.67
Nodes (3): code:javascript (// Every chunk creates new semantic array entries), code:rust (// Rust String with capacity pre-allocation), ✅ Task #7: Rust String Builder for Post-Processing (Medium #7)

### Community 357 - "✅ Task #5: Apply TypeScript ReadonlyArray Optimizations (High-Impact #4)"

Cohesion: 0.67
Nodes (3): code:javascript (// Phase 4 phrase processing (lines 3145-3175)), code:typescript (// Declare token arrays as readonly where possible), ✅ Task #5: Apply TypeScript ReadonlyArray Optimizations (High-Impact #4)

### Community 358 - "✅ Task #8: TypeScript Interfaces for V8 Optimization (Medium #8)"

Cohesion: 0.67
Nodes (3): code:javascript (const segmentKeys = Object.keys(sampleSegment || {}); // Dyn), code:typescript (// Define exact shape enables V8 hidden class optimization), ✅ Task #8: TypeScript Interfaces for V8 Optimization (Medium #8)

## Knowledge Gaps

- **2536 isolated node(s):** `WasmNumberProcessorResult`, `WasmPatternMatch`, `WasmDictionaryMatch`, `WasmBatchDictionaryResult`, `RustLookupMatch` (+2531 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **54 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Logger` connect `PositionMapper` to `SemanticArrayBuilder.ts`, `Logger`, `SemanticPatternProcessor.js`, `V8OptimizationUtils.js`, `WasmPatternProcessor.js`, `Translator.jsx`, `TextChunker.js`, `TranslationEngine.js`, `EnhancedVirtualizedDictionaryTable.tsx`, `FallbackManager`, `WasmTypes.ts`, `ErrorBoundary.tsx`, `wasmOperationTimeout.js`, `wasm_boundary.rs`, `tauriAPI.ts`, `ToastContext.tsx`, `DictionaryContext.tsx`, `DictionaryTypes.ts`, `DictionaryTrie`, `SegmentPrecomputer.ts`, `PatternPriorityCalculator.ts`, `DictionaryEntryValidator.ts`, `ComponentMemoryProfiler.ts`, `TranslationInputValidator`, `UnicodePunctuationDetector.ts`, `TwoPhasePatternProcessor`, `ElectronTypes.d.ts`, `SmartMemoryPressureDetector.ts`, `WasmMemoryPoolManager.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `scanTokens()` connect `PerformanceMonitor` to `TranslationEngine.js`, `V8OptimizationUtils.js`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `Predicate` connect `PerformanceMonitor` to `UtilityTypes.d.ts`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `WasmNumberProcessorResult`, `WasmPatternMatch`, `WasmDictionaryMatch` to the rest of the system?**
  _2536 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dictionary_commands.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.0774281805745554 - nodes in this community are weakly interconnected._
- **Should `number_processor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06436487638533675 - nodes in this community are weakly interconnected._
- **Should `Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.06568832983927324 - nodes in this community are weakly interconnected._
