# Graph Report - chinese-translator-tauri (2026-10-24)

## Corpus Check

- 465 files · ~415,076 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 35 file(s) not represented in the graph (top: .css 25, (none) 6, .toml 1)

## Summary

- 4501 nodes · 10587 edges · 263 communities (210 shown, 53 thin omitted)
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 1752 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `c2565864`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- dictionary_commands.rs
- temp_test_dir
- Logger
- chapter_outline_commands.rs
- ReadingAnchor
- ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine
- TransformRuleEngine.ts
- Performance Guide
- book_commands.rs
- EditCommitter.ts
- useTransformRules.ts
- PatternTemplateEngine
- DictionaryEdit.ts
- candidate_finder.rs
- ElectronTypes.d.ts
- logger.ts
- Content Security Policy (CSP) and WASM Security
- WasmProcessorLifecycle
- logger
- webview_diagnostics.rs
- Translator.jsx
- candidate_finder_commands.rs
- TranslationEngine
- Number Processing Phase - Code Review Fixes
- MoveDialog.tsx
- useEntryEditAndMove.ts
- PerformanceMonitoringTypes.d.ts
- Historical / Deleted {#deleted-symbols}
- Dictionary Memory Management Fixes - 2026-02-03
- SemanticToken
- PatternProcessingTypes.d.ts
- PatternStore.js
- dictionary_commands.rs
- TableBuildingBlocks.tsx
- Clickable Highlighting - Code Review Fixes Summary
- Types / Imports
- ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler
- react
- two_phase.rs
- lint-ratchet.mjs
- useDictionaryCRUD.ts
- EnhancedVirtualizedDictionaryTable.tsx
- DictionaryManager
- TranslationChunkCache
- ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface
- Verifying Claims Before Acting
- .translateWithProgressiveBatches
- matcher.rs
- Reader Tab
- BookBindingContext.tsx
- tierOf
- ReaderTypes.ts
- useAppearanceSettings
- useReaderPanel.ts
- TranslationEngine
- ConfigurationManager.tsx
- Code Review Fixes - February 1, 2026
- Domain Glossary
- PatternTemplateEngine
- sanitize_io_error
- wasm_boundary.rs
- OptimizationBenchmarks
- Historical / Deleted {#deleted-symbols}
- Phase 8 Tests - Pattern Matching Validation
- DictionaryIdClassifier.ts
- dictionaryNameProblem
- Domain Glossary
- lru_cache.rs
- highlighting/index.ts
- Detailed Optimization Tracking
- default.json
- useDictionaryCRUD.ts
- mod.rs
- SemanticTypes.ts
- cleanupFormatting
- createDictionaryStore
- precomputeOriginalSegments
- TextTokenizer.ts
- pattern_matching.rs
- migrate-semantic-types.py
- TranslationEngineTypes.d.ts
- NumberProcessor
- ADR-078: Delete the WASM String Tier
- Value
- SelectionMapping.ts
- src-tauri/src/lib.rs
- hasPairedPatterns
- dictionary/index.ts
- AppearanceManager.tsx
- usePerformanceMonitoring
- WindowedTranslationFill.ts
- ReaderTab.tsx
- MemoryLeakDetector
- DictionaryTrieLoader.js
- ADR-092: Chapter Detection Runs Inline on the Async Runtime
- RegexUtils
- lint-staged
- DictionaryWasmLookup
- adr/README.md
- ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader
- chinese-translator-tauri
- DictionaryCache
- ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory
- Task 1: Add Semantic column to Patterns dictionary table
- translation-wasm-core
- TranslationWindow.ts
- TokenClaim.ts
- TwoPhasePatternProcessor.js
- FullTextAssembly.ts
- dependencies
- types/DictionaryTypes.ts
- SemanticPatternProcessor
- LRUCache
- WasmPatternProcessor.js
- ADR-089: The Character-Only Pass Leaves Punctuation Alone
- ADR-002: Dual-Path Clickable Highlighting Architecture
- src/components/dictionary — Gotchas
- appFile.ts
- useDictionaryConfigManagement.ts
- Tauri Backend + WASM Core — Gotchas
- appearanceConfig.ts
- ElectronTypes.d.ts
- BookRecordsBackend.ts
- ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation
- jsdom
- ADR-102: Keep `utils/toast` as the Notification Seam
- EditCommitter
- WindowFiller
- TranslationRunner.ts
- useForceReload
- Design
- V8OptimizationTypes.d.ts
- useChapters.ts
- Translator
- wasmIntegrityVerifier.js
- TabbedInterface.tsx
- Active ADRs
- Detailed Fix Descriptions
- LineSegments.ts
- hashmap
- TextChunk.d.ts
- Failed Patterns (Avoid)
- PanelRows.ts
- package.json
- ComponentTypes.d.ts
- ADR-011: Skip useTranslatorSession Coordinator Hook
- TwoPhasePatternProcessor
- DictionaryManager
- .applyPatterns
- Verifying Claims Before Acting
- SemanticArrayBuilder
- useDictionaryHistory.ts
- ToastContext.tsx
- Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries
- pattern_matching.rs
- Performance Impact
- CandidateFinderStore
- ModalErrorBoundary
- TabbedInterface.tsx
- useDeferredRetranslate
- EngineAccess.ts
- ADR-108: Delete the Rust Lookup Index
- ADR-104: No Shared Fake for One-Shot IPC in Tests
- .translateSinglePass
- ADR-097: Number Variables Have Their Own Span
- dictionary/DictionaryTypes.ts
- SemanticArrayBuilder
- AppReadinessOverlay.tsx
- High-Priority Issues 🟠
- 7. Clickable Highlighting Feature Analysis
- wasm-core Pattern Processor
- RuleMatchesModal.tsx
- ADR-082: One Seam for "Dictionary Matches at a Token" — MatchSource
- TranslationChunkCache.ts
- ADR-106: A Dictionary Edit Reaches the Engine Only Through a Rebuild
- ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup)
- ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation
- ADR-045: Skip a Shared Chapter-Structure Override Control
- AI Readiness Evaluation: chinese-translator-tauri
- ADR-061: Skip a Shelf Row Module
- ADR-068: One LRU Module Under Both Dictionary Caches
- ReaderBinding.tsx
- ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods
- TranslationInputValidator.ts
- ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline
- ADR-088: Skip Moving the Cache-Invalidator Registration Into EngineProvider
- ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook
- The Requirement: `'wasm-unsafe-eval'`
- Bookshelf.tsx
- prototypes/README.md
- Code Quality Improvements
- Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear
- Integration #3: V8 Optimization for Memory Tracking (Task #8)
- Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup
- Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries
- Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup
- DevicePerformanceDetector
- ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call
- Future Improvements
- Verification Checklist
- Chinese-Vietnamese Translation App
- Chinese-Vietnamese Translation App
- ADR-061: Skip a Shelf Row Module
- ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider
- ADR-050: One BookReader Instance per Book
- ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`
- ADR-010: Dictionary Match Sort — Specificity Over Provenance
- eslint-plugin-import
- 9. Recommendations
- DictionaryManager Types
- 📍 Code Locations Map
- ESLint Tooling
- ADR-026: Do Not Move useDictionaryCRUD to src/hooks/
- ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation
- 12. Implementation Summary (2026-02-07)
- TranslationEngine.js
- vite.config.ts
- ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name
- src/components/rules — Gotchas
- react
- Keyboard Shortcuts
- PerformanceThresholds.ts
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
- graphify knowledge graph (graphify-out/) with known nested-gitignore scan bug
- Ousterhout deep-module signal: interface-to-implementation ratio, not field count
- RTK (Rust Token Killer) proxy — token-optimized CLI wrapper with known quirks
- ADR-039: Skip Splitting useDictionaryEntryForm
- src/components/CLAUDE.md (component gotchas)
- src/components/rules/CLAUDE.md (rules gotchas)
- RuleFieldValidation.ts (parseValidatedNumber, parseValidatedKey, extractHanChars)
- RuleFieldParity.test.tsx
- TransformRuleEngine.ts (compareRulePrecedence, applyRule, deriveCapitalizeExceptNForKeyEdit)
- SegmentPrecomputer.ts (precomputeSegments/precomputeOriginalSegments)
- Documentation Index

## God Nodes (most connected - your core abstractions)

1. `Historical / Deleted {#deleted-symbols}` - 223 edges
2. `react` - 110 edges
3. `logger` - 84 edges
4. `Domain Glossary` - 72 edges
5. `temp_test_dir()` - 54 edges
6. `make_cache()` - 49 edges
7. `BookReader()` - 42 edges
8. `NumberProcessor` - 40 edges
9. `useDictionary()` - 38 edges
10. `extractErrorMessage()` - 37 edges

## Surprising Connections (you probably didn't know these)

- `Consequence` --references--> `EngineProvider()` [INFERRED]
  docs/adr/ADR-088-skip-moving-the-cache-invalidator-registration.md → src/components/EngineContext.jsx
- `Historical / Deleted {#deleted-symbols}` --references--> `BaseSegment` [INFERRED]
  docs/guides/deleted-symbols.md → src/components/char-only/SegmentedParagraphs.tsx
- `Decision Drivers` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx
- `Neutral` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx
- `References` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **RulesManager two-surface shared field-policy group** — src_components_rules_newrulemodal_newrulemodal, src_components_rules_rulerow_rulerow, src_components_rules_rulefieldvalidation_rulefieldvalidation, src_utils_dictionary_transformruleengine_transformruleengine, src_components_rules_tests_rulefieldparity_rulefieldparity [EXTRACTED 1.00]

## Communities (263 total, 53 thin omitted)

### Community 0 - "dictionary_commands.rs"

Cohesion: 0.07
Nodes (47): a_book_reaching_outside_gbk_reports_gbk_but_not_strictly_clean(), a_low_confidence_report_blocks_decoding(), a_multibyte_detection_is_acted_on_without_asking(), a_plain_gbk_book_is_strictly_clean(), a_single_byte_detection_is_reported_low_confidence(), an_override_decodes_a_file_detection_refused(), both_line_ending_conventions_index_identically(), CANDIDATE_ENCODINGS (+39 more)

### Community 1 - "temp_test_dir"

Cohesion: 0.14
Nodes (39): build_test_zip(), import_dictionaries_impl(), load_dictionaries_parallel_impl(), make_cache(), rename_proper_nouns_dictionary_impl(), temp_test_dir(), test_create_structural_patterns_creates_empty_file_and_invalidates_cache(), test_create_structural_patterns_rejects_path_traversal_id() (+31 more)

### Community 2 - "Logger"

Cohesion: 0.05
Nodes (58): Case, ConversionPattern, create_conversion_patterns(), Fixture, Ignore, parse_regex!, NumberMatch, NumberProcessor (+50 more)

### Community 3 - "chapter_outline_commands.rs"

Cohesion: 0.17
Nodes (18): a_poisoned_book_lock_is_reported_once_and_keeps_the_open_book(), BookCache, cache_with_open_book(), CachedBook, open_book_handle(), open_book_handle_shares_the_cached_book(), open_book_handle_survives_the_book_being_replaced(), BookContent (+10 more)

### Community 4 - "ReadingAnchor"

Cohesion: 0.09
Nodes (18): Before asserting, Reading Anchor, UseReadingAnchorOptions, ReadingPosition, AnchorVirtualizer, computeAnchor(), DEFAULT_VIEWPORT_LINES, DETACHED_INPUTS (+10 more)

### Community 5 - "ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine"

Cohesion: 0.10
Nodes (17): Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected, Addendum — 2026-07-17d: Cluster deleted, not fixed, ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine, Consequence, Context, Decision, Reasoning, What Was Done Instead (+9 more)

### Community 6 - "TransformRuleEngine.ts"

Cohesion: 0.07
Nodes (61): ADR-038: Reject "Deepen RuleMatchesModal to Preview Real Output", Consequence, Context, Decision, Reasoning, ADR-044: Skip Splitting `ReaderTab`'s `openBook`, Consequence, Decision (+53 more)

### Community 7 - "Performance Guide"

Cohesion: 0.13
Nodes (15): Analyze Performance Baselines, Cache Invalidation, Cache Management, Check Cache Performance, Check Real Memory Usage, Common Profiling Targets, Memory Leak Prevention, Performance Guide (+7 more)

### Community 8 - "book_commands.rs"

Cohesion: 0.08
Nodes (40): a_line_range_includes_blank_lines_as_empty_strings(), an_oversized_file_is_refused_before_it_is_read(), BOOK_POISON_REPORTS, BookFingerprint, BookLines, default_library_path(), DEFAULT_LIBRARY_SUBPATH, fingerprint_book() (+32 more)

### Community 9 - "EditCommitter.ts"

Cohesion: 0.17
Nodes (17): Addendum (2026-10-20), Addendum (2026-10-21), ADR-052: Dictionary Edit Commits — One Queue, TypeScript Write-Back, Alternatives considered, Consequence, Context, Decision, Reasoning (+9 more)

### Community 10 - "useTransformRules.ts"

Cohesion: 0.15
Nodes (25): ADR-107: Keep the Transform Rule Pending Overlay in the Editor Hook, Consequences, Context, Decision, Reasoning, RuleMatchesModalProps, assertNoConflict(), conflictError() (+17 more)

### Community 11 - "PatternTemplateEngine"

Cohesion: 0.10
Nodes (19): ✅ Task #6: Migrate Regex to Rust (High-Impact #6), Cross-panel highlight picks wrong duplicate-char instance, 2026-08-26, "màu" split into "mà" + "u" (Jan 2025), Pattern substitution and constructor option, 2026-07-30, Pattern-template variable substitution corrupted fused letters in both JS and Rust independently, 2026-09-10, Resolved Bug Postmortems, `useEngineReinitializer.js` WASM-sync-validation status check (file deleted 2026-10-03; see `deleted-symbols.md`), PatternEntryRules (+11 more)

### Community 12 - "DictionaryEdit.ts"

Cohesion: 0.10
Nodes (31): Addendum (2026-10-03), ADR-026: Do Not Move useDictionaryCRUD to src/hooks/, Context, Decision, Reason, Supersession Note (2026-06-27), When to Revisit, Addendum (2026-10-24) (+23 more)

### Community 13 - "candidate_finder.rs"

Cohesion: 0.07
Nodes (40): a_function_word_at_either_edge_drops_the_string(), a_phrases_key_is_dropped(), a_repeated_name_comes_back_with_count_and_line_count_ranked_by_count(), a_string_glued_to_a_name_twenty_times_as_frequent_is_dropped(), a_string_made_of_two_common_characters_that_rarely_meet_is_dropped(), a_string_that_mostly_continues_the_same_way_is_dropped_for_its_longer_form(), a_string_with_fewer_than_three_distinct_neighbours_on_a_side_is_dropped(), cancel_returns_nothing_whether_at_the_start_or_part_way() (+32 more)

### Community 14 - "ElectronTypes.d.ts"

Cohesion: 0.05
Nodes (44): ADR-090: Keep the tauriAPI Invoke Shell Narrow, Consequence, Context, Decision, Reasoning, 1a. Add `list_fiction_pattern_dictionaries`, 1b. Add `create_structural_patterns_dictionary`, 1c. Add `rename_structural_patterns_dictionary` (+36 more)

### Community 15 - "logger.ts"

Cohesion: 0.04
Nodes (46): ADR-0106, References, Addendum (2026-09-26): the revisit trigger fired — answered with ownership, not a registry, Decision, Context, Engine Reinitialization, EngineAccess, react-dom (+38 more)

### Community 16 - "Content Security Policy (CSP) and WASM Security"

Cohesion: 0.13
Nodes (19): Decision, UnitHighlightPredicate, ClickableOriginalSemantic(), ClickableTranslationSemantic(), HighlightableSegment, HighlightableSegmentProps, BaseSegment, renderSegmentedContent() (+11 more)

### Community 17 - "WasmProcessorLifecycle"

Cohesion: 0.07
Nodes (34): ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors, Alternative 1: Copy-fix across all three processors ✗ Rejected, Alternative 2: Base class / mixin for WASM processors ✗ Rejected, Alternative 3: WasmProcessorLifecycle class ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+26 more)

### Community 18 - "logger"

Cohesion: 0.09
Nodes (20): ADR-093: Skip a Dictionary-Tab Action Runner, Consequence, Context, Decision, Reasoning, CI/CD Pipeline, Development Debugging Tools, Development Guide (+12 more)

### Community 19 - "webview_diagnostics.rs"

Cohesion: 0.12
Nodes (10): append(), appending_creates_the_folder_and_keeps_earlier_lines(), format_line(), LOG_FILE, on_web_content_terminated(), record(), record_launch(), STARTED (+2 more)

### Community 20 - "Translator.jsx"

Cohesion: 0.09
Nodes (28): Update (2026-07-28), Addendum — 2026-10-24: `isTranslatingRef` deleted too, @tauri-apps/api, ADR-0105, TOAST_DURATIONS, TOAST_IDS, ToastDuration, ToastId (+20 more)

### Community 21 - "candidate_finder_commands.rs"

Cohesion: 0.15
Nodes (12): a_cancel_before_the_run_registers_is_still_seen_by_the_run(), analyse(), analyse_open_book(), analyse_ranks_the_open_books_names_and_reports_progress(), book_with_a_name(), cancel_candidate_run(), CandidateRuns, find_candidates() (+4 more)

### Community 22 - "TranslationEngine"

Cohesion: 0.09
Nodes (22): Decision, Breakthrough Moment, Initial Assumptions (All Wrong), Root Cause, Solution, The Debugging Journey, Execution Paths (Full Translation vs Character-only), Related Guides (+14 more)

### Community 23 - "Number Processing Phase - Code Review Fixes"

Cohesion: 0.23
Nodes (22): create_fiction_dictionary_pair(), create_proper_nouns_dictionary(), create_structural_patterns_dictionary(), create_structural_patterns_dictionary_impl(), DictionaryResponse, export_dictionaries(), get_app_data_dir(), get_dictionary_path() (+14 more)

### Community 24 - "MoveDialog.tsx"

Cohesion: 0.12
Nodes (21): ADR-110: Delete and Move Take a List, Consequence, Context, Reasoning, EntryValue, FullEntryData, hasMetadata(), MoveDialog() (+13 more)

### Community 25 - "useEntryEditAndMove.ts"

Cohesion: 0.22
Nodes (11): EntryContextMenu(), EntryContextMenuProps, CLOSED, ContextMenuEntry, ContextMenuState, useContextMenu(), UseContextMenuActions, UseEntryEditAndMoveResult (+3 more)

### Community 26 - "PerformanceMonitoringTypes.d.ts"

Cohesion: 0.25
Nodes (7): Background for the Implementer, Final Verification, How pattern-within-pattern type checking works today, Key files and line numbers, Pattern Semantic Type Implementation Plan, Running tests, The fix

### Community 27 - "Historical / Deleted {#deleted-symbols}"

Cohesion: 0.12
Nodes (13): ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable, Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected, Alternative 2: Keep coordination in TranslationEngine ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Update (2026-10-03) (+5 more)

### Community 28 - "Dictionary Memory Management Fixes - 2026-02-03"

Cohesion: 0.18
Nodes (10): Automated Testing, Conclusion, Dictionary Memory Management Fixes - 2026-02-03, Executive Summary, Issues Fixed, Manual Testing, Memory Impact, Overview (+2 more)

### Community 29 - "SemanticToken"

Cohesion: 0.17
Nodes (14): Every gate in the pattern pipeline fails silently, find_best_pattern_match_iter(), is_variable_type_allowed(), PatternMatcher<'a>, PatternMatchResult, SemanticToken, span_cap(), VariableCacheEntry (+6 more)

### Community 30 - "PatternProcessingTypes.d.ts"

Cohesion: 0.15
Nodes (14): a_report_after_the_cooldown_notifies_with_the_running_count(), APP_HANDLE, EVENT_NAME, GATE, init_app_handle(), NOTIFICATION_COOLDOWN_MS, now_ms(), PoisonGate (+6 more)

### Community 31 - "PatternStore.js"

Cohesion: 0.12
Nodes (14): Addendum — 2026-10-11, Addendum 2026-10-21: the Pattern Store owns the skip decision, Addendum — 2026-10-24: the store alone owns Phase 1 toasts; a crash switches Phase 1 off at once, ADR-101: Delete the JS Pattern Matcher; WASM Is the Only Matcher, Context, Decision, What was not measured, PatternStore (+6 more)

### Community 32 - "dictionary_commands.rs"

Cohesion: 0.06
Nodes (42): collision_message(), create_proper_noun_file(), has_paired_patterns(), id_rules_fixture(), list_dictionaries_with_prefix(), list_fiction_pattern_dictionaries_impl(), list_proper_nouns_dictionaries_impl(), MAX_CACHE_ENTRIES (+34 more)

### Community 33 - "TableBuildingBlocks.tsx"

Cohesion: 0.10
Nodes (29): Column header, Design, Design: Semantic Column in Patterns Dictionary Table, Files Touched, No new components, Problem, Row cell, Width adjustment (+21 more)

### Community 34 - "Clickable Highlighting - Code Review Fixes Summary"

Cohesion: 0.08
Nodes (25): 1. ✅ Local-Only WASM Loading (CRITICAL), 2. Binary hashing and module-structure checks: removed (2026-10-06, ADR-080), 4. ✅ Instance Method Verification, 5. ✅ Graceful Degradation, 6. ✅ Retry Logic with Exponential Backoff, 7. ✅ No Dynamic WASM Loading, Attack Scenarios (If Exploited), Attack Vector Analysis (+17 more)

### Community 35 - "Types / Imports"

Cohesion: 0.15
Nodes (10): ADR-091: Skip Extracting translateText from Translator.jsx, Consequence, Context, Decision, Types / Imports, AppConfiguration, TranslationResult, ThrottledStreamingState (+2 more)

### Community 36 - "ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler"

Cohesion: 0.13
Nodes (14): ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler, Alternative 1: Full HotkeyRegistry ✗ Rejected, Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected, Alternative 3: Keep useHotkeyHandler ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+6 more)

