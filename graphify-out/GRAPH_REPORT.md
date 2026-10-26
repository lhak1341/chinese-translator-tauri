# Graph Report - chinese-translator-tauri (2026-10-27)

## Corpus Check

- 472 files · ~430,285 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 35 file(s) not represented in the graph (top: .css 25, (none) 6, .toml 1)

## Summary

- 4673 nodes · 11164 edges · 280 communities (227 shown, 53 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1804 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `478d2174`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- dictionary_commands.rs
- temp_test_dir
- Logger
- chapter_outline_commands.rs
- ReadingAnchor
- useTranslatorEngine
- wordTransformHelpers.ts
- Performance Guide
- book_commands.rs
- hasPairedPatterns
- useTransformRules.ts
- book_index.rs
- TransformRuleEngine.ts
- candidate_finder.rs
- ElectronTypes.d.ts
- App.jsx
- Content Security Policy (CSP) and WASM Security
- WasmProcessorLifecycle
- plain
- webview_diagnostics.rs
- TabbedInterface.tsx
- candidate_finder_commands.rs
- SemanticArrayBuilder
- Number Processing Phase - Code Review Fixes
- appConfig.ts
- BookRecordsBackend.ts
- PerformanceMonitoringTypes.d.ts
- 3. Implementations that must move together
- Dictionary Memory Management Fixes - 2026-02-03
- SemanticToken
- PatternProcessingTypes.d.ts
- PatternStore.js
- dictionary_commands.rs
- Task 1: Add Semantic column to Patterns dictionary table
- Clickable Highlighting - Code Review Fixes Summary
- ADR-091: Skip Extracting translateText from Translator.jsx
- find_candidates
- react
- TranslationRunner.ts
- lint-ratchet.mjs
- useDictionaryCRUD.ts
- EnhancedVirtualizedDictionaryTable.tsx
- DictionaryManager
- appFile.ts
- ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface
- Troubleshooting Guide
- .translateWithProgressiveBatches
- matcher.rs
- BookLinesStore
- BookBindingContext.tsx
- DictionaryIdClassifier.ts
- ReaderTypes.ts
- Detailed Optimization Tracking
- useReaderPanel.ts
- TranslationEngine
- ErrorBoundary
- Code Review Fixes - February 1, 2026
- PatternTemplateEngine
- TypeScript/Rust Optimization Project
- sanitize_io_error
- wasm_boundary.rs
- OptimizationBenchmarks
- DictionaryTrie
- Phase 8 Tests - Pattern Matching Validation
- TranslatorControls.tsx
- EnhancedVirtualizedDictionaryTable.tsx
- Domain Glossary
- lru_cache.rs
- WindowFiller
- logger.ts
- default.json
- useHotkeyHandler.ts
- mod.rs
- SemanticTypes.ts
- TranslationChunkCache
- Historical / Deleted {#deleted-symbols}
- precomputeOriginalSegments
- TextTokenizer.ts
- pattern_matching.rs
- migrate-semantic-types.py
- TranslationEngineTypes.d.ts
- NumberProcessor
- useHotkeyHandler.ts
- Value
- SelectionMapping.ts
- src-tauri/src/lib.rs
- useForceReload
- useReadingAnchor.ts
- DictionaryEdit.ts
- Background
- Design
- ReaderTab.tsx
- MemoryLeakDetector
- DictionaryTrieLoader.js
- ADR-092: Chapter Detection Runs Inline on the Async Runtime
- RegexUtils
- lint-staged
- DictionaryWasmLookup
- SemanticTypePicker.tsx
- Domain Glossary
- chinese-translator-tauri
- DictionaryCache
- count_frequent
- WasmPatternProcessor.js
- translation-wasm-core
- TranslationWindow.ts
- TokenClaim.ts
- CandidateFinderStore
- ElectronTypes.d.ts
- dependencies
- two_phase.rs
- SemanticPatternProcessor
- LRUCache
- Alternatives Considered
- ADR-089: The Character-Only Pass Leaves Punctuation Alone
- ADR-002: Dual-Path Clickable Highlighting Architecture
- Translator.jsx
- EngineAccess.ts
- useDictionaryConfigManagement.ts
- useHotkeyHandler
- TextChunker
- ElectronTypes.d.ts
- ReadingAnchor.ts
- NumberVariable.js
- jsdom
- Development Guide
- ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider
- Progress
- useAppearanceSettings
- usePerformanceMonitoring
- Design
- V8OptimizationTypes.d.ts
- useChapters.ts
- useStreamingTranslation
- wasmIntegrityVerifier.js
- usePanelSync.ts
- All other ADRs
- Detailed Fix Descriptions
- LineSegments.ts
- hashmap
- TextChunk.d.ts
- DictionaryStore.ts
- TwoPhasePatternProcessor.js
- package.json
- ComponentTypes.d.ts
- ADR-011: Skip useTranslatorSession Coordinator Hook
- real_dictionary_profile.rs
- TransformRuleEngine.ts
- .applyPatterns
- PanelRows.ts
- snapshotSemanticArrays
- ReaderPanel.tsx
- appearanceConfig.ts
- Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries
- TranslationEngine
- Performance Impact
- useCandidateFinder.ts
- useDictionaryModals.tsx
- DictionaryContext.tsx
- dictionaryNameProblem
- ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader
- PatternEntryRules.ts
- logger
- .translateSinglePass
- Tauri Backend + WASM Core — Gotchas
- KeySet
- SemanticArrayBuilder
- AppReadinessOverlay.tsx
- High-Priority Issues 🟠
- 7. Clickable Highlighting Feature Analysis
- wasm-core Pattern Processor
- DictionaryTableView.tsx
- Background for the Implementer
- AppearanceManager.tsx
- .invalidate
- .findAllMatches
- ADR-053: Unread Dictionaries Are Refused, Not Quarantined
- When to Profile Performance
- AI Readiness Evaluation: chinese-translator-tauri
- WindowedTranslationFill.ts
- ADR-068: One LRU Module Under Both Dictionary Caches
- ReaderBinding.tsx
- TableBuildingBlocks.tsx
- ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage
- ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline
- ADR-095: Highlight State Is One Lit Unit
- ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory
- ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init
- ReconcileLibrary.ts
- prototypes/README.md
- Code Quality Improvements
- ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting
- ADR-078: Delete the WASM String Tier
- Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear
- Integration #3: V8 Optimization for Memory Tracking (Task #8)
- Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup
- createTranslationEngine
- ADR-108: Delete the Rust Lookup Index
- ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation
- DevicePerformanceDetector
- ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call
- TranslationChunkCache.ts
- ADR-102: Keep `utils/toast` as the Notification Seam
- ADR-051: The Reader's Quick-Add Is the Shared Add Form, Not a Floating Bar
- .clear
- Chinese-Vietnamese Translation App
- Chinese-Vietnamese Translation App
- FastHasher
- ADR-097: Number Variables Have Their Own Span
- Resolved Bug Postmortems
- ADR-111: Candidate Finder Design
- When Translation Is Wrong
- ADR-061: Skip a Shelf Row Module
- Verifying Claims Before Acting
- Security Implications
- Comparison to CSP Best Practices
- TranslationInputValidator.ts
- Alternatives Considered
- Alternatives Considered
- Performance Metrics
- Resources
- ADR-061: Skip a Shelf Row Module
- ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider
- adr/README.md
- ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`
- ADR-010: Dictionary Match Sort — Specificity Over Provenance
- 9. Recommendations
- DictionaryManager Types
- 📍 Code Locations Map
- ESLint Tooling
- ADR-026: Do Not Move useDictionaryCRUD to src/hooks/
- ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation
- 12. Implementation Summary (2026-02-07)
- vite.config.ts
- ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name
- src/components/rules — Gotchas
- RulesManager.tsx
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

1. `Historical / Deleted {#deleted-symbols}` - 224 edges
2. `react` - 111 edges
3. `logger` - 85 edges
4. `Domain Glossary` - 72 edges
5. `temp_test_dir()` - 54 edges
6. `make_cache()` - 49 edges
7. `extractErrorMessage()` - 44 edges
8. `BookReader()` - 43 edges
9. `NumberProcessor` - 40 edges
10. `useDictionary()` - 38 edges

## Surprising Connections (you probably didn't know these)

- `Reason` --references--> `ConfigurationManager()` [INFERRED]
  docs/adr/ADR-027-fiction-structural-patterns-coupled-by-naming-convention.md → src/components/configuration/ConfigurationManager.tsx
- `Decision Drivers` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx
- `Neutral` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx
- `References` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx
- `File: `src/components/TabbedInterface.tsx`` --references--> `useDictionary()` [INFERRED]
  docs/plans/fiction-structural-patterns-implementation.md → src/components/dictionary/DictionaryContext.tsx

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **RulesManager two-surface shared field-policy group** — src_components_rules_newrulemodal_newrulemodal, src_components_rules_rulerow_rulerow, src_components_rules_rulefieldvalidation_rulefieldvalidation, src_utils_dictionary_transformruleengine_transformruleengine, src_components_rules_tests_rulefieldparity_rulefieldparity [EXTRACTED 1.00]

## Communities (280 total, 53 thin omitted)

### Community 0 - "dictionary_commands.rs"

Cohesion: 0.06
Nodes (48): a_book_reaching_outside_gbk_reports_gbk_but_not_strictly_clean(), a_low_confidence_report_blocks_decoding(), a_multibyte_detection_is_acted_on_without_asking(), a_plain_gbk_book_is_strictly_clean(), a_single_byte_detection_is_reported_low_confidence(), an_override_decodes_a_file_detection_refused(), both_line_ending_conventions_index_identically(), CANDIDATE_ENCODINGS (+40 more)

### Community 1 - "temp_test_dir"

Cohesion: 0.14
Nodes (39): build_test_zip(), import_dictionaries_impl(), load_dictionaries_parallel_impl(), make_cache(), rename_proper_nouns_dictionary_impl(), temp_test_dir(), test_create_structural_patterns_creates_empty_file_and_invalidates_cache(), test_create_structural_patterns_rejects_path_traversal_id() (+31 more)

### Community 2 - "Logger"

Cohesion: 0.05
Nodes (58): Case, ConversionPattern, create_conversion_patterns(), Fixture, Ignore, parse_regex!, NumberMatch, NumberProcessor (+50 more)

### Community 3 - "chapter_outline_commands.rs"

Cohesion: 0.18
Nodes (17): a_poisoned_book_lock_is_reported_once_and_keeps_the_open_book(), BookCache, cache_with_open_book(), CachedBook, open_book_handle(), open_book_handle_shares_the_cached_book(), open_book_handle_survives_the_book_being_replaced(), chapter_headers_for_pattern() (+9 more)

### Community 4 - "ReadingAnchor"

Cohesion: 0.17
Nodes (3): ReadingPosition, ReadingAnchor, tryRestorePosition()

### Community 5 - "useTranslatorEngine"

Cohesion: 0.08
Nodes (27): Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected, Addendum — 2026-07-17d: Cluster deleted, not fixed, ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine, Consequence, Context, Decision, Reasoning, What Was Done Instead (+19 more)

### Community 6 - "wordTransformHelpers.ts"

Cohesion: 0.11
Nodes (37): ADR-038: Reject "Deepen RuleMatchesModal to Preview Real Output", Consequence, Context, Decision, Reasoning, Transform Rule, CAPITALIZATION, MOVE_TO_FRONT (+29 more)

### Community 7 - "Performance Guide"

Cohesion: 0.14
Nodes (14): Analyze Performance Baselines, Architectural restructuring, Cache Invalidation, Cache Management, Check Cache Performance, Check Real Memory Usage, Failed Patterns (Avoid), Memory Leak Prevention (+6 more)

### Community 8 - "book_commands.rs"

Cohesion: 0.09
Nodes (39): a_line_range_includes_blank_lines_as_empty_strings(), an_oversized_file_is_refused_before_it_is_read(), BOOK_POISON_REPORTS, BookFingerprint, BookLines, default_library_path(), DEFAULT_LIBRARY_SUBPATH, fingerprint_book() (+31 more)

### Community 9 - "hasPairedPatterns"

Cohesion: 0.06
Nodes (42): Addendum (2026-10-21), ADR-048: Generic Proper-Noun Dictionaries Get Paired Pattern Dictionaries Too, Consequences, Context, Decision, Reason, Addendum (2026-10-21), ADR-060: Dictionary-Id and Config-Key Rules Are Held by a Shared Fixture; Rust Keeps Editing Config (+34 more)

### Community 10 - "useTransformRules.ts"

Cohesion: 0.16
Nodes (23): ADR-107: Keep the Transform Rule Pending Overlay in the Editor Hook, Consequences, Context, Decision, Reasoning, assertNoConflict(), conflictError(), generateTransformRuleId() (+15 more)

### Community 11 - "book_index.rs"

Cohesion: 0.11
Nodes (26): a_book_that_cannot_be_read_is_left_out(), a_cancelled_backfill_returns_nothing_and_leaves_no_sidecar(), a_sidecar_of_another_format_version_or_damaged_is_refused(), a_sidecar_round_trips_and_is_refused_for_another_encoding(), a_stale_sidecar_is_rebuilt_and_a_deleted_folder_is_recovered_from(), a_stored_sidecar_is_valid_only_for_the_encoding_it_was_built_with(), a_write_leaves_no_temp_file_and_a_fingerprint_that_is_not_a_name_is_refused(), background_book() (+18 more)

### Community 12 - "TransformRuleEngine.ts"

Cohesion: 0.09
Nodes (33): Addendum (2026-10-11, architecture review round 30, candidate #5 grilling), DictionaryContextValue, ImportOutcome, DuplicateDictionaryTableViewProps, FullEntryData, hasMetadata(), MoveDialogProps, PatternSemanticTypeRef (+25 more)

### Community 13 - "candidate_finder.rs"

Cohesion: 0.08
Nodes (21): CHUNK, CONTEXT, ContextLine, ContextLines, DOMINANCE, FUNCTION_WORDS, GLUED_RATIO, HAN_BYTES (+13 more)

### Community 14 - "ElectronTypes.d.ts"

Cohesion: 0.10
Nodes (21): 1a. Add `list_fiction_pattern_dictionaries`, 1b. Add `create_structural_patterns_dictionary`, 1c. Add `rename_structural_patterns_dictionary`, 1d. Modify `rename_proper_nouns_dictionary` — cascade, 1e. Register in `lib.rs`, Design Decisions (do not re-litigate), Fiction Structural Pattern Dictionaries — Implementation Plan, File: `src/components/configuration/ConfigurationManager.tsx` (+13 more)

### Community 15 - "App.jsx"

Cohesion: 0.13
Nodes (18): App(), AppContent(), BookBindingProvider(), pendingToastCalls, setGlobalToast(), toast, ToastContainer(), ToastContext (+10 more)

### Community 16 - "Content Security Policy (CSP) and WASM Security"

Cohesion: 0.14
Nodes (17): Decision, UnitHighlightPredicate, ClickableOriginalSemantic(), ClickableTranslationSemantic(), HighlightableSegment, HighlightableSegmentProps, renderSegmentedContent(), RenderSegmentedContentOptions (+9 more)

### Community 17 - "WasmProcessorLifecycle"

Cohesion: 0.08
Nodes (29): ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors, Consequences, Context and Problem Statement, Critical Invariants, Current state (2026-10-03), Decision, Decision Drivers, Negative (+21 more)

### Community 18 - "plain"

Cohesion: 0.16
Nodes (20): a_cancelled_sidecar_build_returns_nothing(), a_function_word_at_either_edge_drops_the_string(), a_name_held_by_an_active_dictionary_is_not_listed(), a_name_in_an_inactive_dictionary_stays_listed_with_its_ids(), a_phrases_key_is_dropped(), a_repeated_name_comes_back_with_count_and_line_count_ranked_by_count(), a_string_glued_to_a_name_twenty_times_as_frequent_is_dropped(), a_string_made_of_two_common_characters_that_rarely_meet_is_dropped() (+12 more)

### Community 19 - "webview_diagnostics.rs"

Cohesion: 0.12
Nodes (10): append(), appending_creates_the_folder_and_keeps_earlier_lines(), format_line(), LOG_FILE, on_web_content_terminated(), record(), record_launch(), STARTED (+2 more)

### Community 20 - "TabbedInterface.tsx"

Cohesion: 0.13
Nodes (21): ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook, Consequence, Context, Decision, Reasoning, RulesManagerHandle, TAB_PRESENTATION, TabbedInterface() (+13 more)

### Community 21 - "candidate_finder_commands.rs"

Cohesion: 0.10
Nodes (27): a_cancel_before_the_run_registers_is_still_seen_by_the_run(), analyse(), analyse_open_book(), analyse_ranks_the_open_books_names_and_reports_progress(), BACKGROUND_SHARE, book_with_a_name(), cancel_candidate_run(), candidate_context() (+19 more)

### Community 22 - "SemanticArrayBuilder"

Cohesion: 0.08
Nodes (20): Breakthrough Moment, Initial Assumptions (All Wrong), Root Cause, Solution, The Debugging Journey, Execution Paths (Full Translation vs Character-only), Related Guides, Semantic Arrays (Clickable Highlighting) (+12 more)

### Community 23 - "Number Processing Phase - Code Review Fixes"

Cohesion: 0.23
Nodes (23): create_fiction_dictionary_pair(), create_proper_nouns_dictionary(), create_structural_patterns_dictionary(), create_structural_patterns_dictionary_impl(), DictionaryCache, DictionaryResponse, export_dictionaries(), get_app_data_dir() (+15 more)

### Community 24 - "appConfig.ts"

Cohesion: 0.14
Nodes (27): Decision, Context, AppConfig, ADR-0027, ADR-0048, ADR-0062, useDictionaryConfigManagement(), useAppConfig() (+19 more)

### Community 25 - "BookRecordsBackend.ts"

Cohesion: 0.07
Nodes (49): Addendum (2026-09-26): the open book holds its whole record — decision unchanged, ADR-044: Skip Splitting `ReaderTab`'s `openBook`, Consequence, Context, Decision, Reasoning, ADR-054: Skip a Book Record Field Schema, Consequence (+41 more)

### Community 26 - "PerformanceMonitoringTypes.d.ts"

Cohesion: 0.25
Nodes (7): Background for the Implementer, Final Verification, How pattern-within-pattern type checking works today, Key files and line numbers, Pattern Semantic Type Implementation Plan, Running tests, The fix

### Community 27 - "3. Implementations that must move together"

Cohesion: 0.14
Nodes (15): ADR-079: Delete the WASM Assembler, Chunker and Tokenizer Tiers, Context, Decision, Evidence, Architecture / Extraction, CSS / UI Components, Gotchas Reference, JavaScript / TypeScript (+7 more)

### Community 28 - "Dictionary Memory Management Fixes - 2026-02-03"

Cohesion: 0.12
Nodes (16): Automated Testing, Conclusion, Dictionary Memory Management Fixes - 2026-02-03, Executive Summary, Future Improvements, Issues Fixed, Long Term, Manual Testing (+8 more)

### Community 29 - "SemanticToken"

Cohesion: 0.17
Nodes (14): Every gate in the pattern pipeline fails silently, find_best_pattern_match_iter(), is_variable_type_allowed(), PatternMatcher<'a>, PatternMatchResult, SemanticToken, span_cap(), VariableCacheEntry (+6 more)

### Community 30 - "PatternProcessingTypes.d.ts"

Cohesion: 0.15
Nodes (14): a_report_after_the_cooldown_notifies_with_the_running_count(), APP_HANDLE, EVENT_NAME, GATE, init_app_handle(), NOTIFICATION_COOLDOWN_MS, now_ms(), PoisonGate (+6 more)

### Community 31 - "PatternStore.js"

Cohesion: 0.09
Nodes (16): Addendum 2026-10-21: the Pattern Store owns the skip decision, ADR-101: Delete the JS Pattern Matcher; WASM Is the Only Matcher, Context, Decision, What was not measured, PatternStore, MAX_INPUT_TOKENS, MEMORY_MANAGEMENT (+8 more)

### Community 32 - "dictionary_commands.rs"

Cohesion: 0.05
Nodes (46): collision_message(), create_proper_noun_file(), has_paired_patterns(), id_rules_fixture(), list_dictionaries_with_prefix(), list_fiction_pattern_dictionaries_impl(), list_proper_nouns_dictionaries_impl(), MAX_CACHE_ENTRIES (+38 more)

### Community 33 - "Task 1: Add Semantic column to Patterns dictionary table"

Cohesion: 0.20
Nodes (10): Step 1: Verify baseline, Step 2: Edit 1 — Add "Semantic" header between Translation and X types, Step 3: Run type-check after Edit 1, Step 4: Edit 2 — Change translation row cell width from 55% to 43%, Step 5: Edit 3 — Add Semantic row cell between translation and X types cells, Step 6: Run type-check after all edits, Step 7: Run full test suite, Step 8: Manual smoke test (+2 more)

### Community 34 - "Clickable Highlighting - Code Review Fixes Summary"

Cohesion: 0.09
Nodes (22): 1. ✅ Local-Only WASM Loading (CRITICAL), 2. Binary hashing and module-structure checks: removed (2026-10-06, ADR-080), 4. ✅ Instance Method Verification, 5. ✅ Graceful Degradation, 6. ✅ Retry Logic with Exponential Backoff, 7. ✅ No Dynamic WASM Loading, Attack Vector Analysis, Configuration Location (+14 more)

### Community 35 - "ADR-091: Skip Extracting translateText from Translator.jsx"

Cohesion: 0.20
Nodes (7): ADR-091: Skip Extracting translateText from Translator.jsx, Consequence, Context, Decision, ThrottledStreamingState, TranslateTextOutcome, TranslateTextSkipReason

### Community 36 - "find_candidates"

Cohesion: 0.23
Nodes (8): context_lines(), context_lines_of_a_string_the_book_lacks_are_empty(), context_lines_return_the_first_lines_holding_the_text_with_their_file_numbers(), find_candidates(), has_function_word_edge(), Neighbours, Seen, Tally

### Community 37 - "react"

Cohesion: 0.09
Nodes (38): ADR-0045, ADR-064: Skip Splitting the Binding Context, Consequence, Decision, Reasoning, Dictionary Binding, useBookBinding(), BindingBanner() (+30 more)

### Community 38 - "TranslationRunner.ts"

Cohesion: 0.18
Nodes (10): ActiveRun, createTranslationRunner(), run(), MAX_TRANSLATION_TIMEOUT_MS, MIN_TRANSLATION_TIMEOUT_MS, RunContext, RunOptions, TranslationCancelledError (+2 more)

### Community 39 - "lint-ratchet.mjs"

Cohesion: 0.14
Nodes (11): artifact, GENERATED, newestMtime(), newestSource, root, baselinePath, errors, { maxWarnings } (+3 more)

### Community 40 - "useDictionaryCRUD.ts"

Cohesion: 0.07
Nodes (52): a_bare_arabic_line_amid_prose_is_not_mistaken_for_a_header(), a_book_with_no_structure_elects_nothing_but_still_reports_every_candidate(), a_later_pattern_more_than_near_tie_finer_still_wins(), a_near_tie_goes_to_the_earlier_pattern(), a_pattern_below_the_regularity_threshold_never_wins_even_with_a_smaller_median(), an_exact_median_tie_is_broken_by_declaration_order(), BARE_NUMBER_RE, build_headers() (+44 more)

### Community 41 - "EnhancedVirtualizedDictionaryTable.tsx"

Cohesion: 0.07
Nodes (29): devDependencies, eslint, eslint-config-prettier, @eslint/js, eslint-plugin-import, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+21 more)

### Community 42 - "DictionaryManager"

Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, baseUrl, checkJs, forceConsistentCasingInFileNames, jsx, lib, module (+11 more)

### Community 43 - "appFile.ts"

Cohesion: 0.16
Nodes (16): ADR-071: Backend Modules Exist Where There Is a Protocol; One-Shot IPC Stays on `window.electronAPI`, Consequence, Context, Decision, Reasoning, App file, Unreadable app files, AppFile (+8 more)

### Community 44 - "ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface"

Cohesion: 0.07
Nodes (19): Addendum (2026-09-26), Addendum (2026-10-09), ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface, Decision, If App Callers Are Added, Reason, Reasoning, ADR-058: Delete the Runtime WASM Parity Validation; Parity Lives in Tests (+11 more)

### Community 45 - "Troubleshooting Guide"

Cohesion: 0.22
Nodes (9): Development Process Lessons, Error Handling Patterns, Lesson 1: Verify Execution Before Fixing Logic, Lesson 2: A Fault in One Build Only Comes From a Known Build Difference, Lesson 3: Type Boundaries Need Explicit Contracts, Lesson 4: Follow Existing Patterns, Related Guides, Troubleshooting Guide (+1 more)

### Community 46 - ".translateWithProgressiveBatches"

Cohesion: 0.18
Nodes (13): ADR-086: Keep ScrollPositionRecovery Separate From useScrollPositionManager, Consequence, Context, Decision, Reasoning, ScrollPositionRecovery, PANELS, tryRestoreScrollPositions() (+5 more)

### Community 47 - "matcher.rs"

Cohesion: 0.11
Nodes (21): build_result(), build_result_matches_the_shared_fixture(), Fixture, FixtureCase, load_fixture(), NUMBER_VARIABLE, NUMBER_VARIABLE_SPAN, NUMBER_VARIABLE_TYPE (+13 more)

### Community 48 - "BookLinesStore"

Cohesion: 0.13
Nodes (8): BookLineWindow, ADR-0050, BookLinesInputs, BookLinesSnapshot, BookLinesStore, LINES_PER_PAGE, PAGE_KEEP_RADIUS, ADR-0050

### Community 49 - "BookBindingContext.tsx"

Cohesion: 0.11
Nodes (34): ADR-059: A Configuration Toggle Is Computed Under the Config Lock, Not on the Binding Queue, Consequence, Context, Reasoning, BookBindingContext, BookBindingContextValue, ADR-0062, bindingConfigFields() (+26 more)

### Community 50 - "DictionaryIdClassifier.ts"

Cohesion: 0.11
Nodes (40): ADR-0060, Dictionary Kind / Dictionary Tier, Dictionary labels, ConfigurationManager(), TierMenu(), TierMenuProps, Dictionary Type Classification, bareNameOf() (+32 more)

### Community 51 - "ReaderTypes.ts"

Cohesion: 0.09
Nodes (30): ADR-0090, ADR-081: Skip Wire-Shape Parity for the Reader IPC Payloads, Consequence, Context, Decision, Reasoning, @tauri-apps/api, CMD (+22 more)

### Community 52 - "Detailed Optimization Tracking"

Cohesion: 0.22
Nodes (9): Detailed Optimization Tracking, ⏸️ Task #10: Optimize Memory Cleanup (Opportunity #10), ✅ Task #11: Performance Benchmarking Infrastructure, ⏸️ Task #1: Fix WASM Boundary Type Safety (Critical #1), ✅ Task #2: Optimize WASM JSON Serialization (High-Impact #5), ✅ Task #3: Migrate String Operations to Rust WASM (Critical #2), ✅ Task #5: Apply TypeScript ReadonlyArray Optimizations (High-Impact #4), ✅ Task #8: TypeScript Interfaces for V8 Optimization (Medium #8) (+1 more)

### Community 53 - "useReaderPanel.ts"

Cohesion: 0.17
Nodes (15): @tanstack/react-virtual, ColumnMetrics, useColumnMetrics(), OVERSCAN_ROWS, useReaderPanel(), UseReaderPanelOptions, FollowerGeometryProps, PanelGeometryProps (+7 more)

### Community 54 - "TranslationEngine"

Cohesion: 0.08
Nodes (17): ADR-018: Unified PerformanceReport State in usePerformanceMonitoring, Decision, Reasoning, Context, ADR-032: Delete PerformanceBaselineTracker's cacheHitRate Machinery, Consequence, Context, Decision (+9 more)

### Community 55 - "ErrorBoundary"

Cohesion: 0.14
Nodes (5): react-dom, ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, clearPanelLayoutStorage()

### Community 56 - "Code Review Fixes - February 1, 2026"

Cohesion: 0.05
Nodes (37): compilerOptions, allowJs, allowSyntheticDefaultImports, alwaysStrict, checkJs, emitDecoratorMetadata, esModuleInterop, experimentalDecorators (+29 more)

### Community 58 - "TypeScript/Rust Optimization Project"

Cohesion: 0.11
Nodes (17): 2026-01-31 - Session 1 (Infrastructure + Analysis), Architectural Constraints (from CLAUDE.md):, For Each Optimization:, Future Optimization Ideas:, Key Learnings:, Notes, Optimization Roadmap, Overall Integration Testing: (+9 more)

### Community 59 - "sanitize_io_error"

Cohesion: 0.24
Nodes (9): export_dictionaries_impl(), read_zip_entries(), sanitize_io_error(), test_export_empty_directory_produces_empty_zip(), test_export_errors_when_dictionary_dir_missing(), test_export_skips_non_json_files(), test_export_writes_all_json_files_into_zip(), test_response_ok_with_message_sets_message_field() (+1 more)

### Community 60 - "wasm_boundary.rs"

Cohesion: 0.16
Nodes (9): PatternIndex, test_clear_index(), test_get_all_patterns(), test_get_nonexistent_pattern(), test_index_literal_starting_pattern(), test_index_mixed_patterns(), test_index_multiple_patterns_same_first_token(), test_index_variable_starting_pattern() (+1 more)

### Community 61 - "OptimizationBenchmarks"

Cohesion: 0.10
Nodes (20): 1. Documentation Improvements, 1. `src/utils/TranslationEngine.js`, 1. Understanding Code Flow is Critical, 2. Add Execution Path Diagrams, 2. `src/utils/PunctuationProcessor.ts`, 2. Understanding When Functions Are Called, 3. Lightweight Always-On Logging, 3. `src/utils/TextChunker.js` (+12 more)

### Community 62 - "DictionaryTrie"

Cohesion: 0.10
Nodes (18): ADR-017: Skip WasmMemoryPool Analytics Separation, Consequence, Context, Decision, Reasoning, Addendum — 2026-08-26: "Production builds its trie once and reuses it" was false, ADR-075: Delete the Persisted Trie Cache, Consequences (+10 more)

### Community 63 - "Phase 8 Tests - Pattern Matching Validation"

Cohesion: 0.09
Nodes (21): app, security, windows, withGlobalTauri, enable, build, beforeBuildCommand, beforeDevCommand (+13 more)

### Community 64 - "TranslatorControls.tsx"

Cohesion: 0.33
Nodes (4): QUICK_ADD_HINTS, StreamingProgress, TranslatorControlsProps, ADR-0105

### Community 65 - "EnhancedVirtualizedDictionaryTable.tsx"

Cohesion: 0.08
Nodes (35): ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`, Alternatives Rejected, Consequences, Context, Decision, Dictionary table view, Dictionary JSON Format: Two Tiers, Fiction Pattern Merge Order Is Load-Bearing (+27 more)

### Community 67 - "lru_cache.rs"

Cohesion: 0.13
Nodes (15): a_get_protects_an_entry_from_eviction(), a_miss_leaves_no_trace(), a_poisoned_lock_is_reported_once_cleared_and_usable_again(), cache(), evicts_the_least_recently_set_entry(), get_misses_then_hits_after_set(), Inner, Inner<K, V> (+7 more)

### Community 68 - "WindowFiller"

Cohesion: 0.13
Nodes (10): Addendum (2026-09-30), ADR-074: Keep the Outline-Title Fill Inside Its Hook, Consequence, Context, Decision, Window Filler, useWindowedTranslation(), orderChunksByDistance() (+2 more)

### Community 69 - "logger.ts"

Cohesion: 0.11
Nodes (16): Decision, Decision, DictionaryStoreDeps, baseDictionaryTypes, DICTIONARY_TYPES, DictionaryTypeDefinition, getDictionaryTypes(), RuleMatchesModalProps (+8 more)

### Community 70 - "default.json"

Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 71 - "useHotkeyHandler.ts"

Cohesion: 0.13
Nodes (18): ADR-0012, File: `src/components/TabbedInterface.tsx`, File: `src/components/Translator.jsx`, File: `src/hooks/useDictionaryModals.js`, File: `src/hooks/useHotkeyHandler.ts`, File: `src/utils/ui/HotkeyDispatchTable.ts`, Phase 6 — Hotkeys [Small], HotkeyHandlerOptions (+10 more)

### Community 72 - "mod.rs"

Cohesion: 0.16
Nodes (12): DEFAULT_MAX_VARIABLE_SPAN, PatternMatcher, test_full_dictionary_parsing(), test_parse_and_index_workflow(), test_priority_ordering(), parse_patterns_dict(), test_parse_multi_variable_pattern(), test_parse_pattern_with_repeated_variable() (+4 more)

### Community 73 - "SemanticTypes.ts"

Cohesion: 0.12
Nodes (11): CharOnlySpacing, ChunkPostProcessor, needsSpaceCharOnly(), punctuationProcessor, SpacingToken, ChunkPostProcessor, PunctuationProcessor, SpecialPattern (+3 more)

### Community 74 - "TranslationChunkCache"

Cohesion: 0.13
Nodes (9): ADR-043: Skip a Shared Generation-Guarded-Fill Primitive, Consequence, Context, Decision, Reasoning, TranslationChunkCache, chunkText(), LineRange (+1 more)

### Community 75 - "Historical / Deleted {#deleted-symbols}"

Cohesion: 0.12
Nodes (20): Historical / Deleted {#deleted-symbols}, Dictionary match lookup, BaseSegment, RenderSegment, SegmentComponentProps, DictionaryCRUDAPI, Token and phase semantics, ADR-0087 (+12 more)

### Community 76 - "precomputeOriginalSegments"

Cohesion: 0.20
Nodes (13): Addendum (2026-08-25): Extending the decision to `segmentFromPositionMetadata` vs `precomputeOriginalSegments`, Addendum (2026-08-25): `precomputeSegments` deleted — this ADR's original subject no longer exists, Addendum (2026-10-09): what reaches the fast path, measured (architecture review round 23, candidate #4 grilling), ADR-036: Skip Unifying `precomputeSegments`/`precomputeOriginalSegments` Into a Shared Scanner, Consequence, Context, Decision, Reasoning (+5 more)

### Community 77 - "TextTokenizer.ts"

Cohesion: 0.08
Nodes (19): Consequences, GroupedToken, HAN_TEST, PhraseCandidate, ProcessingStrategy, TextAnalysis, TextComplexity, TextTokenizer (+11 more)

### Community 78 - "pattern_matching.rs"

Cohesion: 0.35
Nodes (7): bench_large_token_array(), bench_pattern_competition(), bench_phase_a_processing(), bench_single_pattern_match(), bench_two_phase_processing(), create_token(), find_best_pattern_match()

### Community 79 - "migrate-semantic-types.py"

Cohesion: 0.33
Nodes (4): Environment / Tooling (RTK, Edit, Bash), main(), migrate_file(), Tauri Command Security

### Community 80 - "TranslationEngineTypes.d.ts"

Cohesion: 0.06
Nodes (28): Context, ClickableOriginalSemanticProps, ClickableTranslationOptimizedProps, ClickableTranslationSemanticProps, ClickDirection, SegmentClickHandler, PatternProcessingOptions, PatternProcessorAdapter (+20 more)

### Community 81 - "NumberProcessor"

Cohesion: 0.09
Nodes (13): Addendum 2026-10-07: the spec now runs a shared fixture, ADR-041: Keep `number_processor.rs` — It's a Parity Spec, Not Dead Code, Consequence, Context, Decision, Reasoning, ADR-047: Skip a Numeral-Value Interface on NumberProcessor, Consequence (+5 more)

### Community 82 - "useHotkeyHandler.ts"

Cohesion: 0.17
Nodes (19): CommandPalette(), CommandPaletteProps, EMPTY_SOURCE, ReaderCommands, UseReaderCommandsOptions, QuickAddSource, ACTION_ROWS, buildPaletteCommands() (+11 more)

### Community 83 - "Value"

Cohesion: 0.10
Nodes (25): BatchDictionaryResponse, BatchDictionaryResult, BlobKind, Appearance, Books, Config, TransformRules, check_json_depth() (+17 more)

### Community 84 - "SelectionMapping.ts"

Cohesion: 0.12
Nodes (23): ADR-0049, Addendum (2026-10-10), ADR-049: Keep the Selection-Mapper Registry, Consequence, Context, Decision, Reasoning, Selection mapping (+15 more)

### Community 86 - "useForceReload"

Cohesion: 0.11
Nodes (26): ADR-0003, Addendum — 2026-10-24: `isTranslatingRef` param removed, ADR-084: Skip Merging the Reload Context Assembler Into useForceReload, Consequence, Context, Decision, Reasoning, ADR-085: EngineAccess — one queue for both tabs, ownership follows the visible tab (+18 more)

### Community 87 - "useReadingAnchor.ts"

Cohesion: 0.26
Nodes (8): ADR-0024, Context, Reading Anchor, useAppearanceVersion(), useReadingAnchor(), UseReadingAnchorOptions, registerPendingPositionFlush(), ReadingAnchorInputs

### Community 88 - "DictionaryEdit.ts"

Cohesion: 0.05
Nodes (85): Addendum 2026-09-29, ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider, Consequences, Context and Problem Statement, Decision Drivers, Addendum (2026-10-03), ADR-026: Do Not Move useDictionaryCRUD to src/hooks/, Context (+77 more)

### Community 89 - "Background"

Cohesion: 0.36
Nodes (5): Background, background_of(), run_with_background(), the_spread_gate_drops_a_string_frequent_in_three_other_books_and_keeps_one_in_two(), with_fewer_than_four_other_books_the_spread_gate_is_skipped()

### Community 90 - "Design"

Cohesion: 0.22
Nodes (8): Column header, Design, Design: Semantic Column in Patterns Dictionary Table, Files Touched, No new components, Problem, Row cell, Width adjustment

### Community 91 - "ReaderTab.tsx"

Cohesion: 0.08
Nodes (49): Addendum 2026-10-04, ADR-046: Keep `BookReader`'s Master-Scroll Composition and Refill Ref, Consequence, Decision, Reasoning, ADR-050: One BookReader Instance per Book, Consequence, Context (+41 more)

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

### Community 98 - "SemanticTypePicker.tsx"

Cohesion: 0.12
Nodes (18): ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods, Context, Decision, Reason, When to Revisit, AccessibleBadgeChip(), digitOf(), moveFocusByArrow() (+10 more)

### Community 99 - "Domain Glossary"

Cohesion: 0.10
Nodes (20): ✅ Task #7: Rust String Builder for Post-Processing (Medium #7), Book Loading, Dictionary pair, DictionaryBackend, DictionaryListOrganizer, Domain Glossary, Memory signals on macOS, MoveDialog (+12 more)

### Community 101 - "DictionaryCache"

Cohesion: 0.20
Nodes (10): get_cache_key(), load_dictionary_file(), LoadFailure, Invalid, InvalidJson, Io, Rejected, read_dictionary_file() (+2 more)

### Community 102 - "count_frequent"

Cohesion: 0.20
Nodes (9): a_sidecar_is_the_sorted_hashes_of_the_books_frequent_strings_and_is_deterministic(), build_sidecar(), count_frequent(), counting_in_parallel_shards_gives_the_same_counts_as_counting_in_one_pass(), han_runs(), is_han(), Run, Run<'a> (+1 more)

### Community 103 - "WasmPatternProcessor.js"

Cohesion: 0.13
Nodes (16): ADR-070: Skip a Shared WASM-Call-or-Fallback Shell; Delete the Unread Wrapper Stats, Consequence, Context, Decision, Reasoning, fireCascadeRetire(), _handlers, registerCascadeHandler() (+8 more)

### Community 105 - "TranslationWindow.ts"

Cohesion: 0.13
Nodes (22): BandGeometry, CHUNK_CEILING_CHARS, CHUNK_TARGET_CHARS, ChunkPlanOptions, clamp(), clampRange(), computeBands(), FETCH_VIEWPORTS (+14 more)

### Community 106 - "TokenClaim.ts"

Cohesion: 0.07
Nodes (48): ADR-0006, ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name, Consequences, Context, Decision, Reason, ADR-109: A Match Is Placed as One Claim and One Unit, Consequence (+40 more)

### Community 107 - "CandidateFinderStore"

Cohesion: 0.15
Nodes (5): CandidateFinderStore, A store a hook creates in `useState` must survive its effect cleanup running twice, src/utils/reader — Gotchas, The binding is the authority; the config keys it writes are a cache, The book index's validity key is the record's `encodingLabel` — keep it the same field the open writes

### Community 108 - "ElectronTypes.d.ts"

Cohesion: 0.11
Nodes (22): ADR-090: Keep the tauriAPI Invoke Shell Narrow, Consequence, Context, Decision, Files, Phase 2 — tauriAPI Bindings [Small], tauriAPI, callTauriCommand() (+14 more)

### Community 109 - "dependencies"

Cohesion: 0.17
Nodes (12): dependencies, lucide-react, react, react-dom, react-resizable-panels, @tanstack/react-virtual, @tauri-apps/api, @tauri-apps/plugin-clipboard-manager (+4 more)

### Community 110 - "two_phase.rs"

Cohesion: 0.26
Nodes (15): parse_pattern(), candidate(), index_selects_the_same_best_match_as_scanning_every_pattern(), leading_bonus_reads_the_tokens_before_the_candidate_not_before_its_original_index(), matches_the_literal_run_immediately_before_the_variable(), phase_a_protection_lands_on_the_candidates_own_tokens(), resets_at_an_earlier_variable_keeping_only_the_run_immediately_before_var_idx(), returns_zero_when_before_pos_is_zero() (+7 more)

### Community 111 - "SemanticPatternProcessor"

Cohesion: 0.14
Nodes (13): Appearance travels as CSS variables, never as state, `ClickableTranslationOptimized` paragraph logic, Config is read and written through `appConfig.ts`, Context providers, Engine lifecycle — `EngineContext` / `useEngine()`, Every tab is mounted at once, Frequently-updating values travel by ref, not by dep array, One owner per concern (+5 more)

### Community 112 - "LRUCache"

Cohesion: 0.12
Nodes (16): ADR-003: TypeScript Hybrid Architecture, Alternative 1: Full TypeScript Migration, Alternative 2: Keep Everything JavaScript, Alternative 3: Strategic Hybrid (TypeScript for Boundaries, JavaScript for Core) ✅ SELECTED, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 113 - "Alternatives Considered"

Cohesion: 0.67
Nodes (3): Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected, Alternative 2: Extract loadInitialState only ✓ Accepted, Alternatives Considered

### Community 114 - "ADR-089: The Character-Only Pass Leaves Punctuation Alone"

Cohesion: 0.33
Nodes (5): ADR-089: The Character-Only Pass Leaves Punctuation Alone, Consequence, Context, Decision, Reasoning

### Community 115 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.12
Nodes (16): ADR-002: Dual-Path Clickable Highlighting Architecture, Alternative 1: Consolidate Into Unified Highlighting System, Alternative 2: Keep Separate Paths (Current Implementation) ✅ SELECTED, Alternative 3: Partial Consolidation (Helper Functions), Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 116 - "Translator.jsx"

Cohesion: 0.10
Nodes (26): Update (2026-07-28), Addendum — 2026-10-24: `isTranslatingRef` deleted too, HotkeyHandler(), ADR-0105, TOAST_DURATIONS, TOAST_IDS, ToastDuration, ToastId (+18 more)

### Community 117 - "EngineAccess.ts"

Cohesion: 0.14
Nodes (9): Reasoning, EngineContextValue, EngineInitOutcome, createEngineAccess(), EngineAccess, EngineOwner, EngineRunOptions, Entry (+1 more)

### Community 118 - "useDictionaryConfigManagement.ts"

Cohesion: 0.22
Nodes (8): Addendum — 2026-10-11, ADR-096: Keep the WASM Pattern Processor; Measured, Consequence, Context, Decision, Findings, not fixed here, Measurement, Reasoning

### Community 119 - "useHotkeyHandler"

Cohesion: 0.11
Nodes (22): Addendum (2026-09-26): the revisit trigger fired — answered with ownership, not a registry, Addendum (2026-09-28): handlers keyed by action type — still not a registry, ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler, Consequences, Context and Problem Statement, Decision, Decision Drivers, Negative (+14 more)

### Community 120 - "TextChunker"

Cohesion: 0.14
Nodes (13): ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable, Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected, Alternative 2: Keep coordination in TranslationEngine ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Update (2026-10-03) (+5 more)

### Community 121 - "ElectronTypes.d.ts"

Cohesion: 0.12
Nodes (15): Addendum (2026-10-20), ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext, Alternative 1: Move cache invalidation to `DictionaryContext` ✗ Rejected, Alternative 2: Keep invalidation in `handleForceReload` ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+7 more)

### Community 122 - "ReadingAnchor.ts"

Cohesion: 0.16
Nodes (12): Before asserting, AnchorVirtualizer, computeAnchor(), DEFAULT_VIEWPORT_LINES, DETACHED_INPUTS, isAnchorInPlace(), MODIFIER_KEYS, ReadingAnchorDeps (+4 more)

### Community 123 - "NumberVariable.js"

Cohesion: 0.15
Nodes (18): Addendum 2026-10-11: the JS pattern analysis went too, Consequences, PatternVariableCache, addNumberVariables(), isNumeralToken(), isUntranslated(), NUMBER_VARIABLE, NUMBER_VARIABLE_TYPE (+10 more)

### Community 124 - "jsdom"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-13): no debounce, validation derived — decision unchanged, ADR-039: Skip Splitting `useDictionaryEntryForm`, Consequence, Context, Decision, Reasoning

### Community 125 - "Development Guide"

Cohesion: 0.15
Nodes (10): CI/CD Pipeline, Development Debugging Tools, Development Guide, Fallow Dead-Code Analysis, Gotchas Reference, Production Build Requirements, Related Guides, Testing Infrastructure (+2 more)

### Community 126 - "ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-20), ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider, Consequence, Context, Decision, Reasoning

### Community 127 - "Progress"

Cohesion: 0.29
Nodes (7): Reporter, Stage, BackgroundTable, Counting, stage_range(), Reading, Scoring

### Community 128 - "useAppearanceSettings"

Cohesion: 0.23
Nodes (15): ADR-024: Do Not Move Style Objects into useAppearanceSettings, Context, Decision, Reason, Revisit condition, AppearanceSettings (hook), AppearanceManager(), useAppearanceSettings() (+7 more)

### Community 129 - "usePerformanceMonitoring"

Cohesion: 0.16
Nodes (10): ADR-0069, Consequence, Context, ADR-069: Delete the Baseline Regression Detector, Consequences, Context, Decision, usePerformanceMonitoring() (+2 more)

### Community 130 - "Design"

Cohesion: 0.13
Nodes (14): ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential, Consequences, Context and Problem Statement, Decision, If Startup Latency Becomes a Problem, Implementation, Monitoring and Review, Negative (+6 more)

### Community 131 - "V8OptimizationTypes.d.ts"

Cohesion: 0.13
Nodes (14): ADR-005: Eager Dictionary Loading via DictionaryContext, Alternative 1: Complete the LazyDictionaryContext migration ✗ Rejected, Alternative 2: Keep eager loading, delete LazyDictionaryContext ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+6 more)

### Community 132 - "useChapters.ts"

Cohesion: 0.07
Nodes (38): ADR-0043, ADR-045: Skip a Shared Chapter-Structure Override Control, Consequence, Context, Decision, Reasoning, Reasoning, ADR-099: Skip a Chapter-Outline Record Helper (+30 more)

### Community 133 - "useStreamingTranslation"

Cohesion: 0.10
Nodes (25): ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation, Consequence, Context, Decision, Reasoning, What Was Done Instead, ADR-022: Keep streamingReducer and Initial State Constants Exported, Boundary Condition (+17 more)

### Community 134 - "wasmIntegrityVerifier.js"

Cohesion: 0.14
Nodes (13): Background for the Implementer, Current flag (line ~1915), Patterns Semantic Type Filter Implementation Plan, Running checks, Step 1: Verify baseline, Step 2: Make the change, Step 3: Run type-check, Step 4: Run full test suite (+5 more)

### Community 135 - "usePanelSync.ts"

Cohesion: 0.25
Nodes (12): PanelSyncHandle, SyncPanel, usePanelSync(), UsePanelSyncOptions, ReaderPanelGeometry, anchorAtOffset(), clampFraction(), clampOffset() (+4 more)

### Community 136 - "All other ADRs"

Cohesion: 0.18
Nodes (11): Active ADRs, [ADR-001: WASM Batch Loading — Remove Batch Wrapper](./ADR-001-wasm-batch-loading-failure.md), [ADR-002: Dual-Path Clickable Highlighting](./ADR-002-dual-path-clickable-highlighting.md), [ADR-003: TypeScript Hybrid Architecture](./ADR-003-typescript-hybrid-architecture.md), [ADR-004: 5-Phase Processing Order Immutability](./ADR-004-five-phase-processing-order-immutability.md), ADR Format, Architecture Decision Records (ADRs), History (+3 more)

### Community 137 - "Detailed Fix Descriptions"

Cohesion: 0.17
Nodes (12): Detailed Fix Descriptions, Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries, Fix 6: Update DictionaryManager to use TranslationCache.dispose(), Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup, Impact, Impact, Impact, Problem (+4 more)

### Community 138 - "LineSegments.ts"

Cohesion: 0.24
Nodes (20): Reader Panels, assembleTranslatedLines(), chunkLinePieces(), ChunkLineRange, chunkLineRanges(), linePieceCache, linePieces(), orderChunksByLine() (+12 more)

### Community 141 - "DictionaryStore.ts"

Cohesion: 0.07
Nodes (36): ADR-0014, Addendum (2026-10-20), Addendum (2026-10-21), ADR-052: Dictionary Edit Commits — One Queue, TypeScript Write-Back, Alternatives considered, Consequence, Context, Decision (+28 more)

### Community 142 - "TwoPhasePatternProcessor.js"

Cohesion: 0.10
Nodes (23): ADR-0007, ADR-0037, Alternative 1: Restore JS fallback in `TwoPhasePatternProcessor` ✗ Rejected, Alternative 2: Extract `WasmPatternBridge` seam ✗ Rejected, Alternative 3: Throw on `{ success: false }`, no bridge ✅ Selected, Alternatives Considered, Decision Drivers, References (+15 more)

### Community 143 - "package.json"

Cohesion: 0.06
Nodes (34): name, packageManager, private, type, version, eslint, eslint-config-prettier, @eslint/js (+26 more)

### Community 144 - "ComponentTypes.d.ts"

Cohesion: 0.17
Nodes (11): AppearanceConfig, `DictionaryInfo` Name Collision, AppConfiguration, AppearanceSettings, DictionaryInfo, DictionaryTypeDefinition, DictionaryTypesCollection, FontSettings (+3 more)

### Community 145 - "ADR-011: Skip useTranslatorSession Coordinator Hook"

Cohesion: 0.14
Nodes (13): Addendum (2026-10-10), ADR-011: Skip useTranslatorSession Coordinator Hook, Alternative 1: Extract useTranslatorSession ✗ Rejected, Alternative 2: Keep coordination in Translator.jsx ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+5 more)

### Community 146 - "real_dictionary_profile.rs"

Cohesion: 0.29
Nodes (6): bench_real_dictionary_chunks(), bench_variable_pattern_clone(), create_token(), default_patterns_path(), load_processor(), tokens_from()

### Community 147 - "TransformRuleEngine.ts"

Cohesion: 0.36
Nodes (10): shouldSkipKey(), compareRulePrecedence(), dictionarySupportsTransformRules(), findBestMatch(), findRuleMatchingEntries(), guessWithRules(), initialEntryGuess, matchingRule() (+2 more)

### Community 148 - ".applyPatterns"

Cohesion: 0.09
Nodes (27): Addendum (2026-10-12, architecture review round 32, candidate #4), ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation, Alternative 1: Keep inline mutation per adapter ✗ Rejected, Alternative 2: Return results, single apply site ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+19 more)

### Community 149 - "PanelRows.ts"

Cohesion: 0.17
Nodes (16): LinePiece, Clickable highlighting is chunk-scoped, and a row's runs must equal its plain text, bridgeGlossSegments(), fillSegmentGaps(), fillSegmentGapsCached(), EMPTY_PANEL_ROWS, Panel, PanelRowsSnapshot (+8 more)

### Community 150 - "snapshotSemanticArrays"

Cohesion: 0.15
Nodes (16): ADR-094: Delete the Write-Only Unit Provenance Fields, Consequence, Context, Decision, Reasoning, Addendum (2026-10-12), ADR-100: Delete the Progressive Metadata Pad, Consequence (+8 more)

### Community 151 - "ReaderPanel.tsx"

Cohesion: 0.19
Nodes (13): isLit(), PanelVariant, ReaderHighlight, ReaderPanel, ReaderPanelInner(), ReaderPanelProps, SegmentedLine, segmentTitle() (+5 more)

### Community 152 - "appearanceConfig.ts"

Cohesion: 0.31
Nodes (9): appearanceFile, DEFAULT_APPEARANCE, fromRaw(), fromRawFontSettings(), fromRawUiFont(), isTheme(), LEGACY_LETTER_SPACINGS, normalizeLetterSpacing() (+1 more)

### Community 153 - "Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries"

Cohesion: 0.50
Nodes (4): Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries(), Impact, Problem, Solution

### Community 154 - "TranslationEngine"

Cohesion: 0.22
Nodes (6): Addendum — 2026-07-18: Extends to `TwoPhasePatternProcessor`'s pattern-profiling cluster, Pattern Profiling (TwoPhasePatternProcessor), AssertTrue, EngineInterfaceMembersExistOnTheClass, TwoPhasePatternProcessor, TranslationEngine

### Community 155 - "Performance Impact"

Cohesion: 0.50
Nodes (4): GC Pressure Reduction, Memory Leak Elimination, Performance Impact, User-Visible Benefits

### Community 156 - "useCandidateFinder.ts"

Cohesion: 0.08
Nodes (49): Reasoning, Addendum 2026-10-26: pattern coverage is applied when the run lands, Candidate finder, CandidateContextLines(), CandidateFinderPanelProps, CandidateList(), CandidateReading, CandidateRow() (+41 more)

### Community 157 - "useDictionaryModals.tsx"

Cohesion: 0.09
Nodes (23): Quick-add target, ModalErrorBoundary, ModalErrorBoundaryProps, ModalErrorBoundaryState, CLOSED, DictionaryModals, DictionaryModalsOptions, OpenQuickAdd (+15 more)

### Community 158 - "DictionaryContext.tsx"

Cohesion: 0.09
Nodes (38): ADR-0106, Types / Imports, DictionaryEntryForm, DictionaryContext, DictionaryProviderProps, ADR-0005, ADR-0053, ADR-0055 (+30 more)

### Community 159 - "dictionaryNameProblem"

Cohesion: 0.31
Nodes (9): Consequence, ADR-103: Keep the Default-Dictionary Toggle and the Name Step in the Config Hook, Consequence, Context, Decision, Dictionary priority ladder, dictionaryNameProblem(), isValidDictionaryId() (+1 more)

### Community 160 - "ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader"

Cohesion: 0.14
Nodes (13): Addendum (2026-10-10, architecture review round 24, candidate #1), Addendum (2026-10-12, architecture review round 32, candidate #3), Addendum (2026-10-24, architecture review round 38, candidate #2), ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader, Consequence, Context, Decision, Not done (+5 more)

### Community 161 - "PatternEntryRules.ts"

Cohesion: 0.31
Nodes (8): ✅ Task #6: Migrate Regex to Rust (High-Impact #6), Pattern-template variable substitution corrupted fused letters in both JS and Rust independently, 2026-09-10, Pattern Variable Contract, checkVariableStructure(), checkVariableSymmetry(), countVariableOccurrences(), extractPatternVariables(), PATTERN_VARIABLE_LETTERS

### Community 162 - "logger"

Cohesion: 0.11
Nodes (16): Addendum — 2026-10-09, ADR-093: Skip a Dictionary-Tab Action Runner, Consequence, Context, Decision, Reasoning, Logging, Mock mechanics (+8 more)

### Community 163 - ".translateSinglePass"

Cohesion: 0.06
Nodes (30): ADR-004: 5-Phase Processing Order Immutability, Alternative 1: Reorder Phases for Performance, Alternative 2: Parallel Processing (All Phases Simultaneously), Alternative 3: Keep Current Sequential Order (Patterns First) ✅ SELECTED, Alternatives Considered, Architectural Implications, Consequences, Context and Problem Statement (+22 more)

### Community 164 - "Tauri Backend + WASM Core — Gotchas"

Cohesion: 0.22
Nodes (8): Reader Corpus Tests, Rust Arithmetic, Rust String Lengths, Tauri Backend + WASM Core — Gotchas, WASM-Bridged Structs, wasm-core Architecture, WASM `&mut self` Borrow Rule (Rust 1.84+), WASM-Only Symbols Cause SIGABRT on Native Tests

### Community 165 - "KeySet"

Cohesion: 0.36
Nodes (7): KeySet, keyset(), line_mask_spans(), longest_key_at(), mask_spans(), mask_spans_match_the_shared_fixture(), unmasked_pieces()

### Community 166 - "SemanticArrayBuilder"

Cohesion: 0.08
Nodes (39): ADR-0100, Engine and pipeline tests, Fake timers and async ordering, jsdom and React Testing Library, Testing Gotchas, WASM wrapper tests, CharOnlyAssembly, FullTextAssembly (+31 more)

### Community 167 - "AppReadinessOverlay.tsx"

Cohesion: 0.36
Nodes (6): AppReadinessOverlay(), AppReadinessOverlayProps, pickStatus(), stageClass(), stageIcon(), StageStatus

### Community 168 - "High-Priority Issues 🟠"

Cohesion: 0.15
Nodes (10): Category 1: Future Integration APIs (18 warnings), Category 2: Helper/Utility Methods (8 warnings), Category 3: Dead Code from Earlier Phases (3 warnings), Compilation Warnings - Explained, Current Status, Fixed Warnings (7 total), Remaining Warnings (29 total) - All Expected, Summary (+2 more)

### Community 170 - "wasm-core Pattern Processor"

Cohesion: 0.20
Nodes (9): Constraints, Design, Design: Semantic Type for Structural Pattern Entries, Files Touched, Problem, Section 1 — Data Model, Section 2 — Translation Engine: WASM (primary fix), Section 3 — Translation Engine: JS cross-pass fix (+1 more)

### Community 171 - "DictionaryTableView.tsx"

Cohesion: 0.09
Nodes (53): Decision, Key locations in `EnhancedVirtualizedDictionaryTable.tsx`, DictionaryColumnSchema, react, Moving Entries — One Rule, Three Enforcement Points, Reusable Row/Badge Building Blocks — `TableBuildingBlocks.tsx`, `VirtualRowComponent` Is at Module Scope, DictionaryTableView() (+45 more)

### Community 172 - "Background for the Implementer"

Cohesion: 0.25
Nodes (7): Background for the Implementer, How the patterns table currently looks (column widths), Patterns Semantic Column Implementation Plan, Running tests, Target layout after this change, The phrases `SemanticTypeToggleCell` cell to copy (lines 906–915), What `semanticType` and `handleSetSemanticType` are

### Community 173 - "AppearanceManager.tsx"

Cohesion: 0.27
Nodes (9): FIELD_GROUPS, FieldConfig, FieldGroup, FontControlGroup(), FontControlGroupProps, FontControlRow(), FontControlRowProps, AppearanceSection (+1 more)

### Community 174 - ".invalidate"

Cohesion: 0.22
Nodes (8): test_invalidate_by_id_does_not_remove_nonexistent_key(), test_invalidate_by_id_removes_exact_key_only(), test_invalidate_none_clears_all_entries(), test_invalidate_none_on_empty_cache_is_safe(), test_invalidate_then_set_and_get_are_consistent(), test_write_dictionary_bytes_writes_file_and_invalidates_cache(), write_atomic(), write_dictionary_bytes()

### Community 175 - ".findAllMatches"

Cohesion: 0.08
Nodes (21): Addendum (2026-10-20, architecture review round 34, candidate #3), ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup), Consequence, Context, Decision, Reasoning, Addendum (2026-10-12), Addendum (2026-10-21) (+13 more)

### Community 176 - "ADR-053: Unread Dictionaries Are Refused, Not Quarantined"

Cohesion: 0.33
Nodes (5): ADR-053: Unread Dictionaries Are Refused, Not Quarantined, Alternatives considered, Consequence, Decision, Reasoning

### Community 177 - "When to Profile Performance"

Cohesion: 0.33
Nodes (6): Common Profiling Targets, Prevention Strategy, Rust-side matcher profiling is not wired up, Step 1: Confirm Performance Is Actually a Problem, Step 3: Verify Optimization Impact, When to Profile Performance

### Community 178 - "AI Readiness Evaluation: chinese-translator-tauri"

Cohesion: 0.22
Nodes (8): ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline, Alternative 1: Extract to `TokenStringCache.ts` with DI ✗ Rejected, Alternative 2: Keep inline ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Supersession Note (2026-07-28)

### Community 179 - "WindowedTranslationFill.ts"

Cohesion: 0.36
Nodes (9): useCandidateReading(), UseCandidateReadingOptions, ADR-0050, UseWindowedTranslationOptions, EngineCall, ReaderEngineCalls, ChunkTranslationResult, FillEvent (+1 more)

### Community 180 - "ADR-068: One LRU Module Under Both Dictionary Caches"

Cohesion: 0.33
Nodes (5): ADR-068: One LRU Module Under Both Dictionary Caches, Consequence, Context, Decision, Reasoning

### Community 182 - "TableBuildingBlocks.tsx"

Cohesion: 0.24
Nodes (9): `SemanticType` Canonical Values, PATTERN_SEMANTIC_TYPE_REFS, SEMANTIC_TYPE_LIST, SEMANTIC_TYPES, SemanticType, RuleMatchEntry, classifyVariableType(), getHeuristicType() (+1 more)

### Community 183 - "ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage"

Cohesion: 0.25
Nodes (7): ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage, Consequence, Context, Decision, Reasoning, Update (2026-08-25), Update (2026-09-08)

### Community 184 - "ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline"

Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 185 - "ADR-095: Highlight State Is One Lit Unit"

Cohesion: 0.33
Nodes (5): ADR-095: Highlight State Is One Lit Unit, Consequence, Context, Reasoning, useReaderHighlight()

### Community 186 - "ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory"

Cohesion: 0.25
Nodes (7): Addendum (2026-10-02), Addendum (2026-10-03), Addendum (2026-10-20), ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory, Alternatives considered, Consequence, Context

### Community 187 - "ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init"

Cohesion: 0.33
Nodes (6): ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init, Consequences, Context, Decision, Reason, EngineConfig

### Community 188 - "ReconcileLibrary.ts"

Cohesion: 0.10
Nodes (33): Context, Book Records, @tauri-apps/plugin-dialog, Bookshelf(), BookshelfProps, formatBinding(), formatChapterCount(), formatProgress() (+25 more)

### Community 190 - "Code Quality Improvements"

Cohesion: 0.40
Nodes (5): Code Quality Improvements, Consistency, Documentation, Error Handling, Maintainability

### Community 191 - "ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting"

Cohesion: 0.33
Nodes (5): ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting, Context, Decision, If a Performance Dashboard Is Built, Reason

### Community 192 - "ADR-078: Delete the WASM String Tier"

Cohesion: 0.29
Nodes (6): ADR-078: Delete the WASM String Tier, Consequence, Context, Decision, Evidence, Reasoning

### Community 193 - "Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear"

Cohesion: 0.50
Nodes (4): Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear(), Impact, Problem, Solution

### Community 194 - "Integration #3: V8 Optimization for Memory Tracking (Task #8)"

Cohesion: 0.17
Nodes (11): Alpha-Blended Highlight Colors Need a Separate Dark-Mode Check, Animations and Keyframes, Bare `button`/`select`/`input` Inherit index.css's Global Rules, and a Shorthand Wipes Them, Class Name Collisions, Cross-Component Reuse, File Placement, Grid Rows Aren't Shared Across Sibling Grid Containers, Hiding Elements — Use Conditional Rendering, Not `visibility: hidden` (+3 more)

### Community 195 - "Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup"

Cohesion: 0.50
Nodes (4): Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup(), Impact, Problem, Solution

### Community 196 - "createTranslationEngine"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-24, architecture review round 36, candidate #5), ADR-106: A Dictionary Edit Reaches the Engine Only Through a Rebuild, Consequence, Context, Decision, createTranslationEngine()

### Community 197 - "ADR-108: Delete the Rust Lookup Index"

Cohesion: 0.29
Nodes (6): Addendum 2026-10-24: Phase 4 reads through the seam too, ADR-108: Delete the Rust Lookup Index, Consequences, Context, Evidence, Revisit

### Community 198 - "ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation"

Cohesion: 0.33
Nodes (6): ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation, Consequences, Context, Decision, Reason, Supersession Note (2026-07-28)

### Community 199 - "DevicePerformanceDetector"

Cohesion: 0.29
Nodes (6): ADR-010: Dictionary Match Sort — Specificity Over Provenance, Alternatives Considered, Consequences, Context, Decision, Rationale

### Community 200 - "ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call"

Cohesion: 0.29
Nodes (6): ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call, Consequence, Context, Decision, Evidence, Reasoning

### Community 201 - "TranslationChunkCache.ts"

Cohesion: 0.38
Nodes (6): TranslatedChunk, PositionedSegment, SegmentedChunk, CachedChunk, DEFAULT_CHUNK_CACHE_CAPACITY, ChunkPlan

### Community 202 - "ADR-102: Keep `utils/toast` as the Notification Seam"

Cohesion: 0.33
Nodes (4): ADR-102: Keep `utils/toast` as the Notification Seam, Consequence, Context, Decision

### Community 203 - "ADR-051: The Reader's Quick-Add Is the Shared Add Form, Not a Floating Bar"

Cohesion: 0.33
Nodes (5): ADR-051: The Reader's Quick-Add Is the Shared Add Form, Not a Floating Bar, Consequence, Context, Decision, Reasoning

### Community 204 - ".clear"

Cohesion: 0.33
Nodes (5): Fix 5: MEDIUM-1 - Add dispose() to TranslationCache, Impact, Problem, Solution, ✅ Task #4: Expose Rust Trie to WASM (Critical #3)

### Community 205 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Behaviour, Change, Design, Design: Semantic Type Filter for Structural Patterns, Files Touched, Problem

### Community 206 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Chinese-Vietnamese Translator — Dev Memory, Comprehensive architecture code review — 14 issues fixed, Fixes Done (2026-02-22, session 19), Key Architectural Invariants (most frequently violated), Session History Index, Stable Project Facts

### Community 208 - "ADR-097: Number Variables Have Their Own Span"

Cohesion: 0.33
Nodes (5): ADR-097: Number Variables Have Their Own Span, Consequence, Context, Decision, Reasoning

### Community 209 - "Resolved Bug Postmortems"

Cohesion: 0.33
Nodes (6): Cross-panel highlight picks wrong duplicate-char instance, 2026-08-26, Every Candidate finder Add re-ranked the whole list, 2026-10-26, "màu" split into "mà" + "u" (Jan 2025), Pattern substitution and constructor option, 2026-07-30, Resolved Bug Postmortems, `useEngineReinitializer.js` WASM-sync-validation status check (file deleted 2026-10-03; see `deleted-symbols.md`)

### Community 210 - "ADR-111: Candidate Finder Design"

Cohesion: 0.40
Nodes (4): ADR-111: Candidate Finder Design, Considered options, Context, Measured (#52)

### Community 211 - "When Translation Is Wrong"

Cohesion: 0.33
Nodes (6): Step 1: Rule Out Stale Dictionary/Config State, Step 2: Verify Execution Path, Step 3: Check Phase Processing, Step 4: Verify Dictionary Entries, Step 5: Test Pattern Competition, When Translation Is Wrong

### Community 212 - "ADR-061: Skip a Shelf Row Module"

Cohesion: 0.40
Nodes (4): ADR-061: Skip a Shelf Row Module, Consequence, Decision, Reasoning

### Community 213 - "Verifying Claims Before Acting"

Cohesion: 0.60
Nodes (3): Shipped and reverted same-session, 2026-08-16: `semanticArrayValidator` wired into `checkSemanticArrayCorruption`, Verifying Claims Before Acting, Window

### Community 214 - "Security Implications"

Cohesion: 0.67
Nodes (3): Attack Scenarios (If Exploited), Security Implications, What `'wasm-unsafe-eval'` Allows

### Community 215 - "Comparison to CSP Best Practices"

Cohesion: 0.67
Nodes (3): Comparison to CSP Best Practices, What We Did Right ✅, Why `'wasm-unsafe-eval'` Is Acceptable Here

### Community 216 - "TranslationInputValidator.ts"

Cohesion: 0.60
Nodes (4): checkControlCharacters(), checkLength(), validateTranslationInput(), ValidationResult

### Community 217 - "Alternatives Considered"

Cohesion: 0.50
Nodes (4): Alternative 1: Copy-fix across all three processors ✗ Rejected, Alternative 2: Base class / mixin for WASM processors ✗ Rejected, Alternative 3: WasmProcessorLifecycle class ✅ Selected, Alternatives Considered

### Community 218 - "Alternatives Considered"

Cohesion: 0.50
Nodes (4): Alternative 1: Full HotkeyRegistry ✗ Rejected, Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected, Alternative 3: Keep useHotkeyHandler ✅ Selected, Alternatives Considered

### Community 219 - "Performance Metrics"

Cohesion: 0.67
Nodes (3): Baseline Measurements (Before Optimizations), Performance Metrics, Post-Optimization Measurements

### Community 220 - "Resources"

Cohesion: 0.67
Nodes (3): Development Tools:, Documentation:, Resources

### Community 225 - "ADR-061: Skip a Shelf Row Module"

Cohesion: 0.11
Nodes (25): ADR-0036, CharacterOnlyBridge, Click-to-Highlight Lifecycle, WordSegmentMatcher, useHighlightInteraction(), UseHighlightInteractionOptions, UseHighlightInteractionResult, SegmentClickPayload (+17 more)

### Community 234 - "ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider"

Cohesion: 0.33
Nodes (5): ADR-040: Reject Aho-Corasick as a Swap for the Native Lookup-Index Trie, Consequence, Context, Decision, Reasoning

### Community 235 - "adr/README.md"

Cohesion: 0.14
Nodes (9): ADR-031: Skip Splitting dictionary_commands.rs by Concern, Consequence, Context, Decision, Reasoning, ADR-104: No Shared Fake for One-Shot IPC in Tests, Consequence, Context (+1 more)

### Community 245 - "ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`"

Cohesion: 0.33
Nodes (5): ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`, Consequences, Context, Decision, Reason

### Community 246 - "ADR-010: Dictionary Match Sort — Specificity Over Provenance"

Cohesion: 0.25
Nodes (8): Background, Step 1: Write a failing test, Step 2: Run test to verify it fails, Step 3: Add the new block in `buildVariableCache`, Step 4: Run test, Step 5: Run full JS suite, Step 6: Commit, Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`

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

### Community 281 - "vite.config.ts"

Cohesion: 0.29
Nodes (4): vite, vite-plugin-wasm, @vitejs/plugin-react, vitest

### Community 290 - "ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name"

Cohesion: 0.50
Nodes (4): Fix 8: BONUS - Fix method name typos in TranslationCache, Impact, Problem, Solution

### Community 293 - "src/components/rules — Gotchas"

Cohesion: 0.33
Nodes (5): Compact Toggle-in-a-Table-Cell Pattern, Saving: one writer, one queue, src/components/rules — Gotchas, `TransformRule.relocate` — Renamed from `moveWords: number` 2026-08-24, Two UI Surfaces, One Set of Field Policies

### Community 298 - "RulesManager.tsx"

Cohesion: 0.13
Nodes (32): ADR-056: Skip a Rule-Draft Module, Consequence, Context, Decision, Reasoning, lucide-react, BinaryToggleChips(), NewRuleModal() (+24 more)

### Community 302 - "Keyboard Shortcuts"

Cohesion: 0.40
Nodes (5): Dictionary tab, Global (any tab), Keyboard Shortcuts, Reader tab, Translator tab

### Community 343 - "Documentation Index"

Cohesion: 0.40
Nodes (5): Archive, Decisions, Documentation Index, Guides, Reference

## Knowledge Gaps

- **169 isolated node(s):** `@tauri-apps/plugin-clipboard-manager`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-shell`, `@eslint/js` (+164 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1533 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **53 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Historical / Deleted {#deleted-symbols}` connect `Historical / Deleted {#deleted-symbols}` to `ReadingAnchor`, `useTranslatorEngine`, `wordTransformHelpers.ts`, `hasPairedPatterns`, `useTransformRules.ts`, `TransformRuleEngine.ts`, `App.jsx`, `Content Security Policy (CSP) and WASM Security`, `WasmProcessorLifecycle`, `SemanticArrayBuilder`, `appConfig.ts`, `BookRecordsBackend.ts`, `3. Implementations that must move together`, `SemanticToken`, `PatternStore.js`, `ADR-091: Skip Extracting translateText from Translator.jsx`, `react`, `TranslationRunner.ts`, `appFile.ts`, `ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface`, `.translateWithProgressiveBatches`, `BookBindingContext.tsx`, `DictionaryIdClassifier.ts`, `useReaderPanel.ts`, `TranslationEngine`, `DictionaryTrie`, `EnhancedVirtualizedDictionaryTable.tsx`, `logger.ts`, `useHotkeyHandler.ts`, `SemanticTypes.ts`, `precomputeOriginalSegments`, `TextTokenizer.ts`, `pattern_matching.rs`, `TranslationEngineTypes.d.ts`, `NumberProcessor`, `SelectionMapping.ts`, `useForceReload`, `useReadingAnchor.ts`, `DictionaryEdit.ts`, `ReaderTab.tsx`, `SemanticTypePicker.tsx`, `Domain Glossary`, `WasmPatternProcessor.js`, `TranslationWindow.ts`, `TokenClaim.ts`, `ElectronTypes.d.ts`, `Translator.jsx`, `EngineAccess.ts`, `useHotkeyHandler`, `TextChunker`, `ReadingAnchor.ts`, `NumberVariable.js`, `Development Guide`, `usePerformanceMonitoring`, `useStreamingTranslation`, `usePanelSync.ts`, `DictionaryStore.ts`, `TwoPhasePatternProcessor.js`, `ComponentTypes.d.ts`, `TransformRuleEngine.ts`, `snapshotSemanticArrays`, `ReaderPanel.tsx`, `appearanceConfig.ts`, `TranslationEngine`, `useDictionaryModals.tsx`, `DictionaryContext.tsx`, `logger`, `.translateSinglePass`, `SemanticArrayBuilder`, `High-Priority Issues 🟠`, `7. Clickable Highlighting Feature Analysis`, `DictionaryTableView.tsx`, `.findAllMatches`, `TableBuildingBlocks.tsx`, `ReconcileLibrary.ts`, `TranslationChunkCache.ts`, `ADR-102: Keep `utils/toast` as the Notification Seam`, `.clear`, `ADR-061: Skip a Shelf Row Module`, `RulesManager.tsx`?**
  _High betweenness centrality (0.441) - this node is a cross-community bridge._
- **Are the 221 inferred relationships involving `Historical / Deleted {#deleted-symbols}` (e.g. with `ClickableOriginalSemantic()` and `BaseSegment`) actually correct?**
  _`Historical / Deleted {#deleted-symbols}` has 221 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@tauri-apps/plugin-clipboard-manager`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener` to the rest of the system?**
  _169 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dictionary_commands.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06400409626216078 - nodes in this community are weakly interconnected._
- **Why does `is_variable_type_allowed()` connect `SemanticToken` to `Historical / Deleted {#deleted-symbols}`, `two_phase.rs`, `matcher.rs`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `logger` (e.g. with `Historical / Deleted {#deleted-symbols}` and `graphify`) actually correct?**
  _`logger` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `temp_test_dir` be split into smaller, more focused modules?**
  _Cohesion score 0.13630229419703105 - nodes in this community are weakly interconnected._
