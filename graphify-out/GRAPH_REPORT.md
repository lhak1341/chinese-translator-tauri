# Graph Report - chinese-translator-tauri (2026-08-26)

## Corpus Check

- 343 files · ~323,254 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 3920 nodes · 7417 edges · 295 communities (195 shown, 100 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 149 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `5b832068`
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
- SemanticPatternProcessor.js
- Phase 8 Tests - Pattern Matching Validation
- ToastContext.tsx
- TextTokenizer.ts
- Domain Glossary
- useHighlightingState.ts
- tauriAPI.ts
- WasmStringProcessor.js
- HookTypes.d.ts
- DictionaryContext.tsx
- text_assembly.rs
- NumberProcessor
- Code Review: Pure Computation Migration to wasm-core
- Code Review Fix Summary - 2026-01-27
- TwoPhasePatternProcessor
- .new
- WasmRegexUtilsWrapper
- TranslatorControls.tsx
- SmartMemoryCoordinator
- Task 1: Enable Semantic Type filter for Structural Patterns
- takeFromExternrefTable0
- BatchProcessingTypes.d.ts
- PatternFailureTracker
- Documentation Index
- ADR-002: Dual-Path Clickable Highlighting Architecture
- Implementation Details ✅
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
- precompute-dictionaries.js
- Completed Optimizations
- DictionaryEngine
- .__destroy_into_raw
- CacheTypes.d.ts
- SemanticPatternProcessor
- LRUCache
- src/components — Gotchas
- ADR-002: Dual-Path Clickable Highlighting Architecture
- configValidation.ts
- Hotfix: Missing Method Safety Checks
- Clickable Highlighting Feature - Code Review
- Security Considerations
- translation_wasm_core.d.ts
- ElectronTypes.d.ts
- pattern.rs
- SemanticArrayBuilder.ts
- ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors
- Design
- V8OptimizationTypes.d.ts
- ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error
- SemanticArrayBuilder
- wasmIntegrityVerifier.js
- ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential
- ADR-005: Eager Dictionary Loading via DictionaryContext
- CRITICAL-3: TranslationCache - O(n) Cache Invalidation
- TrieNode
- WordTransformToolbar.tsx
- .translateWithProgressiveBatches
- ParallelConfig
- package.json
- PatternAnalyzer
- ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext
- Task 2: Parse `semanticType` from the JS pattern dictionary
- Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`
- Dictionary Management and Memory Code Review
- WasmTextChunker
- Detailed Optimization Tracking
- .handleSmartCleanup
- PatternTemplateEngine
- ContentAwarePositionCache.ts
- Architecture Decision Records (ADRs)
- Task 1: Add `semantic_type` to Rust `PatternMetadata`
- CRITICAL-1: DictionaryManager Missing Cleanup Method
- High-Priority Issues 🟠
- 7. Clickable Highlighting Feature Analysis
- wasm-core Pattern Processor
- text_chunker.rs
- getStringFromWasm0
- TranslationProfiler
- SmartMemoryPressureDetector
- Compilation Warnings - Explained
- UnicodePunctuationDetector.ts
- QuoteProcessor
- AI Readiness Evaluation: chinese-translator-tauri
- 3. Performance Optimizations ⭐⭐⭐⭐⭐
- PrecomputedTrieStats
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
- ReadonlyOptimizationUtils.js
- ComponentMemoryProfiler.ts
- PunctuationProcessor
- Optimization Master Index - Complete Reference
- Priority 1: TypeScript Migration (Type Safety + Performance)
- ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider
- Design
- Tauri Backend + WASM Core — Gotchas
- find_best_pattern_match
- ADR-010: Dictionary Match Sort — Specificity Over Provenance
- ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine
- ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`
- 9. Recommendations
- generate-wasm-hashes.js
- WasmConflictResolution.js
- DictionaryManager Types
- Keyboard Shortcuts
- 📍 Code Locations Map
- Chinese-Vietnamese Translator — Dev Memory
- useCharacterOnlySegments.ts
- ESLint Tooling
- GraphemeHelper
- ADR-026: Do Not Move useDictionaryCRUD to src/hooks/
- ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation
- ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting
- AppReadinessOverlay.tsx
- 12. Implementation Summary (2026-02-07)
- Fix 8: BONUS - Fix method name typos in TranslationCache
- Conclusion
- Part 2: What MUST Stay Coupled (Architectural Analysis)
- Appendix: Evidence & Metrics
- 1. XSS Prevention ⭐⭐⭐⭐⭐
- ✅ Completed Work
- Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup
- ADR-024: Do Not Move Style Objects into useAppearanceSettings
- ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init
- Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup
- ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name
- ADR-018: Unified PerformanceReport State in usePerformanceMonitoring
- lib.rs
- src/components/rules — Gotchas
- ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput
- husky
- sanitizeDictionaryEntry
- .load_dictionary
- husky
- buildLookupIndexOrFallback
- build.rs
- Implementation Roadmap
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
- WasmProcessorLifecycle
- BatchLogger.js
- PerformanceStats
- ReadonlyOptimizationUtils.js
- DebugObjectPoolManager
- eslint-plugin-react-refresh

## God Nodes (most connected - your core abstractions)

1. `TranslationEngine` - 108 edges
2. `Logger` - 105 edges
3. `react` - 70 edges
4. `make_cache()` - 55 edges
5. `temp_test_dir()` - 52 edges
6. `Domain Glossary` - 52 edges
7. `DictionaryManager` - 38 edges
8. `DictionaryResponse` - 37 edges
9. `compilerOptions` - 32 edges
10. `DictionaryCache` - 27 edges

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

## Hyperedges (group relationships)

- **Translator.jsx state-extraction hooks (dependency-injected context pattern)** — src_components_translator_translator, src_hooks_usedictionaryreloadguard_usedictionaryreloadguard, src_hooks_useclipboardtranslation_useclipboardtranslation, src_hooks_usecharacteronlybridge_usecharacteronlybridge, src_hooks_useautotranslatetrigger_useautotranslatetrigger, src_hooks_useforcereload_useforcereload, src_hooks_usetranslatorengine_usetranslatorengine [EXTRACTED 1.00]
- **RulesManager two-surface shared field-policy group** — src_components_rules_newrulemodal_newrulemodal, src_components_rules_rulerow_rulerow, src_components_rules_rulefieldvalidation_rulefieldvalidation, src_utils_dictionary_transformruleengine_transformruleengine, src_components_rules_tests_rulefieldparity_rulefieldparity [EXTRACTED 1.00]
- **Constant-zero-metric dead code sweep group** — rationale_constant_zero_metric_pattern, src_utils_dictionary_dictionarywasmlookup_dictionarywasmlookup, src_utils_dictionary_dictionarymanager_dictionarymanager, src_utils_translationengine_translationengine [INFERRED 0.85]

## Communities (295 total, 100 thin omitted)

### Community 0 - "dictionary_commands.rs"

Cohesion: 0.16
Nodes (16): DuplicateDictionaryTableView(), DuplicateDictionaryTableViewProps, useDictionaryEntryFilter(), INITIAL_STATE, INITIAL_STREAMING, streamingReducer(), useStreamingTranslation(), useThrottledValue() (+8 more)

### Community 1 - "number_processor.rs"

Cohesion: 0.06
Nodes (86): BatchDictionaryResponse, build_test_zip(), create_and_activate_proper_noun_file(), create_structural_patterns_dictionary_impl(), deactivate_proper_noun_file(), deeply_nested_json(), get_cache_key(), import_dictionaries_impl() (+78 more)

### Community 2 - "Logger"

Cohesion: 0.07
Nodes (52): NumberProcessor, Regex, ConversionPattern, create_conversion_patterns(), create_number_map(), NumberMatch, NumberProcessor, HashMap (+44 more)

### Community 3 - "WasmPatternProcessor.js"

Cohesion: 0.13
Nodes (14): ADR-0020, ErrorBoundaryProps, ErrorBoundaryState, installDevConsole(), createScopedLogger(), formatMessage(), isDevelopment(), LOG_PREFIXES (+6 more)

### Community 4 - "V8OptimizationUtils.js"

Cohesion: 0.08
Nodes (36): ADR-0003, react, AppReadinessOverlay(), AppReadinessOverlayProps, pickStatus(), stageClass(), stageIcon(), StageStatus (+28 more)

### Community 5 - "PerformanceProfiler"

Cohesion: 0.13
Nodes (24): BulkMoveDialog(), BulkMoveDialogProps, useDictionary(), DictionaryEntry(), DictionaryEntryProps, getDictionaryTypes(), FullEntryData, MoveEntryDialog() (+16 more)

### Community 6 - "_assertNum"

Cohesion: 0.13
Nodes (4): ExtendedCacheStats, LRUCache, LRUCacheStats, LRUNode

### Community 7 - "DictionaryManagerTypes.d.ts"

Cohesion: 0.07
Nodes (39): DictionaryContextValue, DictionaryTypeDefinition, CommitMutation, DictionaryHistoryAPI, InvalidateEngine, useDictionaryHistory(), CommitMoveOp, DictionaryPersistenceAPI (+31 more)

### Community 8 - "TranslationEngineTypes.d.ts"

Cohesion: 0.23
Nodes (8): _handlers, registerCascadeHandler(), _WASM_BINARY_URL, isChinese(), needsSpace(), wasmTextAssembler, lifecycle, _WASM_BINARY_URL

### Community 9 - "Translator.jsx"

Cohesion: 0.08
Nodes (31): AssemblyResult, AssemblySegment, AssemblyStats, is_chinese_type(), make_segment(), needs_space(), PositionEntry, Default (+23 more)

### Community 10 - "Fiction Structural Pattern Dictionaries — Implementation Plan"

Cohesion: 0.04
Nodes (52): accumulateLoadResults, AdaptiveBatchSizer, AppConfig, AppearanceConfig, AppearanceSettings (hook), BatchMemoryCleanup, CharacterOnlyBridge, ChunkPostProcessor (+44 more)

### Community 12 - "TranslationEngine Internals"

Cohesion: 0.13
Nodes (39): Arc, build_comprehensive_lookup_index(), build_index_parallel(), build_index_serial(), categorize_matches(), CategorizedMatches, Dictionary, DictionaryMatch (+31 more)

### Community 13 - "UtilityTypes.d.ts"

Cohesion: 0.12
Nodes (7): retireWasmPatternProcessorOnSharedPanic(), _initializeTextChunker(), WasmTextChunker, _initializeTextTokenizer(), lifecycle, _WASM_BINARY_URL, WasmTextTokenizer

### Community 14 - "Future Optimization Work - Deferred Integrations"

Cohesion: 0.04
Nodes (45): ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init, Consequences, Context, Decision, Reason, ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation, Consequences, Context (+37 more)

### Community 16 - "Content Security Policy (CSP) and WASM Security"

Cohesion: 0.18
Nodes (14): baseDictionaryTypes, TOAST_DURATIONS, TOAST_IDS, ToastDuration, ToastId, assertTranslationExecutionCtxShape, useAutoTranslateTrigger(), UseAutoTranslateTriggerOptions (+6 more)

### Community 17 - "Tauri Backend Security Audit"

Cohesion: 0.16
Nodes (17): ClickableOriginalSemantic(), ClickableTranslationSemantic(), HighlightableSegment, HighlightableSegmentProps, BaseSegment, renderSegmentedContent(), RenderSegmentedContentOptions, ClickableTranslationOptimized() (+9 more)

### Community 18 - "Future Improvements Implementation - 2026-02-01"

Cohesion: 0.23
Nodes (9): DebugInfo, MemoryStats, PerformanceStats, PositionCandidate, NOTE: Does NOT write metadata[i].translatedText — SemanticArrayMetadata omits th, SemanticArrayMetadata, SemanticArraySnapshot, SemanticArraysResult (+1 more)

### Community 19 - "WASM Code Review Fixes - 2026-01-28"

Cohesion: 0.12
Nodes (20): AdaptiveBatchSizerInput, AdaptiveBatchSizerLogEntry, AdaptiveBatchSizerResult, BatchPerformanceEntry, calculateNextBatchSize(), Segment, highlightPatternVariables(), PATTERN_VARIABLE_COLORS (+12 more)

### Community 20 - "Test Coverage Improvements Summary"

Cohesion: 0.18
Nodes (6): Intl, SegmentData, Segmenter, SegmenterConstructor, SegmenterOptions, Segments

### Community 21 - "WASM Serialization Optimization Implementation Plan"

Cohesion: 0.16
Nodes (12): CachedString, HashMap, JsValue, Option, Result, String, Vec, StringProcessor (+4 more)

### Community 22 - "WASM Dictionary Trie - Final Summary & Decision"

Cohesion: 0.17
Nodes (3): getIndexedMatches(), sortMatchesByPrecedence(), reconstructTextFromIndex()

### Community 23 - "Number Processing Phase - Code Review Fixes"

Cohesion: 0.24
Nodes (36): Mutex, BatchDictionaryResult, check_json_depth(), create_fiction_dictionary_pair(), create_proper_nouns_dictionary(), create_structural_patterns_dictionary(), DictionaryCache, DictionaryResponse (+28 more)

### Community 26 - "PerformanceMonitoringTypes.d.ts"

Cohesion: 0.25
Nodes (7): Background for the Implementer, Final Verification, How pattern-within-pattern type checking works today, Key files and line numbers, Pattern Semantic Type Implementation Plan, Running tests, The fix

### Community 27 - "Code Review Fixes - 2026-02-01 (Second Review)"

Cohesion: 0.05
Nodes (37): BatchPerformanceMetrics, CharacterOnlyResult, DebugLevel, DictionaryManagerConfig, DictionaryPriorities, EngineStats, HighlightingAction, HighlightingState (+29 more)

### Community 28 - "Development Guide"

Cohesion: 0.18
Nodes (10): Automated Testing, Conclusion, Dictionary Memory Management Fixes - 2026-02-03, Executive Summary, Issues Fixed, Manual Testing, Memory Impact, Overview (+2 more)

### Community 29 - "lookup_index_engine.rs"

Cohesion: 0.12
Nodes (16): Architecture / Extraction, Before asserting, CSS / UI Components, Engine and pipeline tests, Environment / Tooling (RTK, Edit, Bash), Fake timers and async ordering, Gotchas Reference, Imports and naming traps (+8 more)

### Community 30 - "PatternProcessingTypes.d.ts"

Cohesion: 0.26
Nodes (10): calculatePatternPriority(), calculatePriorityBreakdown(), PatternToken, PatternTokenType, PatternVariable, PRIORITY_WEIGHTS, PriorityBreakdown, NOTE: Both patterns have same length (3 tokens); whichever pattern is (+2 more)

### Community 31 - "TypeScript/Rust Optimization Progress Report"

Cohesion: 0.07
Nodes (17): HotkeyHandler(), HotkeyHandlerOptions, useHotkeyHandler(), AdaptiveBufferCalculator, HotkeyAction, matchHotkey(), MatchHotkeyContext, AttemptFn (+9 more)

### Community 32 - "Code Review Fixes - Implementation Summary"

Cohesion: 0.10
Nodes (23): classifies_chinese_chars_individually(), ExpectedTokens, Fixture, FixtureCase, get_byte_position(), get_tokenizer_stats(), is_chinese_char(), is_digit() (+15 more)

### Community 34 - "Clickable Highlighting - Code Review Fixes Summary"

Cohesion: 0.06
Nodes (32): 1. ✅ Local-Only WASM Loading (CRITICAL), 2. ✅ Binary Integrity Verification (SHA-256 Hashing), 3. ✅ Module Structure Verification, 4. ✅ Instance Method Verification, 5. ✅ Graceful Degradation, 6. ✅ Retry Logic with Exponential Backoff, 7. ✅ No Dynamic WASM Loading, Attack Scenarios (If Exploited) (+24 more)

### Community 35 - "TranslationEngine.js"

Cohesion: 0.50
Nodes (4): react, react, ToastItem(), TranslatorDisplayPanels()

### Community 37 - "System Architecture"

Cohesion: 0.06
Nodes (32): 1. Character-only mode, 1. WASM Number Processor, 2. Full Translation mode, 2. WASM Pattern Processor, 3. WASM Dictionary Engine, 4. Rust Lookup Index, 5-Phase Translation Pipeline (IMMUTABLE), `applyFinalCleanup()` - Final Spacing Fixes (+24 more)

### Community 38 - "memory_management.rs"

Cohesion: 0.19
Nodes (17): Box, PatternMatchResult, matches_the_literal_run_immediately_before_the_variable(), PatternProcessingResult, resets_at_an_earlier_variable_keeping_only_the_run_immediately_before_var_idx(), returns_zero_when_before_pos_is_zero(), returns_zero_when_the_preceding_tokens_do_not_end_with_the_literal_run(), returns_zero_when_var_idx_is_zero() (+9 more)

### Community 41 - "EnhancedVirtualizedDictionaryTable.tsx"

Cohesion: 0.06
Nodes (33): eslint, eslint-config-prettier, @eslint/js, jsdom, lint-staged, devDependencies, eslint, eslint-config-prettier (+25 more)

### Community 42 - "DictionaryManager"

Cohesion: 0.07
Nodes (30): compilerOptions, allowJs, baseUrl, checkJs, forceConsistentCasingInFileNames, jsx, lib, module (+22 more)

### Community 43 - "Implementation Log"

Cohesion: 0.15
Nodes (3): loadDictionariesInChunks(), ParallelDictionaryLoader, DevicePerformanceDetector

### Community 47 - "CSP Hardening Migration - Complete Summary"

Cohesion: 0.22
Nodes (20): PhaseAResult, build_result(), find_best_pattern_match(), PatternMatcher, PatternMatcher<'a>, PatternMatchResult, PhaseAPattern, PhaseAResult (+12 more)

### Community 51 - "Task 1: Add Semantic column to Patterns dictionary table"

Cohesion: 0.07
Nodes (28): Analyze Performance Baselines, Architectural restructuring, Bounded Collection Pattern, Built-in Pattern Matching Profiler, Cache Invalidation (Unified API), Cache Management, Check Cache Performance, Check Real Memory Usage (+20 more)

### Community 52 - "ComponentTypes.d.ts"

Cohesion: 0.10
Nodes (21): Development Process Lessons, Error Handling Patterns, Lesson 1: Verify Execution Before Fixing Logic, Lesson 2: Test Production Builds During Development, Lesson 3: Type Boundaries Need Explicit Contracts, Lesson 4: Follow Existing Patterns, "màu" split into "mà" + "u" (Jan 2025), Pattern substitution and constructor option, 2026-07-30 (+13 more)

### Community 53 - "UITypes.d.ts"

Cohesion: 0.08
Nodes (38): App(), AppContent(), NOTE: WASM singleton cleanup intentionally NOT called from App unmount., AppearanceManager(), FIELD_GROUPS, FieldConfig, FieldGroup, FontControlGroupProps (+30 more)

### Community 54 - "WasmDictionaryManager"

Cohesion: 0.11
Nodes (23): EnhancedVirtualizedDictionaryTable(), EnhancedVirtualizedDictionaryTableProps, FilterChipButton(), SemanticTypeFilterChips(), VirtualRowComponent, FilterPanel(), FilterPanelProps, SearchFilterHeader() (+15 more)

### Community 55 - "WASM Code Review Fixes - 2026-01-27"

Cohesion: 0.15
Nodes (35): WordTransformToolbar(), WordTransformToolbarProps, applyRule(), compareRulePrecedence(), computeInitialTranslation(), dictionarySupportsTransformRules(), findBestMatch(), findRuleMatchingEntries() (+27 more)

### Community 56 - "Code Review Fixes - February 1, 2026"

Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, allowSyntheticDefaultImports, alwaysStrict, checkJs, emitDecoratorMetadata, esModuleInterop, experimentalDecorators (+20 more)

### Community 57 - "EventTypes.d.ts"

Cohesion: 0.15
Nodes (24): bench_large_token_array(), bench_pattern_competition(), bench_phase_a_processing(), bench_single_pattern_match(), bench_two_phase_processing(), create_token(), Criterion, test_full_dictionary_parsing() (+16 more)

### Community 58 - "Handoff: Shared WASM Module Panic Cascade"

Cohesion: 0.06
Nodes (35): 2026-01-31 - Session 1 (Infrastructure + Analysis), Architectural Constraints (from CLAUDE.md):, Baseline Measurements (Before Optimizations), Detailed Optimization Tracking, Development Tools:, Documentation:, For Each Optimization:, Future Optimization Ideas: (+27 more)

### Community 60 - "wasm_boundary.rs"

Cohesion: 0.17
Nodes (14): PatternIndex, Default, HashMap, Self, SemanticPattern, String, Vec, test_clear_index() (+6 more)

### Community 61 - "OptimizationBenchmarks"

Cohesion: 0.08
Nodes (25): 1. Documentation Improvements, 1. `src/utils/TranslationEngine.js`, 1. Understanding Code Flow is Critical, 2. Add Execution Path Diagrams, 2. `src/utils/PunctuationProcessor.ts`, 2. Understanding When Functions Are Called, 3. Lightweight Always-On Logging, 3. `src/utils/TextChunker.js` (+17 more)

### Community 62 - "SemanticPatternProcessor.js"

Cohesion: 0.23
Nodes (5): PrecomputedTokenStrings, classifyVariableType(), getHeuristicType(), VariableClassification, buildPrecomputedStrings()

### Community 63 - "Phase 8 Tests - Pattern Matching Validation"

Cohesion: 0.07
Nodes (26): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, app, security, windows (+18 more)

### Community 67 - "useHighlightingState.ts"

Cohesion: 0.27
Nodes (8): HighlightingState, useHighlightingState(), UseHighlightingStateResult, highlightingReducer(), INITIAL_HIGHLIGHTING_STATE, isValidUnitIndex(), REQUIRED_PROPERTIES, MAX_SAFE_SEGMENTS

### Community 68 - "tauriAPI.ts"

Cohesion: 0.20
Nodes (10): CMD, LookupIndexDictionary, LookupIndexEntry, LookupIndexOptions, LookupIndexResult, NOTE: This is the application's public API (Tauri IPC wrapper), NOT a debug API., requireValidDictionaryIds(), ResetDictionariesOptions (+2 more)

### Community 69 - "WasmStringProcessor.js"

Cohesion: 0.22
Nodes (4): _initializeStringProcessor(), lifecycle, _WASM_BINARY_URL, WasmStringProcessor

### Community 70 - "HookTypes.d.ts"

Cohesion: 0.08
Nodes (24): clipboard-manager:allow-read-text, clipboard-manager:default, core:default, dialog:allow-message, dialog:allow-open, dialog:allow-save, dialog:default, fs:allow-copy-file (+16 more)

### Community 72 - "text_assembly.rs"

Cohesion: 0.14
Nodes (8): ConsumableToken, markPhraseFollowersConsumed(), getSemanticTokens(), getTextFromTokens(), getTextPositionForTokenIndex(), getTokenSpanForText(), LegacyTextToken, TextToken

### Community 74 - "Code Review: Pure Computation Migration to wasm-core"

Cohesion: 0.13
Nodes (22): RowShell(), SemanticTypeToggleCell(), NewRuleModal(), extractHanChars(), parseValidatedKey(), parseValidatedNumber(), RuleMatchesModalProps, RuleRow() (+14 more)

### Community 75 - "Code Review Fix Summary - 2026-01-27"

Cohesion: 0.27
Nodes (4): ADR-0010, DictionaryMatchLookup, ComparableMatch, compareMatchesBySpecificityThenPriority()

### Community 77 - ".new"

Cohesion: 0.17
Nodes (19): BackgroundCleanupStats, CleanupTask, ComponentMetrics, ComponentProfile, ComponentStats, MemorySample, MemorySnapshot, Performance (+11 more)

### Community 79 - "TranslatorControls.tsx"

Cohesion: 0.29
Nodes (5): PerformanceStats, ProgressInfo, QUICK_ADD_HINTS, RegressionHealth, TranslatorControlsProps

### Community 81 - "Task 1: Enable Semantic Type filter for Structural Patterns"

Cohesion: 0.09
Nodes (22): Dictionary JSON Format: Two Tiers, Dictionary Type Classification, `DictionaryContext.tsx` CRUD Audit Checklist, `DictionaryInfo` Name Collision, `DuplicateDictionaryTableView` — Duplicate Rendering Not in EVDT, Error Handling, Fiction Pattern Merge Order Is Load-Bearing, Hook Tests — jsdom Gotchas (+14 more)

### Community 82 - "takeFromExternrefTable0"

Cohesion: 0.17
Nodes (19): ADR-0036, POSITION_TRACKING, TranslationExecutionContext, UseCharacterOnlyBridgeOptions, getFirstGrapheme(), MatchCandidate, buildSegmentsFromPositions(), segmentFromPositionMetadata() (+11 more)

### Community 83 - "BatchProcessingTypes.d.ts"

Cohesion: 0.15
Nodes (21): DefaultClock, InMemoryState, NotKeyed, RateLimiter, build_lookup_index(), build_lookup_index_impl(), build_trie_from_entries(), DictionaryData (+13 more)

### Community 85 - "Documentation Index"

Cohesion: 0.40
Nodes (5): Archive, Decisions, Documentation Index, Guides, Reference

### Community 88 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.08
Nodes (41): ConfigurationManager(), ADR-0027, useDictionaryConfigManagement(), DictionaryContext, DictionaryProvider(), DictionaryProviderProps, invokeEngineInvalidator(), useDictionaryPersistence() (+33 more)

### Community 89 - "Implementation Details ✅"

Cohesion: 0.23
Nodes (20): Uint32Array, flat(), resolve_global_conflicts(), resolve_match_conflicts(), Vec, run_conflict_resolution(), run_conflict_resolution_priority_first(), test_earlier_start_wins_on_equal_length_and_type() (+12 more)

### Community 91 - ".log"

Cohesion: 0.20
Nodes (7): Into, Self, test_response_ok_with_message_sets_message_field(), test_validate_dictionary_payload_rejects_excessive_nesting(), test_validate_dictionary_payload_rejects_non_object(), test_validate_dictionary_payload_rejects_too_many_entries(), validate_dictionary_payload()

### Community 92 - "MemoryLeakDetector"

Cohesion: 0.10
Nodes (21): scripts, build, build-wasm, build-wasm-dev, dev, format, format:check, generate-wasm-hashes (+13 more)

### Community 93 - "src/components/dictionary — Gotchas"

Cohesion: 0.16
Nodes (17): AppearanceResult, BatchDictionaryResponse, BatchDictionaryResult, ConfigurationResult, DictionaryListResult, DictionaryLoadResult, DictionaryOperationResult, DirectorySelectOptions (+9 more)

### Community 96 - "TranslationProfiler"

Cohesion: 0.10
Nodes (20): Expected Output, Failure Case:, How to Run Tests, Next Steps, "No match found", Notes, Option 1: Browser Console - Simple Test (Recommended), Option 2: Add to App Code (+12 more)

### Community 97 - "DictionaryWasmLookup"

Cohesion: 0.24
Nodes (14): PatternMetadata, PatternToken, PatternUsage, Default, HashMap, Option, Self, String (+6 more)

### Community 98 - "Rust Trie Dictionary Migration Plan"

Cohesion: 0.29
Nodes (6): CategoryInfo, CharacterInfo, CompiledRegexes, PunctuationCategory, ResolvedConfig, UnicodePunctuationConfig

### Community 99 - "translation_wasm_core.js"

Cohesion: 0.11
Nodes (8): cacheEntryIterator, dictionaryEntryIterator, getV8OptimizationMetrics(), memoryStatsIterator, optimizationMetrics, performanceMetricsIterator, printV8OptimizationReport(), segmentIterator

### Community 103 - "precompute-dictionaries.js"

Cohesion: 0.11
Nodes (18): Background for the Implementer, How the patterns table currently looks (column widths), Key locations in `EnhancedVirtualizedDictionaryTable.tsx`, Patterns Semantic Column Implementation Plan, Running tests, Step 1: Verify baseline, Step 2: Edit 1 — Add "Semantic" header between Translation and X types, Step 3: Run type-check after Edit 1 (+10 more)

### Community 107 - ".__destroy_into_raw"

Cohesion: 0.26
Nodes (10): MatchResult, HashMap, Option, Self, String, Vec, test_basic_insertion_and_lookup(), test_entry_count() (+2 more)

### Community 109 - "CacheTypes.d.ts"

Cohesion: 0.11
Nodes (19): lucide-react, dependencies, lucide-react, react-dom, react-resizable-panels, @tauri-apps/api, @tauri-apps/plugin-clipboard-manager, @tauri-apps/plugin-dialog (+11 more)

### Community 111 - "SemanticPatternProcessor"

Cohesion: 0.10
Nodes (20): Appearance Style Memos — Static Constants, Canonical Type Homes, `ClickableTranslationOptimized` Paragraph Logic, ConfigurationManager Settings Must Be Traced to the Engine, Engine Lifecycle — `useTranslatorEngine` Hook, Error Utilities, Global Singleton Lifecycle — `performanceHealth` / `systemPerformanceMonitor`, Hotkey Architecture (+12 more)

### Community 112 - "LRUCache"

Cohesion: 0.12
Nodes (16): ADR-003: TypeScript Hybrid Architecture, Alternative 1: Full TypeScript Migration, Alternative 2: Keep Everything JavaScript, Alternative 3: Strategic Hybrid (TypeScript for Boundaries, JavaScript for Core) ✅ SELECTED, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 114 - "src/components — Gotchas"

Cohesion: 0.18
Nodes (14): AtomicU32, get_global_chunker_stats(), get_stats(), JsValue, Result, String, test_ascii_fallback_when_unicode_properties_disabled(), test_basic_chunking() (+6 more)

### Community 115 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.12
Nodes (16): ADR-002: Dual-Path Clickable Highlighting Architecture, Alternative 1: Consolidate Into Unified Highlighting System, Alternative 2: Keep Separate Paths (Current Implementation) ✅ SELECTED, Alternative 3: Partial Consolidation (Helper Functions), Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 116 - "configValidation.ts"

Cohesion: 0.12
Nodes (16): ADR-004: 5-Phase Processing Order Immutability, Alternative 1: Reorder Phases for Performance, Alternative 2: Parallel Processing (All Phases Simultaneously), Alternative 3: Keep Current Sequential Order (Patterns First) ✅ SELECTED, Alternatives Considered, Architectural Implications, Consequences, Context and Problem Statement (+8 more)

### Community 117 - "Hotfix: Missing Method Safety Checks"

Cohesion: 0.12
Nodes (15): ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors, Alternative 1: Copy-fix across all three processors ✗ Rejected, Alternative 2: Base class / mixin for WASM processors ✗ Rejected, Alternative 3: WasmProcessorLifecycle class ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+7 more)

