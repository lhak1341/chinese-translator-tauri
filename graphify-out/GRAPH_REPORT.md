# Graph Report - chinese-translator-tauri (2026-09-26)

## Corpus Check

- 416 files · ~410,680 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 4605 nodes · 9510 edges · 306 communities (213 shown, 93 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 175 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `d1cbfe4c`
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
- WasmTextChunker
- TwoPhasePatternProcessor
- .new
- WasmRegexUtilsWrapper
- TranslatorControls.tsx
- SmartMemoryCoordinator
- Task 1: Enable Semantic Type filter for Structural Patterns
- takeFromExternrefTable0
- SegmentedParagraphs.tsx
- list_dictionaries_with_prefix
- Documentation Index
- index.ts
- WasmTextAssemblerWrapper
- ADR-002: Dual-Path Clickable Highlighting Architecture
- Implementation Details ✅
- eslint-plugin-import
- .log
- MemoryLeakDetector
- DictionaryTrieLoader.js
- conflict_resolution.rs
- RegexUtils
- TranslationProfiler
- DictionaryWasmLookup
- validate_dictionary_payload
- translation_wasm_core.js
- WasmMemoryPool
- eslint-plugin-react-refresh
- useTransformRules.ts
- precompute-dictionaries.js
- buildLookupIndexOrFallback
- Completed Optimizations
- DictionaryEngine
- .__destroy_into_raw
- husky
- CacheTypes.d.ts
- UnicodePunctuationDetector.ts
- SemanticPatternProcessor
- LRUCache
- WasmProcessorLifecycle
- src/components — Gotchas
- ADR-002: Dual-Path Clickable Highlighting Architecture
- configValidation.ts
- Hotfix: Missing Method Safety Checks
- Clickable Highlighting Feature - Code Review
- Security Considerations
- translation_wasm_core.d.ts
- ElectronTypes.d.ts
- pattern.rs
- ComponentMemoryProfiler
- jsdom
- PatternFailureTracker
- getSemanticTokens
- SmartMemoryPressureDetector
- SemanticArrayBuilder.ts
- ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors
- Design
- V8OptimizationTypes.d.ts
- ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error
- SemanticArrayBuilder
- wasmIntegrityVerifier.js
- useOutlineTranslations.ts
- ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential
- ADR-005: Eager Dictionary Loading via DictionaryContext
- vite
- CRITICAL-3: TranslationCache - O(n) Cache Invalidation
- prettier
- WindowedTranslationFill.ts
- list_dictionaries_with_prefix
- WordTransformToolbar.tsx
- ErrorBoundary
- ParallelConfig
- package.json
- BackgroundCleanupManager
- ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext
- fireCascadeRetire
- wasmIntegrityVerifier.js
- types
- PrecomputedTrieStats
- Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`
- Dictionary Management and Memory Code Review
- DictionaryTypes.ts
- WasmProcessorLifecycle
- lib.rs
- test_blob_load_save_round_trip_for_every_kind
- TranslationInputValidator
- buildLookupIndexOrFallback
- SemanticPatternProcessor.js
- @tauri-apps/cli
- @types/node
- .new
- ReadonlyOptimizationUtils.js
- CRITICAL-1: DictionaryManager Missing Cleanup Method
- High-Priority Issues 🟠
- 7. Clickable Highlighting Feature Analysis
- wasm-core Pattern Processor
- text_chunker.rs
- getStringFromWasm0
- ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation
- ADR-046: Keep `BookReader`'s Master-Scroll Composition and Refill Ref
- WasmBufferAllocator
- UnicodePunctuationDetector.ts
- types
- AI Readiness Evaluation: chinese-translator-tauri
- 3. Performance Optimizations ⭐⭐⭐⭐⭐
- PrecomputedTrieStats
- vitest
- .matchSemanticPattern
- text_tokenizer.rs
- ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline
- jsdom
- UnicodePunctuationDetector.ts
- wasmOperationTimeout.js
- ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup)
- PatternFailureTracker
- IncrementalDictionarySorter
- useOutlineTranslations.ts
- useReadingAnchor.ts
- Code Review: TypeScript/Rust Optimization Opportunities
- Integration #3: V8 Optimization for Memory Tracking (Task #8)
- Testing Recommendations
- BatchMemoryCleanup
- ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name
- PositionMapper
- DevicePerformanceDetector
- Detailed Fix Descriptions
- RustLookupIndexManager
- UnicodePunctuationDetector
- Task 6: UI — add semantic type selector to pattern entries
- LRUCache.ts
- Chinese-Vietnamese Translation App
- Chinese-Vietnamese Translation App
- ✅ Successfully Integrated (6 Optimizations)
- eslint-config-prettier
- ADR-043: Skip a Shared Generation-Guarded-Fill Primitive
- ADR-044: Skip Splitting `ReaderTab`'s `openBook`
- Translation Paths Efficiency Review — 2026-02-07
- 6. Edge Case Analysis
- 5. Code Quality Review
- Part 6: Final Recommendations
- TypeScript/Rust Optimization Project
- Code Quality Assessment
- @eslint/js
- Positive Findings ✅
- generate-wasm-hashes.js
- SemanticTypes.d.ts
- .translate
- ReadonlyOptimizationUtils.js
- ComponentMemoryProfiler.ts
- PunctuationProcessor
- Priority 1: TypeScript Migration (Type Safety + Performance)
- @tauri-apps/cli
- ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider
- @types/node
- Tauri Backend + WASM Core — Gotchas
- find_best_pattern_match
- vite
- vitest
- @vitest/ui
- ADR-010: Dictionary Match Sort — Specificity Over Provenance
- ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine
- ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`
- 9. Recommendations
- DictionaryManager Types
- Keyboard Shortcuts
- 📍 Code Locations Map
- Chinese-Vietnamese Translator — Dev Memory
- useCharacterOnlySegments.ts
- ESLint Tooling
- ADR-026: Do Not Move useDictionaryCRUD to src/hooks/
- ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation
- ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting
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

1. `Logger` - 119 edges
2. `TranslationEngine` - 108 edges
3. `react` - 100 edges
4. `temp_test_dir()` - 62 edges
5. `Domain Glossary` - 61 edges
6. `make_cache()` - 57 edges
7. `DictionaryResponse` - 41 edges
8. `DictionaryManager` - 37 edges
9. `compilerOptions` - 32 edges
10. `DictionaryCache` - 27 edges

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
- **Constant-zero-metric dead code sweep group** — rationale_constant_zero_metric_pattern, src_utils_dictionary_dictionarywasmlookup_dictionarywasmlookup, src_utils_dictionary_dictionarymanager_dictionarymanager, src_utils_translationengine_translationengine [INFERRED 0.85]

## Communities (306 total, 93 thin omitted)

### Community 0 - "dictionary_commands.rs"

Cohesion: 0.09
Nodes (44): Encoding, a_book_reaching_outside_gbk_reports_gbk_but_not_strictly_clean(), a_low_confidence_report_blocks_decoding(), a_multibyte_detection_is_acted_on_without_asking(), a_plain_gbk_book_is_strictly_clean(), a_single_byte_detection_is_reported_low_confidence(), an_override_decodes_a_file_detection_refused(), BookContent (+36 more)

### Community 1 - "number_processor.rs"

Cohesion: 0.06
Nodes (82): collision_message(), create_and_activate_proper_noun_file(), create_structural_patterns_dictionary_impl(), deactivate_proper_noun_file(), deeply_nested_json(), get_cache_key(), init_app_handle(), load_dictionaries_parallel_impl() (+74 more)

### Community 2 - "Logger"

Cohesion: 0.06
Nodes (59): NumberProcessor, ConversionPattern, create_conversion_patterns(), create_number_map(), NumberMatch, NumberProcessor, HashMap, JsValue (+51 more)

### Community 3 - "WasmPatternProcessor.js"

Cohesion: 0.07
Nodes (23): PerformanceStats, WasmDictionaryManager, base36_encode(), batch_reload_does_not_inflate_totals(), clearing_zeroes_the_counters(), DictionaryEngine, DictionaryEntry, DictionaryVersion (+15 more)

### Community 4 - "V8OptimizationUtils.js"

Cohesion: 0.14
Nodes (22): BookBindingContextValue, BindingBanner(), BindingBannerProps, BindingDialog(), BindingDialogProps, Choice, ChapterPanel(), ChapterPanelProps (+14 more)

### Community 5 - "PerformanceProfiler"

Cohesion: 0.12
Nodes (26): DictionaryEntry(), DictionaryEntryProps, FullEntryData, hasMetadata(), MoveDialog(), MoveDialogProps, SemanticTypePicker(), SemanticTypePickerProps (+18 more)

### Community 6 - "_assertNum"

Cohesion: 0.16
Nodes (18): BandGeometry, ChunkPlanOptions, clamp(), clampRange(), computeBands(), isBlankLine(), isKnownBlank(), isParagraphComplete() (+10 more)

### Community 8 - "TranslationEngineTypes.d.ts"

Cohesion: 0.07
Nodes (76): ChapterHeader, ChapterOutline, Drop, EncodingReport, Metadata, Path, a_line_range_includes_blank_lines_as_empty_strings(), an_oversized_file_is_refused_before_it_is_read() (+68 more)

### Community 9 - "Translator.jsx"

Cohesion: 0.09
Nodes (21): AssemblySegment, is_chinese_type(), make_segment(), needs_space(), PositionEntry, Default, JsValue, Result (+13 more)

### Community 10 - "Fiction Structural Pattern Dictionaries — Implementation Plan"

Cohesion: 0.03
Nodes (60): accumulateLoadResults, AdaptiveBatchSizer, AppConfig, AppearanceConfig, AppearanceSettings (hook), BatchMemoryCleanup, Book Loading, CharacterOnlyBridge (+52 more)

### Community 12 - "TranslationEngine Internals"

Cohesion: 0.12
Nodes (40): build_comprehensive_lookup_index(), build_index_parallel(), build_index_serial(), categorize_matches(), CategorizedMatches, Dictionary, DictionaryMatch, DictionaryType (+32 more)

### Community 13 - "UtilityTypes.d.ts"

Cohesion: 0.06
Nodes (35): MEMORY_THRESHOLDS, MemoryThresholds, UI_UPDATE_THRESHOLDS, UIUpdateThresholds, DEVICE_MEMORY_LIMITS, DICTIONARY_LOOKUP, MEMORY_MANAGEMENT, MEMORY_WASTE_DETECTION (+27 more)

### Community 14 - "Future Optimization Work - Deferred Integrations"

Cohesion: 0.07
Nodes (29): 1a. Add `list_fiction_pattern_dictionaries`, 1b. Add `create_structural_patterns_dictionary`, 1c. Add `rename_structural_patterns_dictionary`, 1d. Modify `rename_proper_nouns_dictionary` — cascade, 1e. Register in `lib.rs`, Design Decisions (do not re-litigate), Fiction Structural Pattern Dictionaries — Implementation Plan, File: `src/components/configuration/ConfigurationManager.tsx` (+21 more)

### Community 16 - "Content Security Policy (CSP) and WASM Security"

Cohesion: 0.17
Nodes (10): StreamingProgressBar, StreamingProgressBarProps, StreamingState, StreamingStateForProgress, StreamingTextRenderer, StreamingTextRendererProps, StreamingTranslationDisplay, StreamingTranslationDisplayProps (+2 more)

### Community 17 - "Tauri Backend Security Audit"

Cohesion: 0.15
Nodes (11): PanelVariant, ReaderHighlight, ReaderPanel, ReaderPanelProps, SegmentedLine, segmentTitle(), titleCache, VARIANT_CLASS (+3 more)

### Community 18 - "Future Improvements Implementation - 2026-02-01"

Cohesion: 0.13
Nodes (37): WordTransformToolbar(), WordTransformToolbarProps, RuleMatchesModal(), applyRule(), compareRulePrecedence(), computeInitialTranslation(), dictionarySupportsTransformRules(), findBestMatch() (+29 more)

### Community 19 - "WASM Code Review Fixes - 2026-01-28"

Cohesion: 0.12
Nodes (20): AdaptiveBatchSizerInput, AdaptiveBatchSizerLogEntry, AdaptiveBatchSizerResult, BatchPerformanceEntry, calculateNextBatchSize(), Segment, highlightPatternVariables(), PATTERN_VARIABLE_COLORS (+12 more)

### Community 21 - "WASM Serialization Optimization Implementation Plan"

Cohesion: 0.16
Nodes (12): CachedString, HashMap, JsValue, Option, Result, String, Vec, StringProcessor (+4 more)

### Community 22 - "WASM Dictionary Trie - Final Summary & Decision"

Cohesion: 0.15
Nodes (22): build_test_zip(), check_json_depth(), import_dictionaries_impl(), reset_dictionaries_impl(), PathBuf, save_json_file(), temp_test_dict_dir(), test_import_accumulates_error_for_invalid_json_entry() (+14 more)

### Community 23 - "Number Processing Phase - Code Review Fixes"

Cohesion: 0.20
Nodes (41): Error, Into, create_fiction_dictionary_pair(), create_proper_nouns_dictionary(), create_structural_patterns_dictionary(), DictionaryCache, DictionaryResponse, export_dictionaries() (+33 more)

### Community 24 - "Troubleshooting Guide"

Cohesion: 0.05
Nodes (45): ADR-0024, useAppearanceVersion(), ColumnMetrics, useColumnMetrics(), PanelSyncHandle, SyncPanel, usePanelSync(), UsePanelSyncOptions (+37 more)

### Community 25 - "Memory Leak Prevention"

Cohesion: 0.16
Nodes (18): AppearanceResult, BatchDictionaryResponse, BookRecordsResult, ConfigurationResult, DictionaryListResult, DictionaryLoadResult, DictionaryOperationResult, DirectorySelectOptions (+10 more)

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

### Community 31 - "TypeScript/Rust Optimization Progress Report"

Cohesion: 0.07
Nodes (22): TAB_ORDER, tabForShortcutDigit(), tabShortcutDigit(), buildScrollRestoreAttempt(), useVirtualScrollRange(), UseVirtualScrollRangeOptions, UseVirtualScrollRangeResult, VirtualScrollRange (+14 more)

### Community 32 - "Code Review Fixes - Implementation Summary"

Cohesion: 0.10
Nodes (23): classifies_chinese_chars_individually(), ExpectedTokens, Fixture, FixtureCase, get_byte_position(), get_tokenizer_stats(), is_chinese_char(), is_digit() (+15 more)

### Community 34 - "Clickable Highlighting - Code Review Fixes Summary"

Cohesion: 0.06
Nodes (32): 1. ✅ Local-Only WASM Loading (CRITICAL), 2. ✅ Binary Integrity Verification (SHA-256 Hashing), 3. ✅ Module Structure Verification, 4. ✅ Instance Method Verification, 5. ✅ Graceful Degradation, 6. ✅ Retry Logic with Exponential Backoff, 7. ✅ No Dynamic WASM Loading, Attack Scenarios (If Exploited) (+24 more)

### Community 35 - "TranslationEngine.js"

Cohesion: 0.17
Nodes (12): AppContent(), NOTE: WASM singleton cleanup intentionally NOT called from App unmount., pendingToastCalls, setGlobalToast(), ToastContainer(), ToastContext, ToastContextType, ToastInternalContext (+4 more)

### Community 37 - "System Architecture"

Cohesion: 0.06
Nodes (32): 1. Character-only mode, 1. WASM Number Processor, 2. Full Translation mode, 2. WASM Pattern Processor, 3. WASM Dictionary Engine, 4. Rust Lookup Index, 5-Phase Translation Pipeline (IMMUTABLE), `applyFinalCleanup()` - Final Spacing Fixes (+24 more)

### Community 38 - "memory_management.rs"

Cohesion: 0.18
Nodes (20): Box, PatternMatchResult, index_selects_the_same_best_match_as_scanning_every_pattern(), matches_the_literal_run_immediately_before_the_variable(), PatternProcessingResult, resets_at_an_earlier_variable_keeping_only_the_run_immediately_before_var_idx(), returns_zero_when_before_pos_is_zero(), returns_zero_when_the_preceding_tokens_do_not_end_with_the_literal_run() (+12 more)

### Community 39 - "Punctuation Spacing Debug Session - 2026-02-02"

Cohesion: 0.29
Nodes (6): baselinePath, errors, { maxWarnings }, results, root, warnings

### Community 40 - "useDictionaryCRUD.ts"

Cohesion: 0.13
Nodes (38): a_bare_arabic_line_amid_prose_is_not_mistaken_for_a_header(), a_book_with_no_structure_elects_nothing_but_still_reports_every_candidate(), a_pattern_below_the_regularity_threshold_never_wins_even_with_a_smaller_median(), an_exact_median_tie_is_broken_by_declaration_order(), build_headers(), ChapterHeader, ChapterOutline, corpus_books() (+30 more)

### Community 41 - "EnhancedVirtualizedDictionaryTable.tsx"

Cohesion: 0.06
Nodes (35): eslint, eslint-plugin-import, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, eslint-plugin-unused-imports, globals, husky (+27 more)

### Community 42 - "DictionaryManager"

Cohesion: 0.07
Nodes (30): compilerOptions, allowJs, baseUrl, checkJs, forceConsistentCasingInFileNames, jsx, lib, module (+22 more)

### Community 43 - "Implementation Log"

Cohesion: 0.27
Nodes (8): HighlightingState, useHighlightingState(), UseHighlightingStateResult, highlightingReducer(), INITIAL_HIGHLIGHTING_STATE, isValidUnitIndex(), REQUIRED_PROPERTIES, MAX_SAFE_SEGMENTS

### Community 45 - "DictionaryEngine"

Cohesion: 0.13
Nodes (31): DictionaryManager(), DictionaryManagerProps, SelectionState, DICTIONARY_TYPES, getDictionaryTypes(), DuplicateDictionaryTableView(), useDictionaryEntryForm(), MoveTargetDictionary (+23 more)

### Community 46 - "Pattern Matching Rust WASM Migration Complete ✅"

Cohesion: 0.15
Nodes (24): useChapterOutline(), BookObservations, ReaderAnswerField, refreshBookRecord(), EMPTY_RECORDS, invalidateBookRecords(), listeners, loadBookRecords() (+16 more)

### Community 47 - "CSP Hardening Migration - Complete Summary"

Cohesion: 0.18
Nodes (28): I, PhaseAResult, build_result(), build_result_matches_the_shared_fixture(), find_best_pattern_match(), find_best_pattern_match_iter(), Fixture, FixtureCase (+20 more)

### Community 48 - "ViewportTypes.d.ts"

Cohesion: 0.15
Nodes (15): ADR-0037, addNumberVariables(), isNumeralToken(), isUntranslated(), NUMERAL_CHARS, NUMERAL_VALUES, patternsUseNumberVariable(), SMALL_NUMBER_WORDS (+7 more)

### Community 49 - "FallbackManager"

Cohesion: 0.40
Nodes (5): artifact, GENERATED, newestMtime(), newestSource, root

### Community 50 - "ADR-004: 5-Phase Processing Order Immutability"

Cohesion: 0.07
Nodes (46): BadgeChip(), BadgeChipProps, BadgeProps, BinaryToggleChips(), BinaryToggleOption, CheckboxCell(), FilterChipButton(), FilterChipButtonProps (+38 more)

### Community 51 - "Task 1: Add Semantic column to Patterns dictionary table"

Cohesion: 0.09
Nodes (22): Analyze Performance Baselines, Architectural restructuring, Cache Invalidation (Unified API), Cache Management, Check Cache Performance, Check Real Memory Usage, Common Profiling Targets, Failed Patterns (Avoid) (+14 more)

### Community 52 - "ComponentTypes.d.ts"

Cohesion: 0.09
Nodes (23): Cross-panel highlight picks wrong duplicate-char instance, 2026-08-26, Development Process Lessons, Error Handling Patterns, Lesson 1: Verify Execution Before Fixing Logic, Lesson 2: Test Production Builds During Development, Lesson 3: Type Boundaries Need Explicit Contracts, Lesson 4: Follow Existing Patterns, "màu" split into "mà" + "u" (Jan 2025) (+15 more)

### Community 53 - "UITypes.d.ts"

Cohesion: 0.11
Nodes (27): App(), AppearanceManager(), FIELD_GROUPS, FieldConfig, FieldGroup, FontControlGroupProps, FontControlRowProps, useAppearanceSettings() (+19 more)

### Community 55 - "WASM Code Review Fixes - 2026-01-27"

Cohesion: 0.06
Nodes (45): DuplicateDictionaryTableViewProps, EnhancedVirtualizedDictionaryTable(), EnhancedVirtualizedDictionaryTableProps, getHeaderColumns(), HeaderColumn, numberFormat, EntryContextMenu(), EntryContextMenuProps (+37 more)

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

Cohesion: 0.23
Nodes (9): DebugInfo, MemoryStats, PerformanceStats, PositionCandidate, NOTE: Does NOT write metadata[i].translatedText — SemanticArrayMetadata omits th, SemanticArrayMetadata, SemanticArraySnapshot, SemanticArraysResult (+1 more)

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

### Community 67 - "useHighlightingState.ts"

Cohesion: 0.14
Nodes (17): CacheHealthResponse, check_dictionary_cache_health(), emit_poisoning_event(), now_ms(), read_active_proper_nouns(), record_mutex_poisoning(), Arc, HashMap (+9 more)

### Community 69 - "WasmProcessorLifecycle.js"

Cohesion: 0.42
Nodes (8): useWindowedTranslation(), vietnameseRow(), buildCharacterOnlyLineSegments(), buildTranslatedLineSegments(), fillSegmentGapsCached(), assembleTranslatedLines(), orderChunksByDistance(), planChunks()

### Community 70 - "HookTypes.d.ts"

Cohesion: 0.08
Nodes (24): clipboard-manager:allow-read-text, clipboard-manager:default, core:default, dialog:allow-message, dialog:allow-open, dialog:allow-save, dialog:default, fs:allow-copy-file (+16 more)

### Community 71 - "DictionaryContext.tsx"

Cohesion: 0.08
Nodes (6): DictionaryValue, FlatDictionaryEntry, flattenDictionaryEntries(), DictionaryManager, buildTrieFromDictionary(), isDictionaryCategory()

### Community 72 - "text_assembly.rs"

Cohesion: 0.15
Nodes (13): calculatePatternPriority(), calculatePriorityBreakdown(), PatternToken, PatternTokenType, PatternVariable, PRIORITY_WEIGHTS, PriorityBreakdown, NOTE: Both patterns have same length (3 tokens); whichever pattern is (+5 more)

### Community 73 - "SemanticTypes.ts"

Cohesion: 0.30
Nodes (13): buildOriginalLineSegments(), buildVietnameseLineSegments(), gapFillCache, mergeInto(), sealCoverage(), sliceCache, sliceChunk(), sliceChunkCached() (+5 more)

### Community 74 - "Code Review: Pure Computation Migration to wasm-core"

Cohesion: 0.43
Nodes (6): AppReadinessOverlay(), AppReadinessOverlayProps, pickStatus(), stageClass(), stageIcon(), StageStatus

### Community 76 - "TwoPhasePatternProcessor"

Cohesion: 0.32
Nodes (9): calculateDictionaryChecksum(), deserializeTrie(), savePrecomputedTrie(), serializeTrie(), tryLoadPrecomputedTrie(), TrieNode, getCacheStats(), loadDictionaryWithCache() (+1 more)

### Community 77 - ".new"

Cohesion: 0.17
Nodes (19): BackgroundCleanupStats, CleanupTask, ComponentMetrics, ComponentProfile, ComponentStats, MemorySample, MemorySnapshot, Performance (+11 more)

### Community 79 - "TranslatorControls.tsx"

Cohesion: 0.06
Nodes (47): DictionaryContext, DictionaryContextValue, DictionaryProvider(), DictionaryProviderProps, invokeEngineInvalidator(), DictionaryTypeDefinition, CommitMutation, DictionaryHistoryAPI (+39 more)

### Community 80 - "SmartMemoryCoordinator"

Cohesion: 0.25
Nodes (13): Bookshelf(), BookshelfProps, formatProgress(), formatSize(), loadShelfLayout(), ShelfLayout, splitBookTitle(), useBookRecords() (+5 more)

### Community 81 - "Task 1: Enable Semantic Type filter for Structural Patterns"

Cohesion: 0.11
Nodes (17): Dictionary JSON Format: Two Tiers, Dictionary Type Classification, `DictionaryContext.tsx` CRUD Audit Checklist, `DictionaryInfo` Name Collision, Error Handling, Fiction Pattern Merge Order Is Load-Bearing, Hook Tests — jsdom Gotchas (Dictionary-Specific), Moving Entries — One Rule, Three Enforcement Points (+9 more)

### Community 82 - "takeFromExternrefTable0"

Cohesion: 0.33
Nodes (5): ADR-045: Skip a Shared Chapter-Structure Override Control, Consequence, Context, Decision, Reasoning

### Community 83 - "SegmentedParagraphs.tsx"

Cohesion: 0.09
Nodes (34): ADR-0036, ClickableOriginalSemantic(), ClickableTranslationSemantic(), HighlightableSegment, HighlightableSegmentProps, BaseSegment, renderSegmentedContent(), RenderSegmentedContentOptions (+26 more)

### Community 84 - "list_dictionaries_with_prefix"

Cohesion: 0.10
Nodes (32): DefaultClock, DictionaryEntry, InMemoryState, NotKeyed, RateLimiter, BatchDictionaryResponse, BatchDictionaryResult, build_lookup_index() (+24 more)

### Community 86 - "index.ts"

Cohesion: 0.18
Nodes (9): ADR-0010, DEBUG_LEVELS, DictionaryMatchLookup, DictionaryCategory, getIndexedMatches(), IndexedMatch, sortMatchesByPrecedence(), ComparableMatch (+1 more)

### Community 88 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.09
Nodes (45): BookBindingContext, BookBindingProvider(), sameList(), ADR-0027, useBookBinding(), ConfigurationManager(), ADR-0027, useDictionaryConfigManagement() (+37 more)

### Community 89 - "Implementation Details ✅"

Cohesion: 0.23
Nodes (20): Uint32Array, flat(), resolve_global_conflicts(), resolve_match_conflicts(), Vec, run_conflict_resolution(), run_conflict_resolution_priority_first(), test_earlier_start_wins_on_equal_length_and_type() (+12 more)

### Community 92 - "MemoryLeakDetector"

Cohesion: 0.08
Nodes (24): scripts, build, build-wasm, build-wasm-dev, dev, format, format:check, generate-wasm-hashes (+16 more)

### Community 95 - "RegexUtils"

Cohesion: 0.07
Nodes (22): fetchWasmBinary(), wasmBinaryCache, computeSHA256(), EXPECTED_EXPORTS, loadIntegrityManifest(), verifyWasmBinaryIntegrity(), verifyWasmInstance(), verifyWasmModule() (+14 more)

### Community 96 - "TranslationProfiler"

Cohesion: 0.10
Nodes (20): Expected Output, Failure Case:, How to Run Tests, Next Steps, "No match found", Notes, Option 1: Browser Console - Simple Test (Recommended), Option 2: Add to App Code (+12 more)

### Community 97 - "DictionaryWasmLookup"

Cohesion: 0.23
Nodes (15): PatternMetadata, PatternToken, PatternUsage, Default, HashMap, Option, Self, String (+7 more)

### Community 99 - "translation_wasm_core.js"

Cohesion: 0.11
Nodes (8): cacheEntryIterator, dictionaryEntryIterator, getV8OptimizationMetrics(), memoryStatsIterator, optimizationMetrics, performanceMetricsIterator, printV8OptimizationReport(), segmentIterator

### Community 101 - "eslint-plugin-react-refresh"

Cohesion: 0.25
Nodes (3): PerformanceHealth, hasWasmPatternProcessorFailed(), isWasmPatternProcessorAvailable()

### Community 102 - "useTransformRules.ts"

Cohesion: 0.15
Nodes (19): callReaderCommand(), callTauriCommand(), CMD, LookupIndexDictionary, LookupIndexEntry, LookupIndexOptions, LookupIndexResult, NOTE: This is the application's public API (Tauri IPC wrapper), NOT a debug API. (+11 more)

### Community 103 - "precompute-dictionaries.js"

Cohesion: 0.11
Nodes (18): Background for the Implementer, How the patterns table currently looks (column widths), Key locations in `EnhancedVirtualizedDictionaryTable.tsx`, Patterns Semantic Column Implementation Plan, Running tests, Step 1: Verify baseline, Step 2: Edit 1 — Add "Semantic" header between Translation and X types, Step 3: Run type-check after Edit 1 (+10 more)

### Community 106 - "DictionaryEngine"

Cohesion: 0.18
Nodes (3): MemoryPressure, MemoryPoolStats, WasmMemoryPool

### Community 107 - ".__destroy_into_raw"

Cohesion: 0.26
Nodes (10): MatchResult, HashMap, Option, Self, String, Vec, test_basic_insertion_and_lookup(), test_entry_count() (+2 more)

### Community 108 - "husky"

Cohesion: 0.07
Nodes (22): ADR-0020, ModalErrorBoundaryState, installDevConsole(), dictionarySorter, extractHighFrequencyVocabulary(), generateCharacterCombinations(), warmNovelSpecificVocabulary(), formatMessage() (+14 more)

### Community 109 - "CacheTypes.d.ts"

Cohesion: 0.08
Nodes (25): lucide-react, dependencies, lucide-react, react, react-dom, react-resizable-panels, @tanstack/react-virtual, @tauri-apps/api (+17 more)

### Community 110 - "UnicodePunctuationDetector.ts"

Cohesion: 0.15
Nodes (7): Intl, SegmentData, Segmenter, SegmenterConstructor, SegmenterOptions, Segments, fillSegmentGaps()

### Community 111 - "SemanticPatternProcessor"

Cohesion: 0.14
Nodes (13): Appearance travels as CSS variables, never as state, `ClickableTranslationOptimized` paragraph logic, Config is read and written through `appConfig.ts`, Context providers, Engine lifecycle — `EngineContext` / `useEngine()`, Every tab is mounted at once, Frequently-updating values travel by ref, not by dep array, One owner per concern (+5 more)

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

Cohesion: 0.22
Nodes (9): CI/CD Pipeline, Development Debugging Tools, Development Guide, Fallow Dead-Code Analysis, Gotchas Reference, Logging, Production Build Requirements, Related Guides (+1 more)

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

Cohesion: 0.13
Nodes (14): ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler, Alternative 1: Full HotkeyRegistry ✗ Rejected, Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected, Alternative 3: Keep useHotkeyHandler ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+6 more)

