/**
 * test-fixtures/number-parity.json is the source of truth for what Phase 3 converts.
 * `NumberProcessor.processTokens` is the product; `wasm-core/src/number_processor.rs` is its
 * Rust spec (ADR-041, no runtime caller) and runs the same file in `mod tests::parity`. A
 * conversion rule changes in the fixture first; the case then fails on whichever side lags.
 */

import { describe, it, expect } from 'vitest';
import { NumberProcessor } from '../NumberProcessor.js';
import fixture from '../../../test-fixtures/number-parity.json';

const LEADER = 'number_conversion';
const FOLLOWER = 'number_conversion_consumed';

function convert(text) {
  const tokens = [...text].map((value) => ({
    type: 'chinese_char',
    value,
    translated: null,
    translationSource: null,
  }));
  new NumberProcessor().processTokens(tokens, { semanticArrayBuilder: { addUnit: () => {} } });
  return tokens;
}

/** The converted spans, plus the consumed-token contract checked on the way. */
function spansOf(tokens) {
  const spans = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].translationSource !== LEADER) {
      // Nothing but a leader may carry a translation, and a follower never starts a span.
      expect(tokens[i].translated, `token ${i} translated without being a leader`).toBeNull();
      expect(tokens[i].translationSource, `token ${i} is a stray follower`).toBeNull();
      continue;
    }
    expect(tokens[i].translated).not.toBeNull();
    let length = 1;
    while (tokens[i + length]?.translationSource === FOLLOWER) {
      expect(
        tokens[i + length].translated,
        `follower ${i + length} must carry no value`
      ).toBeNull();
      length++;
    }
    spans.push({ start: i, length, translated: tokens[i].translated });
    i += length - 1;
  }
  return spans;
}

describe('number conversion matches the shared fixture', () => {
  it('has cases', () => {
    expect(fixture.cases.length).toBeGreaterThan(20);
  });

  it('gives every ignored case a reason', () => {
    const unexplained = fixture.cases
      .filter((c) => c.ignore && !(typeof c.ignore.rust === 'string' && c.ignore.rust.trim()))
      .map((c) => c.name);
    expect(unexplained).toEqual([]);
  });

  it('names every case once', () => {
    const names = fixture.cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(fixture.cases.map((c) => [c.name, c]))('%s', (_name, { text, converted }) => {
    const tokens = convert(text);
    expect(spansOf(tokens)).toEqual(converted);
    expect(tokens).toHaveLength([...text].length);
  });
});
