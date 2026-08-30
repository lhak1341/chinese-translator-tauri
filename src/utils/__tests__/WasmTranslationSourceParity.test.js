/**
 * Cross-language guard: every `translationSource` string the Rust side writes onto a token
 * must be one JS `getSourcePriority()` recognises.
 *
 * The two languages share this contract by convention only — there is no generated constant,
 * no schema, and no compiler link between `PHASE_PRIORITIES` and the Rust string literals.
 * An unrecognised string returns 999, which ranks the token below the character-level fallback
 * and produces wrong output with no error. This test is the link.
 *
 * Rust `#[cfg(test)] mod tests` blocks are excluded: their `translation_source` values are
 * fixture data that no production code path reads (`text_assembly.rs` carries `"phrase"` there,
 * which is not a valid production source).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getSourcePriority } from '../TranslationSourcePriority.js';

const CRATE_ROOT = path.resolve(__dirname, '../../../wasm-core/src');
const RUST_SOURCES = ['number_processor.rs', 'text_assembly.rs', 'pattern_processor/two_phase.rs'];
const UNRECOGNISED = 999;

/** Removes every `#[cfg(test)] mod tests { ... }` block by brace matching. */
function stripTestModules(source) {
  const marker = /#\[cfg\(test\)\]\s*mod\s+\w+\s*\{/g;
  let out = source;
  let match;
  while ((match = marker.exec(out)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < out.length && depth > 0) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}') depth--;
      i++;
    }
    out = out.slice(0, match.index) + out.slice(i);
    marker.lastIndex = 0;
  }
  return out;
}

function collectRustSources() {
  const found = [];
  for (const file of RUST_SOURCES) {
    const full = path.join(CRATE_ROOT, file);
    const production = stripTestModules(readFileSync(full, 'utf8'));
    const lines = production.split('\n');
    lines.forEach((line, index) => {
      if (!line.includes('translation_source')) return;
      if (line.trim().startsWith('//')) return;
      for (const m of line.matchAll(/"([a-z_]+)"/g)) {
        found.push({ literal: m[1], file, line: index + 1 });
      }
    });
  }
  return found;
}

describe('Rust translationSource literals', () => {
  const sources = collectRustSources();

  test('the scan finds Rust translation_source literals', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  test('every Rust literal resolves to a phase priority JS recognises', () => {
    const bad = sources.filter(({ literal }) => getSourcePriority(literal, []) === UNRECOGNISED);
    expect(bad.map(({ literal, file, line }) => `${file}:${line} emits '${literal}'`)).toEqual([]);
  });
});