### Community 125 - "PatternFailureTracker"

Cohesion: 0.15
Nodes (7): ConsumableToken, markPhraseFollowersConsumed(), findUnprocessedTokens(), scanTokens(), getTextFromTokens(), getTextPositionForTokenIndex(), reconstructTextFromIndex()

### Community 126 - "getSemanticTokens"

Cohesion: 0.14
Nodes (24): CommandPalette(), CommandPaletteProps, useDictionaryModals(), ReaderCommands, useReaderCommands(), UseReaderCommandsOptions, requestDictionaryReload(), resolveDefaultProperNounTarget() (+16 more)

### Community 128 - "SemanticArrayBuilder.ts"

Cohesion: 0.05
Nodes (32): TextChunk, DevicePerformanceDetector, areChunksInBounds(), fireCascadeRetire(), _handlers, registerCascadeHandler(), getPhase2Priority(), initialize() (+24 more)

### Community 129 - "ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors"

Cohesion: 0.14
Nodes (13): 1. Start the Development Server, 2. Open Browser DevTools, 3. Run Full Benchmark Suite, 4. Export Results, 5. Save Baseline, Benchmark Baseline Instructions, Expected Baseline Targets, How to Run Baseline Benchmarks (+5 more)

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

### Community 135 - "useOutlineTranslations.ts"

