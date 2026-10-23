# Graph Report - chinese-translator-tauri (2026-10-24)

## Corpus Check

- 455 files · ~405,151 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 35 file(s) not represented in the graph (top: .css 25, (none) 6, .toml 1)

## Summary

- 4367 nodes · 10302 edges · 255 communities (206 shown, 49 thin omitted)
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 1713 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `ba8940b8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- dictionary_commands.rs
- temp_test_dir
- Logger
- chapter_outline_commands.rs
- types/DictionaryTypes.ts
- TranslationWindow.ts
- TransformRuleEngine.ts
- Performance Guide
- book_commands.rs
- Bookshelf.tsx
- react
- DictionaryEntry.tsx
- EditCommitter.ts
- useChapters.ts
- Fiction Structural Pattern Dictionaries — Implementation Plan
- App.jsx
- Content Security Policy (CSP) and WASM Security
- Historical / Deleted {#deleted-symbols}
- logger
- WindowedTranslationFill.ts
- appConfig.ts
- PatternTemplateEngine
- ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler
- Number Processing Phase - Code Review Fixes
- DictionaryTableView.tsx
- ReadingAnchor
- PerformanceMonitoringTypes.d.ts
- TextChunker
- Development Guide
- SemanticToken
- PatternProcessingTypes.d.ts
- TypeScript/Rust Optimization Progress Report
- dictionary_commands.rs
- react
- Clickable Highlighting - Code Review Fixes Summary
- useHotkeyHandler.ts
- useDictionaryCRUD.ts
- BookReader.tsx
- two_phase.rs
- lint-ratchet.mjs
- useDictionaryCRUD.ts
- EnhancedVirtualizedDictionaryTable.tsx
- DictionaryManager
- PanelRows.ts
- SemanticArrayBuilder
- ErrorBoundary
- .translateWithProgressiveBatches
- matcher.rs
- BookLinesStore
- Domain Glossary
- BookRecordsBackend.ts
- ReaderTypes.ts
- Troubleshooting Guide
- ElectronTypes.d.ts
- FormattingPasses.ts
- DictionaryIdClassifier.ts
- Code Review Fixes - February 1, 2026
- ReadingAnchor.ts
- Detailed Optimization Tracking
- sanitize_io_error
- wasm_boundary.rs
- OptimizationBenchmarks
- DictionaryTrie
- Phase 8 Tests - Pattern Matching Validation
- ComponentTypes.d.ts
- ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation
- Domain Glossary
- lru_cache.rs
- ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init
- App.jsx
- default.json
- AppearanceManager.tsx
- useReadingAnchor.ts
- SemanticTypes.ts
- src/components/dictionary — Gotchas
- DictionaryStore.ts
- precomputeOriginalSegments
- useDictionaryModals.tsx
- mod.rs
- BookRecordsBackend.ts
- TranslationEngineTypes.d.ts
- NumberProcessor
- TabbedInterface.tsx
- Value
- SelectionMapping.ts
- src-tauri/src/lib.rs
- PersistTimeValidator.ts
- useColumnMetrics.ts
- useAppearanceSettings.ts
- Development Guide
- BookReader.tsx
- appearanceConfig.ts
- MemoryLeakDetector
- DictionaryTrieLoader.js
- ADR-092: Chapter Detection Runs Inline on the Async Runtime
- RegexUtils
- lint-staged
- DictionaryWasmLookup
- WindowedTranslationFill.ts
- .loadDictionaries
- chinese-translator-tauri
- DictionaryCache
- migrate-semantic-types.py
- Task 1: Add Semantic column to Patterns dictionary table
- translation-wasm-core
- WasmPatternProcessor.js
- Translator
- TokenHelpers.ts
- AppReadinessOverlay.tsx
- dependencies
- usePerformanceMonitoring.js
- SemanticPatternProcessor
- LRUCache
- TwoPhasePatternProcessor.js
- ADR-089: The Character-Only Pass Leaves Punctuation Alone
- ADR-002: Dual-Path Clickable Highlighting Architecture
- ADR-004: 5-Phase Processing Order Immutability
- Active ADRs
- useDictionaryConfigManagement.ts
- ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory
- ADR-098: Pattern Result Indices Are Original Indices
- ElectronTypes.d.ts
- BookRecordValidation.ts
- TwoPhasePatternProcessor
- jsdom
- useStreamingTranslation
- TranslationEngine.js
- PatternStore.js
- dictionary/index.ts
- Translator.jsx
- Design
- V8OptimizationTypes.d.ts
- useTranslatorEngine
- SemanticArrayBuilder
- wasmIntegrityVerifier.js
- useDictionaryConfigManagement.ts
- BookBindingContext.tsx
- Windowed translation is four seams that must stay wired together
- LineSegments.ts
- hashmap
- DictionaryContext.tsx
- TextTokenizer
- ReaderPanel.tsx
- package.json
- real_dictionary_profile.rs
- ADR-090: Keep the tauriAPI Invoke Shell Narrow
- useReaderPanel.ts
- TextTokenizer.ts
- .applyMatchToTokens
- ADR-062: Pair Operations Share the Binding Queue, and the Configuration Tab Reads the Dictionary Store's List
- Tauri Backend + WASM Core — Gotchas
- Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup
- Detailed Fix Descriptions
- Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries
- Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup
- Performance Impact
- useReaderPanel.ts
- ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup)
- ADR-088: Skip Moving the Cache-Invalidator Registration Into EngineProvider
- Future Improvements
- Verification Checklist
- ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface
- useTransformRules.ts
- ADR-053: Unread Dictionaries Are Refused, Not Quarantined
- ADR-097: Number Variables Have Their Own Span
- Gotchas Reference
- SemanticArrayBuilder
- ADR-061: Skip a Shelf Row Module
- High-Priority Issues 🟠
- 7. Clickable Highlighting Feature Analysis
- wasm-core Pattern Processor
- ADR-104: No Shared Fake for One-Shot IPC in Tests
- ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation
- AI Readiness Evaluation: chinese-translator-tauri
- ADR-069: Delete the Baseline Regression Detector
- ReaderBinding.tsx
- text_tokenizer.rs
- ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline
- ref_types_componenttypes
- useOutlineTranslations.ts
- appFile.ts
- Integration #3: V8 Optimization for Memory Tracking (Task #8)
- DevicePerformanceDetector
- ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call
- Chinese-Vietnamese Translation App
- Chinese-Vietnamese Translation App
- TranslationProfiler
- Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear
- ADR-061: Skip a Shelf Row Module
- DictionaryManager
- ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider
- ADR-050: One BookReader Instance per Book
- adr/README.md
- ADR-010: Dictionary Match Sort — Specificity Over Provenance
- eslint-plugin-import
- Verifying Claims Before Acting
- 9. Recommendations
- tauriAPI.ts
- Security Mitigations
- DictionaryManager Types
- 📍 Code Locations Map
- ESLint Tooling
- ADR-026: Do Not Move useDictionaryCRUD to src/hooks/
- ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation
- 12. Implementation Summary (2026-02-07)
- Fix 8: BONUS - Fix method name typos in TranslationCache
- 5. State has one owner — do not re-add a local copy
- vite.config.ts
- ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init
- ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name
- src/components/rules — Gotchas
- TransformRuleValidation.ts
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
2. `react` - 108 edges
3. `logger` - 84 edges
4. `Domain Glossary` - 71 edges
5. `temp_test_dir()` - 54 edges
6. `make_cache()` - 49 edges
7. `BookReader()` - 40 edges
8. `NumberProcessor` - 40 edges
9. `useDictionary()` - 36 edges
10. `ReaderTab()` - 35 edges

## Surprising Connections (you probably didn't know these)

- `Consequence` --references--> `EngineProvider()` [INFERRED]
  docs/adr/ADR-088-skip-moving-the-cache-invalidator-registration.md → src/components/EngineContext.jsx
- `Historical / Deleted {#deleted-symbols}` --references--> `BaseSegment` [INFERRED]
  docs/guides/deleted-symbols.md → src/components/char-only/SegmentedParagraphs.tsx
- `Reason` --references--> `ConfigurationManager()` [INFERRED]
  docs/adr/ADR-027-fiction-structural-patterns-coupled-by-naming-convention.md → src/components/configuration/ConfigurationManager.tsx
- `Decision Drivers` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx
- `Neutral` --references--> `useDictionary()` [INFERRED]
  docs/adr/ADR-005-eager-dictionary-loading.md → src/components/dictionary/DictionaryContext.tsx

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **RulesManager two-surface shared field-policy group** — src_components_rules_newrulemodal_newrulemodal, src_components_rules_rulerow_rulerow, src_components_rules_rulefieldvalidation_rulefieldvalidation, src_utils_dictionary_transformruleengine_transformruleengine, src_components_rules_tests_rulefieldparity_rulefieldparity [EXTRACTED 1.00]

## Communities (255 total, 49 thin omitted)

### Community 0 - "dictionary_commands.rs"

Cohesion: 0.06
Nodes (49): CachedBook, a_book_reaching_outside_gbk_reports_gbk_but_not_strictly_clean(), a_low_confidence_report_blocks_decoding(), a_multibyte_detection_is_acted_on_without_asking(), a_plain_gbk_book_is_strictly_clean(), a_single_byte_detection_is_reported_low_confidence(), an_override_decodes_a_file_detection_refused(), BookContent (+41 more)

### Community 1 - "temp_test_dir"

Cohesion: 0.14
Nodes (39): build_test_zip(), import_dictionaries_impl(), load_dictionaries_parallel_impl(), make_cache(), rename_proper_nouns_dictionary_impl(), temp_test_dir(), test_create_structural_patterns_creates_empty_file_and_invalidates_cache(), test_create_structural_patterns_rejects_path_traversal_id() (+31 more)

### Community 2 - "Logger"

Cohesion: 0.05
Nodes (58): Case, ConversionPattern, create_conversion_patterns(), Fixture, Ignore, parse_regex!, NumberMatch, NumberProcessor (+50 more)

### Community 3 - "chapter_outline_commands.rs"

Cohesion: 0.20
Nodes (16): a_poisoned_book_lock_is_reported_once_and_keeps_the_open_book(), BookCache, cache_with_open_book(), open_book_handle(), open_book_handle_shares_the_cached_book(), open_book_handle_survives_the_book_being_replaced(), chapter_headers_for_pattern(), chapter_headers_for_pattern_bypasses_election() (+8 more)

### Community 4 - "types/DictionaryTypes.ts"

Cohesion: 0.09
Nodes (29): baseDictionaryTypes, DICTIONARY_TYPES, DictionaryTypeDefinition, PatchEntry, SemanticTypePickerProps, BadgeChipProps, BadgeProps, BinaryToggleOption (+21 more)

### Community 5 - "TranslationWindow.ts"

Cohesion: 0.13
Nodes (21): BandGeometry, CHUNK_CEILING_CHARS, CHUNK_TARGET_CHARS, ChunkPlanOptions, clamp(), clampRange(), computeBands(), FETCH_VIEWPORTS (+13 more)

### Community 6 - "TransformRuleEngine.ts"

Cohesion: 0.09
Nodes (50): ADR-038: Reject "Deepen RuleMatchesModal to Preview Real Output", Consequence, Context, Decision, Reasoning, Dictionary Kind / Dictionary Tier, Dictionary Type Classification, CAPITALIZATION (+42 more)

### Community 7 - "Performance Guide"

Cohesion: 0.10
Nodes (20): Analyze Performance Baselines, Architectural restructuring, Cache Invalidation, Cache Management, Check Cache Performance, Check Real Memory Usage, Common Profiling Targets, Failed Patterns (Avoid) (+12 more)

### Community 8 - "book_commands.rs"

Cohesion: 0.08
Nodes (40): a_line_range_includes_blank_lines_as_empty_strings(), an_oversized_file_is_refused_before_it_is_read(), BOOK_POISON_REPORTS, BookFingerprint, BookLines, default_library_path(), DEFAULT_LIBRARY_SUBPATH, fingerprint_book() (+32 more)

### Community 9 - "Bookshelf.tsx"

Cohesion: 0.30
Nodes (13): Context, Bookshelf(), formatBinding(), formatChapterCount(), formatProgress(), formatSize(), loadShelfLayout(), NO_BOOKS (+5 more)

### Community 10 - "react"

Cohesion: 0.10
Nodes (34): ADR-042: Adopt `@tanstack/react-virtual` for the Reader, Rather Than Extend `useVirtualScrollRange`, Alternatives Rejected, Consequences, Context, Decision, Dictionary table view, lucide-react, react (+26 more)

### Community 11 - "DictionaryEntry.tsx"

Cohesion: 0.17
Nodes (14): DictionaryEntryProps, EntryForm, footerMessage(), patternMessage(), markVariables(), VariableHighlightInput(), VariableHighlightInputProps, highlightPatternVariables() (+6 more)

### Community 12 - "EditCommitter.ts"

Cohesion: 0.12
Nodes (26): Addendum (2026-10-20), ADR-052: Dictionary Edit Commits — One Queue, TypeScript Write-Back, Alternatives considered, Consequence, Context, Decision, Reasoning, Dictionary Edit (+18 more)

### Community 13 - "useChapters.ts"

Cohesion: 0.12
Nodes (23): ADR-099: Skip a Chapter-Outline Record Helper, Consequence, Context, Decision, Reasoning, Chapters, ChapterOutlineState, ADR-0050 (+15 more)

### Community 14 - "Fiction Structural Pattern Dictionaries — Implementation Plan"

Cohesion: 0.10
Nodes (21): 1a. Add `list_fiction_pattern_dictionaries`, 1b. Add `create_structural_patterns_dictionary`, 1c. Add `rename_structural_patterns_dictionary`, 1d. Modify `rename_proper_nouns_dictionary` — cascade, 1e. Register in `lib.rs`, Design Decisions (do not re-litigate), Fiction Structural Pattern Dictionaries — Implementation Plan, File: `src/components/configuration/ConfigurationManager.tsx` (+13 more)

### Community 15 - "App.jsx"

Cohesion: 0.19
Nodes (10): pendingToastCalls, toast, ToastContainer(), ToastContext, ToastContextType, ToastIcon(), ToastInternalContext, ToastItem() (+2 more)

### Community 16 - "Content Security Policy (CSP) and WASM Security"

Cohesion: 0.11
Nodes (23): Addendum (2026-08-25): `precomputeSegments` deleted — this ADR's original subject no longer exists, Decision, SegmentedParagraphs, UnitHighlightPredicate, react-resizable-panels, ClickableOriginalSemantic(), ClickableTranslationSemantic(), HighlightableSegment (+15 more)

### Community 17 - "Historical / Deleted {#deleted-symbols}"

Cohesion: 0.08
Nodes (27): ADR-009: WasmProcessorLifecycle — Shared Init Contract for All WASM Processors, Alternative 1: Copy-fix across all three processors ✗ Rejected, Alternative 2: Base class / mixin for WASM processors ✗ Rejected, Alternative 3: WasmProcessorLifecycle class ✅ Selected, Alternatives Considered, Context and Problem Statement, Critical Invariants, Current state (2026-10-03) (+19 more)

### Community 18 - "logger"

Cohesion: 0.07
Nodes (25): Addendum — 2026-10-09, ADR-093: Skip a Dictionary-Tab Action Runner, Consequence, Context, Decision, Reasoning, Logging, Mock mechanics (+17 more)

### Community 19 - "WindowedTranslationFill.ts"

Cohesion: 0.17
Nodes (5): Context, TranslationChunkCache, chunkText(), LineRange, fillPlan()

### Community 20 - "appConfig.ts"

Cohesion: 0.11
Nodes (28): ADR-059: A Configuration Toggle Is Computed Under the Config Lock, Not on the Binding Queue, Consequence, Context, Decision, Reasoning, Decision, ADR-066: Skip an Active-Dictionary Snapshot Module, Consequence (+20 more)

### Community 21 - "PatternTemplateEngine"

Cohesion: 0.22
Nodes (8): ✅ Task #6: Migrate Regex to Rust (High-Impact #6), Pattern Variable Contract, checkVariableStructure(), checkVariableSymmetry(), countVariableOccurrences(), extractPatternVariables(), PATTERN_VARIABLE_LETTERS, PatternTemplateEngine

### Community 22 - "ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler"

Cohesion: 0.12
Nodes (15): Addendum (2026-09-26): the revisit trigger fired — answered with ownership, not a registry, ADR-012: Skip HotkeyRegistry, Keep useHotkeyHandler, Alternative 1: Full HotkeyRegistry ✗ Rejected, Alternative 2: Split into useTranslatorHotkeys + useDictionaryHotkeys ✗ Rejected, Alternative 3: Keep useHotkeyHandler ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement (+7 more)

### Community 23 - "Number Processing Phase - Code Review Fixes"

Cohesion: 0.23
Nodes (22): create_fiction_dictionary_pair(), create_proper_nouns_dictionary(), create_structural_patterns_dictionary(), create_structural_patterns_dictionary_impl(), DictionaryResponse, export_dictionaries(), get_app_data_dir(), get_dictionary_path() (+14 more)

### Community 24 - "DictionaryTableView.tsx"

Cohesion: 0.09
Nodes (29): Addendum (2026-10-21), MoveDialog, Dictionary JSON Format: Two Tiers, DictionaryTableViewProps, HeaderColumn, DuplicateDictionaryTableViewProps, EntryContextMenu(), EntryContextMenuProps (+21 more)

### Community 25 - "ReadingAnchor"

Cohesion: 0.16
Nodes (4): Reading Anchor, ReadingPosition, ReadingAnchor, tryRestorePosition()

### Community 26 - "PerformanceMonitoringTypes.d.ts"

Cohesion: 0.25
Nodes (7): Background for the Implementer, Final Verification, How pattern-within-pattern type checking works today, Key files and line numbers, Pattern Semantic Type Implementation Plan, Running tests, The fix

### Community 27 - "TextChunker"

Cohesion: 0.07
Nodes (24): ADR-015: Skip TextProcessingPipeline Extraction — TextChunker and AdaptiveChunker Are Not Composable, Alternative 1: Extract `TextProcessingPipeline` ✗ Rejected, Alternative 2: Keep coordination in TranslationEngine ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Update (2026-10-03) (+16 more)

### Community 28 - "Development Guide"

Cohesion: 0.18
Nodes (10): Automated Testing, Conclusion, Dictionary Memory Management Fixes - 2026-02-03, Executive Summary, Issues Fixed, Manual Testing, Memory Impact, Overview (+2 more)

### Community 29 - "SemanticToken"

Cohesion: 0.18
Nodes (12): find_best_pattern_match_iter(), is_variable_type_allowed(), PatternMatcher<'a>, PatternMatchResult, SemanticToken, span_cap(), VariableCacheEntry, PatternProcessingResult (+4 more)

### Community 30 - "PatternProcessingTypes.d.ts"

Cohesion: 0.15
Nodes (14): a_report_after_the_cooldown_notifies_with_the_running_count(), APP_HANDLE, EVENT_NAME, GATE, init_app_handle(), NOTIFICATION_COOLDOWN_MS, now_ms(), PoisonGate (+6 more)

### Community 31 - "TypeScript/Rust Optimization Progress Report"

Cohesion: 0.14
Nodes (21): CommandPalette(), CommandPaletteProps, EMPTY_SOURCE, ReaderCommands, useReaderCommands(), UseReaderCommandsOptions, requestDictionaryReload(), QuickAddSource (+13 more)

### Community 32 - "dictionary_commands.rs"

Cohesion: 0.06
Nodes (42): collision_message(), create_proper_noun_file(), has_paired_patterns(), id_rules_fixture(), list_dictionaries_with_prefix(), list_fiction_pattern_dictionaries_impl(), list_proper_nouns_dictionaries_impl(), MAX_CACHE_ENTRIES (+34 more)

### Community 33 - "react"

Cohesion: 0.13
Nodes (35): Key locations in `EnhancedVirtualizedDictionaryTable.tsx`, Dictionary priority ladder, DictionaryColumnSchema, Moving Entries — One Rule, Three Enforcement Points, Reusable Row/Badge Building Blocks — `TableBuildingBlocks.tsx`, `VirtualRowComponent` Is at Module Scope, DictionaryTableView(), getHeaderColumns() (+27 more)

### Community 34 - "Clickable Highlighting - Code Review Fixes Summary"

Cohesion: 0.10
Nodes (21): Attack Scenarios (If Exploited), Attack Vector Analysis, Comparison to CSP Best Practices, Configuration Location, Content Security Policy (CSP) and WASM Security, External Resources, Future Improvements, Internal Documentation (+13 more)

### Community 35 - "useHotkeyHandler.ts"

Cohesion: 0.11
Nodes (23): ADR-0012, ADR-063: Skip a Hotkey Chord Module, Consequence, Context, Decision, Reasoning, File: `src/utils/ui/HotkeyDispatchTable.ts`, HotkeyDispatchTable (+15 more)

### Community 36 - "useDictionaryCRUD.ts"

Cohesion: 0.13
Nodes (29): CommitFeedback, `DictionaryContext.tsx` CRUD Audit Checklist, Error Handling, CommitFailure, describeFreshFailure(), describeOperationError(), describeReplayFailure(), Feedback (+21 more)

### Community 37 - "BookReader.tsx"

Cohesion: 0.08
Nodes (40): ADR-0045, ADR-045: Skip a Shared Chapter-Structure Override Control, Consequence, Context, Decision, Reasoning, ADR-064: Skip Splitting the Binding Context, Consequence (+32 more)

### Community 38 - "two_phase.rs"

Cohesion: 0.19
Nodes (14): candidate(), index_selects_the_same_best_match_as_scanning_every_pattern(), leading_bonus_reads_the_tokens_before_the_candidate_not_before_its_original_index(), matches_the_literal_run_immediately_before_the_variable(), phase_a_protection_lands_on_the_candidates_own_tokens(), resets_at_an_earlier_variable_keeping_only_the_run_immediately_before_var_idx(), returns_zero_when_before_pos_is_zero(), returns_zero_when_the_preceding_tokens_do_not_end_with_the_literal_run() (+6 more)

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

### Community 43 - "PanelRows.ts"

Cohesion: 0.22
Nodes (13): LinePiece, fillSegmentGapsCached(), EMPTY_PANEL_ROWS, Panel, PanelRowsSnapshot, partlyLandedRow(), ProjectedChunk, rowAt() (+5 more)

### Community 44 - "SemanticArrayBuilder"

Cohesion: 0.07
Nodes (30): ADR-094: Delete the Write-Only Unit Provenance Fields, Consequence, Context, Decision, Reasoning, Addendum (2026-10-12), ADR-100: Delete the Progressive Metadata Pad, Consequence (+22 more)

### Community 45 - "ErrorBoundary"

Cohesion: 0.18
Nodes (3): react-dom, ErrorBoundary, clearPanelLayoutStorage()

### Community 46 - ".translateWithProgressiveBatches"

Cohesion: 0.19
Nodes (13): ADR-086: Keep ScrollPositionRecovery Separate From useScrollPositionManager, Consequence, Context, Decision, Reasoning, ScrollPositionRecovery, PANELS, tryRestoreScrollPositions() (+5 more)

### Community 47 - "matcher.rs"

Cohesion: 0.11
Nodes (21): build_result(), build_result_matches_the_shared_fixture(), Fixture, FixtureCase, load_fixture(), NUMBER_VARIABLE, NUMBER_VARIABLE_SPAN, NUMBER_VARIABLE_TYPE (+13 more)

### Community 48 - "BookLinesStore"

Cohesion: 0.12
Nodes (10): ChapterOutlineStore, BookLineWindow, ADR-0050, useBookLines(), BookLinesInputs, BookLinesSnapshot, BookLinesStore, LINES_PER_PAGE (+2 more)

### Community 49 - "Domain Glossary"

Cohesion: 0.07
Nodes (39): Addendum 2026-09-29, Addendum 2026-10-04, ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider, Alternative 1: Extract all five IPC call sites into DictionaryBackend ✗ Rejected, Alternative 2: Extract loadInitialState only ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement (+31 more)

### Community 50 - "BookRecordsBackend.ts"

Cohesion: 0.08
Nodes (36): Addendum (2026-10-21), ADR-048: Generic Proper-Noun Dictionaries Get Paired Pattern Dictionaries Too, Consequences, Context, Decision, Reason, Context, ADR-062: Pair Operations Share the Binding Queue, and the Configuration Tab Reads the Dictionary Store's List (+28 more)

### Community 51 - "ReaderTypes.ts"

Cohesion: 0.08
Nodes (40): ADR-0090, ADR-081: Skip Wire-Shape Parity for the Reader IPC Payloads, Consequence, Context, Decision, Reasoning, @tauri-apps/plugin-dialog, BookReaderProps (+32 more)

### Community 52 - "Troubleshooting Guide"

Cohesion: 0.10
Nodes (20): Cross-panel highlight picks wrong duplicate-char instance, 2026-08-26, Development Process Lessons, Error Handling Patterns, Lesson 1: Verify Execution Before Fixing Logic, Lesson 2: Test Production Builds During Development, Lesson 3: Type Boundaries Need Explicit Contracts, Lesson 4: Follow Existing Patterns, "màu" split into "mà" + "u" (Jan 2025) (+12 more)

### Community 53 - "ElectronTypes.d.ts"

Cohesion: 0.22
Nodes (13): AppearanceResult, BatchDictionaryResponse, BatchDictionaryResult, BookRecordsResult, ConfigurationResult, DictionaryCreateResult, DictionaryOperationResult, ElectronResult (+5 more)

### Community 54 - "FormattingPasses.ts"

Cohesion: 0.10
Nodes (37): ADR-0100, Execution Paths (Full Translation vs Character-only), Engine and pipeline tests, Fake timers and async ordering, Imports and naming traps, jsdom and React Testing Library, Testing Gotchas, CharOnlyAssembly (+29 more)

### Community 55 - "DictionaryIdClassifier.ts"

Cohesion: 0.08
Nodes (42): ADR-0060, Addendum (2026-10-21), ADR-060: Dictionary-Id and Config-Key Rules Are Held by a Shared Fixture; Rust Keeps Editing Config, Consequence, Reasoning, Types / Imports, Dictionary labels, ConfigurationManager() (+34 more)

### Community 56 - "Code Review Fixes - February 1, 2026"

Cohesion: 0.05
Nodes (37): compilerOptions, allowJs, allowSyntheticDefaultImports, alwaysStrict, checkJs, emitDecoratorMetadata, esModuleInterop, experimentalDecorators (+29 more)

### Community 57 - "ReadingAnchor.ts"

Cohesion: 0.18
Nodes (11): AnchorVirtualizer, computeAnchor(), DEFAULT_VIEWPORT_LINES, DETACHED_INPUTS, isAnchorInPlace(), MODIFIER_KEYS, ReadingAnchorDeps, RestoreTarget (+3 more)

### Community 58 - "Detailed Optimization Tracking"

Cohesion: 0.08
Nodes (23): 2026-01-31 - Session 1 (Infrastructure + Analysis), Architectural Constraints (from CLAUDE.md):, Baseline Measurements (Before Optimizations), Development Tools:, Documentation:, For Each Optimization:, Future Optimization Ideas:, Key Learnings: (+15 more)

### Community 59 - "sanitize_io_error"

Cohesion: 0.15
Nodes (15): export_dictionaries_impl(), load_json_file_with_default(), quarantine_json_file(), read_zip_entries(), sanitize_io_error(), test_blob_over_the_size_limit_is_set_aside(), test_blob_that_is_not_utf8_is_set_aside(), test_blob_that_loads_is_never_marked_quarantined() (+7 more)

### Community 60 - "wasm_boundary.rs"

Cohesion: 0.22
Nodes (9): PatternIndex, test_clear_index(), test_get_all_patterns(), test_get_nonexistent_pattern(), test_index_literal_starting_pattern(), test_index_mixed_patterns(), test_index_multiple_patterns_same_first_token(), test_index_variable_starting_pattern() (+1 more)

### Community 61 - "OptimizationBenchmarks"

Cohesion: 0.10
Nodes (20): 1. Documentation Improvements, 1. `src/utils/TranslationEngine.js`, 1. Understanding Code Flow is Critical, 2. Add Execution Path Diagrams, 2. `src/utils/PunctuationProcessor.ts`, 2. Understanding When Functions Are Called, 3. Lightweight Always-On Logging, 3. `src/utils/TextChunker.js` (+12 more)

### Community 62 - "DictionaryTrie"

Cohesion: 0.09
Nodes (20): ADR-017: Skip WasmMemoryPool Analytics Separation, Consequence, Context, Decision, Reasoning, Context, Addendum — 2026-08-26: "Production builds its trie once and reuses it" was false, ✅ Task #4: Expose Rust Trie to WASM (Critical #3) (+12 more)

### Community 63 - "Phase 8 Tests - Pattern Matching Validation"

Cohesion: 0.09
Nodes (21): app, security, windows, withGlobalTauri, enable, build, beforeBuildCommand, beforeDevCommand (+13 more)

### Community 64 - "ComponentTypes.d.ts"

Cohesion: 0.20
Nodes (8): `DictionaryInfo` Name Collision, AppConfiguration, DictionaryInfo, DictionaryTypeDefinition, DictionaryTypesCollection, FontSettings, TabId, Theme

### Community 65 - "ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation"

Cohesion: 0.09
Nodes (24): Addendum (2026-10-12, architecture review round 32, candidate #4), ADR-006: PatternProcessor Interface — Return Results, No Inline Mutation, Alternative 1: Keep inline mutation per adapter ✗ Rejected, Alternative 2: Return results, single apply site ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+16 more)

### Community 67 - "lru_cache.rs"

Cohesion: 0.07
Nodes (25): a_get_protects_an_entry_from_eviction(), a_miss_leaves_no_trace(), a_poisoned_lock_is_reported_once_cleared_and_usable_again(), cache(), evicts_the_least_recently_set_entry(), get_misses_then_hits_after_set(), Inner, Inner<K, V> (+17 more)

### Community 68 - "ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init"

Cohesion: 0.33
Nodes (6): ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init, Consequences, Context, Decision, Reason, EngineConfig

### Community 69 - "App.jsx"

Cohesion: 0.20
Nodes (12): Decision, EngineAccess, App(), AppContent(), EngineProvider(), setGlobalToast(), ToastProvider(), useToast() (+4 more)

### Community 70 - "default.json"

Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 71 - "AppearanceManager.tsx"

Cohesion: 0.27
Nodes (9): FIELD_GROUPS, FieldConfig, FieldGroup, FontControlGroup(), FontControlGroupProps, FontControlRow(), FontControlRowProps, AppearanceSection (+1 more)

### Community 72 - "useReadingAnchor.ts"

Cohesion: 0.43
Nodes (5): UseReadingAnchorOptions, UseReadingAnchorResult, registerPendingPositionFlush(), ReadingAnchorInputs, ReadingAnchorSnapshot

### Community 73 - "SemanticTypes.ts"

Cohesion: 0.13
Nodes (8): punctuationProcessor, SpacingToken, ChunkPostProcessor, PunctuationProcessor, SpecialPattern, QUOTE_CATEGORIES, QUOTE_TYPES, QuoteProcessor

### Community 74 - "src/components/dictionary — Gotchas"

Cohesion: 0.16
Nodes (13): Reason, Fiction Pattern Merge Order Is Load-Bearing, Hook Tests — jsdom Gotchas (Dictionary-Specific), `SemanticType` Canonical Values, src/components/dictionary — Gotchas, WASM Wrapper Methods, `$X`/`$Y` Variable-Derived Semantic Types (Patterns Only), AccessibleBadgeChip() (+5 more)

### Community 75 - "DictionaryStore.ts"

Cohesion: 0.10
Nodes (24): ADR-0014, Addendum (2026-10-20), Addendum (2026-10-21), ADR-072: Keep the Startup-Load Policy and Engine-Invalidation Rule in DictionaryProvider, Consequence, Context, Decision, Reasoning (+16 more)

### Community 76 - "precomputeOriginalSegments"

Cohesion: 0.31
Nodes (10): Addendum (2026-08-25): Extending the decision to `segmentFromPositionMetadata` vs `precomputeOriginalSegments`, Addendum (2026-10-09): what reaches the fast path, measured (architecture review round 23, candidate #4 grilling), ADR-036: Skip Unifying `precomputeSegments`/`precomputeOriginalSegments` Into a Shared Scanner, Consequence, Context, Decision, Reasoning, getFirstGrapheme() (+2 more)

### Community 77 - "useDictionaryModals.tsx"

Cohesion: 0.14
Nodes (9): ModalErrorBoundary, CLOSED, DictionaryModals, DictionaryModalsOptions, OpenQuickAdd, QuickAddModalState, sharedShortlistMemory, QuickAddKind (+1 more)

### Community 78 - "mod.rs"

Cohesion: 0.13
Nodes (21): bench_large_token_array(), bench_pattern_competition(), bench_phase_a_processing(), bench_single_pattern_match(), bench_two_phase_processing(), create_token(), VARIABLE_KEY, DEFAULT_MAX_VARIABLE_SPAN (+13 more)

### Community 79 - "BookRecordsBackend.ts"

Cohesion: 0.12
Nodes (28): Context, Book Records, useBookRecords(), BookObservations, READER_ANSWER_FIELDS, ReaderAnswerField, refreshBookRecord(), booksFile (+20 more)

### Community 80 - "TranslationEngineTypes.d.ts"

Cohesion: 0.05
Nodes (32): Context, TranslatorDisplayPanelsProps, ClickableOriginalSemanticProps, ClickableTranslationOptimizedProps, ClickableTranslationSemanticProps, ClickDirection, SegmentClickHandler, SegmentClickPayload (+24 more)

### Community 81 - "NumberProcessor"

Cohesion: 0.05
Nodes (37): Addendum 2026-10-07: the spec now runs a shared fixture, ADR-041: Keep `number_processor.rs` — It's a Parity Spec, Not Dead Code, Consequence, Context, Decision, Reasoning, ADR-047: Skip a Numeral-Value Interface on NumberProcessor, Consequence (+29 more)

### Community 82 - "TabbedInterface.tsx"

Cohesion: 0.09
Nodes (37): Context, ADR-076: Keep the Quick-Add Remembered Pick Inside Its Hook, Consequence, Context, Decision, Reasoning, File: `src/components/TabbedInterface.tsx`, File: `src/components/Translator.jsx` (+29 more)

### Community 83 - "Value"

Cohesion: 0.11
Nodes (23): BatchDictionaryResponse, BatchDictionaryResult, BlobKind, Appearance, Books, Config, TransformRules, check_json_depth() (+15 more)

### Community 84 - "SelectionMapping.ts"

Cohesion: 0.12
Nodes (24): ADR-0049, Addendum (2026-09-28): handlers keyed by action type — still not a registry, Addendum (2026-10-10), ADR-049: Keep the Selection-Mapper Registry, Consequence, Context, Decision, Reasoning (+16 more)

### Community 86 - "PersistTimeValidator.ts"

Cohesion: 0.16
Nodes (16): Addendum (2026-10-03), ADR-026: Do Not Move useDictionaryCRUD to src/hooks/, Context, Decision, Reason, Supersession Note (2026-06-27), When to Revisit, PersistTimeValidator (+8 more)

### Community 87 - "useColumnMetrics.ts"

Cohesion: 0.31
Nodes (7): ADR-0024, useAppearanceVersion(), ColumnMetrics, useColumnMetrics(), Cross-panel sync is line-indexed and one-way, CssLengthContext, cssLengthToPx()

### Community 88 - "useAppearanceSettings.ts"

Cohesion: 0.21
Nodes (17): ADR-024: Do Not Move Style Objects into useAppearanceSettings, Context, Decision, Reason, Revisit condition, AppearanceConfig, AppearanceSettings (hook), AppearanceManager() (+9 more)

### Community 89 - "Development Guide"

Cohesion: 0.15
Nodes (10): CI/CD Pipeline, Development Debugging Tools, Development Guide, Fallow Dead-Code Analysis, Gotchas Reference, Production Build Requirements, Related Guides, Testing Infrastructure (+2 more)

### Community 90 - "BookReader.tsx"

Cohesion: 0.07
Nodes (42): Addendum (2026-09-26): the open book holds its whole record — decision unchanged, ADR-044: Skip Splitting `ReaderTab`'s `openBook`, Consequence, Decision, Reasoning, ADR-046: Keep `BookReader`'s Master-Scroll Composition and Refill Ref, Consequence, Context (+34 more)

### Community 91 - "appearanceConfig.ts"

Cohesion: 0.31
Nodes (9): appearanceFile, DEFAULT_APPEARANCE, fromRaw(), fromRawFontSettings(), fromRawUiFont(), isTheme(), LEGACY_LETTER_SPACINGS, normalizeLetterSpacing() (+1 more)

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

### Community 98 - "WindowedTranslationFill.ts"

Cohesion: 0.24
Nodes (13): ADR-0050, UseWindowedTranslationOptions, TranslatedChunk, PositionedSegment, SegmentedChunk, EngineCall, ReaderEngineCalls, CachedChunk (+5 more)

### Community 99 - ".loadDictionaries"

Cohesion: 0.13
Nodes (17): ADR-075: Delete the Persisted Trie Cache, Consequences, Context, Decision, Evidence, Addendum (2026-10-10, architecture review round 24, candidate #1), Addendum (2026-10-11, architecture review round 30, candidate #5 grilling), Addendum (2026-10-12, architecture review round 32, candidate #3) (+9 more)

### Community 101 - "DictionaryCache"

Cohesion: 0.12
Nodes (19): DictionaryCache, get_cache_key(), load_dictionary_file(), LoadFailure, Invalid, InvalidJson, Io, Rejected (+11 more)

### Community 102 - "migrate-semantic-types.py"

Cohesion: 0.33
Nodes (4): Environment / Tooling (RTK, Edit, Bash), main(), migrate_file(), Tauri Command Security

### Community 103 - "Task 1: Add Semantic column to Patterns dictionary table"

Cohesion: 0.11
Nodes (17): Background for the Implementer, How the patterns table currently looks (column widths), Patterns Semantic Column Implementation Plan, Running tests, Step 1: Verify baseline, Step 2: Edit 1 — Add "Semantic" header between Translation and X types, Step 3: Run type-check after Edit 1, Step 4: Edit 2 — Change translation row cell width from 55% to 43% (+9 more)

### Community 105 - "WasmPatternProcessor.js"

Cohesion: 0.10
Nodes (23): Consequences, Negative, Neutral, Positive, ADR-070: Skip a Shared WASM-Call-or-Fallback Shell; Delete the Unread Wrapper Stats, Consequence, Context, Decision (+15 more)

### Community 106 - "Translator"

Cohesion: 0.11
Nodes (25): ADR-0003, Context, Addendum — 2026-10-24: `isTranslatingRef` param removed, ADR-084: Skip Merging the Reload Context Assembler Into useForceReload, Consequence, Context, Decision, Reasoning (+17 more)

### Community 107 - "TokenHelpers.ts"

Cohesion: 0.08
Nodes (25): Addendum (2026-10-12), Addendum (2026-10-21), ADR-082: One Seam for "Dictionary Matches at a Token" — MatchSource, Consequence, Context, Decision, Reasoning, Dictionary match lookup (+17 more)

### Community 108 - "AppReadinessOverlay.tsx"

Cohesion: 0.36
Nodes (6): AppReadinessOverlay(), AppReadinessOverlayProps, pickStatus(), stageClass(), stageIcon(), StageStatus

### Community 109 - "dependencies"

Cohesion: 0.17
Nodes (12): dependencies, lucide-react, react, react-dom, react-resizable-panels, @tanstack/react-virtual, @tauri-apps/api, @tauri-apps/plugin-clipboard-manager (+4 more)

### Community 110 - "usePerformanceMonitoring.js"

Cohesion: 0.32
Nodes (5): ADR-0069, Consequence, Context, usePerformanceMonitoring(), globalPerformanceMonitor

### Community 111 - "SemanticPatternProcessor"

Cohesion: 0.14
Nodes (13): Appearance travels as CSS variables, never as state, `ClickableTranslationOptimized` paragraph logic, Config is read and written through `appConfig.ts`, Context providers, Engine lifecycle — `EngineContext` / `useEngine()`, Every tab is mounted at once, Frequently-updating values travel by ref, not by dep array, One owner per concern (+5 more)

### Community 112 - "LRUCache"

Cohesion: 0.12
Nodes (16): ADR-003: TypeScript Hybrid Architecture, Alternative 1: Full TypeScript Migration, Alternative 2: Keep Everything JavaScript, Alternative 3: Strategic Hybrid (TypeScript for Boundaries, JavaScript for Core) ✅ SELECTED, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 113 - "TwoPhasePatternProcessor.js"

Cohesion: 0.10
Nodes (24): ADR-0007, ADR-0037, Alternative 1: Restore JS fallback in `TwoPhasePatternProcessor` ✗ Rejected, Alternative 2: Extract `WasmPatternBridge` seam ✗ Rejected, Alternative 3: Throw on `{ success: false }`, no bridge ✅ Selected, Alternatives Considered, Decision, References (+16 more)

### Community 114 - "ADR-089: The Character-Only Pass Leaves Punctuation Alone"

Cohesion: 0.33
Nodes (5): ADR-089: The Character-Only Pass Leaves Punctuation Alone, Consequence, Context, Decision, Reasoning

### Community 115 - "ADR-002: Dual-Path Clickable Highlighting Architecture"

Cohesion: 0.12
Nodes (16): ADR-002: Dual-Path Clickable Highlighting Architecture, Alternative 1: Consolidate Into Unified Highlighting System, Alternative 2: Keep Separate Paths (Current Implementation) ✅ SELECTED, Alternative 3: Partial Consolidation (Helper Functions), Alternatives Considered, Consequences, Context and Problem Statement, Decision (+8 more)

### Community 116 - "ADR-004: 5-Phase Processing Order Immutability"

Cohesion: 0.12
Nodes (15): ADR-004: 5-Phase Processing Order Immutability, Alternative 1: Reorder Phases for Performance, Alternative 2: Parallel Processing (All Phases Simultaneously), Alternative 3: Keep Current Sequential Order (Patterns First) ✅ SELECTED, Alternatives Considered, Architectural Implications, Consequences, Decision (+7 more)

### Community 117 - "Active ADRs"

Cohesion: 0.18
Nodes (11): Active ADRs, [ADR-001: WASM Batch Loading — Remove Batch Wrapper](./ADR-001-wasm-batch-loading-failure.md), [ADR-002: Dual-Path Clickable Highlighting](./ADR-002-dual-path-clickable-highlighting.md), [ADR-003: TypeScript Hybrid Architecture](./ADR-003-typescript-hybrid-architecture.md), [ADR-004: 5-Phase Processing Order Immutability](./ADR-004-five-phase-processing-order-immutability.md), ADR Format, Architecture Decision Records (ADRs), History (+3 more)

### Community 118 - "useDictionaryConfigManagement.ts"

Cohesion: 0.22
Nodes (8): Addendum — 2026-10-11, ADR-096: Keep the WASM Pattern Processor; Measured, Consequence, Context, Decision, Findings, not fixed here, Measurement, Reasoning

### Community 119 - "ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory"

Cohesion: 0.25
Nodes (7): Addendum (2026-10-02), Addendum (2026-10-20), ADR-055: Dictionary Store — One Queue for Every Write to the Dictionaries in Memory, Alternatives considered, Consequence, Context, Decision

### Community 120 - "ADR-098: Pattern Result Indices Are Original Indices"

Cohesion: 0.33
Nodes (5): ADR-098: Pattern Result Indices Are Original Indices, Consequence, Context, Decision, Reasoning

### Community 121 - "ElectronTypes.d.ts"

Cohesion: 0.13
Nodes (14): Addendum (2026-10-20), ADR-008: Dictionary Cache Invalidation — Locality in handleForceReload, Not DictionaryContext, Alternative 1: Move cache invalidation to `DictionaryContext` ✗ Rejected, Alternative 2: Keep invalidation in `handleForceReload` ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Critical Invariants (+6 more)

### Community 122 - "BookRecordValidation.ts"

Cohesion: 0.19
Nodes (19): ADR-054: Skip a Book Record Field Schema, Consequence, Context, Decision, Reasoning, CHAPTER_PATTERN_IDS, emptyBookRecord(), parseRecords() (+11 more)

### Community 123 - "TwoPhasePatternProcessor"

Cohesion: 0.14
Nodes (13): Addendum — 2026-10-11, Addendum — 2026-10-21, ADR-007: TwoPhasePatternProcessor — No JS Fallback, Hard Failure on WASM Error, Consequences, Context and Problem Statement, Critical Invariants, Decision Drivers, Negative (+5 more)

### Community 124 - "jsdom"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-13): no debounce, validation derived — decision unchanged, ADR-039: Skip Splitting `useDictionaryEntryForm`, Consequence, Context, Decision, Reasoning

### Community 125 - "useStreamingTranslation"

Cohesion: 0.10
Nodes (25): ADR-016: Skip StreamingContext Record Wrapper for useStreamingTranslation, Consequence, Context, Decision, Reasoning, What Was Done Instead, ADR-022: Keep streamingReducer and Initial State Constants Exported, Boundary Condition (+17 more)

### Community 126 - "TranslationEngine.js"

Cohesion: 0.07
Nodes (25): ADR-0006, emptySemanticArrays, MAX_INPUT_TOKENS, MEMORY_MANAGEMENT, PHASE_TIMEOUTS, UI_TIMEOUTS, ConflictCandidate, resolveGlobalConflicts() (+17 more)

### Community 127 - "PatternStore.js"

Cohesion: 0.12
Nodes (13): Addendum 2026-10-21: the Pattern Store owns the skip decision, Decision, What was not measured, Engine Reinitialization, PatternStore, PATTERN_FAILURE_DETECTION, PatternFailureTracker, ADR-0101 (+5 more)

### Community 128 - "dictionary/index.ts"

Cohesion: 0.17
Nodes (17): EntryValue, State Ownership — Not in `EnhancedVirtualizedDictionaryTable` (EVDT) or `VirtualRowComponent`, FullEntryData, hasMetadata(), MoveDialog(), MoveDialogProps, useDictionaryEntryForm(), MoveTargetDictionary (+9 more)

### Community 129 - "Translator.jsx"

Cohesion: 0.06
Nodes (42): Update (2026-07-28), Addendum — 2026-10-24: `isTranslatingRef` deleted too, Reasoning, @tauri-apps/api, ADR-0105, Translator(), TOAST_DURATIONS, TOAST_IDS (+34 more)

### Community 130 - "Design"

Cohesion: 0.13
Nodes (14): ADR-001: WASM Batch Loading — Remove JS Batch Wrapper, Keep Sequential, Consequences, Context and Problem Statement, Decision, If Startup Latency Becomes a Problem, Implementation, Monitoring and Review, Negative (+6 more)

### Community 131 - "V8OptimizationTypes.d.ts"

Cohesion: 0.13
Nodes (14): ADR-005: Eager Dictionary Loading via DictionaryContext, Alternative 1: Complete the LazyDictionaryContext migration ✗ Rejected, Alternative 2: Keep eager loading, delete LazyDictionaryContext ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision, Decision Drivers (+6 more)

### Community 132 - "useTranslatorEngine"

Cohesion: 0.11
Nodes (19): Decision Drivers, Addendum — 2026-06-20: Standalone `useWasmStatus` hook also rejected, Addendum — 2026-07-17d: Cluster deleted, not fixed, ADR-019: Skip Absorbing WASM Status Sync into useTranslatorEngine, Consequence, Context, Decision, Reasoning (+11 more)

### Community 133 - "SemanticArrayBuilder"

Cohesion: 0.14
Nodes (13): Addendum (2026-10-10), ADR-011: Skip useTranslatorSession Coordinator Hook, Alternative 1: Extract useTranslatorSession ✗ Rejected, Alternative 2: Keep coordination in Translator.jsx ✅ Selected, Alternatives Considered, Consequences, Context and Problem Statement, Decision (+5 more)

### Community 134 - "wasmIntegrityVerifier.js"

Cohesion: 0.14
Nodes (13): Background for the Implementer, Current flag (line ~1915), Patterns Semantic Type Filter Implementation Plan, Running checks, Step 1: Verify baseline, Step 2: Make the change, Step 3: Run type-check, Step 4: Run full test suite (+5 more)

### Community 135 - "useDictionaryConfigManagement.ts"

Cohesion: 0.18
Nodes (14): ADR-103: Keep the Default-Dictionary Toggle and the Name Step in the Config Hook, Consequence, Context, Decision, ADR-0027, ADR-0048, ADR-0062, useDictionaryConfigManagement() (+6 more)

### Community 136 - "BookBindingContext.tsx"

Cohesion: 0.13
Nodes (35): Dictionary Binding, BookBindingContext, BookBindingContextValue, BookBindingProvider(), ADR-0062, bindingConfigFields(), BookBindingDeps, BookBindingSnapshot (+27 more)

### Community 137 - "Windowed translation is four seams that must stay wired together"

Cohesion: 0.18
Nodes (8): Before asserting, Window Filler, useWindowedTranslation(), Windowed translation is four seams that must stay wired together, orderChunksByDistance(), FillEngineCalls, WindowFiller, WindowFillerInputs

### Community 138 - "LineSegments.ts"

Cohesion: 0.19
Nodes (24): Reader Panels, ReaderHighlight, assembleTranslatedLines(), chunkLinePieces(), ChunkLineRange, chunkLineRanges(), linePieceCache, linePieces() (+16 more)

### Community 140 - "DictionaryContext.tsx"

Cohesion: 0.18
Nodes (14): ADR-0106, DictionaryContext, DictionaryContextValue, DictionaryProviderProps, ADR-0005, ADR-0053, ADR-0055, ImportOutcome (+6 more)

### Community 141 - "TextTokenizer"

Cohesion: 0.15
Nodes (8): ADR-033: Delete Broken Pattern-Matcher Parity Tooling; Defer Building Real Parity Coverage, Consequence, Context, Decision, Reasoning, Update (2026-08-25), Update (2026-09-08), TextTokenizer

### Community 142 - "ReaderPanel.tsx"

Cohesion: 0.22
Nodes (12): isLit(), PanelVariant, ReaderPanelInner(), ReaderPanelProps, SegmentedLine, segmentTitle(), titleCache, VARIANT_CLASS (+4 more)

### Community 143 - "package.json"

Cohesion: 0.06
Nodes (33): name, packageManager, private, type, version, eslint, eslint-config-prettier, @eslint/js (+25 more)

### Community 144 - "real_dictionary_profile.rs"

Cohesion: 0.29
Nodes (6): bench_real_dictionary_chunks(), bench_variable_pattern_clone(), create_token(), default_patterns_path(), load_processor(), tokens_from()

### Community 145 - "ADR-090: Keep the tauriAPI Invoke Shell Narrow"

Cohesion: 0.20
Nodes (11): ADR-090: Keep the tauriAPI Invoke Shell Narrow, Consequence, Context, Decision, Reasoning, Files, Phase 2 — tauriAPI Bindings [Small], tauriAPI (+3 more)

### Community 146 - "useReaderPanel.ts"

Cohesion: 0.24
Nodes (10): @tanstack/react-virtual, OVERSCAN_ROWS, useReaderPanel(), UseReaderPanelOptions, FollowerGeometryProps, PanelGeometryProps, ReaderPanels, UseReaderPanelsOptions (+2 more)

### Community 147 - "TextTokenizer.ts"

Cohesion: 0.10
Nodes (17): GroupedToken, HAN_TEST, PhraseCandidate, ProcessingStrategy, TextAnalysis, TextComplexity, Token, TokenGroups (+9 more)

### Community 148 - ".applyMatchToTokens"

Cohesion: 0.21
Nodes (6): 1. These APIs do not validate their arguments — a wrong one degrades silently, CharacterLookup, CharacterMatch, characterMatchFor(), ADR-0087, isActiveProperNounSource()

### Community 149 - "ADR-062: Pair Operations Share the Binding Queue, and the Configuration Tab Reads the Dictionary Store's List"

Cohesion: 0.33
Nodes (5): ADR-051: The Reader's Quick-Add Is the Shared Add Form, Not a Floating Bar, Consequence, Context, Decision, Reasoning

### Community 150 - "Tauri Backend + WASM Core — Gotchas"

Cohesion: 0.22
Nodes (8): Reader Corpus Tests, Rust Arithmetic, Rust String Lengths, Tauri Backend + WASM Core — Gotchas, WASM-Bridged Structs, wasm-core Architecture, WASM `&mut self` Borrow Rule (Rust 1.84+), WASM-Only Symbols Cause SIGABRT on Native Tests

### Community 151 - "Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup"

Cohesion: 0.50
Nodes (4): Fix 2: HIGH-2 - Call clearAllDictionaries() in cleanup(), Impact, Problem, Solution

### Community 152 - "Detailed Fix Descriptions"

Cohesion: 0.25
Nodes (8): Detailed Fix Descriptions, Fix 5: MEDIUM-1 - Add dispose() to TranslationCache, Fix 6: Update DictionaryManager to use TranslationCache.dispose(), Impact, Impact, Problem, Solution, Solution

### Community 153 - "Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries"

Cohesion: 0.50
Nodes (4): Fix 3: HIGH-1 - Add dispose() in EnhancedDictionaryManager.reloadDictionaries(), Impact, Problem, Solution

### Community 154 - "Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup"

Cohesion: 0.50
Nodes (4): Fix 7: MEDIUM-2 - Improve pendingDictionaries cleanup, Impact, Problem, Solution

### Community 155 - "Performance Impact"

Cohesion: 0.50
Nodes (4): GC Pressure Reduction, Memory Leak Elimination, Performance Impact, User-Visible Benefits

### Community 156 - "useReaderPanel.ts"

Cohesion: 0.25
Nodes (12): PanelSyncHandle, SyncPanel, usePanelSync(), UsePanelSyncOptions, ReaderPanelGeometry, anchorAtOffset(), clampFraction(), clampOffset() (+4 more)

### Community 157 - "ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup)"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-20, architecture review round 34, candidate #3), ADR-035: Skip Removing DictionaryManager's Constructor Closures (DictionaryMatchLookup/DictionaryWasmLookup), Consequence, Context, Decision, Reasoning

### Community 158 - "ADR-088: Skip Moving the Cache-Invalidator Registration Into EngineProvider"

Cohesion: 0.29
Nodes (6): Addendum (2026-10-20), ADR-088: Skip Moving the Cache-Invalidator Registration Into EngineProvider, Consequence, Context, Decision, Reasoning

### Community 159 - "Future Improvements"

Cohesion: 0.67
Nodes (3): Future Improvements, Long Term, Short Term

### Community 160 - "Verification Checklist"

Cohesion: 0.67
Nodes (3): Manual Verification Completed, Testing Required, Verification Checklist

### Community 161 - "ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface"

Cohesion: 0.33
Nodes (5): Addendum (2026-09-26), ADR-021: Do Not Unify TranslationEngine's Performance Reporting Surface, Decision, If App Callers Are Added, Reason

### Community 162 - "useTransformRules.ts"

Cohesion: 0.15
Nodes (26): ADR-107: Keep the Transform Rule Pending Overlay in the Editor Hook, Consequences, Context, Decision, Reasoning, Transform Rule, assertNoConflict(), conflictError() (+18 more)

### Community 163 - "ADR-053: Unread Dictionaries Are Refused, Not Quarantined"

Cohesion: 0.33
Nodes (5): ADR-053: Unread Dictionaries Are Refused, Not Quarantined, Alternatives considered, Consequence, Decision, Reasoning

### Community 164 - "ADR-097: Number Variables Have Their Own Span"

Cohesion: 0.33
Nodes (5): ADR-097: Number Variables Have Their Own Span, Consequence, Context, Decision, Reasoning

### Community 165 - "Gotchas Reference"

Cohesion: 0.33
Nodes (6): Architecture / Extraction, CSS / UI Components, Gotchas Reference, JavaScript / TypeScript, Rust / WASM Backend, `// @ts-check` Coverage

### Community 166 - "SemanticArrayBuilder"

Cohesion: 0.08
Nodes (25): Decision, Breakthrough Moment, Initial Assumptions (All Wrong), Root Cause, Solution, The Debugging Journey, Related Guides, Semantic Arrays (Clickable Highlighting) (+17 more)

### Community 167 - "ADR-061: Skip a Shelf Row Module"

Cohesion: 0.40
Nodes (4): ADR-061: Skip a Shelf Row Module, Consequence, Decision, Reasoning

### Community 168 - "High-Priority Issues 🟠"

Cohesion: 0.15
Nodes (10): Category 1: Future Integration APIs (18 warnings), Category 2: Helper/Utility Methods (8 warnings), Category 3: Dead Code from Earlier Phases (3 warnings), Compilation Warnings - Explained, Current Status, Fixed Warnings (7 total), Remaining Warnings (29 total) - All Expected, Summary (+2 more)

### Community 170 - "wasm-core Pattern Processor"

Cohesion: 0.20
Nodes (9): Constraints, Design, Design: Semantic Type for Structural Pattern Entries, Files Touched, Problem, Section 1 — Data Model, Section 2 — Translation Engine: WASM (primary fix), Section 3 — Translation Engine: JS cross-pass fix (+1 more)

### Community 171 - "ADR-104: No Shared Fake for One-Shot IPC in Tests"

Cohesion: 0.40
Nodes (4): ADR-104: No Shared Fake for One-Shot IPC in Tests, Consequence, Context, Decision

### Community 176 - "ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation"

Cohesion: 0.33
Nodes (6): ADR-028: Eager Creation of Structural Pattern Dictionary on Fiction Creation, Consequences, Context, Decision, Reason, Supersession Note (2026-07-28)

### Community 178 - "AI Readiness Evaluation: chinese-translator-tauri"

Cohesion: 0.22
Nodes (8): ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline, Alternative 1: Extract to `TokenStringCache.ts` with DI ✗ Rejected, Alternative 2: Keep inline ✓ Accepted, Alternatives Considered, Consequences, Context and Problem Statement, Decision Drivers, Supersession Note (2026-07-28)

### Community 180 - "ADR-069: Delete the Baseline Regression Detector"

Cohesion: 0.40
Nodes (4): ADR-069: Delete the Baseline Regression Detector, Consequences, Context, Decision

### Community 183 - "text_tokenizer.rs"

Cohesion: 0.22
Nodes (8): Column header, Design, Design: Semantic Column in Patterns Dictionary Table, Files Touched, No new components, Problem, Row cell, Width adjustment

### Community 184 - "ADR-013: Skip PrecomputedTokenStrings Extraction, Keep It Inline"

Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 186 - "ref_types_componenttypes"

Cohesion: 0.19
Nodes (7): EngineContextValue, EngineInitOutcome, createEngineAccess(), EngineAccess, EngineOwner, EngineRunOptions, Entry

### Community 189 - "useOutlineTranslations.ts"

Cohesion: 0.13
Nodes (17): ADR-0043, Addendum (2026-09-30), ADR-043: Skip a Shared Generation-Guarded-Fill Primitive, Consequence, Decision, Reasoning, Reasoning, ADR-074: Keep the Outline-Title Fill Inside Its Hook (+9 more)

### Community 192 - "appFile.ts"

Cohesion: 0.13
Nodes (19): Addendum (2026-10-03), ADR-071: Backend Modules Exist Where There Is a Protocol; One-Shot IPC Stays on `window.electronAPI`, Consequence, Context, Decision, Reasoning, App file, Unreadable app files (+11 more)

### Community 194 - "Integration #3: V8 Optimization for Memory Tracking (Task #8)"

Cohesion: 0.17
Nodes (11): Alpha-Blended Highlight Colors Need a Separate Dark-Mode Check, Animations and Keyframes, `<button>` Inherits index.css's Global Reset, Not Just `display:inline-flex`, Class Name Collisions, Cross-Component Reuse, File Placement, Grid Rows Aren't Shared Across Sibling Grid Containers, Hiding Elements — Use Conditional Rendering, Not `visibility: hidden` (+3 more)

### Community 199 - "DevicePerformanceDetector"

Cohesion: 0.29
Nodes (6): ADR-010: Dictionary Match Sort — Specificity Over Provenance, Alternatives Considered, Consequences, Context, Decision, Rationale

### Community 200 - "ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call"

Cohesion: 0.29
Nodes (6): ADR-077: Keep Shipping the Dictionaries With Each Lookup-Index Call, Consequence, Context, Decision, Evidence, Reasoning

### Community 205 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Behaviour, Change, Design, Design: Semantic Type Filter for Structural Patterns, Files Touched, Problem

### Community 206 - "Chinese-Vietnamese Translation App"

Cohesion: 0.29
Nodes (6): Chinese-Vietnamese Translator — Dev Memory, Comprehensive architecture code review — 14 issues fixed, Fixes Done (2026-02-22, session 19), Key Architectural Invariants (most frequently violated), Session History Index, Stable Project Facts

### Community 209 - "TranslationProfiler"

Cohesion: 0.11
Nodes (13): ADR-018: Unified PerformanceReport State in usePerformanceMonitoring, Decision, Reasoning, Context, ADR-032: Delete PerformanceBaselineTracker's cacheHitRate Machinery, Consequence, Context, Decision (+5 more)

### Community 211 - "Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear"

Cohesion: 0.50
Nodes (4): Fix 1: CRITICAL-1 - Add dispose() before dictionaries.clear(), Impact, Problem, Solution

### Community 225 - "ADR-061: Skip a Shelf Row Module"

Cohesion: 0.09
Nodes (28): ADR-0036, ADR-095: Highlight State Is One Lit Unit, Consequence, Context, Reasoning, CharacterOnlyBridge, Click-to-Highlight Lifecycle, WordSegmentMatcher (+20 more)

### Community 232 - "DictionaryManager"

Cohesion: 0.07
Nodes (22): Addendum (2026-10-09), ADR-034: Skip Building DictionaryManager.validateIntegrity(), Consequence, Decision, Reasoning, ADR-058: Delete the Runtime WASM Parity Validation; Parity Lives in Tests, Consequence, Context (+14 more)

### Community 234 - "ADR-014: DictionaryBackend Owns Load Protocol Only — Save/Move IPC Stays in Provider"

Cohesion: 0.33
Nodes (5): ADR-040: Reject Aho-Corasick as a Swap for the Native Lookup-Index Trie, Consequence, Context, Decision, Reasoning

### Community 235 - "ADR-050: One BookReader Instance per Book"

Cohesion: 0.33
Nodes (5): ADR-031: Skip Splitting dictionary_commands.rs by Concern, Consequence, Context, Decision, Reasoning

### Community 245 - "adr/README.md"

Cohesion: 0.14
Nodes (9): ADR-025: Do Not Replace useDictionaryEntryForm Raw Setters with Named Action Methods, Context, Decision, When to Revisit, ADR-030: `performanceHealth` Is the Sole Barrel Export from `utils/performance`, Consequences, Context, Decision (+1 more)

### Community 246 - "ADR-010: Dictionary Match Sort — Specificity Over Provenance"

Cohesion: 0.25
Nodes (8): Background, Step 1: Write a failing test, Step 2: Run test to verify it fails, Step 3: Add the new block in `buildVariableCache`, Step 4: Run test, Step 5: Run full JS suite, Step 6: Commit, Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`

### Community 250 - "eslint-plugin-import"

Cohesion: 0.33
Nodes (5): ADR-020: Delete WasmDictionaryManager Sync Tracking Instead of Extracting, Context, Decision, If a Performance Dashboard Is Built, Reason

### Community 253 - "Verifying Claims Before Acting"

Cohesion: 0.14
Nodes (12): ADR-091: Skip Extracting translateText from Translator.jsx, Consequence, Context, Decision, Shipped and reverted same-session, 2026-08-16: `semanticArrayValidator` wired into `checkSemanticArrayCorruption`, Verifying Claims Before Acting, TranslationExecutionContext, Window (+4 more)

### Community 256 - "9. Recommendations"

Cohesion: 0.25
Nodes (8): Background, Step 1: No test needed for this visual change — run type-check instead, Step 2: Extend the condition to include patterns, Step 3: Run type-check, Step 4: Run full JS suite, Step 5: Manual smoke test, Step 6: Commit, Task 6: UI — add semantic type selector to pattern entries

### Community 257 - "tauriAPI.ts"

Cohesion: 0.33
Nodes (5): ADR-068: One LRU Module Under Both Dictionary Caches, Consequence, Context, Decision, Reasoning

### Community 258 - "Security Mitigations"

Cohesion: 0.29
Nodes (7): 1. ✅ Local-Only WASM Loading (CRITICAL), 2. Binary hashing and module-structure checks: removed (2026-10-06, ADR-080), 4. ✅ Instance Method Verification, 5. ✅ Graceful Degradation, 6. ✅ Retry Logic with Exponential Backoff, 7. ✅ No Dynamic WASM Loading, Security Mitigations

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

### Community 273 - "Fix 8: BONUS - Fix method name typos in TranslationCache"

Cohesion: 0.40
Nodes (5): Code Quality Improvements, Consistency, Documentation, Error Handling, Maintainability

### Community 276 - "5. State has one owner — do not re-add a local copy"

Cohesion: 0.08
Nodes (34): Context and Problem Statement, ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name, Consequences, Context, Decision, Reason, ADR-102: Keep `utils/toast` as the Notification Seam, Consequence (+26 more)

### Community 281 - "vite.config.ts"

Cohesion: 0.29
Nodes (4): vite, vite-plugin-wasm, @vitejs/plugin-react, vitest

### Community 288 - "ADR-027: Fiction Structural Pattern Dictionaries Coupled to Proper Nouns by Naming Convention at Engine Init"

Cohesion: 0.50
Nodes (4): Fix 4: CRITICAL-2 - Add Drop trait to WASM dictionaries, Impact, Problem, Solution

### Community 290 - "ADR-029: Fiction Structural Pattern Entries Use 'pattern' Source String, Not Dictionary Name"

Cohesion: 0.50
Nodes (4): Fix 8: BONUS - Fix method name typos in TranslationCache, Impact, Problem, Solution

### Community 293 - "src/components/rules — Gotchas"

Cohesion: 0.33
Nodes (5): Compact Toggle-in-a-Table-Cell Pattern, Saving: one writer, one queue, src/components/rules — Gotchas, `TransformRule.relocate` — Renamed from `moveWords: number` 2026-08-24, Two UI Surfaces, One Set of Field Policies

### Community 298 - "TransformRuleValidation.ts"

Cohesion: 0.15
Nodes (26): ADR-056: Skip a Rule-Draft Module, Consequence, Context, Decision, Reasoning, NewRuleModal(), RuleMatchesModalProps, MAX_TRANSFORM_RULE_KEY_LENGTH (+18 more)

### Community 302 - "Keyboard Shortcuts"

Cohesion: 0.40
Nodes (5): Dictionary tab, Global (any tab), Keyboard Shortcuts, Reader tab, Translator tab

### Community 343 - "Documentation Index"

Cohesion: 0.40
Nodes (5): Archive, Decisions, Documentation Index, Guides, Reference

## Knowledge Gaps

- **160 isolated node(s):** `@tauri-apps/plugin-clipboard-manager`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-shell`, `@eslint/js` (+155 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1468 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `Historical / Deleted {#deleted-symbols}` connect `DictionaryTrie` to `dictionary/index.ts`, `Translator.jsx`, `useTranslatorEngine`, `types/DictionaryTypes.ts`, `TransformRuleEngine.ts`, `useDictionaryConfigManagement.ts`, `BookBindingContext.tsx`, `TranslationWindow.ts`, `react`, `DictionaryEntry.tsx`, `EditCommitter.ts`, `ReaderPanel.tsx`, `Content Security Policy (CSP) and WASM Security`, `ADR-090: Keep the tauriAPI Invoke Shell Narrow`, `useReaderPanel.ts`, `logger`, `5. State has one owner — do not re-add a local copy`, `Historical / Deleted {#deleted-symbols}`, `DictionaryTableView.tsx`, `ReadingAnchor`, `TextChunker`, `useReaderPanel.ts`, `SemanticToken`, `TypeScript/Rust Optimization Progress Report`, `react`, `useTransformRules.ts`, `useHotkeyHandler.ts`, `useDictionaryCRUD.ts`, `BookReader.tsx`, `SemanticArrayBuilder`, `High-Priority Issues 🟠`, `7. Clickable Highlighting Feature Analysis`, `TransformRuleValidation.ts`, `PanelRows.ts`, `SemanticArrayBuilder`, `.translateWithProgressiveBatches`, `Domain Glossary`, `BookRecordsBackend.ts`, `ReaderTypes.ts`, `FormattingPasses.ts`, `DictionaryIdClassifier.ts`, `ReadingAnchor.ts`, `ref_types_componenttypes`, `appFile.ts`, `App.jsx`, `SemanticTypes.ts`, `precomputeOriginalSegments`, `useDictionaryModals.tsx`, `mod.rs`, `BookRecordsBackend.ts`, `TranslationEngineTypes.d.ts`, `NumberProcessor`, `TabbedInterface.tsx`, `TranslationProfiler`, `SelectionMapping.ts`, `PersistTimeValidator.ts`, `useColumnMetrics.ts`, `Development Guide`, `BookReader.tsx`, `appearanceConfig.ts`, `ADR-061: Skip a Shelf Row Module`, `WindowedTranslationFill.ts`, `.loadDictionaries`, `DictionaryManager`, `WasmPatternProcessor.js`, `Translator`, `TokenHelpers.ts`, `usePerformanceMonitoring.js`, `TwoPhasePatternProcessor.js`, `useStreamingTranslation`, `BookRecordValidation.ts`, `TwoPhasePatternProcessor`, `Verifying Claims Before Acting`, `TranslationEngine.js`, `PatternStore.js`?**
  _High betweenness centrality (0.430) - this node is a cross-community bridge._
- **Are the 220 inferred relationships involving `Historical / Deleted {#deleted-symbols}` (e.g. with `ClickableOriginalSemantic()` and `BaseSegment`) actually correct?**
  _`Historical / Deleted {#deleted-symbols}` has 220 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@tauri-apps/plugin-clipboard-manager`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener` to the rest of the system?**
  _160 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dictionary_commands.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.06298076923076923 - nodes in this community are weakly interconnected._
- **Why does `is_variable_type_allowed()` connect `SemanticToken` to `two_phase.rs`, `TokenHelpers.ts`, `matcher.rs`, `NumberProcessor`, `wasm_boundary.rs`, `DictionaryTrie`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `logger` (e.g. with `Historical / Deleted {#deleted-symbols}` and `graphify`) actually correct?**
  _`logger` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `temp_test_dir` be split into smaller, more focused modules?**
  _Cohesion score 0.13630229419703105 - nodes in this community are weakly interconnected._
