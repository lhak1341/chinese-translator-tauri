/**
 * Cross-language parity check against the shared fixture (architecture review
 * 2026-07-29, candidate #6). test-fixtures/tokenizer-parity.json is the single
 * source of truth for what BOTH tokenizeJS (this file) and Rust's
 * tokenize_text_core are expected to produce for a given input — including the
 * documented divergences. The mirror check lives in wasm-core/src/text_tokenizer.rs's
 * `mod tests::parity`.
 *
 * This forces the JS fallback path (WasmTextTokenizer mocked out) — the fixture's
 * "js" expectations characterize tokenizeJS specifically, not whatever the real
 * WASM binary happens to produce in this test environment.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { TextTokenizer } from '../text/TextTokenizer';
import fixture from '../../../test-fixtures/tokenizer-parity.json';

const mockInitialize = vi.fn();
const mockTokenize = vi.fn();

vi.mock('../wasm/WasmTextTokenizer.js', () => ({
  WasmTextTokenizer: class {
    initialize = mockInitialize;
    tokenize = mockTokenize;
  },
}));

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('TextTokenizer — shared fixture parity', () => {
  beforeEach(() => {
    mockInitialize.mockReset();
    mockInitialize.mockResolvedValue(false); // force JS fallback path
    mockTokenize.mockReset();
  });

  test('fixture is non-empty', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  test.each(fixture.cases)('$name', async (fixtureCase) => {
    const tokenizer = new TextTokenizer();
    await flushMicrotasks();

    const tokens = tokenizer.tokenize(fixtureCase.input);

    expect(tokens.map((t) => t.value)).toEqual(fixtureCase.js.values);
    expect(tokens.map((t) => t.type)).toEqual(fixtureCase.js.types);
  });
});