Cohesion: 0.05
Nodes (54): ADR-0003, baseDictionaryTypes, Translator(), TOAST_DURATIONS, TOAST_IDS, ToastDuration, ToastId, UI_TIMEOUTS (+46 more)

### Community 138 - "vite"

Cohesion: 0.40
Nodes (5): Archive, Decisions, Documentation Index, Guides, Reference

### Community 139 - "CRITICAL-3: TranslationCache - O(n) Cache Invalidation"

Cohesion: 0.20
Nodes (7): Default, JsValue, Result, Self, String, TwoPhasePatternProcessor, WasmPatternProcessor

### Community 141 - "WindowedTranslationFill.ts"

Cohesion: 0.33
Nodes (9): UseWindowedTranslationOptions, bridgeGlossSegments(), ReaderEngineCalls, chunkText(), ChunkTranslationResult, FillEngineCalls, FillEvent, fillPlan() (+1 more)

### Community 142 - "list_dictionaries_with_prefix"

Cohesion: 0.20
Nodes (10): list_dictionaries_with_prefix(), list_fiction_pattern_dictionaries_impl(), list_proper_nouns_dictionaries_impl(), test_list_dictionaries_with_prefix_empty_dir_returns_empty_vec(), test_list_dictionaries_with_prefix_excludes_trie_json_cache_files(), test_list_dictionaries_with_prefix_ignores_non_matching_and_non_json_files(), test_list_dictionaries_with_prefix_propagates_read_dir_error(), test_list_dictionaries_with_prefix_silently_drops_invalid_id() (+2 more)

