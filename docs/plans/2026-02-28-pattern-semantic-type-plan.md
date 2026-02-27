# Pattern Semantic Type Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow structural pattern entries to declare a `semanticType` so their results carry a meaningful type when used as variables in other patterns, enabling `allowedVariableTypes` constraints to match against them.

**Architecture:** Four-layer change — (1) Rust data model adds `semantic_type` field; (2) Rust two-phase processor uses it instead of the hardcoded `"structural_pattern"` type when inserting Phase A results into the Phase B cache; (3) JS propagates the type to already-translated tokens for cross-chunk reuse; (4) UI adds the same semantic type radio buttons to pattern entries that phrases/properNouns already have.

**Tech Stack:** Rust (wasm-core cargo workspace), JavaScript (TranslationEngine.js, TwoPhasePatternProcessor.js), TypeScript/React (DictionaryEntry.tsx)

---

## Background for the Implementer

### How pattern-within-pattern type checking works today

The WASM two-phase pattern processor works in two phases:

- **Phase A** (`variable_patterns`): Matches patterns that have `allowAsPatternVariable: true`. Their results become available as variable candidates for Phase B.
- **Phase B** (`all_patterns`): Matches any pattern, using an "enhanced cache" that includes both the original variable cache AND Phase A results.

When Phase B checks `allowedVariableTypes` for a variable slot, it looks up the cache entry's `var_type` field against the allowed list. Phase A results are inserted into the enhanced cache at `two_phase.rs:301` with the hardcoded type `"structural_pattern"`. This means a Phase B pattern with `allowedVariableTypes: { X: ["person"] }` will NEVER match a Phase A result, even if that Phase A pattern semantically produces a person-type translation — because the type is always `"structural_pattern"`, not `"person"`.

### The fix

Replace the hardcoded `"structural_pattern"` with the Phase A pattern's own `semanticType`, if declared. Patterns without `semanticType` fall back to `"structural_pattern"` (backward-compatible).

### Key files and line numbers

| File                                            | Relevant location                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `wasm-core/src/pattern_processor/pattern.rs`    | `PatternMetadata` struct: lines 69-86                                                    |
| `wasm-core/src/pattern_processor/parser.rs`     | `parse_patterns_dict`: lines 105-167                                                     |
| `wasm-core/src/pattern_processor/two_phase.rs`  | Phase B enhanced cache insertion: lines 295-304, `"structural_pattern"` at line 301      |
| `src/utils/TwoPhasePatternProcessor.js`         | `buildVariableCache` Phase 1: lines 140-176                                              |
| `src/components/dictionary/DictionaryEntry.tsx` | Semantic type radio buttons: lines 900-984; allowedVariableTypes section: lines 986-1065 |

### Running tests

```bash
# Rust (run after every Rust task):
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1

# JS (run after every JS/UI task):
npm test -- --run

# TypeScript check (run after every TS/TSX task):
npm run type-check
```

---

## Task 1: Add `semantic_type` to Rust `PatternMetadata`

**Files:**

- Modify: `wasm-core/src/pattern_processor/pattern.rs:69-86`

### Step 1: Write a failing test

Add to `wasm-core/tests/two_phase_test.rs` (or a new file `wasm-core/tests/pattern_semantic_type_test.rs`):

```rust
#[test]
fn pattern_metadata_has_semantic_type_field() {
    use chinese_translator_wasm_core::pattern_processor::pattern::PatternMetadata;
    let meta = PatternMetadata {
        priority: 0,
        complexity: 1,
        length: 3,
        allowed_variable_types: None,
        low_priority: false,
        semantic_type: Some("person".to_string()),
    };
    assert_eq!(meta.semantic_type.as_deref(), Some("person"));
}
```

### Step 2: Run test to verify it fails

```bash
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1 pattern_metadata_has_semantic_type_field
```

Expected: FAIL — `PatternMetadata` has no field `semantic_type`.

### Step 3: Add the field to `PatternMetadata`

