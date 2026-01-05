# Refactoring Plan: Internal Documentation + Safe Extraction

**Goal**: Make the coupled 5-phase translation system easier to work with through documentation and safe extraction of independent utilities.

**Approach**: Add section markers to large files, extract pure utilities, preserve core coupling.

---

## Part 1: Internal Documentation Headers

### TranslationEngine.js Structure (6,737 lines)

**Identified Major Sections**:

1. **MEMORY MANAGEMENT UTILITIES** (Lines 60-403)
   - `MemoryLeakDetector` class - Memory tracking and leak detection
   - Dependencies: None (pure utility class)
   - **EXTRACTION CANDIDATE**: Can be moved to separate file

2. **CORE ENGINE CLASS** (Lines 404-490)
   - Constructor, initialization, configuration
   - Dependencies: All systems
   - **KEEP COUPLED**: Central coordinator

3. **DICTIONARY OPERATIONS** (Lines 577-626)
   - `findAllMatchesWithSemanticCache()` - Dictionary lookups with caching
   - `syncDictionaries()` - Dictionary synchronization
   - Dependencies: DictionaryManager, caching system
   - **KEEP COUPLED**: Timing-sensitive

4. **SMART MEMORY MANAGEMENT** (Lines 627-885)
   - Initialization, cleanup handlers, profiling
   - Dependencies: Memory detection systems
   - **PARTIAL EXTRACTION**: Cleanup strategies can be extracted

5. **INITIALIZATION** (Lines 887-991)
   - `initialize()` - Engine setup, dictionary loading
   - Dependencies: All systems
   - **KEEP COUPLED**: System coordination

6. **PHASE 0: CHARACTER-ONLY TRANSLATION** (Lines 1045-1340)
   - `translateWithCharactersOnly()` - Character dictionary only
   - `processCharacterOnlyTokens()` - Character lookup logic
   - Dependencies: Dictionary, token state
   - **KEEP COUPLED**: Token modification pattern

7. **MAIN TRANSLATION ENTRY POINTS** (Lines 992-1044, 1342-1451)
   - `translate()` - Main entry point
   - `translateWithSegments()` - Segment-based translation
   - Dependencies: All phases
   - **KEEP COUPLED**: Phase orchestration

8. **PHASE 1: PATTERN PROCESSING** (Lines 1895-2030)
   - `applyPatterns()` - Pattern matching (legacy + hierarchical)
   - `applyHierarchicalResults()` - Apply two-phase pattern results
   - Dependencies: SemanticPatternProcessor, TwoPhasePatternProcessor
   - **KEEP COUPLED**: Token state modification

9. **PHASE 2: PROPER NOUN PROCESSING** (Lines 1453-1625, 1776-1893)
   - `createPhraseGroups()` - Legacy proper noun matching
   - `createOptimalPhraseGroups()` - Optimized proper noun matching
   - `resolveMatchConflicts()` - Pattern vs proper noun conflict resolution
   - Dependencies: Dictionary, pattern results
   - **KEEP COUPLED**: Depends on Phase 1 results

10. **PHASE 3: NUMBER PROCESSING** (Integrated in translateSinglePass)
    - Currently handled by WasmNumberProcessor
    - Dependencies: Token array
    - **KEEP COUPLED**: Token modification

11. **PHASE 4: PHRASE PROCESSING** (Lines 2032-2294)
    - `processRemainingPhrases()` - Entry point
    - `processRemainingPhrasesSequential()` - Sequential processing
    - `processRemainingPhrasesParallel()` - Parallel processing
    - Dependencies: Previous phase results
    - **KEEP COUPLED**: Sequential token consumption

12. **PHASE 5: CHARACTER PROCESSING** (Lines 2693-2873)
    - `applyDictionaryTranslation()` - Character dictionary fallback
    - Dependencies: All previous phases
    - **KEEP COUPLED**: Final fallback

13. **POST-PROCESSING** (Lines 2874-3052)
    - `postProcess()` - Assemble final translation from tokens
    - `cleanupFormatting()` - Punctuation, spacing, capitalization
    - Dependencies: Token state from all phases
    - **KEEP COUPLED**: Requires complete phase results

14. **POSITION MAPPING & SEMANTIC ARRAYS** (Lines 3234-3370)
    - `trackTranslationSegment()` - Track segment positions
    - `updateSegmentPositions()` - Position calculation
    - Dependencies: Semantic array builders
    - **KEEP COUPLED**: Clickable highlighting precision

15. **PROGRESSIVE BATCHING** (Lines 3991-4373)
    - `translateWithProgressiveBatches()` - Batch processing orchestration
    - `processChunksInParallel()` - Parallel chunk processing
    - Dependencies: All phases
    - **KEEP COUPLED**: Phase coordination across chunks

16. **PARALLEL PROCESSING UTILITIES** (Lines 3713-3956)
    - `initializeParallelProcessing()` - Parallel config
    - `processRemainingTokensInBatches()` - Batch processing
    - Dependencies: Phase processing
    - **KEEP COUPLED**: Timing-sensitive

17. **STATS & DEBUGGING** (Lines 3444-3657)
    - `getEngineStats()`, `getPerformanceReport()`, `getDashboardMetrics()`
    - Profiling methods
    - Dependencies: Engine state
    - **EXTRACTION CANDIDATE**: Stats formatting can be extracted

18. **HELPER UTILITIES** (Scattered throughout)
    - `getSemanticTokens()` - Token filtering
    - `getTokenSpanForText()` - Text-to-token mapping
    - `reconstructChineseText()` - Text reconstruction
    - **EXTRACTION CANDIDATE**: Pure functions

---

### Translator.jsx Structure (2,566 lines)

**Identified Major Sections**:

