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

## Related Guides

- [Architecture Guide](./architecture.md) - System architecture and WASM acceleration
- [Development Guide](./development.md) - Development guidelines, logging, testing
- [Performance Guide](./performance.md) - Performance monitoring and optimization
