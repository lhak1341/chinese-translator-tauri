/**
 * Parity tests for resolveGlobalConflicts() greedy interval scheduling algorithm.
 *
 * CRITICAL: these implementations of the same algorithm must stay identical:
 *   1. TranslationEngine.js::resolveGlobalConflicts()  (Phase 4 — phrases)
 *   2. The pure reference implementation below (source of truth for this test suite)
 *   (A Phase 2 twin, resolveMatchConflicts(), was reachable only from dead code and was
 *   deleted 2026-09-26 — see docs/guides/deleted-symbols.md.)
 *
 * Rust parity validator (independent implementation, catches divergence at cargo test time):
 *   wasm-core/tests/conflict_resolution_parity_test.rs
 *
 * NOTE: wasm-core/src/pattern_processor/matcher.rs::find_best_pattern_match() is NOT a
 * counterpart of this algorithm — it selects the best pattern at a single position (Phase 1,
 * different problem). Do not confuse the two.
 *
 * Any change to the sort order or selection logic MUST be applied to all three JS/Rust
 * implementations and these tests MUST continue to pass.
 *
 * ALGORITHM (LENGTH-FIRST greedy interval scheduling):
 *   1. Sort candidates: longer first → type priority (phrase < pattern) → earlier start first
 *   2. Greedily select non-overlapping matches from the sorted list
 *   3. Mark selected token-index ranges as used; reject any candidate that touches a used index
 */

