/**
 * Cross-language parity check for Phase 4 conflict resolution against the shared fixture.
 * test-fixtures/conflict-resolution-parity.json is the single source of truth for what BOTH
 * the JS fallback (this file) and Rust's run_conflict_resolution are expected to select. The
 * mirror check lives in wasm-core/src/conflict_resolution.rs's `mod tests::parity`.
 *
 * WASM is never initialized here (the init mock rejects), so every call takes the JS fallback
 * in resolveGlobalConflictsWasm — the production code, not a local reference copy.
 */
import { describe, test, expect, vi } from 'vitest';

vi.mock('../../wasm/translation_wasm_core.js', () => ({
  default: vi.fn().mockRejectedValue(new Error('WASM unavailable in tests')),
  resolveGlobalConflicts: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { resolveGlobalConflictsWasm } from '../wasm/WasmConflictResolution';
import fixture from '../../../test-fixtures/conflict-resolution-parity.json';

describe('resolveGlobalConflictsWasm — shared fixture parity (JS fallback)', () => {
  test('fixture is non-empty', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  test.each(fixture.cases)('$name', (fixtureCase) => {
    const matches = fixtureCase.matches.map((m) => ({
      ...m,
      length: m.endIndex - m.startIndex + 1,
    }));
    const snapshot = matches.map((m) => ({ ...m }));

    const result = resolveGlobalConflictsWasm(matches);

    expect(result.map((m) => matches.indexOf(m))).toEqual(fixtureCase.selected);
    expect(matches).toEqual(snapshot);
  });
});