### Community 37 - "react"

Cohesion: 0.07
Nodes (51): ADR-0045, Context, lucide-react, react, EngineContext, useEngine(), BindingBanner(), BindingBannerProps (+43 more)

### Community 38 - "two_phase.rs"

Cohesion: 0.26
Nodes (15): parse_pattern(), candidate(), index_selects_the_same_best_match_as_scanning_every_pattern(), leading_bonus_reads_the_tokens_before_the_candidate_not_before_its_original_index(), matches_the_literal_run_immediately_before_the_variable(), phase_a_protection_lands_on_the_candidates_own_tokens(), resets_at_an_earlier_variable_keeping_only_the_run_immediately_before_var_idx(), returns_zero_when_before_pos_is_zero() (+7 more)

### Community 39 - "lint-ratchet.mjs"

Cohesion: 0.14
Nodes (11): artifact, GENERATED, newestMtime(), newestSource, root, baselinePath, errors, { maxWarnings } (+3 more)

### Community 40 - "useDictionaryCRUD.ts"

Cohesion: 0.08
Nodes (52): a_bare_arabic_line_amid_prose_is_not_mistaken_for_a_header(), a_book_with_no_structure_elects_nothing_but_still_reports_every_candidate(), a_later_pattern_more_than_near_tie_finer_still_wins(), a_near_tie_goes_to_the_earlier_pattern(), a_pattern_below_the_regularity_threshold_never_wins_even_with_a_smaller_median(), an_exact_median_tie_is_broken_by_declaration_order(), BARE_NUMBER_RE, build_headers() (+44 more)