### Community 143 - "WordTransformToolbar.tsx"

Cohesion: 0.15
Nodes (12): lint-staged, *.{js,jsx,ts,tsx}, _.{js,jsx,ts,tsx,css,json,md}, src/\**/_.{ts,tsx}, name, packageManager, private, type (+4 more)

### Community 144 - "ErrorBoundary"

Cohesion: 0.20
Nodes (3): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState

### Community 145 - "ParallelConfig"

Cohesion: 0.22
Nodes (10): BaseSegment, ClickableOriginalSemanticProps, ClickableSegment, ClickableTranslationOptimizedProps, ClickableTranslationSemanticProps, ClickDirection, PrebuiltSegment, SegmentClickHandler (+2 more)

### Community 146 - "package.json"

Cohesion: 0.17
Nodes (11): PatternMatchResult, PatternMetadata, PatternProcessingOptions, PatternProcessorAdapter, PatternProcessorResult, PatternToken, PatternTokenType, PatternUsageStats (+3 more)

### Community 148 - "ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext"

Cohesion: 0.15
Nodes (13): Active ADRs, [ADR-001: WASM Batch Loading — Remove Batch Wrapper](./ADR-001-wasm-batch-loading-failure.md), [ADR-002: Dual-Path Clickable Highlighting](./ADR-002-dual-path-clickable-highlighting.md), [ADR-003: TypeScript Hybrid Architecture](./ADR-003-typescript-hybrid-architecture.md), [ADR-004: 5-Phase Processing Order Immutability](./ADR-004-five-phase-processing-order-immutability.md), [ADR-006: PatternProcessor Interface](./ADR-006-pattern-processor-interface.md), ADR Format, All other ADRs (+5 more)

