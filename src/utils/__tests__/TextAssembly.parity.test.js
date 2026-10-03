/**
 * Cross-language parity check for spacing-aware text assembly (postProcess Step 2) against the
 * shared fixture. test-fixtures/text-assembly-parity.json is the single source of truth for what
 * BOTH the JS implementation (this file) and Rust's needs_space / assemble_with_spacing are
 * expected to produce. The mirror check lives in wasm-core/src/text_assembly.rs's
 * `mod tests::parity`.
 *
 * WASM is never initialized under vitest (WasmTextAssembler skips its background init when
 * MODE === 'test'), so wasmTextAssembler.assembleWithSpacing takes the real JS fallback.
 */
import { describe, test, expect } from 'vitest';
import { needsSpace, wasmTextAssembler } from '../wasm/WasmTextAssembler.js';
import fixture from '../../../test-fixtures/text-assembly-parity.json';

describe('needsSpace — shared fixture parity', () => {
  test('fixture is non-empty', () => {
    expect(fixture.rules.length).toBeGreaterThan(0);
  });

  test.each(fixture.rules)('$name', ({ current, next, space }) => {
    expect(needsSpace(current.type, next.type, current.text, next.text)).toBe(space);
  });
});

describe('assembleWithSpacing (JS fallback) — shared fixture parity', () => {
  test('fixture is non-empty', () => {
    expect(fixture.assemblies.length).toBeGreaterThan(0);
  });

  test.each(fixture.assemblies)('$name', ({ segments, translatedText, positions }) => {
    expect(wasmTextAssembler.assembleWithSpacing(segments)).toEqual({ translatedText, positions });
  });
});