### Community 118 - "Clickable Highlighting Feature - Code Review"

Cohesion: 0.11
Nodes (18): Active vs Dead Code, CI/CD Pipeline, Code Formatting (Prettier), Development Commands, Development Debugging Tools, Development Guide, Extraction Criteria, Fallow Dead-Code Analysis (+10 more)

### Community 119 - "Security Considerations"

Cohesion: 0.10
Nodes (19): Build Profile, `cargo fmt` Has Never Been Run on This Crate — Don't Treat Drift as Your Regression, Don't Mass-Reformat, Checking Module Liveness Before a Deep Call-Site Grep, CI Compiles With `-D warnings`; Local `cargo test` Does Not, Deleting a Module — Check Cargo.toml Too, `number_processor.rs` Is Rust Spec Only — No WASM Export, PatternIndex Key Is First Char — Lookup Must Match, Phase A Composite-Coverage Scoring (+11 more)

### Community 120 - "translation_wasm_core.d.ts"

Cohesion: 0.13
Nodes (15): ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation, Alternative 1: Keep inline mutation per adapter ✗ Rejected, Alternative 2: Return results, single apply site ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants, Decision (+7 more)

### Community 121 - "ElectronTypes.d.ts"

Cohesion: 0.13
Nodes (14): ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext, Alternative 1: Move cache invalidation to `DictionaryContext` ✗ Rejected, Alternative 2: Keep invalidation in `handleForceReload` ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants, Decision (+6 more)

