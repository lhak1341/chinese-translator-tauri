/**
 * Phase 4 conflict resolution against the shared fixture.
 * test-fixtures/conflict-resolution-parity.json is the spec for what resolveGlobalConflicts
 * selects. Its Rust twin was deleted 2026-10-07 (ADR-083), so this file is the only reader.
 */
import { describe, test, expect } from 'vitest';
import { resolveGlobalConflicts } from '../ConflictResolution';
import fixture from '../../../test-fixtures/conflict-resolution-parity.json';

describe('resolveGlobalConflicts — fixture', () => {
  test('fixture is non-empty', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  test.each(fixture.cases)('$name', (fixtureCase) => {
    const matches = fixtureCase.matches.map((m) => ({
      ...m,
      length: m.endIndex - m.startIndex + 1,
    }));
    const snapshot = matches.map((m) => ({ ...m }));

    const result = resolveGlobalConflicts(matches);

    expect(result.map((m) => matches.indexOf(m))).toEqual(fixtureCase.selected);
    expect(matches).toEqual(snapshot);
  });

  test("returns the caller's own match objects, not copies", () => {
    const m = { startIndex: 0, endIndex: 2, length: 3, type: 'phrase' };
    expect(resolveGlobalConflicts([m])[0]).toBe(m);
  });
});