import { describe, test, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Reference implementation (pure function, no engine state required)
// This MUST stay byte-for-byte equivalent to TranslationEngine.resolveGlobalConflicts()
// ─────────────────────────────────────────────────────────────────────────────
function resolveGlobalConflicts(allMatches) {
  const sorted = [...allMatches].sort((a, b) => {
    // Primary: Length descending (longer matches win)
    if (a.length !== b.length) return b.length - a.length;

    // Secondary: Type priority ascending (phrase=1 wins over pattern=2)
    const typePriority = (m) => (m.type === 'phrase' ? 1 : m.type === 'pattern' ? 2 : 3);
    const pa = typePriority(a);
    const pb = typePriority(b);
    if (pa !== pb) return pa - pb;

    // Tertiary: Start index ascending (earlier wins)
    return a.startIndex - b.startIndex;
  });

  const selected = [];
  const usedTokenIndices = new Set();

  for (const match of sorted) {
    let hasConflict = false;
    for (let i = match.startIndex; i <= match.endIndex; i++) {
      if (usedTokenIndices.has(i)) {
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) {
      selected.push(match);
      for (let i = match.startIndex; i <= match.endIndex; i++) {
        usedTokenIndices.add(i);
      }
    }
  }

  return selected;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const phrase = (word, startIndex, endIndex) => ({
  type: 'phrase',
  match: { word },
  startIndex,
  endIndex,
  length: endIndex - startIndex + 1,
});

const pattern = (originalPattern, startIndex, endIndex) => ({
  type: 'pattern',
  pattern: { originalPattern },
  startIndex,
  endIndex,
  length: endIndex - startIndex + 1,
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveGlobalConflicts — greedy interval scheduling', () => {
  test('empty input returns empty output', () => {
    expect(resolveGlobalConflicts([])).toEqual([]);
  });

  test('single match is always selected', () => {
    const m = phrase('不知道', 0, 2);
    expect(resolveGlobalConflicts([m])).toEqual([m]);
  });

  test('two non-overlapping matches are both selected', () => {
    const a = phrase('不知道', 0, 2);
    const b = phrase('谢谢', 3, 4);
    const result = resolveGlobalConflicts([a, b]);
    expect(result).toHaveLength(2);
    expect(result).toContain(a);
    expect(result).toContain(b);
  });

  test('longer match wins over shorter overlapping match', () => {
    const short = phrase('不知', 0, 1); // length 2
    const long = phrase('不知道', 0, 2); // length 3 — wins
    const result = resolveGlobalConflicts([short, long]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(long);
  });

  test('same-length phrase beats same-length pattern', () => {
    const p = pattern('在X中', 0, 2); // length 3
    const ph = phrase('在一起', 0, 2); // length 3, phrase wins (lower type priority)
    const result = resolveGlobalConflicts([p, ph]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('phrase');
  });

  test('same-length same-type: earlier start index wins', () => {
    const early = phrase('不知道', 0, 2); // starts at 0
    const late = phrase('知道了', 1, 3); // starts at 1
    const result = resolveGlobalConflicts([late, early]); // pass in reverse order
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(early); // earlier start selected first
  });

  test('non-overlapping adjacent matches both selected', () => {
    // Tokens: [0,1,2] and [3,4] — adjacent but not overlapping
    const a = phrase('不知道', 0, 2);
    const b = phrase('谢谢你', 3, 5);
    const result = resolveGlobalConflicts([a, b]);
    expect(result).toHaveLength(2);
  });

  test('partial overlap: first accepted match blocks second', () => {
    // [0,1,2] selected first; [1,2,3] shares tokens 1 and 2 → rejected
    const first = phrase('不知道', 0, 2); // length 3 — selected
    const second = phrase('知道了', 1, 3); // length 3, starts later → rejected
    const result = resolveGlobalConflicts([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(first);
  });

  test('single-token match blocked by larger match covering same token', () => {
    const large = phrase('不知道', 0, 2); // covers tokens 0,1,2
    const small = phrase('知', 1, 1); // covers only token 1 — blocked
    const result = resolveGlobalConflicts([small, large]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(large);
  });

  test('three candidates: longest wins, remaining non-overlapping also selected', () => {
    // Tokens 0-4: [0,1,2] wins vs [0,1]; [3,4] is non-overlapping → also selected
    const big = phrase('ABC', 0, 2); // length 3
    const small = phrase('AB', 0, 1); // length 2 — overlaps with big
    const other = phrase('DE', 3, 4); // length 2 — non-overlapping
    const result = resolveGlobalConflicts([small, other, big]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.match.word).sort()).toEqual(['ABC', 'DE']);
  });

  test('pattern selected when no phrase overlaps with it', () => {
    const pat = pattern('在X中', 0, 2);
    const unrelated = phrase('谢谢', 5, 6);
    const result = resolveGlobalConflicts([pat, unrelated]);
    expect(result).toHaveLength(2);
  });

  test('selection order is length-first, not input order', () => {
    // Input order: short, long — but long should be selected
    const short = phrase('知道', 1, 2); // length 2
    const long = phrase('不知道', 0, 2); // length 3 — wins even though it was second in input
    const result = resolveGlobalConflicts([short, long]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(long);
  });

  test('selected matches preserve original object references', () => {
    const a = phrase('不知道', 0, 2);
    const b = phrase('谢谢', 4, 5);
    const result = resolveGlobalConflicts([b, a]);
    // Both selected; verify they are the same objects, not copies
    expect(result.find((m) => m === a)).toBeDefined();
    expect(result.find((m) => m === b)).toBeDefined();
  });

  test('does not mutate the input array', () => {
    const a = phrase('不知道', 0, 2);
    const b = phrase('知道了', 1, 3);
    const input = [a, b];
    const inputCopy = [...input];
    resolveGlobalConflicts(input);
    expect(input).toEqual(inputCopy);
  });

  test('real-world scenario: phrase, pattern, and character fallback compete', () => {
    // Simulates Phase 4 conflict resolution for a clause like "在他的身体上"
    // Phrase matches:
    //   "身体" covers tokens 3-4 (length 2)
    // Pattern matches:
    //   "在X的身体上" covers tokens 0-5 (length 6) — should win everything
    // Single-char fallback (not included, added by Phase 5 later):
    //   Would cover each individual token

    const phraseBodyPart = phrase('身体', 3, 4); // length 2
    const patternFull = pattern('在X的身体上', 0, 5); // length 6 — wins

    const result = resolveGlobalConflicts([phraseBodyPart, patternFull]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('pattern');
    expect(result[0].pattern.originalPattern).toBe('在X的身体上');
  });
});