### Community 122 - "pattern.rs"

Cohesion: 0.13
Nodes (14): ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler, Alternative 1: Full HotkeyRegistry ✗ Rejected, Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected, Alternative 3: Keep useHotkeyHandler ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+6 more)

### Community 129 - "ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors"

Cohesion: 0.14
Nodes (13): 1. Start the Development Server, 2. Open Browser DevTools, 3. Run Full Benchmark Suite, 4. Export Results, 5. Save Baseline, Benchmark Baseline Instructions, Expected Baseline Targets, How to Run Baseline Benchmarks (+5 more)

### Community 130 - "Design"

Cohesion: 0.14
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

### Community 137 - "ADR-005: Eager Dictionary Loading via DictionaryContext"

Cohesion: 0.14
Nodes (10): MemoryPressure, BufferMetadata, MemoryPoolStats, OptimizationRecommendation, PoolCategory, PoolConfig, PoolStats, WasmBufferAllocator (+2 more)

### Community 139 - "CRITICAL-3: TranslationCache - O(n) Cache Invalidation"

Cohesion: 0.20
Nodes (7): TwoPhasePatternProcessor, Default, JsValue, Result, Self, String, WasmPatternProcessor

### Community 140 - "TrieNode"

Cohesion: 0.09
Nodes (31): SemanticTypePicker(), SemanticTypePickerProps, supportsSemanticTypes(), BadgeProps, FilterChipButtonProps, MetadataBadge(), VirtualRowProps, ControlledEditableCell() (+23 more)

