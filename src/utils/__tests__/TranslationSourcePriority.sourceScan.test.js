/**
 * Every translationSource string the Rust side emits must be a source JS ranks.
 *
 * Rust writes `translation_source` onto WASM-path tokens as plain string literals; JS ranks them
 * with `getSourcePriority`, which gives an unknown string 999 — below the character fallback,
 * with no error. A rename on either side would degrade silently, so this scans the Rust files
 * that emit sources and holds each literal to `PHASE_PRIORITIES` (a consumed source is held to
 * its leader). Scan-style, like SourceConventionScan: no Rust change needed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE_PRIORITIES, getSourcePriority } from '../TranslationSourcePriority';

const wasmSrc = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../wasm-core/src'
);
const read = (rel) => readFileSync(path.join(wasmSrc, rel), 'utf8');

/** [file, regex capturing one emitted source literal] */
const EMITTERS = [
  ['pattern_processor/two_phase.rs', /Some\("(hierarchical_[a-z_]+)"/g],
  ['number_processor.rs', /translation_source = Some\("([a-z_]+)"/g],
];

function emittedSources() {
  const out = [];
  for (const [file, re] of EMITTERS) {
    for (const m of read(file).matchAll(re)) out.push({ file, source: m[1] });
  }
  return out;
}

describe('Rust-emitted translation sources', () => {
  const emitted = emittedSources();

  it('finds the sources it scans for (liveness)', () => {
    const names = new Set(emitted.map((e) => e.source));
    for (const known of ['hierarchical_pattern', 'hierarchical_patterns', 'number_conversion']) {
      expect(names.has(known), `${known} not found — did the Rust emitter move?`).toBe(true);
    }
  });

  it.each([...new Set(emitted.map((e) => e.source))])('JS ranks %s', (source) => {
    const leader = source.endsWith('_consumed') ? source.slice(0, -'_consumed'.length) : source;
    expect(
      Object.prototype.hasOwnProperty.call(PHASE_PRIORITIES, leader),
      `Rust emits "${source}" but PHASE_PRIORITIES has no "${leader}"`
    ).toBe(true);
    expect(getSourcePriority(leader)).not.toBe(999);
  });
});
