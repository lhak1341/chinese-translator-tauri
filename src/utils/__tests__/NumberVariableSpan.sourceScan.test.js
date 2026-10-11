/**
 * The numeral span the JS cache supplies and the span the Rust matcher will try for `#` are one
 * number written in two languages. If the Rust one is smaller, the longest numerals sit in the
 * cache and are never tried (a `第#章` heading with a 7-character numeral fell to characters);
 * if it is larger, nothing breaks but the search does extra work. So the JS bound is the source
 * and the Rust constant must equal it. Scan-style, like TranslationSourcePriority.sourceScan.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_NUMERAL_SPAN } from '../pattern/NumberVariable.js';

const matcherRs = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../wasm-core/src/pattern_processor/matcher.rs'
);

describe('number variable span, JS and Rust', () => {
  const match = readFileSync(matcherRs, 'utf8').match(
    /pub const NUMBER_VARIABLE_SPAN: usize = (\d+);/
  );

  it('finds the Rust constant (liveness)', () => {
    expect(match).not.toBeNull();
  });

  it('is the longest numeral the JS cache supplies', () => {
    expect(Number(match?.[1])).toBe(MAX_NUMERAL_SPAN);
  });
});
