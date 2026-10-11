/**
 * Static guard over addUnit() call sites in TranslationEngine.js.
 *
 * getSourcePriority() returns 999 for any translationSource string it does not recognise,
 * which silently ranks that token below the character-level fallback — wrong output, no error,
 * no failing test. The engine is intentionally plain JavaScript with no `// @ts-check`, so the
 * `TranslationSource` typedef documenting the valid strings cannot be enforced by the compiler.
 *
 * This test enforces it instead: every string literal passed as addUnit()'s third argument
 * (`translationSource`) must resolve to a real phase priority. Non-literal arguments are
 * skipped — their value is only knowable at runtime.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { getSourcePriority } from '../TranslationSourcePriority.js';

const ENGINE_PATH = path.resolve(__dirname, '../TranslationEngine.js');
const UNRECOGNISED = 999;
const SOURCE_ARG_INDEX = 2; // addUnit(originalText, translated, translationSource, ...)
const MAX_ADD_UNIT_ARGS = 4; // addUnit(originalText, translated, source, tokenIndex)
const ADD_UNIT_CALLERS = [
  '../TranslationEngine.js',
  '../NumberProcessor.js',
  '../text/CharOnlyAssembly.ts',
];

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

function collectAddUnitSources() {
  const text = readFileSync(ENGINE_PATH, 'utf8');
  const sourceFile = ts.createSourceFile(ENGINE_PATH, text, ts.ScriptTarget.Latest, true);
  const found = [];

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'addUnit'
    ) {
      const arg = node.arguments[SOURCE_ARG_INDEX];
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      for (const literal of literalsIn(arg)) {
        found.push({ literal, line });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

describe('addUnit() translationSource literals', () => {
  const sources = collectAddUnitSources();

  test('the scan finds addUnit call sites (guards against the walker silently breaking)', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  test('every literal translationSource resolves to a known phase priority', () => {
    const bad = sources.filter(({ literal }) => getSourcePriority(literal, []) === UNRECOGNISED);
    expect(
      bad.map(({ literal, line }) => `TranslationEngine.js:${line} passes '${literal}'`)
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
