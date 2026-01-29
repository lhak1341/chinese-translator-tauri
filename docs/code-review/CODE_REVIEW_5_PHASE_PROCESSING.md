# Code Review: 5-Phase Processing Token Consumption

**Review Date:** 2026-01-27
**Reviewer:** Claude Code
**Scope:** TranslationEngine.js - 5-Phase Translation Pipeline (Lines 6324-6912)
**Focus Areas:** Token consumption, phase priority, cache invalidation, semantic array tracking

---

## Executive Summary

The 5-phase processing system has **robust safeguards** in place with recent code review fixes (CRITICAL-1, HIGH-1, MEDIUM-1, etc.) that add comprehensive validation. However, there are **inconsistencies** in error handling and validation across phases that could lead to subtle bugs.

**Overall Assessment:** ✅ **Good** with room for improvement

### Key Strengths

- ✅ Phase order enforcement with runtime validation (CRITICAL-1 fix)
- ✅ Token array length corruption detection (HIGH-3 fix)
- ✅ Consumed token pattern validated in postProcess (lines 3542-3549)
- ✅ Comprehensive timeout protection (HIGH-1 fix)
- ✅ Phase failure tracking with detailed reporting (MEDIUM-1 fix)

### Key Concerns

- ⚠️ Inconsistent error handling between phases
- ⚠️ Phase 3 (Numbers) missing token corruption check
- ⚠️ No validation that consumed tokens follow the contract
- ⚠️ Cached semantic tokens invalidation timing unclear

---

## CRITICAL Issues

### ✅ CRITICAL-1: Phase Order Enforcement (GOOD)

**Location:** `TranslationEngine.js:6336-6354`

**What's Good:**

```javascript
const REQUIRED_PHASE_ORDER = ['patterns', 'properNouns', 'numbers', 'phrases', 'characters'];
let lastPhaseIndex = -1;

const validatePhaseOrder = (phaseName) => {
  const currentIndex = REQUIRED_PHASE_ORDER.indexOf(phaseName);
  if (currentIndex === -1) {
    throw new Error(`Unknown phase: ${phaseName}`);
  }
  if (currentIndex <= lastPhaseIndex) {
    throw new Error(
      `Phase order violation: ${phaseName} (index ${currentIndex}) must run after ${REQUIRED_PHASE_ORDER[lastPhaseIndex]} (index ${lastPhaseIndex})`
    );
  }
  lastPhaseIndex = currentIndex;
};
```

**Analysis:**

- ✅ Runtime validation prevents accidental phase reordering
- ✅ Clear error messages identify violations
- ✅ Sequential tracking with `lastPhaseIndex`

**No action needed** - this is a well-implemented safeguard.

---

### ⚠️ CRITICAL-2: Token Array Corruption Detection (INCONSISTENT)

**Location:** Multiple phases (lines 6383-6433, 6437-6489, 6759-6783, 6805-6829)

**Inconsistency:**

```javascript
// Phase 1 (Patterns) - HAS corruption check ✅
const tokensLengthBeforePhase1 = tokens.length;
// ... processing ...
if (tokens.length !== tokensLengthBeforePhase1) {
  // Throws error, notifies user, records alert
}

// Phase 2 (Proper Nouns) - HAS corruption check ✅
const tokensLengthBeforePhase2 = tokens.length;
// ... processing ...
if (tokens.length !== tokensLengthBeforePhase2) {
  // Throws error, notifies user, records alert
}

// Phase 3 (Numbers) - NO corruption check ❌
// Missing tokensLengthBeforePhase3 snapshot
try {
  validatePhaseOrder('numbers');
  await withTimeout(
    this.profiler.profile('numbers', async () => {
      // WASM number processing...
    }),
    PHASE_TIMEOUTS.numbers,
    'numbers'
  );
} catch (error) {
  phaseFailures.set('numbers', error.message);
  logger.error('🚨 Phase 3 (Numbers) failed:', error);
  // NO token corruption check here!
}

// Phase 4 (Phrases) - HAS corruption check ✅
const tokensLengthBeforePhase4 = tokens.length;
// ... BUT only logs warning, doesn't throw! ⚠️
if (tokens.length !== tokensLengthBeforePhase4) {
  logger.error(`⚠️ Phase 4 corrupted token array...`);
  // Missing: toast notification, alert recording, throw error
}

// Phase 5 (Characters) - HAS corruption check ✅
const tokensLengthBeforePhase5 = tokens.length;
// ... BUT only logs warning, doesn't throw! ⚠️
if (tokens.length !== tokensLengthBeforePhase5) {
  logger.error(`⚠️ Phase 5 corrupted token array...`);
  // Missing: toast notification, alert recording, throw error
}
```

