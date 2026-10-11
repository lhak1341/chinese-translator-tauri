import { describe, test, expect } from 'vitest';
import { findCharacterOnlyMatch } from '../highlighting/CharacterOnlyBridge';
import type { SemanticArrays } from '../../types/SemanticTypes';
import { makeMeta } from '../../test/makeMeta';

// Minimal SemanticArrays builder — only fields the bridge uses
function makeArrays(original: string[], tokenIndexes?: number[]): SemanticArrays {
  return {
    original,
    translated: original.map(() => ''),
    metadata: original.map((_, i) => makeMeta({ tokenIndex: tokenIndexes ? tokenIndexes[i] : i })),
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

describe('findCharacterOnlyMatch — context window survives chunk-scrambled array order', () => {
  test('real tokenIndex-adjacent neighbors "P"/"Q" win over array-adjacent decoys "R"/"S"', () => {
    // processChunksInParallel assigns semantic array indices by chunk COMPLETION order, not
    // text order (src/utils/CLAUDE.md, "Ordering matters here" note). occurrenceInSource
    // compensates for this via tokenIndex comparisons (see the "cross-chunk scrambling"
    // describe block above); segmentsBefore/segmentsAfter must do the same — sort by
    // tokenIndex before taking neighbors, not slice by raw array index (fixed 2026-08-26,
    // see CharacterOnlyBridge.ts's sortedByPosition). This fixture places decoys 'R'/'S'
    // directly array-adjacent to the clicked '在', while its real textual neighbors 'P'/'Q'
    // (tokenIndex 20/22, either side of the clicked token's 21) sit far away in the array —
    // a naive array-index slice would find R/S as "immediate context" instead of P/Q.
    //
    // Character-Only (target) is built by a single sequential un-chunked loop
    // (TranslationEngine.js's translateCharacterOnly), so its array order is always true
    // text order — that's what makes it trustworthy ground truth here. It holds two '在'
    // occurrences: a decoy flanked by R/S, and the true one flanked by P/Q.
    const source = makeArrays(
      [
        /* 0 */ 'P', // true neighbor BEFORE clicked (tokenIndex 20) — real text-adjacent
        /* 1 */ 'pad1',
        /* 2 */ 'pad2',
        /* 3 */ '在', // decoy earlier occurrence #1 — inflates occurrenceInSource out of range
        /* 4 */ '在', // decoy earlier occurrence #2
        /* 5 */ 'R', // array-adjacent-before clicked, but textually unrelated (tokenIndex 50)
        /* 6 */ '在', // CLICKED — sourceIndex=6, tokenIndex 21
        /* 7 */ 'S', // array-adjacent-after clicked, but textually unrelated (tokenIndex 51)
        /* 8 */ 'pad3',
        /* 9 */ 'pad4',
        /* 10 */ 'Q', // true neighbor AFTER clicked (tokenIndex 22) — real text-adjacent
      ],
      [20, 100, 101, 10, 11, 50, 21, 51, 102, 103, 22]
    );
    const target = makeArrays(['R', '在', 'S', 'P', '在', 'Q']);

    // occurrenceInSource resolves to 2 (two earlier '在' at tokenIndex 10, 11 — both < 21),
    // out of range for the 2 real target occurrences (matchIndex 0 or 1), so sequential
    // scoring is neutralized and context scoring alone decides. Real neighbors 'P'/'Q' →
    // picks the [P,在,Q] occurrence at target index 4.
    const result = findCharacterOnlyMatch(6, source, target);
    expect(result).toEqual([4]);
  });
});

describe('findCharacterOnlyMatch — mixed-granularity source units (architecture review 2026-08-25, candidate 4)', () => {
  test('counts an earlier merged unit that textually embeds targetSegment, not just exact-equal units', () => {
    // text: "他你好吗你好" — source groups "你好吗" as one merged unit (e.g. a matched
    // phrase), embedding an earlier textual occurrence of "你好" that has no standalone
    // source entry of its own. target is char-level and finds both occurrences regardless.
    // Without the .includes() branch, occurrenceInSource would be 0 (no source unit
    // exactly equals "你好" before index 2) and the wrong (embedded) match would win.
    const source = makeArrays(['他', '你好吗', '你好'], [0, 1, 2]);
    const target = makeArrays(['他', '你', '好', '吗', '你', '好']);
    // targetSegment = "你好" (sourceIndex=2). Target-side scan finds it embedded at [1,2]
    // (inside where "你好吗" sits) and standalone at [4,5]. occurrenceInSource must be 1
    // (counting the embedded occurrence via .includes()) to correctly pick matchIndex=1 → [4,5].
    const result = findCharacterOnlyMatch(2, source, target);
    expect(result).toEqual([4, 5]);
  });

  test('single-char target: earlier merged unit embedding it counts as one prior occurrence', () => {
    // text: "你好吗你" — source: "你好吗" merged (embeds one "你"), then standalone "你".
    const source = makeArrays(['你好吗', '你'], [0, 1]);
    const target = makeArrays(['你', '好', '吗', '你']);
    // targetSegment = "你" (sourceIndex=1). Target scan finds "你" at [0] (embedded) and [3]
    // (standalone, the one actually clicked). occurrenceInSource=1 via .includes() → picks [3].
    const result = findCharacterOnlyMatch(1, source, target);
    expect(result).toEqual([3]);
  });
});
