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
 * rather than a baseline. See src/utils/CLAUDE.md section 5 and
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

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The classifier is the implementation these rules point callers at. */
const ALLOWED = new Set(['utils/dictionary/DictionaryIdClassifier.ts']);

const DETECTORS = [
  {
    name: 'raw dictionary-type equality',
    fix: "use classifyDictionaryId(id) from utils/dictionary/DictionaryIdClassifier — raw equality misses fiction variants like 'patterns-f_X'",
    // Only 'patterns' is covered. `=== 'phrases'` is correct and stays: fiction dicts exist
    // as properNouns-f_* and patterns-f_* only, so 'phrases' has no variant to miss. Nine
    // live `=== 'phrases'` comparisons across src/ are legitimate for exactly that reason.
    pattern: /(?:===|!==)\s*(['"])patterns\1|(['"])patterns\2\s*(?:===|!==)/,
    violating: "if (selectedDictionary === 'patterns') return;",
    clean: 'if (classifyDictionaryId(selectedDictionary).isPatterns) return;',
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
    name: 'new URL() with a template literal',
    fix: "pass a hard-coded string literal — Vite's asset URL transform cannot see through a template literal, and the breakage appears only in production builds",
    pattern: /new URL\(\s*`/,
    violating: 'const url = new URL(`../../wasm/${name}_bg.wasm`, import.meta.url);',
    clean: "const url = new URL('../../wasm/translation_wasm_core_bg.wasm', import.meta.url);",
  },
];

/** Line and block comments carry violating snippets as prose examples; strip before scanning. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  .filter((rel) => /\.(js|jsx|ts|tsx)$/.test(rel))
  .filter((rel) => !/\.(test|spec)\.[jt]sx?$/.test(rel))
  .filter((rel) => !rel.endsWith('.d.ts'))
  // Generated wasm-bindgen glue, gitignored build output — not hand-written source.
  .filter((rel) => !rel.startsWith('wasm/') && !rel.startsWith('wasm-core/'))
  .map((rel) => rel.split(path.sep).join('/'));

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
