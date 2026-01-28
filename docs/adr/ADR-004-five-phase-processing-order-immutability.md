# ADR-004: 5-Phase Processing Order Immutability

**Status**: Accepted (Architectural Constraint)
**Date**: 2026-01-28
**Decision Makers**: Development Team
**Affected Components**: Core translation engine, all processor modules

## Context and Problem Statement

The translation system processes Chinese text through 5 sequential phases: Pattern → Proper Noun → Number → Phrase → Character. Each phase consumes tokens (marks them as translated), and later phases skip consumed tokens.

**Key Question**: Can we reorder these phases to improve performance or accuracy, or is this order immutable?

**Current Order** (`TranslationEngine.js:5580-5733` - `translateSinglePass()`):

1. **Pattern Processing** (Phase 1): Structural patterns with variables (例: "在XY中" → "ở trong X Y")
2. **Proper Noun Processing** (Phase 2): Novel-specific terms from proper noun dictionaries
3. **Number Processing** (Phase 3): Chinese numbers (百分之十五 → 15%, 三千十五 → 3,015)
4. **Phrase Processing** (Phase 4): Common phrases (不知道 → không biết)
5. **Character Processing** (Phase 5): Character dictionary fallback

## Decision Drivers

**Token Consumption Pattern**:

- Each phase marks processed tokens as `{ translated: null, translationSource: "X_consumed" }`
- Later phases skip consumed tokens
- **Order determines priority**: Earlier phases override later phases

**Translation Quality**:

- Proper nouns ("哈利波特" = "Harry Potter") must win over character-by-character ("ha lợi ba đặc")
- Patterns ("在XY中") must win over phrase lookups ("在" = "ở", "中" = "trong")
- Numbers ("三千" = 3,000) must win over phrase lookups ("三" = "ba", "千" = "nghìn")

**Conflict Resolution**:

- Multiple phases may match the same token span
- Phase order is the **primary conflict resolution mechanism**
- Wrong order causes double-processing or incorrect translations

## Alternatives Considered

### Alternative 1: Reorder Phases for Performance

**Proposed Orders**:

**Option A: Numbers First** (fastest phases first)

```
1. Numbers (Phase 3) - WASM-accelerated, 5-10x faster
2. Patterns (Phase 1) - WASM-accelerated, 10-50x faster
3. Proper Nouns (Phase 2) - Trie lookups, O(k)
4. Phrases (Phase 4) - Sequential matching
5. Characters (Phase 5) - Fallback
```

**Option B: Characters Last** (already correct)

```
Current order already handles this correctly
```

**Option C: Proper Nouns First** (highest accuracy first)

```
1. Proper Nouns (Phase 2) - Most specific
2. Patterns (Phase 1) - Next most specific
3. Numbers (Phase 3) - Numeric only
4. Phrases (Phase 4) - Common terms
5. Characters (Phase 5) - Fallback
```

**Why Performance Ordering Fails**:

```
❌ Numbers First breaks pattern matching:

Input: "在三千人中"
Correct: "ở trong 3,000 người" (pattern "在XY中" + number "三千")

Numbers First:
  1. Numbers: "三千" → "3,000" ✅
  2. Patterns: Can't match "在XY中" - "三千" already consumed ❌
  Result: "ở 3,000 người trong" ❌ (wrong word order)

Current Order (Patterns First):
  1. Patterns: "在[三千人]中" → "ở trong [X]" ✅ (reserves structure)
  2. Numbers: "三千" → "3,000" ✅ (fills variable)
  Result: "ở trong 3,000 người" ✅ (correct)
```

**Why Proper Nouns First Also Fails**:

```
❌ Proper Nouns before Patterns breaks structural patterns:

Input: "在哈利波特的世界中"
Correct: "ở trong thế giới của Harry Potter" (pattern preserves structure)

Proper Nouns First:
  1. Proper Nouns: "哈利波特" → "Harry Potter" ✅
  2. Patterns: Can't match "在XY中" - "哈利波特" already consumed ❌
  Result: "ở Harry Potter của thế giới trong" ❌ (wrong word order)

Current Order (Patterns First):
  1. Patterns: "在[哈利波特的世界]中" → "ở trong [X]" ✅
  2. Proper Nouns: "哈利波特" → "Harry Potter" ✅
  3. Phrases: "的" → "của", "世界" → "thế giới" ✅
  Result: "ở trong thế giới của Harry Potter" ✅ (correct Vietnamese word order)
```

**Pros**:

- ✅ Potentially faster (numbers/proper nouns are quick)

**Cons**:

- ❌ **Breaks translation accuracy** (documented examples above)
- ❌ **Loses conflict resolution** (pattern structure lost)
- ❌ **Requires complex backtracking** (undo consumed tokens)

### Alternative 2: Parallel Processing (All Phases Simultaneously)

**Approach**:

- Run all 5 phases in parallel
- Collect all matches
- Resolve conflicts after all phases complete
- Use priority system instead of phase order

**Conflict Resolution**:

