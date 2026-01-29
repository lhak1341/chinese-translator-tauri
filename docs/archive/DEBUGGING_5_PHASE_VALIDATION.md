# 5-Phase Validation - Debugging Quick Reference

**Purpose:** Quick reference for debugging validation alerts in production
**Date:** 2026-01-27

---

## Validation Points by Phase

### Phase 1 (Patterns)

- ✅ Phase order: Must run first (index 0)
- ✅ Token corruption: Snapshot → validate → throw
- ✅ Consumed contract: `translated: null` for consumed tokens
- ✅ Phase priority: Priority 1 (highest)
- ✅ Semantic corruption: Check after phase completes

### Phase 2 (Proper Nouns)

- ✅ Phase order: Must run after Phase 1 (index 1)
- ✅ Token corruption: Snapshot → validate → throw
- ✅ Consumed contract: `translated: null` for consumed tokens
- ✅ Phase priority: Priority 2
- ✅ Semantic corruption: Check after phase completes

### Phase 3 (Numbers)

- ✅ Phase order: Must run after Phase 2 (index 2)
- ✅ Token corruption: Snapshot → validate → throw **[FIXED 2026-01-27]**
- ✅ Consumed contract: `translated: null` for consumed tokens **[NEW]**
- ✅ Phase priority: Priority 3 **[NEW]**
- ✅ Semantic corruption: Check after phase completes **[NEW]**
- ✅ WASM validation: Pre/post snapshots, restore consumed tokens **[NEW]**

### Phase 4 (Phrases)

- ✅ Phase order: Must run after Phase 3 (index 3)
- ✅ Token corruption: Throws on corruption **[UPGRADED from warning]**
- ✅ Consumed contract: `translated: null` for consumed tokens **[NEW]**
- ✅ Phase priority: Priority 4 **[NEW]**
- ✅ Semantic corruption: Check after phase completes **[NEW]**

### Phase 5 (Characters)

- ✅ Phase order: Must run after Phase 4 (index 4)
- ✅ Token corruption: Throws on corruption **[UPGRADED from warning]**
- ✅ Consumed contract: `translated: null` for consumed tokens **[NEW]**
- ✅ Phase priority: Priority 5 (lowest) **[NEW]**
- ✅ Semantic corruption: Check after phase completes **[NEW]**

---

## Alert Types & Responses

### 🚨 `token_array_corruption`

**Alert Structure:**

```json
{
  "type": "token_array_corruption",
  "phase": "patterns|properNouns|numbers|phrases|characters",
  "beforeLength": 1234,
  "afterLength": 1250,
  "timestamp": 1706400000000
}
```

**What It Means:**

- Phase modified token array length (should be invariant)
- Indicates bug in phase processing logic

**Immediate Action:**

1. Check alert payload: Which phase? How many tokens added/removed?
2. Review phase implementation: Look for `tokens.push()`, `tokens.splice()`
3. Check for race conditions: Concurrent modification?

**User Impact:**

- Translation fails with "critical error" toast
- User asked to reload page
- Prevents cascading failures

---

### 🚨 `consumed_token_contract_violation`

**Log Format:**

```
🚨 patterns consumed token contract violation at token 42:
translated="undefined" (expected null), source="pattern_consumed"
```

**What It Means:**

- Phase marked token as consumed but didn't set `translated: null`
- Could cause "undefined" to appear as literal text

**Immediate Action:**

1. Identify phase from log
2. Search phase code for: `token.translationSource = "X_consumed"`
3. Verify: `token.translated = null` (not undefined, not missing)

**User Impact:**

- Auto-corrected (forced to null)
- No user-facing error (silent fix)
- Prevents "undefined" in translation output

---

### 🚨 `phase_priority_violation`

**Log Format:**

```
🚨 Phase priority violation: phrases (priority 4) attempted to override
properNouns (priority 2) at token 15: "三个"
```

**What It Means:**

- Lower-priority phase overrode higher-priority translation
- Phase didn't check `token.translated !== null` before processing

**Immediate Action:**

1. Check phase implementation: Does it skip translated tokens?
2. Look for: `if (token.translated !== null) continue;`
3. Review phase order: Is it running in wrong sequence?

**User Impact:**

- Logged but doesn't stop translation
- May result in wrong translation (lower priority wins)

---

### 🚨 `semantic_array_corruption`

**Alert Structure:**

```json
{
  "type": "semantic_array_corruption",
  "phase": "patterns|properNouns|numbers|phrases|characters",
  "telemetry": {
    "totalCorruptions": 3,
    "corruptionEvents": [...]
  },
  "timestamp": 1706400000000
}
```

**What It Means:**

- Phase added invalid entry to semantic array
- Clickable highlighting may be broken

**Immediate Action:**

1. Check telemetry: Which phase? What corruption?
2. Review `semanticArrayBuilder.addUnit()` calls in phase
3. Verify parameters: originalText, translatedText, source, tokenIndex

**User Impact:**

- Toast error: "Translation quality degraded (X phase)"
- Clickable highlighting may not work
- Translation text still correct

---

### 🚨 `wasm_phase_priority_violation`

