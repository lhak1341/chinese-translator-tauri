/**
 * Repo-wide scan for two classes that no type or test signal catches on its own.
 *
 * 1. Raw dictionary-ID string handling. `id === 'patterns'` is true for the global dict and
 *    false for every fiction variant ('patterns-f_X'), so a dict-type extension stops
 *    matching with no error anywhere — the UI just quietly treats a fiction dict as some
 *    other type. Found duplicated at 10 call sites across 5 files (2026-07-28) before
 *    DictionaryIdClassifier.ts unified them; nothing prevented the next copy.
 *
 * 2. `new URL(\`…\`, import.meta.url)`. A template literal defeats Vite's static asset-URL
 *    transform: the path resolves in dev and 404s in a production build, so the whole test
 *    suite passes while the shipped app cannot load its WASM binary.
 *
 * Both were at zero findings when this gate was written, so it is a zero-tolerance ceiling
 * rather than a baseline. See src/utils/wasm/CLAUDE.md (the `new URL` literal) and
 * src/components/dictionary/CLAUDE.md's Dictionary Type Classification entry.
 *
 * This file is deliberately regex-over-source rather than an ESLint rule: eslint.config.js
 * already sets `no-restricted-syntax` at 'warn' for the console ban over the same file glob,
 * and flat config lets only one config object own a given rule name per file — a second
 * block would silently replace the console ban rather than add to it.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productionSources, stripComments } from '../../test/sourceScan';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The classifier is the implementation these rules point callers at. */
const ALLOWED = new Set(['utils/dictionary/DictionaryIdClassifier.ts']);

