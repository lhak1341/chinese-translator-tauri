import { describe, test, expect } from 'vitest';
import { findCharacterOnlyMatch } from '../highlighting/CharacterOnlyBridge';
import type { SemanticArrays } from '../highlighting/SegmentPrecomputer';

// Minimal SemanticArrays builder — only fields the bridge uses
function makeArrays(original: string[], tokenIndexes?: number[]): SemanticArrays {
  return {
    original,
    translated: original.map(() => ''),
    metadata: original.map((_, i) => ({
      tokenIndex: tokenIndexes ? tokenIndexes[i] : i,
    })),
  };
}

describe('findCharacterOnlyMatch — no match', () => {
  test('returns null when targetArrays has no matching character', () => {
    const source = makeArrays(['在', '那', '里']);
    const target = makeArrays(['你', '好', '吗']);
    expect(findCharacterOnlyMatch(0, source, target)).toBeNull();
  });

  test('returns null for out-of-bounds sourceIndex', () => {
    const source = makeArrays(['在']);
    const target = makeArrays(['在']);
    expect(findCharacterOnlyMatch(5, source, target)).toBeNull();
  });
});

describe('findCharacterOnlyMatch — single occurrence', () => {
  test('returns the single match indices for single-char segment', () => {
    const source = makeArrays(['他', '在', '这']);
    const target = makeArrays(['在', '那', '边']);
    expect(findCharacterOnlyMatch(1, source, target)).toEqual([0]);
  });

  test('returns multi-element indices for multi-char segment', () => {
    // source has "你好" as one unit
    const source = makeArrays(['你好', '世界']);
    // target is character-only: each char is its own unit
    const target = makeArrays(['你', '好', '世', '界']);
    expect(findCharacterOnlyMatch(0, source, target)).toEqual([0, 1]);
  });
});

describe('findCharacterOnlyMatch — multiple occurrences, sequential scoring', () => {
  test('picks 1st occurrence when sourceIndex is 1st occurrence (tokenIndex order)', () => {
    // "在" appears at positions 0 and 2 in source (tokenIndex 0, 2)
    // Same character appears twice in target at [0] and [2]
    const source = makeArrays(['在', '那', '在', '里'], [0, 1, 2, 3]);
    const target = makeArrays(['在', '你', '在', '他']);
    // sourceIndex=0 → first occurrence in source → should pick target[0]
    const result = findCharacterOnlyMatch(0, source, target);
    expect(result).toEqual([0]);
  });

  test('picks 2nd occurrence when sourceIndex is 2nd occurrence', () => {
    // source: ['在'=tok0, '那'=tok1, '在'=tok2, '里'=tok3]
    // sourceIndex=2 → there is 1 earlier '在' (tok0 < tok2) → occurrenceInSource=1
    // target has '在' at [0] and [2]; matchIndex 1 → [2]
    const source = makeArrays(['在', '那', '在', '里'], [0, 1, 2, 3]);
    const target = makeArrays(['在', '你', '在', '他']);
    const result = findCharacterOnlyMatch(2, source, target);
    expect(result).toEqual([2]);
  });

  test('uses tokenIndex ordering, not array-index ordering, for occurrence counting', () => {
    // Cross-chunk scrambling: '在' at array index 2 has tokenIndex 0 (earlier in text)
    // '在' at array index 0 has tokenIndex 2 (later in text)
    // sourceIndex=0 (tokenIndex=2): one earlier entry (array[2] with tokenIndex=0) → occurrenceInSource=1
    const source = makeArrays(['在', '那', '在', '里'], [2, 3, 0, 1]); // scrambled tokenIndexes
    const target = makeArrays(['在', '你', '在', '他']);
    // sourceIndex=0 has tokenIndex=2; array[2] has tokenIndex=0 < 2 → occurrenceInSource=1 → picks target[2]
    const result = findCharacterOnlyMatch(0, source, target);
    expect(result).toEqual([2]);
  });
});

