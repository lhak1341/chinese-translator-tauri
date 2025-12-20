# Phase 7 Integration Plan

## Current Architecture Analysis

### TranslationEngine Flow
```
translate()
  → Try Rust Core Engine (Phase 6)
  → Fall back to JavaScript: translateDirectly()
      → tokenize()
      → translateSinglePass()
          → applyPatterns()           ← INTEGRATION POINT 1
          → applyProperNouns()
          → applyNumbers()
          → applyPhrases()
          → processRemainingTokens()
```

### Current Pattern Systems (JavaScript)
1. **SemanticPatternProcessor** - Basic pattern matching
2. **TwoPhasePatternProcessor** - Hierarchical pattern processing

### What We Built (WASM - Phases 3-6)
1. **PatternManager** - Advanced pattern matching with O(1) lookup
2. **HierarchicalResolver** - Type-aware variable resolution
3. **PatternComposer** - Pattern composition (Sequence, Alternative, Nested, Conditional)
4. **Profiler** - Performance tracking

## Integration Strategy

### Option A: Replace SemanticPatternProcessor (RECOMMENDED)
**Pros:**
- Clean replacement of old system with new WASM system
- Full control over pattern matching
- Enables all Phase 3-6 features
- Better performance (15-30x speedup)

**Cons:**
- Need to migrate existing pattern definitions
- More testing required

**Implementation:**
1. Keep both systems temporarily for comparison
2. Add feature flag to switch between old/new
3. Wire PatternManager into applyPatterns()
4. Migrate pattern definitions
5. Test thoroughly
6. Remove old system once validated

### Option B: Hybrid Approach
**Pros:**
- Lower risk - keep fallback
- Gradual migration

**Cons:**
- Complexity of maintaining two systems
- Unclear which system is responsible for what

## Integration Architecture

### 1. Pattern Configuration Loader
**File:** `src/utils/PatternConfiguration.js`

**Purpose:** Load pattern definitions and feed them to PatternManager

**Pattern Format:**
```javascript
{
  patterns: [
    {
      pattern: "X的Y",
      translation: "Y của X",
      priority: 1,
      typeConstraints: {
        X: ["Person", "ProperNoun"],
        Y: ["Character", "Object"]
      }
    },
    {
      pattern: "从X到Y",
      translation: "từ X đến Y",
      priority: 2,
      typeConstraints: {
        X: ["Place", "Time"],
        Y: ["Place", "Time"]
      }
    }
  ],
  composedPatterns: [
    {
      id: "x_de_y_he_z",
      components: ["X的Y", "和Z"],
      operation: "Sequence",
      template: "C0 C1",
      priority: 1
    }
  ]
}
```

### 2. Dictionary Lookup Bridge
**File:** `src/utils/WasmTranslationAccelerator.js` (extend)

**Purpose:** Bridge between WASM pattern variable resolution and JavaScript dictionary lookups

**Implementation:**
```javascript
// Add to WasmTranslationAccelerator
createVariableLookupFunction(dictionaryManager) {
  return (text) => {
    // Look up in dictionaries
    const result = dictionaryManager.translate(text, ['properNouns', 'characters', 'phrases']);

    if (result && result.translation) {
      // Determine variable type from dictionary
      let varType = this.inferVariableType(result.source);

      return {
        translation: result.translation,
        varType: varType,
        sourceDict: result.source
      };
    }

    return null;
  };
}

inferVariableType(dictionaryName) {
  const typeMap = {
    'properNouns': 'ProperNoun',
    'persons': 'Person',
    'places': 'Place',
    'characters': 'Character',
    'phrases': 'Phrase',
    // ... etc
  };
  return typeMap[dictionaryName] || 'Generic';
}
```

### 3. TranslationEngine Integration
**File:** `src/utils/TranslationEngine.js`

