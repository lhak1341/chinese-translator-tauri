/**
 * Scan gate: a translate call reaches the engine through `EngineAccess`, never straight at
 * `engineRef`.
 *
 * `translateWithSegments` resets engine-wide segment state on entry, so two callers at once
 * corrupt each other (CONTEXT.md "EngineAccess"). `Translator.jsx` is JavaScript, so a type
 * brand cannot police it the way `EngineCall` polices the Reader's hooks; a scan can. The
 * callers below are the whole list: the Reader's three mappers and the Translator's two sites,
 * each inside an `engineAccess.run(...)` callback that receives the engine as a parameter.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TRANSLATE_CALL = /\.(translateWithSegments|translateWithCharactersOnly)\(/;
const BYPASS = /engineRef\.current\??\.(translateWithSegments|translateWithCharactersOnly)\b/;

/** Production files that may call a translate method, and the access call each must contain. */
const ALLOWED = {
  'utils/reader/ReaderEngine.ts': /access\.run\(\s*'reader'/,
  'components/Translator.jsx': /engineAccess\.run\(\s*'translator'/,
};

function productionSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['__tests__', 'test', 'node_modules', '__devtools__'].includes(entry.name)) continue;
      out.push(...productionSources(full));
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Code lines only: a doc comment showing `engine.translateWithSegments(...)` is not a call. */
function codeLines(source) {
  return source.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
}

describe('EngineAccess — every translate call goes through it', () => {
  const files = productionSources(srcDir).map((full) => ({
    rel: path.relative(srcDir, full).split(path.sep).join('/'),
    code: codeLines(readFileSync(full, 'utf8')).join('\n'),
  }));

  it('the scan fires on a bypass and ignores a comment (liveness)', () => {
    expect(BYPASS.test('await engineRef.current.translateWithSegments(text)')).toBe(true);
    expect(BYPASS.test('engineRef.current?.translateWithCharactersOnly(text)')).toBe(true);
    expect(
      BYPASS.test('engineAccess.run(owner, (engine) => engine.translateWithSegments(t))')
    ).toBe(false);
    expect(
      codeLines(' * engine.translateWithSegments(x)\n// engine.translateWithSegments(y)')
    ).toEqual([]);
  });

  it('finds production files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no file reads the engine ref and calls a translate method on it', () => {
    const offenders = files.filter((f) => BYPASS.test(f.code)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('only the allowed callers call a translate method, each inside an access call', () => {
    const callers = files
      .filter((f) => f.rel !== 'utils/TranslationEngine.js' && TRANSLATE_CALL.test(f.code))
      .map((f) => f.rel)
      .sort();
    expect(callers).toEqual(Object.keys(ALLOWED).sort());

    for (const [rel, accessCall] of Object.entries(ALLOWED)) {
      const file = files.find((f) => f.rel === rel);
      expect(file.code, `${rel} must call the engine inside EngineAccess.run`).toMatch(accessCall);
    }
  });
});