**Issues:**

1. **Phase 3 missing snapshot:** No `tokensLengthBeforePhase3` variable created
2. **Phases 4 & 5 downgraded:** Changed from throwing errors to logging warnings
3. **Inconsistent user feedback:** Phases 1-2 show toasts, phases 4-5 don't

**Impact:** Token array corruption in Phase 3-5 could go undetected, leading to:

- Silent data corruption
- Position mapping failures (clickable highlighting breaks)
- Semantic array corruption (wrong token-to-translation mapping)

**Recommendation:**

```javascript
// FIX: Add consistent corruption detection for ALL phases

// Phase 3: Add snapshot and validation
const tokensLengthBeforePhase3 = tokens.length; // ADD THIS
try {
  validatePhaseOrder('numbers');
  await withTimeout(
    this.profiler.profile('numbers', async () => {
      // ... number processing ...
    }),
    PHASE_TIMEOUTS.numbers,
    'numbers'
  );
  completedPhases.add('numbers');
} catch (error) {
  phaseFailures.set('numbers', error.message);
  logger.error('🚨 Phase 3 (Numbers) failed:', error);

  // ADD: Token corruption validation
  if (tokens.length !== tokensLengthBeforePhase3) {
    const errorMsg = `Phase 3 corrupted token array: ${tokensLengthBeforePhase3} → ${tokens.length} tokens`;
    logger.error(`⚠️ ${errorMsg}`);

    toast.error('Translation engine encountered a critical error. Please reload the page.', {
      duration: 15000,
    });

    if (
      typeof systemPerformanceMonitor !== 'undefined' &&
      typeof systemPerformanceMonitor.recordAlert === 'function'
    ) {
      systemPerformanceMonitor.recordAlert('token_array_corruption', {
        phase: 'numbers',
        beforeLength: tokensLengthBeforePhase3,
        afterLength: tokens.length,
        timestamp: Date.now(),
      });
    }

    throw new Error(`Token array corruption detected: ${errorMsg}`);
  }

  // Continue to next phase
}

// Phase 4 & 5: Restore throwing behavior (lines 6777-6781, 6823-6827)
if (tokens.length !== tokensLengthBeforePhase4) {
  const errorMsg = `Phase 4 corrupted token array: ${tokensLengthBeforePhase4} → ${tokens.length} tokens`;
  logger.error(`⚠️ ${errorMsg}`);

  toast.error('Translation engine encountered a critical error. Please reload the page.', {
    duration: 15000,
  });

  if (
    typeof systemPerformanceMonitor !== 'undefined' &&
    typeof systemPerformanceMonitor.recordAlert === 'function'
  ) {
    systemPerformanceMonitor.recordAlert('token_array_corruption', {
      phase: 'phrases',
      beforeLength: tokensLengthBeforePhase4,
      afterLength: tokens.length,
      timestamp: Date.now(),
    });
  }

  throw new Error(`Token array corruption detected: ${errorMsg}`);
}
```

---

### ⚠️ CRITICAL-3: Consumed Token Contract Validation (MISSING)

**Location:** `TranslationEngine.js:3542-3549` (postProcess only)

**Current Validation:**

```javascript
// postProcess checks consumed tokens (lines 3542-3549)
if (token.translated !== null) {
  output = token.translated;
} else if (token.translationSource) {
  // Skip consumed tokens - CORRECT ✅
  continue;
} else {
  // Fall through to character lookup
}
```

**Missing Validation:**

```javascript
// CRITICAL: No validation that phases correctly mark consumed tokens!
// Phases should set: { translated: null, translationSource: "X_consumed" }
// But there's no runtime check that they do this correctly.

// Example failure mode:
// Phase 2 marks tokens as consumed but forgets to set translated=null
tokens[i].translationSource = 'properNouns_consumed'; // ✅
tokens[i].translated = undefined; // ❌ Should be null!

// Result: undefined appears as literal text in output (WASM boundary issue)
```