### Community 143 - "WordTransformToolbar.tsx"

Cohesion: 0.15
Nodes (12): lint-staged, *.{js,jsx,ts,tsx}, _.{js,jsx,ts,tsx,css,json,md}, src/\**/_.{ts,tsx}, name, packageManager, private, type (+4 more)

### Community 144 - ".translateWithProgressiveBatches"

Cohesion: 0.19
Nodes (11): CacheHealthResponse, check_dictionary_cache_health(), emit_poisoning_event(), now_ms(), read_active_proper_nouns(), record_mutex_poisoning(), test_access_order_timestamp_is_milliseconds_not_seconds(), test_get_does_not_pollute_access_order_on_miss() (+3 more)

### Community 145 - "ParallelConfig"

Cohesion: 0.22
Nodes (10): BaseSegment, ClickableOriginalSemanticProps, ClickableSegment, ClickableTranslationOptimizedProps, ClickableTranslationSemanticProps, ClickDirection, PrebuiltSegment, SegmentClickHandler (+2 more)

### Community 146 - "package.json"

Cohesion: 0.17
Nodes (11): PatternMatchResult, PatternMetadata, PatternProcessingOptions, PatternProcessorAdapter, PatternProcessorResult, PatternToken, PatternTokenType, PatternUsageStats (+3 more)

