// WASM is never initialized in these tests (init() mock rejects) — all calls use JS fallback.
// The fallback algorithm itself is covered by ConflictResolution.parity.test.js.

import { describe, test, expect, vi } from 'vitest';

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  default: vi.fn().mockRejectedValue(new Error('WASM unavailable in tests')),
  resolveGlobalConflicts: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { resolveGlobalConflictsWasm } from '../wasm/WasmConflictResolution';
import { fireCascadeRetire } from '../wasm/WasmCascadeRegistry';

// ─── resolveGlobalConflictsWasm (Phase 4) ────────────────────────────────────
// The algorithm's cases live in test-fixtures/conflict-resolution-parity.json and run in
// ConflictResolution.parity.test.js; this file keeps the wrapper's own behavior.

describe('resolveGlobalConflictsWasm — wrapper', () => {
  test("returns the caller's own match objects, not copies", () => {
    const m = { startIndex: 0, endIndex: 2, length: 3, type: 'phrase' };
    expect(resolveGlobalConflictsWasm([m])[0]).toBe(m);
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
  });
});