### Community 41 - "EnhancedVirtualizedDictionaryTable.tsx"

Cohesion: 0.07
Nodes (29): devDependencies, eslint, eslint-config-prettier, @eslint/js, eslint-plugin-import, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+21 more)

### Community 42 - "DictionaryManager"

Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, checkJs, forceConsistentCasingInFileNames, jsx, lib, module (+11 more)

### Community 43 - "TranslationChunkCache"

Cohesion: 0.12
Nodes (10): ADR-043: Skip a Shared Generation-Guarded-Fill Primitive, Consequence, Context, Decision, Reasoning, bridgeGlossSegments(), TranslationChunkCache, chunkText() (+2 more)

### Community 44 - "ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface"

Cohesion: 0.10
Nodes (16): Addendum (2026-09-26), Addendum (2026-10-09), ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface, Decision, If App Callers Are Added, Reason, ADR-034: Skip Building DictionaryManager.validateIntegrity(), Consequence (+8 more)

### Community 45 - "Verifying Claims Before Acting"

Cohesion: 0.13
Nodes (15): Development Process Lessons, Error Handling Patterns, Lesson 1: Verify Execution Before Fixing Logic, Lesson 2: Test Production Builds During Development, Lesson 3: Type Boundaries Need Explicit Contracts, Lesson 4: Follow Existing Patterns, Related Guides, Step 1: Rule Out Stale Dictionary/Config State (+7 more)

### Community 46 - ".translateWithProgressiveBatches"

Cohesion: 0.18
Nodes (13): ADR-086: Keep ScrollPositionRecovery Separate From useScrollPositionManager, Consequence, Context, Decision, Reasoning, ScrollPositionRecovery, PANELS, tryRestoreScrollPositions() (+5 more)

### Community 47 - "matcher.rs"

Cohesion: 0.11
Nodes (21): build_result(), build_result_matches_the_shared_fixture(), Fixture, FixtureCase, load_fixture(), NUMBER_VARIABLE, NUMBER_VARIABLE_SPAN, NUMBER_VARIABLE_TYPE (+13 more)

### Community 49 - "BookBindingContext.tsx"

Cohesion: 0.06
Nodes (73): ADR-059: A Configuration Toggle Is Computed Under the Config Lock, Not on the Binding Queue, Consequence, Context, Decision, Reasoning, ADR-062: Pair Operations Share the Binding Queue, and the Configuration Tab Reads the Dictionary Store's List, Alternatives considered, Consequence (+65 more)

### Community 50 - "tierOf"

Cohesion: 0.30
Nodes (15): Dictionary labels, bareNameOf(), isFictionPatternsId(), isPatternsDict(), isProperNounsDict(), priorityOf(), tierOf(), capitalized() (+7 more)

### Community 51 - "ReaderTypes.ts"

Cohesion: 0.07
Nodes (38): ADR-0090, ADR-081: Skip Wire-Shape Parity for the Reader IPC Payloads, Consequence, Context, Decision, Reasoning, BookReaderProps, BookshelfProps (+30 more)

### Community 52 - "useAppearanceSettings"

Cohesion: 0.23
Nodes (15): ADR-024: Do Not Move Style Objects into useAppearanceSettings, Context, Decision, Reason, Revisit condition, AppearanceSettings (hook), AppearanceManager(), useAppearanceSettings() (+7 more)

### Community 53 - "useReaderPanel.ts"

Cohesion: 0.10
Nodes (29): ADR-0024, @tanstack/react-virtual, useAppearanceVersion(), ColumnMetrics, useColumnMetrics(), PanelSyncHandle, SyncPanel, usePanelSync() (+21 more)

### Community 54 - "TranslationEngine"

Cohesion: 0.12
Nodes (11): Decision, Context, ADR-032: Delete PerformanceBaselineTracker's cacheHitRate Machinery, Consequence, Context, Decision, Reasoning, Step 2: Identify the Bottleneck (Not Guessing) (+3 more)

### Community 55 - "ConfigurationManager.tsx"

Cohesion: 0.21
Nodes (10): ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init, Consequences, Context, Decision, Reason, ConfigurationManager(), TierMenu(), TierMenuProps (+2 more)

### Community 56 - "Code Review Fixes - February 1, 2026"

Cohesion: 0.05
Nodes (37): compilerOptions, allowJs, allowSyntheticDefaultImports, alwaysStrict, checkJs, emitDecoratorMetadata, esModuleInterop, experimentalDecorators (+29 more)

