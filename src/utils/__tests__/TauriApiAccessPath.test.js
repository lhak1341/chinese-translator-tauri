/**
 * Scan gate: production code reaches the Tauri IPC adapter through `window.electronAPI`, never
 * by importing `src/tauriAPI.ts`.
 *
 * The adapter was reachable two ways — the global (config, dictionary and record IO) and a
 * default import (reader library, lines, outline) — so a fake had to match whichever path the
 * code under test used, and `fakeConfigDisk`/`fakeDictionaryDisk` only worked for one of them.
 * One path means one fake style: a test assigns `window.electronAPI`. `main.jsx`'s side-effect
 * `import './tauriAPI'` is what installs the global; type-only imports are fine.
 *
 * `TranslationEngine.js` hands `window.electronAPI` to `DictionaryManager` as an option — that
 * is injection of the same object, not a second access path.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionSources, stripComments } from '../../test/sourceScan';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const IMPORT_FROM_ADAPTER = /import\s+([^'";]+?)\s+from\s+['"][^'"]*\/tauriAPI(?:\.js)?['"]/g;
// `typeof import('…')` is a type query (ElectronTypes.d.ts derives `ElectronAPI` that way).
const DYNAMIC_IMPORT_OF_ADAPTER = /(?<!typeof\s)import\(\s*['"][^'"]*\/tauriAPI(?:\.js)?['"]\s*\)/g;

/** True for an import clause that binds a value: a default, a namespace, or a non-`type` name. */
function bindsValue(clause) {
  const trimmed = clause.trim();
  if (trimmed.startsWith('type ')) return false;
  const named = /^\{([^}]*)\}$/.exec(trimmed);
  if (!named) return true;
  return named[1]
    .split(',')
    .map((spec) => spec.trim())
    .filter(Boolean)
    .some((spec) => !spec.startsWith('type '));
}

/** The offending import statements of one source text. */
export function adapterImports(source) {
  const hits = [];
  for (const m of source.matchAll(IMPORT_FROM_ADAPTER)) {
    if (bindsValue(m[1])) hits.push(m[0]);
  }
  for (const m of source.matchAll(DYNAMIC_IMPORT_OF_ADAPTER)) hits.push(m[0]);
  return hits;
}

describe('Tauri IPC adapter access path', () => {
  it('the scan recognises the shapes that regressed (so an empty result means something)', () => {
    expect(adapterImports("import tauriAPI from '../../tauriAPI';")).toHaveLength(1);
    expect(adapterImports("import tauriAPI from '../tauriAPI.js';")).toHaveLength(1);
    expect(adapterImports("import tauriAPI, { type A } from '../tauriAPI';")).toHaveLength(1);
    expect(adapterImports("import { buildLookupIndex } from '../tauriAPI';")).toHaveLength(1);
    expect(adapterImports("const m = await import('../tauriAPI');")).toHaveLength(1);
    expect(adapterImports("import type { A, B } from '../../tauriAPI';")).toHaveLength(0);
    expect(adapterImports("import { type A, type B } from '../../tauriAPI';")).toHaveLength(0);
    expect(adapterImports("import './tauriAPI';")).toHaveLength(0);
    expect(adapterImports("type A = typeof import('../tauriAPI').default;")).toHaveLength(0);
    // A commented-out import is not an import.
    expect(
      adapterImports(
        stripComments(
          "// import tauriAPI from '../tauriAPI';\n/* import tauriAPI from '../tauriAPI'; */"
        )
      )
    ).toHaveLength(0);
  });

  it('no production file imports the adapter for a value', () => {
    const files = productionSources(srcDir);
    expect(files.length).toBeGreaterThan(100);

    const offenders = files
      .map((file) => [
        path.relative(srcDir, file),
        adapterImports(stripComments(readFileSync(file, 'utf8'))),
      ])
      .filter(([, hits]) => hits.length > 0)
      // The adapter's own module and its declared type derive from each other.
      .filter(([rel]) => rel !== 'tauriAPI.ts');

    expect(offenders).toEqual([]);
  });
});
