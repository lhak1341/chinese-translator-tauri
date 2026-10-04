# ADR-002: Dual-Path Clickable Highlighting Architecture

**Status**: Accepted
**Date**: 2026-01-28
**Decision Makers**: Development Team
**Affected Components**: Clickable highlighting system, segment computation

## Context and Problem Statement

The translation app provides bidirectional clickable highlighting - users can click translated text to see corresponding original text and vice versa. We have **two completely separate implementations** for different translation modes:

1. **Character-only mode** (Bottom-left panel): `ClickableTranslationSemantic.tsx` + `SegmentPrecomputer.ts`
2. **Full Translation mode** (Right panel): `ClickableTranslationOptimized.tsx` + `TranslationEngine.js:5184-5350`

**Problem**: Should we consolidate these paths into a unified implementation, or accept the duplication?

## Decision Drivers

**Code Duplication**: High

- Two separate segment computation algorithms
- Bug fixes must be applied to both paths
- Different data sources: On-demand (`SegmentPrecomputer`) vs Prebuilt (`TranslationEngine`)

**Historical Context**: Consolidation Attempts Failed

- Previous attempts to unify paths **broke 63% of highlighting coverage**
- Position mapping failures caused clickable segments to misalign
- Substring collisions (e.g., "mà" matching inside "màu trắng") occurred more frequently

**System Complexity**:

- Character-only: On-demand computation from semantic arrays
- Full Translation: Prebuilt segments during translation
- Different requirements: Character mode needs granular units, Full mode needs smart spacing

## Alternatives Considered

### Alternative 1: Consolidate Into Unified Highlighting System

**Approach**:

- Extract common segment matching logic
- Create single `UnifiedSegmentComputer` class
- Both modes call unified API with mode-specific parameters

**Attempted Implementation** (see `docs/archive/refactoring-2026/`):

```javascript
// Unified approach tried:
const segments = UnifiedSegmentComputer.compute(semanticArray, text, {
  mode: 'character-only' | 'full-translation',
  usePrebuiltSegments: boolean,
});
```

**Why It Failed**:

1. **Position Precision**: Prebuilt segments (Full Translation) use exact text positions from translation assembly. On-demand computation (Character-only) must search text, leading to 63% mismatch rate.

2. **Substring Collisions**: Unified matcher encountered collisions more frequently:
   - Example: "mà" (2 chars) matched inside "màu trắng" (9 chars)
   - Fix required length-first sorting, but broke character-only mode

3. **Performance**: On-demand computation too slow for Full Translation (2000+ segments)
   - Full Translation prebuilds during translation (amortized O(1) lookup)
   - Character-only computes on-demand (acceptable for smaller arrays)

4. **Timing Complexity**: Different data availability:
   - Full Translation: Segments available after translation completes
   - Character-only: Must compute from semantic array before rendering

**Pros**:

- ✅ Single implementation (easier to maintain)
- ✅ Bug fixes apply to both modes automatically
- ✅ Less code duplication (~300 lines saved)

**Cons**:

- ❌ **63% highlighting coverage loss** (actual measured impact)
- ❌ Position mapping failures (substring collisions)
- ❌ Performance degradation for Full Translation
- ❌ Increased complexity to handle both modes

### Alternative 2: Keep Separate Paths (Current Implementation) ✅ SELECTED

**Approach**:

- Maintain two independent implementations
- Document which path handles which mode
- Apply bug fixes to both paths when needed

**Implementation Details**:

**Path 1 - Character-only mode**:

```javascript
// Component: ClickableTranslationSemantic.tsx  (src/components/char-only/)
// Computation: src/utils/highlighting/SegmentPrecomputer.ts:precomputeSegments()
// Direction: 'character-only-to-original'
// Data: Computes on-demand from semantic arrays
```

**Update (2026-07-28):** Path 1's computation chain gained a layer since this ADR was written — `src/utils/highlighting/PositionMetadataSegmenter.ts` was added, consumed by `useCharacterOnlySegments.ts` (the hook `ClickableTranslationSemantic.tsx` actually calls), which in turn uses `SegmentPrecomputer.ts`'s named exports. The two-path _separation_ this ADR decided still holds exactly as written; only Path 1's internal architecture deepened beyond what's described here.

**Path 2 - Full Translation mode**:

```javascript
// Component: ClickableTranslationOptimized.tsx  (src/components/full-translation/)
// Computation: src/utils/TranslationEngine.js — translateWithProgressiveBatches (~5703)
// Direction: 'translation-to-original'
// Data: Prebuilt segments during translation
```

**Debugging Pattern** (documented in CLAUDE.md:256-322):

1. Identify which mode has the bug (character-only vs full translation)
2. Debug the corresponding path (SegmentPrecomputer vs TranslationEngine)
3. Verify fix doesn't affect the other path

**Pros**:

- ✅ **100% highlighting coverage** (proven in production)
- ✅ Optimal performance for each mode
- ✅ Clear separation of concerns
- ✅ Independent evolution (can optimize without breaking other mode)

**Cons**:

