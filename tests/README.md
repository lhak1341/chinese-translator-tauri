# Phase 8 Tests - Pattern Matching Validation

## Purpose

These tests validate Phase 7 integration by exercising all Phase 3-6 WASM APIs. Running these tests will:
1. ✅ Verify pattern matching works correctly
2. ✅ Resolve "dead code" warnings by using the APIs
3. ✅ Build confidence in the pattern system

## Test Files

### Test 1.1: Basic Pattern Matching
**File:** `phase8-test-1.1-basic-pattern-matching.js`
**Purpose:** Validate basic pattern matching with variable resolution
**APIs Tested:**
- `WasmTranslationAccelerator.createVariableLookupFunction()`
- `WasmTranslationAccelerator.matchPatternWithResolution()`
- Pattern variable extraction
- Dictionary-based variable resolution
- Template substitution

**Test Cases:**
1. Possessive Pattern: "张三的手" → "tay của Trương Tam"
2. Possessive Pattern: "李四的眼睛" → "mắt của Lý Tứ"
3. Location Pattern: "从北京到上海" → "từ Bắc Kinh đến Thượng Hải"

## How to Run Tests

### Option 1: Browser Console - Simple Test (Recommended)

1. **Start the app:**
   ```bash
   npm run tauri:dev
   ```

2. **Open the app in your browser** and open DevTools (F12)

3. **Copy the entire content** of `tests/phase8-test-simple.js`

4. **Paste into browser console** and press Enter

5. **Review the output** - it will show step-by-step test results

**Note:** The app automatically exposes `window.translationEngine` in development mode, so you don't need to do anything special.

### Option 2: Browser Console - Full Test Suite

1. **Start the app:**
   ```bash
   npm run tauri:dev
   ```

2. **Open the app in your browser** and open DevTools (F12)

3. **Copy the entire content** of `tests/phase8-test-1.1-basic-pattern-matching.js`

4. **Paste into browser console** and press Enter

5. **Run the test:**
   ```javascript
   await runTest1_1()
   ```
   Note: Use `await` if pasting directly in console to see results properly

### Option 2: Add to App Code

Add a test button to your app UI:

```javascript
// In your React component
import { runTest1_1 } from '../tests/phase8-test-1.1-basic-pattern-matching.js';

function TestButton({ engine }) {
  const handleTest = async () => {
    window.translationEngine = engine;
    await runTest1_1();
  };

  return <button onClick={handleTest}>Run Test 1.1</button>;
}
```

### Option 3: Node.js Test (If applicable)

```javascript
const { runTest1_1 } = require('./phase8-test-1.1-basic-pattern-matching.js');

// Setup your engine
const engine = createTranslationEngine();
global.window = { translationEngine: engine };

await runTest1_1();
```

## Expected Output

### Success Case:
```
========================================
🧪 Phase 8 Test 1.1: Basic Pattern Matching
========================================

✅ WASM Pattern Manager is ready!
✅ Phase 7 integration active

📝 Test: Possessive Pattern: 张三的手
   Input: "张三的手"
   ✓ Pattern matched: X的Y
   ✓ Translation: "tay của Trương Tam"
   ✓ Variables: {X: "张三", Y: "手"}
   ✓ Resolutions: {X: "Trương Tam", Y: "tay"}
   ✓ Confidence: 0.90
   ✅ PASS: All assertions passed!

... (more test cases)

========================================
📊 Test Summary
========================================
✅ Passed: 3/3
❌ Failed: 0/3

🎉 All tests passed!

📋 APIs Validated:
   - ✅ WasmTranslationAccelerator.createVariableLookupFunction()
   - ✅ WasmTranslationAccelerator.matchPatternWithResolution()
   - ✅ Pattern variable extraction
   - ✅ Dictionary-based variable resolution
   - ✅ Template substitution

========================================
```

### Failure Case:
```
❌ FAIL: No match found for "张三的手"
```

**Common causes:**
1. WASM Pattern Manager not initialized yet (wait 5 seconds)
2. Patterns not loaded in PatternConfiguration.js
3. Dictionary entries missing ("张三", "手" not in dictionaries)
4. Phase 7 feature flag disabled

## Troubleshooting

### "TranslationEngine not found!"
**Solution:** Expose engine to window object:
```javascript
window.translationEngine = yourEngineInstance;
```

### "WASM Core Engine not ready!"
**Solution:** Wait a few seconds for initialization, then try again.

### "WASM Pattern Manager not enabled!"
**Check:**
- `engine.useWasmPatterns` should be `true`
- `engine.wasmPatternsReady` should be `true`
- Check console for Phase 7 initialization logs

### "No match found"
**Check:**
1. Verify dictionaries are loaded with proper nouns and characters
2. Check pattern configuration has the pattern (e.g., "X的Y")
3. Ensure variable resolution can find dictionary entries

## Test Progress

- [x] Test 1.1: Basic Pattern Matching
- [ ] Test 1.2: Hierarchical Resolution
- [ ] Test 1.3: Context-Aware Matching
- [ ] Test 1.4: Pattern Composition
- [ ] Test 1.5: Multi-Level Matching
- [ ] Test 2.1: Type Constraints
- [ ] Test 2.2: Variable Metadata
- [ ] Test 3.1: Pattern Cache
- [ ] Test 3.2: Performance Profiling

## Next Steps

After Test 1.1 passes:
1. Verify warnings are reduced (check WASM build output)
2. Proceed to Test 1.2 (Hierarchical Resolution)
3. Continue through test plan systematically

## Notes

- Tests run against live app (not unit tests)
- Requires dictionaries to be loaded
- Tests exercise actual WASM code paths
- Warnings may persist if WASM methods are only called internally
