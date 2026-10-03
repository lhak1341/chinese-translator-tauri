/**
 * Cross-language chunker parity against the shared fixture (architecture review
 * 2026-10-03, candidate #3 grilling). test-fixtures/chunker-parity.json is the single
 * source of truth for what BOTH this JS chunker and Rust's TextChunker are expected to
 * produce for a given input, including the documented divergences. The mirror check
 * lives in wasm-core/src/text_chunker.rs's `mod tests::parity`.
 *
 * This forces the JS path (WasmTextChunker mocked out): the fixture's "js" expectations
 * characterize TextChunker.js specifically, not whatever the real WASM binary produces
 * in this test environment.
 */
import { describe, test, expect, vi } from 'vitest';
import { TextChunker } from '../text/TextChunker.js';
import fixture from '../../../test-fixtures/chunker-parity.json';

vi.mock('../wasm/WasmTextChunker.js', () => ({
  wasmTextChunker: { chunkText: () => null }, // null: use the JS implementation
}));

const toPlain = (chunks) =>
  chunks.map(({ content, punctuation, startIndex, lineBreaks, startedBy }) => ({
    content,
    punctuation,
    startIndex,
    lineBreaks,
    startedBy,
  }));

describe('TextChunker — shared fixture parity', () => {
  test('fixture is non-empty', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  test.each(fixture.cases)('$name', ({ input, js }) => {
    const chunker = new TextChunker();

    expect(toPlain(chunker.chunkText(input))).toEqual(js);
  });

  test('a case marked expectAgreement has identical rust and js expectations', () => {
    for (const c of fixture.cases) {
      expect(c.expectAgreement, c.name).toBe(JSON.stringify(c.rust) === JSON.stringify(c.js));
    }
  });
});
