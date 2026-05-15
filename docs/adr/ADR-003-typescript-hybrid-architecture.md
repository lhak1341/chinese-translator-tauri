# ADR-003: TypeScript Hybrid Architecture

**Status**: Accepted
**Date**: 2026-01-28
**Decision Makers**: Development Team
**Affected Components**: Core engine, utilities, UI components

## Context and Problem Statement

The codebase is written in a mix of JavaScript and TypeScript. We need to decide: Should we fully migrate to TypeScript, keep everything in JavaScript, or maintain a hybrid approach?

**Current State**:

- **TypeScript**: 15 core utilities, 19 `.d.ts` type definition files (11,000+ lines)
- **JavaScript**: Core engine (`TranslationEngine.js` 7,507 lines), UI coordination (`Translator.jsx` 2,352 lines), processors
- **Type Coverage**: WASM boundaries, API contracts, utilities
- **Engine location**: `src/utils/TranslationEngine.js`

**Key Question**: What should our TypeScript migration strategy be?

## Decision Drivers

**Type Safety Benefits**:

- Catch type errors at compile time (especially WASM boundaries)
- Better IDE autocompletion and refactoring support
- Self-documenting code through type annotations
- Prevents runtime "undefined" bugs (e.g., WASM undefined → null conversions)

**Core Engine Complexity**:

- Requires tight coupling for 5-phase token coordination
- Performance-critical code needs timing guarantees
- State management across phases must be synchronous
- Previous extraction attempts failed (see `docs/archive/refactoring-2026/`)

**Migration Cost**:

- Full migration: 4-6 weeks (HIGH RISK)
- Utility migration: Proven successful (15 files, ~680 lines)
- Core engine migration: Failed in previous attempts

## Alternatives Considered

### Alternative 1: Full TypeScript Migration

**Approach**:

- Migrate all `.js` files to `.ts`
- Add strict type checking for entire codebase
- Enforce TypeScript in ESLint rules

**Migration Steps**:

1. TranslationEngine.js → TranslationEngine.ts (7,507 lines)
2. Translator.jsx → Translator.tsx (2,352 lines)
3. All processors and helpers
4. Enable `strict: true` in `tsconfig.json`

**Pros**:

- ✅ Complete type safety across codebase
- ✅ Single language (no JS/TS context switching)
- ✅ Better refactoring safety

**Cons**:

- ❌ **HIGH RISK**: Breaking timing-sensitive core engine
- ❌ **4-6 weeks effort** for core migration
- ❌ **Historical Evidence**: Previous attempts failed (see archive)
- ❌ TypeScript strict mode breaks intentional coupling patterns
- ❌ Performance overhead for type checking in hot paths

**Why Core Engine Migration Fails**:

```typescript
// TypeScript strict mode makes shared-mutable-state coordination hard to express
class TranslationEngine {
  // ❌ TypeScript's type system pushes toward immutable data flow
  // ❌ "Mutate array in-place AND read from this.*" fights every type annotation
  // ❌ Strict null checks + readonly conventions make phase handoff unergonomic

  translateSinglePass(tokens: Token[]): TranslatedTokens {
    // Phase 1: Patterns
    this.processPatterns(tokens); // Mutates tokens[] in-place — not a copy issue,
    // but typing this correctly requires fighting TS

    // Phase 2: Proper Nouns
    this.processProperNouns(tokens); // Reads tokens mutated by Phase 1 —
    // TS can't express "same array, different state"

    // WHY IT BREAKS: not runtime behavior (TS is compile-time only), but the
    // type annotations needed to satisfy strict mode require restructuring
    // the engine in ways that break phase coordination
  }
}
```

### Alternative 2: Keep Everything JavaScript

**Approach**:

- Remove TypeScript entirely
- Use JSDoc for type hints
- Rely on runtime validation

**Pros**:

- ✅ No type checking overhead
- ✅ Maximum flexibility for core engine
- ✅ Simpler build process

**Cons**:

- ❌ Lose WASM boundary type safety (critical)
- ❌ Runtime "undefined" bugs (already experienced)
- ❌ Poor IDE support
- ❌ No compile-time error catching

**Why This is Insufficient**:

- WASM boundary errors are **silent and destructive** (undefined → "undefined" text)
- Type validation at boundaries prevented multiple production bugs
- Test coverage (1,198 JS/TS tests + 155 Rust tests) helps but doesn't catch all edge cases

### Alternative 3: Strategic Hybrid (TypeScript for Boundaries, JavaScript for Core) ✅ SELECTED

**Approach**:

- **TypeScript**: Utilities, type definitions, WASM boundaries, API contracts
- **JavaScript**: Core engine, UI coordination, processors requiring tight coupling
- **Boundaries**: Strict type validation where JS and TS meet

**What Gets Migrated to TypeScript**:

```
✅ Pure utilities (zero `this.*` references)
✅ Type definitions (.d.ts files)
✅ WASM boundary validation (WasmTypes.ts)
✅ API contract enforcement
✅ Error handling patterns
✅ UI components (React)
```

**What Stays JavaScript**:

```
❌ TranslationEngine.js (intentional coupling)
❌ Translator.jsx (cross-mode state timing)
❌ SemanticPatternProcessor.js (performance-critical)
❌ Core processors requiring tight coupling
```

**Boundary Enforcement**:

```typescript
// WASM Boundaries: Strict TypeScript validation
export function validateWasmToken(token: unknown): WasmToken {
  if (token.translated === undefined) {
    // Convert undefined → null (prevents "undefined" in text)
    return { ...token, translated: null };
  }
  return token as WasmToken;
}

// JavaScript Core Engine: Calls validation at boundaries
const processedTokens = await processNumbersWasm(tokens);
const validatedTokens = copyWasmTokens(tokens, processedTokens); // TS validation
```

