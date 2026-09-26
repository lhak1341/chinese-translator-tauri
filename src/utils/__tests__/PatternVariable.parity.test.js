/**
 * Cross-language parity for which characters of a pattern are variables.
 * test-fixtures/pattern-variable-parity.json is the single source of truth; the Rust mirror
 * check lives in wasm-core/src/pattern_processor/variable.rs.
 *
 * Asserted here through every JS consumer, not just the predicate: the validator
 * (extractPatternVariables) and the JS fallback matcher (SemanticPatternProcessor.parsePattern)
 * each used to carry their own letter test, and the fallback's never counted `#` at all.
 */
import { describe, test, expect } from 'vitest';
import { PatternTemplateEngine } from '../pattern/PatternTemplateEngine.js';
import { SemanticPatternProcessor } from '../pattern/SemanticPatternProcessor.js';
import { extractPatternVariables } from '../dictionary/PatternEntryRules';
import fixture from '../../../test-fixtures/pattern-variable-parity.json';

const variablePositions = (text) =>
  [...text].map((_, i) => i).filter((i) => PatternTemplateEngine.isVariableChar(text, i));

describe('pattern variable recognition — shared fixture parity', () => {
  test('fixture is non-empty', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  test.each(fixture.cases)('isVariableChar: $name', ({ text, variables }) => {
    expect(variablePositions(text)).toEqual(variables);
  });

  test.each(fixture.cases)('validator: $name', ({ text, variables }) => {
    expect(extractPatternVariables(text)).toEqual(new Set(variables.map((i) => text[i])));
  });

  test.each(fixture.cases)('fallback matcher parse: $name', ({ text, variables }) => {
    const parsed = new SemanticPatternProcessor().parsePattern(text, text);
    const positions = parsed.tokens.filter((t) => t.type === 'variable').map((t) => t.position);
    expect(positions).toEqual(variables);
  });
});
