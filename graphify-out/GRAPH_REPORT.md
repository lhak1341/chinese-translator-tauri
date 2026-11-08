# Graph Report - chinese-translator-tauri (2026-11-08)

## Corpus Check

- 473 files · ~431,826 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 35 file(s) not represented in the graph (top: .css 25, (none) 6, .toml 1)

## Summary

- 4690 nodes · 11205 edges · 273 communities (220 shown, 53 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 1807 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `cbba623d`
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
- DictionaryContext.tsx
- candidate_finder.rs
- ElectronTypes.d.ts
- App.jsx
- Content Security Policy (CSP) and WASM Security
- WasmProcessorLifecycle
- plain
- webview_diagnostics.rs
- TabbedInterface.tsx
- candidate_finder_commands.rs
- TranslationEngine
- Number Processing Phase - Code Review Fixes
- appConfig.ts
- BookRecordsBackend.ts
- PerformanceMonitoringTypes.d.ts
- useOutlineTranslations.ts
- Dictionary Memory Management Fixes - 2026-02-03
- SemanticToken
- PatternProcessingTypes.d.ts
- PatternStore.js
- dictionary_commands.rs
- Task 1: Add Semantic column to Patterns dictionary table
- Clickable Highlighting - Code Review Fixes Summary
- Verifying Claims Before Acting
- find_candidates
- react
- TranslationRunner.ts
- lint-ratchet.mjs
- useDictionaryCRUD.ts
- EnhancedVirtualizedDictionaryTable.tsx
- DictionaryManager
- createAppFile
- ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface
- Resolved Bug Postmortems
- .translateWithProgressiveBatches
- matcher.rs
- extractErrorMessage
- BookBindingContext.tsx
- DictionaryIdClassifier.ts
- ReaderTypes.ts
- Detailed Optimization Tracking
- useReaderPanel.ts
- TranslationEngine
- ErrorBoundary
- Code Review Fixes - February 1, 2026
- App.jsx
- PatternTemplateEngine
- sanitize_io_error
- wasm_boundary.rs
- OptimizationBenchmarks
- DictionaryTrie
- Phase 8 Tests - Pattern Matching Validation
- TranslatorDisplayPanels.tsx
- EnhancedVirtualizedDictionaryTable.tsx
- Domain Glossary
- lru_cache.rs
- WindowFiller
- processTokensWasm
- default.json
- useHotkeyHandler.ts
- mod.rs
- SemanticTypes.ts
- TranslationChunkCache
- useDeferredRetranslate
- precomputeOriginalSegments
- TextTokenizer.ts
- pattern_matching.rs
- usePerformanceMonitoring.js
- TranslationEngineTypes.d.ts
- NumberProcessor
- useHotkeyHandler.ts
- Value
- SelectionMapping.ts
- src-tauri/src/lib.rs
- useForceReload
- useColumnMetrics.ts
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
- SemanticArrayMetadata
- WasmSharedModule.js
- translation-wasm-core
- TranslationWindow.ts
- TokenClaim.ts
- CandidateFinderStore
- ElectronTypes.d.ts
- dependencies
- two_phase.rs
- SemanticPatternProcessor
- LRUCache
- Security Mitigations
- ADR-089: The Character-Only Pass Leaves Punctuation Alone
- ADR-002: Dual-Path Clickable Highlighting Architecture
- Translator.jsx
- EngineAccess.ts
- useDictionaryConfigManagement.ts
- useHotkeyHandler
- TextChunker
- ElectronTypes.d.ts
- ReadingAnchor.ts
- ModalErrorBoundary
- jsdom
- Development Guide
- ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider
- Progress
- useAppearanceSettings
- TranslatorControls.tsx
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
- DictionaryEdit.ts
- wasm-core
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
- dictionary/index.ts
- useDictionaryConfigManagement.ts
- ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader
- WasmPatternProcessor.js
- logger
- ADR-004: 5-Phase Processing Order Immutability
- matchWordSegments
- KeySet
- SemanticArrayBuilder
- Translator
- High-Priority Issues 🟠
- 7. Clickable Highlighting Feature Analysis
- wasm-core Pattern Processor
- DictionaryTableView.tsx
- ADR-048: Generic Proper-Noun Dictionaries Get Paired Pattern Dictionaries Too
- ADR-098: Pattern Result Indices Are Original Indices
- context_lines
- ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup)
- ADR-053: Unread Dictionaries Are Refused, Not Quarantined
- ADR-067: Keep Pair Operations in the Binding Store
- AI Readiness Evaluation: chinese-translator-tauri
- WindowedTranslationFill.ts
- ADR-068: One LRU Module Under Both Dictionary Caches
- ReaderBinding.tsx
- ADR-083: Delete the WASM Conflict Resolution Tier
- ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage
- ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline
- ADR-095: Highlight State Is One Lit Unit
- ADR-104: No Shared Fake for One-Shot IPC in Tests
- ConfigurationManager.tsx
- ReconcileLibrary.ts
- prototypes/README.md
- Code Quality Improvements
- ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting
- ADR-078: Delete the WASM String Tier
- Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear
- Integration #3: V8 Optimization for Memory Tracking (Task #8)
- Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup
- Failed Patterns (Avoid)
- ADR-108: Delete the Rust Lookup Index
- ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation
- DevicePerformanceDetector
- ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call
- TranslationChunkCache.ts
- adr/README.md
- useDictionaryModals
- Consequences
- Chinese-Vietnamese Translation App
- Chinese-Vietnamese Translation App
- FastHasher
- ADR-097: Number Variables Have Their Own Span
- Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries
- ADR-111: Candidate Finder Design
- Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup
- Future Improvements
- Verification Checklist
- ADR-061: Skip a Shelf Row Module
- ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider
- ADR-031: Skip Splitting dictionary_commands.rs by Concern
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
3. `logger` - 84 edges
4. `Domain Glossary` - 72 edges
5. `temp_test_dir()` - 54 edges
6. `make_cache()` - 49 edges
7. `extractErrorMessage()` - 44 edges
8. `BookReader()` - 43 edges
9. `NumberProcessor` - 40 edges
10. `useDictionary()` - 38 edges

## Surprising Connections (you probably didn't know these)

- `Alternatives considered` --references--> `BookBindingStore` [INFERRED]
  docs/adr/ADR-062-pair-operations-share-the-binding-queue-and-the-stores-list.md → src/components/BookBindingStore.ts
- `Consequence` --references--> `EngineProvider()` [INFERRED]
  docs/adr/ADR-088-skip-moving-the-cache-invalidator-registration.md → src/components/EngineContext.jsx
- `Historical / Deleted {#deleted-symbols}` --references--> `BaseSegment` [INFERRED]
  docs/guides/deleted-symbols.md → src/components/char-only/SegmentedParagraphs.tsx
- `Decision Drivers` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx
- `Neutral` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **RulesManager two-surface shared field-policy group** — src_components_rules_newrulemodal_newrulemodal, src_components_rules_rulerow_rulerow, src_components_rules_rulefieldvalidation_rulefieldvalidation, src_utils_dictionary_transformruleengine_transformruleengine, src_components_rules_tests_rulefieldparity_rulefieldparity [EXTRACTED 1.00]

## Communities (273 total, 53 thin omitted)

### Community 0 - "dictionary_commands.rs"

Cohesion: 0.06
Nodes (49): a_book_reaching_outside_gbk_reports_gbk_but_not_strictly_clean(), a_low_confidence_report_blocks_decoding(), a_multibyte_detection_is_acted_on_without_asking(), a_plain_gbk_book_is_strictly_clean(), a_single_byte_detection_is_reported_low_confidence(), an_override_decodes_a_file_detection_refused(), BookContent, both_line_ending_conventions_index_identically() (+41 more)

### Community 1 - "temp_test_dir"

Cohesion: 0.10
Nodes (49): build_test_zip(), collision_message(), create_structural_patterns_dictionary_impl(), has_paired_patterns(), import_dictionaries_impl(), load_dictionaries_parallel_impl(), make_cache(), rename_proper_nouns_dictionary_impl() (+41 more)

