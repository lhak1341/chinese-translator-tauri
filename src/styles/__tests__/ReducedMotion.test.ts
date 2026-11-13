import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Reduce motion is "movement off, fades on" (@lhak/style motion rules, wayfinder ticket 012):
// slides, scales and spins go; fades and colour changes keep their timings.
const REDUCE = '@media (prefers-reduced-motion: reduce)';

const read = (file: string) => readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');
const indexCss = read('index.css');
const CSS = { 'index.css': indexCss, 'shared.module.css': read('styles/shared.module.css') };

/** Each top-level `@media (prefers-reduced-motion: reduce)` block's body, comments removed. */
function reduceBlocks(css: string): string[] {
  const blocks: string[] = [];
  for (let start = css.indexOf(REDUCE); start !== -1; start = css.indexOf(REDUCE, start + 1)) {
    const open = css.indexOf('{', start);
    let depth = 1;
    let i = open + 1;
    for (; depth > 0; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}') depth--;
    }
    blocks.push(css.slice(open + 1, i - 1).replace(/\/\*[\s\S]*?\*\//g, ''));
  }
  return blocks;
}

/** The body of `@keyframes <name>` (or `:global(@keyframes <name>)`) inside a reduce block. */
function reducedKeyframes(css: string, name: string): string | undefined {
  const pattern = new RegExp(`@keyframes ${name}\\)?\\s*\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`);
  return reduceBlocks(css)
    .map((block) => pattern.exec(block)?.[1])
    .find((body) => body !== undefined);
}

/** The declarations of the `*, *::before, *::after` rule inside the index.css reduce block. */
function universalRule(): string {
  const rule = reduceBlocks(indexCss)
    .map((block) => /\*,\s*\*::before,\s*\*::after\s*\{([^}]*)\}/.exec(block)?.[1])
    .find((body) => body !== undefined);
  expect(rule).toBeDefined();
  return rule!;
}

describe('prefers-reduced-motion', () => {
  // `transition-property` defaults to `all`, so any non-zero `transition-duration` on `*` makes
  // every property of every element transition. A tab switch flips the inherited `visibility`
  // of thousands of elements, and the old tab stayed painted until those transitions ended.
  it('sets no duration on every element', () => {
    expect(universalRule()).not.toMatch(/transition(-duration)?\s*:/);
    expect(universalRule()).not.toMatch(/animation(-duration)?\s*:/);
  });

  it('lets only fades and colour changes transition', () => {
    const property = /transition-property:\s*([^;!]+)/.exec(universalRule())?.[1];
    expect(property).toBeDefined();
    const properties = property!.split(',').map((p) => p.trim());
    expect(properties).toContain('opacity');
    expect(properties).toContain('color');
    expect(properties).toContain('background-color');
    for (const movement of [
      'all',
      'transform',
      'translate',
      'scale',
      'rotate',
      'visibility',
      'width',
      'height',
    ]) {
      expect(properties).not.toContain(movement);
    }
  });

  it.each([
    ['index.css', 'slideUp'],
    ['index.css', 'spin'],
    ['shared.module.css', 'slideIn'],
  ] as const)('%s redefines %s without movement', (file, name) => {
    const body = reducedKeyframes(CSS[file], name);
    expect(body).toBeDefined();
    expect(body).not.toMatch(/transform|translate|scale|rotate/);
  });

  it.each([
    ['index.css', 'slideUp'],
    ['shared.module.css', 'slideIn'],
  ] as const)('%s: %s still fades', (file, name) => {
    expect(reducedKeyframes(CSS[file], name)).toMatch(/opacity:\s*0/);
  });
});
