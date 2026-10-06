/**
 * Fixture check for spacing-aware text assembly (postProcess Step 2).
 * test-fixtures/text-assembly-parity.json is the source of truth for what `needsSpace` and
 * `assembleWithSpacing` produce. The Rust twin was deleted 2026-10-06 (ADR-079), so the fixture
 * now feeds this file alone.
 */
import { describe, test, expect } from 'vitest';
import { needsSpace, assembleWithSpacing } from '../text/TextAssembly.js';
import fixture from '../../../test-fixtures/text-assembly-parity.json';

describe('needsSpace — fixture', () => {
  test('fixture is non-empty', () => {
    expect(fixture.rules.length).toBeGreaterThan(0);
  });

  test.each(fixture.rules)('$name', ({ current, next, space }) => {
    expect(needsSpace(current.type, next.type, current.text, next.text)).toBe(space);
  });
});

describe('assembleWithSpacing — fixture', () => {
  test('fixture is non-empty', () => {
    expect(fixture.assemblies.length).toBeGreaterThan(0);
  });

  test.each(fixture.assemblies)('$name', ({ segments, translatedText, positions }) => {
    expect(assembleWithSpacing(segments)).toEqual({ translatedText, positions });
  });
});