const DETECTORS = [
  {
    name: 'raw dictionary-type equality',
    fix: "use isPatternsDict(id) from utils/dictionary/DictionaryIdClassifier — raw equality misses fiction variants like 'patterns-f_X'",
    // Only 'patterns' is covered. `=== 'phrases'` is correct and stays: fiction dicts exist
    // as properNouns-f_* and patterns-f_* only, so 'phrases' has no variant to miss. Nine
    // live `=== 'phrases'` comparisons across src/ are legitimate for exactly that reason.
    pattern: /(?:===|!==)\s*(['"])patterns\1|(['"])patterns\2\s*(?:===|!==)/,
    violating: "if (selectedDictionary === 'patterns') return;",
    clean: 'if (isPatternsDict(selectedDictionary)) return;',
  },
  {
    name: 'hand-rolled dictionary-kind prefix check',
    fix: 'use isPatternsDict(id) / isProperNounsDict(id) / tierOf(id) from utils/dictionary/DictionaryIdClassifier',
    // `startsWith('patterns')` and `startsWith('patterns-')` answer different questions (root
    // included or not) and read the same; 20 such checks in 4 spellings were migrated 2026-09-26.
    pattern: /\.startsWith\(\s*(['"])(?:patterns|properNouns)(?!-f_)[^'"]*\1/,
    violating: "if (id.startsWith('properNouns')) return;",
    clean: 'if (isProperNounsDict(id)) return;',
  },
  {
    name: 'hand-rolled fiction-prefix check',
    fix: 'use isFictionProperNounsId(id) / isFictionPatternsId(id) from utils/dictionary/DictionaryIdClassifier',
    pattern: /\.startsWith\(\s*(['"])(?:properNouns-f_|patterns-f_)\1/,
    violating: "const fiction = id.startsWith('properNouns-f_');",
    clean: 'const fiction = isFictionProperNounsId(id);',
  },
  {
    name: 'hand-rolled dictionary-ID concatenation',
    fix: 'use toPatternsId(id) / toProperNounsId(id) / toProperNounsDictionaryId(rawName) from utils/dictionary/DictionaryIdClassifier',
    pattern: /(['"])(?:patterns-|properNouns-)\1\s*\+|`(?:patterns-|properNouns-)\$\{/,
    violating: "const paired = 'patterns-' + id.slice('properNouns-'.length);",
    clean: 'const paired = toPatternsId(id);',
  },
  {
    name: 'hand-rolled dictionary-name strip',
    fix: 'use bareNameOf(id) from utils/dictionary/DictionaryIdClassifier, or the label for the screen from utils/dictionary/DictionaryLabels',
    // The strip is the inverse of toProperNounsDictionaryId. Seven copies of it, on four
    // screens, disagreed on what the root dictionary and a patterns dictionary are called.
    pattern: /\.replace\(\s*(['"])(?:properNouns|patterns)-\1/,
    violating: "const name = id.replace('properNouns-', '');",
    clean: 'const name = bareNameOf(id);',
  },
  {
    name: 'new URL() with a template literal',
    fix: "pass a hard-coded string literal — Vite's asset URL transform cannot see through a template literal, and the breakage appears only in production builds",
    pattern: /new URL\(\s*`/,
    violating: 'const url = new URL(`../../wasm/${name}_bg.wasm`, import.meta.url);',
    clean: "const url = new URL('../../wasm/translation_wasm_core_bg.wasm', import.meta.url);",
  },
  {
    name: 'colour literal',
    fix: 'use a var(--lk-…) role, and textOnFill(fill) from utils/ui/textOnFill for text on a fill — a literal stays one colour in every flavor and mode, and stylelint never reads TS (adoption ticket 19)',
    // Hex (3, 4, 6 or 8 digits, not an `&#…` entity), quoted white/black, and numeric
    // rgb()/hsl() calls. A `var()` inside the call, as in `rgb(var(--x))`, is not a literal.
    pattern:
      /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|(['"`])(?:white|black)\1|\b(?:rgba?|hsla?)\(\s*[\d.]/,
    violating: "border: active ? 'none' : '1px solid #d1d5db',",
    clean: "border: active ? 'none' : '1px solid var(--lk-border)',",
  },
];

// Scans everything but tests, declarations and generated wasm-bindgen glue (gitignored build
// output): skipping only node_modules keeps helpers under __tests__, test/ and __devtools__ in scope.
const files = productionSources(srcDir, {
  skipDirs: ['node_modules'],
  skipPaths: ['wasm/', 'wasm-core/'],
}).map((full) => path.relative(srcDir, full).split(path.sep).join('/'));

describe('source convention scan', () => {
  it('walks a populated source tree (liveness)', () => {
    // Guards the whole file: a walk that silently finds nothing would report every detector
    // below as passing. The floor is well under the real count and only catches a broken walk.
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('utils/dictionary/DictionaryIdClassifier.ts');
  });

  it.each(DETECTORS)('$name detector actually fires on a violation (liveness)', (detector) => {
    // Guards against regex rot: a detector that can no longer match anything would report a
    // clean tree forever. Pinned against a synthetic violation and its documented fix.
    expect(detector.pattern.test(detector.violating)).toBe(true);
    expect(detector.pattern.test(detector.clean)).toBe(false);
  });

  it.each(DETECTORS)('no source file contains $name', (detector) => {
    const offenders = [];
    for (const rel of files) {
      if (ALLOWED.has(rel)) continue;
      const source = stripComments(readFileSync(path.join(srcDir, rel), 'utf8'));
      source.split('\n').forEach((line, i) => {
        if (detector.pattern.test(line)) offenders.push(`src/${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `${detector.name} — ${detector.fix}`).toEqual([]);
  });
});

/**
 * A test file that imports no production module can only assert on data and helpers it
 * defines itself. Seven such files (about 2,000 lines) passed for months while asserting on
 * inline copies of the logic they were named after, and ADR-004 cited one as the check that
 * "validates order". Deleted 2026-10-04.
 *
 * Files that read src/ as text instead of importing it belong in this list, each with the
 * reason.
 */
const TESTS_WITHOUT_PRODUCTION_IMPORT = new Set([
  // Scans source files as text; the production code is its input, not its subject.
  'utils/__tests__/SourceConventionScan.test.js',
  // Scans source files as text for a translate call outside `EngineAccess`.
  '__tests__/EngineAccess.guard.test.js',
  // Reads `index.css` and `shared.module.css` as text: the stylesheets are its input, there is no module to import.
  'styles/__tests__/ReducedMotion.test.ts',
  // Reads `src-tauri/tauri.conf.json` as text against @lhak/style's hash list: the config is its input.
  '__tests__/CspStyleHashes.test.ts',
  // Compiles every CSS module through Vite: the stylesheets are its input, there is no module to import.
  'styles/__tests__/AnimationNames.test.ts',
]);

const IMPORT_RE = /(?:import[^'"]*from\s*|import\(\s*)['"]([^'"]+)['"]/g;

/** True when the specifier points at production code rather than test support or data. */
function isProductionImport(specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return false;
  if (/\.json$/.test(specifier)) return false;
  return !/__tests__\/|__mocks__|test-fixtures|test-utils|testUtils/.test(specifier);
}

function importsProductionCode(source) {
  return [...source.matchAll(IMPORT_RE)].some((m) => isProductionImport(m[1]));
}

const testFiles = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  .filter((rel) => /\.test\.[jt]sx?$/.test(rel))
  .map((rel) => rel.split(path.sep).join('/'));

describe('test files import production code', () => {
  it('walks a populated test tree (liveness)', () => {
    expect(testFiles.length).toBeGreaterThan(100);
  });

  it('the import check fires on a self-contained test (liveness)', () => {
    const selfContained = "import { it, expect } from 'vitest';\nit('x', () => expect(1).toBe(1));";
    const real = "import { it } from 'vitest';\nimport { thing } from '../thing.js';";
    const helperOnly = "import { makeThing } from './__tests__/helpers.js';";
    expect(importsProductionCode(selfContained)).toBe(false);
    expect(importsProductionCode(real)).toBe(true);
    expect(importsProductionCode(helperOnly)).toBe(false);
  });

  it('every test file imports at least one production module', () => {
    const offenders = testFiles.filter(
      (rel) =>
        !TESTS_WITHOUT_PRODUCTION_IMPORT.has(rel) &&
        !importsProductionCode(readFileSync(path.join(srcDir, rel), 'utf8'))
    );
    expect(
      offenders,
      'a test that imports no production module asserts on its own copy of the logic — import the module under test'
    ).toEqual([]);
  });
});