1. **STATE MANAGEMENT** (Lines 1-200)
   - `highlightingReducer` - Atomic highlighting state
   - Position mapping functions
   - **PARTIAL EXTRACTION**: Reducers can be extracted

2. **MAIN COMPONENT SETUP** (Lines 220-450)
   - State declarations, refs
   - Custom hooks integration
   - Dependencies: All UI state
   - **KEEP COUPLED**: Central UI coordinator

3. **TRANSLATION OPERATIONS** (Lines 450-850)
   - `handleTranslate()` - Main translation handler
   - `handleCharacterOnlyTranslate()` - Character-only mode
   - Dependencies: TranslationEngine, UI state
   - **KEEP COUPLED**: Cross-mode synchronization

4. **HIGHLIGHTING & INTERACTION** (Lines 850-1200)
   - Click handlers for segments
   - Bridge between modes
   - Dependencies: Multiple state variables
   - **KEEP COUPLED**: Timing-sensitive state updates

5. **DICTIONARY OPERATIONS** (Lines 1200-1500)
   - Quick add, reload, configuration
   - Dependencies: DictionaryContext, TranslationEngine
   - **KEEP COUPLED**: Configuration timing

6. **SCROLL MANAGEMENT** (Already extracted successfully)
   - Position capture/restore
   - Dependencies: DOM refs
   - ✅ **SUCCESSFULLY EXTRACTED**: Example of good pattern

7. **UI RENDERING** (Lines 1800-2566)
   - Controls (already extracted to TranslatorControls.tsx)
   - Display panels (already extracted to TranslatorDisplayPanels.tsx)
   - ✅ **SUCCESSFULLY EXTRACTED**: Example of good pattern

---

## Part 2: Safe Extraction Candidates

### High Priority (Pure Utilities)

1. **MemoryLeakDetector** → `src/utils/MemoryLeakDetector.js`
   - Zero dependencies on engine state
   - Pure memory tracking logic
   - Currently 343 lines embedded in TranslationEngine.js

2. **Stats Formatters** → `src/utils/TranslationStatsFormatter.js`
   - `formatEngineStats()`, `formatPerformanceReport()`, `formatDashboardMetrics()`
   - Pure data transformation
   - Currently scattered in TranslationEngine.js

3. **Token Helper Utilities** → `src/utils/TokenHelpers.js`
   - `getSemanticTokens(tokens)` - Filter semantic tokens
   - `getTokenSpanForText(tokens, startIndex, text)` - Calculate token span
   - `reconstructChineseText(tokens)` - Rebuild Chinese text
   - `getTextFromTokens(tokens)` - Extract text from tokens
   - Pure functions, no state modification

4. **Priority Calculation** → `src/utils/PriorityCalculator.js`
   - Pattern priority calculation logic
   - Pure function based on match characteristics
   - Currently in SemanticPatternProcessor.js

5. **Token Validators** → `src/utils/TokenValidators.js`
   - `isTokenConsumed(token)` - Check if token consumed
   - `isTokenProcessed(token)` - Check if token processed
   - `hasTokenConflict(tokens, startIndex, endIndex)` - Check conflicts
   - Pure validation functions

6. **Highlighting Reducer** → `src/reducers/highlightingReducer.js`
   - Already well-isolated in Translator.jsx
   - Pure state transformation
   - Zero dependencies

### Medium Priority (Careful Extraction)

7. **Cleanup Strategies** → `src/utils/CleanupStrategies.js`
   - Emergency cleanup logic
   - High priority cleanup logic
   - Background cleanup logic
   - Requires careful parameter passing

8. **Match Conflict Resolution** → `src/utils/MatchConflictResolver.js`
   - `resolveMatchConflicts()` logic
   - `resolvePhrasePriorityConflicts()` logic
   - Pure conflict resolution algorithms

### Low Priority (Keep for Now)

9. **Phase-specific processing** - Too coupled to extract safely
10. **Dictionary operations** - Timing-sensitive
11. **Semantic array building** - Position precision critical

---

## Part 3: Extraction Strategy

### Step 1: Add Documentation Headers (Non-Breaking)
- Add section markers to TranslationEngine.js
- Add section markers to Translator.jsx
- No functionality changes

### Step 2: Extract Pure Utilities (Low Risk)
- Extract MemoryLeakDetector first (zero dependencies)
- Extract Token Helpers
- Extract Stats Formatters
- Extract Validators
- Each extraction: Verify translation quality unchanged

### Step 3: Extract Reducers/Formatters (Medium Risk)
- Extract highlighting reducer
- Extract cleanup strategies
- Test thoroughly after each

### Step 4: Document Success Pattern
- Update CLAUDE.md with "Successful Extractions" section
- Document what was extracted and why it worked
- Document what remains coupled and why

---

## Success Criteria

✅ **Documentation complete** when:
- All major sections have clear boundary markers
- Each section documents dependencies
- Engineers can navigate to specific phases quickly

✅ **Extraction successful** when:
- TranslationEngine.js reduced by 500+ lines
- Translation quality: 100% identical (run full test suite)
- Clickable highlighting: 100% functional
- No performance regression

✅ **Maintainability improved** when:
- New developers can find code faster
- Pure utilities testable in isolation
- Core coupling clearly documented

---

## Risk Mitigation

**Before Each Extraction**:
1. Run full translation test suite
2. Test clickable highlighting on 2000+ char text
3. Verify memory cleanup still works
4. Check performance benchmarks

**After Each Extraction**:
1. Re-run all tests
2. Manual QA on complex translations
3. Git commit with clear message
4. Document in CLAUDE.md

**Rollback Triggers**:
- Any translation quality degradation
- Clickable highlighting position errors
- Memory leak introduction
- Performance regression >5%