### Community 57 - "Domain Glossary"

Cohesion: 0.09
Nodes (27): ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider, Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected, Alternative 2: Extract loadInitialState only ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+19 more)

### Community 58 - "PatternTemplateEngine"

Cohesion: 0.08
Nodes (23): 2026-01-31 - Session 1 (Infrastructure + Analysis), Architectural Constraints (from CLAUDE.md):, Baseline Measurements (Before Optimizations), Development Tools:, Documentation:, For Each Optimization:, Future Optimization Ideas:, Key Learnings: (+15 more)

### Community 59 - "sanitize_io_error"

Cohesion: 0.15
Nodes (15): export_dictionaries_impl(), load_json_file_with_default(), quarantine_json_file(), read_zip_entries(), sanitize_io_error(), test_blob_over_the_size_limit_is_set_aside(), test_blob_that_is_not_utf8_is_set_aside(), test_blob_that_loads_is_never_marked_quarantined() (+7 more)

### Community 60 - "wasm_boundary.rs"

Cohesion: 0.16
Nodes (9): PatternIndex, test_clear_index(), test_get_all_patterns(), test_get_nonexistent_pattern(), test_index_literal_starting_pattern(), test_index_mixed_patterns(), test_index_multiple_patterns_same_first_token(), test_index_variable_starting_pattern() (+1 more)

### Community 61 - "OptimizationBenchmarks"

Cohesion: 0.10
Nodes (20): 1. Documentation Improvements, 1. `src/utils/TranslationEngine.js`, 1. Understanding Code Flow is Critical, 2. Add Execution Path Diagrams, 2. `src/utils/PunctuationProcessor.ts`, 2. Understanding When Functions Are Called, 3. Lightweight Always-On Logging, 3. `src/utils/TextChunker.js` (+12 more)

### Community 62 - "Historical / Deleted {#deleted-symbols}"

Cohesion: 0.08
Nodes (25): ADR-017: Skip WasmMemoryPool Analytics Separation, Consequence, Context, Decision, Reasoning, Addendum — 2026-08-26: "Production builds its trie once and reuses it" was false, ADR-075: Delete the Persisted Trie Cache, Consequences (+17 more)

### Community 63 - "Phase 8 Tests - Pattern Matching Validation"

Cohesion: 0.09
Nodes (21): app, security, windows, withGlobalTauri, enable, build, beforeBuildCommand, beforeDevCommand (+13 more)

### Community 64 - "DictionaryIdClassifier.ts"

Cohesion: 0.14
Nodes (13): ADR-0060, DictionaryKind, DictionaryTier, FICTION_PROPER_NOUNS_PREFIX, KIND_CAPABILITIES, MAX_DICTIONARY_ID_LENGTH, MAX_DICTIONARY_NAME_LENGTH, MoveFamily (+5 more)

### Community 65 - "dictionaryNameProblem"

Cohesion: 0.16
Nodes (17): Addendum (2026-10-21), ADR-060: Dictionary-Id and Config-Key Rules Are Held by a Shared Fixture; Rust Keeps Editing Config, Consequence, Reasoning, ADR-103: Keep the Default-Dictionary Toggle and the Name Step in the Config Hook, Consequence, Context, Decision (+9 more)

### Community 67 - "lru_cache.rs"

Cohesion: 0.13
Nodes (15): a_get_protects_an_entry_from_eviction(), a_miss_leaves_no_trace(), a_poisoned_lock_is_reported_once_cleared_and_usable_again(), cache(), evicts_the_least_recently_set_entry(), get_misses_then_hits_after_set(), Inner, Inner<K, V> (+7 more)

### Community 68 - "highlighting/index.ts"

Cohesion: 0.16
Nodes (13): ADR-0036, MatchCandidate, emptySemanticArrays(), PositionCandidate, SemanticArraySnapshot, SemanticArraysResult, validatePosition(), semanticArrayValidator (+5 more)

### Community 69 - "Detailed Optimization Tracking"

Cohesion: 0.13
Nodes (15): Detailed Optimization Tracking, ⏸️ Task #10: Optimize Memory Cleanup (Opportunity #10), ✅ Task #11: Performance Benchmarking Infrastructure, ⏸️ Task #1: Fix WASM Boundary Type Safety (Critical #1), ✅ Task #2: Optimize WASM JSON Serialization (High-Impact #5), ✅ Task #3: Migrate String Operations to Rust WASM (Critical #2), ✅ Task #5: Apply TypeScript ReadonlyArray Optimizations (High-Impact #4), ✅ Task #7: Rust String Builder for Post-Processing (Medium #7) (+7 more)

### Community 70 - "default.json"

Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 71 - "useDictionaryCRUD.ts"

Cohesion: 0.18
Nodes (19): CommitFeedback, `DictionaryContext.tsx` CRUD Audit Checklist, Error Handling, CommitFailure, describeFreshFailure(), describeOperationError(), describeReplayFailure(), Feedback (+11 more)

### Community 72 - "mod.rs"

Cohesion: 0.16
Nodes (12): DEFAULT_MAX_VARIABLE_SPAN, PatternMatcher, test_full_dictionary_parsing(), test_parse_and_index_workflow(), test_priority_ordering(), parse_patterns_dict(), test_parse_multi_variable_pattern(), test_parse_pattern_with_repeated_variable() (+4 more)

### Community 73 - "SemanticTypes.ts"

Cohesion: 0.13
Nodes (8): punctuationProcessor, SpacingToken, ChunkPostProcessor, PunctuationProcessor, SpecialPattern, QUOTE_CATEGORIES, QUOTE_TYPES, QuoteProcessor

### Community 74 - "cleanupFormatting"

Cohesion: 0.10
Nodes (17): ADR-079: Delete the WASM Assembler, Chunker and Tokenizer Tiers, Consequences, Context, Decision, Evidence, Architecture / Extraction, CSS / UI Components, Gotchas Reference (+9 more)

### Community 75 - "createDictionaryStore"

Cohesion: 0.16
Nodes (12): Addendum (2026-10-20), Addendum (2026-10-21), ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider, Consequence, Context, Decision, Reasoning, createDictionaryStore() (+4 more)

### Community 76 - "precomputeOriginalSegments"

Cohesion: 0.22
Nodes (13): Addendum (2026-08-25): Extending the decision to `segmentFromPositionMetadata` vs `precomputeOriginalSegments`, Addendum (2026-08-25): `precomputeSegments` deleted — this ADR's original subject no longer exists, Addendum (2026-10-09): what reaches the fast path, measured (architecture review round 23, candidate #4 grilling), ADR-036: Skip Unifying `precomputeSegments`/`precomputeOriginalSegments` Into a Shared Scanner, Consequence, Context, Decision, Reasoning (+5 more)

### Community 77 - "TextTokenizer.ts"

Cohesion: 0.09
Nodes (22): GroupedToken, HAN_TEST, PhraseCandidate, ProcessingStrategy, TextAnalysis, TextComplexity, Token, TokenGroups (+14 more)

### Community 78 - "pattern_matching.rs"

Cohesion: 0.29
Nodes (6): bench_real_dictionary_chunks(), bench_variable_pattern_clone(), create_token(), default_patterns_path(), load_processor(), tokens_from()

### Community 79 - "migrate-semantic-types.py"

Cohesion: 0.33
Nodes (4): Environment / Tooling (RTK, Edit, Bash), main(), migrate_file(), Tauri Command Security

### Community 80 - "TranslationEngineTypes.d.ts"

Cohesion: 0.08
Nodes (18): ADR-105: One Batch Event for a Progressive Run, Context, Decision, BatchCompleteEvent, ProperNounSource, TranslationConsumedSource, TranslationEngine, TranslationEngineInitOptions (+10 more)

### Community 81 - "NumberProcessor"

Cohesion: 0.06
Nodes (29): Addendum 2026-10-07: the spec now runs a shared fixture, ADR-041: Keep `number_processor.rs` — It's a Parity Spec, Not Dead Code, Consequence, Context, Decision, Reasoning, ADR-047: Skip a Numeral-Value Interface on NumberProcessor, Consequence (+21 more)

### Community 82 - "ADR-078: Delete the WASM String Tier"

Cohesion: 0.29
Nodes (6): ADR-078: Delete the WASM String Tier, Consequence, Context, Decision, Evidence, Reasoning

### Community 83 - "Value"

Cohesion: 0.11
Nodes (23): BatchDictionaryResponse, BatchDictionaryResult, BlobKind, Appearance, Books, Config, TransformRules, check_json_depth() (+15 more)

### Community 84 - "SelectionMapping.ts"

Cohesion: 0.12
Nodes (24): ADR-0049, Addendum (2026-10-10), ADR-049: Keep the Selection-Mapper Registry, Consequence, Context, Decision, Reasoning, Selection mapping (+16 more)

### Community 86 - "hasPairedPatterns"

Cohesion: 0.13
Nodes (22): Addendum (2026-10-21), ADR-048: Generic Proper-Noun Dictionaries Get Paired Pattern Dictionaries Too, Consequences, Context, Decision, Reason, Context, Decision (+14 more)

### Community 87 - "dictionary/index.ts"

Cohesion: 0.10
Nodes (41): Dictionary table view, DictionaryColumnSchema, MoveDialog, Reusable Row/Badge Building Blocks — `TableBuildingBlocks.tsx`, State Ownership — Not in `EnhancedVirtualizedDictionaryTable` (EVDT) or `VirtualRowComponent`, `VirtualRowComponent` Is at Module Scope, DictionaryTableView(), DictionaryTableViewProps (+33 more)

