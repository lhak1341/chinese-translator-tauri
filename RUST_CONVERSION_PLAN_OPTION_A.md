# Rust Conversion Plan - Option A (Maximum Safe Rust)

**Goal**: Convert isolated, stateless components to Rust following proven `number_processor.rs` pattern
**Approach**: Incremental, test after each conversion, maintain JavaScript fallbacks
**Timeline**: 3 conversions, test between each

---

## 🎯 **Conversion Targets (In Order)**

### Phase 1: Text Chunking (EASIEST) ✅ Start here
- **Complexity**: Low
- **Risk**: Very Low
- **Benefit**: Better Unicode handling, regex performance
- **Estimated time**: 2-3 days

### Phase 2: Position Mapping (MEDIUM)
- **Complexity**: Medium
- **Risk**: Low
- **Benefit**: Faster array processing, zero GC
- **Estimated time**: 3-5 days

### Phase 3: Semantic Array Building (HARDEST)
- **Complexity**: High
- **Risk**: Medium (memory layout across boundary)
- **Benefit**: Eliminate GC pressure from object creation
- **Estimated time**: 5-7 days

---

## 📋 **Phase 1: Text Chunking → Rust**

### Current Implementation
**File**: `src/utils/TextChunker.js`

**Key functions**:
```javascript
chunk(text, options) {
  // Splits text at 18 punctuation types
  // Returns array of ~200 char chunks
  // Uses Unicode regex
}
```

### Rust Implementation Plan

**1. Create WASM module**: `wasm-core/src/text_chunker.rs`

```rust
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct ChunkOptions {
    pub max_chunk_size: usize,
    pub min_chunk_size: usize,
    pub punctuation_types: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct TextChunk {
    pub text: String,
    pub start_index: usize,
    pub end_index: usize,
    pub is_translatable: bool,
}

#[wasm_bindgen]
pub struct TextChunker {
    // Compiled regex patterns cached
}

#[wasm_bindgen]
impl TextChunker {
    #[wasm_bindgen(constructor)]
    pub fn new() -> TextChunker {
        // Initialize regex patterns
    }

    #[wasm_bindgen]
    pub fn chunk(&self, text: &str, options: JsValue) -> JsValue {
        // Parse options
        // Split at punctuation using Unicode-aware regex
        // Return chunks as JsValue
    }
}
```

**2. JavaScript wrapper**: `src/utils/WasmTextChunker.js`

```javascript
import init, { TextChunker } from '../wasm/translation_wasm.js';

export class WasmTextChunker {
  constructor() {
    this.chunker = null;
    this.initialized = false;
  }

  async initialize() {
    await init();
    this.chunker = new TextChunker();
    this.initialized = true;
  }

  chunk(text, options) {
    if (!this.initialized) {
      throw new Error('WasmTextChunker not initialized');
    }
    return this.chunker.chunk(text, options);
  }
}
```

**3. Integration in TranslationEngine**:

```javascript
// TranslationEngine.js constructor
try {
  this.wasmTextChunker = new WasmTextChunker();
  await this.wasmTextChunker.initialize();
  this.useWasmChunking = true;
} catch (error) {
  console.warn('WASM text chunking unavailable, using JavaScript fallback');
  this.useWasmChunking = false;
}

// In translate() method:
const chunks = this.useWasmChunking
  ? this.wasmTextChunker.chunk(text, options)
  : this.textChunker.chunk(text, options);
```

### Testing Checklist

- [ ] Same chunk count as JavaScript version
- [ ] Same chunk boundaries (verify start/end indices)
- [ ] Handles all 18 punctuation types
- [ ] Performance equal or better
- [ ] Fallback to JS works if WASM fails

---

## 📋 **Phase 2: Position Mapping → Rust**

### Current Implementation
**File**: `src/utils/PositionTracker.js`

**Key functions**:
```javascript
findPositionInOriginal(semanticIndex, semanticUnits) {
  // Binary search + linear scan
  // Returns character position
}

buildPositionCache(semanticUnits) {
  // Builds lookup cache for sliding window
  // Returns Map of positions
}
```

### Rust Implementation Plan

**1. Create WASM module**: `wasm-core/src/position_mapper.rs`