### Community 150 - "wasmIntegrityVerifier.js"

Cohesion: 0.20
Nodes (19): ADR-0043, ChapterOutlineState, UseChapterOutlineOptions, ChapterOverride, useChapters(), UseChaptersOptions, assembleBatch(), OutlineTranslations (+11 more)

### Community 151 - "types"

Cohesion: 0.30
Nodes (13): emptyBookRecord(), CHAPTER_PATTERN_IDS, isChapterPatternId(), isChapterPatternIdOrNull(), isFiniteNonNegative(), isFiniteOrNull(), isFraction(), validateBookBinding() (+5 more)

### Community 153 - "Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`"

Cohesion: 0.17
Nodes (12): **/_.spec.js, \**/_.spec.ts, **/_.spec.tsx, \**/_.test.js, **/_.test.ts, \**/_.test.tsx, exclude, build (+4 more)

### Community 154 - "Dictionary Management and Memory Code Review"

Cohesion: 0.23
Nodes (7): calculateChecksum(), DictionaryTrie, __dirname, __filename, main(), precomputeDictionary(), TrieNode

### Community 155 - "DictionaryTypes.ts"

Cohesion: 0.26
Nodes (8): ADR-0026, checkVariableStructure(), checkVariableSymmetry(), countVariableOccurrences(), extractPatternVariables(), PATTERN_VARIABLE_LETTERS, validatePatternVariables(), PatternTemplateEngine