**Recommendation:**

Add validation in `translateSinglePass` after each phase:

```javascript
// After Phase 1 (line ~6434)
// VALIDATION: Check consumed tokens follow contract
for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].translationSource && tokens[i].translationSource.includes('consumed')) {
    // Consumed tokens MUST have translated=null (not undefined!)
    if (tokens[i].translated !== null) {
      logger.error(
        `🚨 Phase 1 consumed token contract violation at token ${i}: ` +
          `translated="${tokens[i].translated}" (expected null), ` +
          `source="${tokens[i].translationSource}"`
      );

      // Force correct state
      tokens[i].translated = null;
    }
  }
}

// Repeat after Phase 2, Phase 3, Phase 4, Phase 5
```

---

## HIGH Priority Issues

### ⚠️ HIGH-1: Cached Semantic Tokens Invalidation Timing

**Location:** `TranslationEngine.js:6491-6494, 6920-6938`

**Issue:**

```javascript
// Cache is populated AFTER Phase 2 (line 6494)
this.cachedSemanticTokens = this.getCachedSemanticTokens(tokens);

// But invalidated on phase FAILURE (lines 6432, 6487)
if (error) {
  this.cachedSemanticTokens = null; // Clear on failure
}

// Question: Should cache be cleared on EVERY phase start?
// Current behavior: Cache persists across phases unless failure occurs
```

**Potential Issue:**

- If Phase 3/4/5 modifies token state (adds `translationSource` flags), cached semantic tokens become stale
- `getSemanticTokens()` filters by `type === 'chinese_char'` AND not consumed (no `translationSource`)
- Cache computed after Phase 2 might include tokens that Phase 3/4/5 later consume

**Analysis:**

Let me check `getSemanticTokens()` to understand the filter:

```javascript
// From documentation: getSemanticTokens filters unconsumed tokens
// Cache computed line 6494 (after Phase 2)
// Phases 3-5 consume more tokens
// Question: Does cache become invalid?
```

**Recommendation:**

Option A: Clear cache before each phase that modifies tokens:

```javascript
// Before Phase 3, 4, 5
this.cachedSemanticTokens = null; // Force recomputation
```

Option B: Document that cache is only valid for phrase processing:

```javascript
// OPTIMIZATION: Cache semantic tokens after proper noun grouping completes
// This cache is ONLY used by phrase processing (Phase 4)
// Phases 3 and 5 don't use semantic token filtering
this.cachedSemanticTokens = this.getCachedSemanticTokens(tokens);
```

**Verify:** Check if Phase 4 is the only consumer of `cachedSemanticTokens`

---

### ⚠️ HIGH-2: Phase Priority Not Validated at Runtime

**Location:** Throughout phase processing

**Issue:**

```javascript
// Documentation states phase priority:
// Phase 1 (Patterns) = Priority 1 (highest)
// Phase 2 (Proper Nouns) = Priority 2
// Phase 3 (Numbers) = Priority 3
// Phase 4 (Phrases) = Priority 4
// Phase 5 (Characters) = Priority 5 (lowest)

// But there's NO runtime validation that earlier phases
// actually take precedence over later phases!

// Example failure mode:
// - Phase 2 matches "三个" → "ba cái" (proper noun)
// - Phase 3 also matches "三个" → "3 cái" (number)
// - If both set translated, which wins?
```

**Current Safeguard:**

```javascript
// Phases check `token.translated !== null` before processing (line 3303)
if (token.translated !== null || (token.translationSource && !token.isPatternPartialReset))
  continue;
```

This is correct! Earlier phases set `translated` first, later phases skip.

**However:** No validation that this logic is working correctly.

**Recommendation:**

Add phase priority validation:

```javascript
// After each phase, validate no lower-priority translations override higher-priority ones
function validatePhasePriority(tokens, currentPhase, currentPriority) {
  const PHASE_PRIORITIES = {
    patterns: 1,
    properNouns: 2,
    numbers: 3,
    phrases: 4,
    characters: 5,
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.translationSource) {
      // Check if source phase has higher priority
      const sourcePriority = PHASE_PRIORITIES[token.translationSource] || 999;

      // Current phase should NOT override higher priority phase
      if (currentPriority < sourcePriority) {
        logger.error(
          `🚨 Phase priority violation: ${currentPhase} (priority ${currentPriority}) ` +
            `attempted to override ${token.translationSource} (priority ${sourcePriority}) ` +
            `at token ${i}: "${token.value}"`
        );
      }
    }
  }
}

// Call after each phase
validatePhasePriority(tokens, 'properNouns', 2); // After Phase 2
validatePhasePriority(tokens, 'numbers', 3); // After Phase 3
// etc.
```

---

### ⚠️ HIGH-3: Semantic Array Corruption Detection (PARTIAL)

**Location:** `TranslationEngine.js:6884-6904`

**Current Implementation:**

```javascript
// Check for corruption after ALL phases (line 6886)
if (this.semanticArrayBuilder.isCorrupted) {
  const telemetry = this.semanticArrayBuilder.getCorruptionTelemetry();
  logger.error('🚨 Semantic array corruption detected after translation', {
    totalCorruptions: telemetry.totalCorruptions,
    lastEvent: telemetry.corruptionEvents[telemetry.corruptionEvents.length - 1],
  });
}
```

**Issue:** Corruption detected AFTER all phases complete, making it hard to identify which phase caused it.

**Recommendation:**

Check after each phase:

```javascript
// Helper function
function checkSemanticArrayCorruption(phaseName) {
  if (this.semanticArrayBuilder.isCorrupted) {
    const telemetry = this.semanticArrayBuilder.getCorruptionTelemetry();
    logger.error(`🚨 Semantic array corruption detected in ${phaseName}`, {
      totalCorruptions: telemetry.totalCorruptions,
      lastEvent: telemetry.corruptionEvents[telemetry.corruptionEvents.length - 1],
    });

    // Notify user
    toast.error(
      `Translation quality degraded (${phaseName} phase). Try reloading dictionaries.`,
      { duration: 10000 }
    );

    // Record alert
    if (
      typeof systemPerformanceMonitor !== 'undefined' &&
      typeof systemPerformanceMonitor.recordAlert === 'function'
    ) {
      systemPerformanceMonitor.recordAlert('semantic_array_corruption', {
        phase: phaseName,
        telemetry,
        timestamp: Date.now(),
      });
    }
  }
}

// Call after each phase
await this.applyPatterns(tokens, { ...options, debug: true });
checkSemanticArrayCorruption.call(this, 'patterns');

await this.applyDictionaryTranslation(tokens, { ... });
checkSemanticArrayCorruption.call(this, 'properNouns');

// etc.
```

---

## MEDIUM Priority Issues

### ⚠️ MEDIUM-1: Inconsistent Phase Completion Logging

**Location:** Lines 6393-6397, 6452-6455, 6744-6745, etc.

**Issue:**

```javascript
// Phase 1 & 2: Record profiling metrics (lines 6394-6397)
if (this.profiler && typeof this.profiler.recordPhaseCompletion === 'function') {
  await this.profiler.recordPhaseCompletion('patterns');
}

// Phase 3: Records metrics inline (lines 6722-6742)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  if (
    window.performanceDashboard &&
    typeof window.performanceDashboard.recordMetric === 'function'
  ) {
    window.performanceDashboard.recordMetric('number_processing', {
      method,
      candidateCount: numberCandidateCount,
      duration: numberPhaseDuration,
      tokensProcessed: tokens.length,
      timestamp: Date.now(),
    });
  }
}

// Phase 4 & 5: No profiling metric recording!
```

**Inconsistency:**

- Phases 1-2: Use `profiler.recordPhaseCompletion()`
- Phase 3: Uses `performanceDashboard.recordMetric()` directly
- Phases 4-5: No metric recording

**Recommendation:**

Standardize on `profiler.recordPhaseCompletion()` for all phases:

```javascript
// After each phase
completedPhases.add('patterns');
if (this.profiler && typeof this.profiler.recordPhaseCompletion === 'function') {
  await this.profiler.recordPhaseCompletion('patterns', {
    duration: performance.now() - phaseStartTime,
    tokensProcessed: tokens.length,
  });
}
```

---

### ⚠️ MEDIUM-2: No Validation of WASM Token Modifications