```javascript
// All phases run simultaneously
const [patternMatches, nounMatches, numberMatches, phraseMatches, charMatches] = await Promise.all([
  processPatterns(tokens),
  processProperNouns(tokens),
  processNumbers(tokens),
  processPhrases(tokens),
  processCharacters(tokens),
]);

// Resolve conflicts with priority system
const finalMatches = resolveConflicts(allMatches, priorityRules);
```

**Priority Rules Needed**:

```javascript
const priorityRules = {
  patterns: 100, // Highest - structural integrity
  properNouns: 90, // Novel-specific terms
  numbers: 80, // Numeric precision
  phrases: 70, // Common terms
  characters: 60, // Fallback
};
```

**Why Parallel Processing Fails**:

**Problem 1: Context Loss**

```
❌ Patterns need to know what numbers/nouns will fill variables

Pattern: "在XY中" → "ở trong X Y"
Variable X: Could be number, noun, or phrase
Variable Y: Could be any noun

Sequential processing:
  1. Pattern matches "在XY中", reserves structure
  2. Later phases fill variables with correct translations
  3. Pattern processor knows structure is preserved ✅

Parallel processing:
  1. Pattern doesn't know if X will be a number or noun
  2. Can't determine optimal variable boundaries
  3. Conflict resolution too late to fix structure ❌
```

**Problem 2: O(n²) Conflict Resolution**

```
Sequential: Each phase processes only unconsumed tokens - O(n)
Parallel: Must check all matches against all others - O(n²)

For 2000-char text:
  Sequential: ~2000 token checks per phase = 10,000 total
  Parallel: ~2000² = 4,000,000 conflict checks
```

**Problem 3: Timing Complexity**

```
Sequential: Phases coordinate via shared token state (synchronous)
Parallel: Phases must coordinate via conflict resolution (complex)

// Parallel requires global conflict state
class ConflictResolver {
  resolveConflicts(matches) {
    // Must handle:
    // - Overlapping matches
    // - Nested matches (patterns containing patterns)
    // - Variable boundaries
    // - Priority ties
    // - Order-dependent grammar rules
  }
}
```

**Pros**:

- ✅ Potentially faster (parallel execution)
- ✅ Flexible priority system

**Cons**:

- ❌ **O(n²) conflict resolution** vs O(n) sequential
- ❌ **Context loss**: Patterns can't see filled variables
- ❌ **Complex state management**: Requires global coordination
- ❌ **Grammar violations**: Word order rules need sequential processing
- ❌ **Attempted and failed**: See `docs/archive/refactoring-2026/`

### Alternative 3: Keep Current Sequential Order (Patterns First) ✅ SELECTED

**Approach**:

- Maintain current phase order: Pattern → Proper Noun → Number → Phrase → Character
- Each phase consumes tokens synchronously
- Later phases skip consumed tokens
- Simple, proven conflict resolution

**Why This Order Is Optimal**:

**1. Patterns First (Structural Integrity)**

```
✅ Patterns establish Vietnamese grammar structure
✅ Variables filled by later phases
✅ Word order correct by construction

Example: "在XY中" → "ở trong X Y"
  - Vietnamese requires "ở trong [X Y]" (preposition + content)
  - Chinese has "在 [X Y] 中" (preposition...content...postposition)
  - Pattern handles reordering, variables fill content
```

**2. Proper Nouns Second (Specificity)**

```
✅ Novel-specific terms override common phrases
✅ Proper nouns known to be correct in this context
✅ Must happen before phrase matching

Example: "波特" in "Harry Potter"
  - Proper noun: "Harry Potter" ✅
  - Phrase: "波" = "wave", "特" = "special" ❌
  - Proper noun wins because it's second (before phrases)
```

**3. Numbers Third (Numeric Precision)**

```
✅ Chinese numbers must convert atomically
✅ "三千" = 3,000, not "三" (3) + "千" (1000)
✅ Must happen before phrase matching

Example: "三千人"
  - Number: "三千" → "3,000" ✅
  - Phrase: "三" → "ba", "千" → "nghìn" ❌
  - Number wins because it's third (before phrases)
```

**4. Phrases Fourth (Common Terms)**

```
✅ Common phrases override character-by-character
✅ Idiomatic expressions preserved
✅ Must happen before character fallback

Example: "不知道"
  - Phrase: "không biết" (don't know) ✅
  - Characters: "không" + "tri" + "đạo" ❌
  - Phrase wins because it's fourth (before characters)
```

**5. Characters Last (Fallback)**

```
✅ Only processes remaining unconsumed tokens
✅ Guaranteed to have a translation (always fallback)
✅ Cannot break earlier phases (runs last)

Example: Uncommon character "囧"
  - Earlier phases: No match
  - Character: "jiǒng" ✅ (fallback ensures translation)
```

**Pros**:

- ✅ **Proven Correct**: 1000-7500 tokens/sec, high accuracy
- ✅ **Simple Conflict Resolution**: Phase order determines priority
- ✅ **O(n) Complexity**: Each phase processes only unconsumed tokens
- ✅ **Synchronous Coordination**: Shared token state, no race conditions
- ✅ **Grammar Correctness**: Vietnamese word order by construction

**Cons**:

- ❌ Cannot reorder for performance (order is architectural)
- ❌ Adding new phase requires careful placement
- ❌ Phase extraction impossible (breaks coordination)

## Decision

**Accept Alternative 3: Current Sequential Order is Immutable**

The phase order **Pattern → Proper Noun → Number → Phrase → Character** is an **architectural constraint** that cannot be changed for the following reasons:

1. **Translation Accuracy**: Wrong order produces incorrect translations (documented examples)
2. **Structural Integrity**: Patterns must establish grammar before content fills variables
3. **Conflict Resolution**: Phase order is the primary conflict resolution mechanism
4. **Performance**: Sequential O(n) faster than parallel O(n²) conflict resolution
5. **Proven Design**: Current order produces high-quality translations in production

**This decision is IMMUTABLE** - changing phase order will break translation correctness.

## Consequences

### Positive

- ✅ **High Translation Quality**: Pattern structure + proper nouns + phrases = natural Vietnamese
- ✅ **Simple Conflict Resolution**: Phase order determines priority (no complex rules)
- ✅ **O(n) Performance**: Each phase processes only unconsumed tokens
- ✅ **Synchronous Coordination**: Shared token state prevents race conditions
- ✅ **Architectural Clarity**: Immutability prevents incorrect changes

### Negative

- ❌ **Cannot Optimize Order**: Performance improvements must work within order constraint
- ❌ **New Phase Placement**: Must carefully consider position (affects all later phases)
- ❌ **Extraction Impossible**: Cannot split phases into separate modules (breaks coordination)

### Neutral

- 🔄 **Within-Phase Optimization**: Can optimize each phase independently (WASM, caching)
- 🔄 **Priority Refinement**: Can adjust priorities within phases (not between phases)

## Architectural Implications

**What This Means for Development**:

1. **Cannot Extract Phases** (see ADR-003):

```javascript
// ❌ WRONG: Extracting phases breaks coordination
class PatternPhase {
  process(tokens) { ... }
}
class ProperNounPhase {
  process(tokens) { ... }
}

// ✅ CORRECT: Phases must coordinate via shared token state
class TranslationEngine {
  translateSinglePass(tokens) {
    // All phases in one method, shared token array
    this.processPatterns(tokens);      // Phase 1
    this.processProperNouns(tokens);   // Phase 2
    this.processNumbers(tokens);       // Phase 3
    this.processPhrases(tokens);       // Phase 4
    this.processCharacters(tokens);    // Phase 5
  }
}
```

2. **Cannot Reorder for Performance**:

```javascript
// ❌ WRONG: Optimizing by running fast phases first
async translateSinglePass(tokens) {
  await this.processNumbers(tokens);     // Fast, but wrong order
  await this.processPatterns(tokens);    // Breaks pattern variables
}

// ✅ CORRECT: Optimize within phases, not order
async translateSinglePass(tokens) {
  await this.processPatterns(tokens);    // Use WASM optimization
  await this.processProperNouns(tokens); // Use trie optimization
  await this.processNumbers(tokens);     // Use WASM optimization
  // Order preserved, performance improved
}
```

3. **Adding New Phases**:

```javascript
// Careful consideration needed:
// - Before patterns? Breaks structural integrity
// - After patterns, before nouns? May interfere with proper noun matching
// - After nouns, before numbers? May interfere with number detection
// - After numbers, before phrases? Likely safe position
// - After phrases, before characters? Also likely safe
// - After characters? Cannot work (characters are fallback)

// Example: Adding "Dates" phase
async translateSinglePass(tokens) {
  await this.processPatterns(tokens);    // Phase 1: Structure
  await this.processProperNouns(tokens); // Phase 2: Specificity
  await this.processNumbers(tokens);     // Phase 3: Numeric
  await this.processDates(tokens);       // ✅ NEW: After numbers (uses numbers)
  await this.processPhrases(tokens);     // Phase 4: Common terms
  await this.processCharacters(tokens);  // Phase 5: Fallback
}
```

## Monitoring and Review

**Validation**:

- Phase integration tests: `PhaseIntegration.test.js` (16 tests)
- Token consumption tests: Verify consumed tokens skipped
- Priority tests: Verify earlier phases override later phases

**Review Triggers**:

- New translation errors from phase conflicts
- Performance issues requiring optimization
- New phase addition required

**Never Change**:

- Phase execution order (architectural constraint)
- Token consumption pattern (foundation of conflict resolution)
- Synchronous coordination (prevents race conditions)

## References

- Implementation: `TranslationEngine.js:5580-5733` (`translateSinglePass()`)
- Documentation: CLAUDE.md "5-Phase Translation Pipeline (IMMUTABLE)" section
- Tests: `PhaseIntegration.test.js` (16 tests validate order)
- Failed Attempts: `docs/archive/refactoring-2026/` (phase extraction attempts)
- Token Consumption: `TokenHelpers.js` (getSemanticTokens, token state management)

## Related ADRs

- ADR-002: Dual-Path Clickable Highlighting (position mapping depends on phase order)
- ADR-003: TypeScript Hybrid (explains why phases cannot be extracted)
- Future: New Phase Addition (guide for adding 6th phase)