### Community 156 - "WasmProcessorLifecycle"

Cohesion: 0.29
Nodes (6): A required field added to a shared type lands silently in every test fixture, Clickable highlighting is chunk-scoped, and a row's runs must equal its plain text, Cross-panel sync is line-indexed and one-way, src/utils/reader — Gotchas, The binding is the authority; the config keys it writes are a cache, Windowed translation is four seams that must stay wired together

### Community 158 - "test_blob_load_save_round_trip_for_every_kind"

Cohesion: 0.33
Nodes (5): ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`, Alternatives Rejected, Consequences, Context, Decision

### Community 160 - "TranslationInputValidator"

Cohesion: 0.28
Nodes (3): TranslationInputValidator, ValidationResult, ValidationStats

### Community 162 - "SemanticPatternProcessor.js"

Cohesion: 0.29
Nodes (5): PerformanceStats, ProgressInfo, QUICK_ADD_HINTS, RegressionHealth, TranslatorControlsProps

### Community 163 - "@tauri-apps/cli"

Cohesion: 0.40
Nodes (4): BlobKind, test_blob_kind_default_values(), test_blob_kind_filenames_are_distinct(), test_blob_load_save_round_trip_for_every_kind()

### Community 164 - "@types/node"

Cohesion: 0.25
Nodes (8): Book Records, Chapters, Dictionary Binding, Reader Commands, Reader Engine Calls, Reader Panels, Reader Tab, Reading Anchor

### Community 165 - ".new"

Cohesion: 0.33
Nodes (5): ADR-041: Keep `number_processor.rs` — It's a Parity Spec, Not Dead Code, Consequence, Context, Decision, Reasoning

### Community 166 - "ReadonlyOptimizationUtils.js"

Cohesion: 0.38
Nodes (5): PositionedSegment, SegmentedChunk, CachedChunk, ChunkPlan, LineRange

### Community 167 - "CRITICAL-1: DictionaryManager Missing Cleanup Method"

Cohesion: 0.18
Nodes (8): needsSpaceCharOnly(), punctuationProcessor, SpacingToken, PunctuationProcessor, SpecialPattern, QUOTE_CATEGORIES, QUOTE_TYPES, QuoteProcessor

### Community 168 - "High-Priority Issues 🟠"

Cohesion: 0.18
Nodes (10): Category 1: Future Integration APIs (18 warnings), Category 2: Helper/Utility Methods (8 warnings), Category 3: Dead Code from Earlier Phases (3 warnings), Compilation Warnings - Explained, Current Status, Fixed Warnings (7 total), Remaining Warnings (29 total) - All Expected, Summary (+2 more)

### Community 169 - "7. Clickable Highlighting Feature Analysis"

Cohesion: 0.15
Nodes (13): Deleted Symbols, Historical / Deleted {#deleted-symbols}, Dictionary tab, Global (any tab), Keyboard Shortcuts, Reader tab, Translator tab, Architecture (+5 more)

### Community 170 - "wasm-core Pattern Processor"

Cohesion: 0.20
Nodes (9): Constraints, Design, Design: Semantic Type for Structural Pattern Entries, Files Touched, Problem, Section 1 — Data Model, Section 2 — Translation Engine: WASM (primary fix), Section 3 — Translation Engine: JS cross-pass fix (+1 more)

### Community 171 - "text_chunker.rs"

Cohesion: 0.36
Nodes (9): bench_trie_vs_aho_corasick(), build_corpus(), build_dictionary(), cjk_pool(), Lcg, Criterion, String, TrieNode (+1 more)

### Community 172 - "getStringFromWasm0"

Cohesion: 0.22
Nodes (8): AppConfiguration, AppearanceSettings, DictionaryInfo, DictionaryTypeDefinition, DictionaryTypesCollection, FontSettings, TabId, Theme

### Community 173 - "ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation"

Cohesion: 0.33
Nodes (6): ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation, Consequences, Context, Decision, Reason, Supersession Note (2026-07-28)

### Community 174 - "ADR-046: Keep `BookReader`'s Master-Scroll Composition and Refill Ref"

Cohesion: 0.33
Nodes (5): ADR-046: Keep `BookReader`'s Master-Scroll Composition and Refill Ref, Consequence, Context, Decision, Reasoning

### Community 176 - "UnicodePunctuationDetector.ts"

Cohesion: 0.36
Nodes (9): bench_trie_vs_aho_corasick(), build_corpus(), build_dictionary(), cjk_pool(), Lcg, Criterion, String, TrieNode (+1 more)

### Community 177 - "types"

Cohesion: 0.67
Nodes (3): node, react-dom, types

### Community 178 - "AI Readiness Evaluation: chinese-translator-tauri"

Cohesion: 0.22
Nodes (8): ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline, Alternative 1: Extract to `TokenStringCache.ts` with DI ✗ Rejected, Alternative 2: Keep inline ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Supersession Note (2026-07-28)

### Community 179 - "3. Performance Optimizations ⭐⭐⭐⭐⭐"

Cohesion: 0.22
Nodes (8): ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider, Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected, Alternative 2: Extract loadInitialState only ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers

### Community 180 - "PrecomputedTrieStats"

Cohesion: 0.22
Nodes (8): Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected, Addendum — 2026-07-17d: Cluster deleted, not fixed, ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine, Consequence, Context, Decision, Reasoning, What Was Done Instead

### Community 182 - ".matchSemanticPattern"

Cohesion: 0.20
Nodes (4): getSemanticTokens(), getTokenSpanForText(), LegacyTextToken, TextToken

### Community 183 - "text_tokenizer.rs"

Cohesion: 0.22
Nodes (8): Column header, Design, Design: Semantic Column in Patterns Dictionary Table, Files Touched, No new components, Problem, Row cell, Width adjustment

### Community 184 - "ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline"

Cohesion: 0.22
Nodes (8): vite.config.ts, compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 186 - "UnicodePunctuationDetector.ts"

Cohesion: 0.29
Nodes (6): CategoryInfo, CharacterInfo, CompiledRegexes, PunctuationCategory, ResolvedConfig, UnicodePunctuationConfig

### Community 187 - "wasmOperationTimeout.js"

Cohesion: 0.20
Nodes (9): Reader Corpus Tests, Rust Arithmetic, Rust String Lengths, Tauri Backend + WASM Core — Gotchas, Tauri Command Security, WASM-Bridged Structs, wasm-core Architecture, WASM `&mut self` Borrow Rule (Rust 1.84+) (+1 more)

### Community 188 - "ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup)"

Cohesion: 0.33
Nodes (5): ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup), Consequence, Context, Decision, Reasoning

### Community 190 - "IncrementalDictionarySorter"

Cohesion: 0.25
Nodes (7): ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable, Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected, Alternative 2: Keep coordination in TranslationEngine ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers

### Community 191 - "useOutlineTranslations.ts"

Cohesion: 0.09
Nodes (35): react, OpenBookIdentity, EngineContextValue, EngineContext, EngineProvider(), useEngine(), HotkeyHandler(), BookReader() (+27 more)

### Community 194 - "Integration #3: V8 Optimization for Memory Tracking (Task #8)"

Cohesion: 0.17
Nodes (11): Alpha-Blended Highlight Colors Need a Separate Dark-Mode Check, Animations and Keyframes, `<button>` Inherits index.css's Global Reset, Not Just `display:inline-flex`, Class Name Collisions, Cross-Component Reuse, File Placement, Grid Rows Aren't Shared Across Sibling Grid Containers, Hiding Elements — Use Conditional Rendering, Not `visibility: hidden` (+3 more)

### Community 195 - "Testing Recommendations"

Cohesion: 0.25
Nodes (7): AccelerationInfo, PositionMappingStats, SemanticRange, TextPositionMapping, ValidationError, ValidationResult, ValidationWarning

### Community 197 - "ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name"

Cohesion: 0.40
Nodes (5): ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name, Consequences, Context, Decision, Reason

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

### Community 204 - "LRUCache.ts"

Cohesion: 0.67
Nodes (3): ExtendedCacheStats, LRUCacheStats, LRUNode

### Community 205 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Behaviour, Change, Design, Design: Semantic Type Filter for Structural Patterns, Files Touched, Problem

### Community 206 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Chinese-Vietnamese Translator — Dev Memory, Comprehensive architecture code review — 14 issues fixed, Fixes Done (2026-02-22, session 19), Key Architectural Invariants (most frequently violated), Session History Index, Stable Project Facts

### Community 207 - "✅ Successfully Integrated (6 Optimizations)"

Cohesion: 0.33
Nodes (6): computeFileHash(), __dirname, __filename, generateIntegrityManifest(), MANIFEST_PATH, WASM_DIR

### Community 209 - "ADR-043: Skip a Shared Generation-Guarded-Fill Primitive"

Cohesion: 0.33
Nodes (5): ADR-043: Skip a Shared Generation-Guarded-Fill Primitive, Consequence, Context, Decision, Reasoning

### Community 210 - "ADR-044: Skip Splitting `ReaderTab`'s `openBook`"

Cohesion: 0.29
Nodes (6): Addendum (2026-09-26): the open book holds its whole record — decision unchanged, ADR-044: Skip Splitting `ReaderTab`'s `openBook`, Consequence, Context, Decision, Reasoning

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

### Community 219 - "Positive Findings ✅"

Cohesion: 0.33
Nodes (5): ADR-032: Delete PerformanceBaselineTracker's cacheHitRate Machinery, Consequence, Context, Decision, Reasoning

### Community 220 - "generate-wasm-hashes.js"

Cohesion: 0.25
Nodes (7): ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage, Consequence, Context, Decision, Reasoning, Update (2026-08-25), Update (2026-09-08)

### Community 221 - "SemanticTypes.d.ts"

Cohesion: 0.33
Nodes (5): ADR-034: Skip Building DictionaryManager.validateIntegrity(), Consequence, Context, Decision, Reasoning

### Community 222 - ".translate"

Cohesion: 0.10
Nodes (15): ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods, Context, Decision, Reason, When to Revisit, ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init, Consequences, Context (+7 more)

### Community 223 - "ReadonlyOptimizationUtils.js"

Cohesion: 0.25
Nodes (7): Addendum (2026-08-25): Extending the decision to `segmentFromPositionMetadata` vs `precomputeOriginalSegments`, Addendum (2026-08-25): `precomputeSegments` deleted — this ADR's original subject no longer exists, ADR-036: Skip Unifying `precomputeSegments`/`precomputeOriginalSegments` Into a Shared Scanner, Consequence, Context, Decision, Reasoning

### Community 224 - "ComponentMemoryProfiler.ts"

Cohesion: 0.33
Nodes (5): ADR-038: Reject "Deepen RuleMatchesModal to Preview Real Output", Consequence, Context, Decision, Reasoning

### Community 230 - "PunctuationProcessor"

Cohesion: 0.33
Nodes (6): src/**/\*.d.ts, src/**/_.js, src/\**/_.jsx, src/**/\*.ts, src/**/*.tsx, include

### Community 232 - "Priority 1: TypeScript Migration (Type Safety + Performance)"

Cohesion: 0.33
Nodes (5): ApplyUpdatesOptions, ApplyUpdatesResult, TokenScanOptions, TokenScanResult, TokenUpdate

### Community 234 - "ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider"

Cohesion: 0.29
Nodes (6): Addendum — 2026-08-26: "Production builds its trie once and reuses it" was false, ADR-040: Reject Aho-Corasick as a Swap for the Native Lookup-Index Trie, Consequence, Context, Decision, Reasoning

### Community 236 - "Tauri Backend + WASM Core — Gotchas"

Cohesion: 0.33
Nodes (5): ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`, Consequences, Context, Decision, Reason