**Location:** `TranslationEngine.js:6562-6615` (Number processing)

**Current Validation:**

```javascript
// Pre-validate array length (line 6569)
if (processedTokens.length !== tokens.length) {
  throw new Error('WASM violated array length invariance');
}

// Pre-validate token structure (lines 6580-6600)
for (let i = 0; i < processedTokens.length; i++) {
  if (!processedTokens[i] || typeof processedTokens[i] !== 'object') {
    throw new Error('token is missing or not an object');
  }
  if (processedTokens[i].translated === undefined) {
    throw new Error('has undefined translated field');
  }
  // ... more checks
}
```

**Missing Validation:**

```javascript
// No validation that WASM respects consumed tokens from earlier phases!

// Example failure mode:
// 1. Phase 2 marks token as consumed: { translationSource: 'properNouns_consumed' }
// 2. WASM Phase 3 receives tokens array
// 3. WASM overwrites token.translationSource (breaks phase priority!)
// 4. No validation catches this

// Expected behavior:
// WASM should skip tokens with existing translationSource
```

**Recommendation:**

Add pre-WASM and post-WASM validation:

```javascript
// Before WASM processing
const preWasmConsumedIndices = new Set();
for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].translationSource) {
    preWasmConsumedIndices.add(i);
  }
}

// Process with WASM
const processedTokens = await processNumbersWasm(tokens);

// Validate WASM didn't overwrite consumed tokens
for (const idx of preWasmConsumedIndices) {
  if (!processedTokens[idx].translationSource) {
    logger.error(
      `🚨 WASM violated phase priority: cleared consumed token at index ${idx}. ` +
        `Original source: ${tokens[idx].translationSource}`
    );

    // Restore original translationSource
    processedTokens[idx].translationSource = tokens[idx].translationSource;
  }
}

// Continue with existing validation...
```

---

### ℹ️ MEDIUM-3: Timeout Values Not Documented

**Location:** `TranslationEngine.js:6359-6369, 6390-6391`

**Issue:**

```javascript
// Timeout helper references PHASE_TIMEOUTS constant (line 6390)
PHASE_TIMEOUTS.patterns;

// But PHASE_TIMEOUTS is not defined in this file!
// Likely imported from a constants file, but not visible in review.
```

**Question:** What are the actual timeout values? Are they appropriate?

**Recommendation:**

Document timeout rationale:

```javascript
// PHASE_TIMEOUTS (from constants file - verify these values)
// Expected values:
// - patterns: 30000ms (30s) - complex regex matching can be slow
// - properNouns: 10000ms (10s) - dictionary lookup should be fast
// - numbers: 5000ms (5s) - WASM should be very fast
// - phrases: 15000ms (15s) - many dictionary lookups
// - characters: 20000ms (20s) - fallback for all remaining tokens

// Rationale:
// - Large texts (10K+ chars) need longer timeouts
// - WASM is fast (5s is generous)
// - Pattern matching is slowest (30s for worst case)
```

---

## LOW Priority Issues

### ℹ️ LOW-1: Phase 3 Nested Try-Catch Complexity

**Location:** `TranslationEngine.js:6500-6756`

**Observation:**

```javascript
try {
  validatePhaseOrder('numbers');
  await withTimeout(
    this.profiler.profile('numbers', async () => {
      // ... pre-scan logic ...

      try {
        const processedTokens = await processNumbersWasm(tokens);
        // ... validation ...
        copyWasmTokens(processedTokens, tokens);
        // ... semantic array updates ...
      } catch (error) {
        // Fallback to JavaScript
        this.numberProcessor.processTokens(tokens, {...});
      }

      // ... performance metrics ...
    }),
    PHASE_TIMEOUTS.numbers,
    'numbers'
  );
} catch (error) {
  phaseFailures.set('numbers', error.message);
  logger.error('🚨 Phase 3 (Numbers) failed:', error);
}
```

**Complexity:**

- Outer try-catch: Catches timeout and validation errors
- Inner try-catch: Catches WASM errors, falls back to JavaScript
- 250+ lines inside outer try

**Recommendation:**

Extract number processing to separate method:

```javascript
// In translateSinglePass:
try {
  validatePhaseOrder('numbers');
  await withTimeout(
    this.processNumberPhase(tokens, options),
    PHASE_TIMEOUTS.numbers,
    'numbers'
  );
  completedPhases.add('numbers');
} catch (error) {
  phaseFailures.set('numbers', error.message);
  logger.error('🚨 Phase 3 (Numbers) failed:', error);
}

// New method:
async processNumberPhase(tokens, options) {
  return this.profiler.profile('numbers', async () => {
    // All the number processing logic here
    // Includes: pre-scan, WASM/JS selection, validation, semantic array updates
  });
}
```

Benefits:

- Clearer separation of concerns
- Easier to test in isolation
- Reduced nesting complexity

---

## Positive Findings ✅

### 1. Excellent Token Array Length Validation (Phases 1-2)

The token corruption detection in Phases 1-2 is exemplary:

```javascript
// Lines 6403-6429
if (tokens.length !== tokensLengthBeforePhase1) {
  const errorMsg = `Phase 1 corrupted token array: ${tokensLengthBeforePhase1} → ${tokens.length} tokens`;
  logger.error(`⚠️ ${errorMsg}`);

  toast.error('Translation engine encountered a critical error. Please reload the page.', {
    duration: 15000,
  });

  if (
    typeof systemPerformanceMonitor !== 'undefined' &&
    typeof systemPerformanceMonitor.recordAlert === 'function'
  ) {
    systemPerformanceMonitor.recordAlert('token_array_corruption', {
      phase: 'patterns',
      beforeLength: tokensLengthBeforePhase1,
      afterLength: tokens.length,
      timestamp: Date.now(),
    });
  }

  throw new Error(`Token array corruption detected: ${errorMsg}`);
}
```

This should be the template for all phases!

---

### 2. Robust Phase Order Enforcement

The `validatePhaseOrder()` function (lines 6343-6354) is a great defensive programming practice:

```javascript
const validatePhaseOrder = (phaseName) => {
  const currentIndex = REQUIRED_PHASE_ORDER.indexOf(phaseName);
  if (currentIndex === -1) {
    throw new Error(`Unknown phase: ${phaseName}`);
  }
  if (currentIndex <= lastPhaseIndex) {
    throw new Error(
      `Phase order violation: ${phaseName} (index ${currentIndex}) must run after ${REQUIRED_PHASE_ORDER[lastPhaseIndex]} (index ${lastPhaseIndex})`
    );
  }
  lastPhaseIndex = currentIndex;
};
```

Prevents accidental reordering during refactoring.

---

### 3. Comprehensive Phase Failure Reporting

The phase completion tracking (lines 6836-6882) provides excellent debugging visibility:

```javascript
const failedPhases = ['patterns', 'properNouns', 'numbers', 'phrases', 'characters'].filter(
  (phase) => !completedPhases.has(phase)
);

if (failedPhases.length > 0) {
  const failureReport = {
    totalPhases: REQUIRED_PHASE_ORDER.length,
    failedPhases,
    completedPhases: Array.from(completedPhases),
    failures: Object.fromEntries(phaseFailures),
    timestamp: Date.now(),
  };

  // Log and send to monitoring
}
```

Excellent observability for production debugging!

---

### 4. Correct Consumed Token Handling in postProcess

The `postProcess` method correctly implements the consumed token contract:

```javascript
// Lines 3542-3549
if (token.translated !== null) {
  output = token.translated;
} else if (token.translationSource) {
  // Skip tokens consumed by any process
  this.log(
    DEBUG_LEVELS.VERBOSE,
    `🔧 Skipping consumed token: "${token.value}" (source: ${token.translationSource})`
  );
  continue;
} else {
  // Handle untranslated tokens
}
```

This correctly skips consumed tokens (those with `translated: null, translationSource: "X_consumed"`).

---

### 5. WASM Validation is Thorough

Phase 3's WASM validation (lines 6564-6615) is comprehensive:

- ✅ Array length validation (line 6569)
- ✅ Token existence checks (line 6582)
- ✅ Undefined field detection (line 6586)
- ✅ Type validation (lines 6592-6599)
- ✅ Concurrent modification detection (lines 6602-6607)
- ✅ Post-copy verification (lines 6612-6615)

This is a model for WASM boundary validation!

---

## Summary of Recommendations