### Community 148 - "ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext"

Cohesion: 0.11
Nodes (12): Active ADRs, [ADR-001: WASM Batch Loading — Remove Batch Wrapper](./ADR-001-wasm-batch-loading-failure.md), [ADR-002: Dual-Path Clickable Highlighting](./ADR-002-dual-path-clickable-highlighting.md), [ADR-003: TypeScript Hybrid Architecture](./ADR-003-typescript-hybrid-architecture.md), [ADR-004: 5-Phase Processing Order Immutability](./ADR-004-five-phase-processing-order-immutability.md), [ADR-006: PatternProcessor Interface](./ADR-006-pattern-processor-interface.md), ADR Format, Architecture Decision Records (ADRs) (+4 more)

### Community 153 - "Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`"

Cohesion: 0.17
Nodes (12): **/_.spec.js, \**/_.spec.ts, **/_.spec.tsx, \**/_.test.js, **/_.test.ts, \**/_.test.tsx, exclude, build (+4 more)

### Community 154 - "Dictionary Management and Memory Code Review"

Cohesion: 0.23
Nodes (7): calculateChecksum(), DictionaryTrie, __dirname, __filename, main(), precomputeDictionary(), TrieNode

### Community 155 - "WasmTextChunker"

Cohesion: 0.17
Nodes (10): StreamingProgressBar, StreamingProgressBarProps, StreamingState, StreamingStateForProgress, StreamingTextRenderer, StreamingTextRendererProps, StreamingTranslationDisplay, StreamingTranslationDisplayProps (+2 more)