### Community 237 - "find_best_pattern_match"

Cohesion: 0.33
Nodes (5): Addendum (2026-09-09) — Gap Closed, ADR-037: Delete Orphaned WASM Boundary Validators, Keep `validateWasmDictionaryMatch`, Context, Decision, Reasoning

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

Cohesion: 0.40
Nodes (4): Compact Toggle-in-a-Table-Cell Pattern, src/components/rules — Gotchas, `TransformRule.relocate` — Renamed from `moveWords: number` 2026-08-24, Two UI Surfaces, One Set of Field Policies

### Community 294 - "ADR-023: Do Not Merge useStreamingTranslation + useTranslationResults into useTranslationOutput"

Cohesion: 0.67
Nodes (3): Future Improvements, Long Term, Short Term

### Community 295 - "husky"

Cohesion: 0.67
Nodes (3): Manual Verification Completed, Testing Required, Verification Checklist

## Knowledge Gaps

- **1369 isolated node(s):** `checkJs`, `jsx`, `module`, `moduleResolution`, `target` (+1364 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **93 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Logger` connect `husky` to `SemanticArrayBuilder.ts`, `PerformanceProfiler`, `useOutlineTranslations.ts`, `DictionaryManagerTypes.d.ts`, `UtilityTypes.d.ts`, `ErrorBoundary`, `wasmIntegrityVerifier.js`, `Troubleshooting Guide`, `TypeScript/Rust Optimization Progress Report`, `TranslationInputValidator`, `TranslationEngine.js`, `Implementation Log`, `DictionaryEngine`, `Pattern Matching Rust WASM Migration Complete ✅`, `ViewportTypes.d.ts`, `ADR-004: 5-Phase Processing Order Immutability`, `UITypes.d.ts`, `WASM Code Review Fixes - 2026-01-27`, `UnicodePunctuationDetector.ts`, `DictionaryTypes.ts`, `useOutlineTranslations.ts`, `ToastContext.tsx`, `WasmProcessorLifecycle.js`, `text_assembly.rs`, `TwoPhasePatternProcessor`, `.new`, `TranslatorControls.tsx`, `SegmentedParagraphs.tsx`, `index.ts`, `ADR-002: Dual-Path Clickable Highlighting Architecture`, `RegexUtils`, `translation_wasm_core.js`, `useTransformRules.ts`, `getSemanticTokens`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `react` connect `useOutlineTranslations.ts` to `V8OptimizationUtils.js`, `PerformanceProfiler`, `useOutlineTranslations.ts`, `ErrorBoundary`, `Tauri Backend Security Audit`, `Future Improvements Implementation - 2026-02-01`, `Content Security Policy (CSP) and WASM Security`, `WASM Code Review Fixes - 2026-01-28`, `wasmIntegrityVerifier.js`, `Troubleshooting Guide`, `TypeScript/Rust Optimization Progress Report`, `SemanticPatternProcessor.js`, `TranslationEngine.js`, `Implementation Log`, `DictionaryEngine`, `types`, `ADR-004: 5-Phase Processing Order Immutability`, `UITypes.d.ts`, `WASM Code Review Fixes - 2026-01-27`, `WasmProcessorLifecycle.js`, `Code Review: Pure Computation Migration to wasm-core`, `TranslatorControls.tsx`, `SmartMemoryCoordinator`, `SegmentedParagraphs.tsx`, `ADR-002: Dual-Path Clickable Highlighting Architecture`, `husky`, `getSemanticTokens`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `types` connect `types` to `Code Review Fixes - February 1, 2026`, `useOutlineTranslations.ts`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `checkJs`, `jsx`, `module` to the rest of the system?**
  _1369 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dictionary_commands.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.08650937689050212 - nodes in this community are weakly interconnected._
- **Should `number_processor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06210670314637483 - nodes in this community are weakly interconnected._
- **Should `Logger` be split into smaller, more focused modules?**
  _Cohesion score 0.06468858593958834 - nodes in this community are weakly interconnected._
