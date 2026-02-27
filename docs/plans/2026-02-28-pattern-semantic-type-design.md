# Design: Semantic Type for Structural Pattern Entries

**Date**: 2026-02-28
**Status**: Approved
**Approach**: A (minimal — fixed type on pattern entry, inline cache registration)

---

## Problem

Structural patterns (Phase 1) can serve as variables inside other structural patterns via WASM hierarchical composition (Phase A result fills a Phase B slot). However, `allowedVariableTypes` constraints on Phase B patterns cannot match Phase A results by semantic type because:

1. **Intra-pass (WASM)**: `two_phase.rs` stamps all Phase A results added to the enhanced cache with the hardcoded type `"structural_pattern"`, so Phase B's type check (`matcher.rs:449-468`) can never match constraints like `["person"]` or `["place"]`.
2. **Cross-pass (JS)**: Already-translated tokens from pattern sources have no `semanticType` stored on them, so `buildVariableCache` Phase 1 cannot populate a meaningful `type` for the cache entry.

---

## Design

### Section 1 — Data Model

`DictionaryEntryMetadata.semanticType?: string` already exists and is unrestricted — no TypeScript changes needed. Pattern entries can store this field today; it was simply never populated or surfaced in the UI.

On the Rust side, `SemanticPattern` and `PatternMetadata` currently have no `semantic_type` field. We add:

```rust
// pattern.rs — PatternMetadata
pub struct PatternMetadata {
    // ... existing fields ...
    pub semantic_type: Option<String>,  // NEW
}

// pattern.rs — SemanticPattern
pub struct SemanticPattern {
    // ... existing fields ...
    // (carried through metadata)
}
```

`parse_patterns_dict` in `parser.rs` reads `semanticType` from the JS object alongside the existing `allowedVariableTypes`:

```rust
// parser.rs
let semantic_type = obj.get("semanticType")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());
```

`semanticType` is optional everywhere — absent means untyped (matches any variable slot). Fully backward-compatible.

---

### Section 2 — Translation Engine: WASM (primary fix)

**File**: `wasm-core/src/pattern_processor/two_phase.rs`, lines 295-303

**Current code** (approximate):

```rust
enhanced_cache.insert(matched_text.clone(), CacheEntry {
    translation: result.translation.clone(),
    var_type: Some("structural_pattern".to_string()),
    // ...
});
```

**Change**: use the pattern's own `semanticType` if present, fall back to `"structural_pattern"`:

```rust
enhanced_cache.insert(matched_text.clone(), CacheEntry {
    translation: result.translation.clone(),
    var_type: Some(
        pattern.metadata.semantic_type
            .as_deref()
            .unwrap_or("structural_pattern")
            .to_string()
    ),
    // ...
});
```

No change to the type-check logic in `matcher.rs:449-468` — it already validates `var_type` against `allowedVariableTypes` correctly once the type value is right.

---

### Section 3 — Translation Engine: JS cross-pass fix

**Files**: `TranslationEngine.js` (`postProcess`), `TwoPhasePatternProcessor.js` (`buildVariableCache`)

When a leader token is finalized in `postProcess` with a pattern-based `translationSource` (`'pattern'`, `'hierarchical_pattern'`, `'hierarchical_patterns'`, `'hierarchical_patterns_composite'`), copy the matched pattern's `semanticType` onto the token:

```javascript
token.patternSemanticType = matchedPattern.semanticType ?? null;
```

`buildVariableCache` Phase 1 (already-translated tokens, lines 158-171) reads this field as `entryType`:

```javascript
const entryType = token.patternSemanticType ?? null;
cache[token.value] = {
  translation: token.translated,
  source: token.translationSource,
  type: entryType,
};
```

Absent `patternSemanticType` → `type: null` → untyped, matches all variable slots.

This is lower-priority than Section 2 (Section 2 covers the common intra-pass case), but completes the contract for cross-chunk/sentence scenarios.

---

### Section 4 — UI (DictionaryEntry.tsx)

The existing semantic type radio buttons (lines 914-981) render for `phrases` and `properNouns` entries. Extend the condition to include `patterns`.

For pattern entries, render the semantic type radio buttons **above** the existing `allowedVariableTypes` per-variable checkboxes:

- **Label**: "Output Semantic Type"
- **Helper text**: "Type this pattern produces when used as a variable in another pattern. Leave blank to match any variable slot."
- **Controls**: same None + person / place / concept / object radio buttons — no new components needed

Layout (top → bottom):

1. Output Semantic Type (radio buttons) — **new**
2. Variable Type Constraints (per-variable checkboxes) — existing, unchanged

---

## Files Touched

| File                                            | Change                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `wasm-core/src/pattern_processor/pattern.rs`    | Add `semantic_type: Option<String>` to `PatternMetadata`                                  |
| `wasm-core/src/pattern_processor/parser.rs`     | Parse `semanticType` from JS object                                                       |
| `wasm-core/src/pattern_processor/two_phase.rs`  | Use pattern `semantic_type` instead of hardcoded `"structural_pattern"` in enhanced cache |
| `TranslationEngine.js`                          | Store `patternSemanticType` on leader token during `postProcess`                          |
| `src/utils/TwoPhasePatternProcessor.js`         | Read `token.patternSemanticType` as `entryType` in `buildVariableCache` Phase 1           |
| `src/components/dictionary/DictionaryEntry.tsx` | Add semantic type radio buttons for pattern entries above `allowedVariableTypes` section  |

No changes to: `DictionaryTypes.ts`, `SemanticTypes.ts`, `matcher.rs` type-check logic, or any test infrastructure.

---

## Constraints

- **Backward-compatible**: patterns without `semanticType` remain untyped and match any variable slot. No existing dictionary entries break.
- **No new UI components**: reuses the existing radio button set.
- **No new WASM exports**: `semanticType` is passed as part of the existing pattern dict JSON; the Rust parser reads it from the already-deserialized `Value`.
- **CLAUDE.md gotcha applies**: `SemanticArrayBuilder` and `OptimizedSemanticArrayBuilder` are not touched here. `TranslationEngine.js` is intentionally JavaScript — no migration.
