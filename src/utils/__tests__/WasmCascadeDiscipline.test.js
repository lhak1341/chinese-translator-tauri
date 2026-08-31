/**
 * Scan gate for the shared-binary cascade-retire discipline in src/utils/wasm/.
 *
 * All wrappers import the same translation_wasm_core.js, so one panic corrupts the shared
 * dlmalloc arena for every wrapper. Retiring only the wrapper that panicked leaves the
 * others serving results from corrupted memory, with no error anywhere. The cascade is what
 * makes retirement collective, and nothing but this scan checks that a new or edited wrapper
 * actually joins it.
 *
 * Also pins the acyclicity property: four wrappers reached a sibling's retire function by
 * direct import until 2026-08-08, which was the sole cause of the only import cycle this
 * repo's static analysis ever flagged. The registry exists so that import never has to
 * happen; a retire symbol crossing a wrapper boundary is the shape that regressed before.
 *
 * See src/utils/CLAUDE.md section 5 for why retire-never-retry is the only safe response.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wasmDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../wasm');

/**
 * Every wrapper that shares the binary, by filename. Hard-coded rather than derived so that
 * a wrapper dropping out of the cascade fails here instead of silently shrinking the scan
 * set — a self-deriving list would call that a pass.
 */
const SHARED_BINARY_WRAPPERS = [
  'WasmConflictResolution.js',
  'WasmDictionaryManager.js',
  'WasmPatternProcessor.js',
  'WasmStringProcessor.js',
  'WasmTextAssembler.js',
  'WasmTextChunker.js',
  'WasmTextTokenizer.js',
];

/**
 * Comments are stripped before scanning: several wrappers open with a usage-example block
 * containing a literal `import { … } from './WasmX'` line, which the import scan would
 * otherwise read as a real sibling edge.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const sources = new Map(
  readdirSync(wasmDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => [f, stripComments(readFileSync(path.join(wasmDir, f), 'utf8'))])
);

/** Import statements of the form `import { a, b } from './Sibling'`, as [bindings, module]. */
function namedImports(source) {
  const out = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const bindings = m[1]
      .split(',')
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)
          .pop()
          .trim()
      )
      .filter(Boolean);
    out.push([bindings, m[2]]);
  }
  return out;
}

describe('WASM cascade-retire discipline', () => {
  it('scans a non-empty wrapper directory (liveness)', () => {
    expect(sources.size).toBeGreaterThan(0);
    for (const name of SHARED_BINARY_WRAPPERS) {
      expect(sources.has(name), `${name} missing from src/utils/wasm/`).toBe(true);
    }
  });

  it.each(SHARED_BINARY_WRAPPERS)('%s registers a cascade handler at module load', (name) => {
    expect(sources.get(name)).toMatch(/registerCascadeHandler\s*\(/);
  });

  it.each(SHARED_BINARY_WRAPPERS)('%s fires the cascade rather than retiring alone', (name) => {
    expect(sources.get(name)).toMatch(/fireCascadeRetire\s*\(/);
  });

  it.each(SHARED_BINARY_WRAPPERS)('%s never reaches a sibling wrapper for retirement', (name) => {
    const source = sources.get(name);
    const siblingBindings = namedImports(source)
      .filter(([, mod]) => /(^|\/)Wasm[A-Za-z]+$/.test(mod) && !mod.endsWith('WasmCascadeRegistry'))
      .flatMap(([bindings]) => bindings);

    for (const binding of siblingBindings) {
      expect(
        /retire/i.test(binding),
        `${name} imports retire-shaped binding "${binding}" from a sibling wrapper — ` +
          `call fireCascadeRetire() instead`
      ).toBe(false);
      const memberCall = new RegExp(`\\b${binding}\\s*\\.\\s*retire`, 'i');
      expect(
        memberCall.test(source),
        `${name} calls ${binding}.retire*() on an imported sibling — ` +
          `call fireCascadeRetire() instead`
      ).toBe(false);
    }
  });

  it('keeps every module-scope retire function private', () => {
    const offenders = [];
    for (const [name, source] of sources) {
      const re = /export\s+(?:async\s+)?(?:function|const|let|var)\s+(retire\w*)/gi;
      let m;
      while ((m = re.exec(source)) !== null) offenders.push(`${name}: ${m[1]}`);
    }
    expect(offenders, 'a bare export on a retire function is the import-cycle smell').toEqual([]);
  });

  it('leaves the registry itself importing no wrapper', () => {
    const registry = sources.get('WasmCascadeRegistry.js');
    const wrapperImports = namedImports(registry)
      .map(([, mod]) => mod)
      .filter((mod) => /(^|\/)Wasm[A-Za-z]+$/.test(mod));
    expect(wrapperImports, 'the registry must stay import-free to break the cycle').toEqual([]);
  });
});