### Community 159 - ".handleSmartCleanup"

Cohesion: 0.24
Nodes (8): PunctuationComponents, PunctuationDebugInfo, SpecialPattern, NormalizeTarget, QUOTE_CATEGORIES, QUOTE_TYPES, QuoteInfo, QuoteTypeName

### Community 168 - "High-Priority Issues 🟠"

Cohesion: 0.18
Nodes (10): Category 1: Future Integration APIs (18 warnings), Category 2: Helper/Utility Methods (8 warnings), Category 3: Dead Code from Earlier Phases (3 warnings), Compilation Warnings - Explained, Current Status, Fixed Warnings (7 total), Remaining Warnings (29 total) - All Expected, Summary (+2 more)

### Community 169 - "7. Clickable Highlighting Feature Analysis"

Cohesion: 0.35
Nodes (4): Dictionary tab, Global (any tab), Keyboard Shortcuts, Translator tab

### Community 170 - "wasm-core Pattern Processor"

Cohesion: 0.20
Nodes (9): Constraints, Design, Design: Semantic Type for Structural Pattern Entries, Files Touched, Problem, Section 1 — Data Model, Section 2 — Translation Engine: WASM (primary fix), Section 3 — Translation Engine: JS cross-pass fix (+1 more)

### Community 171 - "text_chunker.rs"

Cohesion: 0.36
Nodes (9): bench_trie_vs_aho_corasick(), build_corpus(), build_dictionary(), cjk_pool(), Lcg, Criterion, String, TrieNode (+1 more)

### Community 172 - "getStringFromWasm0"

Cohesion: 0.20
Nodes (9): AppConfiguration, AppearanceSettings, DictionaryInfo, DictionaryTypeDefinition, DictionaryTypesCollection, FontSettings, LetterSpacing, TabId (+1 more)

### Community 173 - "TranslationProfiler"

Cohesion: 0.32
Nodes (9): calculateDictionaryChecksum(), deserializeTrie(), savePrecomputedTrie(), serializeTrie(), tryLoadPrecomputedTrie(), TrieNode, getCacheStats(), loadDictionaryWithCache() (+1 more)

### Community 176 - "UnicodePunctuationDetector.ts"

Cohesion: 0.36
Nodes (9): bench_trie_vs_aho_corasick(), build_corpus(), build_dictionary(), cjk_pool(), Lcg, Criterion, String, TrieNode (+1 more)

### Community 177 - "QuoteProcessor"

Cohesion: 0.16
Nodes (10): fetchWasmBinary(), wasmBinaryCache, computeSHA256(), EXPECTED_EXPORTS, loadIntegrityManifest(), verifyWasmBinaryIntegrity(), verifyWasmInstance(), verifyWasmModule() (+2 more)

### Community 178 - "AI Readiness Evaluation: chinese-translator-tauri"

Cohesion: 0.22
Nodes (8): ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline, Alternative 1: Extract to `TokenStringCache.ts` with DI ✗ Rejected, Alternative 2: Keep inline ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Supersession Note (2026-07-28)

### Community 179 - "3. Performance Optimizations ⭐⭐⭐⭐⭐"

Cohesion: 0.22
Nodes (8): ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider, Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected, Alternative 2: Extract loadInitialState only ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers

### Community 180 - "PrecomputedTrieStats"

Cohesion: 0.22
Nodes (8): Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected, Addendum — 2026-07-17d: Cluster deleted, not fixed, ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine, Consequence, Context, Decision, Reasoning, What Was Done Instead

### Community 182 - "SegmentMatcher"

Cohesion: 0.15
Nodes (11): DictionaryValue, FlatDictionaryEntry, flattenDictionaryEntries(), DEBUG_LEVELS, buildTrieFromDictionary(), resolveDictionaryPriority(), TrieBuildResult, DictionaryCategory (+3 more)

### Community 183 - "text_tokenizer.rs"

Cohesion: 0.22
Nodes (8): Column header, Design, Design: Semantic Column in Patterns Dictionary Table, Files Touched, No new components, Problem, Row cell, Width adjustment

### Community 184 - "ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline"

Cohesion: 0.22
Nodes (8): vite.config.ts, compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 185 - "LookupIndexUtils.ts"

Cohesion: 0.06
Nodes (33): MEMORY_THRESHOLDS, MemoryThresholds, UI_UPDATE_THRESHOLDS, UIUpdateThresholds, DEVICE_MEMORY_LIMITS, getAdaptiveMaxSegments(), MEMORY_MANAGEMENT, MEMORY_WASTE_DETECTION (+25 more)

### Community 186 - "DebouncedProgressHandler"

Cohesion: 0.15
Nodes (3): ADR-0037, DictionaryWasmLookup, validateWasmDictionaryMatch()

### Community 187 - "wasmOperationTimeout.js"

Cohesion: 0.22
Nodes (8): Rust Arithmetic, Rust String Lengths, Tauri Backend + WASM Core — Gotchas, Tauri Command Security, WASM-Bridged Structs, wasm-core Architecture, WASM `&mut self` Borrow Rule (Rust 1.84+), WASM-Only Symbols Cause SIGABRT on Native Tests

### Community 190 - "IncrementalDictionarySorter"

Cohesion: 0.25
Nodes (7): ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable, Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected, Alternative 2: Keep coordination in TranslationEngine ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers

### Community 194 - "Integration #3: V8 Optimization for Memory Tracking (Task #8)"

Cohesion: 0.25
Nodes (7): Animations and Keyframes, Class Name Collisions, Cross-Component Reuse, File Placement, Hiding Elements — Use Conditional Rendering, Not `visibility: hidden`, Modal Overlays, src/styles — CSS Module Conventions

### Community 195 - "Testing Recommendations"

Cohesion: 0.25
Nodes (7): AccelerationInfo, PositionMappingStats, SemanticRange, TextPositionMapping, ValidationError, ValidationResult, ValidationWarning

### Community 196 - "⚠️ MEDIUM-2: No Validation of WASM Token Modifications"

Cohesion: 0.12
Nodes (12): callWasmWithTimeout(), createTimeoutWrapper(), DEFAULT_WASM_TIMEOUTS, TimeoutError, TimeoutManager, getWasmPatternProcessorStats(), isWasmPatternProcessorReady(), lifecycle (+4 more)

