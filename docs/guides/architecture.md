# System Architecture

This guide describes the core architecture of the Chinese-Vietnamese Translation App, including the 5-phase translation pipeline, WASM acceleration systems, and semantic arrays for clickable highlighting.

---

## 5-Phase Translation Pipeline (IMMUTABLE)

**Fixed processing order** prevents double-processing conflicts:

1. **Pattern Processing** (Phase 1): Structural patterns with variables (例: "在XY中" → "ở trong X Y")
2. **Proper Noun Processing** (Phase 2): Novel-specific terms from proper noun dictionaries
3. **Number Processing** (Phase 3): Chinese numbers (百分之十五 → 15%, 三千十五 → 3,015)
4. **Phrase Processing** (Phase 4): Common phrases (不知道 → không biết)
5. **Character Processing** (Phase 5): Character dictionary fallback

**Why this order cannot change:**

- Each phase consumes tokens (sets `translated: null, translationSource: "X_consumed"`)
- Later phases only process unconsumed tokens
- Changing order breaks conflict resolution (例: proper nouns would match character-by-character instead)

**Implementation**: `TranslationEngine.js:translateSinglePass()` orchestrates all phases with shared token state.

---

## WASM Acceleration (Active Systems)

**Only 4 WASM systems are actively used:**

### 1. WASM Number Processor

- **Location**: `wasm-core/src/number_processor.rs`
- **Handles**: Chinese number conversion
- **Activation**: All texts with numbers
- **Speedup**: 5-10x vs JavaScript
- **Debug**: `window.translationEngine.dictionaryManager.getWasmStatus()`

### 2. WASM Pattern Processor

- **Location**: `wasm-core/src/pattern_processor/two_phase.rs`
- **Handles**: Two-phase hierarchical pattern matching (WASM-only, JavaScript fallback removed Jan 2025)
- **Activation**: All texts (mandatory)
- **Speedup**: 10-50x vs JavaScript
- **Algorithm**: O(n*k) find_longest_match replaces O(n*m²) character-by-character processing

### 3. WASM Dictionary Engine

- **Location**: `wasm-core/src/lib.rs` DictionaryEngine
- **Handles**: Trie-based dictionary lookups, loads 7 dictionaries with 27,000+ entries
- **Used via**: `WasmDictionaryManager.js`
- **Speedup**: O(k) trie lookups vs O(n) linear search

### 4. Rust Lookup Index

- **Location**: `src-tauri/src/lookup_index.rs` (Tauri backend)
- **Handles**: Trie indexing for character-only translation
- **Used via**: `RustLookupIndexManager.js`
- **Speedup**: 6-50x via backend trie indexing

**Archive**: See `docs/archive/pattern-optimization/` for WASM optimization history (hash map cloning elimination, string allocation reduction, early pattern rejection).

---

## WASM Dictionary Sync Validation (Automatic)

**4-layer state synchronization** (React → JS → WASM → Rust) can diverge if WASM sync fails silently.

**Automatic validation** (January 2025): Every dictionary reload validates WASM sync integrity:

- **Location**: `Translator.jsx:2150-2178` (handleForceReload)
- **What it checks**: Compares WASM vs JavaScript translation results for test words
- **When it runs**: After every Cmd/Ctrl-R reload
- **User notification**: Toast error if sync fails, falls back to JavaScript
- **Validation method**: `EnhancedDictionaryManager.validateWasmFallback()`

**Sync metrics tracking** (January 2025):

- Tracks batch vs sequential loading separately
- Records sync attempts, successes, failures with timestamps
- Maintains last 20 sync attempts in history
- Calculates success rates for overall, batch, and sequential loading
- Debug: `window.performanceDashboard.getWasmSyncMetrics()`

**Why this matters**:

- Batch loading may fail but sequential fallback succeeds (typical: 0% batch, 100% sequential)
- All 12 dictionaries can load successfully via sequential method
- Metrics show true system health, not just batch operation status

---

## Semantic Arrays (Clickable Highlighting)

**Direct position tracking** (January 2025): Positions stored during `postProcess()` text assembly instead of searching.

**Why precision is critical:**

- Translation and original text must synchronize exactly for click highlighting
- Position mapping uses `setPositionByMatch()` during text concatenation (O(1) lookup vs O(n\*m) search)
- All translation modes must preserve semantic array structure
- Breaking position mapping breaks clickable bidirectional highlighting

**Implementation**: `SemanticArrayBuilder.setPositionByMatch()`, `OptimizedSemanticArrayBuilder.setPositionByMatch()`

### Dual-Path Architecture (CRITICAL for debugging)

Clickable highlighting has TWO completely separate code paths:

#### 1. Character-only mode

- **Component**: `ClickableTranslationSemantic.tsx` → `SegmentPrecomputer.js`
- **Renders**: Bottom-left panel (character-by-character translation)
- **Segments**: Computed on-demand from semantic arrays using `precomputeSegments()`
- **Direction**: `'character-only-to-original'`

#### 2. Full Translation mode

