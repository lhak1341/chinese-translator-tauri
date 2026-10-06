/**
 * Fixture check for TextTokenizer.tokenize (architecture review 2026-07-29, candidate #6).
 * test-fixtures/tokenizer-parity.json is the source of truth for what the tokenizer produces.
 * The Rust twin was deleted 2026-10-06 (ADR-079), so the fixture now feeds this file alone.
 */
import { describe, test, expect } from 'vitest';
import { TextTokenizer } from '../text/TextTokenizer';
import fixture from '../../../test-fixtures/tokenizer-parity.json';

describe('TextTokenizer — fixture', () => {
  test('fixture is non-empty', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  test.each(fixture.cases)('$name', (fixtureCase) => {
    const tokens = new TextTokenizer().tokenize(fixtureCase.input);

    expect(tokens.map((t) => t.value)).toEqual(fixtureCase.expected.values);
    expect(tokens.map((t) => t.type)).toEqual(fixtureCase.expected.types);
  });
});
