import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../../index.css'), 'utf8');

/** The body of the `@media (prefers-reduced-motion: reduce)` block. */
function reducedMotionBlock(): string {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  expect(start).toBeGreaterThan(-1);
  const end = css.indexOf('\n}\n', start);
  return css.slice(start, end);
}

describe('prefers-reduced-motion', () => {
  // `transition-property` defaults to `all`, so any non-zero `transition-duration` on `*` makes
  // every property of every element transition. A tab switch flips the inherited `visibility`
  // of thousands of elements, and the old tab stayed painted until those transitions ended.
  it('switches transitions off instead of shortening them', () => {
    const block = reducedMotionBlock();
    expect(block).toMatch(/transition:\s*none\s*!important/);
    expect(block).not.toMatch(/transition-duration/);
  });
});