**Changes to constructor:**
```javascript
constructor() {
  // ... existing code ...

  // Phase 7: Initialize WASM Pattern Manager
  this.patternManagerWasm = null;
  this.useWasmPatterns = false; // Feature flag
  this.initializeWasmPatternManager();
}

async initializeWasmPatternManager() {
  try {
    // Load pattern configuration
    const patternConfig = await this.loadPatternConfiguration();

    // Initialize PatternManager
    const { PatternManager } = await import('../wasm/wasm_core.js');
    this.patternManagerWasm = PatternManager.new();

    // Load patterns
    for (const pattern of patternConfig.patterns) {
      this.patternManagerWasm.addPattern(
        pattern.pattern,
        pattern.translation,
        pattern.priority
      );

      // Add type constraints
      if (pattern.typeConstraints) {
        for (const [variable, types] of Object.entries(pattern.typeConstraints)) {
          this.patternManagerWasm.addTypeConstraint(
            pattern.pattern,
            variable,
            types
          );
        }
      }
    }

    // Load composed patterns
    for (const composed of patternConfig.composedPatterns) {
      this.patternManagerWasm.addComposedPattern(
        composed.id,
        composed.components,
        composed.operation,
        composed.template,
        composed.priority
      );
    }

    // Enable WASM patterns
    this.useWasmPatterns = true;
    console.log('✅ Phase 7: WASM Pattern Manager initialized');

  } catch (error) {
    console.warn('⚠️ Failed to initialize WASM Pattern Manager, using JavaScript fallback:', error);
    this.useWasmPatterns = false;
  }
}
```

**Changes to applyPatterns method:**
```javascript
async applyPatterns(tokens, options) {
  // Phase 7: Try WASM pattern matching first
  if (this.useWasmPatterns && this.patternManagerWasm) {
    return this.applyPatternsWasm(tokens, options);
  }

  // Fallback to JavaScript pattern processor
  if (!this.semanticPatternProcessor.isInitialized) {
    return;
  }

  // ... existing JavaScript pattern code ...
}

async applyPatternsWasm(tokens, options) {
  this.log(DEBUG_LEVELS.INFO, '🚀 Using WASM Pattern Manager for pattern matching');

  // Reconstruct text from tokens
  const text = this.getTextFromTokens(tokens);

  // Create variable lookup function
  const lookupFn = (varText) => {
    const result = this.dictionaryManager.translate(varText, ['properNouns', 'characters', 'places', 'persons']);

    if (result && result.translation) {
      return {
        translation: result.translation,
        varType: this.inferVariableType(result.source),
        sourceDict: result.source
      };
    }
    return null;
  };

  // Try pattern matching at each position
  const matches = [];

  for (let i = 0; i < tokens.length; i++) {
    // Skip already processed tokens
    if (tokens[i].translated !== null || tokens[i].translationSource) {
      continue;
    }

    // Get text from current position
    const remainingText = this.reconstructTextFromIndex(tokens, i);

    // Try pattern match
    try {
      const matchResult = this.patternManagerWasm.matchPattern(remainingText);

      if (matchResult) {
        // Parse the match result
        const match = JSON.parse(matchResult);

        // Resolve variables using dictionary lookups
        const resolvedMatch = this.resolvePatternVariables(match, lookupFn);

        if (resolvedMatch) {
          matches.push({
            startIndex: i,
            endIndex: i + this.getTokenSpanForText(tokens, i, match.matched_text) - 1,
            translation: resolvedMatch.translation,
            originalText: match.matched_text,
            pattern: match.pattern,
            confidence: resolvedMatch.confidence
          });

          // Skip tokens consumed by this match
          i += this.getTokenSpanForText(tokens, i, match.matched_text) - 1;
        }
      }
    } catch (error) {
      this.log(DEBUG_LEVELS.WARN, `⚠️ WASM pattern match error at position ${i}:`, error);
    }
  }

  // Apply matches to tokens
  for (const match of matches) {
    this.applyPatternMatchToTokens(tokens, match, options);
  }

  this.log(DEBUG_LEVELS.INFO, `✅ WASM pattern matching completed: ${matches.length} patterns applied`);
}

resolvePatternVariables(match, lookupFn) {
  // For each variable in the match, resolve it using dictionary lookup
  const variables = match.variables || {};
  const resolvedVariables = {};

  for (const [varName, varValue] of Object.entries(variables)) {
    const lookup = lookupFn(varValue);

    if (!lookup) {
      // Failed to resolve variable - pattern match fails
      return null;
    }

    resolvedVariables[varName] = lookup.translation;
  }

  // Substitute variables in translation template
  let translation = match.translation;
  for (const [varName, translatedValue] of Object.entries(resolvedVariables)) {
    translation = translation.replace(varName, translatedValue);
  }

  return {
    translation,
    confidence: 0.9 // TODO: Calculate from variable resolution confidence
  };
}

inferVariableType(dictionaryName) {
  const typeMap = {
    'properNouns': 'ProperNoun',
    'persons': 'Person',
    'places': 'Place',
    'characters': 'Character',
    'phrases': 'Phrase',
    'objects': 'Object',
    'times': 'Time',
    'organizations': 'Organization',
    'events': 'Event'
  };
  return typeMap[dictionaryName] || 'Generic';
}

applyPatternMatchToTokens(tokens, match, options) {
  // Apply translation to first token
  tokens[match.startIndex].translated = match.translation;
  tokens[match.startIndex].translationSource = 'wasm_pattern';
  tokens[match.startIndex].patternUsed = match.pattern;
  tokens[match.startIndex].confidence = match.confidence;

  // Mark consumed tokens
  for (let i = match.startIndex + 1; i <= match.endIndex; i++) {
    if (tokens[i]) {
      tokens[i].translated = "";
      tokens[i].translationSource = 'wasm_pattern_consumed';
    }
  }

  // Add to semantic array builder
  const globalTokenIndex = match.startIndex + (options.chunkOffset || 0);
  this.semanticArrayBuilder.addUnit(
    match.originalText,
    match.translation,
    'wasm_patterns',
    globalTokenIndex
  );
}
```