```rust
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone)]
pub struct SemanticUnit {
    pub start: usize,
    pub end: usize,
    pub text: String,
}

#[wasm_bindgen]
pub struct PositionMapper {
    cache: HashMap<usize, usize>,
}

#[wasm_bindgen]
impl PositionMapper {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PositionMapper {
        PositionMapper {
            cache: HashMap::new(),
        }
    }

    // Build cache from semantic units
    pub fn build_cache(&mut self, semantic_units: JsValue) -> Result<(), JsValue> {
        let units: Vec<SemanticUnit> = serde_wasm_bindgen::from_value(semantic_units)?;

        // Build position cache using sliding window logic
        // ...

        Ok(())
    }

    // Find position with cache lookup
    pub fn find_position(&self, semantic_index: usize) -> Option<usize> {
        self.cache.get(&semantic_index).copied()
    }

    // Batch position lookup (reduce boundary crossings)
    pub fn find_positions(&self, indices: Vec<usize>) -> Vec<Option<usize>> {
        indices.iter()
            .map(|idx| self.cache.get(idx).copied())
            .collect()
    }
}
```

**2. JavaScript wrapper**: `src/utils/WasmPositionMapper.js`

```javascript
export class WasmPositionMapper {
  constructor() {
    this.mapper = null;
    this.initialized = false;
  }

  async initialize() {
    await init();
    this.mapper = new PositionMapper();
    this.initialized = true;
  }

  buildCache(semanticUnits) {
    return this.mapper.build_cache(semanticUnits);
  }

  findPosition(semanticIndex) {
    return this.mapper.find_position(semanticIndex);
  }

  // Batch API to reduce boundary crossings
  findPositions(indices) {
    return this.mapper.find_positions(indices);
  }
}
```

**3. Integration**: Replace `PositionTracker` calls with WASM version

### Testing Checklist

- [ ] Same positions as JavaScript version for all test cases
- [ ] Sliding window cache matches JavaScript implementation
- [ ] Performance improvement verified (measure with 2000+ char texts)
- [ ] Batch API reduces boundary crossings (log count)
- [ ] Clickable highlighting still works perfectly

---

## 📋 **Phase 3: Semantic Array Building → Rust**

### Current Implementation
**File**: `src/utils/TranslationEngine.js` - `buildSemanticArray()` method

**What it does**:
```javascript
buildSemanticArray(tokens) {
  // Creates semantic units from tokens
  // Heavy object allocation (GC pressure)
  // Returns array of semantic units with metadata
}
```

### Rust Implementation Plan

**1. Add to existing module**: `wasm-core/src/lib.rs` or new `semantic_builder.rs`

```rust
#[derive(Serialize, Deserialize)]
pub struct Token {
    pub value: String,
    pub translated: Option<String>,
    pub translation_source: Option<String>,
    // ... other fields
}

#[derive(Serialize, Deserialize)]
pub struct SemanticUnit {
    pub start: usize,
    pub end: usize,
    pub original_text: String,
    pub translated_text: String,
    pub metadata: HashMap<String, String>,
}

#[wasm_bindgen]
pub struct SemanticArrayBuilder {
    // Pre-allocated buffer pool
    buffer_pool: Vec<Vec<SemanticUnit>>,
}

#[wasm_bindgen]
impl SemanticArrayBuilder {
    #[wasm_bindgen(constructor)]
    pub fn new() -> SemanticArrayBuilder {
        // Pre-allocate buffers to avoid allocations during translation
        SemanticArrayBuilder {
            buffer_pool: Vec::new(),
        }
    }

    pub fn build_semantic_array(&mut self, tokens: JsValue) -> Result<JsValue, JsValue> {
        let tokens: Vec<Token> = serde_wasm_bindgen::from_value(tokens)?;

        // Build semantic units with pre-allocated memory
        let semantic_units = self.build_from_tokens(&tokens);

        Ok(serde_wasm_bindgen::to_value(&semantic_units)?)
    }

    fn build_from_tokens(&mut self, tokens: &[Token]) -> Vec<SemanticUnit> {
        // Reuse buffer from pool if available
        let mut units = self.buffer_pool.pop()
            .unwrap_or_else(|| Vec::with_capacity(tokens.len()));

        units.clear();

        // Build semantic units
        // ...

        units
    }

    // Return buffer to pool for reuse
    pub fn recycle_buffer(&mut self, _units: JsValue) {
        // Implementation
    }
}
```

**2. Integration**: Use WASM for semantic array building

### Testing Checklist

- [ ] Semantic array structure matches JavaScript version
- [ ] All metadata fields preserved
- [ ] Position indices match exactly
- [ ] GC pressure reduced (measure with memory profiling)
- [ ] Translation quality unchanged
- [ ] Clickable highlighting works

---

## 🔧 **Implementation Strategy**

### For Each Phase:

**1. Implement Rust module**
- Follow `number_processor.rs` pattern
- Add to `lib.rs` exports
- Write unit tests in Rust

