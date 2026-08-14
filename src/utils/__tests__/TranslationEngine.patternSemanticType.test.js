/**
 * Tests that patternSemanticType is stored on leader tokens after pattern match application.
 *
 * WHAT WE TEST:
 * - applyHierarchicalResults() stores result.semanticType on the leader token
 * - Consumed follower tokens do NOT get patternSemanticType
 * - Consumed follower tokens DO get groupLeader (needed by postProcess orphan check)
 * - consumedSource is derived from result.translationSource, not hardcoded
 * - null is stored when semanticType is absent from the result
 *
 * WHY THIS MATTERS (Task 4):
 * Task 5 reads token.patternSemanticType from already-translated tokens when building
 * the variable cache for the next translation chunk. Without this field being set here,
 * Task 5 cannot determine what semantic type a pattern-translated token represents.
 *
 * All tests call the REAL TranslationEngine.prototype.applyHierarchicalResults via a
 * minimal engine stub — no hand-copied reimplementation. See src/utils/CLAUDE.md's
 * "postProcess Orphan Safety Net" and "applyHierarchicalResults Has No Overlap Check"
 * entries for the invariants this method must uphold.
 */

import { describe, test, expect, vi, beforeAll } from 'vitest';

function makeTokens(values) {
  return values.map((value) => ({
    value,
    translated: null,
    translationSource: null,
    patternSemanticType: undefined,
  }));
}

function makeHierarchicalResult({
  startIndex,
  endIndex,
  translation,
  semanticType,
  translationSource,
  type,
} = {}) {
  return {
    startIndex: startIndex ?? 0,
    endIndex: endIndex ?? startIndex ?? 0,
    translation: translation ?? 'test_translation',
    semanticType: semanticType,
    translationSource: translationSource,
    type: type,
  };
}

function makeEngineStub() {
  return {
    semanticArrayBuilder: {
      addUnit: vi.fn(),
    },
    log: vi.fn(),
  };
}

describe('TranslationEngine.applyHierarchicalResults — real method (no WASM)', () => {
  let applyHierarchicalResultsFn;

  beforeAll(async () => {
    // Import without constructing (avoids all WASM/Tauri side effects).
    const mod = await import('../TranslationEngine.js');
    applyHierarchicalResultsFn = mod.TranslationEngine.prototype.applyHierarchicalResults;
  });

  function apply(tokens, results, options = {}) {
    return applyHierarchicalResultsFn.call(makeEngineStub(), tokens, results, options);
  }

  test('stores semanticType on single-token leader', () => {
    const tokens = makeTokens(['在', '天', '空', '中']);
    const results = [
      makeHierarchicalResult({
        startIndex: 0,
        endIndex: 3,
        translation: 'ở trong bầu trời',
        semanticType: 'concept',
      }),
    ];

    apply(tokens, results);

    expect(tokens[0].patternSemanticType).toBe('concept');
  });

  test('stores null when semanticType is absent from result', () => {
    const tokens = makeTokens(['在', '天', '空', '中']);
    const results = [
      makeHierarchicalResult({ startIndex: 0, endIndex: 3, translation: 'ở trong bầu trời' }),
    ];

    apply(tokens, results);

    expect(tokens[0].patternSemanticType).toBeNull();
  });

  test('stores null when semanticType is explicitly null', () => {
    const tokens = makeTokens(['在', '天']);
    const results = [
      makeHierarchicalResult({
        startIndex: 0,
        endIndex: 1,
        translation: 'ở trời',
        semanticType: null,
      }),
    ];

    apply(tokens, results);

    expect(tokens[0].patternSemanticType).toBeNull();
  });

  test('does NOT set patternSemanticType on consumed follower tokens', () => {
    const tokens = makeTokens(['在', '天', '空', '中']);
    const results = [
      makeHierarchicalResult({
        startIndex: 0,
        endIndex: 3,
        translation: 'ở trong bầu trời',
        semanticType: 'structural',
      }),
    ];

    apply(tokens, results);

    // Leader gets it
    expect(tokens[0].patternSemanticType).toBe('structural');
    // Followers must NOT have it (still undefined — the loop only sets translated/translationSource)
    expect(tokens[1].patternSemanticType).toBeUndefined();
    expect(tokens[2].patternSemanticType).toBeUndefined();
    expect(tokens[3].patternSemanticType).toBeUndefined();
  });

  test('stores different semanticTypes for multiple independent results', () => {
    const tokens = makeTokens(['A', 'B', 'C', 'D']);
    const results = [
      makeHierarchicalResult({
        startIndex: 0,
        endIndex: 1,
        translation: 'trans_AB',
        semanticType: 'concept',
      }),
      makeHierarchicalResult({
        startIndex: 2,
        endIndex: 3,
        translation: 'trans_CD',
        semanticType: 'action',
      }),
    ];

    apply(tokens, results);

    expect(tokens[0].patternSemanticType).toBe('concept');
    expect(tokens[2].patternSemanticType).toBe('action');
  });

  test('stores empty string semanticType as-is (not coerced to null)', () => {
    const tokens = makeTokens(['X']);
    const results = [
      makeHierarchicalResult({
        startIndex: 0,
        endIndex: 0,
        translation: 'trans',
        semanticType: '',
      }),
    ];

    apply(tokens, results);

    // empty string is falsy but not null/undefined, ?? null only fires for null/undefined
    expect(tokens[0].patternSemanticType).toBe('');
  });

  test('existing leader token fields are preserved alongside patternSemanticType', () => {
    const tokens = makeTokens(['在', '中']);
    const results = [
      makeHierarchicalResult({
        startIndex: 0,
        endIndex: 1,
        translation: 'ở trong',
        semanticType: 'structural_pattern',
        type: 'composite',
      }),
    ];

    apply(tokens, results);

    expect(tokens[0].translated).toBe('ở trong');
    expect(tokens[0].translationSource).toBe('hierarchical_pattern');
    expect(tokens[0].patternSemanticType).toBe('structural_pattern');
    expect(tokens[0].compositePattern).toBe(true);
  });

  test('sets groupLeader on consumed follower tokens (needed by postProcess orphan check)', () => {
    const tokens = makeTokens(['在', '天', '空', '中']);
    const results = [
      makeHierarchicalResult({
        startIndex: 0,
        endIndex: 3,
        translation: 'ở trong bầu trời',
        semanticType: 'concept',
      }),
    ];

    apply(tokens, results);

    expect(tokens[1].groupLeader).toBe(0);
    expect(tokens[2].groupLeader).toBe(0);
    expect(tokens[3].groupLeader).toBe(0);
  });

  test('derives consumedSource from result.translationSource instead of hardcoding it', () => {
    // WASM path: translationSource absent, falls back to 'hierarchical_pattern'
    const wasmTokens = makeTokens(['在', '天']);
    const wasmResults = [
      makeHierarchicalResult({ startIndex: 0, endIndex: 1, translation: 'ở trong' }),
    ];
    apply(wasmTokens, wasmResults);
    expect(wasmTokens[1].translationSource).toBe('hierarchical_pattern_consumed');

    // JS fallback path: translationSource explicitly 'pattern'
    const jsTokens = makeTokens(['在', '天']);
    const jsResults = [
      makeHierarchicalResult({
        startIndex: 0,
        endIndex: 1,
        translation: 'ở trong',
        translationSource: 'pattern',
      }),
    ];
    apply(jsTokens, jsResults);
    expect(jsTokens[1].translationSource).toBe('pattern_consumed');
  });
});