## Implementation Steps

### Step 1: Pattern Configuration System ✅ NEXT
1. Create `PatternConfiguration.js` with pattern definitions
2. Create loader function to read pattern config
3. Define initial pattern set (X的Y, 从X到Y, 对X来说, etc.)

### Step 2: Dictionary Lookup Bridge
1. Extend `WasmTranslationAccelerator.js` with variable lookup functions
2. Create type inference mapping
3. Test dictionary lookups with variable resolution

### Step 3: TranslationEngine Integration
1. Add `initializeWasmPatternManager()` to constructor
2. Implement `applyPatternsWasm()` method
3. Add feature flag to switch between old/new systems
4. Wire up variable resolution

### Step 4: Enable Pattern Composition
1. Load composed patterns into PatternManager
2. Handle composition matches in applyPatternsWasm
3. Test sequence, alternative, nested patterns

### Step 5: Testing
1. Create test cases for common patterns
2. Compare JavaScript vs WASM results
3. Performance benchmarking
4. Edge case testing

### Step 6: Documentation
1. Create PHASE7_COMPLETE.md
2. Update ROADMAP.md
3. Document pattern configuration format
4. Add usage examples

## Success Criteria

- [ ] PatternManager successfully loads from configuration
- [ ] Pattern matching works for "X的Y" → "Y của X"
- [ ] Variable resolution uses dictionary lookups
- [ ] Type constraints work correctly
- [ ] Pattern composition (Sequence) works
- [ ] Performance improves by 50%+
- [ ] All 29 "dead code" warnings disappear
- [ ] Zero regressions in translation accuracy
- [ ] End-to-end test: "张三的手" → "tay của Trương Tam"

## Rollback Plan

If Phase 7 integration causes issues:
1. Set `this.useWasmPatterns = false` to disable WASM patterns
2. Fall back to existing `SemanticPatternProcessor`
3. Investigate issues and fix
4. Re-enable when ready

## Timeline

**Day 1-2:** Steps 1-2 (Pattern config + Dictionary bridge)
**Day 3:** Step 3 (TranslationEngine integration)
**Day 4:** Steps 4-5 (Pattern composition + Testing)
**Day 5:** Step 6 (Documentation)

**Total: 3-5 days**

---

**Created:** December 1, 2025
**Status:** Planning Complete, Ready for Implementation