### Community 88 - "AppearanceManager.tsx"

Cohesion: 0.27
Nodes (9): FIELD_GROUPS, FieldConfig, FieldGroup, FontControlGroup(), FontControlGroupProps, FontControlRow(), FontControlRowProps, AppearanceSection (+1 more)

### Community 89 - "usePerformanceMonitoring"

Cohesion: 0.14
Nodes (11): ADR-0069, ADR-018: Unified PerformanceReport State in usePerformanceMonitoring, Consequence, Context, Reasoning, Fallow Dead-Code Analysis, PerformanceMonitor, usePerformanceMonitoring() (+3 more)

### Community 90 - "WindowedTranslationFill.ts"

Cohesion: 0.22
Nodes (13): ADR-0043, ReaderPanelProps, OutlineTranslations, UseOutlineTranslationsOptions, ADR-0050, UseWindowedTranslationOptions, WindowedTranslation, PanelRow (+5 more)

### Community 91 - "ReaderTab.tsx"

Cohesion: 0.08
Nodes (47): Addendum 2026-10-04, Addendum (2026-09-30), ADR-046: Keep `BookReader`'s Master-Scroll Composition and Refill Ref, Consequence, Context, Decision, Reasoning, ADR-050: One BookReader Instance per Book (+39 more)

### Community 92 - "MemoryLeakDetector"

Cohesion: 0.08
Nodes (24): scripts, build, build-wasm, build-wasm-dev, check, deploy, dev, format (+16 more)

### Community 93 - "DictionaryTrieLoader.js"

Cohesion: 0.19
Nodes (11): isNearBottom(), StreamingProgressBar, StreamingProgressBarProps, StreamingState, StreamingStateForProgress, StreamingTextRenderer, StreamingTextRendererProps, StreamingTranslationDisplay (+3 more)

### Community 94 - "ADR-092: Chapter Detection Runs Inline on the Async Runtime"

Cohesion: 0.33
Nodes (5): ADR-092: Chapter Detection Runs Inline on the Async Runtime, Consequence, Context, Decision, Reasoning

### Community 95 - "RegexUtils"

Cohesion: 0.17
Nodes (6): Intl, SegmentData, Segmenter, SegmenterConstructor, SegmenterOptions, Segments

### Community 96 - "lint-staged"

Cohesion: 0.50
Nodes (4): lint-staged, *.{js,jsx,ts,tsx}, _.{js,jsx,ts,tsx,css,json,md}, src/\**/_.{ts,tsx}

### Community 97 - "DictionaryWasmLookup"

Cohesion: 0.17
Nodes (10): PatternMetadata, PatternToken, PatternUsage, test_fewer_variables_wins_priority(), test_pattern_token_creation(), test_priority_calculation(), test_variable_first_pattern(), TokenType (+2 more)

### Community 98 - "adr/README.md"

Cohesion: 0.10
Nodes (9): ADR-065: Keep Dictionary Reload Owned by the Translator, Behind the Registry, Consequence, Decision, Reasoning, ADR-066: Skip an Active-Dictionary Snapshot Module, Consequence, ADR-067: Keep Pair Operations in the Binding Store, Consequence (+1 more)

### Community 99 - "ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader"