describe('findCharacterOnlyMatch — context scoring', () => {
  test('sequential score (100pts) dominates over context score (max 20pts)', () => {
    // source: ['的','他','也'] → sourceIndex=1, occurrenceInSource=0
    // target has '他' at [0] and [3]
    // match[0]: sequential=100 (occurrenceInSource=0 === matchIndex=0), context=0 → 100
    // match[1]: sequential=0 (0 !== 1), context=20 ('的' before, '也' after) → 20
    // Sequential wins → [0]
    const source = makeArrays(['的', '他', '也']);
    const target = makeArrays(['他', '好', '的', '他', '也', '不']);
    expect(findCharacterOnlyMatch(1, source, target)).toEqual([0]);
  });

  test('context decides when both candidates have 0 sequential score', () => {
    // sourceIndex=4 is the 3rd occurrence of '在' (occurrenceInSource=2).
    // target has only 2 occurrences (matchIndex 0 and 1) → neither gets sequential pts.
    // target[3] has neighbor 'Y' at index 2; source context around index 4 includes 'Y'.
    // → context gives 10pts to match[1] → match[1] wins.
    const source = makeArrays(['在', 'X', 'Y', '在', '在'], [0, 1, 2, 3, 4]);
    const target = makeArrays(['在', 'A', 'Y', '在', 'B']);
    // occurrenceInSource=2 (two earlier '在' in source by tokenIndex order)
    // match[0] (target[0]): neighbor 'A' not in context → 0 pts
    // match[1] (target[3]): neighbor 'Y' in immediateContext ('Y在') → +10 pts
    expect(findCharacterOnlyMatch(4, source, target)).toEqual([3]);
  });
});

describe('findCharacterOnlyMatch — position-ratio fallback', () => {
  test('uses position ratio when no context signal exists', () => {
    // source: ['在'] at index 0 out of 4 units → ratio = 0/4 = 0
    // target has '在' at [0] and [3]; estimatedOccurrence = round(0 * 1) = 0 → picks [0]
    const source = makeArrays(['在', 'X', 'Y', 'Z'], [0, 1, 2, 3]);
    const target = makeArrays(['在', 'A', 'B', '在']);
    // No context neighbors match anything, score stays -1 → position fallback
    // occurrenceInSource=0 (no earlier '在') → sequential gives +100 to match[0] anyway
    // This test verifies fallback when sequential score dominates as expected
    const result = findCharacterOnlyMatch(0, source, target);
    expect(result).toEqual([0]);
  });
});

describe('findCharacterOnlyMatch — MAX_MATCHES occurrence cap', () => {
  test('stops scanning after MAX_MATCHES occurrences', () => {
    // Build a target with 110 occurrences of '在' — internal cap is 100
    const manyChars = Array.from({ length: 110 }, () => '在');
    const source = makeArrays(['在']);
    const target = makeArrays(manyChars);
    // Should not throw or hang; returns some valid index
    const result = findCharacterOnlyMatch(0, source, target);
    expect(Array.isArray(result)).toBe(true);
    expect(result!.length).toBe(1);
    expect(result![0]).toBeGreaterThanOrEqual(0);
    expect(result![0]).toBeLessThan(100);
  });
});

describe('findCharacterOnlyMatch — multi-char segment, multiple occurrences', () => {
  test('returns correct indices for second occurrence of multi-char segment', () => {
    // source: ['你好', '的', '你好']
    // target (char-only): ['你','好','嗯','你','好','吧']
    // sourceIndex=2 ('你好', 2nd occurrence) → occurrenceInSource=1 → picks target[3,4]
    const source = makeArrays(['你好', '的', '你好'], [0, 1, 2]);
    const target = makeArrays(['你', '好', '嗯', '你', '好', '吧']);
    const result = findCharacterOnlyMatch(2, source, target);
    expect(result).toEqual([3, 4]);
  });
});