### Community 2 - "Logger"

Cohesion: 0.05
Nodes (58): Case, ConversionPattern, create_conversion_patterns(), Fixture, Ignore, parse_regex!, NumberMatch, NumberProcessor (+50 more)

### Community 3 - "chapter_outline_commands.rs"

Cohesion: 0.18
Nodes (17): a_poisoned_book_lock_is_reported_once_and_keeps_the_open_book(), BookCache, cache_with_open_book(), CachedBook, open_book_handle(), open_book_handle_shares_the_cached_book(), open_book_handle_survives_the_book_being_replaced(), chapter_headers_for_pattern() (+9 more)

### Community 4 - "ReadingAnchor"

Cohesion: 0.15
Nodes (4): ReadingPosition, ReadingAnchor, tryRestorePosition(), nextViewportLines()

### Community 5 - "useTranslatorEngine"

Cohesion: 0.14
Nodes (15): Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected, ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine, Consequence, Context, Decision, Reasoning, What Was Done Instead, Addendum (2026-10-26): the engine swap takes a turn of the queue (+7 more)

### Community 6 - "wordTransformHelpers.ts"

Cohesion: 0.16
Nodes (22): CAPITALIZATION, MOVE_TO_FRONT, Transform, WordTransformToolbarProps, capitalizeAll(), capitalizeExceptBoundaryN(), capitalizeExceptFirstN(), capitalizeExceptLast() (+14 more)

### Community 7 - "Performance Guide"

Cohesion: 0.13
Nodes (15): Analyze Performance Baselines, Cache Invalidation, Cache Management, Check Cache Performance, Check Real Memory Usage, Common Profiling Targets, Memory Leak Prevention, Performance Guide (+7 more)

### Community 8 - "book_commands.rs"

Cohesion: 0.09
Nodes (39): a_line_range_includes_blank_lines_as_empty_strings(), an_oversized_file_is_refused_before_it_is_read(), BOOK_POISON_REPORTS, BookFingerprint, BookLines, default_library_path(), DEFAULT_LIBRARY_SUBPATH, fingerprint_book() (+31 more)

### Community 9 - "hasPairedPatterns"

Cohesion: 0.12
Nodes (27): Addendum (2026-10-21), Addendum (2026-10-21), ADR-060: Dictionary-Id and Config-Key Rules Are Held by a Shared Fixture; Rust Keeps Editing Config, Context, Decision, Reasoning, Decision, callRustConfigWrite() (+19 more)

### Community 10 - "useTransformRules.ts"

Cohesion: 0.15
Nodes (24): ADR-107: Keep the Transform Rule Pending Overlay in the Editor Hook, Consequences, Context, Decision, Reasoning, assertNoConflict(), conflictError(), generateTransformRuleId() (+16 more)

### Community 11 - "book_index.rs"

Cohesion: 0.12
Nodes (25): a_book_that_cannot_be_read_is_left_out(), a_cancelled_backfill_returns_nothing_and_leaves_no_sidecar(), a_sidecar_of_another_format_version_or_damaged_is_refused(), a_sidecar_round_trips_and_is_refused_for_another_encoding(), a_stale_sidecar_is_rebuilt_and_a_deleted_folder_is_recovered_from(), a_stored_sidecar_is_valid_only_for_the_encoding_it_was_built_with(), a_write_leaves_no_temp_file_and_a_fingerprint_that_is_not_a_name_is_refused(), background_book() (+17 more)

### Community 12 - "DictionaryContext.tsx"

Cohesion: 0.07
Nodes (40): ADR-0106, Addendum (2026-10-11, architecture review round 30, candidate #5 grilling), DictionaryContext, DictionaryContextValue, DictionaryProviderProps, ADR-0005, ADR-0053, ADR-0055 (+32 more)

### Community 13 - "candidate_finder.rs"

Cohesion: 0.08
Nodes (19): CHUNK, CONTEXT, DOMINANCE, FUNCTION_WORDS, GLUED_RATIO, HAN_BYTES, MaskCase, MaskFixture (+11 more)

### Community 14 - "ElectronTypes.d.ts"

Cohesion: 0.10
Nodes (20): 1a. Add `list_fiction_pattern_dictionaries`, 1b. Add `create_structural_patterns_dictionary`, 1c. Add `rename_structural_patterns_dictionary`, 1d. Modify `rename_proper_nouns_dictionary` — cascade, 1e. Register in `lib.rs`, Design Decisions (do not re-litigate), Fiction Structural Pattern Dictionaries — Implementation Plan, File: `src/components/configuration/ConfigurationManager.tsx` (+12 more)

### Community 15 - "App.jsx"

Cohesion: 0.19
Nodes (10): pendingToastCalls, toast, ToastContainer(), ToastContext, ToastContextType, ToastIcon(), ToastInternalContext, ToastItem() (+2 more)

### Community 16 - "Content Security Policy (CSP) and WASM Security"

Cohesion: 0.12
Nodes (20): Decision, SegmentedParagraphs, UnitHighlightPredicate, ClickableOriginalSemantic(), ClickableTranslationSemantic(), HighlightableSegment, HighlightableSegmentProps, BaseSegment (+12 more)

### Community 17 - "WasmProcessorLifecycle"

Cohesion: 0.08
Nodes (29): ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors, Alternative 1: Copy-fix across all three processors ✗ Rejected, Alternative 2: Base class / mixin for WASM processors ✗ Rejected, Alternative 3: WasmProcessorLifecycle class ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+21 more)

### Community 18 - "plain"

Cohesion: 0.16
Nodes (20): a_cancelled_sidecar_build_returns_nothing(), a_function_word_at_either_edge_drops_the_string(), a_name_held_by_an_active_dictionary_is_not_listed(), a_name_in_an_inactive_dictionary_stays_listed_with_its_ids(), a_phrases_key_is_dropped(), a_repeated_name_comes_back_with_count_and_line_count_ranked_by_count(), a_string_glued_to_a_name_twenty_times_as_frequent_is_dropped(), a_string_made_of_two_common_characters_that_rarely_meet_is_dropped() (+12 more)

### Community 19 - "webview_diagnostics.rs"

Cohesion: 0.13
Nodes (10): append(), appending_creates_the_folder_and_keeps_earlier_lines(), format_line(), LOG_FILE, on_web_content_terminated(), record(), record_launch(), STARTED (+2 more)

### Community 20 - "TabbedInterface.tsx"

Cohesion: 0.13
Nodes (19): ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook, Consequence, Context, Decision, Reasoning, RulesManagerHandle, TAB_PRESENTATION, TabbedInterface() (+11 more)

### Community 21 - "candidate_finder_commands.rs"

Cohesion: 0.10
Nodes (28): a_cancel_before_the_run_registers_is_still_seen_by_the_run(), analyse(), analyse_open_book(), analyse_ranks_the_open_books_names_and_reports_progress(), BACKGROUND_SHARE, book_with_a_name(), cancel_candidate_run(), candidate_context() (+20 more)

### Community 22 - "TranslationEngine"

