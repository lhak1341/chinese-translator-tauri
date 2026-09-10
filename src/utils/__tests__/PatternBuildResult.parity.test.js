/**
 * Cross-language parity check against the shared fixture. test-fixtures/build-result-parity.json
 * is the single source of truth for what BOTH SemanticPatternProcessor.buildResult() (this file)
 * and Rust's build_result() (wasm-core/src/pattern_processor/matcher.rs) must produce for a given
 * template + variables. Added after a production bug (2026-09-10) where both independently
 * reimplemented substitutions matched a variable letter (e.g. "X") anywhere it appeared in the
 * template, including fused into fixed text ("Xích"), because there was no shared contract forcing
 * them to agree. The Rust mirror check lives in matcher.rs's mod tests::parity.
 */
import { describe, test, expect } from 'vitest';
import { SemanticPatternProcessor } from '../pattern/SemanticPatternProcessor.js';
import fixture from '../../../test-fixtures/build-result-parity.json';

describe('SemanticPatternProcessor.buildResult — shared fixture parity', () => {
  test('fixture is non-empty', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  test.each(fixture.cases)('$name', (fixtureCase) => {
    const proc = new SemanticPatternProcessor();
    const result = proc.buildResult(fixtureCase.template, fixtureCase.variables);
    expect(result).toBe(fixtureCase.expected);
  });
});