### Community 197 - "Compilation Warnings - Explained"

Cohesion: 0.25
Nodes (3): PerformanceHealth, hasWasmPatternProcessorFailed(), isWasmPatternProcessorAvailable()

### Community 199 - "DevicePerformanceDetector"

Cohesion: 0.29
Nodes (6): ADR-010: Dictionary Match Sort — Specificity Over Provenance, Alternatives Considered, Consequences, Context, Decision, Rationale

### Community 200 - "Detailed Fix Descriptions"

Cohesion: 0.29
Nodes (6): ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation, Consequence, Context, Decision, Reasoning, What Was Done Instead

### Community 201 - "RustLookupIndexManager"

Cohesion: 0.29
Nodes (6): Addendum — 2026-07-18: Extends to `TwoPhasePatternProcessor`'s pattern-profiling cluster, ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface, Context, Decision, If App Callers Are Added, Reason

### Community 202 - "UnicodePunctuationDetector"

Cohesion: 0.29
Nodes (6): ADR-022: Keep streamingReducer and Initial State Constants Exported, Boundary Condition, Context, Decision, Reason, Supersession Note

### Community 203 - "Task 6: UI — add semantic type selector to pattern entries"

Cohesion: 0.29
Nodes (6): ADR-026: Do Not Move useDictionaryCRUD to src/hooks/, Context, Decision, Reason, Supersession Note (2026-06-27), When to Revisit

### Community 205 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Behaviour, Change, Design, Design: Semantic Type Filter for Structural Patterns, Files Touched, Problem

### Community 206 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Chinese-Vietnamese Translator — Dev Memory, Comprehensive architecture code review — 14 issues fixed, Fixes Done (2026-02-22, session 19), Key Architectural Invariants (most frequently violated), Session History Index, Stable Project Facts

### Community 207 - "✅ Successfully Integrated (6 Optimizations)"

Cohesion: 0.33
Nodes (6): computeFileHash(), __dirname, __filename, generateIntegrityManifest(), MANIFEST_PATH, WASM_DIR

### Community 211 - "Translation Paths Efficiency Review — 2026-02-07"

Cohesion: 0.25
Nodes (8): Detailed Fix Descriptions, Fix 5: MEDIUM-1 - Add dispose() to TranslationCache, Fix 6: Update DictionaryManager to use TranslationCache.dispose(), Impact, Impact, Problem, Solution, Solution

### Community 212 - "6. Edge Case Analysis"

Cohesion: 0.33
Nodes (5): ADR-017: Skip WasmMemoryPool Analytics Separation, Consequence, Context, Decision, Reasoning

### Community 213 - "5. Code Quality Review"

Cohesion: 0.33
Nodes (5): ADR-018: Unified PerformanceReport State in usePerformanceMonitoring, Consequence, Context, Decision, Reasoning

### Community 214 - "Part 6: Final Recommendations"

Cohesion: 0.33
Nodes (5): ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting, Context, Decision, If a Performance Dashboard Is Built, Reason

### Community 215 - "TypeScript/Rust Optimization Project"

Cohesion: 0.33
Nodes (5): ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput, Context, Decision, Reason, When to Revisit

### Community 216 - "Code Quality Assessment"

Cohesion: 0.33
Nodes (5): ADR-024: Do Not Move Style Objects into useAppearanceSettings, Context, Decision, Reason, Revisit condition

### Community 217 - "⚠️ CRITICAL-3: Consumed Token Contract Validation (MISSING)"

Cohesion: 0.33
Nodes (5): ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods, Context, Decision, Reason, When to Revisit

### Community 218 - "Code Review: 5-Phase Processing Token Consumption"

Cohesion: 0.33
Nodes (5): ADR-031: Skip Splitting dictionary_commands.rs by Concern, Consequence, Context, Decision, Reasoning

### Community 219 - "Positive Findings ✅"

Cohesion: 0.33
Nodes (5): ADR-032: Delete PerformanceBaselineTracker's cacheHitRate Machinery, Consequence, Context, Decision, Reasoning

### Community 220 - "generate-wasm-hashes.js"

Cohesion: 0.29
Nodes (6): ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage, Consequence, Context, Decision, Reasoning, Update (2026-08-25)

### Community 221 - "SemanticTypes.d.ts"

Cohesion: 0.33
Nodes (5): ADR-034: Skip Building DictionaryManager.validateIntegrity(), Consequence, Context, Decision, Reasoning

### Community 222 - ".translate"

Cohesion: 0.33
Nodes (5): ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup), Consequence, Context, Decision, Reasoning

### Community 223 - "ReadonlyOptimizationUtils.js"

Cohesion: 0.25
Nodes (7): Addendum (2026-08-25): Extending the decision to `segmentFromPositionMetadata` vs `precomputeOriginalSegments`, Addendum (2026-08-25): `precomputeSegments` deleted — this ADR's original subject no longer exists, ADR-036: Skip Unifying `precomputeSegments`/`precomputeOriginalSegments` Into a Shared Scanner, Consequence, Context, Decision, Reasoning

### Community 224 - "ComponentMemoryProfiler.ts"

Cohesion: 0.33
Nodes (5): ADR-038: Reject "Deepen RuleMatchesModal to Preview Real Output", Consequence, Context, Decision, Reasoning

### Community 230 - "PunctuationProcessor"

Cohesion: 0.33
Nodes (6): src/**/\*.d.ts, src/**/_.js, src/\**/_.jsx, src/**/\*.ts, src/**/*.tsx, include

### Community 231 - "Optimization Master Index - Complete Reference"

Cohesion: 0.33
Nodes (4): read_clipboard(), AppHandle, Result, String

### Community 232 - "Priority 1: TypeScript Migration (Type Safety + Performance)"

Cohesion: 0.33
Nodes (5): ApplyUpdatesOptions, ApplyUpdatesResult, TokenScanOptions, TokenScanResult, TokenUpdate

### Community 234 - "ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider"

Cohesion: 0.33
Nodes (5): ADR-040: Reject Aho-Corasick as a Swap for the Native Lookup-Index Trie, Consequence, Context, Decision, Reasoning

### Community 236 - "Tauri Backend + WASM Core — Gotchas"

Cohesion: 0.33
Nodes (5): ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`, Consequences, Context, Decision, Reason

### Community 237 - "find_best_pattern_match"

Cohesion: 0.40
Nodes (4): ADR-037: Delete Orphaned WASM Boundary Validators, Keep `validateWasmDictionaryMatch`, Context, Decision, Reasoning

### Community 246 - "ADR-010: Dictionary Match Sort — Specificity Over Provenance"

Cohesion: 0.25
Nodes (8): Background, Step 1: Write a failing test, Step 2: Run test to verify it fails, Step 3: Add the new block in `buildVariableCache`, Step 4: Run test, Step 5: Run full JS suite, Step 6: Commit, Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`

### Community 247 - "ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine"

Cohesion: 0.40
Nodes (4): ProgressData, SemanticArrays, SemanticMetadata, Token

### Community 248 - "ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`"

Cohesion: 0.40
Nodes (4): module, $schema, ts-node, compilerOptions

### Community 256 - "9. Recommendations"