- ❌ Code duplication (~200 lines duplicated logic)
- ❌ Bug fixes must be applied twice
- ❌ Higher cognitive load (developers must understand both paths)
- ❌ Risk of implementation drift

### Alternative 3: Partial Consolidation (Helper Functions)

**Approach**:

- Keep separate top-level implementations
- Extract shared helpers (e.g., `findLongestMatch`, `resolveCollisions`)
- Reduce duplication without full unification

**Example**:

```javascript
// Shared utilities
export function findLongestMatch(candidates, text, position) { ... }
export function resolveSubstringCollisions(matches) { ... }

// Character-only uses helpers
const match = findLongestMatch(semanticArray, text, currentPos);

// Full Translation uses helpers
const segment = findLongestMatch(prebuiltSegments, text, position);
```

**Pros**:

- ✅ Reduced duplication (share ~100 lines)
- ✅ Bug fixes in helpers apply to both
- ✅ Lower risk than full consolidation

**Cons**:

- ❌ Helpers still need mode-specific parameters
- ❌ Complexity of shared vs mode-specific logic
- ❌ Previous helper extraction attempts also failed (position precision issues)

## Decision

**Accept Alternative 2: Keep Separate Paths**

We maintain two independent implementations for the following reasons:

1. **Proven Reliability**: 100% highlighting coverage vs 63% with consolidated approach
2. **Performance**: Prebuilt segments (Full) vs on-demand computation (Character-only) each optimal for their use case
3. **Failure Evidence**: Multiple consolidation attempts documented in `docs/archive/refactoring-2026/`
4. **Acceptable Tradeoff**: ~200 lines duplication is manageable with clear documentation

**Implementation Guidelines** (CLAUDE.md:256-322):

- Document which component handles which mode
- Add diagnostic logging at segment creation points
- Test both paths independently when making changes
- Keep "Dual-Path Architecture" section in CLAUDE.md updated

## Consequences

### Positive

- ✅ **100% Highlighting Coverage**: Both modes work reliably
- ✅ **Performance**: Each path optimized for its use case
- ✅ **Low Risk**: Changes to one path don't break the other
- ✅ **Clear Documentation**: CLAUDE.md explains debugging process

### Negative

- ❌ **Code Duplication**: ~200 lines of similar logic
- ❌ **Maintenance Burden**: Bug fixes need to be applied twice
- ❌ **Cognitive Load**: Developers must understand both paths
- ❌ **Example**: "màu" split bug (Jan 2025) required fixes in both paths

### Neutral

- 🔄 **Future Consolidation**: Can revisit if position mapping improves
- 🔄 **Extraction Opportunity**: Pure helper functions still possible (e.g., NFC normalization)

## Maintenance Patterns

**Bug Fix Pattern** (Lessons from "màu" bug, Jan 2025):

1. **Identify Path**: Check which mode has the bug
   - Character-only → Debug `SegmentPrecomputer.ts`
   - Full Translation → Debug `TranslationEngine.js:5184-5350`

2. **Add Diagnostics**: Log at segment creation, not matching

   ```javascript
   // Full Translation bugs
   logger.warn('Creating segment:', { translated, position, extractedText });

   // Character-only bugs
   logger.warn('Matching unit:', { unit, position, endPosition });
   ```

3. **Verify Fix**: Test both paths even if bug only in one
   - Changes to shared data structures affect both
   - Position mapping precision affects both

4. **Update Tests**: Add regression test for specific bug
   - `TranslationSourcePriority.contract.test.ts` for translation-side issues
   - `SegmentPrecomputer.test.js` for character-only issues

**Common Pitfalls** (documented from real bugs):

- ❌ Assuming `SegmentPrecomputer` is used for all modes (only character-only)
- ❌ Adding diagnostics to wrong component
- ❌ Not verifying which component renders which panel
- ✅ Check `TranslatorDisplayPanels.tsx` first to confirm code path

## Monitoring and Review

**Review Triggers**:

- New highlighting bugs requiring fixes in both paths (indicates consolidation may be worth it)
- Implementation drift detected (one path has feature the other doesn't)
- Performance issues in either path
- Consolidation approach discovered that maintains 100% coverage

**Metrics to Track**:

- Highlighting coverage % (currently 100% for both modes)
- Bug fix effort (track time spent maintaining both paths)
- Code duplication size (currently ~200 lines)

**Revisit Conditions**:

- Consolidation approach found that maintains 100% coverage
- Performance issues in character-only mode (prebuilt segments might help)
- Major refactoring opportunity (e.g., WebWorker-based segment computation)

## References

- Code (Path 1): `ClickableTranslationSemantic.tsx`, `SegmentPrecomputer.ts`
- Code (Path 2): `ClickableTranslationOptimized.tsx`, `TranslationEngine.js:5184-5350`
- Documentation: CLAUDE.md lines 256-322 ("Dual-Path Architecture")
- Failed Consolidation: `docs/archive/refactoring-2026/` (63% coverage loss)
- Real Bug Example: "màu" split bug (Jan 2025) - fixed by sorting by length

## Related ADRs

- ADR-004: 5-Phase Processing Order (affects semantic array structure)
- Future: Position Mapping Precision Improvements (may enable consolidation)
