# Design: Semantic Type Filter for Structural Patterns

**Date**: 2026-02-28
**Status**: Approved

---

## Problem

The Structural Patterns dictionary filter panel has a "Flags" row (Allow as Variable, Low Priority) and a "Pattern" row (X only, X–Y), but no Semantic Type filter. Common Phrases and Proper Nouns already have a Type filter (PER / PLA / CON / OBJ + No Type). Patterns should match.

---

## Design

**File**: `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx`

### Change

One flag on line ~1915:

```ts
// Before
const showSemanticTypeFilter = isPhrasesDictionary || isProperNounsDictionary;

// After
const showSemanticTypeFilter =
  isPhrasesDictionary || isProperNounsDictionary || isPatternsDictionary;
```

No other changes. The filter application logic (lines 1322–1331) already reads `translation.semanticType` generically. The filter UI block (`{showSemanticTypeFilter && ...}`, lines 2276–2333) renders automatically.

### Behaviour

- Filtering by PER/PLA/CON/OBJ matches patterns whose `semanticType` equals that value — by data constraint, these are always patterns with `allowAsPatternVariable: true` (only those entries ever have `semanticType` set).
- "No Type" matches patterns with no `semanticType` — patterns that can't be variables (`allowAsPatternVariable: false`) and untyped variable-eligible patterns both match. Consistent with how Phrases behaves.
- Multiple type buttons can be active simultaneously (existing Set logic).

---

## Files Touched

| File                                                               | Change                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `src/components/dictionary/EnhancedVirtualizedDictionaryTable.tsx` | Add `isPatternsDictionary` to `showSemanticTypeFilter` condition |

No CSS, no new components, no new state.
