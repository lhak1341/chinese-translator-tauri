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