**Log Format:**

```
🚨 WASM violated phase priority: cleared consumed token at index 25.
Original source: properNouns_consumed
```

**What It Means:**

- WASM number processor overwrote token consumed by Phase 1-2
- Phase priority not respected

**Immediate Action:**

1. Check WASM code: Does it skip tokens with `translationSource`?
2. Verify Rust: `token.translation_source.is_some()` check
3. Check validation: Is restoration working?

**User Impact:**

- Auto-corrected (original state restored)
- No user-facing error (silent fix)
- Prevents wrong translation

---

## Debug Commands (Browser Console)

### Check Translation Engine State

```javascript
// Get last phase failures
window.translationEngine.lastPhaseFailures;
// Returns: { failedPhases: [...], completedPhases: [...], failures: {...} }

// Check semantic array corruption
window.translationEngine.semanticArrayBuilder.isCorrupted;
window.translationEngine.semanticArrayBuilder.getCorruptionTelemetry();

// Check phase completion
// Available in profiler data
```

### Simulate Validation Errors (Development Only)

```javascript
// 1. Token corruption
const originalLength = tokens.length;
tokens.push({ type: 'fake', value: 'test' }); // Corrupt array
// Should throw after phase completes

// 2. Consumed token contract
tokens[0].translationSource = 'test_consumed';
tokens[0].translated = undefined; // Violate contract
// Should auto-correct to null, log error

// 3. Phase priority
tokens[0].translated = 'translation';
tokens[0].translationSource = 'properNouns'; // Priority 2
// Then run Phase 4 (priority 4) - should log violation

// 4. Semantic corruption
semanticArrayBuilder.addUnit('', 'invalid', 'test', -1); // Invalid
// Should detect corruption
```

---

## Common Issues & Solutions

### Issue: "Translation engine encountered a critical error"

**Cause:** Token array corruption
**Solution:**

1. Check browser console for corruption alert
2. Identify which phase from alert payload
3. Review phase code for array modifications
4. Fix bug and redeploy

---

### Issue: "undefined" appearing in translation

**Cause:** Consumed token contract violation
**Solution:**

1. Search logs for "consumed token contract violation"
2. Identify phase from log
3. Find where phase sets `translationSource` but not `translated`
4. Add: `token.translated = null;`

---

### Issue: Wrong translation (lower-quality match wins)

**Cause:** Phase priority violation
**Solution:**

1. Search logs for "phase priority violation"
2. Identify phase attempting override
3. Add check: `if (token.translated !== null) continue;`

---

### Issue: Clickable highlighting broken

**Cause:** Semantic array corruption
**Solution:**

1. Check browser console for corruption telemetry
2. Identify phase from alert
3. Review `semanticArrayBuilder.addUnit()` calls
4. Verify all parameters are valid

---

## Performance Monitoring

### Normal Metrics (Expected)

```javascript
// Phase completion metrics (all phases should complete)
completedPhases: ['patterns', 'properNouns', 'numbers', 'phrases', 'characters']

// Validation overhead (<1% of total time)
patterns: 2500ms (validation: 5ms)
properNouns: 1200ms (validation: 3ms)
numbers: 800ms (validation: 2ms)
phrases: 1800ms (validation: 4ms)
characters: 3000ms (validation: 6ms)

// Alert counts (should be 0)
token_array_corruption: 0
semantic_array_corruption: 0
phase_priority_violations: 0 (logged, not alerted)
```

### Warning Thresholds

- Token corruption alerts: >0 = CRITICAL (investigate immediately)
- Semantic corruption alerts: >1% of translations = HIGH (investigate soon)
- Phase priority violations: >5% of translations = MEDIUM (review phase order logic)
- Phase failures: >10% of translations = HIGH (check timeout values)

---

## Rollback Procedure

If validation causes production issues:

```javascript
// In translateSinglePass, comment out validation calls:

// After each phase, comment these 3 lines:
// validateConsumedTokenContract('phaseName');
// validatePhasePriority('phaseName', PHASE_PRIORITIES.phaseName);
// checkSemanticArrayCorruption('phaseName');

// For Phase 3, also remove:
// const tokensLengthBeforePhase3 = tokens.length;
// if (tokens.length !== tokensLengthBeforePhase3) { ... }

// For Phases 4-5, change from throw to log:
// if (tokens.length !== tokensLengthBeforePhase4) {
//   logger.error(`⚠️ Phase 4 corrupted...`);
//   // Remove: toast.error() and throw new Error()
// }
```

**Deploy Time:** <5 minutes (comment out 15 lines)
**Rollback Risk:** Low (no logic changes, only validation)

---

## Contact & Escalation

For validation-related issues:

1. Check this guide first
2. Review code review documents:
   - `CODE_REVIEW_5_PHASE_PROCESSING.md` (full analysis)
   - `CODE_REVIEW_FIXES_IMPLEMENTED.md` (implementation details)
   - `CODE_REVIEW_SUMMARY.md` (quick overview)
3. Check git history: Commits from 2026-01-27

**Last Updated:** 2026-01-27
**Validation Version:** v1.0
**Status:** Production-ready after testing
