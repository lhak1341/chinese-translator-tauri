// @vitest-environment node
// Every animation a stylesheet names has keyframes to run. Each CSS module is compiled the way
// `vite build` compiles it: CSS Modules renames every name in `animation`, so `animation: spin`
// in a module becomes `_spin_<hash>`, which no keyframes define, and the animation never runs.
// A module reaches a global keyframes (index.css, streaming-animations.css, shared.module.css's
// `:global(@keyframes …)`) only through `global(name)`.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { preprocessCSS, resolveConfig, type ResolvedConfig } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

const stylesDir = path.resolve(__dirname, '..');
const srcDir = path.resolve(stylesDir, '..');
const modules = readdirSync(stylesDir).filter((f) => f.endsWith('.module.css'));
const PLAIN = [path.join(srcDir, 'index.css'), path.join(stylesDir, 'streaming-animations.css')];

const keyframes = (css: string) => [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]!);
const animationValues = (css: string) =>
  [...css.matchAll(/animation(?:-name)?\s*:([^;}]*)/g)].map((m) => m[1]!);

/** An `@media (prefers-reduced-motion …) { … }` block, nested up to keyframes stops. */
const REDUCED_MOTION_BLOCK =
  /@media\s*\(prefers-reduced-motion[^{]*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;

type Compiled = { file: string; code: string; renamed: Record<string, string> };

let compiled: Compiled[];
let globalKeyframes: Set<string>;

beforeAll(async () => {
  const config: ResolvedConfig = await resolveConfig({ root: path.resolve(srcDir, '..') }, 'build');
  compiled = await Promise.all(
    modules.map(async (file) => {
      const full = path.join(stylesDir, file);
      const { code, modules: renamed = {} } = await preprocessCSS(
        readFileSync(full, 'utf8'),
        full,
        config
      );
      return { file, code, renamed };
    })
  );
  // A compiled module's keyframes keep their plain name only when declared global.
  const fromModules = compiled.flatMap(({ code, renamed }) =>
    keyframes(code).filter((k) => !Object.values(renamed).includes(k))
  );
  globalKeyframes = new Set([
    ...PLAIN.flatMap((f) => keyframes(readFileSync(f, 'utf8'))),
    ...fromModules,
  ]);
}, 60_000);

describe('animation names', () => {
  it('finds the modules that animate', () => {
    expect(modules).toContain('MoveDialog.module.css');
    expect(compiled.some(({ code }) => animationValues(code).length > 0)).toBe(true);
  });

  it('every renamed animation name in a module has keyframes in that module', () => {
    const missing = compiled.flatMap(({ file, code, renamed }) => {
      const defined = new Set(keyframes(code));
      const used = animationValues(code).join(' ');
      return Object.values(renamed)
        .filter(
          (name) => new RegExp(`(^|[\\s,])${name}([\\s,]|$)`).test(used) && !defined.has(name)
        )
        .map((name) => `${file}: ${name}`);
    });
    expect(missing).toEqual([]);
  });

  // A second copy drifts from the first, and a module's local copy hides the global one it shadows
  // (TranslatorControls kept its own fadeIn beside index.css's; adoption ticket 17). A
  // reduced-motion block redefines a keyframes on purpose, so it does not count.
  it('defines each keyframes name once', () => {
    const files = [...PLAIN, ...modules.map((f) => path.join(stylesDir, f))];
    const definedIn = new Map<string, string[]>();
    for (const file of files) {
      // Comments go first: several name the global keyframes they rely on.
      const css = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(REDUCED_MOTION_BLOCK, '');
      for (const name of keyframes(css)) {
        definedIn.set(name, [...(definedIn.get(name) ?? []), path.basename(file)]);
      }
    }
    const duplicates = [...definedIn].filter(([, where]) => where.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('every global(name) a module uses has global keyframes', () => {
    const missing = modules.flatMap((file) =>
      animationValues(readFileSync(path.join(stylesDir, file), 'utf8'))
        .flatMap((value) => [...value.matchAll(/global\(([\w-]+)\)/g)].map((m) => m[1]!))
        .filter((name) => !globalKeyframes.has(name))
        .map((name) => `${file}: ${name}`)
    );
    expect(missing).toEqual([]);
  });
});