- **Component**: `ClickableTranslationOptimized.tsx` → `TranslationEngine.js`
- **Renders**: Right panel (main translation with smart spacing)
- **Segments**: Prebuilt during translation in `translateWithProgressiveBatches()` (line 5184+)
- **Direction**: `'translation-to-original'`
- **Uses**: Prebuilt segments from `this.prebuiltSegments`, NOT SegmentPrecomputer

### Debugging clickable highlighting bugs

**Step 1: Identify which mode has the bug**

- Character-only issue? → Debug `SegmentPrecomputer.js`
- Full Translation issue? → Debug `TranslationEngine.js:5184-5350` (segment creation)

**Step 2: Verify component rendering**

- Check `TranslatorDisplayPanels.tsx`:
  - Line 170: Character-only uses `<ClickableTranslationSemantic>`
  - Line 221: Full Translation uses `<ClickableTranslationOptimized>`

**Step 3: Add diagnostic logging at the RIGHT place**

```javascript
// For Full Translation bugs, add logging in TranslationEngine.js around line 5280:
if (position >= 0) {
  if (wordInfo.translated.includes('problematic-text')) {
    logger.warn('🔍 Creating segment:', {
      translated: wordInfo.translated,
      position,
      extractedText: cleanedFinalResult.substring(position, position + wordInfo.translated.length),
    });
  }
}

// For Character-only bugs, add logging in SegmentPrecomputer.js around line 165:
if (bestMatch && bestMatch.unit.includes('problematic-text')) {
  logger.warn('🔍 Matching unit:', {
    unit: bestMatch.unit,
    position: currentPosition,
    endPosition,
  });
}
```

**Common pitfalls** (lessons from "màu" bug, Jan 2025):

- ❌ Assuming SegmentPrecomputer is used for all modes (it's only character-only)
- ❌ Adding diagnostics to the wrong component
- ❌ Not verifying which component renders which panel
- ✅ Check TranslatorDisplayPanels.tsx first to confirm code path
- ✅ Add logging early to verify execution path before debugging logic

---

## Token Processing Contracts (WASM-JavaScript Boundaries)

### Type Serialization Rules

**Problem**: Rust `Option<String>` serializes to JavaScript `undefined` (not `null`), causing "undefined" to appear as literal text.

**Rust structure**:

```rust
pub struct Token {
    pub value: String,
    pub translated: Option<String>,  // None → undefined in JS!
    pub translation_source: Option<String>,
}
```

**JavaScript handling**:

```javascript
// ❌ WRONG: Copies undefined, displays "undefined"
tokens[i].translated = processedTokens[i].translated;

// ✅ CORRECT: Explicit null conversion
if (processed.translationSource?.includes('consumed')) {
  tokens[i].translated = null; // Explicit null
} else if (processed.translated !== undefined) {
  tokens[i].translated = processed.translated;
}
```

### Token Modification Pattern

**All token processors (WASM or JavaScript) MUST**:

1. Maintain original token array length (no insert/delete)
2. Set consumed tokens to `{ translated: null, translationSource: "X_consumed" }`
3. Use explicit `null` (not `undefined`) for optional fields
4. Modify tokens in-place (don't replace array)

**Post-processing reliance**:

```javascript
// TranslationEngine.js:postProcess() depends on this pattern
if (token.translated !== null) {
  output = token.translated;  // Use translation
} else if (token.translationSource) {
  continue;  // Skip consumed (null + source = consumed)
} else {
  // Character fallback
}
```

**Critical**: Consumed tokens MUST have `translated: null`, otherwise processed instead of skipped.

### WASM Boundary Type Contracts (Enhanced 2026-01-16)

**Location**: `types/WasmTypes.ts`

**Comprehensive validation** for all 4 WASM systems:

1. **WasmToken** - Number processor tokens with undefined → null conversion
2. **WasmPatternMatch** - Pattern processor results with validation
3. **WasmDictionaryMatch** - Dictionary engine results with defaults
4. **RustLookupMatch** - Lookup index results with type enforcement

**Validation functions**:

- `validateWasmToken()` - Converts undefined to null, logs warnings
- `validateWasmPatternMatch()` - Ensures required fields, provides defaults
- `validateWasmDictionaryMatch()` - Infers length from word, default priority
- `validateRustLookupMatch()` - Enforces dictionary type, infers length
- `copyWasmTokens()` - Two-phase validation prevents partial corruption

**Safety rules documented**:

- undefined → null conversion (Rule 1)
- Array length preservation (Rule 2)
- In-place modification (Rule 3)
- Consumed token pattern (Rule 4)
- Two-phase validation (Rule 5)
- Error propagation (Rule 6)

**Test coverage**: 57 tests across WasmTypes.test.ts and WasmBoundaryEdgeCases.test.js

---

## System Requirements

- Node.js compatible with Vite 7.0+
- 4GB+ memory for concurrent dictionary loading
- Rust toolchain for WASM builds (installed automatically via Tauri)
- WASM support (automatic fallback for number processing, WASM-only for pattern matching)
- Tauri system dependencies:
  - macOS: Xcode Command Line Tools
  - Linux: webkit2gtk, libssl-dev, build-essential
  - Windows: Visual Studio Build Tools, WebView2

---

## Related Guides

- [Development Guide](./development.md) - Development guidelines, logging, testing
- [Performance Guide](./performance.md) - Performance monitoring and optimization
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