Cohesion: 0.22
Nodes (8): Addendum (2026-10-10, architecture review round 24, candidate #1), Addendum (2026-10-12, architecture review round 32, candidate #3), ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader, Consequence, Context, Decision, Not done, Reasoning

### Community 101 - "DictionaryCache"

Cohesion: 0.12
Nodes (19): DictionaryCache, get_cache_key(), load_dictionary_file(), LoadFailure, Invalid, InvalidJson, Io, Rejected (+11 more)

### Community 102 - "ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory"

Cohesion: 0.25
Nodes (7): Addendum (2026-10-02), Addendum (2026-10-03), Addendum (2026-10-20), ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory, Alternatives considered, Consequence, Context

### Community 103 - "Task 1: Add Semantic column to Patterns dictionary table"

Cohesion: 0.11
Nodes (19): Background for the Implementer, How the patterns table currently looks (column widths), Key locations in `EnhancedVirtualizedDictionaryTable.tsx`, Patterns Semantic Column Implementation Plan, Running tests, Step 1: Verify baseline, Step 2: Edit 1 — Add "Semantic" header between Translation and X types, Step 3: Run type-check after Edit 1 (+11 more)

### Community 105 - "TranslationWindow.ts"

Cohesion: 0.13
Nodes (22): BandGeometry, CHUNK_CEILING_CHARS, CHUNK_TARGET_CHARS, ChunkPlanOptions, clamp(), clampRange(), computeBands(), FETCH_VIEWPORTS (+14 more)

### Community 106 - "TokenClaim.ts"

Cohesion: 0.11
Nodes (34): ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name, Consequences, Context, Decision, Reason, ADR-109: A Match Is Placed as One Claim and One Unit, Consequence, Context (+26 more)

### Community 107 - "TwoPhasePatternProcessor.js"

Cohesion: 0.11
Nodes (15): ADR-0007, ADR-0037, ADR-098: Pattern Result Indices Are Original Indices, Consequence, Context, Decision, Reasoning, ADR-0101 (+7 more)

### Community 108 - "FullTextAssembly.ts"

Cohesion: 0.12
Nodes (16): ADR-0100, TextChunker, TranslatorDisplayPanelsProps, ClickableOriginalSemanticProps, ClickableTranslationOptimizedProps, ClickableTranslationSemanticProps, ClickDirection, SegmentClickHandler (+8 more)

### Community 109 - "dependencies"

Cohesion: 0.17
Nodes (12): dependencies, lucide-react, react, react-dom, react-resizable-panels, @tanstack/react-virtual, @tauri-apps/api, @tauri-apps/plugin-clipboard-manager (+4 more)

### Community 110 - "types/DictionaryTypes.ts"

Cohesion: 0.12
Nodes (25): ADR-0014, Addendum (2026-10-11, architecture review round 30, candidate #5 grilling), DictionaryBackend, DictionaryContextValue, DictionaryRename, DictionarySnapshot, DictionaryStoreDeps, ImportOutcome (+17 more)

### Community 111 - "SemanticPatternProcessor"

Cohesion: 0.14
Nodes (13): Appearance travels as CSS variables, never as state, `ClickableTranslationOptimized` paragraph logic, Config is read and written through `appConfig.ts`, Context providers, Engine lifecycle — `EngineContext` / `useEngine()`, Every tab is mounted at once, Frequently-updating values travel by ref, not by dep array, One owner per concern (+5 more)

### Community 112 - "LRUCache"

Cohesion: 0.12
Nodes (16): ADR-003: TypeScript Hybrid Architecture, Alternative 1: Full TypeScript Migration, Alternative 2: Keep Everything JavaScript, Alternative 3: Strategic Hybrid (TypeScript for Boundaries, JavaScript for Core) ✅ SELECTED, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 113 - "WasmPatternProcessor.js"

Cohesion: 0.13
Nodes (16): ADR-070: Skip a Shared WASM-Call-or-Fallback Shell; Delete the Unread Wrapper Stats, Consequence, Context, Decision, Reasoning, fireCascadeRetire(), _handlers, registerCascadeHandler() (+8 more)

### Community 114 - "ADR-089: The Character-Only Pass Leaves Punctuation Alone"

Cohesion: 0.33
Nodes (5): ADR-089: The Character-Only Pass Leaves Punctuation Alone, Consequence, Context, Decision, Reasoning

### Community 115 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.12
Nodes (16): ADR-002: Dual-Path Clickable Highlighting Architecture, Alternative 1: Consolidate Into Unified Highlighting System, Alternative 2: Keep Separate Paths (Current Implementation) ✅ SELECTED, Alternative 3: Partial Consolidation (Helper Functions), Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 116 - "src/components/dictionary — Gotchas"

Cohesion: 0.12
Nodes (17): ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`, Alternatives Rejected, Consequences, Context, Decision, Dictionary JSON Format: Two Tiers, Fiction Pattern Merge Order Is Load-Bearing, Hook Tests — jsdom Gotchas (Dictionary-Specific) (+9 more)

### Community 117 - "appFile.ts"

Cohesion: 0.16
Nodes (16): ADR-071: Backend Modules Exist Where There Is a Protocol; One-Shot IPC Stays on `window.electronAPI`, Consequence, Context, Decision, Reasoning, App file, Unreadable app files, AppFile (+8 more)

### Community 118 - "useDictionaryConfigManagement.ts"

Cohesion: 0.22
Nodes (8): Addendum — 2026-10-11, ADR-096: Keep the WASM Pattern Processor; Measured, Consequence, Context, Decision, Findings, not fixed here, Measurement, Reasoning

### Community 119 - "Tauri Backend + WASM Core — Gotchas"

Cohesion: 0.22
Nodes (8): Reader Corpus Tests, Rust Arithmetic, Rust String Lengths, Tauri Backend + WASM Core — Gotchas, WASM-Bridged Structs, wasm-core Architecture, WASM `&mut self` Borrow Rule (Rust 1.84+), WASM-Only Symbols Cause SIGABRT on Native Tests

### Community 120 - "appearanceConfig.ts"

Cohesion: 0.31
Nodes (9): appearanceFile, DEFAULT_APPEARANCE, fromRaw(), fromRawFontSettings(), fromRawUiFont(), isTheme(), LEGACY_LETTER_SPACINGS, normalizeLetterSpacing() (+1 more)

### Community 121 - "ElectronTypes.d.ts"

Cohesion: 0.12
Nodes (15): Addendum (2026-10-20), ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext, Alternative 1: Move cache invalidation to `DictionaryContext` ✗ Rejected, Alternative 2: Keep invalidation in `handleForceReload` ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+7 more)

### Community 122 - "BookRecordsBackend.ts"

Cohesion: 0.08
Nodes (50): Addendum (2026-09-26): the open book holds its whole record — decision unchanged, Context, ADR-054: Skip a Book Record Field Schema, Consequence, Context, Decision, Reasoning, Book Records (+42 more)

### Community 123 - "ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation"

Cohesion: 0.09
Nodes (20): Addendum (2026-10-12, architecture review round 32, candidate #4), ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation, Alternative 1: Keep inline mutation per adapter ✗ Rejected, Alternative 2: Return results, single apply site ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+12 more)

### Community 124 - "jsdom"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-13): no debounce, validation derived — decision unchanged, ADR-039: Skip Splitting `useDictionaryEntryForm`, Consequence, Context, Decision, Reasoning

### Community 125 - "ADR-102: Keep `utils/toast` as the Notification Seam"

Cohesion: 0.40
Nodes (4): ADR-102: Keep `utils/toast` as the Notification Seam, Consequence, Context, Decision

### Community 126 - "EditCommitter"

Cohesion: 0.17
Nodes (12): Addendum 2026-09-29, ADR-053: Unread Dictionaries Are Refused, Not Quarantined, Alternatives considered, Consequence, Context, Decision, Reasoning, Decision (+4 more)

### Community 127 - "WindowFiller"

Cohesion: 0.13
Nodes (10): ADR-074: Keep the Outline-Title Fill Inside Its Hook, Consequence, Context, Decision, Reasoning, assembleBatch(), packBatches(), orderChunksByDistance() (+2 more)

### Community 128 - "TranslationRunner.ts"

Cohesion: 0.12
Nodes (12): Reasoning, ActiveRun, createTranslationRunner(), run(), MAX_TRANSLATION_TIMEOUT_MS, MIN_TRANSLATION_TIMEOUT_MS, RunContext, RunOptions (+4 more)

### Community 129 - "useForceReload"

Cohesion: 0.16
Nodes (19): ADR-0003, Context, Addendum — 2026-10-24: `isTranslatingRef` param removed, ADR-084: Skip Merging the Reload Context Assembler Into useForceReload, Consequence, Context, Decision, Reasoning (+11 more)

### Community 130 - "Design"

Cohesion: 0.13
Nodes (14): ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential, Consequences, Context and Problem Statement, Decision, If Startup Latency Becomes a Problem, Implementation, Monitoring and Review, Negative (+6 more)

### Community 131 - "V8OptimizationTypes.d.ts"

Cohesion: 0.13
Nodes (14): ADR-005: Eager Dictionary Loading via DictionaryContext, Alternative 1: Complete the LazyDictionaryContext migration ✗ Rejected, Alternative 2: Keep eager loading, delete LazyDictionaryContext ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+6 more)

### Community 132 - "useChapters.ts"

Cohesion: 0.12
Nodes (24): ADR-099: Skip a Chapter-Outline Record Helper, Consequence, Context, Decision, Reasoning, ChapterPanelProps, ChapterOutlineState, ADR-0050 (+16 more)

### Community 133 - "Translator"

Cohesion: 0.09
Nodes (26): ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation, Consequence, Context, Decision, Reasoning, What Was Done Instead, ADR-022: Keep streamingReducer and Initial State Constants Exported, Boundary Condition (+18 more)

### Community 134 - "wasmIntegrityVerifier.js"

Cohesion: 0.14
Nodes (13): Background for the Implementer, Current flag (line ~1915), Patterns Semantic Type Filter Implementation Plan, Running checks, Step 1: Verify baseline, Step 2: Make the change, Step 3: Run type-check, Step 4: Run full test suite (+5 more)

### Community 135 - "TabbedInterface.tsx"

Cohesion: 0.06
Nodes (45): ADR-0012, ADR-063: Skip a Hotkey Chord Module, Consequence, Context, Decision, Reasoning, File: `src/components/TabbedInterface.tsx`, File: `src/hooks/useDictionaryModals.js` (+37 more)

### Community 136 - "Active ADRs"

Cohesion: 0.17
Nodes (12): Active ADRs, [ADR-001: WASM Batch Loading — Remove Batch Wrapper](./ADR-001-wasm-batch-loading-failure.md), [ADR-002: Dual-Path Clickable Highlighting](./ADR-002-dual-path-clickable-highlighting.md), [ADR-003: TypeScript Hybrid Architecture](./ADR-003-typescript-hybrid-architecture.md), [ADR-004: 5-Phase Processing Order Immutability](./ADR-004-five-phase-processing-order-immutability.md), [ADR-006: PatternProcessor Interface](./ADR-006-pattern-processor-interface.md), ADR Format, Architecture Decision Records (ADRs) (+4 more)

### Community 137 - "Detailed Fix Descriptions"

Cohesion: 0.25
Nodes (8): Detailed Fix Descriptions, Fix 5: MEDIUM-1 - Add dispose() to TranslationCache, Fix 6: Update DictionaryManager to use TranslationCache.dispose(), Impact, Impact, Problem, Solution, Solution

### Community 138 - "LineSegments.ts"

Cohesion: 0.24
Nodes (20): Reader Panels, assembleTranslatedLines(), chunkLinePieces(), ChunkLineRange, chunkLineRanges(), linePieceCache, linePieces(), orderChunksByLine() (+12 more)

### Community 141 - "Failed Patterns (Avoid)"

Cohesion: 0.40
Nodes (5): Architectural restructuring, Failed Patterns (Avoid), Speculative optimization without profiling, WASM full 5-phase engine attempt (Phase 6-7, 2024), WASM pattern matching success (January 2025)

### Community 142 - "PanelRows.ts"

Cohesion: 0.18
Nodes (15): LinePiece, Clickable highlighting is chunk-scoped, and a row's runs must equal its plain text, fillSegmentGaps(), fillSegmentGapsCached(), EMPTY_PANEL_ROWS, Panel, PanelRowsSnapshot, partlyLandedRow() (+7 more)

### Community 143 - "package.json"

Cohesion: 0.06
Nodes (35): name, packageManager, private, type, version, eslint, eslint-config-prettier, @eslint/js (+27 more)

### Community 144 - "ComponentTypes.d.ts"

Cohesion: 0.20
Nodes (9): AppearanceConfig, `DictionaryInfo` Name Collision, AppearanceSettings, DictionaryInfo, DictionaryTypeDefinition, DictionaryTypesCollection, FontSettings, TabId (+1 more)

### Community 145 - "ADR-011: Skip useTranslatorSession Coordinator Hook"

Cohesion: 0.15
Nodes (12): Addendum (2026-10-10), ADR-011: Skip useTranslatorSession Coordinator Hook, Alternative 1: Extract useTranslatorSession ✗ Rejected, Alternative 2: Keep coordination in Translator.jsx ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+4 more)

### Community 146 - "TwoPhasePatternProcessor"

Cohesion: 0.13
Nodes (15): Addendum — 2026-07-18: Extends to `TwoPhasePatternProcessor`'s pattern-profiling cluster, ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage, Consequence, Context, Decision, Reasoning, Update (2026-08-25), Update (2026-09-08) (+7 more)

### Community 147 - "DictionaryManager"

Cohesion: 0.09
Nodes (14): ADR-073: Delete the WASM Dictionary Lookup Tier, Consequence, Context, Decision, Evidence, Reasoning, Dictionary match lookup, DictionaryManager (+6 more)

### Community 148 - ".applyPatterns"

Cohesion: 0.12
Nodes (22): Addendum — 2026-10-09, Addendum — 2026-10-21, ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error, Alternative 1: Restore JS fallback in `TwoPhasePatternProcessor` ✗ Rejected, Alternative 2: Extract `WasmPatternBridge` seam ✗ Rejected, Alternative 3: Throw on `{ success: false }`, no bridge ✅ Selected, Alternatives Considered, Consequences (+14 more)

### Community 149 - "Verifying Claims Before Acting"

Cohesion: 0.19
Nodes (10): ADR-094: Delete the Write-Only Unit Provenance Fields, Consequence, Context, Decision, Reasoning, Shipped and reverted same-session, 2026-08-16: `semanticArrayValidator` wired into `checkSemanticArrayCorruption`, Verifying Claims Before Acting, TranslationExecutionContext (+2 more)

### Community 150 - "SemanticArrayBuilder"

Cohesion: 0.14
Nodes (16): Addendum (2026-10-12), ADR-100: Delete the Progressive Metadata Pad, Consequence, Context, Decision, Reasoning, Consequence, CharOnlySpacing (+8 more)

### Community 151 - "useDictionaryHistory.ts"

Cohesion: 0.19
Nodes (11): ADR-111: Candidate Finder Design, Consequences, Considered options, Context, Decision, CommitResult, DictionaryHistoryAPI, reportFailure() (+3 more)

### Community 152 - "ToastContext.tsx"

Cohesion: 0.19
Nodes (10): pendingToastCalls, toast, ToastContainer(), ToastContext, ToastContextType, ToastIcon(), ToastInternalContext, ToastItem() (+2 more)

### Community 153 - "Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries"

Cohesion: 0.50
Nodes (4): Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries(), Impact, Problem, Solution

### Community 154 - "pattern_matching.rs"

Cohesion: 0.35
Nodes (7): bench_large_token_array(), bench_pattern_competition(), bench_phase_a_processing(), bench_single_pattern_match(), bench_two_phase_processing(), create_token(), find_best_pattern_match()

### Community 155 - "Performance Impact"

Cohesion: 0.50
Nodes (4): GC Pressure Reduction, Memory Leak Elimination, Performance Impact, User-Visible Benefits

### Community 157 - "ModalErrorBoundary"

Cohesion: 0.18
Nodes (3): ModalErrorBoundary, ModalErrorBoundaryProps, ModalErrorBoundaryState

### Community 158 - "TabbedInterface.tsx"

Cohesion: 0.06
Nodes (68): Addendum (2026-09-28): handlers keyed by action type — still not a registry, Reasoning, ADR-064: Skip Splitting the Binding Context, Consequence, Context, Decision, Reasoning, Context (+60 more)

### Community 159 - "useDeferredRetranslate"

Cohesion: 0.27
Nodes (8): ADR-085: EngineAccess — one queue for both tabs, ownership follows the visible tab, Alternatives considered, Consequences, Context, DeferredRetranslate, useDeferredRetranslate(), UseDeferredRetranslateOptions, createReaderEngine()

### Community 160 - "EngineAccess.ts"

Cohesion: 0.27
Nodes (6): EngineContextValue, EngineInitOutcome, EngineAccess, EngineOwner, EngineRunOptions, Entry

### Community 161 - "ADR-108: Delete the Rust Lookup Index"

Cohesion: 0.25
Nodes (7): Addendum 2026-10-24: Phase 4 reads through the seam too, ADR-108: Delete the Rust Lookup Index, Consequences, Context, Decision, Evidence, Revisit

### Community 162 - "ADR-104: No Shared Fake for One-Shot IPC in Tests"

Cohesion: 0.40
Nodes (4): ADR-104: No Shared Fake for One-Shot IPC in Tests, Consequence, Context, Decision

### Community 163 - ".translateSinglePass"

Cohesion: 0.12
Nodes (16): ADR-004: 5-Phase Processing Order Immutability, Alternative 1: Reorder Phases for Performance, Alternative 2: Parallel Processing (All Phases Simultaneously), Alternative 3: Keep Current Sequential Order (Patterns First) ✅ SELECTED, Alternatives Considered, Architectural Implications, Consequences, Context and Problem Statement (+8 more)

### Community 164 - "ADR-097: Number Variables Have Their Own Span"

Cohesion: 0.33
Nodes (5): ADR-097: Number Variables Have Their Own Span, Consequence, Context, Decision, Reasoning

### Community 165 - "dictionary/DictionaryTypes.ts"

Cohesion: 0.17
Nodes (8): baseDictionaryTypes, DICTIONARY_TYPES, DictionaryTypeDefinition, getDictionaryTypes(), listFictionPatternDictionaryIds(), listIds(), listProperNounsDictionaryIds(), ADR-0053

### Community 166 - "SemanticArrayBuilder"

Cohesion: 0.09
Nodes (34): Engine and pipeline tests, Fake timers and async ordering, Imports and naming traps, jsdom and React Testing Library, Testing Gotchas, CharOnlyAssembly, ChunkPostProcessor, ProgressiveBatchText (+26 more)

### Community 167 - "AppReadinessOverlay.tsx"

Cohesion: 0.36
Nodes (6): AppReadinessOverlay(), AppReadinessOverlayProps, pickStatus(), stageClass(), stageIcon(), StageStatus

### Community 168 - "High-Priority Issues 🟠"

Cohesion: 0.15
Nodes (10): Category 1: Future Integration APIs (18 warnings), Category 2: Helper/Utility Methods (8 warnings), Category 3: Dead Code from Earlier Phases (3 warnings), Compilation Warnings - Explained, Current Status, Fixed Warnings (7 total), Remaining Warnings (29 total) - All Expected, Summary (+2 more)

### Community 170 - "wasm-core Pattern Processor"

Cohesion: 0.20
Nodes (9): Constraints, Design, Design: Semantic Type for Structural Pattern Entries, Files Touched, Problem, Section 1 — Data Model, Section 2 — Translation Engine: WASM (primary fix), Section 3 — Translation Engine: JS cross-pass fix (+1 more)

### Community 171 - "RuleMatchesModal.tsx"

Cohesion: 0.14
Nodes (26): Dictionary priority ladder, Moving Entries — One Rule, Three Enforcement Points, entryPatcher(), EntrySemanticCell(), EntryTypeCells(), EntryVarCell(), PatchEntry, MetadataBadge() (+18 more)

### Community 172 - "ADR-082: One Seam for "Dictionary Matches at a Token" — MatchSource"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-12), Addendum (2026-10-21), ADR-082: One Seam for "Dictionary Matches at a Token" — MatchSource, Consequence, Decision, Reasoning

### Community 173 - "TranslationChunkCache.ts"

Cohesion: 0.38
Nodes (6): TranslatedChunk, PositionedSegment, SegmentedChunk, CachedChunk, DEFAULT_CHUNK_CACHE_CAPACITY, ChunkPlan

### Community 174 - "ADR-106: A Dictionary Edit Reaches the Engine Only Through a Rebuild"

Cohesion: 0.33
Nodes (5): Addendum (2026-10-24, architecture review round 36, candidate #5), ADR-106: A Dictionary Edit Reaches the Engine Only Through a Rebuild, Consequence, Context, Decision

### Community 175 - "ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup)"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-20, architecture review round 34, candidate #3), ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup), Consequence, Context, Decision, Reasoning

### Community 176 - "ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation"

Cohesion: 0.33
Nodes (6): ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation, Consequences, Context, Decision, Reason, Supersession Note (2026-07-28)

### Community 177 - "ADR-045: Skip a Shared Chapter-Structure Override Control"

Cohesion: 0.40
Nodes (4): ADR-045: Skip a Shared Chapter-Structure Override Control, Consequence, Decision, Reasoning

### Community 178 - "AI Readiness Evaluation: chinese-translator-tauri"

Cohesion: 0.22
Nodes (8): ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline, Alternative 1: Extract to `TokenStringCache.ts` with DI ✗ Rejected, Alternative 2: Keep inline ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Supersession Note (2026-07-28)

### Community 179 - "ADR-061: Skip a Shelf Row Module"

Cohesion: 0.40
Nodes (4): ADR-061: Skip a Shelf Row Module, Consequence, Decision, Reasoning

### Community 180 - "ADR-068: One LRU Module Under Both Dictionary Caches"

Cohesion: 0.33
Nodes (5): ADR-068: One LRU Module Under Both Dictionary Caches, Consequence, Context, Decision, Reasoning

### Community 182 - "ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods"

Cohesion: 0.16
Nodes (9): ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods, Context, Decision, Reason, When to Revisit, ADR-051: The Reader's Quick-Add Is the Shared Add Form, Not a Floating Bar, Consequence, Context (+1 more)

### Community 183 - "TranslationInputValidator.ts"

Cohesion: 0.60
Nodes (4): checkControlCharacters(), checkLength(), validateTranslationInput(), ValidationResult

### Community 184 - "ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline"

Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 185 - "ADR-088: Skip Moving the Cache-Invalidator Registration Into EngineProvider"

Cohesion: 0.33
Nodes (5): Addendum (2026-10-20), ADR-088: Skip Moving the Cache-Invalidator Registration Into EngineProvider, Consequence, Decision, Reasoning

### Community 186 - "ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook"

Cohesion: 0.50
Nodes (3): ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook, Consequence, Decision

### Community 187 - "The Requirement: `'wasm-unsafe-eval'`"

Cohesion: 0.67
Nodes (3): Configuration Location, The Requirement: `'wasm-unsafe-eval'`, Why It's Required

### Community 188 - "Bookshelf.tsx"

Cohesion: 0.29
Nodes (13): Context, Bookshelf(), formatBinding(), formatChapterCount(), formatProgress(), formatSize(), loadShelfLayout(), NO_BOOKS (+5 more)

### Community 190 - "Code Quality Improvements"

Cohesion: 0.40
Nodes (5): Code Quality Improvements, Consistency, Documentation, Error Handling, Maintainability

### Community 193 - "Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear"

Cohesion: 0.50
Nodes (4): Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear(), Impact, Problem, Solution

### Community 194 - "Integration #3: V8 Optimization for Memory Tracking (Task #8)"

Cohesion: 0.17
Nodes (11): Alpha-Blended Highlight Colors Need a Separate Dark-Mode Check, Animations and Keyframes, `<button>` Inherits index.css's Global Reset, Not Just `display:inline-flex`, Class Name Collisions, Cross-Component Reuse, File Placement, Grid Rows Aren't Shared Across Sibling Grid Containers, Hiding Elements — Use Conditional Rendering, Not `visibility: hidden` (+3 more)

### Community 195 - "Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup"

Cohesion: 0.50
Nodes (4): Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup(), Impact, Problem, Solution

### Community 196 - "Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries"

Cohesion: 0.50
Nodes (4): Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries, Impact, Problem, Solution

### Community 197 - "Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup"

Cohesion: 0.50
Nodes (4): Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup, Impact, Problem, Solution

### Community 199 - "DevicePerformanceDetector"

Cohesion: 0.29
Nodes (6): ADR-010: Dictionary Match Sort — Specificity Over Provenance, Alternatives Considered, Consequences, Context, Decision, Rationale

### Community 200 - "ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call"

Cohesion: 0.29
Nodes (6): ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call, Consequence, Context, Decision, Evidence, Reasoning

### Community 201 - "Future Improvements"

Cohesion: 0.67
Nodes (3): Future Improvements, Long Term, Short Term

### Community 202 - "Verification Checklist"

Cohesion: 0.67
Nodes (3): Manual Verification Completed, Testing Required, Verification Checklist

### Community 205 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Behaviour, Change, Design, Design: Semantic Type Filter for Structural Patterns, Files Touched, Problem

### Community 206 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Chinese-Vietnamese Translator — Dev Memory, Comprehensive architecture code review — 14 issues fixed, Fixes Done (2026-02-22, session 19), Key Architectural Invariants (most frequently violated), Session History Index, Stable Project Facts

### Community 225 - "ADR-061: Skip a Shelf Row Module"

Cohesion: 0.16
Nodes (18): ADR-095: Highlight State Is One Lit Unit, Consequence, Context, Reasoning, CharacterOnlyBridge, Click-to-Highlight Lifecycle, useHighlightInteraction(), UseHighlightInteractionOptions (+10 more)

### Community 234 - "ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider"

Cohesion: 0.33
Nodes (5): ADR-040: Reject Aho-Corasick as a Swap for the Native Lookup-Index Trie, Consequence, Context, Decision, Reasoning

### Community 235 - "ADR-050: One BookReader Instance per Book"

Cohesion: 0.33
Nodes (5): ADR-031: Skip Splitting dictionary_commands.rs by Concern, Consequence, Context, Decision, Reasoning

### Community 245 - "ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`"

Cohesion: 0.33
Nodes (5): ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`, Consequences, Context, Decision, Reason

### Community 246 - "ADR-010: Dictionary Match Sort — Specificity Over Provenance"

Cohesion: 0.25
Nodes (8): Background, Step 1: Write a failing test, Step 2: Run test to verify it fails, Step 3: Add the new block in `buildVariableCache`, Step 4: Run test, Step 5: Run full JS suite, Step 6: Commit, Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`

### Community 250 - "eslint-plugin-import"

Cohesion: 0.33
Nodes (5): ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting, Context, Decision, If a Performance Dashboard Is Built, Reason

### Community 256 - "9. Recommendations"

Cohesion: 0.25
Nodes (8): Background, Step 1: No test needed for this visual change — run type-check instead, Step 2: Extend the condition to include patterns, Step 3: Run type-check, Step 4: Run full JS suite, Step 5: Manual smoke test, Step 6: Commit, Task 6: UI — add semantic type selector to pattern entries

### Community 259 - "DictionaryManager Types"

Cohesion: 0.50
Nodes (3): DictionaryEntryMetadata, TrieMatch, TrieStats

### Community 265 - "ESLint Tooling"

Cohesion: 0.29
Nodes (7): Background, Step 1: Write a JS test, Step 2: Implement the change, Step 3: Run test, Step 4: Run full JS suite, Step 5: Commit, Task 4: JS cross-pass — store `patternSemanticType` on leader tokens

### Community 267 - "ADR-026: Do Not Move useDictionaryCRUD to src/hooks/"

Cohesion: 0.29
Nodes (7): Step 1: Write a failing test, Step 2: Run test to verify it fails, Step 3: Add the field to `PatternMetadata`, Step 4: Run test to verify it passes, Step 5: Run full Rust test suite, Step 6: Commit, Task 1: Add `semantic_type` to Rust `PatternMetadata`

### Community 268 - "ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation"

Cohesion: 0.29
Nodes (7): Step 1: Write a failing test, Step 2: Run tests to verify they fail, Step 3: Update `parse_patterns_dict` to read `semanticType`, Step 4: Run tests to verify they pass, Step 5: Run full Rust test suite, Step 6: Commit, Task 2: Parse `semanticType` from the JS pattern dictionary

### Community 272 - "12. Implementation Summary (2026-02-07)"

Cohesion: 0.33
Nodes (6): Step 1: Write a failing integration test, Step 2: Apply the fix in `two_phase.rs`, Step 3: Run tests to verify the fix works, Step 4: Run full Rust test suite, Step 5: Commit, Task 3: Use `semantic_type` in Phase B enhanced cache (PRIMARY FIX)

### Community 276 - "TranslationEngine.js"

Cohesion: 0.07
Nodes (25): ADR-0006, Addendum (2026-10-24, architecture review round 38, candidate #2), AssertTrue, EngineInterfaceMembersExistOnTheClass, ConflictCandidate, resolveGlobalConflicts(), ADR-0083, typePriority() (+17 more)

### Community 281 - "vite.config.ts"

Cohesion: 0.29
Nodes (4): vite, vite-plugin-wasm, @vitejs/plugin-react, vitest

### Community 290 - "ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name"

Cohesion: 0.50
Nodes (4): Fix 8: BONUS - Fix method name typos in TranslationCache, Impact, Problem, Solution

### Community 293 - "src/components/rules — Gotchas"

Cohesion: 0.33
Nodes (5): Compact Toggle-in-a-Table-Cell Pattern, Saving: one writer, one queue, src/components/rules — Gotchas, `TransformRule.relocate` — Renamed from `moveWords: number` 2026-08-24, Two UI Surfaces, One Set of Field Policies

### Community 298 - "react"

Cohesion: 0.12
Nodes (33): ADR-056: Skip a Rule-Draft Module, Consequence, Context, Decision, Reasoning, NewRuleModal(), EMPTY_DRAFT, RulesManager (+25 more)

### Community 302 - "Keyboard Shortcuts"

Cohesion: 0.40
Nodes (5): Dictionary tab, Global (any tab), Keyboard Shortcuts, Reader tab, Translator tab

### Community 343 - "Documentation Index"

Cohesion: 0.40
Nodes (5): Archive, Decisions, Documentation Index, Guides, Reference

## Knowledge Gaps

- **165 isolated node(s):** `@tauri-apps/plugin-clipboard-manager`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-shell`, `@eslint/js` (+160 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1508 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **53 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Historical / Deleted {#deleted-symbols}` connect `Historical / Deleted {#deleted-symbols}` to `TranslationRunner.ts`, `useForceReload`, `ReadingAnchor`, `ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine`, `TransformRuleEngine.ts`, `TabbedInterface.tsx`, `Translator`, `EditCommitter.ts`, `useTransformRules.ts`, `DictionaryEdit.ts`, `ElectronTypes.d.ts`, `logger.ts`, `Content Security Policy (CSP) and WASM Security`, `WasmProcessorLifecycle`, `logger`, `DictionaryManager`, `Translator.jsx`, `Verifying Claims Before Acting`, `TranslationEngine.js`, `SemanticArrayBuilder`, `MoveDialog.tsx`, `TwoPhasePatternProcessor`, `TranslationEngine`, `Historical / Deleted {#deleted-symbols}`, `.applyPatterns`, `pattern_matching.rs`, `TabbedInterface.tsx`, `PatternStore.js`, `EngineAccess.ts`, `TableBuildingBlocks.tsx`, `useDeferredRetranslate`, `Types / Imports`, `SemanticToken`, `react`, `SemanticArrayBuilder`, `High-Priority Issues 🟠`, `7. Clickable Highlighting Feature Analysis`, `react`, `RuleMatchesModal.tsx`, `ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface`, `TranslationChunkCache.ts`, `.translateWithProgressiveBatches`, `BookBindingContext.tsx`, `tierOf`, `useReaderPanel.ts`, `TranslationEngine`, `Domain Glossary`, `highlighting/index.ts`, `Detailed Optimization Tracking`, `useDictionaryCRUD.ts`, `SemanticTypes.ts`, `cleanupFormatting`, `precomputeOriginalSegments`, `TextTokenizer.ts`, `TranslationEngineTypes.d.ts`, `NumberProcessor`, `SelectionMapping.ts`, `hasPairedPatterns`, `dictionary/index.ts`, `usePerformanceMonitoring`, `ReaderTab.tsx`, `ADR-061: Skip a Shelf Row Module`, `TranslationWindow.ts`, `TokenClaim.ts`, `types/DictionaryTypes.ts`, `WasmPatternProcessor.js`, `src/components/dictionary — Gotchas`, `appFile.ts`, `appearanceConfig.ts`, `BookRecordsBackend.ts`, `ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation`?**
  _High betweenness centrality (0.444) - this node is a cross-community bridge._
- **Are the 220 inferred relationships involving `Historical / Deleted {#deleted-symbols}` (e.g. with `ClickableOriginalSemantic()` and `BaseSegment`) actually correct?**
  _`Historical / Deleted {#deleted-symbols}` has 220 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@tauri-apps/plugin-clipboard-manager`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener` to the rest of the system?**
  _165 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dictionary_commands.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06557377049180328 - nodes in this community are weakly interconnected._
- **Why does `is_variable_type_allowed()` connect `SemanticToken` to `two_phase.rs`, `TokenClaim.ts`, `Historical / Deleted {#deleted-symbols}`, `matcher.rs`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `logger` (e.g. with `Historical / Deleted {#deleted-symbols}` and `graphify`) actually correct?**
  _`logger` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `temp_test_dir` be split into smaller, more focused modules?**
  _Cohesion score 0.13630229419703105 - nodes in this community are weakly interconnected._