**Pros**:

- ✅ **Type Safety Where It Matters**: WASM boundaries, API contracts
- ✅ **Flexibility Where Needed**: Core engine coupling preserved
- ✅ **Proven Pattern**: 15 utilities successfully migrated
- ✅ **Low Risk**: Core engine remains JavaScript (stable)
- ✅ **Best of Both Worlds**: Safety + Performance

**Cons**:

- ❌ Context switching between JS and TS
- ❌ Import complexity (`.js` extensions in TS imports)
- ❌ Partial type coverage (core engine untyped)
- ❌ Two languages to maintain

## Decision

**Accept Alternative 3: Strategic Hybrid Architecture**

We adopt a hybrid TypeScript/JavaScript approach for the following reasons:

1. **Historical Evidence**: Core engine migration attempts have consistently failed
2. **Risk Mitigation**: TypeScript at boundaries catches critical bugs without breaking core
3. **Proven Success**: 15 utilities + 19 type definitions migrated successfully
4. **Performance**: JavaScript core engine maintains timing guarantees

**Migration Guidelines** (CLAUDE.md - "TypeScript Migration Strategy"):

**Can Be Migrated**:

- ✅ Zero `this.*` references
- ✅ Takes all data as parameters
- ✅ Returns transformed data
- ✅ No side effects
- ✅ No instance method calls

**Cannot Be Migrated**:

- ❌ Reads from `this.*` properties
- ❌ Calls `this.*` methods
- ❌ Aggregates instance state
- ❌ Has side effects
- ❌ Requires tight coupling for timing

**Example Success** (extractable utility):

```typescript
// ByteFormatter.ts (180 lines) - Pure utility
export function formatBytes(bytes: number, decimals: number = 2): string {
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}
```

**Example Failure** (coupled accessor):

```javascript
// TranslationEngine.js - Cannot extract
getEngineStats() {
  return {
    stats: this.stats,  // ❌ Instance property
    dictionary: this.dictionaryManager.getGlobalStats() // ❌ Instance method
  };
}
```

## Consequences

### Positive

- ✅ **Type Safety at Boundaries**: WASM, API contracts validated (prevented "undefined" bugs)
- ✅ **Core Engine Stability**: JavaScript flexibility preserved
- ✅ **Proven Pattern**: 15 successful migrations show it works
- ✅ **Low Risk**: No breaking changes to core engine
- ✅ **Test Coverage**: 57 tests validate WASM boundaries

### Negative

- ❌ **Context Switching**: Developers work in both JS and TS
- ❌ **Import Complexity**: `.js` extensions required in TS imports
- ❌ **Partial Coverage**: Core engine untyped
- ❌ **Two Build Paths**: tsc for TS, babel for JS

### Neutral

- 🔄 **Incremental Migration**: More utilities can move to TS over time
- 🔄 **Boundary Expansion**: Type definitions can grow without migrating core
- 🔄 **Future Evolution**: If core engine splits naturally, can migrate pieces

## Type Safety Without Full Migration

**How We Achieve Type Safety**:

1. **Type Definitions** (19 `.d.ts` files, 11,000+ lines):

```typescript
// SemanticTypes.d.ts - Documents JavaScript contracts
export interface SemanticToken {
  value: string;
  translated: string | null; // null = consumed, string = translated
  translationSource?: string;
}
```

2. **WASM Boundary Validation** (`WasmTypes.ts`):

```typescript
export function validateWasmToken(token: unknown): WasmToken {
  // Runtime validation at boundary
  // Prevents WASM undefined → JS "undefined" text
}
```

3. **API Contract Tests** (`DictionaryManager.apiContract.test.js`):

```javascript
test('translate() must stay synchronous', () => {
  const result = dictionaryManager.translate(text);
  expect(result).not.toBeInstanceOf(Promise); // Prevents async breaking
});
```

4. **ESLint + TypeScript Checking**:

```javascript
// package.json
"type-check": "tsc --noEmit"  // Checks .ts files + .d.ts contracts
```

## Monitoring and Review

**Success Metrics**:

- Type checking passes: `npm run type-check` (0 errors expected)
- WASM boundary bugs: 0 "undefined" in production since validation added
- Migration count: 15 utilities successfully migrated
- Test coverage: 57 tests validate type boundaries

**Review Triggers**:

- Core engine naturally splits (extract pieces to TS)
- WASM boundary bugs increase (strengthen validation)
- New utilities added (migrate if extractable)

**Never Migrate**:

- `TranslationEngine.js` - 5-phase coordination requires coupling
- `Translator.jsx` - Cross-mode state timing requires flexibility
- Performance-critical hot paths - JavaScript faster for mutation-heavy code

## References

- Migrated Utilities: `ByteFormatter.ts`, `ValidationHelpers.ts`, `WasmTypes.ts`, etc. (15 files)
- Type Definitions: `src/types/*.d.ts` (19 files, 11,000+ lines)
- Core Engine: `src/utils/TranslationEngine.js` (intentionally JS)
- Migration Guide: CLAUDE.md "TypeScript Migration Strategy" section
- Failed Attempts: `docs/archive/refactoring-2026/EXTRACTION_ANALYSIS.md`
- Test Coverage: `WasmTypes.test.ts`, `WasmBoundaryEdgeCases.test.js`

## Related ADRs

- ADR-001: WASM Batch Loading (TypeScript helps validate boundaries)
- ADR-004: 5-Phase Processing (why core engine cannot be TypeScript)
- Future: Performance Optimization (may require JavaScript hot paths)
