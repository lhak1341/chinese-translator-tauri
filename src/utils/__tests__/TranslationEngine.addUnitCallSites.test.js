/**
 * Static guard over the call sites that record a semantic unit: addUnit() in TranslationEngine.js,
 * and placeSpan() / placeGroupedSpan() (TokenClaim.ts) in TranslationEngine.js and NumberProcessor.js.
 *
 * getSourcePriority() returns 999 for any translationSource string it does not recognise,
 * which silently ranks that token below the character-level fallback — wrong output, no error,
 * no failing test. The engine is intentionally plain JavaScript with no `// @ts-check`, so the
 * `TranslationSource` typedef documenting the valid strings cannot be enforced by the compiler.
 *
 * This test enforces it instead: every string literal passed as the `translationSource` argument
 * must resolve to a real phase priority. Non-literal arguments are
 * skipped — their value is only knowable at runtime.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { getSourcePriority } from '../TranslationSourcePriority.js';

const UNRECOGNISED = 999;
// callee name -> index of its `translationSource` argument
const SOURCE_ARG_INDEX = {
  addUnit: 2, // addUnit(originalText, translated, translationSource, ...)
  placeSpan: 3, // placeSpan(tokens, startIndex, endIndex, source, ...)
  placeGroupedSpan: 3, // placeGroupedSpan(tokens, startIndex, tokenSpan, source, ...)
};
const SOURCE_FILES = ['../TranslationEngine.js', '../NumberProcessor.js'];
const MAX_ADD_UNIT_ARGS = 4; // addUnit(originalText, translated, source, tokenIndex)
const ADD_UNIT_CALLERS = [
  '../TranslationEngine.js',
  '../TokenClaim.ts',
  '../text/CharOnlyAssembly.ts',
];

/** The name a call invokes: `f(...)` or `a.f(...)`. */
function calleeName(node) {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return undefined;
}

/** Collects string literals from `a`, `a || 'b'`, `a ?? 'b'`, and nested combinations. */
function literalsIn(node) {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return literalsIn(node.expression);
  if (ts.isBinaryExpression(node)) return [...literalsIn(node.left), ...literalsIn(node.right)];
  if (ts.isConditionalExpression(node)) {
    return [...literalsIn(node.whenTrue), ...literalsIn(node.whenFalse)];
  }
  return [];
}

function collectSources() {
  const found = [];
  for (const relative of SOURCE_FILES) {
    const file = path.resolve(__dirname, relative);
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node) => {
      const name = ts.isCallExpression(node) ? calleeName(node) : undefined;
      if (name && name in SOURCE_ARG_INDEX) {
        const arg = node.arguments[SOURCE_ARG_INDEX[name]];
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        for (const literal of literalsIn(arg)) {
          found.push({ literal, line, file: path.basename(file), name });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return found;
}

describe('unit-recording translationSource literals', () => {
  const sources = collectSources();

  test('the scan finds every recording callee (guards against the walker silently breaking)', () => {
    expect(new Set(sources.map(({ name }) => name))).toEqual(
      new Set(['addUnit', 'placeSpan', 'placeGroupedSpan'])
    );
  });

  test('every literal translationSource resolves to a known phase priority', () => {
    const bad = sources.filter(({ literal }) => getSourcePriority(literal, []) === UNRECOGNISED);
    expect(
      bad.map(({ literal, line, file, name }) => `${file}:${line} ${name} passes '${literal}'`)
    ).toEqual([]);
  });
});

describe('addUnit() argument count', () => {
  // JS ignores extra arguments silently, so a re-added `phase`/`dictionary` pair would be dead
  // weight with no failing test (ADR-094 removed both).
  const callsWithTooManyArgs = ADD_UNIT_CALLERS.flatMap((relative) => {
    const file = path.resolve(__dirname, relative);
    const sourceFile = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const found = [];
    let calls = 0;
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'addUnit'
      ) {
        calls++;
        if (node.arguments.length > MAX_ADD_UNIT_ARGS) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
          found.push(`${path.basename(file)}:${line} passes ${node.arguments.length} arguments`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(calls).toBeGreaterThan(0); // the walker still finds the call sites
    return found;
  });

  test('no production call site passes more than four arguments', () => {
    expect(callsWithTooManyArgs).toEqual([]);
  });
});
