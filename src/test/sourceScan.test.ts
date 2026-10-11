import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { productionSources, stripComments } from './sourceScan';

const SRC_DIR = path.resolve(__dirname, '..');

describe('productionSources', () => {
  it('walks the real source tree (liveness)', () => {
    const files = productionSources(SRC_DIR);
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('tauriAPI.ts'))).toBe(true);
  });

  it('skips tests, declarations, skipped directories and skipPaths', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'source-scan-'));
    try {
      for (const rel of [
        'keep.ts',
        'nested/keep.jsx',
        'a.test.ts',
        'a.spec.js',
        'types.d.ts',
        '__tests__/helper.ts',
        '__devtools__/dev.js',
        'wasm/glue.js',
        'notes.md',
      ]) {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), '');
      }
      const rels = (opts?: Parameters<typeof productionSources>[1]) =>
        productionSources(root, opts)
          .map((f) => path.relative(root, f).split(path.sep).join('/'))
          .sort();

      expect(rels({ skipPaths: ['wasm/'] })).toEqual(['keep.ts', 'nested/keep.jsx']);
      expect(rels()).toEqual(['keep.ts', 'nested/keep.jsx', 'wasm/glue.js']);
      expect(rels({ skipDirs: [], skipPaths: ['wasm/'] })).toEqual([
        '__devtools__/dev.js',
        '__tests__/helper.ts',
        'keep.ts',
        'nested/keep.jsx',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('stripComments', () => {
  it('removes line and block comments', () => {
    expect(stripComments('a(); // x\n/* y\nz */ b();')).toBe('a(); \n b();');
  });

  it('keeps the // of a URL', () => {
    expect(stripComments("const u = 'https://example.com'; // gone")).toBe(
      "const u = 'https://example.com'; "
    );
  });
});