Cohesion: 0.10
Nodes (18): Addendum (2026-10-24, architecture review round 38, candidate #2), Decision, TokenClaim, 2. Code that looks redundant here is load-bearing — each of these was already removed once, and broke something, 3. Implementations that must move together, src/utils — Gotchas, ConflictCandidate, resolveGlobalConflicts() (+10 more)

### Community 23 - "Number Processing Phase - Code Review Fixes"

Cohesion: 0.24
Nodes (20): create_fiction_dictionary_pair(), create_proper_nouns_dictionary(), create_structural_patterns_dictionary(), DictionaryResponse, export_dictionaries(), get_dictionary_path(), get_or_create_dictionary_dir(), import_dictionaries() (+12 more)

### Community 24 - "appConfig.ts"

Cohesion: 0.12
Nodes (23): ADR-062: Pair Operations Share the Binding Queue, and the Configuration Tab Reads the Dictionary Store's List, Alternatives considered, Consequence, Context, ADR-066: Skip an Active-Dictionary Snapshot Module, Consequence, Context, Decision (+15 more)

### Community 25 - "BookRecordsBackend.ts"

Cohesion: 0.07
Nodes (48): Addendum (2026-09-26): the open book holds its whole record — decision unchanged, ADR-044: Skip Splitting `ReaderTab`'s `openBook`, Consequence, Context, Decision, Reasoning, ADR-054: Skip a Book Record Field Schema, Consequence (+40 more)

### Community 26 - "PerformanceMonitoringTypes.d.ts"

Cohesion: 0.25
Nodes (7): Background for the Implementer, Final Verification, How pattern-within-pattern type checking works today, Key files and line numbers, Pattern Semantic Type Implementation Plan, Running tests, The fix

### Community 27 - "useOutlineTranslations.ts"

Cohesion: 0.13
Nodes (17): ADR-0043, Addendum (2026-09-30), ADR-043: Skip a Shared Generation-Guarded-Fill Primitive, Consequence, Decision, Reasoning, ADR-074: Keep the Outline-Title Fill Inside Its Hook, Consequence (+9 more)

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

Cohesion: 0.08
Nodes (25): Addendum — 2026-10-09, References, Addendum 2026-10-11: the JS pattern analysis went too, Addendum 2026-10-21: the Pattern Store owns the skip decision, Addendum — 2026-10-24: the store alone owns Phase 1 toasts; a crash switches Phase 1 off at once, ADR-101: Delete the JS Pattern Matcher; WASM Is the Only Matcher, Consequences, Context (+17 more)

### Community 32 - "dictionary_commands.rs"

Cohesion: 0.07
Nodes (37): create_proper_noun_file(), id_rules_fixture(), list_dictionaries_with_prefix(), list_fiction_pattern_dictionaries_impl(), list_proper_nouns_dictionaries_impl(), MAX_CACHE_ENTRIES, MAX_DICTIONARY_ENTRIES, MAX_DICTIONARY_ID_LENGTH (+29 more)

### Community 33 - "Task 1: Add Semantic column to Patterns dictionary table"

Cohesion: 0.11
Nodes (17): Background for the Implementer, How the patterns table currently looks (column widths), Patterns Semantic Column Implementation Plan, Running tests, Step 1: Verify baseline, Step 2: Edit 1 — Add "Semantic" header between Translation and X types, Step 3: Run type-check after Edit 1, Step 4: Edit 2 — Change translation row cell width from 55% to 43% (+9 more)

### Community 34 - "Clickable Highlighting - Code Review Fixes Summary"

Cohesion: 0.10
Nodes (21): Attack Scenarios (If Exploited), Attack Vector Analysis, Comparison to CSP Best Practices, Configuration Location, Content Security Policy (CSP) and WASM Security, External Resources, Future Improvements, Internal Documentation (+13 more)

### Community 35 - "Verifying Claims Before Acting"

Cohesion: 0.12
Nodes (15): ADR-091: Skip Extracting translateText from Translator.jsx, Consequence, Context, Decision, Shipped and reverted same-session, 2026-08-16: `semanticArrayValidator` wired into `checkSemanticArrayCorruption`, Verifying Claims Before Acting, Window, ThrottledStreamingState (+7 more)

### Community 36 - "find_candidates"

Cohesion: 0.17
Nodes (11): count_frequent(), counting_in_parallel_shards_gives_the_same_counts_as_counting_in_one_pass(), find_candidates(), han_runs(), has_function_word_edge(), is_han(), Neighbours, Run (+3 more)

### Community 37 - "react"

Cohesion: 0.10
Nodes (37): ADR-0045, ADR-064: Skip Splitting the Binding Context, Consequence, Decision, Reasoning, lucide-react, useBookBinding(), BindingBanner() (+29 more)

### Community 38 - "TranslationRunner.ts"

Cohesion: 0.13
Nodes (11): Reasoning, ActiveRun, createTranslationRunner(), run(), MAX_TRANSLATION_TIMEOUT_MS, MIN_TRANSLATION_TIMEOUT_MS, RunContext, RunOptions (+3 more)

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

### Community 43 - "createAppFile"

Cohesion: 0.05
Nodes (37): Addendum (2026-10-02), Addendum (2026-10-03), Addendum (2026-10-20), ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory, Alternatives considered, Consequence, Context, ADR-071: Backend Modules Exist Where There Is a Protocol; One-Shot IPC Stays on `window.electronAPI` (+29 more)

### Community 44 - "ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface"

Cohesion: 0.06
Nodes (24): Addendum (2026-10-09), ADR-034: Skip Building DictionaryManager.validateIntegrity(), Consequence, Decision, Reasoning, ADR-058: Delete the Runtime WASM Parity Validation; Parity Lives in Tests, Consequence, Context (+16 more)

### Community 45 - "Resolved Bug Postmortems"

Cohesion: 0.09
Nodes (22): Cross-panel highlight picks wrong duplicate-char instance, 2026-08-26, Development Process Lessons, Error Handling Patterns, Every Candidate finder Add re-ranked the whole list, 2026-10-26, Lesson 1: Verify Execution Before Fixing Logic, Lesson 2: A Fault in One Build Only Comes From a Known Build Difference, Lesson 3: Type Boundaries Need Explicit Contracts, Lesson 4: Follow Existing Patterns (+14 more)

### Community 46 - ".translateWithProgressiveBatches"

Cohesion: 0.18
Nodes (13): ADR-086: Keep ScrollPositionRecovery Separate From useScrollPositionManager, Consequence, Context, Decision, Reasoning, ScrollPositionRecovery, PANELS, tryRestoreScrollPositions() (+5 more)

### Community 47 - "matcher.rs"

Cohesion: 0.11
Nodes (21): build_result(), build_result_matches_the_shared_fixture(), Fixture, FixtureCase, load_fixture(), NUMBER_VARIABLE, NUMBER_VARIABLE_SPAN, NUMBER_VARIABLE_TYPE (+13 more)

### Community 48 - "extractErrorMessage"

Cohesion: 0.07
Nodes (23): ADR-0090, ADR-090: Keep the tauriAPI Invoke Shell Narrow, Consequence, Context, Decision, Reasoning, BookLineWindow, ADR-0050 (+15 more)

### Community 49 - "BookBindingContext.tsx"

Cohesion: 0.12
Nodes (36): Context, Decision, Dictionary Binding, Quick-add target, BookBindingContext, BookBindingContextValue, ADR-0062, bindingConfigFields() (+28 more)

### Community 50 - "DictionaryIdClassifier.ts"

Cohesion: 0.10
Nodes (40): ADR-0060, Types / Imports, Dictionary Kind / Dictionary Tier, Dictionary labels, Dictionary Type Classification, bareNameOf(), DictionaryKind, DictionaryTier (+32 more)

### Community 51 - "ReaderTypes.ts"

Cohesion: 0.13
Nodes (25): ADR-081: Skip Wire-Shape Parity for the Reader IPC Payloads, Consequence, Context, Decision, Reasoning, BookReaderProps, EncodingPrompt(), EncodingPromptProps (+17 more)

### Community 52 - "Detailed Optimization Tracking"

Cohesion: 0.12
Nodes (16): Detailed Optimization Tracking, ⏸️ Task #10: Optimize Memory Cleanup (Opportunity #10), ✅ Task #11: Performance Benchmarking Infrastructure, ⏸️ Task #1: Fix WASM Boundary Type Safety (Critical #1), ✅ Task #2: Optimize WASM JSON Serialization (High-Impact #5), ✅ Task #3: Migrate String Operations to Rust WASM (Critical #2), ✅ Task #5: Apply TypeScript ReadonlyArray Optimizations (High-Impact #4), ✅ Task #6: Migrate Regex to Rust (High-Impact #6) (+8 more)

### Community 53 - "useReaderPanel.ts"

Cohesion: 0.24
Nodes (10): @tanstack/react-virtual, OVERSCAN_ROWS, useReaderPanel(), UseReaderPanelOptions, FollowerGeometryProps, PanelGeometryProps, ReaderPanels, UseReaderPanelsOptions (+2 more)

### Community 54 - "TranslationEngine"

Cohesion: 0.10
Nodes (15): Decision, Addendum (2026-09-26), ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface, Context, Decision, If App Callers Are Added, Reason, ADR-032: Delete PerformanceBaselineTracker's cacheHitRate Machinery (+7 more)

### Community 55 - "ErrorBoundary"

Cohesion: 0.14
Nodes (5): react-dom, ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, clearPanelLayoutStorage()

### Community 56 - "Code Review Fixes - February 1, 2026"

Cohesion: 0.05
Nodes (37): compilerOptions, allowJs, allowSyntheticDefaultImports, alwaysStrict, checkJs, emitDecoratorMetadata, esModuleInterop, experimentalDecorators (+29 more)

### Community 57 - "App.jsx"

Cohesion: 0.20
Nodes (12): Decision, EngineAccess, App(), AppContent(), EngineProvider(), setGlobalToast(), ToastProvider(), useToast() (+4 more)

### Community 58 - "PatternTemplateEngine"

Cohesion: 0.07
Nodes (32): 2026-01-31 - Session 1 (Infrastructure + Analysis), Architectural Constraints (from CLAUDE.md):, Baseline Measurements (Before Optimizations), Development Tools:, Documentation:, For Each Optimization:, Future Optimization Ideas:, Key Learnings: (+24 more)

### Community 59 - "sanitize_io_error"

Cohesion: 0.24
Nodes (9): export_dictionaries_impl(), read_zip_entries(), sanitize_io_error(), test_export_empty_directory_produces_empty_zip(), test_export_errors_when_dictionary_dir_missing(), test_export_skips_non_json_files(), test_export_writes_all_json_files_into_zip(), test_response_ok_with_message_sets_message_field() (+1 more)

### Community 60 - "wasm_boundary.rs"

Cohesion: 0.16
Nodes (9): PatternIndex, test_clear_index(), test_get_all_patterns(), test_get_nonexistent_pattern(), test_index_literal_starting_pattern(), test_index_mixed_patterns(), test_index_multiple_patterns_same_first_token(), test_index_variable_starting_pattern() (+1 more)

### Community 61 - "OptimizationBenchmarks"

Cohesion: 0.08
Nodes (24): 1. Documentation Improvements, 1. `src/utils/TranslationEngine.js`, 1. Understanding Code Flow is Critical, 2. Add Execution Path Diagrams, 2. `src/utils/PunctuationProcessor.ts`, 2. Understanding When Functions Are Called, 3. Lightweight Always-On Logging, 3. `src/utils/TextChunker.js` (+16 more)

### Community 62 - "DictionaryTrie"

Cohesion: 0.07
Nodes (30): ADR-017: Skip WasmMemoryPool Analytics Separation, Consequence, Context, Decision, Reasoning, Addendum — 2026-08-26: "Production builds its trie once and reuses it" was false, ADR-075: Delete the Persisted Trie Cache, Consequences (+22 more)

### Community 63 - "Phase 8 Tests - Pattern Matching Validation"

Cohesion: 0.09
Nodes (21): app, security, windows, withGlobalTauri, enable, build, beforeBuildCommand, beforeDevCommand (+13 more)

### Community 64 - "TranslatorDisplayPanels.tsx"

Cohesion: 0.14
Nodes (12): react-resizable-panels, TranslatorDisplayPanelsProps, ClickableOriginalSemanticProps, ClickableTranslationOptimizedProps, ClickableTranslationSemanticProps, ClickDirection, SegmentClickHandler, SegmentClickPayload (+4 more)

### Community 65 - "EnhancedVirtualizedDictionaryTable.tsx"

Cohesion: 0.08
Nodes (39): ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`, Alternatives Rejected, Consequences, Context, Decision, Dictionary table view, react, State Ownership — Not in `EnhancedVirtualizedDictionaryTable` (EVDT) or `VirtualRowComponent` (+31 more)

### Community 67 - "lru_cache.rs"

Cohesion: 0.13
Nodes (15): a_get_protects_an_entry_from_eviction(), a_miss_leaves_no_trace(), a_poisoned_lock_is_reported_once_cleared_and_usable_again(), cache(), evicts_the_least_recently_set_entry(), get_misses_then_hits_after_set(), Inner, Inner<K, V> (+7 more)

### Community 68 - "WindowFiller"

Cohesion: 0.16
Nodes (6): Before asserting, Window Filler, countVisibleLines(), orderChunksByDistance(), FillEngineCalls, WindowFiller

### Community 69 - "processTokensWasm"

Cohesion: 0.21
Nodes (12): Alternative 1: Restore JS fallback in `TwoPhasePatternProcessor` ✗ Rejected, Alternative 2: Extract `WasmPatternBridge` seam ✗ Rejected, Alternative 3: Throw on `{ success: false }`, no bridge ✅ Selected, Alternatives Considered, Decision Drivers, ADR-070: Skip a Shared WASM-Call-or-Fallback Shell; Delete the Unread Wrapper Stats, Consequence, Context (+4 more)

### Community 70 - "default.json"

Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 71 - "useHotkeyHandler.ts"

Cohesion: 0.14
Nodes (17): ADR-0012, File: `src/components/TabbedInterface.tsx`, File: `src/hooks/useDictionaryModals.js`, File: `src/hooks/useHotkeyHandler.ts`, File: `src/utils/ui/HotkeyDispatchTable.ts`, Phase 6 — Hotkeys [Small], HotkeyHandlerOptions, isEditableTarget() (+9 more)

### Community 72 - "mod.rs"

Cohesion: 0.16
Nodes (12): DEFAULT_MAX_VARIABLE_SPAN, PatternMatcher, test_full_dictionary_parsing(), test_parse_and_index_workflow(), test_priority_ordering(), parse_patterns_dict(), test_parse_multi_variable_pattern(), test_parse_pattern_with_repeated_variable() (+4 more)

### Community 73 - "SemanticTypes.ts"

Cohesion: 0.14
Nodes (9): ChunkPostProcessor, punctuationProcessor, SpacingToken, ChunkPostProcessor, PunctuationProcessor, SpecialPattern, QUOTE_CATEGORIES, QUOTE_TYPES (+1 more)

### Community 74 - "TranslationChunkCache"

Cohesion: 0.19
Nodes (4): Context, TranslationChunkCache, chunkText(), fillPlan()

### Community 75 - "useDeferredRetranslate"

Cohesion: 0.27
Nodes (8): ADR-085: EngineAccess — one queue for both tabs, ownership follows the visible tab, Alternatives considered, Consequences, Context, DeferredRetranslate, useDeferredRetranslate(), UseDeferredRetranslateOptions, createReaderEngine()

### Community 76 - "precomputeOriginalSegments"

Cohesion: 0.18
Nodes (14): Addendum (2026-08-25): Extending the decision to `segmentFromPositionMetadata` vs `precomputeOriginalSegments`, Addendum (2026-08-25): `precomputeSegments` deleted — this ADR's original subject no longer exists, Addendum (2026-10-09): what reaches the fast path, measured (architecture review round 23, candidate #4 grilling), ADR-036: Skip Unifying `precomputeSegments`/`precomputeOriginalSegments` Into a Shared Scanner, Consequence, Context, Decision, Reasoning (+6 more)

### Community 77 - "TextTokenizer.ts"

Cohesion: 0.07
Nodes (29): Dictionary match lookup, ADR-0087, ADR-0108, ComparableMatch, compareMatchesBySpecificityThenPriority(), ADR-0010, GroupedToken, HAN_TEST (+21 more)

### Community 78 - "pattern_matching.rs"

Cohesion: 0.35
Nodes (7): bench_large_token_array(), bench_pattern_competition(), bench_phase_a_processing(), bench_single_pattern_match(), bench_two_phase_processing(), create_token(), find_best_pattern_match()

### Community 79 - "usePerformanceMonitoring.js"

Cohesion: 0.38
Nodes (4): ADR-0069, Context, installDevConsole(), globalPerformanceMonitor

### Community 80 - "TranslationEngineTypes.d.ts"

Cohesion: 0.06
Nodes (21): Context, AssertTrue, EngineInterfaceMembersExistOnTheClass, PatternProcessingOptions, PatternProcessorAdapter, ADR-0101, BatchCompleteEvent, ProperNounSource (+13 more)

### Community 81 - "NumberProcessor"

Cohesion: 0.07
Nodes (26): Addendum 2026-10-07: the spec now runs a shared fixture, ADR-041: Keep `number_processor.rs` — It's a Parity Spec, Not Dead Code, Consequence, Context, Decision, Reasoning, ADR-047: Skip a Numeral-Value Interface on NumberProcessor, Consequence (+18 more)

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

Cohesion: 0.14
Nodes (20): ADR-0003, Context, Addendum — 2026-10-24: `isTranslatingRef` param removed, ADR-084: Skip Merging the Reload Context Assembler Into useForceReload, Consequence, Context, Decision, Reasoning (+12 more)

### Community 87 - "useColumnMetrics.ts"

Cohesion: 0.31
Nodes (7): ADR-0024, useAppearanceVersion(), ColumnMetrics, useColumnMetrics(), Cross-panel sync is line-indexed and one-way, CssLengthContext, cssLengthToPx()

### Community 88 - "DictionaryEdit.ts"

Cohesion: 0.08
Nodes (50): Addendum (2026-10-03), ADR-026: Do Not Move useDictionaryCRUD to src/hooks/, Context, Decision, Reason, Supersession Note (2026-06-27), When to Revisit, Addendum (2026-10-24) (+42 more)

### Community 89 - "Background"

Cohesion: 0.25
Nodes (8): a_sidecar_is_the_sorted_hashes_of_the_books_frequent_strings_and_is_deterministic(), Background, background_of(), build_sidecar(), run_with_background(), string_hash(), the_spread_gate_drops_a_string_frequent_in_three_other_books_and_keeps_one_in_two(), with_fewer_than_four_other_books_the_spread_gate_is_skipped()

### Community 90 - "Design"

Cohesion: 0.22
Nodes (8): Column header, Design, Design: Semantic Column in Patterns Dictionary Table, Files Touched, No new components, Problem, Row cell, Width adjustment

### Community 91 - "ReaderTab.tsx"

Cohesion: 0.08
Nodes (44): ADR-046: Keep `BookReader`'s Master-Scroll Composition and Refill Ref, Consequence, Context, Decision, Reasoning, ADR-050: One BookReader Instance per Book, Consequence, Context (+36 more)

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

Cohesion: 0.10
Nodes (30): ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods, Context, Decision, Reason, When to Revisit, DictionaryEntryForm, DictionaryEntry(), EntryForm (+22 more)

### Community 99 - "Domain Glossary"

Cohesion: 0.08
Nodes (18): Fallow Dead-Code Analysis, Book Loading, Dictionary pair, DictionaryBackend, DictionaryListOrganizer, Domain Glossary, emptySemanticArrays, Memory signals on macOS (+10 more)

### Community 101 - "DictionaryCache"

Cohesion: 0.12
Nodes (19): DictionaryCache, get_cache_key(), load_dictionary_file(), LoadFailure, Invalid, InvalidJson, Io, Rejected (+11 more)

### Community 102 - "SemanticArrayMetadata"

Cohesion: 0.33
Nodes (6): ADR-094: Delete the Write-Only Unit Provenance Fields, Consequence, Context, Decision, Reasoning, SemanticArrayMetadata

### Community 103 - "WasmSharedModule.js"

Cohesion: 0.32
Nodes (5): _handlers, registerCascadeHandler(), ADR-0009, load(), _WASM_BINARY_URL

### Community 105 - "TranslationWindow.ts"

Cohesion: 0.13
Nodes (21): BandGeometry, CHUNK_CEILING_CHARS, CHUNK_TARGET_CHARS, ChunkPlanOptions, clamp(), clampRange(), computeBands(), FETCH_VIEWPORTS (+13 more)

### Community 106 - "TokenClaim.ts"

Cohesion: 0.07
Nodes (45): ADR-0006, ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name, Consequences, Context, Decision, Reason, ADR-109: A Match Is Placed as One Claim and One Unit, Consequence (+37 more)

### Community 107 - "CandidateFinderStore"

Cohesion: 0.12
Nodes (10): BackgroundBook, CandidateProgress, CandidateStage, FinderDictionaries, CandidateFinderInputs, CandidateFinderStore, FinderBackground, IDLE (+2 more)

### Community 108 - "ElectronTypes.d.ts"

Cohesion: 0.16
Nodes (16): Files, Phase 2 — tauriAPI Bindings [Small], tauriAPI, AppearanceResult, BatchDictionaryResponse, BatchDictionaryResult, BookRecordsResult, ConfigurationResult (+8 more)

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

### Community 113 - "Security Mitigations"

Cohesion: 0.29
Nodes (7): 1. ✅ Local-Only WASM Loading (CRITICAL), 2. Binary hashing and module-structure checks: removed (2026-10-06, ADR-080), 4. ✅ Instance Method Verification, 5. ✅ Graceful Degradation, 6. ✅ Retry Logic with Exponential Backoff, 7. ✅ No Dynamic WASM Loading, Security Mitigations

### Community 114 - "ADR-089: The Character-Only Pass Leaves Punctuation Alone"

Cohesion: 0.33
Nodes (5): ADR-089: The Character-Only Pass Leaves Punctuation Alone, Consequence, Context, Decision, Reasoning

### Community 115 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.12
Nodes (16): ADR-002: Dual-Path Clickable Highlighting Architecture, Alternative 1: Consolidate Into Unified Highlighting System, Alternative 2: Keep Separate Paths (Current Implementation) ✅ SELECTED, Alternative 3: Partial Consolidation (Helper Functions), Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 116 - "Translator.jsx"

Cohesion: 0.09
Nodes (28): Update (2026-07-28), Addendum — 2026-10-24: `isTranslatingRef` deleted too, @tauri-apps/api, ADR-0105, TOAST_DURATIONS, TOAST_IDS, ToastDuration, ToastId (+20 more)

### Community 117 - "EngineAccess.ts"

Cohesion: 0.19
Nodes (7): EngineContextValue, EngineInitOutcome, createEngineAccess(), EngineAccess, EngineOwner, EngineRunOptions, Entry

### Community 118 - "useDictionaryConfigManagement.ts"

Cohesion: 0.22
Nodes (8): Addendum — 2026-10-11, ADR-096: Keep the WASM Pattern Processor; Measured, Consequence, Context, Decision, Findings, not fixed here, Measurement, Reasoning

### Community 119 - "useHotkeyHandler"

Cohesion: 0.11
Nodes (21): Addendum (2026-09-26): the revisit trigger fired — answered with ownership, not a registry, Addendum (2026-09-28): handlers keyed by action type — still not a registry, ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler, Alternative 1: Full HotkeyRegistry ✗ Rejected, Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected, Alternative 3: Keep useHotkeyHandler ✅ Selected, Alternatives Considered, Context and Problem Statement (+13 more)

### Community 120 - "TextChunker"

Cohesion: 0.07
Nodes (25): ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable, Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected, Alternative 2: Keep coordination in TranslationEngine ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Update (2026-10-03) (+17 more)

### Community 121 - "ElectronTypes.d.ts"

Cohesion: 0.12
Nodes (15): Addendum (2026-10-20), ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext, Alternative 1: Move cache invalidation to `DictionaryContext` ✗ Rejected, Alternative 2: Keep invalidation in `handleForceReload` ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+7 more)

### Community 122 - "ReadingAnchor.ts"

Cohesion: 0.17
Nodes (13): UseReadingAnchorOptions, registerPendingPositionFlush(), AnchorVirtualizer, computeAnchor(), DEFAULT_VIEWPORT_LINES, DETACHED_INPUTS, isAnchorInPlace(), MODIFIER_KEYS (+5 more)

### Community 124 - "jsdom"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-13): no debounce, validation derived — decision unchanged, ADR-039: Skip Splitting `useDictionaryEntryForm`, Consequence, Context, Decision, Reasoning

### Community 125 - "Development Guide"

Cohesion: 0.33
Nodes (6): CI/CD Pipeline, Development Debugging Tools, Development Guide, Gotchas Reference, Production Build Requirements, Related Guides

### Community 126 - "ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-20), ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider, Consequence, Context, Decision, Reasoning

### Community 127 - "Progress"

Cohesion: 0.29
Nodes (7): Reporter, Stage, BackgroundTable, Counting, stage_range(), Reading, Scoring

### Community 128 - "useAppearanceSettings"

Cohesion: 0.14
Nodes (26): ADR-024: Do Not Move Style Objects into useAppearanceSettings, Context, Decision, Reason, Revisit condition, AppearanceConfig, AppearanceSettings (hook), AppearanceManager() (+18 more)

### Community 129 - "TranslatorControls.tsx"

Cohesion: 0.12
Nodes (15): ADR-018: Unified PerformanceReport State in usePerformanceMonitoring, Consequence, Context, Reasoning, Addendum — 2026-07-17d: Cluster deleted, not fixed, ADR-069: Delete the Baseline Regression Detector, Consequences, Context (+7 more)

### Community 130 - "Design"

Cohesion: 0.13
Nodes (14): ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential, Consequences, Context and Problem Statement, Decision, If Startup Latency Becomes a Problem, Implementation, Monitoring and Review, Negative (+6 more)

### Community 131 - "V8OptimizationTypes.d.ts"

Cohesion: 0.13
Nodes (14): ADR-005: Eager Dictionary Loading via DictionaryContext, Alternative 1: Complete the LazyDictionaryContext migration ✗ Rejected, Alternative 2: Keep eager loading, delete LazyDictionaryContext ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+6 more)

### Community 132 - "useChapters.ts"

Cohesion: 0.09
Nodes (33): ADR-045: Skip a Shared Chapter-Structure Override Control, Consequence, Context, Decision, Reasoning, ADR-099: Skip a Chapter-Outline Record Helper, Consequence, Context (+25 more)

### Community 133 - "useStreamingTranslation"

Cohesion: 0.11
Nodes (23): ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation, Consequence, Context, Decision, Reasoning, What Was Done Instead, ADR-022: Keep streamingReducer and Initial State Constants Exported, Boundary Condition (+15 more)

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

Cohesion: 0.25
Nodes (8): Detailed Fix Descriptions, Fix 5: MEDIUM-1 - Add dispose() to TranslationCache, Fix 6: Update DictionaryManager to use TranslationCache.dispose(), Impact, Impact, Problem, Solution, Solution

### Community 138 - "LineSegments.ts"

Cohesion: 0.19
Nodes (24): Reader Panels, ReaderHighlight, assembleTranslatedLines(), chunkLinePieces(), ChunkLineRange, chunkLineRanges(), linePieceCache, linePieces() (+16 more)

### Community 141 - "DictionaryEdit.ts"

Cohesion: 0.04
Nodes (85): ADR-0014, Addendum 2026-09-29, Addendum 2026-10-04, ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider, Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected, Alternative 2: Extract loadInitialState only ✓ Accepted, Alternatives Considered, Consequences (+77 more)

### Community 142 - "wasm-core"

Cohesion: 0.12
Nodes (13): ADR-0037, Addendum (2026-09-09) — Gap Closed, ADR-037: Delete Orphaned WASM Boundary Validators, Keep `validateWasmDictionaryMatch`, Context, Decision, Reasoning, isPatternMatchInBounds(), Build profile, dev binary, and WASM-only panics (+5 more)

### Community 143 - "package.json"

Cohesion: 0.06
Nodes (33): name, packageManager, private, type, version, eslint, eslint-config-prettier, @eslint/js (+25 more)

### Community 144 - "ComponentTypes.d.ts"

Cohesion: 0.20
Nodes (8): `DictionaryInfo` Name Collision, AppConfiguration, DictionaryInfo, DictionaryTypeDefinition, DictionaryTypesCollection, FontSettings, TabId, Theme

### Community 145 - "ADR-011: Skip useTranslatorSession Coordinator Hook"

Cohesion: 0.14
Nodes (13): Addendum (2026-10-10), ADR-011: Skip useTranslatorSession Coordinator Hook, Alternative 1: Extract useTranslatorSession ✗ Rejected, Alternative 2: Keep coordination in Translator.jsx ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+5 more)

### Community 146 - "real_dictionary_profile.rs"

Cohesion: 0.29
Nodes (6): bench_real_dictionary_chunks(), bench_variable_pattern_clone(), create_token(), default_patterns_path(), load_processor(), tokens_from()

### Community 147 - "TransformRuleEngine.ts"

Cohesion: 0.18
Nodes (22): ADR-038: Reject "Deepen RuleMatchesModal to Preview Real Output", Consequence, Decision, Reasoning, Transform Rule, applyRule(), compareRulePrecedence(), defaultSemanticType() (+14 more)

### Community 148 - ".applyPatterns"

Cohesion: 0.13
Nodes (18): Addendum (2026-10-12, architecture review round 32, candidate #4), ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation, Alternative 1: Keep inline mutation per adapter ✗ Rejected, Alternative 2: Return results, single apply site ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+10 more)

### Community 149 - "PanelRows.ts"

Cohesion: 0.16
Nodes (18): ReaderPanelProps, WindowedTranslation, LinePiece, fillSegmentGapsCached(), ReaderSegment, EMPTY_PANEL_ROWS, Panel, PanelRow (+10 more)

### Community 150 - "snapshotSemanticArrays"

Cohesion: 0.26
Nodes (10): Addendum (2026-10-12), ADR-100: Delete the Progressive Metadata Pad, Consequence, Context, Decision, Reasoning, ADR-105: One Batch Event for a Progressive Run, Consequence (+2 more)

### Community 151 - "ReaderPanel.tsx"

Cohesion: 0.36
Nodes (7): isLit(), PanelVariant, ReaderPanelInner(), SegmentedLine, segmentTitle(), titleCache, VARIANT_CLASS

### Community 152 - "appearanceConfig.ts"

Cohesion: 0.31
Nodes (9): appearanceFile, DEFAULT_APPEARANCE, fromRaw(), fromRawFontSettings(), fromRawUiFont(), isTheme(), LEGACY_LETTER_SPACINGS, normalizeLetterSpacing() (+1 more)

### Community 153 - "Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries"

Cohesion: 0.50
Nodes (4): Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries(), Impact, Problem, Solution

### Community 154 - "TranslationEngine"

Cohesion: 0.15
Nodes (12): Addendum — 2026-10-11, Addendum — 2026-10-21, ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error, Consequences, Context and Problem Statement, Critical Invariants, Decision, Negative (+4 more)

### Community 155 - "Performance Impact"

Cohesion: 0.50
Nodes (4): GC Pressure Reduction, Memory Leak Elimination, Performance Impact, User-Visible Benefits

### Community 156 - "useCandidateFinder.ts"

Cohesion: 0.06
Nodes (67): Addendum 2026-10-26: pattern coverage is applied when the run lands, Candidate finder, `SemanticType` Canonical Values, SemanticTypePickerProps, CandidateContextLines(), CandidateFinderPanelProps, CandidateList(), CandidateReading (+59 more)

### Community 157 - "useDictionaryModals.tsx"

Cohesion: 0.12
Nodes (21): Dictionary id order is the disk's, not sorted, DictionaryEntryProps, CLOSED, DictionaryModals, DictionaryModalsOptions, OpenQuickAdd, QuickAddModalState, sharedShortlistMemory (+13 more)

### Community 158 - "dictionary/index.ts"

Cohesion: 0.16
Nodes (16): MoveDialog, DictionaryManager(), DictionaryManagerProps, ADR-0005, dictionaryOptionLabel(), DuplicateDictionaryTableViewProps, HotkeyHandler(), useEntrySelection() (+8 more)

### Community 159 - "useDictionaryConfigManagement.ts"

Cohesion: 0.13
Nodes (20): ADR-059: A Configuration Toggle Is Computed Under the Config Lock, Not on the Binding Queue, Consequence, Reasoning, Consequence, ADR-103: Keep the Default-Dictionary Toggle and the Name Step in the Config Hook, Consequence, Context, Decision (+12 more)

### Community 160 - "ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader"

Cohesion: 0.22
Nodes (8): Addendum (2026-10-10, architecture review round 24, candidate #1), Addendum (2026-10-12, architecture review round 32, candidate #3), ADR-087: Phase 5 Is a Point Lookup, Not a MatchSource Reader, Consequence, Context, Decision, Not done, Reasoning

### Community 161 - "WasmPatternProcessor.js"

Cohesion: 0.13
Nodes (12): ADR-0007, MAX_INPUT_TOKENS, MEMORY_MANAGEMENT, PATTERN_FAILURE_DETECTION, PHASE_TIMEOUTS, UI_TIMEOUTS, ADR-0101, ADR-0101 (+4 more)

### Community 162 - "logger"

Cohesion: 0.09
Nodes (19): ADR-093: Skip a Dictionary-Tab Action Runner, Consequence, Context, Decision, Reasoning, Logging, Mock mechanics, ModalErrorBoundaryProps (+11 more)

### Community 163 - "ADR-004: 5-Phase Processing Order Immutability"

Cohesion: 0.12
Nodes (16): ADR-004: 5-Phase Processing Order Immutability, Alternative 1: Reorder Phases for Performance, Alternative 2: Parallel Processing (All Phases Simultaneously), Alternative 3: Keep Current Sequential Order (Patterns First) ✅ SELECTED, Alternatives Considered, Architectural Implications, Consequences, Context and Problem Statement (+8 more)

### Community 164 - "matchWordSegments"

Cohesion: 0.43
Nodes (5): CandidateWord, matchWordSegments(), WordSegmentSemanticArrays, glossParts(), MAX_CONTEXT_CHARS

### Community 165 - "KeySet"

Cohesion: 0.36
Nodes (7): KeySet, keyset(), line_mask_spans(), longest_key_at(), mask_spans(), mask_spans_match_the_shared_fixture(), unmasked_pieces()

### Community 166 - "SemanticArrayBuilder"

Cohesion: 0.05
Nodes (53): ADR-0100, Initial Assumptions (All Wrong), Execution Paths (Full Translation vs Character-only), Related Guides, Semantic Arrays (Clickable Highlighting), System Architecture, Token Processing Contracts (WASM-JavaScript Boundaries), WASM/JS Lookup Parity (+45 more)

### Community 167 - "Translator"

Cohesion: 0.15
Nodes (13): AppReadinessOverlay(), AppReadinessOverlayProps, pickStatus(), stageClass(), stageIcon(), StageStatus, Translator(), registerDictionaryReload() (+5 more)

### Community 168 - "High-Priority Issues 🟠"

Cohesion: 0.20
Nodes (9): Category 1: Future Integration APIs (18 warnings), Category 3: Dead Code from Earlier Phases (3 warnings), Compilation Warnings - Explained, Current Status, Fixed Warnings (7 total), Remaining Warnings (29 total) - All Expected, Summary, When Will These Warnings Go Away? (+1 more)

### Community 170 - "wasm-core Pattern Processor"

Cohesion: 0.20
Nodes (9): Constraints, Design, Design: Semantic Type for Structural Pattern Entries, Files Touched, Problem, Section 1 — Data Model, Section 2 — Translation Engine: WASM (primary fix), Section 3 — Translation Engine: JS cross-pass fix (+1 more)

### Community 171 - "DictionaryTableView.tsx"

Cohesion: 0.07
Nodes (63): Context, Key locations in `EnhancedVirtualizedDictionaryTable.tsx`, DictionaryColumnSchema, Moving Entries — One Rule, Three Enforcement Points, Reusable Row/Badge Building Blocks — `TableBuildingBlocks.tsx`, `VirtualRowComponent` Is at Module Scope, DictionaryTableView(), getHeaderColumns() (+55 more)

### Community 172 - "ADR-048: Generic Proper-Noun Dictionaries Get Paired Pattern Dictionaries Too"

Cohesion: 0.33
Nodes (5): ADR-048: Generic Proper-Noun Dictionaries Get Paired Pattern Dictionaries Too, Consequences, Context, Decision, Reason

### Community 173 - "ADR-098: Pattern Result Indices Are Original Indices"

Cohesion: 0.33
Nodes (5): ADR-098: Pattern Result Indices Are Original Indices, Consequence, Context, Decision, Reasoning

### Community 174 - "context_lines"

Cohesion: 0.33
Nodes (5): context_lines(), context_lines_of_a_string_the_book_lacks_are_empty(), context_lines_return_the_first_lines_holding_the_text_with_their_file_numbers(), ContextLine, ContextLines

### Community 175 - "ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup)"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-20, architecture review round 34, candidate #3), ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup), Consequence, Context, Decision, Reasoning

### Community 176 - "ADR-053: Unread Dictionaries Are Refused, Not Quarantined"

Cohesion: 0.33
Nodes (5): ADR-053: Unread Dictionaries Are Refused, Not Quarantined, Alternatives considered, Consequence, Decision, Reasoning

### Community 177 - "ADR-067: Keep Pair Operations in the Binding Store"

Cohesion: 0.40
Nodes (4): ADR-067: Keep Pair Operations in the Binding Store, Consequence, Decision, Reasoning

### Community 178 - "AI Readiness Evaluation: chinese-translator-tauri"

Cohesion: 0.22
Nodes (8): ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline, Alternative 1: Extract to `TokenStringCache.ts` with DI ✗ Rejected, Alternative 2: Keep inline ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Supersession Note (2026-07-28)

### Community 179 - "WindowedTranslationFill.ts"

Cohesion: 0.41
Nodes (8): UseCandidateReadingOptions, ADR-0050, UseWindowedTranslationOptions, EngineCall, ReaderEngineCalls, ChunkTranslationResult, FillEvent, GlossResult

### Community 180 - "ADR-068: One LRU Module Under Both Dictionary Caches"

Cohesion: 0.33
Nodes (5): ADR-068: One LRU Module Under Both Dictionary Caches, Consequence, Context, Decision, Reasoning

### Community 182 - "ADR-083: Delete the WASM Conflict Resolution Tier"

Cohesion: 0.40
Nodes (4): ADR-083: Delete the WASM Conflict Resolution Tier, Context, Decision, Reasoning

### Community 183 - "ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage"

Cohesion: 0.25
Nodes (7): ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage, Consequence, Context, Decision, Reasoning, Update (2026-08-25), Update (2026-09-08)

### Community 184 - "ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline"

Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 185 - "ADR-095: Highlight State Is One Lit Unit"

Cohesion: 0.40
Nodes (4): ADR-095: Highlight State Is One Lit Unit, Consequence, Context, Reasoning

### Community 186 - "ADR-104: No Shared Fake for One-Shot IPC in Tests"

Cohesion: 0.40
Nodes (4): ADR-104: No Shared Fake for One-Shot IPC in Tests, Consequence, Context, Decision

### Community 187 - "ConfigurationManager.tsx"

Cohesion: 0.21
Nodes (10): ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init, Consequences, Context, Decision, Reason, ConfigurationManager(), TierMenu(), TierMenuProps (+2 more)

### Community 188 - "ReconcileLibrary.ts"

Cohesion: 0.08
Nodes (37): ADR-061: Skip a Shelf Row Module, Consequence, Context, Decision, Reasoning, Book Records, Bookshelf(), BookshelfProps (+29 more)

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

### Community 196 - "Failed Patterns (Avoid)"

Cohesion: 0.40
Nodes (5): Architectural restructuring, Failed Patterns (Avoid), Speculative optimization without profiling, WASM full 5-phase engine attempt (Phase 6-7, 2024), WASM pattern matching success (January 2025)

### Community 197 - "ADR-108: Delete the Rust Lookup Index"

Cohesion: 0.25
Nodes (7): Addendum 2026-10-24: Phase 4 reads through the seam too, ADR-108: Delete the Rust Lookup Index, Consequences, Context, Decision, Evidence, Revisit

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

Cohesion: 0.32
Nodes (7): TranslatedChunk, PositionedSegment, SegmentedChunk, CachedChunk, DEFAULT_CHUNK_CACHE_CAPACITY, ChunkPlan, LineRange

### Community 202 - "adr/README.md"

Cohesion: 0.16
Nodes (7): ADR-065: Keep Dictionary Reload Owned by the Translator, Behind the Registry, Consequence, Decision, Reasoning, ADR-102: Keep `utils/toast` as the Notification Seam, Consequence, Context

### Community 203 - "useDictionaryModals"

Cohesion: 0.18
Nodes (12): ADR-051: The Reader's Quick-Add Is the Shared Add Form, Not a Floating Bar, Consequence, Context, Decision, Reasoning, File: `src/components/Translator.jsx`, Key Risks, Reader Commands (+4 more)

### Community 204 - "Consequences"

Cohesion: 0.50
Nodes (4): Consequences, Negative, Positive, When to Revisit

### Community 205 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Behaviour, Change, Design, Design: Semantic Type Filter for Structural Patterns, Files Touched, Problem

### Community 206 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Chinese-Vietnamese Translator — Dev Memory, Comprehensive architecture code review — 14 issues fixed, Fixes Done (2026-02-22, session 19), Key Architectural Invariants (most frequently violated), Session History Index, Stable Project Facts

### Community 208 - "ADR-097: Number Variables Have Their Own Span"

Cohesion: 0.33
Nodes (5): ADR-097: Number Variables Have Their Own Span, Consequence, Context, Decision, Reasoning

### Community 209 - "Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries"

Cohesion: 0.50
Nodes (4): Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries, Impact, Problem, Solution

### Community 210 - "ADR-111: Candidate Finder Design"

Cohesion: 0.33
Nodes (5): Addendum 2026-11-08: panel views are by rank, and open on Top 250, ADR-111: Candidate Finder Design, Considered options, Context, Measured (#52)

### Community 211 - "Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup"

Cohesion: 0.50
Nodes (4): Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup, Impact, Problem, Solution

### Community 212 - "Future Improvements"

Cohesion: 0.67
Nodes (3): Future Improvements, Long Term, Short Term

### Community 213 - "Verification Checklist"

Cohesion: 0.67
Nodes (3): Manual Verification Completed, Testing Required, Verification Checklist

### Community 225 - "ADR-061: Skip a Shelf Row Module"

Cohesion: 0.17
Nodes (18): ADR-0036, CharacterOnlyBridge, Click-to-Highlight Lifecycle, WordSegmentMatcher, useHighlightInteraction(), UseHighlightInteractionOptions, UseHighlightInteractionResult, findCharacterOnlyMatch() (+10 more)

### Community 234 - "ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider"

Cohesion: 0.33
Nodes (5): ADR-040: Reject Aho-Corasick as a Swap for the Native Lookup-Index Trie, Consequence, Context, Decision, Reasoning

### Community 235 - "ADR-031: Skip Splitting dictionary_commands.rs by Concern"

Cohesion: 0.33
Nodes (5): ADR-031: Skip Splitting dictionary_commands.rs by Concern, Consequence, Context, Decision, Reasoning

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

Cohesion: 0.16
Nodes (26): ADR-056: Skip a Rule-Draft Module, Consequence, Context, Decision, Reasoning, NewRuleModal(), MAX_TRANSFORM_RULE_KEY_LENGTH, TransformRuleMatchKind (+18 more)

### Community 302 - "Keyboard Shortcuts"

Cohesion: 0.40
Nodes (5): Dictionary tab, Global (any tab), Keyboard Shortcuts, Reader tab, Translator tab

### Community 343 - "Documentation Index"

Cohesion: 0.40
Nodes (5): Archive, Decisions, Documentation Index, Guides, Reference

## Knowledge Gaps

- **169 isolated node(s):** `@tauri-apps/plugin-clipboard-manager`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-shell`, `@eslint/js` (+164 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1539 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **53 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Historical / Deleted {#deleted-symbols}` connect `DictionaryTrie` to `TranslatorControls.tsx`, `ReadingAnchor`, `useStreamingTranslation`, `useTranslatorEngine`, `usePanelSync.ts`, `hasPairedPatterns`, `useTransformRules.ts`, `DictionaryContext.tsx`, `DictionaryEdit.ts`, `Content Security Policy (CSP) and WASM Security`, `WasmProcessorLifecycle`, `TransformRuleEngine.ts`, `PanelRows.ts`, `TranslationEngine`, `snapshotSemanticArrays`, `appearanceConfig.ts`, `BookRecordsBackend.ts`, `TranslationEngine`, `useCandidateFinder.ts`, `useDictionaryModals.tsx`, `dictionary/index.ts`, `useDictionaryConfigManagement.ts`, `PatternStore.js`, `SemanticToken`, `logger`, `Verifying Claims Before Acting`, `matchWordSegments`, `react`, `SemanticArrayBuilder`, `TranslationRunner.ts`, `7. Clickable Highlighting Feature Analysis`, `RulesManager.tsx`, `DictionaryTableView.tsx`, `createAppFile`, `ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface`, `.translateWithProgressiveBatches`, `BookBindingContext.tsx`, `DictionaryIdClassifier.ts`, `Detailed Optimization Tracking`, `useReaderPanel.ts`, `TranslationEngine`, `App.jsx`, `ReconcileLibrary.ts`, `EnhancedVirtualizedDictionaryTable.tsx`, `processTokensWasm`, `useHotkeyHandler.ts`, `TranslationChunkCache.ts`, `SemanticTypes.ts`, `useDictionaryModals`, `precomputeOriginalSegments`, `useDeferredRetranslate`, `TextTokenizer.ts`, `usePerformanceMonitoring.js`, `TranslationEngineTypes.d.ts`, `NumberProcessor`, `pattern_matching.rs`, `SelectionMapping.ts`, `useForceReload`, `useColumnMetrics.ts`, `DictionaryEdit.ts`, `ReaderTab.tsx`, `ADR-061: Skip a Shelf Row Module`, `SemanticTypePicker.tsx`, `Domain Glossary`, `WasmSharedModule.js`, `TranslationWindow.ts`, `TokenClaim.ts`, `ElectronTypes.d.ts`, `Translator.jsx`, `EngineAccess.ts`, `useHotkeyHandler`, `TextChunker`, `ReadingAnchor.ts`?**
  _High betweenness centrality (0.445) - this node is a cross-community bridge._
- **Are the 221 inferred relationships involving `Historical / Deleted {#deleted-symbols}` (e.g. with `ClickableOriginalSemantic()` and `BaseSegment`) actually correct?**
  _`Historical / Deleted {#deleted-symbols}` has 221 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@tauri-apps/plugin-clipboard-manager`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener` to the rest of the system?**
  _169 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dictionary_commands.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06298076923076923 - nodes in this community are weakly interconnected._
- **Why does `is_variable_type_allowed()` connect `SemanticToken` to `two_phase.rs`, `precomputeOriginalSegments`, `DictionaryTrie`, `matcher.rs`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `logger` (e.g. with `Historical / Deleted {#deleted-symbols}` and `graphify`) actually correct?**
  _`logger` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `temp_test_dir` be split into smaller, more focused modules?**
  _Cohesion score 0.09693877551020408 - nodes in this community are weakly interconnected._