**2. Build WASM**
```bash
npm run build-wasm-dev
```

**3. Create JavaScript wrapper**
- Initialize WASM module
- Provide fallback to JavaScript
- Match existing API

**4. Integrate with try-catch**
```javascript
try {
  const result = await wasmModule.process(input);
  // Use WASM result
} catch (error) {
  console.warn('WASM failed, using JavaScript fallback:', error);
  const result = jsModule.process(input);
  // Use JS result
}
```

**5. Test thoroughly**
- Unit tests (Rust side)
- Integration tests (JS side)
- Performance benchmarks
- User acceptance testing

**6. Commit and push**
```bash
git add -A
git commit -m "feat: Add WASM [module name] with JavaScript fallback"
git push
```

**7. User testing before next phase**

---

## 🧪 **Verification Methodology**

### For Each Conversion:

**1. Correctness Tests**
```javascript
// Compare WASM vs JS output
const jsResult = jsModule.process(input);
const wasmResult = wasmModule.process(input);

console.assert(
  JSON.stringify(jsResult) === JSON.stringify(wasmResult),
  'WASM output must match JavaScript output exactly'
);
```

**2. Performance Tests**
```javascript
// Measure both implementations
const jsTime = measureTime(() => jsModule.process(largeInput));
const wasmTime = measureTime(() => wasmModule.process(largeInput));

console.log(`JS: ${jsTime}ms, WASM: ${wasmTime}ms, Speedup: ${(jsTime/wasmTime).toFixed(2)}x`);
```

**3. Fallback Tests**
```javascript
// Verify JavaScript fallback works when WASM unavailable
delete window.WebAssembly;
const result = module.process(input); // Should use JS fallback
```

**4. Integration Tests**
```javascript
// End-to-end translation test
const translation = await translationEngine.translate(sampleText);
// Verify translation quality unchanged
// Verify clickable highlighting works
```

---

## 📊 **Success Criteria**

### Phase 1 (Text Chunking):
- ✅ Builds and runs without errors
- ✅ Produces identical chunks to JavaScript version
- ✅ Performance same or better
- ✅ Fallback works if WASM fails

### Phase 2 (Position Mapping):
- ✅ All above, plus:
- ✅ Clickable highlighting still works perfectly
- ✅ Measurable performance improvement on large texts
- ✅ Batch API reduces boundary crossings

### Phase 3 (Semantic Arrays):
- ✅ All above, plus:
- ✅ Translation quality unchanged
- ✅ Memory pressure reduced (verify with profiling)
- ✅ All semantic metadata preserved

---

## 🚨 **Rollback Triggers**

**Stop and rollback if**:
- Translation quality degrades
- Clickable highlighting breaks
- Performance gets worse
- Too many edge cases discovered
- Development time exceeds 2x estimate

**How to rollback**:
```bash
# Remove WASM module
rm wasm-core/src/[module].rs

# Remove from lib.rs exports
# Edit lib.rs to remove module reference

# Revert JavaScript integration
git checkout HEAD -- src/utils/TranslationEngine.js

# Rebuild
npm run build-wasm-dev
```

---

## 💡 **Tips for Success**

1. **Start simple**: Text Chunking is easiest, builds confidence
2. **Test incrementally**: Don't move to next phase until current phase is solid
3. **Keep fallbacks**: Always maintain JavaScript version
4. **Profile first**: Measure actual performance gains
5. **Document as you go**: Update CLAUDE.md with new WASM systems
6. **User test between phases**: Get feedback before continuing

---

## 📅 **Proposed Timeline**

**Week 1**: Phase 1 (Text Chunking)
- Day 1-2: Implement Rust module
- Day 3: Integration and testing
- Day 4: User testing and fixes
- Day 5: Buffer day / documentation

**Week 2**: Phase 2 (Position Mapping)
- Day 1-3: Implement Rust module (more complex)
- Day 4: Integration and testing
- Day 5: User testing

**Week 3**: Phase 3 (Semantic Arrays)
- Day 1-4: Implement Rust module (most complex)
- Day 5: Integration and testing

**Week 4**: Final testing and polish
- Comprehensive testing across all phases
- Performance benchmarking
- Documentation updates

---

## ✅ **Ready to Start?**

**Next steps**:
1. You test current code (WASM silent failure fixes + dead code removal)
2. If tests pass, we commit to starting Phase 1 (Text Chunking)
3. I'll implement the Rust module following the plan above
4. You test, we iterate, then move to Phase 2

**Sound good?**

---

*Plan created: January 2, 2026*
*Approach: Incremental, safe, testable*
