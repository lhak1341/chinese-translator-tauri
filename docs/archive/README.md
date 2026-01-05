# Archive

Historical documentation for reference. **These documents are not actively maintained** - they represent point-in-time investigations, optimizations, and decisions.

**For active development**, consult `CLAUDE.md` in the root directory.

---

## When to Consult the Archive

### Pattern Optimization History

**Location**: `pattern-optimization/`

**Consult when**:
- Investigating why WASM pattern matching is 10-50x faster than JavaScript
- Understanding pattern matching algorithm evolution (O(n*m²) → O(n*k))
- Debugging WASM pattern processor issues
- Researching hash map cloning elimination, string allocation reduction, early pattern rejection techniques

**Key documents**:
- `PATTERN_MATCHING_PHASE1_OPTIMIZATIONS.md` - Hash map cloning (40-60% speedup), string allocation (30-40% speedup), token cloning delay (10-15% speedup)
- `EARLY_PATTERN_REJECTION_IMPLEMENTATION.md` - Fast-path check for literal-starting patterns (3-4% additional speedup)
- `PATTERN_MATCHING_PHASE2_ROADMAP.md` - Future optimization opportunities
- `RUST_SIDE_PROFILING_GUIDE.md` - How to profile Rust WASM code
- `DICTIONARY_PHASE_BATCHING_RUST_PLAN.md` - Batch processing optimizations

### Refactoring History

**Location**: `refactoring-2026/`

**Consult when**:
- Planning to extract code from large files (TranslationEngine.js, Translator.jsx)
- Understanding extraction criteria (what can vs cannot be extracted)
- Learning from successful extractions (MemoryLeakDetector, TokenHelpers, PatternPriorityCalculator)
- Understanding why certain code must remain coupled (stats "formatters" analysis)

**Key documents**:
- `EXTRACTION_ANALYSIS.md` - Why stats formatters cannot be extracted (distinguishes pure formatters from accessor methods)
- `EXTRACTION_SUMMARY.md` - 5 successful extractions (~680 lines), pattern for future work, verification steps
- `REFACTORING_PLAN.md` - Complete analysis of extraction candidates
- `REFACTORING_PROGRESS.md` - Actual progress and impact achieved

**Key insights**:
```javascript
// ✅ Can extract: Pure utilities
export function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ❌ Cannot extract: Accessor methods
getEngineStats() {
  return {
    stats: this.stats,  // Instance property
    dictionary: this.dictionaryManager.getGlobalStats() // Instance method
  };
}
```

### Migration History

**Location**: `migrations/`

**Consult when**:
- Understanding why full 5-phase WASM engine was removed
- Debugging WASM-JavaScript serialization issues
- Learning from WASM architecture decisions (focused acceleration vs full pipeline replacement)
- Understanding trade-offs between WASM and JavaScript implementations

**Key documents**:
- `WASM_REMOVAL_MIGRATION_GUIDE.md` - Complete history of WasmTranslationAccelerator.js removal (1,951 lines), serialization issues, why focused WASM (number processing, pattern matching) succeeded where full pipeline failed

---

## Archive Maintenance Policy

**These documents are NOT maintained**:
- Dates may be outdated
- File paths may have changed
- Code examples may not reflect current implementation
- Performance numbers may differ from current benchmarks

**Use archive for**:
- Historical context on architectural decisions
- Learning from past mistakes and successes
- Understanding why certain patterns were tried and abandoned
- Reference for similar future investigations

**Do NOT use archive for**:
- Current development guidelines (use CLAUDE.md)
- Active debugging methodologies (use CLAUDE.md)
- Production code examples (use actual codebase)
- Performance baselines (use current profiling)

---

## Quick Navigation

### Want to optimize pattern matching?
→ `pattern-optimization/PATTERN_MATCHING_PHASE2_ROADMAP.md`

### Want to extract code from large files?
→ `refactoring-2026/EXTRACTION_ANALYSIS.md`

### Wondering why WASM full engine was removed?
→ `migrations/WASM_REMOVAL_MIGRATION_GUIDE.md`

### Need extraction criteria?
→ `refactoring-2026/EXTRACTION_SUMMARY.md` - Section "Pattern for Future Extractions"

### Want to profile Rust WASM code?
→ `pattern-optimization/RUST_SIDE_PROFILING_GUIDE.md`
