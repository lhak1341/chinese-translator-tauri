# Troubleshooting Guide

This guide provides systematic diagnosis frameworks for common translation issues, clickable highlighting problems, cache issues, and development process lessons.

---

## When Translation Is Wrong

**Systematic diagnosis framework:**

### Step 1: Check Translation Cache

```bash
# Click "Reload Dictionary" button (clears cache + reloads dictionaries)
```

**Why first**: `TranslationSegmentCache` stores results in localStorage, persists across restarts, can serve stale/corrupted translations despite code fixes.

### Step 2: Verify Execution Path

```javascript
// Add at function entry to confirm code is running
console.log('🔍 Function called:', { inputLength: text.length });
```

**Common issue**: Function not called due to configuration state problems or disabled features.

### Step 3: Check Phase Processing

```javascript
// TranslationEngine.js - verify which phases execute
console.log('🔍 Phase A results:', phaseAResults.length);
console.log('🔍 Phase B results:', phaseBResults.length);
console.log('🔍 Final results:', finalResults.length);
```

**Pattern**: Missing results indicate phase not executing or filtering results incorrectly.

### Step 4: Verify Dictionary Entries

```javascript
// Check if entry exists in dictionary
console.log(
  '🔍 Pattern exists:',
  patterns.find((p) => p.originalPattern === '在XY中')
);
console.log('🔍 Priority:', pattern.metadata.priority);
```

**Pattern**: Entry exists but wrong pattern wins due to priority calculation.

### Step 5: Test Pattern Competition

```javascript
// When multiple patterns match same text
// Higher priority wins, check priorities:
console.log(
  '🔍 Pattern competition:',
  matches.map((m) => ({
    pattern: m.pattern.originalPattern,
    priority: m.pattern.metadata.priority,
    lowPriority: m.pattern.metadata.lowPriority,
  }))
);
```

**Solution**: Use `lowPriority: true` flag on overly generic patterns to allow specific patterns to win (−12 priority penalty).

**Archive**: See `docs/archive/pattern-optimization/PATTERN_MATCHING_*.md` for pattern matching algorithm optimizations and troubleshooting.

---

## When Clickable Highlighting Is Wrong

**Systematic diagnosis framework:**

### Step 1: Identify Which Mode Has the Bug

- Character-only (bottom-left panel): Debug `SegmentPrecomputer.js`
- Full Translation (right panel): Debug `TranslationEngine.js:5184-5350`

**Common symptom**: Word split into clickable + non-clickable parts (e.g., "màu" → "mà" + "u")

### Step 2: Add Diagnostic Logging to Verify Segment Creation

```javascript
// For Full Translation, add in TranslationEngine.js around line 5280:
if (position >= 0) {
  if (wordInfo.translated.includes('problematic-word')) {
    logger.warn('🔍 Creating segment:', {
      translated: wordInfo.translated,
      translatedLength: wordInfo.translated.length,
      position,
      currentPosition,
      textAtPosition: cleanedFinalResult.substring(position, position + 10),
      extractedText: cleanedFinalResult.substring(position, position + wordInfo.translated.length),
    });
  }
}
```

**What to check**:

- `translated`: What's in the semantic array
- `extractedText`: What's being extracted from the output
- Mismatch = substring collision or encoding issue

### Step 3: Check Semantic Array Contents

```javascript
// Add in SemanticArrayBuilder.js or OptimizedSemanticArrayBuilder.js addUnit():
if (translatedText && translatedText.includes('problematic-word')) {
  logger.warn('🔍 addUnit() called:', {
    originalText,
    translatedText,
    translatedLength: translatedText.length,
    source,
  });
}
```

**What to check**:

- Is the semantic array being populated with the correct value?
- Multiple entries for similar words? (e.g., "mà" and "màu trắng")

### Real Bug Example (Jan 2025): "màu" split into "mà" + "u"

**Root cause**: Semantic array had TWO entries:

- "而" → "mà" (2 chars)
- "白色" → "màu trắng" (9 chars)

When searching the output text, "mà" matched first (inside "màu trắng"), blocking the correct match.

**Fix**: Sort candidate words by length (longest first) before matching:

```javascript
// TranslationEngine.js:5214
candidateWords.sort((a, b) => b.translated.length - a.translated.length);
```

**Pattern**: Always match longer words before shorter words to prevent substring collisions.

---

## When Cache Serves Wrong Translation

**Pattern**: Semantic cache returns character-level translations instead of proper noun translations, violating 5-phase priority.

**Symptoms:**

- Dictionary entry exists but not translating (character fallback used)
- Mixed translation quality (some proper nouns work, others don't)
- Cache hit rate looks good but accuracy degraded

**Root cause**: `SemanticTranslationCache` served cached results without respecting phase priority.

**Diagnostic steps:**

1. Check cache vs dictionary: Verify entry exists but cache serves different result
2. Phase priority analysis: Lower phases (proper nouns=2) must override higher phases (characters=5)
3. Cache metadata inspection: Check if cached result includes `phasePriority` metadata

**Solution pattern**: Phase-aware caching with priority validation

```javascript
// CORRECT: Check phase priority before serving cache
const cacheResult = semanticTranslationCache.get(text, source);
if (cacheResult && cacheResult.metadata.phasePriority <= currentPhasePriority) {
  return cacheResult.result; // Safe to use
}
```

**Implementation**: `TranslationEngine.js:567-636` validates phase priority before serving cached results.

**Resolution**: Click "Reload Dictionary" button - clears all caches including semantic cache.

---

## Development Process Lessons

### Lesson 1: Verify Execution Before Fixing Logic

**Pattern**: Modified code multiple times, rebuilt WASM, cleared caches - but function never called.

**Prevention**:

1. **Verify execution path**: `grep "functionName(" src/` - Is it called?
2. **Check expected logs**: Missing logs = code not running
3. **Add entry point log**: `console.log('🔍 Function called')` - Confirm execution
4. **Then fix logic**: Only modify after verifying reachable

**Template**:

```bash
# Step 1: Verify import
grep "processNumbersWasm" src/utils/TranslationEngine.js

# Step 2: Verify invocation (look for actual call with parentheses)
grep "processNumbersWasm(" src/utils/TranslationEngine.js

# Step 3: Check console logs
# Missing = execution path problem, seeing logs = logic problem
```

### Lesson 2: Test Production Builds During Development

**Pattern**: Dev build worked, production completely failed (CSP blocked WASM in production).

**Prevention**:

- Test production builds during development, not just before release
- Different bundling = different issues (Vite transforms differently)
- Different protocols = different loading (`http://` vs `asset://`)
- Different CSP = different restrictions (relaxed in dev, strict in prod)

**Weekly check**:

```bash
npm run tauri:build
open "src-tauri/target/release/bundle/macos/App.app"
# Quick smoke test critical features
```

### Lesson 3: Type Boundaries Need Explicit Contracts

**Pattern**: Rust `Option::None` became JavaScript `undefined`, displayed as literal "undefined" text.

**Prevention**:

- Document type conversions at boundaries (Rust ↔ JS, WASM ↔ JS)
- Add runtime validation for WASM responses
- Use TypeScript interfaces for WASM-returned types
- Explicit null handling at all boundary crossings

**TypeScript contract** (add to `types/WasmTypes.d.ts`):

```typescript
interface WasmToken {
  translated: string | null; // Explicit: null allowed, undefined NOT allowed
}

function validateWasmToken(token: unknown): WasmToken {
  if (token.translated === undefined) {
    throw new Error('WASM returned undefined instead of null');
  }
  return token as WasmToken;
}
```

### Lesson 4: Follow Existing Patterns

**Pattern**: First attempt replaced entire array, breaking object references. Should have checked how JavaScript `numberProcessor.processTokens()` works first.

**Prevention**:

- Check existing implementations before adding new ones
- Match modification patterns (in-place vs replacement)
- `grep "processTokens(" src/` - How do others do it?

---

## Error Handling Patterns

### React Async Error Boundaries Pattern

Error boundaries don't catch errors in async callbacks. Wrap all async operations in try-catch with toast notifications.

```typescript
// CRITICAL-1: React async operations
const addEntry = useCallback(
  async (dictionaryId: string, source: string, translation: string) => {
    try {
      // Validation
      const validationError = validateDictionaryEntry(dictionaryId, source, translation);
      if (validationError) {
        toast.error(`Invalid entry: ${validationError}`);
        throw new Error(validationError);
      }

      // Optimistic update
      const oldData = { ...dictionaries[dictionaryId] };
      setDictionaries((prev) => ({ ...prev, [dictionaryId]: newData }));

      // Persist to backend
      const result = await window.electronAPI.saveDictionary(dictionaryId, newData);

      if (result.success) {
        toast.success('Entry added successfully');
      } else {
        // Rollback on failure
        setDictionaries((prev) => ({ ...prev, [dictionaryId]: oldData }));
        toast.error(`Save failed: ${result.error}. Changes reverted.`);
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error adding dictionary entry:', error);
      if (!(error instanceof Error && error.message.includes('Invalid entry'))) {
        toast.error(`Could not add entry: ${error.message}`);
      }
      throw error;
    }
  },
  [dictionaries]
);
```

**Key principles:**

- Try-catch wraps entire async operation
- Optimistic updates with rollback on failure
- Toast notifications for all outcomes (success, validation, failure)
- Don't re-toast validation errors (already shown)

**Implementation**: `LazyDictionaryContext.tsx:addEntry()`, `updateEntry()`, `deleteEntry()`, `undo()`, `redo()`

### WASM Graceful Degradation Pattern

WASM modules may fail to initialize. Return empty results instead of throwing to allow app to continue with reduced functionality.

```javascript
// CRITICAL-2: WASM pattern processor
export async function processTokensWasm(semanticTokens, variableCache) {
  if (!wasmPatternProcessor) {
    console.warn('⚠️ WASM Pattern Processor not initialized - skipping pattern processing');
    console.warn('Translation will continue with lower quality (no pattern matching)');
    return []; // Graceful degradation, don't block translation
  }

  try {
    return wasmPatternProcessor.processTokens(semanticTokens, variableCache);
  } catch (error) {
    console.error('❌ Error in WASM pattern processing, skipping patterns:', error);
    return []; // Don't propagate error, allow translation to continue
  }
}
```

**Key principles:**

- Check initialization before use
- Warn user about degraded functionality
- Return empty results (not null/undefined)
- Catch and log errors without propagating

**Implementation**: `WasmPatternProcessor.js:processTokensWasm()`, `WasmDictionaryManager.js:findMatches()`

### Initialization Error Recovery Pattern

Critical initialization failures need user-visible errors with recovery options.

```javascript
// CRITICAL-3: Translation engine initialization
const [initializationError, setInitializationError] = useState(null);

useEffect(() => {
  async function initializeEngine() {
    try {
      engineRef.current = createTranslationEngine();
      await engineRef.current.initialize(filteredDictionaries, {...});
      setEngineInitialized(true);
      setInitializationError(null);
    } catch (error) {
      console.error('Failed to initialize engine:', error);
      setEngineInitialized(false);
      const errorMsg = error instanceof Error ? error.message : 'Unknown initialization error';
      setInitializationError(errorMsg);
      toast.error(`Engine initialization failed: ${errorMsg}. Try reloading dictionaries.`, {
        duration: 10000,
      });
    }
  }
  initializeEngine();
}, [filteredDictionaries]);

// In render:
{initializationError && (
  <div style={{ backgroundColor: '#fef2f2', borderLeft: '4px solid #dc2626', padding: '1rem' }}>
    <strong style={{ color: '#dc2626' }}>⚠️ Translation Engine Error</strong>
    <div style={{ color: '#991b1b' }}>{initializationError}</div>
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button onClick={handleForceReload}>Reload Dictionaries</button>
      <button onClick={() => window.location.reload()}>Reload App</button>
    </div>
  </div>
)}
```

**Key principles:**

- State tracks initialization errors
- Error banner visible to user
- Provide recovery actions (reload dictionaries, reload app)
- Long toast duration (10s) for critical errors

**Implementation**: `Translator.jsx:initializationError state`

### Fallback Mode Notification Pattern

When performance-critical systems degrade to slower fallbacks, notify users once.

```javascript
// HIGH-2: Rust lookup index fallback
handleFailure(error) {
  this.consecutiveFailures++;

  if (this.consecutiveFailures >= this.maxFailuresBeforeFallback) {
    console.warn('🚨 Too many Rust lookup index failures, disabling Rust implementation');
    this.enabled = false;

    // One-time notification
    if (!this.showedFallbackWarning) {
      toast.warning(
        'High-performance indexing unavailable. Large texts may translate slower.',
        { duration: 5000 }
      );
      this.showedFallbackWarning = true;
    }
  }
}
```

**Key principles:**

- Track consecutive failures (not total)
- One-time notification (boolean flag prevents spam)
- Warn about performance impact
- Clear, actionable message

**Implementation**: `RustLookupIndexManager.js:handleFailure()`, `WasmDictionaryManager.js:handleFailure()`

### Configuration Validation Pattern

All external data (configuration files, dictionaries) must be validated before use to prevent crashes from corrupted or malicious input.

```typescript
// CRITICAL: Configuration loading with validation (January 2026)
import {
  validateElectronResult,
  validateConfiguration,
  validateDictionary,
  type AppConfiguration,
  type Dictionary,
} from '../utils/configValidation';

// Step 1: Validate ElectronAPI result structure
const rawResult = await window.electronAPI.loadConfiguration();
const configResult = validateElectronResult<AppConfiguration>(rawResult, 'loadConfiguration');

// Step 2: Validate configuration data with safe defaults
if (configResult.success && configResult.data) {
  const validatedConfig = validateConfiguration(configResult.data);

  // Use validated data (guaranteed safe types, defaults for invalid fields)
  const selectedDictionary = validatedConfig.defaultQuickAddDictionary;
} else {
  // Handle load failure
  logger.warn(`Configuration load failed: ${configResult.error}`);
  // Use fallback logic
}

// Dictionary validation
const rawDict = await window.electronAPI.loadDictionary(dictId);
const dictResult = validateElectronResult<Dictionary>(rawDict, `loadDictionary(${dictId})`);

if (dictResult.success && dictResult.data) {
  const validatedDict = validateDictionary(dictResult.data, dictId);
  // Use validatedDict (invalid entries omitted, valid entries preserved)
}
```

**Key principles:**

- **Two-phase validation**: Validate result structure first, then data contents
- **Safe defaults**: Invalid fields get sensible defaults instead of crashing
- **Type safety**: TypeScript interfaces enforce expected structure
- **Graceful degradation**: Invalid entries skipped, valid entries preserved
- **Security**: Prevents type confusion, injection attacks, malformed data crashes

**Validation functions:**

- `validateElectronResult()` - Validates result structure (success/data/error fields)
- `validateConfiguration()` - Validates app config with defaults for invalid fields
- `validateDictionary()` - Validates entire dictionary, skips invalid entries
- `validateDictionaryEntry()` - Validates single entry (string or complex metadata)
- `validateDictionaryList()` - Validates array of dictionary IDs
- `sanitizeString()` - Removes control characters, limits length

**Implementation**: `configValidation.ts` (validation functions), `useDictionaryConfig.js:90-115` (config loading), `Translator.jsx:1938-1969` (dictionary loading)

**Test Coverage**: 41 tests in `configValidation.test.ts` verify all validation patterns, including security edge cases.

**Test Coverage**: 84 tests across 5 test files verify all error handling patterns.

---

## Resolved Bug Postmortems

Moved out of root `CLAUDE.md` 2026-08-13 (agent-config-hygiene audit) — the one-line actionable rule stays in `CLAUDE.md`, full narrative lives here.

### `useEngineReinitializer.js` WASM-sync-validation status check

`useEngineReinitializer.js`'s WASM-sync-validation status check (`'PASS'`/`'FAIL_DIFFERENCES'`/`'FAIL_ERRORS'`) never matched what `DictionaryManager.validateWasmFallback()` actually returns (`'PENDING'`/`'SKIPPED'`/`'PASSED'`/`'FAILED'`) — only `'SKIPPED'` ever matched. In production this meant the success log never fired on a passing sync, and — more importantly — **the user-facing toast warning on a real WASM/JS mismatch never fired either**, since neither `'FAILED'` nor any of the checked strings matched. `useEngineReinitializer.test.js` masked this by mocking `validateWasmFallback` to return the wrong strings the consumer expected, not what the real implementation produces — tests were green while the integration was broken. The mismatch-count toast also read `syncStatus.results.different`, a field that has never existed on the real `results` object (`{tested, passed, failed, wasmErrors, jsErrors}`) — would have printed "undefined mismatches". Fixed: `useEngineReinitializer.js` now checks the real status strings and branches on `results.wasmErrors`/`jsErrors` (not a nonexistent `FAIL_ERRORS` status) to distinguish the two failure toasts; `results.failed` (not `.different`) feeds the mismatch count. `WasmValidationResult.status` and `WasmValidationResults` in `DictionaryManagerTypes.d.ts` were documenting this same wrong contract — fixed to match the real implementation.

### Pattern substitution and constructor option, 2026-07-30

Found via architecture review candidate #3 grilling — unskipping a stale `TranslationEngine.integration.test.js` block surfaced both:

1. `SemanticPatternProcessor.convertPrioritizedPatternToMatchResult` (`src/utils/pattern/SemanticPatternProcessor.js`) hardcoded `.replace('X', ...)` for every variable token regardless of which variable it actually filled. Any pattern with 2+ distinct variables (e.g. `"X的Y"`, or ADR-004's own canonical `"在XY中"` example) only ever filled the first one — the second `.replace('X', ...)` found no more literal `'X'` in the template and silently no-op'd, leaving `'Y'` untranslated in the output. This path is live in production: `applyPatterns()` falls onto it after 3 WASM failures (ADR-007's documented fallback), so any multi-variable structural pattern hit wrong output whenever that fallback engaged. Fixed: substitution now uses `pattern.tokens[i - startIndex].name` (the actual declared variable letter) instead of a hardcoded `'X'`. Regression test: `SemanticPatternProcessor.test.js`'s "prioritizedPatterns — multi-variable substitution" block — confirmed the bug reproduces exactly (`"Y của mèo"` instead of `"chó của mèo"`) by reverting the fix and rerunning.
2. `TranslationEngine`'s constructor hardcodes `this.settings.enableTwoPhasePatterns = true` — passing `enableTwoPhasePatterns` as a constructor option does nothing at all. The real (previously unwired) contract is `initialize(dictionaries, options)`'s `options.patternSettings` — already declared in `TranslationEngineTypes.d.ts` (`TranslationEngineInitOptions.patternSettings?: PatternProcessingSettings`) but never once referenced in the real implementation before this fix. Fixed: `initialize()` now merges `options.patternSettings` onto `this.settings` if provided.

### Shipped and reverted same-session, 2026-08-16: `semanticArrayValidator` wired into `checkSemanticArrayCorruption`

Wired `semanticArrayValidator.validateAllPositions()` (checks `translatedStart`/`translatedEnd`) into `TranslationEngine.js`'s per-phase `checkSemanticArrayCorruption` — broken on two independent counts: those fields stay `-1` until `postProcess` sets them _after_ all 5 phases finish (so the check read not-yet-computed data on every one of its 5 call sites, 100% false-positive toast on every translation), and even once set they're documented as char-only-exclusive — never read by the full-translation highlighting path this engine serves. Reverted; see `src/utils/CLAUDE.md`'s `checkSemanticArrayCorruption` entry for the field-timing detail. `hasValidPositions`/`validateAllPositions` are dead again with no known safe integration point on the full-translation path.

## Verifying Claims Before Acting

Moved out of root `CLAUDE.md` 2026-08-17 (agent-config-hygiene restructure) — the discipline is genuinely global, but the dated instance log had grown into one unbounded paragraph. The rule: **verify any specific claim — from an Explore subagent, a saved architecture-review report, an ADR, a `.d.ts` file, or a `CONTEXT.md`/`CLAUDE.md` entry — with a direct `Grep` or `Read` before acting on it, especially before deleting or refactoring based on "unused" or "nonexistent."**

**Explore subagents fabricate specific technical details** — method names, usage counts, file paths, exact quoted comment/code text, and recency/commit-age claims (seen: an invented "CODE REVIEW FIX" comment conflated from a different file; a "this was added one commit ago" claim that git blame traced to the initial migration instead). This includes claims baked into a saved architecture-review HTML report from a prior run, not just live subagent replies — a report card naming the wrong file or citing a nonexistent test still needs re-verification before you build on it.

**Verify "has a test file" separately from "has a production caller"** — dead-code sweeps have been fooled by exports whose only caller is their own test.

**When verifying a "zero callers" dead-code claim, re-check that the caller search didn't exclude the target file's own directory** — a sibling file in the same directory is a legitimate caller (caught twice: 2026-07-18, `BackgroundCleanupManager`/`ComponentMemoryProfiler` were "dead" only because the grep excluded `src/utils/memory/` itself, missing `SmartMemoryCoordinator.ts` next door). A "trivial body, therefore dead" conclusion needs the same check even when the trivial-body fact is true — a wrapper can still be a load-bearing named seam. Found: `useTranslationResults.js`'s `setStreamingText` looked like a pure rename with zero behavior, but is a named param threaded across 3 files (`Translator.jsx`, `useAutoTranslateTrigger.ts`, `useReloadRetranslate.js`) via this codebase's `TranslationExecutionContext`/`forceReloadCtx`-style dependency-injection pattern — deleting it would have forced a raw `useState` setter into those contracts instead.

**Architecture-review "duplication" scope is unreliable, not just individual facts** — every candidate from a `/improve-codebase-architecture` report needs its described overlap re-diffed against the real files before designing a fix. Instance log:

- Initial finding: seen overstated (35 claimed lines → ~10 real) and understated (undersold divergence; "not worth it" reversed) in the same session. Ground-truth the actual files, don't design off the report card's line-count claim.
- 2026-07-29 grilling round, for _behavior_ not line counts: a "DictionaryMatchLookup can't be tested without a live DictionaryManager" claim was false (both extractions already had standalone tests with stub closures) — see ADR-035; a "destroyEngine bypasses destroy()" claim was false (it called destroy() correctly). Re-verify behavioral claims, not just duplication-scope numbers, before designing a fix.
- 2026-08-07: candidate #4's "breaks true ties" claim (Rust lookup-index `priority` field carrying an array index instead of the real dictionary priority) traced out to zero behavioral impact — Rust's per-position match collection is always in `dictionaryOrder` order regardless of cross-position parallelism, and the shared comparator's stable sort preserves that same order on a real tie. Fixed anyway as interface honesty/future-proofing, not as a behavior fix — but the report card's "breaks true ties" framing overstated it as an active correctness bug.
- 2026-08-15 grilling round, for _arithmetic_, not overlap/behavior claims: candidate #2's "shrink branch increases batch size 2→3" was mathematically wrong — the guard `currentBatchSize > MIN_BATCH_SIZE` blocks that branch entirely at size 2, so it can't fire at all; real bug was the shrink safety net going silently inert below the floor, not inverting. Candidate #4's "3 sites in one method" diagnostic-check count was also wrong — real split was 2 sites in that method + 1 in a different, unrelated method. Both caught only by re-grepping/re-reading the exact cited code before implementing, not by trusting the report card's numbers.
- 2026-08-16: candidate #1's "SemanticArrayValidator is orphaned, delete it" was half-wrong — `validateArrays` was a byte-for-byte duplicate of `SemanticArrayBuilder`'s live private method, not dead; correct fix was deleting the private copy and delegating to the tested standalone module, not deleting the module. But verifying "zero callers" on the candidate's OTHER two methods (`hasValidPositions`/`validateAllPositions`) didn't guarantee a _found_ integration point was a _correct_ one — a same-session attempt to wire them into `TranslationEngine.js` shipped a live false-positive-toast bug before being reverted (see the postmortem above).
- Confirmed 3-for-3 in the 2026-08-17 grilling round, but for _premise_, not facts/arithmetic: candidate #2's "streaming vs finalized highlighting can visibly diverge" was false — traced to the UI consumer and found the entire streaming-segment output was write-only, never rendered; candidate #1's "45 lines duplicated" was mostly two intentional, tested behavior splits (NFC-normalize, segment-building), not drift — only ~35 lines of real shared spacing logic; candidate #3's dead-code claim was correct, but the test cited as covering that code path didn't actually exercise it (passed by coincidence). Trace every "X and Y diverge/duplicate" claim to its real consumer or test assertion before designing the fix, not just to the cited line numbers.
- Confirmed again the same day, second implementation round (2026-08-17, candidates #2 and #4 grilling): candidate #2's "all three translate methods are dead" was half-wrong — `translateDirectly()`/`translateWithChunking()` are live via a second, indirect call path (`processChunksInParallel`, called from the live progressive-batch path) the original report never traced; only the top-level `translate()` dispatcher was actually dead. Candidate #4's ADR-003 citation was a flat misread — that ADR governs JS-vs-TypeScript migration, not decomposition, and says nothing forbidding the extraction it was cited against. Check every indirect/recursive call path before accepting a "fully dead" claim, and re-read a cited ADR's actual subject before accepting a claimed conflict.
- 2026-07-30 grilling round, for the candidate's own _framing_, not just its facts: candidate #2's "3 tiers" claim was actually 2 orthogonal axes (trie-walk vs WASM-parallel are sub-modes within one axis, not separate tiers); candidate #5's "shared dual-consumer contract" claim overstated fan-out — of `SemanticArrayMetadata`'s 9 fields, only 2 (`tokenIndex`, `source`) are genuinely dual-consumed, 4 are char-only-exclusive, 2 have zero real readers today, and 3 of the original "6 gotchas" cited weren't even about this type (they were Token-level fields on a different data structure). Re-derive the model from real code before writing anything down, not just the individual facts.
- 2026-08-25 grilling round, for _algorithmic_ claims, not scope/premise: candidate 4's `.includes()` "bug" in `CharacterOnlyBridge`'s occurrence scoring reversed outright — a worked example (mixed-granularity source units embedding an earlier textual occurrence) showed removing it would introduce the exact regression it was accused of causing; pinned with a comment + test instead of "fixed." Candidate 3's "2 of 3 siblings sanitize consistently" was also imprecise — real state: `source` unsanitized in all 3, only one sanitized zero of its two free-text fields. Constructing a concrete worked example, not just re-reading the cited lines, is what caught the reversal.

**A candidate citing a prior ADR as precedent for deferring/rejecting an idea needs the ADR's actual blocking CONDITION checked, not just its existence.** ADR-033 deferred a pattern-matcher parity test because no trusted oracle existed on either side; a later candidate cited it for a tokenizer parity test where fixture-based oracles already existed on both sides, and the precedent didn't actually transfer (see ADR-033 vs the resolved candidate #6 in CONTEXT.md's TextTokenizer entry).

**ADRs drift factually even when their decisions hold — confirmed empirically (2026-07-28, full 34-ADR audit).** File paths, processor/caller counts, and described mechanisms in ADR bodies go stale as code refactors (e.g., "three WASM processors" after one was deleted and two others adopted the pattern; a cache-invalidation mechanism fully replaced by a single `destroy()` call). ~1/3 of ADRs needed a correction; 2 needed "Superseded" status. Verify an ADR's factual claims against current code before citing it — same discipline as the `.d.ts`/`CONTEXT.md` warnings below. **Deleting code an ADR's Consequence section names as a fallback** ("can be wired up later") stales the ADR — add a dated addendum noting the fallback no longer exists, don't leave it silently wrong. Example: `ADR-034` addendum, 2026-08-06 (the trie-level `validateIntegrity`/`repair`/`getHealthScore` methods it left as a future-wiring fallback were themselves deleted 9 days later as confirmed dead code).

**Ambient `.d.ts` types can encode the wrong contract:** `checkJs: false` means nothing validates `src/types/*.d.ts` against real runtime behavior — found drifted to match a _buggy consumer's_ expectation instead of the real producer at least 3 times (a dead getter's return type; a status-string enum matching a hook's wrong check instead of what the method actually returns; `ThrottledStreamingState` under-declaring 2 real runtime fields). Verify a `.d.ts` claim against the real implementation before trusting it, especially before fixing a consumer to match the type instead of the other way around. Before diagnosing a `.d.ts`-surfaced type error as a live runtime bug, trace the actual data flow (e.g. a passthrough hook) — the type may just be incomplete, not the data. Related: **`tsc --noEmit` does NOT catch broken internal `.d.ts` references** — `skipLibCheck: true` silently suppresses type errors _inside_ any `.d.ts` file, including a completely undefined identifier. When pruning declarations from a `.d.ts` file, manually trace which "orphaned" declarations are actually referenced by declarations you're keeping (same-file, no import needed) — `tsc` will not warn you. Watch for `export type {...} from '<path>'` barrel re-exports too — a reference style plain import-statement regexes miss because it starts with `export`, not `import`.

**In-code JSDoc "EXECUTION PATH"/"Called from" comment blocks drift from real callers too — same family as `.d.ts`/ADR drift above.** Found 2026-08-17: `ChunkPostProcessor.js`'s `reconstructText`/`reconstructTextWithSegments` doc comments both claimed a char-only-mode/full-translation-mode split; grepped real callers and found both are full-translation-only, split instead by progressive-batch-fast-path vs single-pass-needs-segments-inline. Grep real callers before trusting a method's own claimed "Used by"/"Called from" doc lines, especially before using them to justify a design decision.

**`CONTEXT.md` glossary entries have no tooling verifying them against real code** — same drift risk as the `.d.ts` warning above. Found 3 stale entries in one pass (2 pre-existing): `SystemPerformanceMonitor` still said "four integration adapters" after `ContentAwarePositionCache` was deleted (3 remain); `PerformanceHealth` still documented a `cacheHitRate` param removed earlier than that. Verify an entry against the real module before trusting it, especially one describing code you're about to touch. **Deleting a `CONTEXT.md`/`CLAUDE.md` glossary-style entry:** read the full entry through to the next `##` heading before building the `Edit` `old_string` — a partial-window `Read` can miss a trailing paragraph, and a partial-match delete leaves it orphaned with no error, only a follow-up grep catches it.

**A scoped `CLAUDE.md`'s own "deliberate keep" rationale can itself be stale** — confirmed 2026-08-25: `wasm-core/CLAUDE.md` documented `number_processor.rs` as intentionally "kept as the spec/test suite for JS `NumberProcessor.js` (155 tests validate parity)," but the real count was 35, the suite was never wired into CI, and one existing test discarded its result instead of asserting on it (`let _ = ...`). The retention rationale itself was correct; the specific claims backing it were not. Verify counts/enforcement claims in any "why we kept this" note before citing it, same as the ADR/`.d.ts`/`CONTEXT.md` entries above.

**Common method names collide across unrelated classes** (`getCacheStats`, `getPerformanceReport`, `clearAll`, etc.) — when grepping to confirm "zero callers," verify each hit actually belongs to the class in question, not a same-named sibling. Caught twice in one session (2026-08-06): `TranslationEngine.getPerformanceReport()` vs `WasmDictionaryManager.getPerformanceReport()`; `DebugObjectPool.getCacheStats()` vs `DictionaryManager.getCacheStats()`. Caught twice more 2026-08-16: `generateOptimizationRecommendations` (`AdaptiveChunker`, deleted, vs `WasmMemoryPoolManager`, live) and `getConfig` (`UnicodePunctuationDetector`, deleted, vs `ParallelConfig`, live).

**Verifying "was this WASM/optimization feature ever benchmarked":** grep the whole git history for the baseline-key string it writes (`git log --all -S "<key>"`), and read the ORIGINAL creation commit's own message. This repo's WASM experiments have baked a "Performance Target" projection into a doc comment worded as if it were a measured "Benchmark:" result at least once (`WasmRegexUtils.js`, confirmed 2026-07-18) — a commit's own "Next Steps: run benchmarks to verify" is a stronger signal than any doc-comment claim.

**Dead-code cleanup with fallow has multiple blind spots** (dynamic imports, CSS `composes`, class vs singleton, test-only). See [Fallow Protocol](./development.md#fallow-dead-code-analysis) before deleting anything.

## Related Guides

- [Architecture Guide](./architecture.md) - System architecture and WASM acceleration
- [Development Guide](./development.md) - Development guidelines, logging, testing
- [Performance Guide](./performance.md) - Performance monitoring and optimization