In `wasm-core/src/pattern_processor/pattern.rs`, add the new field to `PatternMetadata` (after the existing `low_priority` field):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternMetadata {
    pub priority: i32,
    pub complexity: usize,
    pub length: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_variable_types: Option<HashMap<String, Vec<String>>>,
    pub low_priority: bool,
    /// Semantic type this pattern produces when used as a variable (e.g., "person", "place")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub semantic_type: Option<String>,
}
```

Find where `PatternMetadata` is constructed (search for `PatternMetadata {` in `wasm-core/src/`) and add `semantic_type: None` to every construction site to satisfy the compiler.

### Step 4: Run test to verify it passes

```bash
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1 pattern_metadata_has_semantic_type_field
```

Expected: PASS

### Step 5: Run full Rust test suite

```bash
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1
```

Expected: all 134 tests pass (0 failures).

### Step 6: Commit

```bash
git add wasm-core/src/pattern_processor/pattern.rs wasm-core/tests/
git commit -m "feat(wasm): add semantic_type field to PatternMetadata"
```

---

## Task 2: Parse `semanticType` from the JS pattern dictionary

**Files:**

- Modify: `wasm-core/src/pattern_processor/parser.rs:105-167`

### Step 1: Write a failing test

In `wasm-core/tests/pattern_semantic_type_test.rs`, add:

```rust
#[test]
fn parser_reads_semantic_type_from_object_format() {
    use chinese_translator_wasm_core::pattern_processor::parser::parse_patterns_dict;
    use serde_json::json;
    use std::collections::HashMap;

    let mut dict: HashMap<String, serde_json::Value> = HashMap::new();
    dict.insert(
        "X的Y".to_string(),
        json!({
            "translation": "Y của X",
            "semanticType": "person"
        }),
    );

    let patterns = parse_patterns_dict(dict);
    assert_eq!(patterns.len(), 1);
    assert_eq!(
        patterns[0].metadata.semantic_type.as_deref(),
        Some("person")
    );
}

#[test]
fn parser_leaves_semantic_type_none_when_absent() {
    use chinese_translator_wasm_core::pattern_processor::parser::parse_patterns_dict;
    use serde_json::json;
    use std::collections::HashMap;

    let mut dict: HashMap<String, serde_json::Value> = HashMap::new();
    dict.insert("X的Y".to_string(), json!({ "translation": "Y của X" }));

    let patterns = parse_patterns_dict(dict);
    assert_eq!(patterns.len(), 1);
    assert!(patterns[0].metadata.semantic_type.is_none());
}

#[test]
fn parser_leaves_semantic_type_none_for_simple_string_format() {
    use chinese_translator_wasm_core::pattern_processor::parser::parse_patterns_dict;
    use std::collections::HashMap;

    let mut dict: HashMap<String, serde_json::Value> = HashMap::new();
    dict.insert("X的Y".to_string(), serde_json::Value::String("Y của X".to_string()));

    let patterns = parse_patterns_dict(dict);
    assert_eq!(patterns.len(), 1);
    assert!(patterns[0].metadata.semantic_type.is_none());
}
```

### Step 2: Run tests to verify they fail

```bash
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1 parser_reads_semantic_type
```

Expected: FAIL — `semantic_type` is always `None`.

### Step 3: Update `parse_patterns_dict` to read `semanticType`

In `parser.rs`, the function signature and destructuring currently reads:

```rust
let (template, allowed_variable_types, allow_as_pattern_variable, low_priority) =
    if template_or_object.is_string() {
        (template_or_object.as_str().unwrap().to_string(), None, false, false)
    } else if template_or_object.is_object() {
        let obj = template_or_object.as_object().unwrap();
        // ... existing parsing ...
        (template, allowed_variable_types, allow_as_pattern_variable, low_priority)
    } else { continue; };
```

Extend the tuple to include `semantic_type`:

```rust
let (template, allowed_variable_types, allow_as_pattern_variable, low_priority, semantic_type) =
    if template_or_object.is_string() {
        (template_or_object.as_str().unwrap().to_string(), None, false, false, None)
    } else if template_or_object.is_object() {
        let obj = template_or_object.as_object().unwrap();

        let template = obj.get("translation").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let allowed_variable_types = obj.get("allowedVariableTypes").and_then(|v| serde_json::from_value(v.clone()).ok());
        let allow_as_pattern_variable = obj.get("allowAsPatternVariable").and_then(|v| v.as_bool()).unwrap_or(false);
        let low_priority = obj.get("lowPriority").and_then(|v| v.as_bool()).unwrap_or(false);
        let semantic_type = obj.get("semanticType").and_then(|v| v.as_str()).map(|s| s.to_string());

        (template, allowed_variable_types, allow_as_pattern_variable, low_priority, semantic_type)
    } else { continue; };
```

Then pass `semantic_type` into `parse_pattern(...)` and into `PatternMetadata` construction. Search for the `parse_pattern` function (likely in `parser.rs` or a sibling file) and add `semantic_type: Option<String>` as a parameter, setting it on `PatternMetadata`.

### Step 4: Run tests to verify they pass

```bash
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1 parser_reads_semantic_type parser_leaves_semantic_type_none
```

Expected: all three tests PASS.

### Step 5: Run full Rust test suite

```bash
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1
```

Expected: all 134+ tests pass.

### Step 6: Commit

```bash
git add wasm-core/src/pattern_processor/parser.rs wasm-core/tests/
git commit -m "feat(wasm): parse semanticType from pattern dictionary entries"
```

---

## Task 3: Use `semantic_type` in Phase B enhanced cache (PRIMARY FIX)

**Files:**

- Modify: `wasm-core/src/pattern_processor/two_phase.rs:295-304`

### Step 1: Write a failing integration test

In `wasm-core/tests/pattern_semantic_type_test.rs`, add:

```rust
/// A Phase A pattern with semanticType "person" should satisfy a Phase B
/// allowedVariableTypes constraint of ["person"].
#[test]
fn phase_a_semantic_type_satisfies_phase_b_constraint() {
    use chinese_translator_wasm_core::pattern_processor::parser::parse_patterns_dict;
    use chinese_translator_wasm_core::pattern_processor::two_phase::TwoPhasePatternProcessor;
    use serde_json::json;
    use std::collections::HashMap;

    // Pattern A: "X号" → "số X" (produces a "concept", can be Phase A variable)
    // Pattern B: "在X中" → "ở trong X" (X must be "concept")
    let mut dict: HashMap<String, serde_json::Value> = HashMap::new();
    dict.insert(
        "X号".to_string(),
        json!({
            "translation": "số X",
            "semanticType": "concept",
            "allowAsPatternVariable": true,
        }),
    );
    dict.insert(
        "在X中".to_string(),
        json!({
            "translation": "ở trong X",
            "allowedVariableTypes": { "X": ["concept"] },
        }),
    );

    let patterns = parse_patterns_dict(dict);
    let processor = TwoPhasePatternProcessor::new(patterns);

    // Build a minimal variable cache: "三" → "ba" (fills X in "X号")
    let mut cache = HashMap::new();
    cache.insert(
        "三".to_string(),
        chinese_translator_wasm_core::pattern_processor::types::VariableCacheEntry {
            translation: "ba".to_string(),
            source: "character".to_string(),
            var_type: None,
        },
    );

    // Input: tokens for "在三号中"
    // Expected: Phase A matches "三号" → "số ba", Phase B matches "在三号中" → "ở trong số ba"
    // This test verifies that Phase B's constraint ["concept"] is satisfied by Phase A's semanticType "concept"
    //
    // NOTE: This test requires constructing SemanticToken values. Look at existing integration
    // tests in wasm-core/tests/two_phase_test.rs for examples of how to build token arrays.
    // The test should assert that the result translation is "ở trong số ba".
    //
    // If the bug is present (hardcoded "structural_pattern"), Phase B will reject the Phase A
    // result because "structural_pattern" ∉ ["concept"], and the outer pattern won't match.
    // After the fix, "concept" ∈ ["concept"] → match succeeds.
    todo!("implement token construction — see two_phase_test.rs for examples")
}
```

Look at `wasm-core/tests/two_phase_test.rs` for examples of how to construct `SemanticToken` arrays and call the processor. Complete the test, then run it:

```bash
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1 phase_a_semantic_type_satisfies_phase_b_constraint
```

Expected: FAIL (Phase B rejects Phase A result due to type mismatch).

### Step 2: Apply the fix in `two_phase.rs`

Find the Phase B enhanced cache insertion block (line ~301):

```rust
// CURRENT (hardcoded):
enhanced_cache.insert(
    phase_a_result.original_text.clone(),
    VariableCacheEntry {
        translation: phase_a_result.translation.clone(),
        source: "phaseA_pattern".to_string(),
        var_type: Some("structural_pattern".to_string()),
    },
);
```

To read the matched pattern's `semantic_type`, you need access to it from `phase_a_result`. The cleanest way is to add a `semantic_type: Option<String>` field to `PatternProcessingResult` (search `wasm-core/src/` for `struct PatternProcessingResult`). Set it from the matched `SemanticPattern.metadata.semantic_type` at the point the result is created.

Once `phase_a_result.semantic_type` is available:

```rust
// FIXED:
enhanced_cache.insert(
    phase_a_result.original_text.clone(),
    VariableCacheEntry {
        translation: phase_a_result.translation.clone(),
        source: "phaseA_pattern".to_string(),
        var_type: Some(
            phase_a_result
                .semantic_type
                .as_deref()
                .unwrap_or("structural_pattern")
                .to_string(),
        ),
    },
);
```

### Step 3: Run tests to verify the fix works

```bash
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1 phase_a_semantic_type_satisfies_phase_b_constraint
```

Expected: PASS.

Also verify backward compatibility — existing patterns without `semanticType` still produce `"structural_pattern"` in the cache:

```rust
#[test]
fn phase_a_without_semantic_type_defaults_to_structural_pattern() {
    // Same setup but "X号" has no semanticType.
    // Phase B constraint: ["structural_pattern"] → should still match.
    // (Existing behavior preserved.)
    todo!()
}
```

### Step 4: Run full Rust test suite

```bash
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1
```

Expected: all tests pass.

### Step 5: Commit

```bash
git add wasm-core/src/pattern_processor/ wasm-core/tests/
git commit -m "feat(wasm): use pattern semanticType in Phase B variable cache instead of hardcoded 'structural_pattern'"
```

---

## Task 4: JS cross-pass — store `patternSemanticType` on leader tokens

_Lower-priority. Handles the case where a pattern-translated token from a previous chunk needs to carry its semantic type into the next chunk's variable cache._

**Files:**

- Modify: `src/utils/TranslationEngine.js` (functions `applyHierarchicalResults` ~line 3100, `applySemanticPatternResult` ~line 3648, `consumeMatchedTokens` ~line 3850)

### Background

When `applyHierarchicalResults` or `applySemanticPatternResult` finalizes a pattern match, it sets `token.translationSource = 'hierarchical_pattern'` or `'pattern'` on the leader token. At this point it also needs to set `token.patternSemanticType` to the matched pattern's `semanticType` value (if any), so the variable cache builder can read it later.

The `semantic_type` must come from the WASM result. Add `semantic_type: Option<String>` to the `PatternProcessingResult` Rust struct (already needed for Task 3), and the WASM binding will surface it as a JS property `semanticType` on each result object.

### Step 1: Write a JS test

In `src/utils/__tests__/TranslationEngine.patternSemanticType.test.js` (new file):

```javascript
import { describe, it, expect, vi } from 'vitest';

describe('patternSemanticType on leader tokens', () => {
  it('stores semanticType from pattern result on leader token', async () => {
    // This is an integration test using the real TranslationEngine.
    // After translating text where a pattern with semanticType fires,
    // the leader token in the returned token array should have patternSemanticType set.
    //
    // Consult TranslationEngine.resolveConflicts.test.js for engine setup patterns.
    // The assertion: tokens[leaderIndex].patternSemanticType === 'person' (or whatever the pattern declares)
    expect(true).toBe(false); // placeholder — implement after reading the test file for setup
  });
});
```

Look at `src/utils/__tests__/TranslationEngine.resolveConflicts.test.js` for how to set up a `TranslationEngine` instance in tests. Implement the test properly, then run:

```bash
npm test -- --run src/utils/__tests__/TranslationEngine.patternSemanticType.test.js
```

Expected: FAIL.

### Step 2: Implement the change

In `applyHierarchicalResults` (~line 3100) and `applySemanticPatternResult` (~line 3648), after setting `tokens[idx].translationSource`, add:

```javascript
tokens[idx].patternSemanticType = result.semanticType ?? null;
```

(`result.semanticType` comes from the WASM `PatternProcessingResult` with the new field from Task 3.)

In `consumeMatchedTokens` (~line 3850), the function already receives the pattern result — apply the same assignment to the leader token there.

### Step 3: Run test

```bash
npm test -- --run src/utils/__tests__/TranslationEngine.patternSemanticType.test.js
```

Expected: PASS.

### Step 4: Run full JS suite

```bash
npm test -- --run
```

Expected: 1211+ tests pass, 0 failures.

### Step 5: Commit

```bash
git add src/utils/TranslationEngine.js src/utils/__tests__/TranslationEngine.patternSemanticType.test.js
git commit -m "feat: store patternSemanticType on leader tokens from WASM pattern results"
```

---

## Task 5: JS cross-pass — read `patternSemanticType` in `buildVariableCache`

_Lower-priority. Companion to Task 4._

**Files:**

- Modify: `src/utils/TwoPhasePatternProcessor.js:140-176`

### Background

`buildVariableCache` Phase 1 (lines 140-176) currently only caches tokens where `token.translationSource?.includes('properNoun')`. Tokens translated by patterns have `translationSource` of `'pattern'` or `'hierarchical_pattern'` — they are skipped. Add a new block that caches pattern-translated tokens that have `patternSemanticType` set.

### Step 1: Write a failing test

In `src/utils/__tests__/TwoPhasePatternProcessor.buildVariableCache.test.js`:

```javascript
import { describe, it, expect } from 'vitest';

describe('buildVariableCache cross-pass pattern tokens', () => {
  it('includes pattern-translated token with patternSemanticType in cache', async () => {
    // Set up a TwoPhasePatternProcessor instance with a pattern that has allowedVariableTypes.
    // Provide a tokens array where one token has:
    //   translationSource: 'pattern'
    //   translated: 'Lưu Bị'
    //   value: '刘备'
    //   patternSemanticType: 'person'
    //
    // Call buildVariableCache (may need to expose it for testing — check if it's a private method).
    // Assert that cache['刘备'] === { translation: 'Lưu Bị', source: 'pattern', type: 'person' }
    expect(true).toBe(false); // placeholder
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test -- --run src/utils/__tests__/TwoPhasePatternProcessor.buildVariableCache.test.js
```

Expected: FAIL — pattern token not in cache.

### Step 3: Add the new block in `buildVariableCache`

After the existing Phase 1 block (line ~176), add:

```javascript
// 1b. Cache pattern-translated tokens that carry an explicit semantic type
for (const token of tokens) {
  if (
    token.translated &&
    token.patternSemanticType &&
    (token.translationSource === 'pattern' ||
      token.translationSource === 'hierarchical_pattern' ||
      token.translationSource === 'hierarchical_patterns' ||
      token.translationSource === 'hierarchical_patterns_composite')
  ) {
    cache[token.value] = {
      translation: token.translated,
      source: token.translationSource,
      type: token.patternSemanticType,
    };
  }
}
```

### Step 4: Run test

```bash
npm test -- --run src/utils/__tests__/TwoPhasePatternProcessor.buildVariableCache.test.js
```

Expected: PASS.

### Step 5: Run full JS suite

```bash
npm test -- --run
```

Expected: 1211+ tests pass.

### Step 6: Commit

```bash
git add src/utils/TwoPhasePatternProcessor.js src/utils/__tests__/TwoPhasePatternProcessor.buildVariableCache.test.js
git commit -m "feat: add pattern-translated tokens with patternSemanticType to variable cache"
```

---

## Task 6: UI — add semantic type selector to pattern entries

**Files:**

- Modify: `src/components/dictionary/DictionaryEntry.tsx:900`

### Background

The semantic type radio buttons render at lines 900-984, gated by:

```tsx
{(activeDictionary === 'phrases' || activeDictionary.startsWith('properNouns')) && (
```

We extend this to also render for `patterns`. The label changes to "Output Semantic Type" with a helper text line below it. The `allowedVariableTypes` section (lines 986-1065) stays below unchanged.

### Step 1: No test needed for this visual change — run type-check instead

```bash
npm run type-check
```

Expected: 0 errors (baseline).

### Step 2: Extend the condition to include patterns

Change line ~901:

```tsx
{
  /* Semantic type badge picker */
}
{
  (activeDictionary === 'phrases' ||
    activeDictionary.startsWith('properNouns') ||
    activeDictionary === 'patterns') && (
    <div className={styles.formGroup}>
      <label className={`${styles.label} ${styles.labelCentered}`}>
        {activeDictionary === 'patterns' ? 'Output Semantic Type' : 'Semantic Type'}
      </label>
      {activeDictionary === 'patterns' && (
        <p
          style={{
            fontSize: '0.7rem',
            color: 'var(--text-muted, #6b7280)',
            margin: '0 0 0.4rem',
            textAlign: 'center',
          }}
        >
          Type this pattern produces when used as a variable in another pattern. Leave blank to
          match any variable slot.
        </p>
      )}
      <div
        role="radiogroup"
        aria-label="Semantic type"
        style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}
      >
        {/* ... existing None + SEMANTIC_TYPE_LIST radio buttons unchanged ... */}
      </div>
    </div>
  );
}
```

Keep the existing radio button JSX inside the wrapper exactly as-is — only the condition and the label/helper text change.

Also update the comment on the `allowedVariableTypes` section (line ~986) to reflect the new layout:

```tsx
{
  /* Per-variable type constraints - only for patterns with variables (below output type) */
}
```

### Step 3: Run type-check

```bash
npm run type-check
```

Expected: 0 errors.

### Step 4: Run full JS suite

```bash
npm test -- --run
```

Expected: all tests pass.

### Step 5: Manual smoke test

Start the app (`npm run tauri:dev`), open a pattern entry in the dictionary editor. Verify:

- "Output Semantic Type" label appears above the per-variable constraint checkboxes
- Helper text appears below the label
- Selecting a type (e.g., Person) highlights the badge in blue
- Saving persists the `semanticType` field in the dictionary JSON
- Opening an existing pattern entry without `semanticType` shows "None" selected

### Step 6: Commit

```bash
git add src/components/dictionary/DictionaryEntry.tsx
git commit -m "feat(ui): add output semantic type selector to pattern entries"
```

---

## Final Verification

```bash
# All Rust tests
cargo test --manifest-path wasm-core/Cargo.toml -- --test-threads=1

# All JS tests
npm test -- --run

# TypeScript
npm run type-check
```

Expected: 134 Rust tests pass, 1211+ JS tests pass, 0 TypeScript errors.

Rebuild WASM and smoke-test end-to-end: open app, create a pattern with `semanticType: "person"` and `allowAsPatternVariable: true`, create a second pattern with `allowedVariableTypes: { X: ["person"] }`, translate text where the first pattern's result fills the second's slot, confirm the outer pattern matches.