Cohesion: 0.25
Nodes (8): Background, Step 1: No test needed for this visual change — run type-check instead, Step 2: Extend the condition to include patterns, Step 3: Run type-check, Step 4: Run full JS suite, Step 5: Manual smoke test, Step 6: Commit, Task 6: UI — add semantic type selector to pattern entries

### Community 257 - "generate-wasm-hashes.js"

Cohesion: 0.33
Nodes (6): Architecture, Chinese-Vietnamese Translation App, Critical Constraints, Essential Commands, graphify, Where Everything Else Lives

### Community 258 - "WasmConflictResolution.js"

Cohesion: 0.33
Nodes (9): fireCascadeRetire(), getPhase2Priority(), initialize(), jsFallback(), jsFallbackPhase2(), packMatches(), packMatchesPhase2(), resolveGlobalConflictsWasm() (+1 more)

### Community 259 - "DictionaryManager Types"

Cohesion: 0.50
Nodes (3): DictionaryEntryMetadata, TrieMatch, TrieStats

### Community 260 - "Keyboard Shortcuts"

Cohesion: 0.50
Nodes (4): lib, DOM, DOM.Iterable, ES2020

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

### Community 269 - "ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting"

Cohesion: 0.33
Nodes (5): ADR-039: Skip Splitting `useDictionaryEntryForm`, Consequence, Context, Decision, Reasoning

### Community 270 - "AppReadinessOverlay.tsx"

Cohesion: 0.67
Nodes (3): node, react-dom, types

### Community 272 - "12. Implementation Summary (2026-02-07)"

Cohesion: 0.33
Nodes (6): Step 1: Write a failing integration test, Step 2: Apply the fix in `two_phase.rs`, Step 3: Run tests to verify the fix works, Step 4: Run full Rust test suite, Step 5: Commit, Task 3: Use `semantic_type` in Phase B enhanced cache (PRIMARY FIX)

### Community 273 - "Fix 8: BONUS - Fix method name typos in TranslationCache"

Cohesion: 0.40
Nodes (5): Code Quality Improvements, Consistency, Documentation, Error Handling, Maintainability

### Community 274 - "Conclusion"

Cohesion: 0.26
Nodes (12): Error, PathBuf, export_dictionaries_impl(), read_zip_entries(), sanitize_io_error(), test_export_empty_directory_produces_empty_zip(), test_export_errors_when_dictionary_dir_missing(), test_export_skips_non_json_files() (+4 more)

### Community 276 - "Appendix: Evidence & Metrics"

Cohesion: 0.18
Nodes (10): 1. These APIs do not validate their arguments — a wrong one degrades silently, 2. Code that looks redundant here is load-bearing — each of these was already removed once, and broke something, 3. Three implementations must move together, 4. Position arithmetic in `postProcess` has three independent traps, 5. The WASM wrappers share one binary, so failure is always collective, 6. State has one owner — do not re-add a local copy, Dictionaries, Punctuation, quotes, and chunk boundaries (+2 more)

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

### Community 292 - "lib.rs"

Cohesion: 0.31
Nodes (8): base36_encode(), DictionaryVersion, generate_content_hash(), normalize_single(), HashMap, String, TrieNode, VersionedDictionary

### Community 293 - "src/components/rules — Gotchas"

Cohesion: 0.40
Nodes (4): Compact Toggle-in-a-Table-Cell Pattern, src/components/rules — Gotchas, `TransformRule.relocate` — Renamed from `moveWords: number` 2026-08-24, Two UI Surfaces, One Set of Field Policies

### Community 294 - "ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput"

Cohesion: 0.67
Nodes (3): Future Improvements, Long Term, Short Term

### Community 295 - "husky"

Cohesion: 0.67
Nodes (3): Manual Verification Completed, Testing Required, Verification Checklist

### Community 296 - "sanitizeDictionaryEntry"

Cohesion: 0.15
Nodes (20): DictionaryManager(), DictionaryManagerProps, SelectionState, DICTIONARY_TYPES, sanitizeDictionaryEntry(), sanitizeForJson(), DictionaryTypeFlags, isFictionPatternsId() (+12 more)

### Community 298 - ".load_dictionary"

Cohesion: 0.36
Nodes (5): DictionaryEntry, normalize_batch(), JsValue, Option, Result

### Community 300 - "buildLookupIndexOrFallback"

Cohesion: 0.31
Nodes (5): DICTIONARY_LOOKUP, buildLookupIndexOrFallback(), LookupIndexBuilderDeps, LookupIndexDictionaryManager, LookupIndexOptions

### Community 346 - "BatchLogger.js"

Cohesion: 0.19
Nodes (5): batchLog, debugObjectPool, getLogEntry(), ObjectPool, releaseLogEntry()

### Community 349 - "ReadonlyOptimizationUtils.js"

Cohesion: 0.33
Nodes (3): findUnprocessedTokens(), metrics, scanTokens()

## Knowledge Gaps

- **1266 isolated node(s):** `checkJs`, `jsx`, `module`, `moduleResolution`, `target` (+1261 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **100 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Logger` connect `WasmPatternProcessor.js` to `WasmConflictResolution.js`, `V8OptimizationUtils.js`, `PerformanceProfiler`, `DictionaryManagerTypes.d.ts`, `TranslationEngineTypes.d.ts`, `ADR-005: Eager Dictionary Loading via DictionaryContext`, `TrieNode`, `UtilityTypes.d.ts`, `Content Security Policy (CSP) and WASM Security`, `Tauri Backend Security Audit`, `Future Improvements Implementation - 2026-02-01`, `PatternAnalyzer`, `Detailed Optimization Tracking`, `PatternProcessingTypes.d.ts`, `TypeScript/Rust Optimization Progress Report`, `Task 1: Add `semantic_type`to Rust`PatternMetadata``, `sanitizeDictionaryEntry`, `Implementation Log`, `TranslationProfiler`, `QuoteProcessor`, `UITypes.d.ts`, `WasmDictionaryManager`, `SegmentMatcher`, `LookupIndexUtils.ts`, `DebouncedProgressHandler`, `SemanticPatternProcessor.js`, `ToastContext.tsx`, `ScrollPositionRecovery`, `useHighlightingState.ts`, `tauriAPI.ts`, `⚠️ MEDIUM-2: No Validation of WASM Token Modifications`, `WasmStringProcessor.js`, `Code Review Fix Summary - 2026-01-27`, `.new`, `takeFromExternrefTable0`, `ADR-002: Dual-Path Clickable Highlighting Architecture`, `BatchLogger.js`, `ReadonlyOptimizationUtils.js`, `Rust Trie Dictionary Migration Plan`, `translation_wasm_core.js`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `react` connect `TranslationEngine.js` to `sanitizeDictionaryEntry`, `CacheTypes.d.ts`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `dependencies` connect `CacheTypes.d.ts` to `TranslationEngine.js`, `WordTransformToolbar.tsx`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `checkJs`, `jsx`, `module` to the rest of the system?**
  _1266 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `number_processor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06384065372829417 - nodes in this community are weakly interconnected._
- **Should `Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.06978253813696851 - nodes in this community are weakly interconnected._
- **Should `WasmPatternProcessor.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12605042016806722 - nodes in this community are weakly interconnected._