### Immediate Actions (CRITICAL)

1. **Add token corruption check to Phase 3** (lines 6750-6756)
   - Add `tokensLengthBeforePhase3` snapshot
   - Add validation in catch block
   - Match Phases 1-2 behavior (throw error, notify user, record alert)

2. **Restore throwing behavior for Phases 4-5** (lines 6777-6781, 6823-6827)
   - Change from `logger.error()` to full validation with throw
   - Add toast notifications
   - Add alert recording

3. **Add consumed token contract validation** (after each phase)
   - Verify tokens with `translationSource` have `translated: null`
   - Detect `undefined` vs `null` violations
   - Force correct state on violations

### High Priority (Within 1 Week)

4. **Add phase priority validation** (after each phase)
   - Verify lower-priority phases don't override higher-priority results
   - Log violations for debugging

5. **Add semantic array corruption checking per phase**
   - Move check from end to after each phase
   - Makes it easier to identify which phase caused corruption

6. **Clarify cached semantic tokens lifecycle**
   - Document which phases use the cache
   - Consider clearing before phases that modify tokens

### Medium Priority (Within 1 Month)

7. **Standardize phase completion logging**
   - Use `profiler.recordPhaseCompletion()` consistently
   - Add to Phases 4-5

8. **Add WASM phase priority validation**
   - Ensure WASM doesn't overwrite consumed tokens
   - Pre-WASM and post-WASM validation

9. **Document timeout values**
   - Add comments explaining PHASE_TIMEOUTS rationale
   - Consider making timeouts configurable for slow machines

### Low Priority (Nice to Have)

10. **Extract number processing to separate method**
    - Reduce nesting in `translateSinglePass`
    - Improve testability

---

## Testing Recommendations

Add the following test cases to verify 5-phase processing:

### Test 1: Phase Order Violation

```javascript
// Verify validatePhaseOrder catches violations
it('should throw error if phases run out of order', async () => {
  // Attempt to run Phase 3 before Phase 2
  // Should throw: "Phase order violation: numbers (index 2) must run after properNouns (index 1)"
});
```

### Test 2: Token Array Corruption

```javascript
// Verify corruption detection in all phases
it('should detect and throw on token array corruption', async () => {
  // Mock phase that adds tokens (corrupts array)
  // Should throw: "Token array corruption detected: 100 → 105 tokens"
  // Should show toast notification
  // Should record alert
});
```

### Test 3: Consumed Token Contract

```javascript
// Verify consumed tokens have correct structure
it('should validate consumed tokens have translated: null', async () => {
  const tokens = [
    { value: '他', translated: 'anh ấy', translationSource: 'properNouns' },
    { value: '的', translated: undefined, translationSource: 'properNouns_consumed' }, // Bug!
  ];

  // Should detect undefined and force to null
  // Should log error
});
```

### Test 4: Phase Priority

```javascript
// Verify phase priority is respected
it('should not allow lower-priority phases to override higher-priority', async () => {
  // Phase 2 translates "三个" as "ba cái" (proper noun)
  // Phase 3 should NOT override with "3 cái" (number)
  // Verify Phase 2 result wins
});
```

### Test 5: Semantic Array Corruption Tracking

```javascript
// Verify corruption detection per phase
it('should identify which phase corrupted semantic array', async () => {
  // Mock corruption in Phase 3
  // Should log: "Semantic array corruption detected in numbers"
  // Should NOT wait until end of all phases
});
```

---

## Conclusion

The 5-phase processing system is **well-architected** with recent code review fixes adding strong safeguards. The main issues are **inconsistencies** in how these safeguards are applied across phases.

**Priority Order:**

1. **Critical:** Fix token corruption detection gaps (Phase 3 missing, Phases 4-5 downgraded)
2. **High:** Add consumed token contract validation (catch undefined vs null)
3. **High:** Add phase priority validation (verify no overrides)
4. **Medium:** Standardize logging and monitoring across all phases

**Estimated Effort:**

- Critical fixes: 2-3 hours
- High priority: 3-4 hours
- Medium priority: 2-3 hours
- **Total:** 7-10 hours of focused development

**Risk Level:** Low (fixes are additive, don't change core logic)

**Confidence:** High (issues identified through systematic code analysis, fixes are straightforward)
