// WASM is never initialized in these tests (init() mock rejects) — all calls use JS fallback.
// Tests verify the JS fallback algorithm that mirrors TranslationEngine.js conflict resolution.

import { describe, test, expect, vi } from 'vitest';

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  default: vi.fn().mockRejectedValue(new Error('WASM unavailable in tests')),
  resolveGlobalConflicts: vi.fn(),
  resolveMatchConflictsCore: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import {
  resolveGlobalConflictsWasm,
  resolveMatchConflictsWasm,
} from '../wasm/WasmConflictResolution';
import { fireCascadeRetire } from '../wasm/WasmCascadeRegistry';

// ─── resolveGlobalConflictsWasm (Phase 4) ────────────────────────────────────

describe('resolveGlobalConflictsWasm — JS fallback', () => {
  test('empty input returns empty array', () => {
    expect(resolveGlobalConflictsWasm([])).toEqual([]);
  });

  test('single match is always selected', () => {
    const m = { startIndex: 0, endIndex: 2, length: 3, type: 'phrase' };
    expect(resolveGlobalConflictsWasm([m])).toEqual([m]);
  });

  test('two non-overlapping matches are both selected', () => {
    const a = { startIndex: 0, endIndex: 1, length: 2, type: 'phrase' };
    const b = { startIndex: 3, endIndex: 5, length: 3, type: 'phrase' };
    const result = resolveGlobalConflictsWasm([a, b]);
    expect(result).toContain(a);
    expect(result).toContain(b);
  });

  test('longer match beats shorter overlapping match', () => {
    const short = { startIndex: 0, endIndex: 1, length: 2, type: 'phrase' };
    const long = { startIndex: 0, endIndex: 2, length: 3, type: 'phrase' };
    const result = resolveGlobalConflictsWasm([short, long]);
    expect(result).toContain(long);
    expect(result).not.toContain(short);
  });

  // Phase 4 priority: phrase > pattern at equal length
  // (inverted vs Phase 2 — see CLAUDE.md "Intentionally Inverted Priority")
  test('phrase beats pattern at equal length (Phase 4 priority)', () => {
    const phrase = { startIndex: 0, endIndex: 1, length: 2, type: 'phrase' };
    const pattern = { startIndex: 0, endIndex: 1, length: 2, type: 'pattern' };
    const result = resolveGlobalConflictsWasm([pattern, phrase]);
    expect(result).toContain(phrase);
    expect(result).not.toContain(pattern);
  });

  test('earlier position wins when length and type are equal', () => {
    const first = { startIndex: 0, endIndex: 1, length: 2, type: 'phrase' };
    const second = { startIndex: 2, endIndex: 3, length: 2, type: 'phrase' };
    // non-overlapping so both are selected — leftmost first in output
    const result = resolveGlobalConflictsWasm([second, first]);
    expect(result).toContain(first);
    expect(result).toContain(second);
  });

  test('does not mutate the input array', () => {
    const matches = [
      { startIndex: 0, endIndex: 1, length: 2, type: 'phrase' },
      { startIndex: 0, endIndex: 2, length: 3, type: 'pattern' },
    ];
    const copy = matches.map((m) => ({ ...m }));
    resolveGlobalConflictsWasm(matches);
    expect(matches[0]).toEqual(copy[0]);
    expect(matches[1]).toEqual(copy[1]);
  });

  test('three candidates — only longest non-overlapping set selected', () => {
    // [0-3 phrase], [0-1 phrase], [2-3 phrase]: first covers both others
    const big = { startIndex: 0, endIndex: 3, length: 4, type: 'phrase' };
    const left = { startIndex: 0, endIndex: 1, length: 2, type: 'phrase' };
    const right = { startIndex: 2, endIndex: 3, length: 2, type: 'phrase' };
    const result = resolveGlobalConflictsWasm([big, left, right]);
    expect(result).toContain(big);
    expect(result).not.toContain(left);
    expect(result).not.toContain(right);
  });
});

// ─── resolveMatchConflictsWasm (Phase 2) ─────────────────────────────────────

describe('resolveMatchConflictsWasm — JS fallback', () => {
  test('empty input returns empty array', () => {
    expect(resolveMatchConflictsWasm([])).toEqual([]);
  });

  test('single match is always selected', () => {
    const m = {
      startIndex: 0,
      endIndex: 1,
      type: 'phrase',
      isCompoundWord: false,
      isPartOfPattern: false,
    };
    expect(resolveMatchConflictsWasm([m])).toEqual([m]);
  });

  test('two non-overlapping matches both selected', () => {
    const a = { startIndex: 0, endIndex: 1, type: 'phrase' };
    const b = { startIndex: 3, endIndex: 4, type: 'phrase' };
    const result = resolveMatchConflictsWasm([a, b]);
    expect(result).toContain(a);
    expect(result).toContain(b);
  });

  // Phase 2 priority 1: compound phrase with allowAsPatternVariable
  test('priority 1 compound phrase beats non-conflicting pattern (priority 2)', () => {
    const compound = {
      startIndex: 0,
      endIndex: 1,
      type: 'phrase',
      isCompoundWord: true,
      isPartOfPattern: false,
      match: { metadata: { allowAsPatternVariable: true } },
    };
    const pattern = {
      startIndex: 0,
      endIndex: 1,
      type: 'pattern',
      conflictsWithCompound: false,
    };
    const result = resolveMatchConflictsWasm([pattern, compound]);
    expect(result).toContain(compound);
    expect(result).not.toContain(pattern);
  });

  // Phase 2 priority 2: non-conflicting pattern beats conflicting pattern (priority 4)
  test('non-conflicting pattern beats conflicting pattern', () => {
    const good = { startIndex: 0, endIndex: 1, type: 'pattern', conflictsWithCompound: false };
    const bad = { startIndex: 0, endIndex: 1, type: 'pattern', conflictsWithCompound: true };
    const result = resolveMatchConflictsWasm([bad, good]);
    expect(result).toContain(good);
    expect(result).not.toContain(bad);
  });

  // Phase 2 priority 5: plain phrase falls below pattern types
  test('non-conflicting pattern (priority 2) beats plain phrase (priority 5)', () => {
    const pattern = { startIndex: 0, endIndex: 1, type: 'pattern', conflictsWithCompound: false };
    const plain = { startIndex: 0, endIndex: 1, type: 'phrase', isCompoundWord: false };
    const result = resolveMatchConflictsWasm([plain, pattern]);
    expect(result).toContain(pattern);
    expect(result).not.toContain(plain);
  });

  test('does not mutate the input array', () => {
    const matches = [{ startIndex: 0, endIndex: 1, type: 'phrase', isCompoundWord: false }];
    const valueBefore = matches[0].type;
    resolveMatchConflictsWasm(matches);
    expect(matches[0].type).toBe(valueBefore);
  });
});

// ─── cascade retire (via the real WasmCascadeRegistry interface) ─────────────

describe('cascade retire', () => {
  test('fireCascadeRetire() does not throw', () => {
    expect(() => fireCascadeRetire()).not.toThrow();
  });

  test('subsequent resolve calls still return arrays (JS fallback after retire)', () => {
    fireCascadeRetire();
    const m = { startIndex: 0, endIndex: 1, length: 2, type: 'phrase' };
    expect(Array.isArray(resolveGlobalConflictsWasm([m]))).toBe(true);
    expect(Array.isArray(resolveMatchConflictsWasm([m]))).toBe(true);
  });
});
